import { Ionicons } from '@expo/vector-icons';
import { ESTADOS_OBSERVABLES, esSimbologia, type BienDetalleDto, type RelevamientoDto, type UbicacionDto } from '@patrimonio/shared';
import * as Crypto from 'expo-crypto';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { Etiquetas } from '../../../components/bien';
import { Boton } from '../../../components/ui';
import { listarUbicaciones, obtenerBien, subirRelevamientos } from '../../../lib/api';
import { radio, useEstilos, useTema, type Paleta } from '../../../lib/tema';

const LARGO_OBSERVACIONES = 500;
type ModoUbicacion = 'catalogo' | 'otra';

/** Registrar que se vio un bien, con su estado físico, la ubicación real y observaciones. */
export default function RegistrarRelevamiento() {
  const { numero, simbologia, leido } = useLocalSearchParams<{ numero: string; simbologia?: string; leido?: string }>();
  const router = useRouter();
  const e = useEstilos(fabrica);
  const { c } = useTema();
  const [bien, setBien] = useState<BienDetalleDto | null>(null);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  const [modo, setModo] = useState<ModoUbicacion>('catalogo');
  const [otra, setOtra] = useState('');
  const [ubicaciones, setUbicaciones] = useState<UbicacionDto[]>([]);
  const [estado, setEstado] = useState<string | null>(null);
  const [observaciones, setObservaciones] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [registrado, setRegistrado] = useState(false);
  // El identificador se genera una sola vez: si el envío falla y se reintenta, el servidor no duplica.
  const idCliente = useRef(Crypto.randomUUID());
  // Se toma la hora al abrir la pantalla: es cuando se vio el bien, no cuando se confirma.
  const horaVisto = useRef(new Date().toISOString());

  useEffect(() => {
    obtenerBien(numero)
      .then(setBien)
      .catch((err) => setErrorCarga(err instanceof Error ? err.message : 'No se pudo cargar el bien.'));
  }, [numero]);

  // Las ubicaciones del catálogo se piden solo si la persona dice que el bien está en otro lugar.
  useEffect(() => {
    if (modo === 'otra' && ubicaciones.length === 0) listarUbicaciones().then(setUbicaciones).catch(() => undefined);
  }, [modo, ubicaciones.length]);

  const sugeridas = useMemo(() => {
    const q = otra.trim().toLowerCase();
    return ubicaciones.filter((u) => u.nombre !== bien?.ubicacionFisica && (!q || u.nombre.toLowerCase().includes(q))).slice(0, 6);
  }, [ubicaciones, otra, bien]);

  const ubicacionFinal = modo === 'catalogo' ? bien?.ubicacionFisica?.trim() || undefined : otra.trim() || undefined;

  const registrar = async () => {
    if (!bien) return;
    if (modo === 'otra' && !otra.trim()) return setError('Escribí o elegí la ubicación donde está el bien.');
    setError(null);
    setEnviando(true);
    const dto: RelevamientoDto = {
      idCliente: idCliente.current,
      resultado: 'encontrado',
      numeroInventario: bien.numeroInventario,
      ...(simbologia && esSimbologia(simbologia) ? { simbologia } : {}),
      ...(leido ? { valorLeido: leido } : {}),
      ...(ubicacionFinal ? { ubicacionObservada: ubicacionFinal } : {}),
      ...(estado ? { estadoDetectado: estado } : {}),
      ...(observaciones.trim() ? { observaciones: observaciones.trim() } : {}),
      relevadoEnDispositivo: horaVisto.current,
    };
    try {
      const r = await subirRelevamientos([dto]);
      if (r.rechazados.length) {
        setError(r.rechazados[0]?.motivo ?? 'El servidor rechazó el relevamiento.');
      } else {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setRegistrado(true);
      }
    } catch (err) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setError(err instanceof Error ? err.message : 'No se pudo registrar. Revisá la conexión y reintentá.');
    }
    setEnviando(false);
  };

  if (errorCarga) {
    return (
      <View style={e.centro}>
        <Text style={e.error}>{errorCarga}</Text>
        <Boton texto="Volver" variante="secundario" onPress={() => router.back()} />
      </View>
    );
  }
  if (!bien) {
    return (
      <View style={e.centro}>
        <ActivityIndicator size="large" color={c.accion} />
      </View>
    );
  }

  if (registrado) {
    return (
      <View style={e.centro}>
        <Ionicons name="checkmark-circle" size={72} color={c.ok} />
        <Text style={e.tituloGrande}>Relevamiento registrado</Text>
        <Text style={e.suaveCentro}>
          {bien.numeroInventario} · {estado ?? 'sin estado declarado'}
          {ubicacionFinal ? `\n${ubicacionFinal}` : ''}
        </Text>
        <View style={{ gap: 12, alignSelf: 'stretch', maxWidth: 420, width: '100%' }}>
          <Boton texto="Escanear otro bien" onPress={() => router.replace('/escanear')} />
          <Boton texto="Volver a la ficha" variante="secundario" onPress={() => router.back()} />
          <Boton texto="Ver mis relevamientos" variante="secundario" onPress={() => router.replace('/relevamientos')} />
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={e.contenido} keyboardShouldPersistTaps="handled">
        <View style={e.columna}>
          <View style={e.bien}>
            <Text style={e.numero}>{bien.numeroInventario}</Text>
            <Text style={e.descripcion} numberOfLines={3}>
              {bien.descripcion ?? 'Sin descripción'}
            </Text>
            <Etiquetas bien={bien} />
          </View>

          <Text style={e.titulo}>¿Dónde está el bien?</Text>
          <Opcion activa={modo === 'catalogo'} titulo="Donde dice el catálogo" detalle={bien.ubicacionFisica ?? 'El catálogo no indica ubicación'} alTocar={() => setModo('catalogo')} />
          <Opcion activa={modo === 'otra'} titulo="En otra ubicación" detalle="Elegí una del catálogo o escribila" alTocar={() => setModo('otra')} />
          {modo === 'otra' && (
            <View style={{ gap: 8 }}>
              <TextInput
                value={otra}
                onChangeText={setOtra}
                placeholder="Ubicación donde lo encontraste"
                placeholderTextColor={c.suave}
                style={e.campo}
                accessibilityLabel="Ubicación donde lo encontraste"
              />
              {sugeridas.map((u) => (
                <Pressable key={u.nombre} accessibilityRole="button" onPress={() => setOtra(u.nombre)} style={e.sugerida}>
                  <Text style={e.sugeridaTexto} numberOfLines={2}>
                    {u.nombre}
                  </Text>
                </Pressable>
              ))}
            </View>
          )}

          <Text style={e.titulo}>Estado físico</Text>
          <Text style={e.suave}>Catálogo: {bien.estadoBien ?? 'sin dato'}. Dejalo sin declarar si no querés opinar.</Text>
          <View style={e.chips}>
            {[null, ...ESTADOS_OBSERVABLES].map((op) => (
              <Pressable
                key={op ?? 'ninguno'}
                accessibilityRole="radio"
                accessibilityState={{ selected: estado === op }}
                onPress={() => setEstado(op)}
                style={[e.chip, estado === op && { backgroundColor: c.primario, borderColor: c.primario }]}
              >
                <Text style={[e.chipTexto, estado === op && { color: c.sobrePrimario }]}>{op ?? 'Sin declarar'}</Text>
              </Pressable>
            ))}
          </View>

          <Text style={e.titulo}>Observaciones</Text>
          <TextInput
            value={observaciones}
            onChangeText={(t) => setObservaciones(t.slice(0, LARGO_OBSERVACIONES))}
            placeholder="Por ejemplo: falta una pata, etiqueta despegada, está en reparación"
            placeholderTextColor={c.suave}
            style={[e.campo, { minHeight: 110, textAlignVertical: 'top', paddingTop: 12 }]}
            multiline
            accessibilityLabel="Observaciones"
          />
          <Text style={e.contador}>
            {observaciones.length}/{LARGO_OBSERVACIONES}
          </Text>

          {error && <Text style={e.error}>{error}</Text>}
          <Boton texto="Registrar relevamiento" onPress={registrar} cargando={enviando} />
          <Text style={e.suave}>Se registra con tu cuenta y la hora de ahora. No modifica SIU.</Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Opcion({ activa, titulo, detalle, alTocar }: { activa: boolean; titulo: string; detalle: string; alTocar: () => void }) {
  const e = useEstilos(fabrica);
  const { c } = useTema();
  return (
    <Pressable accessibilityRole="radio" accessibilityState={{ selected: activa }} onPress={alTocar} style={[e.opcion, activa && { borderColor: c.accion, borderWidth: 2 }]}>
      <View style={[e.radio, activa && { borderColor: c.accion }]}>{activa && <View style={e.radioRelleno} />}</View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={e.opcionTitulo}>{titulo}</Text>
        <Text style={e.suave} numberOfLines={3}>
          {detalle}
        </Text>
      </View>
    </Pressable>
  );
}

const fabrica = (c: Paleta) => ({
  contenido: { padding: 20, alignItems: 'center' },
  columna: { width: '100%', maxWidth: 640, gap: 12 },
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 14, backgroundColor: c.fondo },
  bien: { backgroundColor: c.superficie, borderRadius: radio, padding: 16, gap: 6, borderWidth: 1, borderColor: c.borde },
  numero: { fontSize: 26, fontWeight: '800', color: c.titulo, letterSpacing: 1 },
  descripcion: { fontSize: 15, color: c.texto },
  titulo: { fontSize: 17, fontWeight: '800', color: c.titulo, marginTop: 8 },
  tituloGrande: { fontSize: 24, fontWeight: '800', color: c.titulo, textAlign: 'center' },
  suave: { fontSize: 14, color: c.suave },
  suaveCentro: { fontSize: 15, color: c.suave, textAlign: 'center' },
  error: { fontSize: 15, color: c.error },
  opcion: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 64, padding: 14, borderRadius: radio, borderWidth: 1, borderColor: c.borde, backgroundColor: c.superficie },
  opcionTitulo: { fontSize: 16, fontWeight: '700', color: c.texto },
  radio: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: c.borde, alignItems: 'center', justifyContent: 'center' },
  radioRelleno: { width: 12, height: 12, borderRadius: 6, backgroundColor: c.accion },
  campo: { minHeight: 52, borderWidth: 1.5, borderColor: c.borde, borderRadius: radio, paddingHorizontal: 14, fontSize: 16, color: c.texto, backgroundColor: c.superficie },
  sugerida: { padding: 12, borderRadius: radio, borderWidth: 1, borderColor: c.borde, backgroundColor: c.superficie, minHeight: 48, justifyContent: 'center' },
  sugeridaTexto: { fontSize: 14, color: c.texto },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { minHeight: 48, paddingHorizontal: 18, borderRadius: 24, borderWidth: 1.5, borderColor: c.borde, backgroundColor: c.superficie, alignItems: 'center', justifyContent: 'center' },
  chipTexto: { fontSize: 15, fontWeight: '600', color: c.texto },
  contador: { fontSize: 12, color: c.suave, textAlign: 'right' },
});
