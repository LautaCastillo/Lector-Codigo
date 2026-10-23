import type { BienDto, RelevamientoRegistradoDto } from '@patrimonio/shared';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, RefreshControl, ScrollView, Text, TextInput, View, Pressable } from 'react-native';
import { ChipResultado, Dato, Etiquetas, Seccion } from '../../../components/bien';
import { Boton } from '../../../components/ui';
import { buscarBienes, ErrorApi, fotoDeRelevamiento, obtenerRelevamiento, vincularHallazgo } from '../../../lib/api';
import { EXPLICACION_CLASE, EXPLICACION_RESULTADO, ETIQUETA_CLASE, fechaHora } from '../../../lib/formato';
import { useSesion } from '../../../lib/sesion';
import { radio, useEstilos, useTema, type Paleta } from '../../../lib/tema';

export default function DetalleRelevamiento() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const e = useEstilos(fabrica);
  const { c } = useTema();
  const { perfil } = useSesion();
  const [r, setR] = useState<RelevamientoRegistradoDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actualizando, setActualizando] = useState(false);
  const [foto, setFoto] = useState<{ uri: string; headers: Record<string, string> } | null>(null);

  const cargar = useCallback(async () => {
    setError(null);
    try {
      const datos = await obtenerRelevamiento(id);
      setR(datos);
      setFoto(datos.tieneFoto ? await fotoDeRelevamiento(datos.id) : null);
    } catch (err) {
      setR(null);
      setError(
        err instanceof ErrorApi && err.estado === 404
          ? 'No existe este relevamiento.'
          : err instanceof ErrorApi && err.estado === 403
            ? 'Este relevamiento es de otra cuenta.'
            : err instanceof Error
              ? err.message
              : 'No se pudo cargar.',
      );
    }
  }, [id]);
  useEffect(() => {
    void cargar();
  }, [cargar]);

  if (error) {
    return (
      <View style={e.centro}>
        <Text style={e.error}>{error}</Text>
        <Boton texto="Reintentar" variante="secundario" onPress={cargar} />
      </View>
    );
  }
  if (!r) {
    return (
      <View style={e.centro}>
        <ActivityIndicator size="large" color={c.accion} />
      </View>
    );
  }

  const esHallazgo = r.resultado === 'hallazgo';
  const estadoDistinto = !!r.estadoDetectado && !!r.bien?.estadoBien && r.estadoDetectado !== r.bien.estadoBien;
  const ubicacionDistinta = !!r.bien?.ubicacionFisica && !!r.ubicacionObservada && r.bien.ubicacionFisica !== r.ubicacionObservada;
  const titulo = esHallazgo ? (r.codigoProvisorio ?? 'Hallazgo') : (r.bien?.numeroInventario ?? r.valorLeido ?? 'Sin código');

  return (
    <ScrollView
      contentContainerStyle={e.contenido}
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
    >
      <View style={e.columna}>
        <View style={e.encabezado}>
          <View style={e.fila}>
            <ChipResultado resultado={r.resultado} />
            {esHallazgo && r.clase && (
              <View style={[e.etiqueta, { backgroundColor: c.primario }]}>
                <Text style={e.etiquetaTexto}>{ETIQUETA_CLASE[r.clase] ?? r.clase}</Text>
              </View>
            )}
          </View>
          <Text style={e.numero}>{titulo}</Text>
          {esHallazgo && <Text style={e.descripcion}>{r.descripcion}</Text>}
          {!esHallazgo && r.bien && <Text style={e.descripcion}>{r.bien.descripcion ?? 'Sin descripción'}</Text>}
          {!esHallazgo && r.bien && <Etiquetas bien={r.bien} />}
          <Text style={e.suave}>{esHallazgo && r.clase ? EXPLICACION_CLASE[r.clase] : EXPLICACION_RESULTADO[r.resultado]}</Text>
          {!esHallazgo && r.bien && <Boton texto="Ver ficha del bien" variante="secundario" onPress={() => router.push({ pathname: '/bien/[numero]', params: { numero: r.bien!.numeroInventario } })} />}
        </View>

        {esHallazgo && foto && (
          <Image source={foto} style={e.foto} resizeMode="cover" accessibilityLabel="Foto del hallazgo" />
        )}
        {esHallazgo && !foto && r.propio && <Text style={e.suave}>Este hallazgo no tiene foto.</Text>}

        {esHallazgo && (
          <Seccion titulo="Vínculo con el catálogo" resumen={r.bien ? `Bien ${r.bien.numeroInventario}` : 'Sin vincular'}>
            {r.bien ? (
              <>
                <Text style={e.texto}>Se identificó como el bien {r.bien.numeroInventario}: {r.bien.descripcion ?? 'sin descripción'}.</Text>
                <Boton texto="Ver ficha del bien" variante="secundario" onPress={() => router.push({ pathname: '/bien/[numero]', params: { numero: r.bien!.numeroInventario } })} />
              </>
            ) : perfil?.rol === 'administrador' ? (
              <Vinculador relevamientoId={r.id} alVincular={setR} />
            ) : (
              <Text style={e.suave}>Todavía no está vinculado a un bien del catálogo. Un administrador puede hacerlo cuando se lo identifique.</Text>
            )}
          </Seccion>
        )}

        {ubicacionDistinta && (
          <View style={e.alerta} accessible accessibilityRole="alert">
            <Text style={e.alertaTitulo}>Ubicación distinta del catálogo</Text>
            <Text style={e.texto}>
              El catálogo ubica este bien en “{r.bien!.ubicacionFisica}”. Se encontró en “{r.ubicacionObservada}”.
            </Text>
          </View>
        )}

        {estadoDistinto && (
          <View style={e.alerta} accessible accessibilityRole="alert">
            <Text style={e.alertaTitulo}>Estado distinto del catálogo</Text>
            <Text style={e.texto}>
              El catálogo indica “{r.bien!.estadoBien}”. Quien relevó declaró “{r.estadoDetectado}”.
            </Text>
          </View>
        )}

        {esHallazgo && (
          <Seccion titulo="El hallazgo">
            <Dato etiqueta="Descripción" valor={r.descripcion} />
            <Dato etiqueta="Número de serie" valor={r.numeroSerie} />
            <Dato etiqueta="Código provisorio" valor={r.codigoProvisorio} />
          </Seccion>
        )}

        {(r.valorLeido || r.simbologia) && (
          <Seccion titulo="Qué se leyó">
            <Dato etiqueta="Código leído" valor={r.valorLeido} />
            <Dato etiqueta="Tipo de código" valor={r.simbologia?.toUpperCase()} />
          </Seccion>
        )}

        <Seccion titulo="Dónde y cuándo">
          <Dato etiqueta="Ubicación relevada" valor={r.ubicacionObservada} />
          {r.bien && !esHallazgo && <Dato etiqueta="Ubicación según el catálogo" valor={r.bien.ubicacionFisica} />}
          <Dato etiqueta="Relevó" valor={r.relevador} />
          <Dato etiqueta="Hora del teléfono" valor={fechaHora(r.relevadoEnDispositivo)} />
          <Dato etiqueta="Registrado en el servidor" valor={fechaHora(r.sincronizadoEn)} />
        </Seccion>

        {(r.observaciones || r.estadoDetectado || r.loteId) && (
          <Seccion titulo="Otros datos">
            <Dato etiqueta="Estado detectado" valor={r.estadoDetectado} />
            <Dato etiqueta="Observaciones" valor={r.observaciones} />
            <Dato etiqueta="Lote" valor={r.loteId ? r.loteId.slice(0, 8) : null} />
          </Seccion>
        )}
      </View>
    </ScrollView>
  );
}

