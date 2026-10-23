import { Global, Module } from '@nestjs/common';
import { AuditoriaController } from './auditoria.controller.js';
import { AuditoriaService } from './auditoria.service.js';

@Global()
@Module({ controllers: [AuditoriaController], providers: [AuditoriaService], exports: [AuditoriaService] })
export class AuditoriaModule {}
