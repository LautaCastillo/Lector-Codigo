import { Test } from '@nestjs/testing';
import request from 'supertest';
import { describe, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

const prismaFalso = {
  usuario: {
    upsert: async ({ where }: { where: { cuenta: string } }) => ({
      id: 'u1',
      cuenta: where.cuenta,
      activo: true,
    }),
  },
  codigoBien: { findUnique: async () => null },
  bien: { findFirst: async () => null },
};

describe('Autenticación provisoria (e2e)', () => {
  it('health es público, el resto exige x-relevador', async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(prismaFalso)
      .compile();
    const app = mod.createNestApplication();
    await app.init();
    const http = app.getHttpServer();
    await request(http).get('/health').expect(200);
    await request(http).get('/configuracion/simbologias').expect(401);
    await request(http)
      .get('/configuracion/simbologias')
      .set('x-relevador', 'juan')
      .expect(200);
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
    await app.close();
  });
});
