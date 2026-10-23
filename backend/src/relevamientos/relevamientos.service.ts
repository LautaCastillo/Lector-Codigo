import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  esSimbologia,
  RESULTADOS_RELEVAMIENTO,
  type RelevamientoDto,
  type RelevamientoRegistradoDto,
  type ResultadoRelevamiento,
  type ResultadoSubidaDto,
} from '@patrimonio/shared';
import { AuditoriaService } from '../auditoria/auditoria.service.js';
import type { UsuarioActual } from '../auth/relevador.guard.js';
import { bienADto } from '../bienes/bienes.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

/** Tope de relevamientos por subida. */
export const MAX_POR_SUBIDA = 500;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Valido = RelevamientoDto & { fecha: Date };

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
  if (r.loteId !== undefined && !(typeof r.loteId === 'string' && UUID.test(r.loteId))) return { error: 'loteId debe ser un UUID' };
  const numeroInventario = texto(r.numeroInventario, 30);
  if (resultado === 'encontrado' && !numeroInventario) return { error: 'Un bien encontrado necesita numeroInventario' };
  return {
    valido: {
      idCliente,
      resultado,
      relevadoEnDispositivo: fecha.toISOString(),
      fecha,
      loteId: r.loteId as string | undefined,
      numeroInventario,
      simbologia: r.simbologia as RelevamientoDto['simbologia'],
      valorLeido: texto(r.valorLeido, 200),
      ubicacionObservada: texto(r.ubicacionObservada, 300),
      observaciones: texto(r.observaciones, 500),
      estadoDetectado: texto(r.estadoDetectado, 100),
    },
  };
}

