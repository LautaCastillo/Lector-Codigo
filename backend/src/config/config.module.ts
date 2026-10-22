import { Global, Module } from '@nestjs/common';
import { cargarConfig } from './config.js';

export const CONFIG = 'CONFIG';

@Global()
@Module({
  providers: [{ provide: CONFIG, useFactory: () => cargarConfig() }],
  exports: [CONFIG],
})
export class ConfigModule {}
