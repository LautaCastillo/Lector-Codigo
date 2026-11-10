// Avisos: lo que a cada persona le conviene saber (se abrió o cerró una jornada, hay una discrepancia, le asignaron una tarea).
// Los arma la base y cada cuenta ve solo los suyos.
import { conCopiaLocal } from './red';
import { supabase } from './supabase';
import { comprobar, type Fila } from './util';

export type TipoAviso = 'jornada_abierta' | 'jornada_cerrada' | 'discrepancia' | 'tarea_asignada';

export interface Aviso {
  id: string;
  tipo: TipoAviso;
  titulo: string;
  detalle: string | null;
  jornadaId: string | null;
  bienId: string | null;
  tareaId: string | null;
  creadoEn: string;
  leido: boolean;
}

const COLUMNAS = 'id, tipo, titulo, detalle, jornadaId, bienId, tareaId, creadoEn, leidoEn';

function aAviso(f: Fila): Aviso {
  return {
    id: f.id as string,
    tipo: f.tipo as TipoAviso,
    titulo: f.titulo as string,
    detalle: (f.detalle as string | null) ?? null,
    jornadaId: (f.jornadaId as string | null) ?? null,
    bienId: (f.bienId as string | null) ?? null,
    tareaId: (f.tareaId as string | null) ?? null,
    creadoEn: new Date(f.creadoEn as string).toISOString(),
    leido: !!f.leidoEn,
  };
}

/** Los avisos propios, del más nuevo al más viejo (hasta 100). Sin red devuelve la última copia. */
export function listarAvisos(): Promise<Aviso[]> {
  return conCopiaLocal('avisos', async () => {
    const filas = comprobar(await supabase.from('aviso').select(COLUMNAS).order('creadoEn', { ascending: false }).limit(100)) as Fila[];
    return filas.map(aAviso);
  });
}

/** Cuántos avisos propios todavía no se leyeron. */
export async function contarAvisosSinLeer(): Promise<number> {
  const { count, error } = await supabase.from('aviso').select('id', { count: 'exact', head: true }).is('leidoEn', null);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

/** Marca como leídos los avisos indicados, o todos si no se indica ninguno. Devuelve cuántos marcó. */
export async function marcarAvisosLeidos(ids?: string[]): Promise<number> {
  const { data, error } = await supabase.rpc('marcar_avisos_leidos', { p_ids: ids ?? null });
  if (error) throw new Error(error.message);
  return (data as number) ?? 0;
}

/**
 * Llama a `alLlegar` cada vez que llega un aviso nuevo mientras la app está abierta. Devuelve la función que cancela la suscripción.
 * La base entrega solo los avisos de la cuenta con sesión abierta.
 */
export function suscribirseAAvisos(alLlegar: (aviso: Aviso) => void): () => void {
  const canal = supabase
    .channel(`avisos-${Date.now()}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'aviso' }, (payload) => alLlegar(aAviso(payload.new as Fila)))
    .subscribe();
  return () => {
    void supabase.removeChannel(canal);
  };
}
