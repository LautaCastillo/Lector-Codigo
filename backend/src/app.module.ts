import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { RelevadorGuard } from './auth/relevador.guard.js';
import { BienesModule } from './bienes/bienes.module.js';
import { ConfigModule } from './config/config.module.js';
import { HealthController } from './health/health.controller.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { UsuariosController } from './usuarios/usuarios.controller.js';

@Module({
  imports: [ConfigModule, PrismaModule, BienesModule],
  controllers: [HealthController, UsuariosController],
  providers: [{ provide: APP_GUARD, useClass: RelevadorGuard }],
})
export class AppModule {}
