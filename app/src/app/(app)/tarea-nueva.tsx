import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { comunes } from '../../compartido/estilos';
import { fechaCorta, mensajeDeError, nombreDeCuenta, sinAcentos } from '../../compartido/formato';
import { radio, useEstilos, useTema, type Paleta } from '../../compartido/tema';
import { Boton, Chip, Opciones } from '../../compartido/ui';
import { listarAreas, listarUbicaciones } from '../../datos/catalogo';
import { listarCuentas } from '../../datos/cuentas';
import { asignarTarea } from '../../datos/tareas';
import { fechaEnDias, parsearFecha } from '../../funciones/tareas/fechas';
import { useSesion } from '../../sesion/sesion';

type Tipo = 'area' | 'ubicacion';
type Cuando = 'hoy' | 'manana' | 'semana' | 'otra';

const MAX_SUGERIDAS = 8;
const LARGO_NOTA = 300;

/** Asignar a una persona un área o una ubicación para relevar, con fecha. Solo administradores. */
export default function TareaNueva() {
  const router = useRouter();
  const { perfil } = useSesion();
  const e = useEstilos(fabrica);
  const { c } = useTema();
  const [tipo, setTipo] = useState<Tipo>('area');
  const [opciones, setOpciones] = useState<{ nombre: string; cantidad: number }[]>([]);
  const [personas, setPersonas] = useState<{ id: string; nombre: string }[]>([]);
  const [busqueda, setBusqueda] = useState('');
  const [alcance, setAlcance] = useState<string | null>(null);
  const [personaId, setPersonaId] = useState<string | null>(null);
  const [cuando, setCuando] = useState<Cuando>('semana');
  const [otraFecha, setOtraFecha] = useState('');
  const [nota, setNota] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (perfil?.rol !== 'administrador') return;
    listarCuentas()
      .then((cs) => setPersonas(cs.filter((x) => x.estado === 'activa').map((x) => ({ id: x.id, nombre: x.nombre ?? nombreDeCuenta(x.cuenta) }))))
      .catch((err) => setError(mensajeDeError(err, 'No se pudieron cargar las cuentas.')));
  }, [perfil?.rol]);

  useEffect(() => {
    setAlcance(null);
    setBusqueda('');
    setOpciones([]);
    (tipo === 'area' ? listarAreas() : listarUbicaciones())
      .then(setOpciones)
      .catch((err) => setError(mensajeDeError(err, 'No se pudo cargar el catálogo.')));
  }, [tipo]);

  const sugeridas = useMemo(() => {
    const q = sinAcentos(busqueda.trim());
    return opciones.filter((o) => !q || sinAcentos(o.nombre).includes(q)).slice(0, MAX_SUGERIDAS);
  }, [opciones, busqueda]);

  const fecha = cuando === 'hoy' ? fechaEnDias(0) : cuando === 'manana' ? fechaEnDias(1) : cuando === 'semana' ? fechaEnDias(7) : parsearFecha(otraFecha);

  if (perfil && perfil.rol !== 'administrador') {
    return (
      <View style={e.centro}>
        <Text style={e.error}>Solo un administrador puede asignar tareas.</Text>
      </View>
    );
  }

  const asignar = async () => {
    if (!alcance || !personaId || !fecha) return;
    setError(null);
    setEnviando(true);
    try {
      await asignarTarea({ tipo, alcance, usuarioId: personaId, fecha, nota });
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.back();
    } catch (err) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setError(mensajeDeError(err, 'No se pudo asignar. Revisá la conexión y reintentá.'));
    }
    setEnviando(false);
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={e.contenido} keyboardShouldPersistTaps="handled">
        <View style={e.columna}>
          <Text style={e.titulo}>¿Qué se releva?</Text>
          <Opciones<Tipo> tamano="chico" opciones={[{ clave: 'area', titulo: 'Un área' }, { clave: 'ubicacion', titulo: 'Una ubicación' }]} actual={tipo} alElegir={setTipo} />
          {alcance ? (
            <View style={e.elegido}>
              <Text style={e.elegidoTexto}>{alcance}</Text>
              <Pressable accessibilityRole="button" onPress={() => setAlcance(null)} hitSlop={8}>
                <Text style={e.enlace}>Cambiar</Text>
              </Pressable>
            </View>
          ) : (
            <>
              <TextInput value={busqueda} onChangeText={setBusqueda} placeholder={tipo === 'area' ? 'Buscar un área' : 'Buscar una ubicación'} placeholderTextColor={c.suave} style={e.campo} accessibilityLabel="Buscar" />
              {sugeridas.map((o) => (
                <Pressable key={o.nombre} accessibilityRole="button" onPress={() => setAlcance(o.nombre)} style={e.sugerida}>
                  <Text style={e.sugeridaTexto} numberOfLines={2}>
                    {o.nombre} ({o.cantidad})
                  </Text>
                </Pressable>
              ))}
              {opciones.length > MAX_SUGERIDAS && sugeridas.length === MAX_SUGERIDAS && <Text style={e.ayuda}>Escribí para ver otras.</Text>}
            </>
          )}

          <Text style={e.titulo}>¿Quién lo releva?</Text>
          <View style={e.chips}>
            {personas.map((p) => (
              <Chip key={p.id} texto={p.nombre} activo={personaId === p.id} alTocar={() => setPersonaId(personaId === p.id ? null : p.id)} />
            ))}
          </View>

          <Text style={e.titulo}>¿Para cuándo?</Text>
          <Opciones<Cuando>
            tamano="chico"
            opciones={[
              { clave: 'hoy', titulo: 'Hoy' },
              { clave: 'manana', titulo: 'Mañana' },
              { clave: 'semana', titulo: 'En una semana' },
              { clave: 'otra', titulo: 'Otra fecha' },
            ]}
            actual={cuando}
            alElegir={setCuando}
          />
          {cuando === 'otra' ? (
            <>
              <TextInput value={otraFecha} onChangeText={setOtraFecha} placeholder="dd/mm/aaaa" placeholderTextColor={c.suave} style={e.campo} keyboardType="numbers-and-punctuation" accessibilityLabel="Fecha" />
              {otraFecha.trim().length > 0 && !fecha && <Text style={e.error}>Escribí una fecha válida, por ejemplo 15/12/2026.</Text>}
            </>
          ) : (
            fecha && <Text style={e.ayuda}>{fechaCorta(fecha)}</Text>
          )}

          <Text style={e.titulo}>Nota (opcional)</Text>
          <TextInput
            value={nota}
            onChangeText={(t) => setNota(t.slice(0, LARGO_NOTA))}
            placeholder="Por ejemplo: empezar por el depósito"
            placeholderTextColor={c.suave}
            style={[e.campo, { minHeight: 80, textAlignVertical: 'top', paddingTop: 12 }]}
            multiline
            accessibilityLabel="Nota"
          />

          {error && <Text style={e.error}>{error}</Text>}
          <Boton texto="Asignar la tarea" cargando={enviando} deshabilitado={!alcance || !personaId || !fecha} onPress={asignar} />
          <Text style={e.ayuda}>La persona la ve en "Mis tareas" y, al empezarla, abre la jornada de ese {tipo === 'area' ? 'área' : 'lugar'} (o se suma a la que ya está abierta).</Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const fabrica = (c: Paleta) => ({
  ...comunes(c),
  contenido: { padding: 20, alignItems: 'center' },
  columna: { width: '100%', maxWidth: 640, gap: 12 },
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: c.fondo },
  titulo: { fontSize: 17, fontWeight: '800', color: c.titulo, marginTop: 8 },
  campo: { minHeight: 52, borderWidth: 1.5, borderColor: c.borde, borderRadius: radio, paddingHorizontal: 14, fontSize: 16, color: c.texto, backgroundColor: c.superficie },
  sugerida: { padding: 12, borderRadius: radio, borderWidth: 1, borderColor: c.borde, backgroundColor: c.superficie, minHeight: 48, justifyContent: 'center' },
  sugeridaTexto: { fontSize: 15, color: c.texto },
  elegido: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: 14, borderRadius: radio, borderWidth: 1.5, borderColor: c.accion, backgroundColor: c.superficie },
  elegidoTexto: { flex: 1, fontSize: 16, fontWeight: '700', color: c.titulo },
  enlace: { fontSize: 14, fontWeight: '600', color: c.accion },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
