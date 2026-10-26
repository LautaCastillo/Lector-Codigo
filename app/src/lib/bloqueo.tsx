import * as Crypto from 'expo-crypto';
import * as LocalAuthentication from 'expo-local-authentication';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';
import { borrarSecreto, guardarSecreto, leerSecreto } from './almacen-seguro';
import { useSesion } from './sesion';

/** Con el PIN activado (es opcional), tras este tiempo en segundo plano la app vuelve a pedirlo. También se pide en cada arranque en frío. */
const SEGUNDOS_EN_SEGUNDO_PLANO = 5 * 60;
export const LARGO_PIN = 6;
const MAX_INTENTOS = 5;

const CLAVE_CONFIG = 'bloqueo.config';
const CLAVE_INTENTOS = 'bloqueo.intentos';

interface Config {
  /** El bloqueo pertenece a la cuenta que lo configuró; con otra cuenta se descarta. */
  usuarioId: string;
  salt: string;
  hash: string;
  biometria: boolean;
}

export type ResultadoPin = 'ok' | 'incorrecto' | 'sesion_cerrada';

interface ContextoBloqueo {
  cargando: boolean;
  configurado: boolean;
  bloqueado: boolean;
  biometriaDisponible: boolean;
  biometriaActiva: boolean;
  intentosRestantes: number;
  configurar: (pin: string, biometria: boolean) => Promise<void>;
  /** Quita el PIN: la app deja de bloquearse. */
  desactivar: () => Promise<void>;
  desbloquearConPin: (pin: string) => Promise<ResultadoPin>;
  desbloquearConBiometria: () => Promise<boolean>;
}

const Contexto = createContext<ContextoBloqueo | null>(null);

const resumen = (salt: string, pin: string) =>
  Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, `${salt}:${pin}`);

/** PINs triviales que no se aceptan: repetidos o en secuencia. */
export function pinDebil(pin: string) {
  return /^(\d)\1+$/.test(pin) || '0123456789'.includes(pin) || '9876543210'.includes(pin);
}

