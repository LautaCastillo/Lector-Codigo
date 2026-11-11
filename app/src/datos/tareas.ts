// Planificar jornadas: un administrador asigna a una persona un área o una ubicación con fecha; la persona ve sus tareas, las empieza
// (abre la jornada de ese alcance) y las marca como hechas. Cada cuenta ve las suyas y los administradores ven todas (lo impone la base).
import { miId } from './cuentas';
import { supabase } from './supabase';
import { comprobar, type Fila } from './util';

export type EstadoTarea = 'pendiente' | 'hecha' | 'cancelada';

export interface Tarea {
  id: string;
  tipo: 'area' | 'ubicacion';
  alcance: string;
  asignadaAId: string;
  asignadaA: string;
  /** `aaaa-mm-dd`. */
  fechaPrevista: string;
  nota: string | null;
  estado: EstadoTarea;
  /** La jornada que se abrió al empezar la tarea. */
  jornadaId: string | null;
  creadaPor: string;
  creadaEn: string;
  resueltaEn: string | null;
  propia: boolean;
}

const COLUMNAS =
  'id, tipo, alcance, asignadaA, fechaPrevista, nota, estado, jornadaId, creadaEn, resueltaEn, asignada:usuario!asignadaA(cuenta, nombre), creadora:usuario!creadaPor(cuenta, nombre)';

const nombre = (u: unknown) => {
  const usuario = u as { cuenta: string; nombre: string | null } | null;
  return usuario ? (usuario.nombre ?? usuario.cuenta) : '';
};

function aTarea(f: Fila, yo: string): Tarea {
  return {
    id: f.id as string,
    tipo: f.tipo as Tarea['tipo'],
    alcance: f.alcance as string,
    asignadaAId: f.asignadaA as string,
    asignadaA: nombre(f.asignada),
    fechaPrevista: f.fechaPrevista as string,
    nota: (f.nota as string | null) ?? null,
    estado: f.estado as EstadoTarea,
    jornadaId: (f.jornadaId as string | null) ?? null,
    creadaPor: nombre(f.creadora),
    creadaEn: new Date(f.creadaEn as string).toISOString(),
    resueltaEn: f.resueltaEn ? new Date(f.resueltaEn as string).toISOString() : null,
    propia: f.asignadaA === yo,
  };
}

/** Las tareas de la propia cuenta: primero las pendientes (la más próxima arriba) y después las ya resueltas. */
export async function misTareas(): Promise<Tarea[]> {
  const yo = await miId();
  const filas = comprobar(await supabase.from('tarea').select(COLUMNAS).eq('asignadaA', yo).order('fechaPrevista', { ascending: true }).limit(200)) as Fila[];
  const tareas = filas.map((f) => aTarea(f, yo));
  const pendientes = tareas.filter((t) => t.estado === 'pendiente');
  return [...pendientes, ...tareas.filter((t) => t.estado !== 'pendiente').reverse()];
}

/** Solo administradores: las tareas de todo el equipo, las más recientes primero. */
export async function tareasDelEquipo(): Promise<Tarea[]> {
  const yo = await miId();
  const filas = comprobar(await supabase.from('tarea').select(COLUMNAS).order('creadaEn', { ascending: false }).limit(300)) as Fila[];
  return filas.map((f) => aTarea(f, yo));
}

/** Cuántas tareas pendientes tiene la propia cuenta. */
export async function contarMisTareasPendientes(): Promise<number> {
  const yo = await miId();
  const { count, error } = await supabase.from('tarea').select('id', { count: 'exact', head: true }).eq('asignadaA', yo).eq('estado', 'pendiente');
  if (error) throw new Error(error.message);
  return count ?? 0;
}

export interface NuevaTarea {
  tipo: 'area' | 'ubicacion';
  alcance: string;
  usuarioId: string;
  /** `aaaa-mm-dd`. */
  fecha: string;
  nota: string;
}

/** Solo administradores. */
export async function asignarTarea(t: NuevaTarea): Promise<void> {
  const { error } = await supabase.rpc('asignar_tarea', { p_tipo: t.tipo, p_alcance: t.alcance, p_usuario: t.usuarioId, p_fecha: t.fecha, p_nota: t.nota.trim() || null });
  if (error) throw new Error(error.message);
}

/** Abre la jornada del alcance de la tarea (o se suma a la que ya está abierta) y devuelve su id. Solo quien la tiene asignada. */
export async function iniciarTarea(id: string): Promise<string> {
  const { data, error } = await supabase.rpc('iniciar_tarea', { p_id: id });
  if (error) throw new Error(error.message);
  return data as string;
}

/** La persona asignada o un administrador. */
export async function terminarTarea(id: string): Promise<void> {
  const { error } = await supabase.rpc('terminar_tarea', { p_id: id });
  if (error) throw new Error(error.message);
}

/** Solo administradores; una tarea pendiente. */
export async function cancelarTarea(id: string): Promise<void> {
  const { error } = await supabase.rpc('cancelar_tarea', { p_id: id });
  if (error) throw new Error(error.message);
}
