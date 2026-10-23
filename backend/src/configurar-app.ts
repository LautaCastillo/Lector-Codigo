import type { NestExpressApplication } from '@nestjs/platform-express';

/** Ajustes comunes de la aplicación, compartidos entre el arranque y las pruebas. */
export function configurarApp(app: NestExpressApplication) {
  // Una subida de 500 relevamientos pesa unos 130 KB: el límite por defecto (100 KB) la rechazaría.
  app.useBodyParser('json', { limit: '1mb' });
  // Las fotos de hallazgos viajan como JPEG crudo en el cuerpo (hasta 1 MB, con margen).
  app.useBodyParser('raw', { type: 'image/jpeg', limit: '1.2mb' });
}
