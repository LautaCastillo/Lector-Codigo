import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { LARGO_PIN } from '../lib/bloqueo';
import { radio, useEstilos, useTema, type Paleta } from '../lib/tema';

const TECLAS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'borrar'] as const;

interface Props {
  /** Se llama al completar el PIN. Devuelve un mensaje de error para mostrar, o null si fue aceptado. */
  alCompletar: (pin: string) => Promise<string | null>;
  /** Cambia para reiniciar el ingreso (por ejemplo, al pasar de "crear" a "confirmar"). */
  reinicio?: string | number;
}

/** Teclado numérico para ingresar el PIN: teclas grandes, sin abrir el teclado del sistema. */
export function PanelPin({ alCompletar, reinicio }: Props) {
  const e = useEstilos(fabrica);
  const { c } = useTema();
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [trabajando, setTrabajando] = useState(false);

  useEffect(() => {
    setPin('');
    setError(null);
  }, [reinicio]);

  const tocar = async (tecla: (typeof TECLAS)[number]) => {
    if (trabajando || tecla === '') return;
    if (tecla === 'borrar') {
      setPin((p) => p.slice(0, -1));
      return;
    }
    const nuevo = (pin + tecla).slice(0, LARGO_PIN);
    setPin(nuevo);
    setError(null);
    if (nuevo.length < LARGO_PIN) return;
    setTrabajando(true);
    const mensaje = await alCompletar(nuevo);
    setTrabajando(false);
    if (mensaje) {
      setError(mensaje);
      setPin('');
    }
  };

  return (
    <View style={e.contenedor}>
      <View style={e.puntos} accessibilityLabel={`${pin.length} de ${LARGO_PIN} dígitos`}>
        {Array.from({ length: LARGO_PIN }, (_, i) => (
          <View key={i} style={[e.punto, i < pin.length && { backgroundColor: c.primario, borderColor: c.primario }]} />
        ))}
      </View>
      <Text style={e.error} accessibilityLiveRegion="polite">
        {error ?? ' '}
      </Text>
      <View style={e.teclado}>
        {TECLAS.map((tecla, i) =>
          tecla === '' ? (
            <View key={i} style={e.tecla} />
          ) : (
            <Pressable
              key={i}
              accessibilityRole="button"
              accessibilityLabel={tecla === 'borrar' ? 'Borrar un dígito' : tecla}
              onPress={() => tocar(tecla)}
              style={({ pressed }) => [e.tecla, e.teclaActiva, pressed && { backgroundColor: c.celeste }]}
            >
              {tecla === 'borrar' ? (
                <Ionicons name="backspace-outline" size={28} color={c.texto} />
              ) : (
                <Text style={e.digito}>{tecla}</Text>
              )}
            </Pressable>
          ),
        )}
      </View>
    </View>
  );
}

const fabrica = (c: Paleta) => ({
  contenedor: { alignItems: 'center', gap: 8, width: '100%', maxWidth: 320 },
  puntos: { flexDirection: 'row', gap: 14, marginVertical: 8 },
  punto: { width: 16, height: 16, borderRadius: 8, borderWidth: 2, borderColor: c.suave },
  error: { color: c.error, fontSize: 15, textAlign: 'center', minHeight: 22 },
  teclado: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 12, width: '100%' },
  tecla: { width: '28%', aspectRatio: 1.4, alignItems: 'center', justifyContent: 'center', borderRadius: radio, minHeight: 56 },
  teclaActiva: { backgroundColor: c.superficie, borderWidth: 1, borderColor: c.borde },
  digito: { fontSize: 26, fontWeight: '600', color: c.texto },
});
