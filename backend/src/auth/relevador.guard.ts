import {
  type CanActivate,
  type ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { CONFIG } from '../config/config.module.js';
import type { Config } from '../config/config.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { ES_PUBLICO } from './publico.decorator.js';

export interface UsuarioActual {
  id: string;
  cuenta: string;
}

/**
 * Autenticación provisoria. ÚNICO punto a reemplazar cuando se defina el login institucional:
 * debe dejar en request.usuario un UsuarioActual.
 */
@Injectable()
export class RelevadorGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(CONFIG) private readonly config: Config,
    @Inject(PrismaService) private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const publico = this.reflector.getAllAndOverride<boolean>(ES_PUBLICO, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (publico) return true;

    const req = context.switchToHttp().getRequest<Request & { usuario?: UsuarioActual }>();
    if (this.config.apiKey && req.header('x-api-key') !== this.config.apiKey) {
      throw new UnauthorizedException('API key inválida');
    }
    const cuenta = req.header('x-relevador')?.trim();
    if (!cuenta) throw new UnauthorizedException('Falta la cabecera x-relevador');

    const usuario = await this.prisma.usuario.upsert({
      where: { cuenta },
      update: {},
      create: { cuenta },
    });
    if (!usuario.activo) throw new UnauthorizedException('Usuario inactivo');
    req.usuario = { id: usuario.id, cuenta: usuario.cuenta };
    return true;
  }
}
