import type { Session } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';
import { marcarClaveCambiada, obtenerPerfil, type Perfil, registrarInicioDeSesion } from '../datos/cuentas';
import { borrarLoteGuardado } from '../funciones/lote/almacen';
import { supabase } from '../datos/supabase';
import { mensajeDeError } from '../compartido/formato';

// Permite entrar con un nombre de usuario (sin arroba) completando el dominio interno con el que el
// administrador crea las cuentas (ver la Edge Function `admin-cuentas`).
const DOMINIO_INTERNO = 'patrimonio.local';
const aCuenta = (usuario: string) => {
  const limpio = usuario.trim().toLowerCase();
  return limpio.includes('@') ? limpio : `${limpio}@${DOMINIO_INTERNO}`;
};

interface ContextoSesion {
  cargando: boolean;
  sesion: Session | null;
  perfil: Perfil | null;
  /** La sesión es válida pero la persona no tiene una cuenta habilitada en la aplicación. */
  sinCuenta: boolean;
  /** Mensaje si no se pudo consultar el perfil (por ejemplo, sin conexión). */
  errorPerfil: string | null;
  /** Devuelve un mensaje de error, o null si salió bien. */
  iniciarSesion: (usuario: string, clave: string) => Promise<string | null>;
  /** Cambia la contraseña y limpia la marca de "contraseña temporal". Devuelve un error, o null si salió bien. */
  cambiarClave: (clave: string) => Promise<string | null>;
  cerrarSesion: () => Promise<void>;
  recargarPerfil: () => Promise<void>;
}

const Contexto = createContext<ContextoSesion | null>(null);

function traducir(mensaje: string) {
  if (/invalid login credentials/i.test(mensaje)) return 'Usuario o contraseña incorrectos.';
  if (/same.*password|different from the old/i.test(mensaje)) return 'La contraseña nueva debe ser distinta de la actual.';
  if (/password.*(short|least|weak)/i.test(mensaje)) return 'La contraseña es demasiado débil.';
  if (/rate limit|too many/i.test(mensaje)) return 'Demasiados intentos. Probá de nuevo en unos minutos.';
  if (/network|fetch/i.test(mensaje)) return 'No hay conexión con el servidor.';
  return mensaje;
}

/** Mantiene la sesión de Supabase y el perfil de la cuenta (rol y estado) y los expone con `useSesion`. */
export function SesionProvider({ children }: { children: ReactNode }) {
  const [cargando, setCargando] = useState(true);
  const [sesion, setSesion] = useState<Session | null>(null);
  const [perfil, setPerfil] = useState<Perfil | null>(null);
  const [sinCuenta, setSinCuenta] = useState(false);
  const [errorPerfil, setErrorPerfil] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSesion(data.session);
      if (!data.session) setCargando(false);
    });
    const { data } = supabase.auth.onAuthStateChange((_evento, nueva) => {
      setSesion(nueva);
      if (!nueva) {
        setPerfil(null);
        setSinCuenta(false);
        setErrorPerfil(null);
        setCargando(false);
      }
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const usuarioId = sesion?.user.id;

  const recargarPerfil = useCallback(async () => {
    if (!usuarioId) return;
    setErrorPerfil(null);
    try {
      const encontrado = await obtenerPerfil(usuarioId);
      setPerfil(encontrado);
      setSinCuenta(!encontrado);
    } catch (error) {
      setPerfil(null);
      setErrorPerfil(traducir(mensajeDeError(error, 'Error de red')));
    } finally {
      setCargando(false);
    }
  }, [usuarioId]);

  useEffect(() => {
    if (usuarioId) void recargarPerfil();
  }, [usuarioId, recargarPerfil]);

  // Al volver a la app se vuelve a consultar la cuenta, así una suspensión se nota sin cerrar la app.
  // Los fallos (sin conexión, por ejemplo) se ignoran: no se expulsa a nadie por una red inestable.
  useEffect(() => {
    if (!usuarioId) return;
    const suscripcion = AppState.addEventListener('change', (estado) => {
      if (estado !== 'active') return;
      obtenerPerfil(usuarioId)
        .then((encontrado) => {
          if (encontrado) setPerfil(encontrado);
        })
        .catch(() => undefined);
    });
    return () => suscripcion.remove();
  }, [usuarioId]);

  const valor = useMemo<ContextoSesion>(
    () => ({
      cargando,
      sesion,
      perfil,
      sinCuenta,
      errorPerfil,
      recargarPerfil,
      iniciarSesion: async (usuario, clave) => {
        const { error } = await supabase.auth.signInWithPassword({ email: aCuenta(usuario), password: clave });
        if (error) return traducir(error.message);
        // Deja el evento de auditoría y el último acceso; si falla (por ejemplo, cuenta suspendida) no frena el ingreso.
        void registrarInicioDeSesion().catch(() => undefined);
        return null;
      },
      cambiarClave: async (clave) => {
        const { error } = await supabase.auth.updateUser({ password: clave });
        if (error) return traducir(error.message);
        try {
          await marcarClaveCambiada();
          await recargarPerfil();
        } catch (fallo) {
          return traducir(mensajeDeError(fallo, 'No se pudo confirmar el cambio.'));
        }
        return null;
      },
      cerrarSesion: async () => {
        await borrarLoteGuardado();
        await supabase.auth.signOut();
      },
    }),
    [cargando, sesion, perfil, sinCuenta, errorPerfil, recargarPerfil],
  );

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function useSesion() {
  const contexto = useContext(Contexto);
  if (!contexto) throw new Error('useSesion debe usarse dentro de SesionProvider');
  return contexto;
}
