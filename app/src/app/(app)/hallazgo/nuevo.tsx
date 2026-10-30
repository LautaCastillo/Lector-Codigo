import { Ionicons } from '@expo/vector-icons';
import {
  CLASES_HALLAZGO,
  codigoProvisorioDe,
  ESTADOS_OBSERVABLES,
  esSimbologia,
  type ClaseHallazgo,
  type RelevamientoDto,
  type UbicacionDto,
} from '@patrimonio/shared';
import { File } from 'expo-file-system';
import * as Crypto from 'expo-crypto';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { Boton, Opciones } from '../../../compartido/ui';
import { listarUbicaciones } from '../../../datos/catalogo';
import { subirFotoDeHallazgo } from '../../../datos/hallazgos';
import { subirRelevamientos } from '../../../datos/relevamientos';
import { ETIQUETA_CLASE, EXPLICACION_CLASE, mensajeDeError } from '../../../compartido/formato';
import { sacarFoto, type FotoLista } from '../../../funciones/hallazgo/foto';
import { radio, useEstilos, useTema, type Paleta } from '../../../compartido/tema';
import { comunes } from '../../../compartido/estilos';

const MAX_DESCRIPCION = 300;
const MAX_OBSERVACIONES = 500;

/**
 * Registrar algo que se vio en campo y no se pudo asociar al catálogo: un bien con código dañado o sin
 * etiqueta, o uno que no figura. Queda como hallazgo con un código provisorio (H-XXXXXXXX).
 */
