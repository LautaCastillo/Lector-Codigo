import { Ionicons } from '@expo/vector-icons';
import { esSimbologia, SIMBOLOGIAS_POR_DEFECTO } from '@patrimonio/shared';
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import * as Crypto from 'expo-crypto';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, FlatList, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { comunes } from '../../../compartido/estilos';
import { fechaHora, mensajeDeError } from '../../../compartido/formato';
import { radio, useEstilos, useTema, type Paleta } from '../../../compartido/tema';
import { Barra, Boton, Chip, EstadoCarga, Opciones } from '../../../compartido/ui';
import { useLector } from '../../../compartido/useLector';
import { resolverEscaneo } from '../../../datos/catalogo';
import { cerrarJornada, type FilaAvance } from '../../../datos/jornadas';
import { subirRelevamientos } from '../../../datos/relevamientos';
import { FilaDeAvance } from '../../../funciones/jornada/fila-avance';
import { useJornada } from '../../../funciones/jornada/useJornada';
import { useSesion } from '../../../sesion/sesion';

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
  const { jornada, filas, filasRef, error, cargar, controlRecarga, esperadas, pendientes, encontradas, otros, ubicaciones, porcentaje } = useJornada(id);
  const [pestana, setPestana] = useState<Pestana>('pendientes');
  const [camara, setCamara] = useState(false);
  const [ubicacionActual, setUbicacionActual] = useState<string | null>(null);
  const [aviso, setAviso] = useState<Aviso | null>(null);
  const { tomar, liberar } = useLector({ ventanaMs: IGNORAR_REPETIDO_MS });

  const yo = perfil?.nombre ?? perfil?.cuenta ?? '';
  const abierta = jornada?.estado === 'abierta';
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
    async ({ type: tipo, data }: BarcodeScanningResult) => {
      if (!abierta) return;
      const type = tomar(tipo, data);
      if (!type) return;
      // Bien que esta lectura acaba de registrar y estaba pendiente a nuestros ojos: si al recargar resulta que otra persona
      // llegó primero (lecturas casi simultáneas, antes de que llegara el cambio en vivo), se avisa igual.
      let registrado: { id: string; titulo: string } | null = null;
      try {
        const r = await resolverEscaneo(type, data);
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
            if (fila && !fila.encontrado) registrado = { id: bien.id, titulo };
            if (!fila) {
              setAviso({ tipo: 'alerta', texto: `${titulo} es de otra área: ${bien.areaResponsable ?? 'sin área'}. Quedó anotado.` });
            } else if (fila.encontrado) {
              setAviso({ tipo: 'alerta', texto: `${titulo}: ya lo había relevado ${fila.relevador}. Figura él; tu lectura quedó anotada.` });
            } else if (ubicacionActual && bien.ubicacionFisica && ubicacionActual !== bien.ubicacionFisica) {
              setAviso({ tipo: 'alerta', texto: `Encontrado: ${titulo}. Ojo: según el catálogo figura en ${bien.ubicacionFisica}.` });
            } else {
              setAviso({ tipo: 'ok', texto: `Encontrado: ${titulo}` });
            }
            void Haptics.notificationAsync(fila && !fila.encontrado ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Warning);
          }
        }
        const nuevas = await cargar();
        const propio = registrado ? nuevas?.find((f) => f.tipo === 'esperado' && f.bienId === registrado!.id) : undefined;
        if (registrado && propio && propio.relevador !== yo) {
          setAviso({ tipo: 'alerta', texto: `${registrado.titulo}: lo relevó primero ${propio.relevador}. Se anotó también tu lectura.` });
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        }
      } catch (err) {
        setAviso({ tipo: 'error', texto: mensajeDeError(err, 'No se pudo registrar la lectura.') });
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      } finally {
        liberar();
      }
    },
    [abierta, cargar, filasRef, liberar, registrar, tomar, ubicacionActual, yo],
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
            setAviso({ tipo: 'error', texto: mensajeDeError(err, 'No se pudo registrar.') });
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
            setAviso({ tipo: 'error', texto: mensajeDeError(err, 'No se pudo cerrar.') });
          }
        },
      },
    ]);

  /** Tocar una fila: marcarla a mano si está pendiente; si no, abrir la ficha del bien. */
  const alTocarFila = (item: FilaAvance) => {
    if (item.tipo === 'esperado' && !item.encontrado && abierta) marcarAMano(item);
    else if (item.numeroInventario) router.push({ pathname: '/bien/[numero]', params: { numero: item.numeroInventario } });
  };

  const lista = pestana === 'pendientes' ? pendientes : pestana === 'encontrados' ? encontradas : otros;

  const cabecera = (
    <View style={{ gap: 12 }}>
      <View style={e.tarjetaColumna}>
        <Text style={e.rotulo}>
          {jornada?.tipo === 'area' ? 'Área' : 'Ubicación'} · {abierta ? 'Abierta' : 'Cerrada'}
        </Text>
        <Text style={e.titulo}>{jornada?.alcance}</Text>
        <Barra porcentaje={porcentaje} alto={10} />
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

      <Opciones
        tamano="chico"
        opciones={[
          { clave: 'pendientes', titulo: `Pendientes ${pendientes.length}` },
          { clave: 'encontrados', titulo: `Encontrados ${encontradas.length}` },
          { clave: 'otros', titulo: `Otros ${otros.length}` },
        ]}
        actual={pestana}
        alElegir={setPestana}
      />
      {pestana === 'otros' && <Text style={e.ayuda}>Bienes de otra área y códigos que no están en el catálogo, leídos durante esta jornada.</Text>}
      <EstadoCarga error={error} cargando={!filas} alReintentar={cargar} />
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
      refreshControl={controlRecarga}
      renderItem={({ item }) => (
        <FilaDeAvance item={item} yo={yo} marcable={item.tipo === 'esperado' && !item.encontrado && !!abierta} alTocar={() => alTocarFila(item)} />
      )}
    />
  );
}

const fabrica = (c: Paleta) => ({
  ...comunes(c),
  contenido: { width: '100%', maxWidth: 720, alignSelf: 'center', padding: 20, gap: 10 },
  tarjetaColumna: { backgroundColor: c.superficie, borderRadius: radio, padding: 16, gap: 8, borderWidth: 1, borderColor: c.borde },
  rotulo: { fontSize: 12, fontWeight: '700', color: c.suave, textTransform: 'uppercase' },
  titulo: { fontSize: 18, fontWeight: '800', color: c.titulo },
  camara: { height: 260, borderRadius: radio, overflow: 'hidden', backgroundColor: '#000000' },
  cerrarCamara: { position: 'absolute', top: 10, right: 10, width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center' },
  aviso: { borderRadius: radio, borderWidth: 1.5, borderColor: c.accion, backgroundColor: c.superficie, padding: 12 },
  avisoTexto: { fontSize: 15, fontWeight: '600', color: c.texto },
});
