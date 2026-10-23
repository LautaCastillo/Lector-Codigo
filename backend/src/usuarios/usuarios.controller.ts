import { BadRequestException, Body, Controller, Get, Inject, Patch } from '@nestjs/common';
import { PermitirInactivo } from '../auth/inactivo.decorator.js';
import { Roles } from '../auth/roles.decorator.js';
import { Usuario } from '../auth/usuario.decorator.js';
import type { UsuarioActual } from '../auth/relevador.guard.js';
import { PrismaService } from '../prisma/prisma.service.js';

/** `activo` se conserva para la app; el estado completo viaja en `estado`. */
const vista = ({ cuenta, nombre, rol, estado }: UsuarioActual) => ({
  cuenta,
  nombre,
  rol,
  estado,
  activo: estado === 'activa',
});

@Controller()
export class UsuariosController {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  /** La app lo consulta tras iniciar sesión para saber el estado de su cuenta (aunque no esté activa). */
  @PermitirInactivo()
  @Get('me')
  yo(@Usuario() usuario: UsuarioActual) {
    return vista(usuario);
  }

  /** El usuario edita su propio nombre. Cuenta, rol y estado solo los cambia un administrador. */
  @Roles('administrador', 'relevador')
  @Patch('me')
  async actualizar(@Usuario() usuario: UsuarioActual, @Body() body: { nombre?: unknown }) {
    const nombre = typeof body?.nombre === 'string' ? body.nombre.trim() : '';
    if (nombre.length < 3 || nombre.length > 80) {
      throw new BadRequestException('El nombre debe tener entre 3 y 80 caracteres');
    }
    await this.prisma.usuario.update({ where: { id: usuario.id }, data: { nombre } });
    return vista({ ...usuario, nombre });
  }
}
