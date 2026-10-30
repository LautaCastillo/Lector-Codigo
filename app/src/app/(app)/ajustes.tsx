import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { Boton } from '../../compartido/ui';
import { useBloqueo } from '../../sesion/bloqueo';
import { radio, useEstilos, useTema, type Paleta, type Preferencia } from '../../compartido/tema';

const OPCIONES: { valor: Preferencia; titulo: string; detalle: string }[] = [
  { valor: 'sistema', titulo: 'Automático', detalle: 'Sigue el modo del celular' },
  { valor: 'claro', titulo: 'Claro', detalle: 'Mejor a la luz del día' },
  { valor: 'oscuro', titulo: 'Oscuro', detalle: 'Descansa la vista y ahorra batería' },
];

/** Modo claro u oscuro, PIN de bloqueo opcional y cierre de sesión. */
export default function Ajustes() {
  const { preferencia, setPreferencia, c } = useTema();
  const e = useEstilos(fabrica);
  const router = useRouter();
  const { configurado, biometriaActiva, desactivar } = useBloqueo();

  const confirmarDesactivar = () =>
    Alert.alert('¿Desactivar el PIN?', 'La app dejará de pedir el PIN al abrirla.', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Desactivar', style: 'destructive', onPress: () => void desactivar() },
    ]);

  return (
    <ScrollView contentContainerStyle={e.contenido}>
      <View style={e.columna}>
        <Text style={e.seccion}>Apariencia</Text>
        <View style={e.tarjeta}>
          {OPCIONES.map((o, i) => {
            const activa = o.valor === preferencia;
            return (
              <Pressable
                key={o.valor}
                accessibilityRole="radio"
                accessibilityState={{ selected: activa }}
                onPress={() => setPreferencia(o.valor)}
                style={[e.opcion, i > 0 && { borderTopWidth: 1, borderTopColor: c.borde }]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={e.titulo}>{o.titulo}</Text>
                  <Text style={e.detalle}>{o.detalle}</Text>
                </View>
                <View style={[e.radio, activa && { borderColor: c.accion }]}>{activa && <View style={e.radioRelleno} />}</View>
              </Pressable>
            );
          })}
        </View>
        <Text style={e.seccion}>Seguridad</Text>
        <View style={[e.tarjeta, { padding: 16, gap: 12 }]}>
          <View style={{ gap: 4 }}>
            <Text style={e.titulo}>Bloqueo con PIN</Text>
            <Text style={e.detalle}>
              {configurado
                ? `Activado${biometriaActiva ? ', con huella o rostro' : ''}. La app se bloquea al abrirla y tras 5 minutos en segundo plano.`
                : 'Desactivado. Podés protegerla con un PIN de 6 dígitos (opcional).'}
            </Text>
          </View>
          <Boton texto={configurado ? 'Cambiar PIN' : 'Activar PIN'} variante="secundario" onPress={() => router.push('/configurar-bloqueo')} />
          {configurado && <Boton texto="Desactivar PIN" variante="peligro" onPress={confirmarDesactivar} />}
          <Text style={e.detalle}>
            La sesión queda abierta hasta que la cierres o un administrador suspenda tu cuenta.
          </Text>
        </View>
        <Text style={e.seccion}>Acerca de</Text>
        <View style={[e.tarjeta, { padding: 16, gap: 4 }]}>
          <Text style={e.titulo}>Inventario de Patrimonio</Text>
          <Text style={e.detalle}>Versión {Constants.expoConfig?.version ?? '0.1.0'}</Text>
          <Text style={e.detalle}>Universidad Nacional de Salta</Text>
        </View>
      </View>
    </ScrollView>
  );
}

const fabrica = (c: Paleta) => ({
  contenido: { padding: 20, alignItems: 'center' },
  columna: { width: '100%', maxWidth: 560, gap: 12 },
  seccion: { fontSize: 13, fontWeight: '700', color: c.suave, textTransform: 'uppercase', marginTop: 8 },
  tarjeta: { backgroundColor: c.superficie, borderRadius: radio, borderWidth: 1, borderColor: c.borde },
  opcion: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, minHeight: 64 },
  titulo: { fontSize: 16, fontWeight: '600', color: c.texto },
  detalle: { fontSize: 14, color: c.suave },
  radio: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: c.borde, alignItems: 'center', justifyContent: 'center' },
  radioRelleno: { width: 12, height: 12, borderRadius: 6, backgroundColor: c.accion },
});
