// Validación de lo que la app sube como relevamiento (UUID, tope por subida, coherencia de campos), antes de enviarlo a Supabase.
import { esSimbologia } from './simbologias.js';
import {
  CLASES_HALLAZGO,
  RESULTADOS_RELEVAMIENTO,
  type ClaseHallazgo,
  type RelevamientoDto,
  type ResultadoRelevamiento,
} from './tipos.js';

/** Tope de relevamientos por subida. */
export const MAX_POR_SUBIDA = 500;
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type Valido = RelevamientoDto & { fecha: Date };

/** Valida un elemento de la subida. Devuelve el motivo del rechazo, o el elemento listo para guardar. */
export function validarRelevamiento(x: unknown): { error: string } | { valido: Valido } {
  if (!x || typeof x !== 'object') return { error: 'Formato inválido' };
  const r = x as Record<string, unknown>;
  const texto = (v: unknown, max: number) => (typeof v === 'string' && v.length <= max ? v : undefined);
  const idCliente = typeof r.idCliente === 'string' && UUID.test(r.idCliente) ? r.idCliente : null;
  if (!idCliente) return { error: 'idCliente debe ser un UUID' };
  if (!(RESULTADOS_RELEVAMIENTO as readonly unknown[]).includes(r.resultado)) return { error: 'resultado inválido' };
  const resultado = r.resultado as ResultadoRelevamiento;
  const fecha = typeof r.relevadoEnDispositivo === 'string' ? new Date(r.relevadoEnDispositivo) : null;
  if (!fecha || Number.isNaN(fecha.getTime())) return { error: 'relevadoEnDispositivo debe ser una fecha ISO 8601' };
  if (r.simbologia !== undefined && !(typeof r.simbologia === 'string' && esSimbologia(r.simbologia))) return { error: 'simbologia inválida' };
  if (r.jornadaId !== undefined && !(typeof r.jornadaId === 'string' && UUID.test(r.jornadaId))) return { error: 'jornadaId debe ser un UUID' };
  if (r.loteId !== undefined && !(typeof r.loteId === 'string' && UUID.test(r.loteId))) return { error: 'loteId debe ser un UUID' };
  const numeroInventario = texto(r.numeroInventario, 30);
  if (resultado === 'encontrado' && !numeroInventario) return { error: 'Un bien encontrado necesita numeroInventario' };
  let hallazgo: Pick<RelevamientoDto, 'clase' | 'descripcion' | 'numeroSerie'> = {};
  if (resultado === 'hallazgo') {
    if (!(CLASES_HALLAZGO as readonly unknown[]).includes(r.clase)) return { error: 'Un hallazgo necesita una clase válida' };
    const descripcion = typeof r.descripcion === 'string' ? r.descripcion.trim() : '';
    if (descripcion.length < 3 || descripcion.length > 300) return { error: 'La descripción del hallazgo debe tener entre 3 y 300 caracteres' };
    if (r.numeroSerie !== undefined && !texto(r.numeroSerie, 100)) return { error: 'numeroSerie demasiado largo' };
    hallazgo = { clase: r.clase as ClaseHallazgo, descripcion, numeroSerie: texto(r.numeroSerie, 100)?.trim() || undefined };
  }
  return {
    valido: {
      idCliente,
      resultado,
      relevadoEnDispositivo: fecha.toISOString(),
      fecha,
      loteId: r.loteId as string | undefined,
      jornadaId: r.jornadaId as string | undefined,
      ...hallazgo,
      numeroInventario: resultado === 'hallazgo' ? undefined : numeroInventario,
      simbologia: r.simbologia as RelevamientoDto['simbologia'],
      valorLeido: texto(r.valorLeido, 200),
      ubicacionObservada: texto(r.ubicacionObservada, 300),
      observaciones: texto(r.observaciones, 500),
      estadoDetectado: texto(r.estadoDetectado, 100),
    },
  };
}