/** Solo para administradores: buscar el bien del catálogo al que corresponde un hallazgo y vincularlo. */
function Vinculador({ relevamientoId, alVincular }: { relevamientoId: string; alVincular: (r: RelevamientoRegistradoDto) => void }) {
  const e = useEstilos(fabrica);
  const { c } = useTema();
  const [texto, setTexto] = useState('');
  const [resultados, setResultados] = useState<BienDto[]>([]);
  const [elegido, setElegido] = useState<BienDto | null>(null);
  const [motivo, setMotivo] = useState('');
  const [trabajando, setTrabajando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const q = texto.trim();
    if (q.length < 2) {
      setResultados([]);
      return;
    }
    let vigente = true;
    const espera = setTimeout(() => {
      buscarBienes(q)
        .then((l) => vigente && setResultados(l.slice(0, 8)))
        .catch(() => vigente && setResultados([]));
    }, 350);
    return () => {
      vigente = false;
      clearTimeout(espera);
    };
  }, [texto]);

  const confirmar = () => {
    if (!elegido) return;
    Alert.alert('Vincular hallazgo', `Se asocia con el bien ${elegido.numeroInventario}. Queda registrado en la auditoría y no se puede deshacer.`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Vincular',
        onPress: async () => {
          setTrabajando(true);
          setError(null);
          try {
            alVincular(await vincularHallazgo(relevamientoId, elegido.numeroInventario, motivo.trim()));
          } catch (err) {
            setError(err instanceof Error ? err.message : 'No se pudo vincular.');
          }
          setTrabajando(false);
        },
      },
    ]);
  };

  return (
    <View style={{ gap: 10 }}>
      <Text style={e.suave}>Buscá el bien del catálogo al que corresponde este hallazgo.</Text>
      <TextInput value={texto} onChangeText={(t) => { setTexto(t); setElegido(null); }} placeholder="Número o descripción" placeholderTextColor={c.suave} style={e.campo} accessibilityLabel="Buscar el bien al que corresponde" />
      {!elegido &&
        resultados.map((b) => (
          <Pressable key={b.id} accessibilityRole="button" onPress={() => setElegido(b)} style={e.resultado}>
            <Text style={e.resultadoNumero}>{b.numeroInventario}</Text>
            <Text style={e.suave} numberOfLines={2}>
              {b.descripcion ?? 'Sin descripción'}
            </Text>
          </Pressable>
        ))}
      {elegido && (
        <View style={[e.resultado, { borderColor: c.accion, borderWidth: 2 }]}>
          <Text style={e.resultadoNumero}>{elegido.numeroInventario}</Text>
          <Text style={e.suave} numberOfLines={2}>
            {elegido.descripcion ?? 'Sin descripción'}
          </Text>
        </View>
      )}
      {elegido && (
        <>
          <TextInput value={motivo} onChangeText={(t) => setMotivo(t.slice(0, 200))} placeholder="Motivo (obligatorio): por ejemplo, se reetiquetó" placeholderTextColor={c.suave} style={e.campo} accessibilityLabel="Motivo del vínculo" />
          <Boton texto="Vincular con este bien" cargando={trabajando} deshabilitado={motivo.trim().length < 3} onPress={confirmar} />
        </>
      )}
      {error && <Text style={e.error}>{error}</Text>}
    </View>
  );
}

