import { Module } from '@nestjs/common';
import { BienesController } from './bienes.controller.js';
import { BienesService } from './bienes.service.js';

@Module({ controllers: [BienesController], providers: [BienesService], exports: [BienesService] })
export class BienesModule {}
