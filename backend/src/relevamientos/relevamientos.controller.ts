import { BadRequestException, Body, Controller, Get, Inject, NotFoundException, Param, Patch, Post, Put, Query, Res, StreamableFile } from '@nestjs/common';
import type { Response } from 'express';
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

  /** Los últimos relevamientos de un bien (de cualquier relevador). `numero` acepta el número sin ceros. */
  @Get('bienes/:numero/relevamientos')
  async deUnBien(@Usuario() actor: UsuarioActual, @Param('numero') numero: string, @Query('limite') limite?: string) {
    const n = limite === undefined ? 10 : Number(limite);
    if (!Number.isInteger(n) || n < 1) throw new BadRequestException('limite inválido');
    const lista = await this.relevamientos.listarDeBien(actor, numero, Math.min(n, 50));
    if (!lista) throw new NotFoundException();
    return lista;
  }

  /**
   * Adjunta la foto de un hallazgo propio: el cuerpo es el JPEG crudo (Content-Type: image/jpeg).
   * Se identifica por el `idCliente` que el teléfono ya conoce, así reintentar es seguro.
   */
  @Put('relevamientos/cliente/:idCliente/foto')
  subirFoto(@Usuario() actor: UsuarioActual, @Param('idCliente') idCliente: string, @Body() cuerpo: unknown) {
    return this.relevamientos.guardarFoto(actor, idCliente, cuerpo);
  }

  @Get('relevamientos/:id/foto')
  async foto(@Usuario() actor: UsuarioActual, @Param('id') id: string, @Res({ passthrough: true }) res: Response) {
    const foto = await this.relevamientos.obtenerFoto(actor, id);
    res.set({ 'Content-Type': foto.tipo, 'Cache-Control': 'private, max-age=3600' });
    return new StreamableFile(foto.contenido);
  }

  /** Solo administradores: asocia un hallazgo con el bien del catálogo al que corresponde. */
  @Roles('administrador')
  @Patch('relevamientos/:id/vincular')
  vincular(@Usuario() actor: UsuarioActual, @Param('id') id: string, @Body() body: { numeroInventario?: unknown; motivo?: unknown }) {
    return this.relevamientos.vincular(actor, id, body?.numeroInventario, body?.motivo);
  }

  @Get('relevamientos/:id')
  uno(@Usuario() actor: UsuarioActual, @Param('id') id: string) {
    return this.relevamientos.obtener(actor, id);
  }
}
