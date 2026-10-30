// Pide el permiso de la cámara antes de mostrar una pantalla que la usa.
import { useCameraPermissions } from 'expo-camera';
import type { ReactNode } from 'react';
import { Text, View } from 'react-native';
import { useEstilos, type Paleta } from './tema';
import { Boton } from './ui';

/** Muestra `children` (la pantalla con cámara) solo con el permiso concedido; si no, explica y ofrece pedirlo. */
export function PermisoCamara({ children }: { children: ReactNode }) {
  const e = useEstilos(fabrica);
  const [permiso, pedirPermiso] = useCameraPermissions();
  if (!permiso) return <View style={e.centro} />;
  if (!permiso.granted) {
    return (
      <View style={e.centro}>
        <Text style={e.texto}>Se necesita acceso a la cámara para leer códigos.</Text>
        <Boton texto="Permitir cámara" onPress={pedirPermiso} />
      </View>
    );
  }
  return <>{children}</>;
}

const fabrica = (c: Paleta) => ({
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 16, backgroundColor: c.fondo },
  texto: { fontSize: 16, color: c.texto, textAlign: 'center' },
});
