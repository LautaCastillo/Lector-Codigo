import type { BienDetalleDto } from '@patrimonio/shared';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, Text, TextInput, View } from 'react-native';
import { comunes } from '../../../compartido/estilos';
import { ETIQUETA_SITUACION, fechaHora, mensajeDeError, SITUACIONES_BIEN, type SituacionBien } from '../../../compartido/formato';
import { radio, useEstilos, useTema, type Paleta } from '../../../compartido/tema';
import { Boton, Opciones } from '../../../compartido/ui';
import { obtenerBien } from '../../../datos/catalogo';
import { declararSituacion, levantarSituacion, situacionesDeBien, type SituacionDeBien } from '../../../datos/situaciones';
import { useSesion } from '../../../sesion/sesion';

const LARGO_MOTIVO = 300;

/** Declarar o levantar la situación administrativa de un bien (en reparación, para baja, prestado). Solo administradores. */
export default function SituacionDelBien() {
  const { numero } = useLocalSearchParams<{ numero: string }>();
  const router = useRouter();
  const { perfil } = useSesion();
  const e = useEstilos(fabrica);
  const { c } = useTema();
  const [bien, setBien] = useState<BienDetalleDto | null>(null);
  const [vigente, setVigente] = useState<SituacionDeBien | null>(null);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  const [situacion, setSituacion] = useState<SituacionBien>('en_reparacion');
  const [motivo, setMotivo] = useState('');
  const [motivoLevantada, setMotivoLevantada] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const esAdmin = perfil?.rol === 'administrador';

  const cargar = useCallback(async () => {
    try {
      const ficha = await obtenerBien(numero);
      const situaciones = await situacionesDeBien(ficha.id);
      setBien(ficha);
      setVigente(situaciones.find((s) => s.vigente) ?? null);
      setErrorCarga(null);
    } catch (err) {
      setErrorCarga(mensajeDeError(err, 'No se pudo cargar el bien.'));
    }
  }, [numero]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const terminar = async (accion: () => Promise<void>) => {
    setError(null);
    setEnviando(true);
    try {
      await accion();
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.back();
    } catch (err) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setError(mensajeDeError(err, 'No se pudo guardar. Revisá la conexión y reintentá.'));
    }
    setEnviando(false);
  };

  if (errorCarga) {
    return (
      <View style={e.centro}>
        <Text style={e.error}>{errorCarga}</Text>
        <Boton texto="Reintentar" variante="secundario" onPress={cargar} />
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
  if (!esAdmin) {
    return (
      <View style={e.centro}>
        <Text style={e.error}>Solo un administrador puede declarar la situación de un bien.</Text>
        <Boton texto="Volver" variante="secundario" onPress={() => router.back()} />
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
          </View>

          <Text style={e.ayuda}>
            Un bien con situación que no se encontró en una jornada no cuenta como pendiente: la jornada lo muestra aparte. Si igual se lo encuentra, cuenta como cualquier otro. Queda registrado quién y cuándo.
          </Text>

          {vigente && (
            <View style={e.vigente}>
              <Text style={e.titulo}>Situación vigente: {ETIQUETA_SITUACION[vigente.situacion]}</Text>
              <Text style={e.ayuda}>{vigente.motivo}</Text>
              <Text style={e.ayuda}>
                La declaró {vigente.declaradaPor} el {fechaHora(vigente.declaradaEn)}.
              </Text>
              <TextInput
                value={motivoLevantada}
                onChangeText={(t) => setMotivoLevantada(t.slice(0, LARGO_MOTIVO))}
                placeholder="Motivo (opcional), por ejemplo: volvió del taller"
                placeholderTextColor={c.suave}
                style={e.campo}
                accessibilityLabel="Motivo para levantar la situación"
              />
              <Boton texto="Levantar la situación" variante="secundario" cargando={enviando} onPress={() => terminar(() => levantarSituacion(bien.id, motivoLevantada))} />
            </View>
          )}

          <Text style={e.titulo}>{vigente ? 'Cambiar la situación' : 'Declarar una situación'}</Text>
          <Opciones
            rol="radio"
            tamano="grande"
            opciones={SITUACIONES_BIEN.map((s) => ({ clave: s, titulo: ETIQUETA_SITUACION[s] }))}
            actual={situacion}
            alElegir={setSituacion}
          />
          <TextInput
            value={motivo}
            onChangeText={(t) => setMotivo(t.slice(0, LARGO_MOTIVO))}
            placeholder="Motivo, por ejemplo: está en el taller de mantenimiento"
            placeholderTextColor={c.suave}
            style={[e.campo, { minHeight: 90, textAlignVertical: 'top', paddingTop: 12 }]}
            multiline
            accessibilityLabel="Motivo de la situación"
          />
          <Text style={e.contador}>
            {motivo.length}/{LARGO_MOTIVO}
          </Text>
          {error && <Text style={e.error}>{error}</Text>}
          <Boton texto={vigente ? 'Cambiar la situación' : 'Declarar la situación'} cargando={enviando} deshabilitado={motivo.trim().length < 3} onPress={() => terminar(() => declararSituacion(bien.id, situacion, motivo))} />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const fabrica = (c: Paleta) => ({
  ...comunes(c),
  contenido: { padding: 20, alignItems: 'center' },
  columna: { width: '100%', maxWidth: 640, gap: 12 },
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 14, backgroundColor: c.fondo },
  bien: { backgroundColor: c.superficie, borderRadius: radio, padding: 16, gap: 6, borderWidth: 1, borderColor: c.borde },
  numero: { fontSize: 26, fontWeight: '800', color: c.titulo, letterSpacing: 1 },
  descripcion: { fontSize: 15, color: c.texto },
  titulo: { fontSize: 17, fontWeight: '800', color: c.titulo, marginTop: 4 },
  vigente: { backgroundColor: c.superficie, borderRadius: radio, padding: 14, gap: 8, borderWidth: 1.5, borderColor: c.accion },
  campo: { minHeight: 52, borderWidth: 1.5, borderColor: c.borde, borderRadius: radio, paddingHorizontal: 14, fontSize: 16, color: c.texto, backgroundColor: c.superficie },
  contador: { fontSize: 12, color: c.suave, textAlign: 'right' },
});
