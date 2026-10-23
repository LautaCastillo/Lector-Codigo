import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Cargando } from '../components/ui';
import { BloqueoProvider, useBloqueo } from '../lib/bloqueo';
import { SesionProvider, useSesion } from '../lib/sesion';
import { TemaProvider, useTema } from '../lib/tema';

function Rutas() {
  const { cargando, sesion, perfil } = useSesion();
  const { esOscuro } = useTema();
  const bloqueo = useBloqueo();
  const activa = !!perfil?.activo;
  // Con la cuenta activa, la app solo se muestra con el bloqueo configurado y la sesión desbloqueada.
  if (cargando || (activa && bloqueo.cargando)) return <Cargando />;
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
        <Stack.Protected guard={activa && !bloqueo.configurado}>
          <Stack.Screen name="configurar-bloqueo" />
        </Stack.Protected>
        <Stack.Protected guard={activa && bloqueo.configurado && bloqueo.bloqueado}>
          <Stack.Screen name="bloqueo" />
        </Stack.Protected>
        <Stack.Protected guard={activa && bloqueo.configurado && !bloqueo.bloqueado}>
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
        <BloqueoProvider>
          <Rutas />
        </BloqueoProvider>
      </SesionProvider>
    </TemaProvider>
  );
}
