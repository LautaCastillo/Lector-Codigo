// Jornadas compartidas por área o ubicación (plan v3, fase 5): abrir, cerrar, avance y cambios en tiempo real.
import type { ResultadoRelevamiento } from '@patrimonio/shared';
import { conCopiaLocal } from './red';
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
  /** Código provisorio (H-XXXXXXXX) si la fila es un hallazgo registrado durante la jornada. */
  codigoProvisorio: string | null;
  /** Alguien eligió cuál de las lecturas que no coincidían es la válida; `notaResolucion` es lo que dejó escrito. */
  resuelta: boolean;
  notaResolucion: string | null;
  /** La lectura se hizo en este teléfono y todavía no llegó al servidor (se arma localmente, no viene de la base). */
  sinEnviar?: boolean;
}

/** Una lectura de un bien dentro de una jornada, para elegir cuál vale cuando no coinciden. */
export interface LecturaDeBien {
  relevamientoId: string;
  relevador: string;
  relevadoEn: string;
  resultado: string;
  ubicacionObservada: string | null;
  observaciones: string | null;
  elegida: boolean;
}

/** Las jornadas, de la más reciente a la más antigua, con su avance. Sin red devuelve la última lista que se pudo leer. */
export function listarJornadas(estado?: 'abierta' | 'cerrada'): Promise<Jornada[]> {
  return conCopiaLocal(`jornadas:${estado ?? 'todas'}`, async () => {
    const filas = (comprobar(await supabase.rpc('listar_jornadas', { p_estado: estado ?? null, p_id: null })) ?? []) as Jornada[];
    return filas.map((j) => ({ ...j, creadoEn: new Date(j.creadoEn).toISOString(), cerradaEn: j.cerradaEn ? new Date(j.cerradaEn).toISOString() : null }));
  });
}

/** Una jornada con su avance. Sin red devuelve la última copia que se pudo leer. */
export function obtenerJornada(id: string): Promise<Jornada | null> {
  return conCopiaLocal(`jornada:${id}`, async () => {
    const filas = (comprobar(await supabase.rpc('listar_jornadas', { p_estado: null, p_id: id })) ?? []) as Jornada[];
    const j = filas[0];
    return j ? { ...j, creadoEn: new Date(j.creadoEn).toISOString(), cerradaEn: j.cerradaEn ? new Date(j.cerradaEn).toISOString() : null } : null;
  });
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

/** El avance de la jornada. Sin red devuelve la última copia que se pudo leer: sirve para seguir relevando lo que ya se conocía. */
export function avanceDeJornada(id: string): Promise<FilaAvance[]> {
  return conCopiaLocal(`avance:${id}`, async () => {
    const filas = (comprobar(await supabase.rpc('avance_jornada', { p_id: id })) ?? []) as FilaAvance[];
    return filas.map((f) => ({ ...f, relevadoEn: f.relevadoEn ? aIso(f.relevadoEn) : null, tambienVieron: f.tambienVieron ?? [] }));
  });
}

/** Las lecturas vigentes de un bien en la jornada, de la primera a la última. */
export async function lecturasDeBienEnJornada(jornadaId: string, bienId: string): Promise<LecturaDeBien[]> {
  const filas = (comprobar(await supabase.rpc('lecturas_de_bien_en_jornada', { p_jornada: jornadaId, p_bien_id: bienId })) ?? []) as LecturaDeBien[];
  return filas.map((f) => ({ ...f, relevadoEn: aIso(f.relevadoEn) }));
}

/** Elige la lectura que vale (quien abrió la jornada o un administrador, con la jornada abierta). Se puede cambiar la elección. */
export async function resolverDiscrepancia(jornadaId: string, bienId: string, relevamientoId: string, nota: string): Promise<void> {
  const { error } = await supabase.rpc('resolver_discrepancia', { p_jornada: jornadaId, p_bien_id: bienId, p_relevamiento: relevamientoId, p_nota: nota.trim() || null });
  if (error) throw new Error(error.message);
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
    .on('postgres_changes', { event: '*', schema: 'public', table: 'resolucion_discrepancia' }, avisar)
    .subscribe();
  return () => {
    if (temporizador) clearTimeout(temporizador);
    void supabase.removeChannel(canal);
  };
}
