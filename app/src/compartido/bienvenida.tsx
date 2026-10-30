import { useEffect, useRef } from 'react';
import { Animated, Text, View } from 'react-native';
import { useEstilos, type Paleta } from './tema';
import { Logo } from './ui';

/** Pantalla de bienvenida al abrir la app: logo de la UNSa y nombre de la dirección, con una aparición suave. */
export function Bienvenida() {
  const e = useEstilos(fabrica);
  const progreso = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(progreso, { toValue: 1, duration: 600, useNativeDriver: true }).start();
  }, [progreso]);

  return (
    <View style={e.contenedor}>
      <Animated.View
        style={{
          alignItems: 'center',
          gap: 18,
          opacity: progreso,
          transform: [{ scale: progreso.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1] }) }],
        }}
      >
        <Logo ancho={260} />
        <View style={e.linea} />
        <Text style={e.titulo}>Dirección de Patrimonio</Text>
        <Text style={e.subtitulo}>Inventario de bienes</Text>
      </Animated.View>
    </View>
  );
}

const fabrica = (c: Paleta) => ({
  contenedor: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: c.fondo },
  linea: { width: 56, height: 3, borderRadius: 2, backgroundColor: c.accion },
  titulo: { fontSize: 24, fontWeight: '800', color: c.titulo, textAlign: 'center' },
  subtitulo: { fontSize: 15, color: c.suave, textAlign: 'center' },
});
