import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  Post,
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

  @Get('bienes/:numeroInventario')
  async porInventario(@Param('numeroInventario') numero: string) {
    const bien = await this.bienes.buscarPorInventario(numero);
    if (!bien) throw new NotFoundException();
    return bien;
  }
}