export function BloqueoProvider({ children }: { children: ReactNode }) {
  const { sesion, cargando: cargandoSesion, cerrarSesion } = useSesion();
  const usuarioId = sesion?.user.id;
  const [cargando, setCargando] = useState(true);
  const [config, setConfig] = useState<Config | null>(null);
  const [bloqueado, setBloqueado] = useState(true);
  const [biometriaDisponible, setBiometriaDisponible] = useState(false);
  const [intentos, setIntentos] = useState(0);
  const pasoAFondo = useRef<number | null>(null);

  // Lee el bloqueo guardado cada vez que cambia la cuenta. Toda sesión nueva arranca bloqueada.
  useEffect(() => {
    // Mientras no hay sesión (o todavía se está recuperando al arrancar) no se toca lo guardado.
    if (!usuarioId) return;
    let vigente = true;
    setCargando(true);
    setBloqueado(true);
    (async () => {
      const [crudo, crudoIntentos, hardware, registrada] = await Promise.all([
        leerSecreto(CLAVE_CONFIG),
        leerSecreto(CLAVE_INTENTOS),
        LocalAuthentication.hasHardwareAsync().catch(() => false),
        LocalAuthentication.isEnrolledAsync().catch(() => false),
      ]);
      if (!vigente) return;
      let guardada: Config | null = null;
      try {
        guardada = crudo ? (JSON.parse(crudo) as Config) : null;
      } catch {
        guardada = null;
      }
      if (guardada && guardada.usuarioId !== usuarioId) {
        guardada = null;
        await Promise.all([borrarSecreto(CLAVE_CONFIG), borrarSecreto(CLAVE_INTENTOS)]);
      }
      setConfig(guardada);
      setIntentos(Number(crudoIntentos) || 0);
      setBiometriaDisponible(hardware && registrada);
      setCargando(false);
    })().catch(() => vigente && setCargando(false));
    return () => {
      vigente = false;
    };
  }, [usuarioId]);

  // Si se cierra la sesión, el bloqueo guardado deja de tener sentido. `cargandoSesion` evita borrarlo
  // en el arranque, antes de que se recupere la sesión guardada.
  useEffect(() => {
    if (cargandoSesion || usuarioId) return;
    setConfig(null);
    void Promise.all([borrarSecreto(CLAVE_CONFIG), borrarSecreto(CLAVE_INTENTOS)]);
  }, [cargandoSesion, usuarioId]);

  // Vuelve a bloquear si la app estuvo en segundo plano más de SEGUNDOS_EN_SEGUNDO_PLANO.
  useEffect(() => {
    const suscripcion = AppState.addEventListener('change', (estado) => {
      if (estado === 'background') pasoAFondo.current = Date.now();
      else if (estado === 'active' && pasoAFondo.current !== null) {
        if (Date.now() - pasoAFondo.current > SEGUNDOS_EN_SEGUNDO_PLANO * 1000) setBloqueado(true);
        pasoAFondo.current = null;
      }
    });
    return () => suscripcion.remove();
  }, []);

  const configurar = useCallback(
    async (pin: string, biometria: boolean) => {
      if (!usuarioId) return;
      const salt = Array.from(Crypto.getRandomBytes(16), (b) => b.toString(16).padStart(2, '0')).join('');
      const nueva: Config = { usuarioId, salt, hash: await resumen(salt, pin), biometria };
      await guardarSecreto(CLAVE_CONFIG, JSON.stringify(nueva));
      await borrarSecreto(CLAVE_INTENTOS);
      setConfig(nueva);
      setIntentos(0);
      setBloqueado(false);
    },
    [usuarioId],
  );

  const desactivar = useCallback(async () => {
    await Promise.all([borrarSecreto(CLAVE_CONFIG), borrarSecreto(CLAVE_INTENTOS)]);
    setConfig(null);
    setIntentos(0);
  }, []);

  const desbloquearConPin = useCallback(
    async (pin: string): Promise<ResultadoPin> => {
      if (!config) return 'incorrecto';
      if ((await resumen(config.salt, pin)) === config.hash) {
        await borrarSecreto(CLAVE_INTENTOS);
        setIntentos(0);
        setBloqueado(false);
        return 'ok';
      }
      const fallidos = intentos + 1;
      setIntentos(fallidos);
      if (fallidos >= MAX_INTENTOS) {
        // Demasiados intentos: se cierra la sesión y hay que volver a ingresar con la contraseña.
        await cerrarSesion();
        return 'sesion_cerrada';
      }
      await guardarSecreto(CLAVE_INTENTOS, String(fallidos));
      return 'incorrecto';
    },
    [config, intentos, cerrarSesion],
  );

  const desbloquearConBiometria = useCallback(async () => {
    if (!config?.biometria) return false;
    const resultado = await LocalAuthentication.authenticateAsync({
      promptMessage: 'Desbloquear Inventario Patrimonio',
      cancelLabel: 'Usar PIN',
      // Sin alternativa del sistema: el respaldo es nuestro PIN, no el patrón o PIN del teléfono.
      disableDeviceFallback: true,
    }).catch(() => ({ success: false as const }));
    if (resultado.success) setBloqueado(false);
    return resultado.success;
  }, [config]);

  const valor = useMemo<ContextoBloqueo>(
    () => ({
      cargando,
      configurado: !!config,
      bloqueado,
      biometriaDisponible,
      biometriaActiva: !!config?.biometria && biometriaDisponible,
      intentosRestantes: MAX_INTENTOS - intentos,
      configurar,
      desactivar,
      desbloquearConPin,
      desbloquearConBiometria,
    }),
    [cargando, config, bloqueado, biometriaDisponible, intentos, configurar, desactivar, desbloquearConPin, desbloquearConBiometria],
  );

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function useBloqueo() {
  const contexto = useContext(Contexto);
  if (!contexto) throw new Error('useBloqueo debe usarse dentro de BloqueoProvider');
  return contexto;
}
