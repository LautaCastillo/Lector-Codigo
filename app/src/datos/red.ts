// Estado de la conexión y copia local de lo último que se pudo leer, para seguir trabajando donde no hay señal.
// No usa ningún módulo nativo: la conexión se deduce de si los pedidos al servidor llegan o no.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';
import { esFalloDeRed } from './util';

let sinRed = false;
const oyentes = new Set<() => void>();

/** Registra el resultado del último intento de hablar con el servidor. Avisa solo si cambió. */
export function marcarRed(hay: boolean) {
  if (sinRed === !hay) return;
  sinRed = !hay;
  oyentes.forEach((f) => f());
}

const suscribirRed = (f: () => void) => {
  oyentes.add(f);
  return () => {
    oyentes.delete(f);
  };
};

export const estaSinRed = () => sinRed;

/** `true` mientras el último pedido al servidor haya fallado por la red. */
export const useSinRed = () => useSyncExternalStore(suscribirRed, () => sinRed);

/** Rechaza con un error de red si la promesa tarda más de `ms`: evita que una conexión colgada frene la cámara. */
export function conLimite<T>(promesa: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolver, rechazar) => {
    const t = setTimeout(() => rechazar(new Error('timed out')), ms);
    promesa.then(
      (v) => {
        clearTimeout(t);
        resolver(v);
      },
      (e) => {
        clearTimeout(t);
        rechazar(e);
      },
    );
  });
}

/** Pregunta al servidor si responde (cualquier respuesta cuenta: solo un corte de red cuenta como "sin conexión"). */
export async function comprobarRed(): Promise<boolean> {
  const control = new AbortController();
  const corte = setTimeout(() => control.abort(), 5000);
  try {
    await fetch(process.env.EXPO_PUBLIC_SUPABASE_URL ?? '', { method: 'HEAD', signal: control.signal });
    marcarRed(true);
    return true;
  } catch {
    marcarRed(false);
    return false;
  } finally {
    clearTimeout(corte);
  }
}

const PREFIJO = 'copia:';

/**
 * Pide los datos al servidor y guarda una copia en el teléfono. Si no hay red devuelve la última copia (si la hay);
 * cualquier otro error se propaga igual.
 */
export async function conCopiaLocal<T>(clave: string, pedir: () => Promise<T>): Promise<T> {
  try {
    const datos = await pedir();
    marcarRed(true);
    AsyncStorage.setItem(PREFIJO + clave, JSON.stringify(datos)).catch(() => undefined);
    return datos;
  } catch (error) {
    if (!esFalloDeRed(error)) throw error;
    marcarRed(false);
    try {
      const copia = await AsyncStorage.getItem(PREFIJO + clave);
      if (copia !== null) return JSON.parse(copia) as T;
    } catch {
      // Sin copia legible: se informa el fallo original.
    }
    throw error;
  }
}

/** Se llama al cerrar sesión: no deben quedar datos de bienes ni de compañeros de la sesión anterior. */
export async function borrarCopiasLocales() {
  try {
    const claves = (await AsyncStorage.getAllKeys()).filter((k) => k.startsWith(PREFIJO));
    if (claves.length) await AsyncStorage.multiRemove(claves);
  } catch {
    // Si no se puede borrar, no se bloquea el cierre de sesión.
  }
}
