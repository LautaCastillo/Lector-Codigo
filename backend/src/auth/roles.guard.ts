import { type CanActivate, type ExecutionContext, ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Rol } from '@patrimonio/shared';
import { PERMITE_INACTIVO } from './inactivo.decorator.js';
import type { UsuarioActual } from './relevador.guard.js';
import { ES_PUBLICO } from './publico.decorator.js';
import { ROLES_REQUERIDOS } from './roles.decorator.js';

/**
 * Autorización por rol con denegación por defecto: cada endpoint debe declarar @Publico, @PermitirInactivo
 * o @Roles(...). Corre después de RelevadorGuard, que ya dejó el usuario (y su estado) en la solicitud.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(@Inject(Reflector) private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const destinos = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(ES_PUBLICO, destinos)) return true;
    if (this.reflector.getAllAndOverride<boolean>(PERMITE_INACTIVO, destinos)) return true;

    const roles = this.reflector.getAllAndOverride<Rol[] | undefined>(ROLES_REQUERIDOS, destinos);
    const usuario = context.switchToHttp().getRequest<{ usuario?: UsuarioActual }>().usuario;
    if (!roles?.length || !usuario || !roles.includes(usuario.rol)) {
      throw new ForbiddenException('No tenés permiso para esta acción');
    }
    return true;
  }
}
