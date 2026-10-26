import { Ionicons } from '@expo/vector-icons';
import { esSimbologia, SIMBOLOGIAS_POR_DEFECTO } from '@patrimonio/shared';
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import * as Crypto from 'expo-crypto';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Boton } from '../../../components/ui';
import {
  avanceDeJornada,
  cerrarJornada,
  enviarEscaneo,
  obtenerJornada,
  subirRelevamientos,
  suscribirseAJornada,
  type FilaAvance,
  type Jornada,
} from '../../../lib/api';
import { fechaHora } from '../../../lib/formato';
import { useSesion } from '../../../lib/sesion';
import { radio, useEstilos, useTema, type Paleta } from '../../../lib/tema';

type Pestana = 'pendientes' | 'encontrados' | 'otros';
type Aviso = { tipo: 'ok' | 'alerta' | 'error'; texto: string };

const IGNORAR_REPETIDO_MS = 2000;

/** Una jornada compartida: lo esperado del área o la ubicación, el avance de todo el equipo y el escaneo. Se actualiza en vivo. */
export default function PantallaJornada() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { perfil } = useSesion();
  const e = useEstilos(fabrica);
  const { c } = useTema();
  const [permiso, pedirPermiso] = useCameraPermissions();
  const [jornada, setJornada] = useState<Jornada | null>(null);
  const [filas, setFilas] = useState<FilaAvance[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pestana, setPestana] = useState<Pestana>('pendientes');
  const [camara, setCamara] = useState(false);
  const [ubicacionActual, setUbicacionActual] = useState<string | null>(null);
  const [aviso, setAviso] = useState<Aviso | null>(null);
  const [actualizando, setActualizando] = useState(false);
  const ocupado = useRef(false);
  const ultimo = useRef({ clave: '', hasta: 0 });
  const filasRef = useRef<FilaAvance[] | null>(null);
  filasRef.current = filas;

  const cargar = useCallback(async () => {
    try {
      const [j, a] = await Promise.all([obtenerJornada(id), avanceDeJornada(id)]);
      if (!j) throw new Error('La jornada no existe.');
      setJornada(j);
      setFilas(a);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cargar la jornada.');
    }
  }, [id]);

  // Carga inicial y actualización en vivo: cada relevamiento o cambio de jornada de cualquier persona vuelve a pedir el avance.
  useEffect(() => {
    void cargar();
    return suscribirseAJornada(() => void cargar());
  }, [cargar]);

  const yo = perfil?.nombre ?? perfil?.cuenta ?? '';
  const abierta = jornada?.estado === 'abierta';
  const esperadas = useMemo(() => (filas ?? []).filter((f) => f.tipo === 'esperado'), [filas]);
  const pendientes = useMemo(() => esperadas.filter((f) => !f.encontrado), [esperadas]);
  const encontradas = useMemo(
    () => esperadas.filter((f) => f.encontrado).sort((a, b) => (b.relevadoEn ?? '').localeCompare(a.relevadoEn ?? '')),
    [esperadas],
  );
  const otros = useMemo(() => (filas ?? []).filter((f) => f.tipo === 'extra').sort((a, b) => (b.relevadoEn ?? '').localeCompare(a.relevadoEn ?? '')), [filas]);
  const ubicaciones = useMemo(() => [...new Set(esperadas.map((f) => f.ubicacionFisica).filter((u): u is string => !!u))].sort(), [esperadas]);
  const porcentaje = esperadas.length > 0 ? Math.round((encontradas.length / esperadas.length) * 100) : 0;
  const puedeCerrar = abierta && (jornada?.propia || perfil?.rol === 'administrador');

  // En una jornada de ubicación, se está siempre en esa ubicación.
  useEffect(() => {
    if (jornada?.tipo === 'ubicacion') setUbicacionActual(jornada.alcance);
  }, [jornada]);

  /** Registra un relevamiento de esta jornada. */
  const registrar = useCallback(
    async (datos: { resultado: 'encontrado' | 'no_encontrado'; numeroInventario?: string; simbologia?: string; valorLeido?: string }) => {
      const r = await subirRelevamientos([
        {
          idCliente: Crypto.randomUUID(),
          resultado: datos.resultado,
          relevadoEnDispositivo: new Date().toISOString(),
          jornadaId: id,
          ...(datos.numeroInventario ? { numeroInventario: datos.numeroInventario } : {}),
          ...(datos.simbologia && esSimbologia(datos.simbologia) ? { simbologia: datos.simbologia } : {}),
          ...(datos.valorLeido ? { valorLeido: datos.valorLeido } : {}),
          ...(ubicacionActual ? { ubicacionObservada: ubicacionActual } : {}),
        },
      ]);
      if (r.rechazados.length) throw new Error(r.rechazados[0]?.motivo ?? 'No se pudo registrar.');
    },
    [id, ubicacionActual],
  );

  const alLeer = useCallback(
    async ({ type, data }: BarcodeScanningResult) => {
      const clave = `${type}:${data}`;
      if (ocupado.current || !abierta || !esSimbologia(type)) return;
      if (clave === ultimo.current.clave && Date.now() < ultimo.current.hasta) return;
      ocupado.current = true;
      ultimo.current = { clave, hasta: Date.now() + IGNORAR_REPETIDO_MS };
      try {
        const r = await enviarEscaneo(type, data);
        if (!r.encontrado || !r.bien) {
          await registrar({ resultado: 'no_encontrado', simbologia: type, valorLeido: data });
          setAviso({ tipo: 'alerta', texto: `El código ${data} no está en el catálogo. Quedó anotado.` });
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        } else {
          const bien = r.bien;
          const fila = filasRef.current?.find((f) => f.tipo === 'esperado' && f.bienId === bien.id);
          const titulo = bien.descripcion ?? bien.numeroInventario;
          if (fila?.encontrado && fila.relevador === yo) {
            setAviso({ tipo: 'alerta', texto: `Ya lo relevaste: ${titulo}` });
            void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
          } else {
            await registrar({ resultado: 'encontrado', numeroInventario: bien.numeroInventario, simbologia: type, valorLeido: data });
            if (!fila) {
              setAviso({ tipo: 'alerta', texto: `${titulo} es de otra área: ${bien.areaResponsable ?? 'sin área'}. Quedó anotado.` });
            } else if (fila.encontrado) {
              setAviso({ tipo: 'alerta', texto: `${titulo}: ya lo había relevado ${fila.relevador}. Se anotó también este.` });
            } else if (ubicacionActual && bien.ubicacionFisica && ubicacionActual !== bien.ubicacionFisica) {
              setAviso({ tipo: 'alerta', texto: `Encontrado: ${titulo}. Ojo: según el catálogo figura en ${bien.ubicacionFisica}.` });
            } else {
              setAviso({ tipo: 'ok', texto: `Encontrado: ${titulo}` });
            }
            void Haptics.notificationAsync(fila && !fila.encontrado ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Warning);
          }
        }
        await cargar();
      } catch (err) {
        setAviso({ tipo: 'error', texto: err instanceof Error ? err.message : 'No se pudo registrar la lectura.' });
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      } finally {
        ocupado.current = false;
      }
    },
    [abierta, cargar, registrar, ubicacionActual, yo],
  );

  /** Para cuando el código está dañado: se marca a mano un bien pendiente. */
  const marcarAMano = (fila: FilaAvance) => {
    if (!abierta || !fila.numeroInventario) return;
    Alert.alert(fila.descripcion ?? fila.numeroInventario, `${fila.numeroInventario}\n¿Qué querés hacer?`, [
      { text: 'Ver ficha', onPress: () => router.push({ pathname: '/bien/[numero]', params: { numero: fila.numeroInventario! } }) },
      {
        text: 'Marcar como encontrado',
        onPress: async () => {
          try {
            await registrar({ resultado: 'encontrado', numeroInventario: fila.numeroInventario! });
            setAviso({ tipo: 'ok', texto: `Marcado a mano: ${fila.descripcion ?? fila.numeroInventario}` });
            await cargar();
          } catch (err) {
            setAviso({ tipo: 'error', texto: err instanceof Error ? err.message : 'No se pudo registrar.' });
          }
        },
      },
      { text: 'Cancelar', style: 'cancel' },
    ]);
  };

  const confirmarCierre = () =>
    Alert.alert('¿Cerrar la jornada?', `Quedan ${pendientes.length} bienes sin relevar. Una jornada cerrada ya no admite lecturas.`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Cerrar',
        style: 'destructive',
        onPress: async () => {
          try {
            await cerrarJornada(id);
            setCamara(false);
            await cargar();
          } catch (err) {
            setAviso({ tipo: 'error', texto: err instanceof Error ? err.message : 'No se pudo cerrar.' });
          }
        },
      },
    ]);

  const lista = pestana === 'pendientes' ? pendientes : pestana === 'encontrados' ? encontradas : otros;

  const cabecera = (
    <View style={{ gap: 12 }}>
      <View style={e.tarjetaColumna}>
        <Text style={e.rotulo}>
          {jornada?.tipo === 'area' ? 'Área' : 'Ubicación'} · {abierta ? 'Abierta' : 'Cerrada'}
        </Text>
        <Text style={e.titulo}>{jornada?.alcance}</Text>
        <View style={e.barra}>
          <View style={[e.barraRelleno, { width: `${porcentaje}%` }]} />
        </View>
        <Text style={e.ayuda}>
          {encontradas.length} de {esperadas.length} encontrados ({porcentaje} %) · {pendientes.length} pendientes
          {otros.length ? ` · ${otros.length} fuera de lo esperado` : ''}
        </Text>
        {jornada && (
          <Text style={e.ayuda}>
            La abrió {jornada.propia ? 'vos' : jornada.creadaPor} · {fechaHora(jornada.creadoEn)}
          </Text>
        )}
      </View>

      {abierta && (
        <View style={{ gap: 10 }}>
          {jornada?.tipo === 'area' && ubicaciones.length > 1 && (
            <View style={{ gap: 6 }}>
              <Text style={e.ayuda}>¿En qué ubicación estás ahora? (para avisar si algo no está en su lugar)</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                <Chip texto="Sin indicar" activo={ubicacionActual === null} alTocar={() => setUbicacionActual(null)} />
                {ubicaciones.map((u) => (
                  <Chip key={u} texto={u} activo={ubicacionActual === u} alTocar={() => setUbicacionActual(ubicacionActual === u ? null : u)} />
                ))}
              </ScrollView>
            </View>
          )}
          {!camara ? (
            <Boton texto="Escanear" onPress={() => (permiso?.granted ? setCamara(true) : void pedirPermiso().then((p) => p.granted && setCamara(true)))} />
          ) : (
            <View style={e.camara}>
              <CameraView
                style={StyleSheet.absoluteFill}
                facing="back"
                barcodeScannerSettings={{ barcodeTypes: [...SIMBOLOGIAS_POR_DEFECTO] }}
                onBarcodeScanned={alLeer}
              />
              <Pressable accessibilityRole="button" accessibilityLabel="Apagar la cámara" onPress={() => setCamara(false)} style={e.cerrarCamara} hitSlop={10}>
                <Ionicons name="close" size={24} color="#FFFFFF" />
              </Pressable>
            </View>
          )}
          {permiso && !permiso.granted && !permiso.canAskAgain && <Text style={e.error}>Sin permiso de cámara. Activalo en los ajustes del teléfono.</Text>}
        </View>
      )}

      {aviso && (
        <Pressable onPress={() => setAviso(null)} style={[e.aviso, aviso.tipo === 'ok' && { borderColor: c.ok }, aviso.tipo === 'error' && { borderColor: c.error }]}>
          <Text style={[e.avisoTexto, aviso.tipo === 'error' && { color: c.error }]}>{aviso.texto}</Text>
        </Pressable>
      )}

      <View style={e.pestanas}>
        <Tab titulo={`Pendientes ${pendientes.length}`} activa={pestana === 'pendientes'} alTocar={() => setPestana('pendientes')} />
        <Tab titulo={`Encontrados ${encontradas.length}`} activa={pestana === 'encontrados'} alTocar={() => setPestana('encontrados')} />
        <Tab titulo={`Otros ${otros.length}`} activa={pestana === 'otros'} alTocar={() => setPestana('otros')} />
      </View>
      {pestana === 'otros' && <Text style={e.ayuda}>Bienes de otra área y códigos que no están en el catálogo, leídos durante esta jornada.</Text>}
      {error && (
        <View style={{ gap: 10 }}>
          <Text style={e.error}>{error}</Text>
          <Boton texto="Reintentar" variante="secundario" onPress={cargar} />
        </View>
      )}
      {!error && !filas && <ActivityIndicator color={c.accion} />}
    </View>
  );

  return (
    <FlatList
      data={lista}
      keyExtractor={(f, i) => `${f.tipo}-${f.relevamientoId ?? f.bienId ?? i}`}
      style={{ width: '100%' }}
      contentContainerStyle={e.contenido}
      ListHeaderComponent={cabecera}
      ListFooterComponent={
        <View style={{ gap: 10, marginTop: 12 }}>
          {puedeCerrar && <Boton texto="Cerrar jornada" variante="peligro" onPress={confirmarCierre} />}
        </View>
      }
      ListEmptyComponent={<Text style={e.ayuda}>{!filas ? '' : pestana === 'pendientes' ? 'No queda nada pendiente.' : 'Todavía no hay nada acá.'}</Text>}
      refreshControl={
        <RefreshControl
          refreshing={actualizando}
          onRefresh={async () => {
            setActualizando(true);
            await cargar();
            setActualizando(false);
          }}
          tintColor={c.accion}
        />
      }
      renderItem={({ item }) => (
        <Pressable
          accessibilityRole="button"
          onPress={() =>
            item.tipo === 'esperado' && !item.encontrado && abierta
              ? marcarAMano(item)
              : item.numeroInventario
                ? router.push({ pathname: '/bien/[numero]', params: { numero: item.numeroInventario } })
                : undefined
          }
          style={({ pressed }) => [e.fila, pressed && { opacity: 0.85 }]}
        >
          <View style={{ flex: 1, gap: 3 }}>
            <Text style={e.numero}>{item.numeroInventario ?? 'Sin número'}</Text>
            <Text style={e.descripcion} numberOfLines={2}>
              {item.descripcion ?? 'Sin descripción'}
            </Text>
            {item.tipo === 'esperado' && !item.encontrado && item.ubicacionFisica && <Text style={e.ayuda}>{item.ubicacionFisica}</Text>}
            {item.encontrado && item.relevador && (
              <Text style={e.ayuda}>
                Relevó {item.relevador === yo ? 'vos' : item.relevador}
                {item.relevadoEn ? ` · ${fechaHora(item.relevadoEn)}` : ''}
              </Text>
            )}
            {item.fueraDeLugar && (
              <Text style={e.alerta}>
                Está en {item.ubicacionObservada}; el catálogo dice {item.ubicacionFisica ?? 'sin ubicación'}
              </Text>
            )}
            {item.tipo === 'extra' && item.areaResponsable && <Text style={e.alerta}>Pertenece a {item.areaResponsable}</Text>}
            {item.tipo === 'extra' && !item.bienId && <Text style={e.alerta}>No figura en el catálogo</Text>}
          </View>
          {item.tipo === 'esperado' && !item.encontrado && abierta && <Ionicons name="checkmark-circle-outline" size={24} color={c.suave} />}
        </Pressable>
      )}
    />
  );
}

