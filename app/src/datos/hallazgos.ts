// Hallazgos: la foto (bucket privado de Storage) y el vínculo posterior con el bien del catálogo.
import type { RelevamientoRegistradoDto } from '@patrimonio/shared';
import * as Crypto from 'expo-crypto';
import type { File } from 'expo-file-system';
import { buscarPorInventario } from './catalogo';
import { miId } from './cuentas';
import { obtenerRelevamiento } from './relevamientos';
import { supabase } from './supabase';
import { comprobar, ErrorApi } from './util';

const aHex = (bytes: ArrayBuffer) => Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, '0')).join('');

/**
 * Sube la foto (un JPEG ya reducido) de un hallazgo propio al bucket privado y la adjunta al registro.
 * Es idempotente: si el archivo ya estaba subido o el hallazgo ya tiene foto, no se pisa nada.
 */
export async function subirFotoDeHallazgo(idCliente: string, foto: File): Promise<void> {
  const yo = await miId();
  const bytes = await foto.arrayBuffer();
  const ruta = `${yo}/${idCliente}.jpg`;
  const { error } = await supabase.storage.from('hallazgos').upload(ruta, bytes, { contentType: 'image/jpeg', upsert: false });
  // Si ya estaba subida (un reintento), se sigue con el adjunto.
  if (error && !/already exists|duplicate|409/i.test(`${error.message} ${(error as { statusCode?: string }).statusCode ?? ''}`)) {
    throw new Error(error.message);
  }
  const hash = aHex(await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, bytes));
  const respuesta = await supabase.rpc('adjuntar_foto', { p_id_cliente: idCliente, p_tamano: bytes.byteLength, p_hash: hash });
  if (respuesta.error) throw new Error(respuesta.error.message);
}

/** Dirección temporal (5 minutos) para mostrar la foto de un hallazgo; solo la ven su dueño y los administradores. */
export async function fotoDeRelevamiento(id: string): Promise<{ uri: string; headers: Record<string, string> } | null> {
  const fila = comprobar(await supabase.from('relevamiento').select('fotoPath').eq('id', id).maybeSingle()) as { fotoPath: string | null } | null;
  if (!fila?.fotoPath) return null;
  const { data, error } = await supabase.storage.from('hallazgos').createSignedUrl(fila.fotoPath, 300);
  if (error || !data) throw new Error(error?.message ?? 'No se pudo abrir la foto.');
  return { uri: data.signedUrl, headers: {} };
}

/** Solo administradores: asocia un hallazgo con el bien del catálogo al que corresponde. */
export async function vincularHallazgo(id: string, numeroInventario: string, motivo: string): Promise<RelevamientoRegistradoDto> {
  const bien = await buscarPorInventario(numeroInventario);
  if (!bien) throw new ErrorApi(404, 'El bien no existe en el catálogo.');
  const { error } = await supabase.rpc('vincular_hallazgo', { p_id: id, p_bien_id: bien.id, p_motivo: motivo });
  if (error) throw new Error(error.message);
  return obtenerRelevamiento(id);
}
