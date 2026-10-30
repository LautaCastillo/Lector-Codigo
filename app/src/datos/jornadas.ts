// Jornadas compartidas por área o ubicación (plan v3, fase 5): abrir, cerrar, avance y cambios en tiempo real.
import type { ResultadoRelevamiento } from '@patrimonio/shared';
import { supabase } from './supabase';
import { aIso, comprobar } from './util';

export interface Jornada {
  id: string;
  tipo: 'area' | 'ubicacion';
  alcance: string;
  nombre: string | null;
  estado: 'abierta' | 'cerrada';
  creadaPor: string;
  creadoEn: string;
  cerradaEn: string | null;
  esperados: number;
  encontrados: number;
  propia: boolean;
}

/** Una fila del avance: un bien esperado (con o sin relevar) o algo que apareció y no era del alcance de la jornada. */
export interface FilaAvance {
  tipo: 'esperado' | 'extra';
  relevamientoId: string | null;
  bienId: string | null;
  numeroInventario: string | null;
  descripcion: string | null;
  ubicacionFisica: string | null;
  areaResponsable: string | null;
  responsableUso: string | null;
  estadoBien: string | null;
  encontrado: boolean;
  resultado: ResultadoRelevamiento | null;
  ubicacionObservada: string | null;
  relevador: string | null;
  relevadoEn: string | null;
  /** Se lo encontró en una ubicación distinta de la que dice el catálogo. */
  fueraDeLugar: boolean;
  /** Cuántas lecturas "encontrado" tiene el bien en la jornada. */
  lecturas: number;
  /** Otras personas que también lo leyeron; `relevador` es quien llegó primero. */
  tambienVieron: string[];
  /** Las lecturas del bien no coinciden (otro resultado u otra ubicación): conviene revisarlo. */
  discrepancia: boolean;
}

/** Las jornadas, de la más reciente a la más antigua, con su avance. */
export async function listarJornadas(estado?: 'abierta' | 'cerrada'): Promise<Jornada[]> {
  const filas = (comprobar(await supabase.rpc('listar_jornadas', { p_estado: estado ?? null, p_id: null })) ?? []) as Jornada[];
  return filas.map((j) => ({ ...j, creadoEn: new Date(j.creadoEn).toISOString(), cerradaEn: j.cerradaEn ? new Date(j.cerradaEn).toISOString() : null }));
}

export async function obtenerJornada(id: string): Promise<Jornada | null> {
  const filas = (comprobar(await supabase.rpc('listar_jornadas', { p_estado: null, p_id: id })) ?? []) as Jornada[];
  const j = filas[0];
  return j ? { ...j, creadoEn: new Date(j.creadoEn).toISOString(), cerradaEn: j.cerradaEn ? new Date(j.cerradaEn).toISOString() : null } : null;
}

/** Abre una jornada del área o la ubicación, o devuelve la que ya está abierta (así se suma quien llega después). */
export async function abrirJornada(tipo: Jornada['tipo'], alcance: string): Promise<string> {
  const { data, error } = await supabase.rpc('crear_jornada', { p_tipo: tipo, p_alcance: alcance, p_nombre: null });
  if (error) throw new Error(error.message);
  return data as string;
}

export async function cerrarJornada(id: string): Promise<void> {
  const { error } = await supabase.rpc('cerrar_jornada', { p_id: id });
  if (error) throw new Error(error.message);
}

export async function avanceDeJornada(id: string): Promise<FilaAvance[]> {
  const filas = (comprobar(await supabase.rpc('avance_jornada', { p_id: id })) ?? []) as FilaAvance[];
  return filas.map((f) => ({ ...f, relevadoEn: f.relevadoEn ? aIso(f.relevadoEn) : null, tambienVieron: f.tambienVieron ?? [] }));
}

/**
 * Avisa cada vez que alguien registra un relevamiento o cambia una jornada, para que la pantalla vuelva a pedir el avance.
 * Devuelve la función que cancela la suscripción.
 */
export function suscribirseAJornada(alCambiar: () => void): () => void {
  let temporizador: ReturnType<typeof setTimeout> | null = null;
  const avisar = () => {
    // Varias lecturas seguidas (un lote que se envía de golpe) se agrupan en una sola actualización.
    if (temporizador) clearTimeout(temporizador);
    temporizador = setTimeout(alCambiar, 400);
  };
  const canal = supabase
    .channel(`jornada-${Date.now()}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'relevamiento' }, avisar)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'jornada' }, avisar)
    .subscribe();
  return () => {
    if (temporizador) clearTimeout(temporizador);
    void supabase.removeChannel(canal);
  };
}