function Chip({ texto, activo, alTocar }: { texto: string; activo: boolean; alTocar: () => void }) {
  const e = useEstilos(fabrica);
  const { c } = useTema();
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ selected: activo }} onPress={alTocar} style={[e.chip, activo && { backgroundColor: c.primario }]}>
      <Text style={[e.chipTexto, activo && { color: c.sobrePrimario }]} numberOfLines={1}>
        {texto}
      </Text>
    </Pressable>
  );
}

function Tab({ titulo, activa, alTocar }: { titulo: string; activa: boolean; alTocar: () => void }) {
  const e = useEstilos(fabrica);
  const { c } = useTema();
  return (
    <Pressable accessibilityRole="tab" accessibilityState={{ selected: activa }} onPress={alTocar} style={[e.pestana, activa && { backgroundColor: c.primario }]}>
      <Text style={[e.pestanaTexto, activa && { color: c.sobrePrimario }]}>{titulo}</Text>
    </Pressable>
  );
}

const fabrica = (c: Paleta) => ({
  contenido: { width: '100%', maxWidth: 720, alignSelf: 'center', padding: 20, gap: 10 },
  tarjetaColumna: { backgroundColor: c.superficie, borderRadius: radio, padding: 16, gap: 8, borderWidth: 1, borderColor: c.borde },
  rotulo: { fontSize: 12, fontWeight: '700', color: c.suave, textTransform: 'uppercase' },
  titulo: { fontSize: 18, fontWeight: '800', color: c.titulo },
  ayuda: { fontSize: 14, color: c.suave },
  error: { fontSize: 15, color: c.error },
  barra: { height: 10, borderRadius: 5, backgroundColor: c.borde, overflow: 'hidden' },
  barraRelleno: { height: 10, backgroundColor: c.ok },
  camara: { height: 260, borderRadius: radio, overflow: 'hidden', backgroundColor: '#000000' },
  cerrarCamara: { position: 'absolute', top: 10, right: 10, width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center' },
  aviso: { borderRadius: radio, borderWidth: 1.5, borderColor: c.accion, backgroundColor: c.superficie, padding: 12 },
  avisoTexto: { fontSize: 15, fontWeight: '600', color: c.texto },
  pestanas: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  pestana: { paddingVertical: 10, paddingHorizontal: 14, borderRadius: 20, borderWidth: 1, borderColor: c.borde, backgroundColor: c.superficie },
  pestanaTexto: { fontSize: 14, fontWeight: '600', color: c.texto },
  chip: { maxWidth: 240, paddingVertical: 8, paddingHorizontal: 14, borderRadius: 18, borderWidth: 1, borderColor: c.borde, backgroundColor: c.superficie },
  chipTexto: { fontSize: 14, fontWeight: '600', color: c.texto },
  fila: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: c.superficie, borderRadius: radio, padding: 14, borderWidth: 1, borderColor: c.borde },
  numero: { fontSize: 18, fontWeight: '800', color: c.titulo },
  descripcion: { fontSize: 15, color: c.texto },
  alerta: { fontSize: 13, fontWeight: '600', color: c.accion },
});
