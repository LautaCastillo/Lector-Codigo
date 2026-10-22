import { Stack } from 'expo-router';
import { ConMenu } from '../../components/menu';
import { useTema } from '../../lib/tema';

export default function LayoutApp() {
  const { c } = useTema();
  return (
    <ConMenu>
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: c.primario },
          headerTintColor: c.sobrePrimario,
          headerTitleStyle: { fontWeight: '700' },
          contentStyle: { backgroundColor: c.fondo },
        }}
      >
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="escanear" options={{ title: 'Escanear bien' }} />
        <Stack.Screen name="perfil" options={{ title: 'Mi perfil' }} />
        <Stack.Screen name="ajustes" options={{ title: 'Ajustes' }} />
      </Stack>
    </ConMenu>
  );
}
