// Importación del catálogo desde un archivo CSV o XLSX de SIU Diaguita (plan v3, fase 4, ADR 0003).
// El archivo se lee acá, en el teléfono; las filas viajan en tandas a las funciones de la base, que verifican que
// quien llama sea administrador. Un bien nunca se borra: se crean los nuevos y se actualizan los existentes.
import { leerArchivoCatalogo, type BienSiu, type ResultadoLectura } from '@patrimonio/shared';
import * as Crypto from 'expo-crypto';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystemLegacy from 'expo-file-system/legacy';
import { supabase } from './supabase';

/** La base acepta hasta 1000 filas por tanda; se usan menos para que cada pedido sea liviano. */
const TANDA = 500;

export interface ArchivoLeido extends ResultadoLectura {
  nombre: string;
  /** Huella SHA-256 del archivo, para dejar constancia de qué se cargó. */
  hash: string;
}

export interface Totales {
  nuevos: number;
  modificados: number;
  sinCambios: number;
}

const aHex = (bytes: ArrayBuffer) => Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, '0')).join('');

/**
 * Lee el contenido de lo que eligió la persona. En Android la dirección puede ser `content://` (el proveedor de archivos del
 * sistema), que la API nueva de archivos no puede abrir ("Missing READ permission"): `fetch` sí, y la API clásica es el respaldo.
 */
async function leerBytes(uri: string): Promise<Uint8Array<ArrayBuffer>> {
  try {
    const respuesta = await fetch(uri);
    return new Uint8Array(await respuesta.arrayBuffer());
  } catch {
    const base64 = await FileSystemLegacy.readAsStringAsync(uri, { encoding: FileSystemLegacy.EncodingType.Base64 });
    return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0)) as Uint8Array<ArrayBuffer>;
  }
}

/** Abre el selector de archivos. Devuelve null si la persona cancela. */
export async function elegirArchivo(): Promise<ArchivoLeido | null> {
  const elegido = await DocumentPicker.getDocumentAsync({
    // Los listados de SIU llegan con extensión .xls aunque sean xlsx; muchos teléfonos los tipifican de formas distintas.
    type: ['*/*'],
    copyToCacheDirectory: true,
    multiple: false,
  });
  const archivo = elegido.canceled ? null : elegido.assets[0];
  if (!archivo) return null;
  const bytes = await leerBytes(archivo.uri);
  if (bytes.length === 0) throw new Error('El archivo está vacío.');
  const lectura = leerArchivoCatalogo(bytes);
  if (lectura.bienes.length === 0) throw new Error('El archivo no tiene bienes con número patrimonial.');
  const hash = aHex(await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, bytes));
  return { ...lectura, nombre: archivo.name, hash };
}

/** Prepara una fila para la base: lo que no tiene valor viaja como null. */
const aFila = (b: BienSiu) => ({ ...b });

/**
 * Recorre el listado en tandas. `modo` 'previsualizar' solo cuenta; 'aplicar' además escribe. `columnas` son las que trae el
 * archivo: las demás no se tocan en el catálogo (un reporte de un área, por ejemplo, no trae el estado).
 */
export async function procesar(
  bienes: BienSiu[],
  columnas: (keyof BienSiu)[],
  modo: 'previsualizar' | 'aplicar',
  alAvanzar?: (hechos: number, total: number) => void,
): Promise<Totales> {
  const totales: Totales = { nuevos: 0, modificados: 0, sinCambios: 0 };
  for (let i = 0; i < bienes.length; i += TANDA) {
    const { data, error } = await supabase.rpc('importar_catalogo', { p_filas: bienes.slice(i, i + TANDA).map(aFila), p_modo: modo, p_columnas: columnas });
    if (error) throw new Error(error.message);
    const fila = (data as Totales[] | null)?.[0];
    if (!fila) throw new Error('La base no devolvió el resultado de la tanda.');
    totales.nuevos += fila.nuevos;
    totales.modificados += fila.modificados;
    totales.sinCambios += fila.sinCambios;
    alAvanzar?.(Math.min(i + TANDA, bienes.length), bienes.length);
  }
  return totales;
}

/** Deja la constancia de la carga (archivo, huella y totales) y el evento de auditoría. */
export async function registrarCarga(archivo: ArchivoLeido, totales: Totales): Promise<void> {
  const { error } = await supabase.rpc('registrar_importacion_catalogo', {
    p_archivo: archivo.nombre,
    p_hash: archivo.hash,
    p_filas: archivo.bienes.length,
    p_nuevos: totales.nuevos,
    p_modificados: totales.modificados,
    p_sin_cambios: totales.sinCambios,
    p_areas: [...new Set(archivo.bienes.map((b) => b.areaResponsable).filter((a): a is string => !!a))],
  });
  if (error) throw new Error(error.message);
}

/** Una carga del catálogo, tal como figura en el historial que ve todo el equipo. */
export interface Importacion {
  id: string;
  archivo: string;
  hashSha256: string;
  filas: number;
  nuevos: number;
  modificados: number;
  sinCambios: number;
  /** Áreas que traía el archivo (las cargas anteriores a este registro no la guardaron). */
  areas: string[] | null;
  creadoEn: string;
  usuario: string;
}

/** Las cargas del catálogo, de la más reciente a la más antigua. Cualquier cuenta activa puede verlas. */
export async function historialImportaciones(limite = 100): Promise<Importacion[]> {
  const { data, error } = await supabase.rpc('historial_importaciones', { p_limite: limite });
  if (error) throw new Error(error.message);
  return ((data ?? []) as Importacion[]).map((f) => ({ ...f, creadoEn: new Date(f.creadoEn).toISOString() }));
}
