import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Lote } from './lote';

/**
 * El lote en curso se guarda en el teléfono para no perder el trabajo si la app se bloquea, se cierra
 * o se queda sin batería. Es un único lote a la vez. No se envía al servidor.
 */
const CLAVE = 'lote-en-curso';

export async function guardarLote(lote: Lote | null) {
  try {
    if (lote) await AsyncStorage.setItem(CLAVE, JSON.stringify(lote));
    else await AsyncStorage.removeItem(CLAVE);
  } catch {
    // Si no se puede guardar, el lote sigue funcionando en memoria.
  }
}

export async function cargarLote(): Promise<Lote | null> {
  try {
    const crudo = await AsyncStorage.getItem(CLAVE);
    const lote = crudo ? (JSON.parse(crudo) as Lote) : null;
    return lote && Array.isArray(lote.items) && Array.isArray(lote.esperados) ? lote : null;
  } catch {
    return null;
  }
}

/** Se llama al cerrar sesión: no deben quedar datos de bienes de la sesión anterior. */
export const borrarLoteGuardado = () => guardarLote(null);
