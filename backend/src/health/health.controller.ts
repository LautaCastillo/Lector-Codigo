import { Controller, Get } from '@nestjs/common';
import { Publico } from '../auth/publico.decorator.js';

@Controller('health')
export class HealthController {
  @Publico()
  @Get()
  estado() {
    return { estado: 'ok' };
  }
}
