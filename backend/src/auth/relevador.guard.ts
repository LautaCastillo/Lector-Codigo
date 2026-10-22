import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { CONFIG } from '../config/config.module.js';
import type { Config } from '../config/config.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { PERMITE_PENDIENTE } from './pendiente.decorator.js';
import { ES_PUBLICO } from './publico.decorator.js';

export interface UsuarioActual {
  id: string;
  cuenta: string;
  nombre: string | null;
  rol: 'administrador' | 'relevador';
  activo: boolean;
}

/**
 * Único punto de autenticación. Con SUPABASE_URL valida el token de Supabase Auth y la cuenta debe
 * estar activa (las nuevas nacen inactivas hasta que un administrador las apruebe). Sin SUPABASE_URL
 * rige la autenticación provisoria por cabecera x-relevador (desarrollo y pruebas).
 * Reemplazar solo este guard cuando se defina el login institucional.
 */
@Injectable()
export class RelevadorGuard implements CanActivate {
  private readonly claves;

  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(CONFIG) private readonly config: Config,
    @Inject(PrismaService) private readonly prisma: PrismaService,
  ) {
    this.claves = config.supabaseUrl
      ? createRemoteJWKSet(new URL(`${config.supabaseUrl}/auth/v1/.well-known/jwks.json`))
      : undefined;
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const destinos = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(ES_PUBLICO, destinos)) return true;

    const req = context.switchToHttp().getRequest<Request & { usuario?: UsuarioActual }>();
    if (this.config.apiKey && req.header('x-api-key') !== this.config.apiKey) {
      throw new UnauthorizedException('API key inválida');
    }

    const identidad = this.claves ? await this.identidadDeToken(req) : this.identidadDeCabecera(req);
    const usuario = await this.prisma.usuario.upsert({
      where: { cuenta: identidad.cuenta },
      update: {},
      create: { cuenta: identidad.cuenta, nombre: identidad.nombre, activo: identidad.activo },
    });
    const permitePendiente = this.reflector.getAllAndOverride<boolean>(PERMITE_PENDIENTE, destinos);
    if (!usuario.activo && !(permitePendiente && this.claves)) {
      throw new ForbiddenException(
        this.claves ? 'Cuenta pendiente de aprobación' : 'Usuario inactivo',
      );
    }
    req.usuario = {
      id: usuario.id,
      cuenta: usuario.cuenta,
      nombre: usuario.nombre ?? null,
      rol: usuario.rol ?? 'relevador',
      activo: usuario.activo,
    };
    return true;
  }

  private identidadDeCabecera(req: Request) {
    const cuenta = req.header('x-relevador')?.trim();
    if (!cuenta) throw new UnauthorizedException('Falta la cabecera x-relevador');
    return { cuenta, nombre: null, activo: true };
  }

  private async identidadDeToken(req: Request) {
    const token = req.header('authorization')?.match(/^Bearer (.+)$/i)?.[1];
    if (!token) throw new UnauthorizedException('Falta el token de sesión');
    try {
      const { payload } = await jwtVerify(token, this.claves!, {
        issuer: `${this.config.supabaseUrl}/auth/v1`,
        audience: 'authenticated',
      });
      const cuenta = typeof payload.email === 'string' ? payload.email.toLowerCase() : undefined;
      if (!cuenta) throw new Error('el token no trae email');
      const meta = payload.user_metadata as { nombre?: unknown } | undefined;
      const nombre = typeof meta?.nombre === 'string' ? meta.nombre.trim() || null : null;
      return { cuenta, nombre, activo: false };
    } catch {
      throw new UnauthorizedException('Sesión inválida o vencida');
    }
  }
}
