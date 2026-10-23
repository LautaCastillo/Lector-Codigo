import { Inject, Injectable } from '@nestjs/common';
import type { EventoAuditoriaDto, TipoEventoAuditoria } from '@patrimonio/shared';
import type { Prisma } from '../generated/prisma/client.js';
import type { UsuarioActual } from '../auth/relevador.guard.js';
import { PrismaService } from '../prisma/prisma.service.js';

export type Tx = Prisma.TransactionClient;

export interface NuevoEvento {
  tipo: TipoEventoAuditoria;
  /** Quien hizo la acción. Nulo si no hay un usuario identificado. */
  actor?: UsuarioActual | null;
  entidadTipo?: string;
  entidadId?: string;
  resultado?: 'ok' | 'rechazado' | 'cuarentena';
  /** Obligatorio en cambios de rol o de estado de cuenta (lo exige quien llama). */
  motivo?: string | null;
  /** Diff o resumen. Nunca contraseñas ni tokens. */
  datos?: Prisma.InputJsonValue;
}

export interface FiltroEventos {
  tipo?: string;
  actorUsuarioId?: string;
  desde?: Date;
  hasta?: Date;
  limite: number;
}

const TIEMPO_MAXIMO_MS = 15_000;

@Injectable()
export class AuditoriaService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  /**
   * Ejecuta `fn` en una transacción donde los triggers de PostgreSQL conocen al actor
   * (`app.usuario_id`). El cambio de negocio y su evento deben escribirse dentro de `fn`.
   */
  conActor<T>(actorId: string | null, fn: (tx: Tx) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(
      async (tx) => {
        // El tercer argumento `true` limita el valor a esta transacción.
        await tx.$queryRaw`SELECT set_config('app.usuario_id', ${actorId ?? ''}, true)`;
        return fn(tx);
      },
      { timeout: TIEMPO_MAXIMO_MS },
    );
  }

  /** Agrega un evento. Con `tx` se escribe en la misma transacción que el cambio de negocio. */
  async registrar(evento: NuevoEvento, tx: Tx | PrismaService = this.prisma) {
    const { actor } = evento;
    await tx.eventoAuditoria.create({
      data: {
        tipo: evento.tipo,
        actorUsuarioId: actor?.id ?? null,
        actorRol: actor?.rol ?? null,
        sesionId: actor?.sesionId ?? null,
        ip: actor?.ip ?? null,
        userAgent: actor?.userAgent ?? null,
        entidadTipo: evento.entidadTipo ?? null,
        entidadId: evento.entidadId ?? null,
        resultado: evento.resultado ?? 'ok',
        motivo: evento.motivo ?? null,
        datos: evento.datos,
      },
    });
  }

  /** ¿Ya se registró el inicio de esta sesión? */
  async existeInicioDeSesion(sesionId: string) {
    const previo = await this.prisma.eventoAuditoria.findFirst({
      where: { tipo: 'SESION_INICIADA', sesionId },
      select: { id: true },
    });
    return !!previo;
  }

  async listar(filtro: FiltroEventos): Promise<EventoAuditoriaDto[]> {
    const eventos = await this.prisma.eventoAuditoria.findMany({
      where: {
        ...(filtro.tipo ? { tipo: filtro.tipo } : {}),
        ...(filtro.actorUsuarioId ? { actorUsuarioId: filtro.actorUsuarioId } : {}),
        ...(filtro.desde || filtro.hasta
          ? { horaServidor: { ...(filtro.desde ? { gte: filtro.desde } : {}), ...(filtro.hasta ? { lte: filtro.hasta } : {}) } }
          : {}),
      },
      orderBy: { horaServidor: 'desc' },
      take: filtro.limite,
    });
    return eventos.map((e) => ({
      id: e.id,
      tipo: e.tipo,
      actorUsuarioId: e.actorUsuarioId,
      actorRol: e.actorRol,
      entidadTipo: e.entidadTipo,
      entidadId: e.entidadId,
      resultado: e.resultado,
      motivo: e.motivo,
      datos: e.datos,
      horaServidor: e.horaServidor.toISOString(),
    }));
  }
}
