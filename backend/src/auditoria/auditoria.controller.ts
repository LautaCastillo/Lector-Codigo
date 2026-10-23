import { BadRequestException, Controller, Get, Inject, Query } from '@nestjs/common';
import { TIPOS_EVENTO_AUDITORIA } from '@patrimonio/shared';
import { Roles } from '../auth/roles.decorator.js';
import type { UsuarioActual } from '../auth/relevador.guard.js';
import { Usuario } from '../auth/usuario.decorator.js';
import { AuditoriaService, type FiltroEventos } from './auditoria.service.js';

const LIMITE_POR_DEFECTO = 50;
const LIMITE_MAXIMO = 200;

function limite(valor?: string) {
  if (valor === undefined) return LIMITE_POR_DEFECTO;
  const n = Number(valor);
  if (!Number.isInteger(n) || n < 1) throw new BadRequestException('limite inválido');
  return Math.min(n, LIMITE_MAXIMO);
}

function fecha(valor: string | undefined, nombre: string) {
  if (valor === undefined) return undefined;
  const f = new Date(valor);
  if (Number.isNaN(f.getTime())) throw new BadRequestException(`${nombre} inválida (usar formato ISO 8601)`);
  return f;
}

@Controller()
export class AuditoriaController {
  constructor(@Inject(AuditoriaService) private readonly auditoria: AuditoriaService) {}

  /** El administrador ve todo el registro. La consulta también queda registrada, de forma resumida. */
  @Roles('administrador')
  @Get('admin/auditoria')
  async consultar(
    @Usuario() actor: UsuarioActual,
    @Query() q: { tipo?: string; usuarioId?: string; desde?: string; hasta?: string; limite?: string },
  ) {
    if (q.tipo !== undefined && !(TIPOS_EVENTO_AUDITORIA as readonly string[]).includes(q.tipo)) {
      throw new BadRequestException('tipo inválido');
    }
    const filtro: FiltroEventos = {
      tipo: q.tipo,
      actorUsuarioId: q.usuarioId,
      desde: fecha(q.desde, 'desde'),
      hasta: fecha(q.hasta, 'hasta'),
      limite: limite(q.limite),
    };
    const eventos = await this.auditoria.listar(filtro);
    await this.auditoria.registrar({
      tipo: 'AUDITORIA_CONSULTADA',
      actor,
      datos: { tipo: q.tipo ?? null, usuarioId: q.usuarioId ?? null, desde: q.desde ?? null, hasta: q.hasta ?? null, cantidad: eventos.length },
    });
    return eventos;
  }

  /** Cada usuario ve su propia actividad. */
  @Roles('administrador', 'relevador')
  @Get('me/actividad')
  actividad(@Usuario() actor: UsuarioActual, @Query('limite') n?: string) {
    return this.auditoria.listar({ actorUsuarioId: actor.id, limite: limite(n) });
  }
}
