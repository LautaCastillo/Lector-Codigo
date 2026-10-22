import type { Session } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { obtenerPerfil, type Perfil } from './api';
import { supabase } from './supabase';

// Provisorio: permite entrar con un nombre de usuario (sin arroba) completando un dominio interno.
// Se reemplaza por login con correo o nombre de usuario resuelto en el backend.
const DOMINIO_INTERNO = 'patrimonio.local';
const aCuenta = (usuario: string) => {
  const limpio = usuario.trim().toLowerCase();
  return limpio.includes('@') ? limpio : `${limpio}@${DOMINIO_INTERNO}`;
};

interface ContextoSesion {
  cargando: boolean;
  sesion: Session | null;
  perfil: Perfil | null;
  /** Mensaje si no se pudo consultar el perfil (por ejemplo, sin conexión). */
  errorPerfil: string | null;
  /** Devuelve un mensaje de error, o null si salió bien. */
  iniciarSesion: (usuario: string, clave: string) => Promise<string | null>;
  /** `confirmar` indica que falta confirmar el correo antes de poder entrar. */
  registrar: (
    nombre: string,
    correo: string,
    clave: string,
  ) => Promise<{ error: string | null; confirmar: boolean }>;
  /** Devuelve un mensaje de error, o null si salió bien. */
  cambiarClave: (clave: string) => Promise<string | null>;
  cerrarSesion: () => Promise<void>;
  recargarPerfil: () => Promise<void>;
}

const Contexto = createContext<ContextoSesion | null>(null);

function traducir(mensaje: string) {
  if (/invalid login credentials/i.test(mensaje)) return 'Usuario o contraseña incorrectos.';
  if (/already registered|already been registered/i.test(mensaje)) return 'Ese correo ya tiene una cuenta.';
  if (/password.*(short|least|weak)/i.test(mensaje)) return 'La contraseña es demasiado débil.';
  if (/rate limit|too many/i.test(mensaje)) return 'Demasiados intentos. Probá de nuevo en unos minutos.';
  if (/network|fetch/i.test(mensaje)) return 'No hay conexión con el servidor.';
  return mensaje;
}

export function SesionProvider({ children }: { children: ReactNode }) {
  const [cargando, setCargando] = useState(true);
  const [sesion, setSesion] = useState<Session | null>(null);
  const [perfil, setPerfil] = useState<Perfil | null>(null);
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
        setErrorPerfil(null);
        setCargando(false);
      }
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const recargarPerfil = useCallback(async () => {
    setErrorPerfil(null);
    try {
      setPerfil(await obtenerPerfil());
    } catch (error) {
      setPerfil(null);
      setErrorPerfil(traducir(error instanceof Error ? error.message : 'Error de red'));
    } finally {
      setCargando(false);
    }
  }, []);

  const usuarioId = sesion?.user.id;
  useEffect(() => {
    if (usuarioId) void recargarPerfil();
  }, [usuarioId, recargarPerfil]);

  const valor = useMemo<ContextoSesion>(
    () => ({
      cargando,
      sesion,
      perfil,
      errorPerfil,
      recargarPerfil,
      iniciarSesion: async (usuario, clave) => {
        const { error } = await supabase.auth.signInWithPassword({ email: aCuenta(usuario), password: clave });
        return error ? traducir(error.message) : null;
      },
      registrar: async (nombre, correo, clave) => {
        const { data, error } = await supabase.auth.signUp({
          email: correo.trim().toLowerCase(),
          password: clave,
          options: { data: { nombre: nombre.trim() } },
        });
        if (error) return { error: traducir(error.message), confirmar: false };
        return { error: null, confirmar: !data.session };
      },
      cambiarClave: async (clave) => {
        const { error } = await supabase.auth.updateUser({ password: clave });
        return error ? traducir(error.message) : null;
      },
      cerrarSesion: async () => {
        await supabase.auth.signOut();
      },
    }),
    [cargando, sesion, perfil, errorPerfil, recargarPerfil],
  );

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function useSesion() {
  const contexto = useContext(Contexto);
  if (!contexto) throw new Error('useSesion debe usarse dentro de SesionProvider');
  return contexto;
}
