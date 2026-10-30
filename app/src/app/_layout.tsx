import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Bienvenida } from '../compartido/bienvenida';
import { Cargando } from '../compartido/ui';
import { BloqueoProvider, useBloqueo } from '../sesion/bloqueo';
import { SesionProvider, useSesion } from '../sesion/sesion';
import { TemaProvider, useTema } from '../compartido/tema';
import Login from './(auth)/login';
import Bloqueo from './bloqueo';
import CambiarClave from './cambiar-clave';
import EstadoCuenta from './estado-cuenta';

const DURACION_BIENVENIDA_MS = 1800;

/**
 * Decide qué se ve según la sesión. Las pantallas previas a la app (ingreso, cuenta sin habilitar, cambio de
 * contraseña y bloqueo) se muestran como componentes y no como rutas: así, al recargar la app o volver de un
 * bloqueo, la URL inicial ("/") nunca queda sin una ruta accesible (expo-router 58 mostraba "Unmatched Route").
 * El Stack con las rutas de la app solo existe cuando la persona puede usarla.
 */
function Rutas() {
  const { cargando, sesion, perfil } = useSesion();
  const { esOscuro, c } = useTema();
  const bloqueo = useBloqueo();
  // Al abrir la app se muestra unos instantes la bienvenida; mientras tanto se recupera la sesión.
  const [bienvenida, setBienvenida] = useState(true);
  useEffect(() => {
    const temporizador = setTimeout(() => setBienvenida(false), DURACION_BIENVENIDA_MS);
    return () => clearTimeout(temporizador);
  }, []);
  const activa = !!perfil?.activo;
  // El PIN es opcional: se activa desde Ajustes. Con uno configurado, la app arranca bloqueada.
  const bloqueada = activa && !perfil?.debeCambiarClave && bloqueo.configurado && bloqueo.bloqueado;

  let contenido;
  if (bienvenida) contenido = <Bienvenida />;
  else if (cargando || (activa && bloqueo.cargando)) contenido = <Cargando />;
  else if (!sesion) contenido = <Login />;
  else if (!activa) contenido = <EstadoCuenta />;
  else if (perfil?.debeCambiarClave) contenido = <CambiarClave />;
  else if (bloqueada) contenido = <Bloqueo />;
  else
    contenido = (
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(app)" />
      </Stack>
    );

  return (
    <View style={{ flex: 1, backgroundColor: c.fondo }}>
      <StatusBar style={esOscuro ? 'light' : 'dark'} />
      {contenido}
    </View>
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
