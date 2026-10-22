import { BadRequestException, Body, Controller, Get, Inject, Patch } from '@nestjs/common';
import { PermitirPendiente } from '../auth/pendiente.decorator.js';
import { Usuario } from '../auth/usuario.decorator.js';
import type { UsuarioActual } from '../auth/relevador.guard.js';
import { PrismaService } from '../prisma/prisma.service.js';

const vista = ({ cuenta, nombre, rol, activo }: UsuarioActual) => ({ cuenta, nombre, rol, activo });

@Controller()
export class UsuariosController {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  /** La app lo consulta tras iniciar sesión para saber si la cuenta ya fue aprobada. */
  @PermitirPendiente()
  @Get('me')
  yo(@Usuario() usuario: UsuarioActual) {
    return vista(usuario);
  }

  /** El usuario edita su propio nombre. Cuenta, rol y estado solo los cambia un administrador. */
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
