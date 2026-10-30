// Registro de auditoría (solo administradores).
import type { EventoAuditoriaDto } from '@patrimonio/shared';
import { supabase } from './supabase';
import { aIso, comprobar, type Fila } from './util';

/** Solo administradores (lo impone la base): los eventos más recientes del registro de auditoría. */
export async function listarAuditoria(limite: number): Promise<EventoAuditoriaDto[]> {
  const filas = comprobar(
    await supabase.from('evento_auditoria').select('*').order('horaServidor', { ascending: false }).limit(Math.min(limite, 200)),
  ) as Fila[];
  return filas.map((f) => ({
    id: f.id as string,
    tipo: f.tipo as string,
    actorUsuarioId: (f.actorUsuarioId as string | null) ?? null,
    actorRol: (f.actorRol as EventoAuditoriaDto['actorRol']) ?? null,
    entidadTipo: (f.entidadTipo as string | null) ?? null,
    entidadId: (f.entidadId as string | null) ?? null,
    resultado: f.resultado as string,
    motivo: (f.motivo as string | null) ?? null,
    datos: f.datos ?? null,
    horaServidor: aIso(f.horaServidor),
  }));
}
