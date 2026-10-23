import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuditoriaModule } from './auditoria/auditoria.module.js';
import { RelevadorGuard } from './auth/relevador.guard.js';
import { RolesGuard } from './auth/roles.guard.js';
import { BienesModule } from './bienes/bienes.module.js';
import { ConfigModule } from './config/config.module.js';
import { ExportacionesController } from './exportaciones/exportaciones.controller.js';
import { ExportacionesService } from './exportaciones/exportaciones.service.js';
import { HealthController } from './health/health.controller.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { AdminUsuariosController } from './usuarios/admin-usuarios.controller.js';
import { RelevamientosController } from './relevamientos/relevamientos.controller.js';
import { RelevamientosService } from './relevamientos/relevamientos.service.js';
import { UsuariosController } from './usuarios/usuarios.controller.js';
import { UsuariosService } from './usuarios/usuarios.service.js';

@Module({
  imports: [ConfigModule, PrismaModule, AuditoriaModule, BienesModule],
  controllers: [HealthController, UsuariosController, AdminUsuariosController, ExportacionesController, RelevamientosController],
  // El orden importa: primero se identifica al usuario y después se comprueba su rol.
  providers: [
    UsuariosService,
    RelevamientosService,
    ExportacionesService,
    { provide: APP_GUARD, useClass: RelevadorGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
