import { BadRequestException, Body, Controller, Get, Inject, NotFoundException, Param, Patch, Post, Query } from '@nestjs/common';
import { ESTADOS_CUENTA, type EstadoCuenta } from '@patrimonio/shared';
import { Roles } from '../auth/roles.decorator.js';
import type { UsuarioActual } from '../auth/relevador.guard.js';
import { Usuario } from '../auth/usuario.decorator.js';
import { esAccion, UsuariosService } from './usuarios.service.js';

/** Administración de cuentas: solo para administradores. */
@Roles('administrador')
@Controller('admin/usuarios')
export class AdminUsuariosController {
  constructor(@Inject(UsuariosService) private readonly usuarios: UsuariosService) {}

  /** `?estado=pendiente` lista las solicitudes de acceso. */
  @Get()
  listar(@Query('estado') estado?: string) {
    if (estado !== undefined && !(ESTADOS_CUENTA as readonly string[]).includes(estado)) {
      throw new BadRequestException('Estado inválido');
    }
    return this.usuarios.listar(estado as EstadoCuenta | undefined);
  }

  /** accion: aprobar (con rol opcional), rechazar, suspender, reactivar o baja (con motivo). */
  @Post(':id/:accion')
  cambiarEstado(
    @Usuario() actor: UsuarioActual,
    @Param('id') id: string,
    @Param('accion') accion: string,
    @Body() body: { motivo?: unknown; rol?: unknown },
  ) {
    if (!esAccion(accion)) throw new NotFoundException();
    return this.usuarios.cambiarEstado(actor, id, accion, body ?? {});
  }

  @Patch(':id/rol')
  cambiarRol(
    @Usuario() actor: UsuarioActual,
    @Param('id') id: string,
    @Body() body: { rol?: unknown; motivo?: unknown },
  ) {
    return this.usuarios.cambiarRol(actor, id, body?.rol, body?.motivo);
  }
}
