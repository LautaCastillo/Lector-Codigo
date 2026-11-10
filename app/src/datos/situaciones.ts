// Situación administrativa de un bien ("en reparación", "para baja", "prestado"): la declara y la levanta un administrador, con motivo.
// Las situaciones no se borran: la vigente es la que no tiene fecha de levantada, y las demás quedan como historial.
import type { SituacionBien } from '../compartido/formato';
import { supabase } from './supabase';
import { comprobar, type Fila } from './util';

export interface SituacionDeBien {
  id: string;
  situacion: SituacionBien;
  motivo: string;
  declaradaPor: string;
  declaradaEn: string;
  levantadaPor: string | null;
  levantadaEn: string | null;
  motivoLevantada: string | null;
  /** Sigue vigente (todavía no se levantó). */
  vigente: boolean;
}

const quien = (u: unknown) => {
  const usuario = u as { cuenta: string; nombre: string | null } | null;
  return usuario ? (usuario.nombre ?? usuario.cuenta) : '';
};

/** Las situaciones de un bien, la vigente primero y después las anteriores de la más nueva a la más vieja. */
export async function situacionesDeBien(bienId: string): Promise<SituacionDeBien[]> {
  const filas = comprobar(
    await supabase
      .from('situacion_bien')
      .select('id, situacion, motivo, declaradaEn, levantadaEn, motivoLevantada, declarante:usuario!declaradaPor(cuenta, nombre), levantador:usuario!levantadaPor(cuenta, nombre)')
      .eq('bienId', bienId)
      .order('declaradaEn', { ascending: false }),
  ) as Fila[];
  return filas
    .map((f) => ({
      id: f.id as string,
      situacion: f.situacion as SituacionBien,
      motivo: f.motivo as string,
      declaradaPor: quien(f.declarante),
      declaradaEn: new Date(f.declaradaEn as string).toISOString(),
      levantadaPor: f.levantador ? quien(f.levantador) : null,
      levantadaEn: f.levantadaEn ? new Date(f.levantadaEn as string).toISOString() : null,
      motivoLevantada: (f.motivoLevantada as string | null) ?? null,
      vigente: !f.levantadaEn,
    }))
    .sort((a, b) => Number(b.vigente) - Number(a.vigente));
}

/** Solo administradores. Si el bien ya tenía otra situación, esa se levanta y queda en el historial. */
export async function declararSituacion(bienId: string, situacion: SituacionBien, motivo: string): Promise<void> {
  const { error } = await supabase.rpc('declarar_situacion', { p_bien_id: bienId, p_situacion: situacion, p_motivo: motivo.trim() });
  if (error) throw new Error(error.message);
}

/** Solo administradores. El motivo es opcional. */
export async function levantarSituacion(bienId: string, motivo: string): Promise<void> {
  const { error } = await supabase.rpc('levantar_situacion', { p_bien_id: bienId, p_motivo: motivo.trim() || null });
  if (error) throw new Error(error.message);
}
