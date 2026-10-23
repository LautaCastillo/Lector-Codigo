import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { EstadoCuenta, Rol } from '@patrimonio/shared';
import type { Request } from 'express';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { CONFIG } from '../config/config.module.js';
import type { Config } from '../config/config.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { PERMITE_INACTIVO } from './inactivo.decorator.js';
import { ES_PUBLICO } from './publico.decorator.js';

export interface UsuarioActual {
  id: string;
  cuenta: string;
  nombre: string | null;
  rol: Rol;
  estado: EstadoCuenta;
}

const MENSAJE_ESTADO: Record<Exclude<EstadoCuenta, 'activa'>, string> = {
  pendiente: 'Cuenta pendiente de aprobación',
  rechazada: 'Cuenta rechazada',
  suspendida: 'Cuenta suspendida',
  baja: 'Cuenta dada de baja',
};

/** El último acceso se registra como mucho una vez cada tanto, para no escribir en la base en cada pedido. */
const REFRESCO_ACCESO_MS = 10 * 60 * 1000;

/**
 * Único punto de autenticación. Valida el token de Supabase Auth; la cuenta debe estar `activa` (las
 * nuevas nacen `pendiente` hasta que un administrador las apruebe). La autenticación provisoria por
 * cabecera x-relevador solo existe con AUTH_PROVISORIA=true, fuera de producción (ver cargarConfig).
 * El rol y el estado se deciden siempre en la tabla `usuario`, sea cual sea el proveedor de identidad.
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
    const identidad = this.claves ? await this.identidadDeToken(req) : this.identidadDeCabecera(req);
    const usuario = await this.prisma.usuario.upsert({
      where: { cuenta: identidad.cuenta },
      update: {},
      create: { cuenta: identidad.cuenta, nombre: identidad.nombre, estado: identidad.estadoInicial },
    });

    const permiteInactivo = this.reflector.getAllAndOverride<boolean>(PERMITE_INACTIVO, destinos);
    if (usuario.estado !== 'activa' && !permiteInactivo) {
      throw new ForbiddenException(MENSAJE_ESTADO[usuario.estado as Exclude<EstadoCuenta, 'activa'>]);
    }

    const ultimo = usuario.ultimoAccesoEn?.getTime() ?? 0;
    if (usuario.estado === 'activa' && Date.now() - ultimo > REFRESCO_ACCESO_MS) {
      await this.prisma.usuario.update({ where: { id: usuario.id }, data: { ultimoAccesoEn: new Date() } });
    }

    req.usuario = {
      id: usuario.id,
      cuenta: usuario.cuenta,
      nombre: usuario.nombre ?? null,
      rol: usuario.rol,
      estado: usuario.estado,
    };
    return true;
  }

  private identidadDeCabecera(req: Request) {
    const cuenta = req.header('x-relevador')?.trim();
    if (!cuenta) throw new UnauthorizedException('Falta la cabecera x-relevador');
    return { cuenta, nombre: null, estadoInicial: 'activa' as const };
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
      return { cuenta, nombre, estadoInicial: 'pendiente' as const };
    } catch {
      throw new UnauthorizedException('Sesión inválida o vencida');
    }
  }
}
