import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

/**
 * Almacén de la sesión de Supabase (access y refresh token) en el almacén seguro del sistema
 * (Keystore en Android, Keychain en iOS), no en AsyncStorage. Los valores se parten en trozos porque
 * una sesión puede superar el límite de tamaño por valor de SecureStore.
 */
const OPCIONES: SecureStore.SecureStoreOptions = {
  // Disponible tras el primer desbloqueo del equipo (hace falta para renovar el token en segundo plano)
  // y sin migrar a otro dispositivo en un respaldo.
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
};
const TROZO = 1000;

const claveTrozo = (clave: string, i: number) => `${clave}.${i}`;
const claveCantidad = (clave: string) => `${clave}.n`;

async function cantidad(clave: string) {
  const n = Number(await SecureStore.getItemAsync(claveCantidad(clave), OPCIONES));
  return Number.isInteger(n) && n > 0 ? n : 0;
}

async function leer(clave: string): Promise<string | null> {
  const n = await cantidad(clave);
  if (!n) return null;
  const trozos = await Promise.all(
    Array.from({ length: n }, (_, i) => SecureStore.getItemAsync(claveTrozo(clave, i), OPCIONES)),
  );
  return trozos.includes(null) ? null : trozos.join('');
}

async function escribir(clave: string, valor: string) {
  // El indicador `u` parte por caracteres Unicode completos, sin cortar un par sustituto.
  const trozos = valor.match(new RegExp(`[\\s\\S]{1,${TROZO}}`, 'gu')) ?? [''];
  const anteriores = await cantidad(clave);
  await Promise.all(trozos.map((t, i) => SecureStore.setItemAsync(claveTrozo(clave, i), t, OPCIONES)));
  await SecureStore.setItemAsync(claveCantidad(clave), String(trozos.length), OPCIONES);
  for (let i = trozos.length; i < anteriores; i += 1) {
    await SecureStore.deleteItemAsync(claveTrozo(clave, i), OPCIONES);
  }
}

async function borrar(clave: string) {
  const n = await cantidad(clave);
  for (let i = 0; i < n; i += 1) await SecureStore.deleteItemAsync(claveTrozo(clave, i), OPCIONES);
  await SecureStore.deleteItemAsync(claveCantidad(clave), OPCIONES);
}

/** Interfaz de almacenamiento que espera supabase-js. */
export const almacenSeguro = {
  async getItem(clave: string) {
    const guardado = await leer(clave);
    if (guardado !== null) return guardado;
    // Migración única: la versión anterior guardaba la sesión en AsyncStorage (sin cifrar).
    const antiguo = await AsyncStorage.getItem(clave);
    if (antiguo !== null) {
      await escribir(clave, antiguo);
      await AsyncStorage.removeItem(clave);
    }
    return antiguo;
  },
  setItem: escribir,
  async removeItem(clave: string) {
    await borrar(clave);
    await AsyncStorage.removeItem(clave);
  },
};

/** Valores sueltos y chicos (configuración del bloqueo, contador de intentos). */
export const guardarSecreto = (clave: string, valor: string) => SecureStore.setItemAsync(clave, valor, OPCIONES);
export const leerSecreto = (clave: string) => SecureStore.getItemAsync(clave, OPCIONES);
export const borrarSecreto = (clave: string) => SecureStore.deleteItemAsync(clave, OPCIONES);
