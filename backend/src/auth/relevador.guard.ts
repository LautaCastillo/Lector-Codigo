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
import { AuditoriaService } from '../auditoria/auditoria.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { PERMITE_INACTIVO } from './inactivo.decorator.js';
import { ES_PUBLICO } from './publico.decorator.js';

export interface UsuarioActual {
  id: string;
  cuenta: string;
  nombre: string | null;
  rol: Rol;
  estado: EstadoCuenta;
  /** Contexto de la solicitud, para dejarlo en el registro de auditoría. */
  sesionId?: string;
  ip?: string;
  userAgent?: string;
}

const MENSAJE_ESTADO: Record<Exclude<EstadoCuenta, 'activa'>, string> = {
  pendiente: 'Cuenta pendiente de aprobación',
  rechazada: 'Cuenta rechazada',
  suspendida: 'Cuenta suspendida',
  baja: 'Cuenta dada de baja',
};

/** El último acceso se registra como mucho una vez cada tanto, para no escribir en la base en cada pedido. */
const REFRESCO_ACCESO_MS = 10 * 60 * 1000;
/** Sesiones cuyo inicio ya se registró, para no consultar la base en cada pedido. */
const MAX_SESIONES_CONOCIDAS = 1000;

/**
 * Único punto de autenticación. Valida el token de Supabase Auth; la cuenta debe estar `activa` (las
 * nuevas nacen `pendiente` hasta que un administrador las apruebe). La autenticación provisoria por
 * cabecera x-relevador solo existe con AUTH_PROVISORIA=true, fuera de producción (ver cargarConfig).
 * El rol y el estado se deciden siempre en la tabla `usuario`, sea cual sea el proveedor de identidad.
 */
@Injectable()
export class RelevadorGuard implements CanActivate {
  private readonly claves;
  private readonly sesionesConocidas = new Set<string>();

  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(CONFIG) private readonly config: Config,
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditoriaService) private readonly auditoria: AuditoriaService,
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
    const usuario = await this.buscarOCrear(identidad);

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
      sesionId: identidad.sesionId,
      ip: req.ip,
      userAgent: req.header('user-agent'),
    };
    await this.registrarInicioDeSesion(req.usuario);
    return true;
  }

  /** Primer acceso de una cuenta: se crea con el estado inicial del proveedor y queda registrado. */
  private async buscarOCrear(identidad: { cuenta: string; nombre: string | null; estadoInicial: EstadoCuenta }) {
    const existente = await this.prisma.usuario.findUnique({ where: { cuenta: identidad.cuenta } });
    if (existente) return existente;
    try {
      return await this.auditoria.conActor(null, async (tx) => {
        const nuevo = await tx.usuario.create({
          data: { cuenta: identidad.cuenta, nombre: identidad.nombre, estado: identidad.estadoInicial },
        });
        await this.auditoria.registrar(
          {
            tipo: 'CUENTA_REGISTRADA',
            actor: { id: nuevo.id, cuenta: nuevo.cuenta, nombre: nuevo.nombre, rol: nuevo.rol, estado: nuevo.estado },
            entidadTipo: 'usuario',
            entidadId: nuevo.id,
            datos: { estadoInicial: nuevo.estado },
          },
          tx,
        );
        return nuevo;
      });
    } catch (error) {
      // Dos primeros pedidos simultáneos: gana uno y el otro encuentra la cuenta ya creada.
      const ya = await this.prisma.usuario.findUnique({ where: { cuenta: identidad.cuenta } });
      if (ya) return ya;
      throw error;
    }
  }

  /** Registra una sola vez por sesión (`session_id` del token) la primera vez que la API la ve. */
  private async registrarInicioDeSesion(actor: UsuarioActual) {
    const { sesionId } = actor;
    if (!sesionId || this.sesionesConocidas.has(sesionId)) return;
    if (!(await this.auditoria.existeInicioDeSesion(sesionId))) {
      await this.auditoria.registrar({ tipo: 'SESION_INICIADA', actor, entidadTipo: 'usuario', entidadId: actor.id });
    }
    if (this.sesionesConocidas.size >= MAX_SESIONES_CONOCIDAS) this.sesionesConocidas.clear();
    this.sesionesConocidas.add(sesionId);
  }

  private identidadDeCabecera(req: Request) {
    const cuenta = req.header('x-relevador')?.trim();
    if (!cuenta) throw new UnauthorizedException('Falta la cabecera x-relevador');
    return { cuenta, nombre: null, estadoInicial: 'activa' as const, sesionId: undefined };
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
      const sesionId = typeof payload.session_id === 'string' ? payload.session_id : undefined;
      return { cuenta, nombre, estadoInicial: 'pendiente' as const, sesionId };
    } catch {
      throw new UnauthorizedException('Sesión inválida o vencida');
    }
  }
}
