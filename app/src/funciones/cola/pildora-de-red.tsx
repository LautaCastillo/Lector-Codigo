// Aviso chico de conexión: "Sin conexión", "N sin enviar" o lecturas rechazadas. Al tocarlo se abre la lista de envíos.
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Pressable, Text } from 'react-native';
import { useCola } from '../../datos/cola-envio';
import { useEstilos, type Paleta } from '../../compartido/tema';

export function PildoraDeRed() {
  const e = useEstilos(fabrica);
  const router = useRouter();
  const { pendientes, rechazadas, enviando, sinRed } = useCola();
  if (!sinRed && pendientes.length === 0 && rechazadas.length === 0) return null;

  const sinEnviar = pendientes.length ? `${pendientes.length} sin enviar` : '';
  const texto = sinRed ? ['Sin conexión', sinEnviar].filter(Boolean).join(' · ') : enviando ? 'Enviando…' : sinEnviar || `${rechazadas.length} rechazada${rechazadas.length === 1 ? '' : 's'}`;
  const icono = sinRed ? 'cloud-offline-outline' : enviando ? 'cloud-upload-outline' : 'alert-circle-outline';

  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${texto}. Ver envíos`} onPress={() => router.navigate('/pendientes')} style={e.pildora} hitSlop={8}>
      <Ionicons name={icono} size={16} color="#FFFFFF" />
      <Text style={e.texto} numberOfLines={1}>
        {texto}
      </Text>
    </Pressable>
  );
}

const fabrica = (c: Paleta) => ({
  pildora: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, minHeight: 30, borderRadius: 15, backgroundColor: c.accion },
  texto: { fontSize: 13, fontWeight: '700', color: '#FFFFFF' },
});
