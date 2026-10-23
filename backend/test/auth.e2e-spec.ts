import { Test } from '@nestjs/testing';
import request from 'supertest';
import { describe, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { baseFalsa, fila } from './base-falsa.js';

async function crearApp(base: object) {
  const mod = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(PrismaService)
    .useValue(base)
    .compile();
  const app = mod.createNestApplication();
  await app.init();
  return app;
}

describe('Autenticación provisoria (e2e)', () => {
  it('health es público, el resto exige x-relevador', async () => {
    process.env.AUTH_PROVISORIA = 'true';
    const base = baseFalsa([fila('juan', 'activa')]);
    const app = await crearApp(base);
    const http = app.getHttpServer();
    await request(http).get('/health').expect(200);
    await request(http).get('/configuracion/simbologias').expect(401);
    await request(http).get('/configuracion/simbologias').set('x-relevador', 'juan').expect(200);
    await request(http)
      .post('/bienes/escaneo')
      .set('x-relevador', 'juan')
      .send({ simbologia: 'code39', valor: '*123*' })
      .expect(201)
      .expect({ encontrado: false });
    await request(http)
      .post('/bienes/escaneo')
      .set('x-relevador', 'juan')
      .send({ simbologia: 'foo', valor: '1' })
      .expect(400);
    await request(http)
      .patch('/me')
      .set('x-relevador', 'juan')
      .send({ nombre: 'Juan Pérez' })
      .expect(200)
      .expect({ cuenta: 'juan', nombre: 'Juan Pérez', rol: 'relevador', estado: 'activa', activo: true });
    await request(http).patch('/me').set('x-relevador', 'juan').send({ nombre: 'a' }).expect(400);
    await app.close();
    delete process.env.AUTH_PROVISORIA;
  });
});

describe('Autenticación con Supabase (e2e)', () => {
  it('sin token válido responde 401 y /me exige sesión', async () => {
    process.env.SUPABASE_URL = 'https://ejemplo.supabase.co';
    try {
      const app = await crearApp(baseFalsa());
      const http = app.getHttpServer();
      await request(http).get('/health').expect(200);
      await request(http).get('/me').expect(401);
      await request(http).get('/me').set('x-relevador', 'juan').expect(401);
      await request(http).get('/me').set('authorization', 'Bearer basura').expect(401);
      await app.close();
    } finally {
      delete process.env.SUPABASE_URL;
    }
  });
});
