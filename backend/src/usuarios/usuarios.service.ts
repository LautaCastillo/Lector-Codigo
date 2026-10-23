import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { CuentaDto, EstadoCuenta, Rol } from '@patrimonio/shared';
import { ROLES } from '@patrimonio/shared';
import type { UsuarioActual } from '../auth/relevador.guard.js';
import { PrismaService } from '../prisma/prisma.service.js';

export type Accion = 'aprobar' | 'rechazar' | 'suspender' | 'reactivar' | 'baja';

interface Transicion {
  desde: EstadoCuenta[];
  hacia: EstadoCuenta;
  /** Rechazar, suspender y dar de baja exigen un motivo, para que quede constancia. */
  exigeMotivo: boolean;
}

/** Máquina de estados de la cuenta. `baja` es definitiva: no sale de ahí. */
export const TRANSICIONES: Record<Accion, Transicion> = {
  aprobar: { desde: ['pendiente', 'rechazada'], hacia: 'activa', exigeMotivo: false },
  rechazar: { desde: ['pendiente'], hacia: 'rechazada', exigeMotivo: true },
  suspender: { desde: ['activa'], hacia: 'suspendida', exigeMotivo: true },
  reactivar: { desde: ['suspendida'], hacia: 'activa', exigeMotivo: false },
  baja: { desde: ['pendiente', 'activa', 'rechazada', 'suspendida'], hacia: 'baja', exigeMotivo: true },
};

export const esAccion = (valor: string): valor is Accion => valor in TRANSICIONES;

const LARGO_MOTIVO = { min: 3, max: 200 };

function motivoValido(valor: unknown, obligatorio: boolean): string | null {
  const texto = typeof valor === 'string' ? valor.trim() : '';
  if (!texto) {
    if (obligatorio) throw new BadRequestException('Falta el motivo');
    return null;
  }
  if (texto.length < LARGO_MOTIVO.min || texto.length > LARGO_MOTIVO.max) {
    throw new BadRequestException(`El motivo debe tener entre ${LARGO_MOTIVO.min} y ${LARGO_MOTIVO.max} caracteres`);
  }
  return texto;
}

const aDto = (u: {
  id: string;
  cuenta: string;
  nombre: string | null;
  rol: Rol;
  estado: EstadoCuenta;
  creadoEn: Date;
  aprobadoEn: Date | null;
  motivoEstado: string | null;
}): CuentaDto => ({
  id: u.id,
  cuenta: u.cuenta,
  nombre: u.nombre,
  rol: u.rol,
  estado: u.estado,
  creadoEn: u.creadoEn.toISOString(),
  aprobadoEn: u.aprobadoEn?.toISOString() ?? null,
  motivoEstado: u.motivoEstado,
});

@Injectable()
export class UsuariosService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async listar(estado?: EstadoCuenta): Promise<CuentaDto[]> {
    const cuentas = await this.prisma.usuario.findMany({
      where: estado ? { estado } : undefined,
      orderBy: { creadoEn: 'asc' },
    });
    return cuentas.map(aDto);
  }

  /**
   * Aplica una transición de estado. Un administrador no puede cambiar su propia cuenta: así nunca
   * queda el sistema sin administradores activos.
   */
  async cambiarEstado(actor: UsuarioActual, id: string, accion: Accion, datos: { motivo?: unknown; rol?: unknown }) {
    const t = TRANSICIONES[accion];
    const motivo = motivoValido(datos.motivo, t.exigeMotivo);
    const rol = accion === 'aprobar' ? this.rolValido(datos.rol) : undefined;
    const cuenta = await this.cuentaAjena(actor, id);
    if (!t.desde.includes(cuenta.estado)) {
      throw new ConflictException(`No se puede ${accion} una cuenta en estado ${cuenta.estado}`);
    }
    const actualizada = await this.prisma.usuario.update({
      where: { id },
      data: {
        estado: t.hacia,
        motivoEstado: motivo,
        ...(accion === 'aprobar' ? { aprobadoPor: actor.id, aprobadoEn: new Date() } : {}),
        ...(rol ? { rol } : {}),
      },
    });
    return aDto(actualizada);
  }

  async cambiarRol(actor: UsuarioActual, id: string, rol: unknown, motivo: unknown) {
    const nuevo = this.rolValido(rol);
    if (!nuevo) throw new BadRequestException('Falta el rol');
    const texto = motivoValido(motivo, true);
    await this.cuentaAjena(actor, id);
    const actualizada = await this.prisma.usuario.update({
      where: { id },
      data: { rol: nuevo, motivoEstado: `Cambio de rol a ${nuevo}: ${texto}` },
    });
    return aDto(actualizada);
  }

  private rolValido(valor: unknown): Rol | undefined {
    if (valor === undefined) return undefined;
    if (typeof valor !== 'string' || !(ROLES as readonly string[]).includes(valor)) {
      throw new BadRequestException('Rol inválido');
    }
    return valor as Rol;
  }

  private async cuentaAjena(actor: UsuarioActual, id: string) {
    if (id === actor.id) throw new ForbiddenException('No podés cambiar el estado ni el rol de tu propia cuenta');
    const cuenta = await this.prisma.usuario.findUnique({ where: { id } });
    if (!cuenta) throw new NotFoundException('Cuenta inexistente');
    return cuenta;
  }
}
