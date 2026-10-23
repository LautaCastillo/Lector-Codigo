import { BadRequestException, Controller, Get, Inject, Query, Res } from '@nestjs/common';
import { RESULTADOS_RELEVAMIENTO, type ResultadoRelevamiento } from '@patrimonio/shared';
import type { Response } from 'express';
import type { UsuarioActual } from '../auth/relevador.guard.js';
import { Roles } from '../auth/roles.decorator.js';
import { Usuario } from '../auth/usuario.decorator.js';
import { ExportacionesService, type FiltroExportacion } from './exportaciones.service.js';

function fecha(valor: string | undefined, nombre: string) {
  if (valor === undefined) return undefined;
  const f = new Date(valor);
  if (Number.isNaN(f.getTime())) throw new BadRequestException(`${nombre} inválida (usar formato ISO 8601)`);
  return f;
}

@Roles('administrador', 'relevador')
@Controller()
export class ExportacionesController {
  constructor(@Inject(ExportacionesService) private readonly exportaciones: ExportacionesService) {}

  /**
   * Descarga los relevamientos en CSV. Los datos de la constancia (filas y huella) viajan en cabeceras,
   * para que la app los muestre sin tener que leer el archivo.
   */
  @Get('relevamientos/exportar')
  async exportar(
    @Usuario() actor: UsuarioActual,
    @Res({ passthrough: true }) res: Response,
    @Query() q: { desde?: string; hasta?: string; ubicacion?: string; resultado?: string; usuarioId?: string; mios?: string },
  ) {
    if (q.resultado !== undefined && !(RESULTADOS_RELEVAMIENTO as readonly string[]).includes(q.resultado)) {
      throw new BadRequestException('resultado inválido');
    }
    if (q.ubicacion !== undefined && q.ubicacion.length > 300) throw new BadRequestException('ubicacion demasiado larga');
    const filtro: FiltroExportacion = {
      desde: fecha(q.desde, 'desde'),
      hasta: fecha(q.hasta, 'hasta'),
      ubicacion: q.ubicacion?.trim() || undefined,
      resultado: q.resultado as ResultadoRelevamiento | undefined,
      usuarioId: q.mios === '1' || q.mios === 'true' ? actor.id : q.usuarioId,
    };
    const archivo = await this.exportaciones.exportarCsv(actor, filtro);
    res.set({
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${archivo.nombre}"`,
      'X-Filas': String(archivo.filas),
      'X-Hash-Sha256': archivo.hash,
      'X-Truncado': archivo.truncado ? '1' : '0',
      'Access-Control-Expose-Headers': 'X-Filas, X-Hash-Sha256, X-Truncado, Content-Disposition',
    });
    return archivo.csv;
  }
}
