import { Inject, Injectable } from '@nestjs/common';
import type { ResultadoRelevamiento } from '@patrimonio/shared';
import { createHash } from 'node:crypto';
import { AuditoriaService } from '../auditoria/auditoria.service.js';
import type { UsuarioActual } from '../auth/relevador.guard.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { construirCsv } from './csv.js';

/** Tope de filas por archivo. Si hay más, se exportan las más recientes y se avisa. */
export const MAX_FILAS = 10_000;

export interface FiltroExportacion {
  desde?: Date;
  hasta?: Date;
  ubicacion?: string;
  resultado?: ResultadoRelevamiento;
  /** Solo para administradores: limita a los relevamientos de una cuenta. */
  usuarioId?: string;
}

export interface ArchivoExportado {
  csv: string;
  filas: number;
  hash: string;
  truncado: boolean;
  nombre: string;
}

/** El nombre lleva la fecha y la hora de Salta, la misma que figura dentro del archivo. */
const partesDeFecha = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Argentina/Salta',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

export function nombreDeArchivo(ahora: Date) {
  const p = Object.fromEntries(partesDeFecha.formatToParts(ahora).map((x) => [x.type, x.value]));
  return `relevamientos-${p.year}${p.month}${p.day}-${p.hour}${p.minute}.csv`;
}

@Injectable()
export class ExportacionesService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditoriaService) private readonly auditoria: AuditoriaService,
  ) {}

  /**
   * Genera el CSV de relevamientos. Un relevador solo exporta los suyos; un administrador, los de todos
   * (o los de una cuenta). La exportación queda registrada con sus filtros, la cantidad de filas y la
   * huella SHA-256 del archivo, tanto en `exportacion` como en la auditoría.
   */
  async exportarCsv(actor: UsuarioActual, filtro: FiltroExportacion, ahora = new Date()): Promise<ArchivoExportado> {
    const usuarioId = actor.rol === 'administrador' ? filtro.usuarioId : actor.id;
    const encontradas = await this.prisma.relevamiento.findMany({
      where: {
        ...(usuarioId ? { usuarioId } : {}),
        ...(filtro.ubicacion ? { ubicacionObservada: filtro.ubicacion } : {}),
        ...(filtro.resultado ? { resultado: filtro.resultado } : {}),
        ...(filtro.desde || filtro.hasta
          ? { relevadoEnDispositivo: { ...(filtro.desde ? { gte: filtro.desde } : {}), ...(filtro.hasta ? { lte: filtro.hasta } : {}) } }
          : {}),
      },
      include: { bien: true, usuario: { select: { cuenta: true, nombre: true } } },
      orderBy: { relevadoEnDispositivo: 'desc' },
      take: MAX_FILAS + 1,
    });
    const truncado = encontradas.length > MAX_FILAS;
    const filas = truncado ? encontradas.slice(0, MAX_FILAS) : encontradas;
    const csv = construirCsv(filas);
    const hash = createHash('sha256').update(csv).digest('hex');

    const filtros = {
      desde: filtro.desde?.toISOString() ?? null,
      hasta: filtro.hasta?.toISOString() ?? null,
      ubicacion: filtro.ubicacion ?? null,
      resultado: filtro.resultado ?? null,
      alcance: actor.rol === 'administrador' && !filtro.usuarioId ? 'todos' : 'propios',
    };
    await this.auditoria.conActor(actor.id, async (tx) => {
      await tx.exportacion.create({
        data: { usuarioId: actor.id, formato: 'csv', filtros, filas: filas.length, hashSha256: hash },
      });
      await this.auditoria.registrar(
        {
          tipo: 'EXPORTACION_GENERADA',
          actor,
          entidadTipo: 'relevamiento',
          datos: { formato: 'csv', filas: filas.length, hashSha256: hash, truncado, filtros },
        },
        tx,
      );
    });

    return { csv, filas: filas.length, hash, truncado, nombre: nombreDeArchivo(ahora) };
  }
}
