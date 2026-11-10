// Comentarios en un bien o en una jornada: notas con autor y fecha. Cualquier cuenta activa comenta y todas los ven.
// No se editan ni se borran: quien lo escribió (o un administrador) puede retirarlo y deja de mostrarse.
import { miId } from './cuentas';
import { supabase } from './supabase';
import { comprobar, type Fila } from './util';

export interface Comentario {
  id: string;
  texto: string;
  autor: string;
  propio: boolean;
  creadoEn: string;
  /** El bien al que se refiere, si el comentario es sobre un bien (para mostrarlo en la lista de una jornada). */
  bien: { numeroInventario: string; descripcion: string | null } | null;
}

export type DestinoComentario = { bienId: string; jornadaId?: undefined } | { jornadaId: string; bienId?: undefined };

const COLUMNAS = 'id, texto, creadoEn, autorId, autor:usuario!autorId(cuenta, nombre), bien:bien(numeroInventario, descripcion)';

/** Los comentarios vigentes (no retirados) de un bien o de una jornada, del más nuevo al más viejo. */
export async function comentariosDe(destino: DestinoComentario): Promise<Comentario[]> {
  const yo = await miId();
  const consulta = supabase.from('comentario').select(COLUMNAS).is('retiradoEn', null);
  const filas = comprobar(
    await (destino.bienId ? consulta.eq('bienId', destino.bienId) : consulta.eq('jornadaId', destino.jornadaId!)).order('creadoEn', { ascending: false }).limit(200),
  ) as Fila[];
  return filas.map((f) => {
    const autor = f.autor as { cuenta: string; nombre: string | null } | null;
    return {
      id: f.id as string,
      texto: f.texto as string,
      autor: autor ? (autor.nombre ?? autor.cuenta) : '',
      propio: f.autorId === yo,
      creadoEn: new Date(f.creadoEn as string).toISOString(),
      bien: (f.bien as Comentario['bien']) ?? null,
    };
  });
}

/** Cuántos comentarios vigentes tiene una jornada. */
export async function contarComentariosDeJornada(jornadaId: string): Promise<number> {
  const { count, error } = await supabase.from('comentario').select('id', { count: 'exact', head: true }).eq('jornadaId', jornadaId).is('retiradoEn', null);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

/** Escribe un comentario. Reintentar con el mismo `idCliente` no duplica (si el envío falló a medias, se puede volver a mandar). */
export async function comentar(destino: DestinoComentario, texto: string, idCliente: string): Promise<void> {
  const { error } = await supabase.rpc('comentar', {
    p_bien_id: destino.bienId ?? null,
    p_jornada_id: destino.jornadaId ?? null,
    p_texto: texto.trim(),
    p_id_cliente: idCliente,
  });
  if (error) throw new Error(error.message);
}

/** Quien lo escribió o un administrador. El comentario deja de mostrarse; queda registrado quién lo retiró y cuándo. */
export async function retirarComentario(id: string): Promise<void> {
  const { error } = await supabase.rpc('retirar_comentario', { p_id: id });
  if (error) throw new Error(error.message);
}
