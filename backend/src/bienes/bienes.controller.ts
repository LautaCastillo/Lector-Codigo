import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { esSimbologia, type EscaneoDto, type Simbologia } from '@patrimonio/shared';
import { Roles } from '../auth/roles.decorator.js';
import { CONFIG } from '../config/config.module.js';
import type { Config } from '../config/config.js';
import { BienesService } from './bienes.service.js';

@Roles('administrador', 'relevador')
@Controller()
export class BienesController {
  constructor(
    @Inject(BienesService) private readonly bienes: BienesService,
    @Inject(CONFIG) private readonly config: Config,
  ) {}

  /** La app lee esta lista al iniciar para configurar el escáner. */
  @Get('configuracion/simbologias')
  simbologias(): { habilitadas: Simbologia[] } {
    return { habilitadas: this.config.simbologiasHabilitadas };
  }

  @Post('bienes/escaneo')
  escaneo(@Body() body: EscaneoDto) {
    if (!body || typeof body.valor !== 'string' || !body.valor.trim() || !esSimbologia(body.simbologia)) {
      throw new BadRequestException('simbologia y valor son obligatorios');
    }
    return this.bienes.resolverEscaneo(body);
  }

  /**
   * Búsqueda manual (`?q=`): con menos caracteres de los mínimos devuelve una lista vacía.
   * Con `?ubicacion=` (nombre exacto) devuelve los bienes que el catálogo ubica ahí.
   */
  @Get('bienes')
  buscar(@Query('q') q?: string, @Query('ubicacion') ubicacion?: string) {
    if (typeof ubicacion === 'string' && ubicacion.trim()) return this.bienes.bienesDeUbicacion(ubicacion.trim());
    return this.bienes.buscar(typeof q === 'string' ? q : '');
  }

  @Get('ubicaciones')
  ubicaciones() {
    return this.bienes.ubicaciones();
  }

  @Get('bienes/:numeroInventario')
  async porInventario(@Param('numeroInventario') numero: string) {
    const bien = await this.bienes.buscarPorInventario(numero);
    if (!bien) throw new NotFoundException();
    return bien;
  }

  /** Línea de tiempo de la ficha: alta en el catálogo y cambios posteriores, con quién los hizo. */
  @Get('bienes/:numeroInventario/historial')
  async historial(@Param('numeroInventario') numero: string) {
    const cambios = await this.bienes.historial(numero);
    if (!cambios) throw new NotFoundException();
    return cambios;
  }
}
