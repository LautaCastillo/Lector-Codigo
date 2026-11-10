// Panel del administrador: una vista de conjunto del relevamiento. Solo lectura; las funciones de la base comprueban que quien pregunta
// sea un administrador activo.
import { supabase } from './supabase';
import { aIso, comprobar, type Fila } from './util';

export interface ResumenPanel {
  bienes: number;
  /** Bienes con al menos una lectura "encontrado" vigente. */
  relevados: number;
  /** Bienes con situación (reparación, baja, préstamo) que nunca se encontraron. */
  apartados: number;
  jornadasAbiertas: number;
  jornadasCerradas: number;
  lecturas7Dias: number;
  cuentasActivas: number;
  hallazgosSinVincular: number;
}

export interface AreaPanel {
  area: string;
  bienes: number;
  relevados: number;
  sinRelevar: number;
  apartados: number;
  ultimaJornadaId: string | null;
  ultimaCerradaEn: string | null;
  ultimaEsperados: number | null;
  ultimaEncontrados: number | null;
}

export interface BienSinRelevar {
  bienId: string;
  numeroInventario: string;
  descripcion: string | null;
  ubicacionFisica: string | null;
  areaResponsable: string | null;
  situacion: string | null;
}

export interface PersonaPanel {
  usuarioId: string;
  cuenta: string;
  nombre: string | null;
  rol: 'administrador' | 'relevador';
  estado: string;
  lecturas: number;
  hallazgos: number;
  deshechas: number;
  ultimaActividad: string | null;
  jornadasAbiertas: number;
}

export async function resumenDelPanel(): Promise<ResumenPanel> {
  const filas = (comprobar(await supabase.rpc('panel_resumen')) ?? []) as ResumenPanel[];
  return filas[0] as ResumenPanel;
}

export async function avancePorArea(): Promise<AreaPanel[]> {
  const filas = (comprobar(await supabase.rpc('panel_por_area')) ?? []) as AreaPanel[];
  return filas.map((f) => ({ ...f, ultimaCerradaEn: f.ultimaCerradaEn ? new Date(f.ultimaCerradaEn).toISOString() : null }));
}

/** Los bienes que nunca se encontraron, de un área o de todas (hasta `limite`). */
export async function bienesSinRelevar(area: string | null, limite = 200): Promise<BienSinRelevar[]> {
  return (comprobar(await supabase.rpc('panel_sin_relevar', { p_area: area, p_limite: limite })) ?? []) as BienSinRelevar[];
}

/** Lecturas, hallazgos y lecturas deshechas de cada cuenta en los últimos `dias` días. */
export async function lecturasPorPersona(dias: number): Promise<PersonaPanel[]> {
  const filas = (comprobar(await supabase.rpc('panel_lecturas_por_persona', { p_dias: dias })) ?? []) as Fila[];
  return filas.map((f) => ({ ...(f as unknown as PersonaPanel), ultimaActividad: f.ultimaActividad ? aIso(f.ultimaActividad) : null }));
}
