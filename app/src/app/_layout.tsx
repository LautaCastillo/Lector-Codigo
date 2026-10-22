import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Cargando } from '../components/ui';
import { SesionProvider, useSesion } from '../lib/sesion';
import { TemaProvider, useTema } from '../lib/tema';

function Rutas() {
  const { cargando, sesion, perfil } = useSesion();
  const { esOscuro } = useTema();
  if (cargando) return <Cargando />;
  return (
    <>
      <StatusBar style={esOscuro ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Protected guard={!sesion}>
          <Stack.Screen name="(auth)" />
        </Stack.Protected>
        <Stack.Protected guard={!!sesion && !perfil?.activo}>
          <Stack.Screen name="estado-cuenta" />
        </Stack.Protected>
        <Stack.Protected guard={!!perfil?.activo}>
          <Stack.Screen name="(app)" />
        </Stack.Protected>
      </Stack>
    </>
  );
}

export default function Layout() {
  return (
    <TemaProvider>
      <SesionProvider>
        <Rutas />
      </SesionProvider>
    </TemaProvider>
  );
}