@Injectable()
export class RelevamientosService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditoriaService) private readonly auditoria: AuditoriaService,
  ) {}

  /**
   * Registra relevamientos de forma idempotente: lo que ya llegó antes (mismo `idCliente`, misma cuenta)
   * se cuenta como duplicado y no se vuelve a guardar. Los elementos inválidos se rechazan uno por uno
   * sin frenar al resto.
   */
  async registrar(actor: UsuarioActual, items: unknown[]): Promise<ResultadoSubidaDto> {
    const rechazados: ResultadoSubidaDto['rechazados'] = [];
    const validos: Valido[] = [];
    const vistos = new Set<string>();
    for (const item of items) {
      const v = validarRelevamiento(item);
      const id = (item as { idCliente?: unknown } | null)?.idCliente;
      if ('error' in v) rechazados.push({ idCliente: typeof id === 'string' ? id : '', motivo: v.error });
      else if (vistos.has(v.valido.idCliente)) rechazados.push({ idCliente: v.valido.idCliente, motivo: 'idCliente repetido en la subida' });
      else {
        vistos.add(v.valido.idCliente);
        validos.push(v.valido);
      }
    }

    const previos = await this.prisma.relevamiento.findMany({
      where: { idCliente: { in: validos.map((v) => v.idCliente) } },
      select: { idCliente: true, usuarioId: true },
    });
    const propios = new Set(previos.filter((p) => p.usuarioId === actor.id).map((p) => p.idCliente));
    for (const p of previos) {
      if (p.usuarioId !== actor.id) rechazados.push({ idCliente: p.idCliente, motivo: 'idCliente ya usado por otra cuenta' });
    }
    const ocupados = new Set(previos.map((p) => p.idCliente));
    const nuevos = validos.filter((v) => !ocupados.has(v.idCliente));

    const numeros = [...new Set(nuevos.flatMap((v) => (v.resultado === 'encontrado' && v.numeroInventario ? [v.numeroInventario] : [])))];
    const bienes = numeros.length
      ? await this.prisma.bien.findMany({ where: { numeroInventario: { in: numeros } }, select: { id: true, numeroInventario: true } })
      : [];
    const bienPorNumero = new Map(bienes.map((b) => [b.numeroInventario, b.id]));

    const aGuardar = nuevos.filter((v) => {
      if (v.resultado === 'encontrado' && !bienPorNumero.has(v.numeroInventario!)) {
        rechazados.push({ idCliente: v.idCliente, motivo: 'El bien no existe en el catálogo' });
        return false;
      }
      return true;
    });

    let registrados = 0;
    if (aGuardar.length) {
      registrados = await this.auditoria.conActor(actor.id, async (tx) => {
        const { count } = await tx.relevamiento.createMany({
          data: aGuardar.map((v) => ({
            idCliente: v.idCliente,
            usuarioId: actor.id,
            bienId: v.resultado === 'encontrado' ? (bienPorNumero.get(v.numeroInventario!) ?? null) : null,
            resultado: v.resultado,
            simbologia: v.simbologia ?? null,
            valorLeido: v.valorLeido ?? null,
            ubicacionObservada: v.ubicacionObservada ?? null,
            loteId: v.loteId ?? null,
            observaciones: v.observaciones ?? null,
            estadoDetectado: v.estadoDetectado ?? null,
            relevadoEnDispositivo: v.fecha,
          })),
          skipDuplicates: true,
        });
        if (count > 0) {
          await this.auditoria.registrar(
            {
              tipo: 'RELEVAMIENTO_REGISTRADO',
              actor,
              entidadTipo: 'relevamiento',
              datos: {
                cantidad: count,
                ubicacion: aGuardar[0]?.ubicacionObservada ?? null,
                loteId: aGuardar[0]?.loteId ?? null,
              },
            },
            tx,
          );
        }
        return count;
      });
    }
    return { registrados, duplicados: propios.size, rechazados };
  }

  /** Los relevamientos de la propia cuenta, del más reciente al más antiguo. */
  async listarMios(actor: UsuarioActual, limite: number): Promise<RelevamientoRegistradoDto[]> {
    const filas = await this.prisma.relevamiento.findMany({
      where: { usuarioId: actor.id },
      include: { bien: true, usuario: { select: { cuenta: true, nombre: true } } },
      orderBy: { relevadoEnDispositivo: 'desc' },
      take: limite,
    });
    return filas.map(aDto);
  }

  /** Un relevamiento. Cada relevador ve los suyos; el administrador ve todos. */
  async obtener(actor: UsuarioActual, id: string): Promise<RelevamientoRegistradoDto> {
    const fila = await this.prisma.relevamiento.findUnique({
      where: { id },
      include: { bien: true, usuario: { select: { cuenta: true, nombre: true } } },
    });
    if (!fila) throw new NotFoundException();
    if (fila.usuarioId !== actor.id && actor.rol !== 'administrador') throw new ForbiddenException('No tenés permiso para ver este relevamiento');
    return aDto(fila);
  }
}

interface FilaRelevamiento {
  id: string;
  idCliente: string;
  loteId: string | null;
  resultado: string;
  simbologia: string | null;
  valorLeido: string | null;
  ubicacionObservada: string | null;
  observaciones: string | null;
  estadoDetectado: string | null;
  relevadoEnDispositivo: Date;
  sincronizadoEn: Date;
  usuario: { cuenta: string; nombre: string | null };
  bien: Parameters<typeof bienADto>[0] | null;
}

function aDto(f: FilaRelevamiento): RelevamientoRegistradoDto {
  return {
    id: f.id,
    idCliente: f.idCliente,
    loteId: f.loteId,
    resultado: f.resultado as ResultadoRelevamiento,
    simbologia: f.simbologia,
    valorLeido: f.valorLeido,
    ubicacionObservada: f.ubicacionObservada,
    observaciones: f.observaciones,
    estadoDetectado: f.estadoDetectado,
    relevadoEnDispositivo: f.relevadoEnDispositivo.toISOString(),
    sincronizadoEn: f.sincronizadoEn.toISOString(),
    relevador: f.usuario.nombre ?? f.usuario.cuenta,
    bien: f.bien ? bienADto(f.bien) : null,
  };
}
