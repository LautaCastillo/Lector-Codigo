import { BadRequestException, Body, Controller, Get, Inject, Param, Post, Query } from '@nestjs/common';
import { Roles } from '../auth/roles.decorator.js';
import type { UsuarioActual } from '../auth/relevador.guard.js';
import { Usuario } from '../auth/usuario.decorator.js';
import { MAX_POR_SUBIDA, RelevamientosService } from './relevamientos.service.js';

const LIMITE_POR_DEFECTO = 100;
const LIMITE_MAXIMO = 300;

@Roles('administrador', 'relevador')
@Controller()
export class RelevamientosController {
  constructor(@Inject(RelevamientosService) private readonly relevamientos: RelevamientosService) {}

  /** Subida idempotente: repetir el mismo `idCliente` no duplica nada. */
  @Post('relevamientos')
  subir(@Usuario() actor: UsuarioActual, @Body() body: { relevamientos?: unknown }) {
    const lista = body?.relevamientos;
    if (!Array.isArray(lista) || lista.length === 0) throw new BadRequestException('Falta la lista de relevamientos');
    if (lista.length > MAX_POR_SUBIDA) throw new BadRequestException(`Se admiten hasta ${MAX_POR_SUBIDA} relevamientos por subida`);
    return this.relevamientos.registrar(actor, lista);
  }

  @Get('me/relevamientos')
  mios(@Usuario() actor: UsuarioActual, @Query('limite') limite?: string) {
    let n = LIMITE_POR_DEFECTO;
    if (limite !== undefined) {
      n = Number(limite);
      if (!Number.isInteger(n) || n < 1) throw new BadRequestException('limite inválido');
    }
    return this.relevamientos.listarMios(actor, Math.min(n, LIMITE_MAXIMO));
  }

  @Get('relevamientos/:id')
  uno(@Usuario() actor: UsuarioActual, @Param('id') id: string) {
    return this.relevamientos.obtener(actor, id);
  }
}
