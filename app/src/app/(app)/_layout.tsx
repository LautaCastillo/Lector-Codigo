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
        <Stack.Screen name="jornadas" options={{ title: 'Jornadas por área' }} />
        <Stack.Screen name="jornada/[id]" options={{ title: 'Jornada' }} />
        <Stack.Screen name="relevamientos" options={{ title: 'Mis relevamientos' }} />
        <Stack.Screen name="hallazgo/nuevo" options={{ title: 'Registrar hallazgo' }} />
        <Stack.Screen name="relevamiento/nuevo" options={{ title: 'Registrar relevamiento' }} />
        <Stack.Screen name="relevamiento/[id]" options={{ title: 'Relevamiento' }} />
        <Stack.Screen name="exportar" options={{ title: 'Exportar relevamientos' }} />
        <Stack.Screen name="lote" options={{ title: 'Lote por ubicación' }} />
        <Stack.Screen name="buscar" options={{ title: 'Buscar bienes' }} />
        <Stack.Screen name="explorar" options={{ title: 'Explorar bienes' }} />
        <Stack.Screen name="explorar-detalle" options={{ title: 'Bienes' }} />
        <Stack.Screen name="bien/[numero]" options={{ title: 'Ficha del bien' }} />
        <Stack.Screen name="cuentas" options={{ title: 'Cuentas' }} />
        <Stack.Screen name="cuenta-nueva" options={{ title: 'Nueva cuenta' }} />
        <Stack.Screen name="configurar-bloqueo" options={{ title: 'PIN de bloqueo' }} />
        <Stack.Screen name="historial-importaciones" options={{ title: 'Historial de cargas' }} />
        <Stack.Screen name="importar-catalogo" options={{ title: 'Importar catálogo' }} />
        <Stack.Screen name="actividad" options={{ title: 'Actividad' }} />
        <Stack.Screen name="perfil" options={{ title: 'Mi perfil' }} />
        <Stack.Screen name="ajustes" options={{ title: 'Ajustes' }} />
      </Stack>
    </ConMenu>
  );
}
