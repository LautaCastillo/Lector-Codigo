import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module.js';

try {
  process.loadEnvFile();
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
}

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  // Una subida de 500 relevamientos pesa unos 130 KB: el límite por defecto (100 KB) la rechazaría.
  app.useBodyParser('json', { limit: '1mb' });
  await app.listen(process.env.PORT ?? 3000);
}
await bootstrap();