const fabrica = (c: Paleta) => ({
  contenido: { padding: 20, alignItems: 'center' },
  columna: { width: '100%', maxWidth: 720, gap: 14 },
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 16, backgroundColor: c.fondo },
  error: { fontSize: 16, color: c.error, textAlign: 'center' },
  encabezado: { backgroundColor: c.superficie, borderRadius: radio, padding: 16, gap: 10, borderWidth: 1, borderColor: c.borde },
  fila: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  etiqueta: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, alignSelf: 'flex-start' },
  etiquetaTexto: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
  numero: { fontSize: 30, fontWeight: '800', color: c.titulo, letterSpacing: 1 },
  descripcion: { fontSize: 16, color: c.texto, lineHeight: 22 },
  suave: { fontSize: 14, color: c.suave },
  texto: { fontSize: 15, color: c.texto },
  foto: { width: '100%', aspectRatio: 4 / 3, borderRadius: radio, backgroundColor: c.celeste },
  alerta: { backgroundColor: c.superficie, borderRadius: radio, padding: 14, gap: 4, borderWidth: 2, borderColor: c.accion },
  alertaTitulo: { fontSize: 15, fontWeight: '800', color: c.titulo },
  campo: { minHeight: 52, borderWidth: 1.5, borderColor: c.borde, borderRadius: radio, paddingHorizontal: 14, fontSize: 16, color: c.texto, backgroundColor: c.superficie },
  resultado: { padding: 12, gap: 2, borderRadius: radio, borderWidth: 1, borderColor: c.borde, backgroundColor: c.superficie },
  resultadoNumero: { fontSize: 17, fontWeight: '800', color: c.titulo },
});