export default function RegistrarHallazgo() {
  const { simbologia, leido } = useLocalSearchParams<{ simbologia?: string; leido?: string }>();
  const router = useRouter();
  const e = useEstilos(fabrica);
  const { c } = useTema();
  const [clase, setClase] = useState<ClaseHallazgo>('no_identificado');
  const [descripcion, setDescripcion] = useState('');
  const [serie, setSerie] = useState('');
  const [ubicacion, setUbicacion] = useState('');
  const [ubicaciones, setUbicaciones] = useState<UbicacionDto[]>([]);
  const [estado, setEstado] = useState<string | null>(null);
  const [observaciones, setObservaciones] = useState('');
  const [foto, setFoto] = useState<FotoLista | null>(null);
  const [avisoFoto, setAvisoFoto] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [registrado, setRegistrado] = useState(false);
  const [fotoPendiente, setFotoPendiente] = useState(false);
  const [subiendoFoto, setSubiendoFoto] = useState(false);
  // El identificador se genera una sola vez: reintentar no duplica el hallazgo ni su foto.
  const idCliente = useRef(Crypto.randomUUID());
  const horaVisto = useRef(new Date().toISOString());
  const provisorio = codigoProvisorioDe(idCliente.current);

  useEffect(() => {
    listarUbicaciones().then(setUbicaciones).catch(() => undefined);
  }, []);

  const sugeridas = useMemo(() => {
    const q = ubicacion.trim().toLowerCase();
    return q.length === 0 || ubicaciones.some((u) => u.nombre === ubicacion) ? [] : ubicaciones.filter((u) => u.nombre.toLowerCase().includes(q)).slice(0, 5);
  }, [ubicaciones, ubicacion]);

  const tomarFoto = async () => {
    setAvisoFoto(null);
    const r = await sacarFoto();
    if (r.tipo === 'foto') setFoto(r.foto);
    else if (r.tipo === 'sin_permiso') setAvisoFoto('Sin permiso de cámara. Podés activarlo en los ajustes del teléfono.');
    else if (r.tipo === 'muy_grande') setAvisoFoto('No se pudo reducir la foto lo suficiente. Probá con otra toma.');
  };

  const subirFoto = async (f: FotoLista) => {
    setSubiendoFoto(true);
    try {
      await subirFotoDeHallazgo(idCliente.current, new File(f.uri));
      setFotoPendiente(false);
    } catch {
      setFotoPendiente(true);
    }
    setSubiendoFoto(false);
  };

  const registrar = async () => {
    if (descripcion.trim().length < 3) return setError('Describí lo que encontraste (al menos 3 caracteres).');
    if (ubicacion.trim().length < 2) return setError('Indicá dónde lo encontraste.');
    setError(null);
    setEnviando(true);
    const dto: RelevamientoDto = {
      idCliente: idCliente.current,
      resultado: 'hallazgo',
      clase,
      descripcion: descripcion.trim(),
      ubicacionObservada: ubicacion.trim(),
      ...(serie.trim() ? { numeroSerie: serie.trim() } : {}),
      ...(simbologia && esSimbologia(simbologia) ? { simbologia } : {}),
      ...(leido ? { valorLeido: leido } : {}),
      ...(estado ? { estadoDetectado: estado } : {}),
      ...(observaciones.trim() ? { observaciones: observaciones.trim() } : {}),
      relevadoEnDispositivo: horaVisto.current,
    };
    try {
      const r = await subirRelevamientos([dto]);
      if (r.rechazados.length) {
        setError(r.rechazados[0]?.motivo ?? 'El servidor rechazó el hallazgo.');
      } else {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setRegistrado(true);
        // La foto va aparte: si falla, el hallazgo ya está registrado y se puede reintentar solo la foto.
        if (foto) await subirFoto(foto);
      }
    } catch (err) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setError(mensajeDeError(err, 'No se pudo registrar. Revisá la conexión y reintentá.'));
    }
    setEnviando(false);
  };

  if (registrado) {
    return (
      <ScrollView contentContainerStyle={e.centroScroll}>
        <View style={e.centroColumna}>
          <Ionicons name="checkmark-circle" size={72} color={c.ok} />
          <Text style={e.tituloGrande}>Hallazgo registrado</Text>
          <Text style={e.codigo}>{provisorio}</Text>
          <Text style={e.suaveCentro}>Anotá este código provisorio si lo vas a etiquetar. Patrimonio lo puede vincular con el bien del catálogo cuando se lo identifique.</Text>
          {fotoPendiente && foto && (
            <View style={e.alerta}>
              <Text style={e.alertaTexto}>El hallazgo quedó registrado, pero la foto no se pudo subir.</Text>
              <Boton texto="Reintentar la foto" cargando={subiendoFoto} onPress={() => subirFoto(foto)} />
            </View>
          )}
          <View style={{ gap: 12, alignSelf: 'stretch' }}>
            <Boton texto="Escanear otro bien" onPress={() => router.replace('/escanear')} />
            <Boton texto="Ver mis relevamientos" variante="secundario" onPress={() => router.replace('/relevamientos')} />
          </View>
        </View>
      </ScrollView>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={e.contenido} keyboardShouldPersistTaps="handled">
        <View style={e.columna}>
          <Text style={e.suave}>Para algo que viste en campo y no se puede asociar a un bien del catálogo. Se registra con tu cuenta y la hora de ahora. No modifica SIU.</Text>
          {leido && <Text style={e.suave}>Código leído: {leido}</Text>}

          <Text style={e.titulo}>¿Qué clase de hallazgo es?</Text>
          {CLASES_HALLAZGO.map((k) => (
            <Pressable
              key={k}
              accessibilityRole="radio"
              accessibilityState={{ selected: clase === k }}
              onPress={() => setClase(k)}
              style={[e.opcion, clase === k && { borderColor: c.accion, borderWidth: 2 }]}
            >
              <View style={[e.radio, clase === k && { borderColor: c.accion }]}>{clase === k && <View style={e.radioRelleno} />}</View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={e.opcionTitulo}>{ETIQUETA_CLASE[k]}</Text>
                <Text style={e.suave}>{EXPLICACION_CLASE[k]}</Text>
              </View>
            </Pressable>
          ))}

          <Text style={e.titulo}>Descripción</Text>
          <TextInput
            value={descripcion}
            onChangeText={(t) => setDescripcion(t.slice(0, MAX_DESCRIPCION))}
            placeholder="Qué es: tipo de bien, marca, color, medidas, estado de la etiqueta"
            placeholderTextColor={c.suave}
            style={[e.campo, { minHeight: 96, textAlignVertical: 'top', paddingTop: 12 }]}
            multiline
            accessibilityLabel="Descripción"
          />
          <Text style={e.contador}>
            {descripcion.length}/{MAX_DESCRIPCION}
          </Text>

          <Text style={e.titulo}>Número de serie (opcional)</Text>
          <TextInput value={serie} onChangeText={(t) => setSerie(t.slice(0, 100))} placeholder="Si el bien lo trae" placeholderTextColor={c.suave} style={e.campo} autoCapitalize="characters" accessibilityLabel="Número de serie" />

          <Text style={e.titulo}>¿Dónde lo encontraste?</Text>
          <TextInput value={ubicacion} onChangeText={(t) => setUbicacion(t.slice(0, 300))} placeholder="Ubicación o lugar" placeholderTextColor={c.suave} style={e.campo} accessibilityLabel="Ubicación donde lo encontraste" />
          {sugeridas.map((u) => (
            <Pressable key={u.nombre} accessibilityRole="button" onPress={() => setUbicacion(u.nombre)} style={e.sugerida}>
              <Text style={e.sugeridaTexto} numberOfLines={2}>
                {u.nombre}
              </Text>
            </Pressable>
          ))}

          <Text style={e.titulo}>Estado físico</Text>
          <Opciones
            rol="radio"
            tamano="grande"
            opciones={[null, ...ESTADOS_OBSERVABLES].map((op) => ({ clave: op ?? '', titulo: op ?? 'Sin declarar' }))}
            actual={estado ?? ''}
            alElegir={(v) => setEstado(v || null)}
          />

          <Text style={e.titulo}>Foto (opcional)</Text>
          {foto ? (
            <View style={e.fotoCaja}>
              <Image source={{ uri: foto.uri }} style={e.foto} resizeMode="cover" accessibilityLabel="Foto del hallazgo" />
              <Text style={e.suave}>{Math.round(foto.bytes / 1024)} KB</Text>
              <View style={e.fila}>
                <View style={{ flex: 1 }}>
                  <Boton texto="Repetir foto" variante="secundario" onPress={tomarFoto} />
                </View>
                <View style={{ flex: 1 }}>
                  <Boton texto="Quitar" variante="peligro" onPress={() => setFoto(null)} />
                </View>
              </View>
            </View>
          ) : (
            <Boton texto="Sacar foto" variante="secundario" onPress={tomarFoto} />
          )}
          {avisoFoto && <Text style={e.error}>{avisoFoto}</Text>}

          <Text style={e.titulo}>Observaciones</Text>
          <TextInput
            value={observaciones}
            onChangeText={(t) => setObservaciones(t.slice(0, MAX_OBSERVACIONES))}
            placeholder="Cualquier dato que ayude a identificarlo"
            placeholderTextColor={c.suave}
            style={[e.campo, { minHeight: 90, textAlignVertical: 'top', paddingTop: 12 }]}
            multiline
            accessibilityLabel="Observaciones"
          />

          {error && <Text style={e.error}>{error}</Text>}
          <Boton texto="Registrar hallazgo" onPress={registrar} cargando={enviando} />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const fabrica = (c: Paleta) => ({
  ...comunes(c),
  contenido: { padding: 20, alignItems: 'center' },
  columna: { width: '100%', maxWidth: 640, gap: 12 },
  centroScroll: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: c.fondo },
  centroColumna: { width: '100%', maxWidth: 420, alignItems: 'center', gap: 14 },
  titulo: { fontSize: 17, fontWeight: '800', color: c.titulo, marginTop: 8 },
  tituloGrande: { fontSize: 24, fontWeight: '800', color: c.titulo, textAlign: 'center' },
  codigo: { fontSize: 34, fontWeight: '800', color: c.titulo, letterSpacing: 2 },
  suave: { fontSize: 14, color: c.suave },
  suaveCentro: { fontSize: 15, color: c.suave, textAlign: 'center' },
  fila: { flexDirection: 'row', gap: 10 },
  contador: { fontSize: 12, color: c.suave, textAlign: 'right' },
  alerta: { alignSelf: 'stretch', gap: 10, padding: 14, borderRadius: radio, borderWidth: 2, borderColor: c.error, backgroundColor: c.superficie },
  alertaTexto: { fontSize: 15, color: c.texto },
  opcion: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 64, padding: 14, borderRadius: radio, borderWidth: 1, borderColor: c.borde, backgroundColor: c.superficie },
  opcionTitulo: { fontSize: 16, fontWeight: '700', color: c.texto },
  radio: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: c.borde, alignItems: 'center', justifyContent: 'center' },
  radioRelleno: { width: 12, height: 12, borderRadius: 6, backgroundColor: c.accion },
  campo: { minHeight: 52, borderWidth: 1.5, borderColor: c.borde, borderRadius: radio, paddingHorizontal: 14, fontSize: 16, color: c.texto, backgroundColor: c.superficie },
  sugerida: { padding: 12, borderRadius: radio, borderWidth: 1, borderColor: c.borde, backgroundColor: c.superficie, minHeight: 48, justifyContent: 'center' },
  sugeridaTexto: { fontSize: 14, color: c.texto },
  fotoCaja: { gap: 8, padding: 12, borderRadius: radio, borderWidth: 1, borderColor: c.borde, backgroundColor: c.superficie },
  foto: { width: '100%', aspectRatio: 4 / 3, borderRadius: 8, backgroundColor: c.celeste },
});
