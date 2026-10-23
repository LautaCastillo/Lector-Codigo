import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { baseFalsa, fila } from './base-falsa.js';

const bien = {
  id: 'b1',
  numeroInventario: '00006349',
  descripcion: 'FICHERO DE MESA',
  estadoCodigo: 'legible',
  estadoBien: 'Bueno',
  ubicacionFisica: 'ADMINCENTRAL',
  areaResponsable: '1-9 Patrimonio',
  catalogo: '4.3.7.00036 - FICHERO',
  motivoAlta: null,
  valorUnitario: { toString: () => '512' },
  fechaIncorporacion: new Date('1990-09-11T00:00:00Z'),
  numeroSerie: null,
  numeroAnterior: null,
  expediente: null,
  responsableUso: null,
  cantidad: null,
  proveedor: null,
  numeroFactura: null,
  fechaFactura: null,
  titularidad: null,
  creadoEn: new Date('2026-10-22T12:00:00Z'),
  modificadoEn: new Date('2026-10-22T12:00:00Z'),
  codigos: [],
};

describe('Bienes: ficha, búsqueda e historial (e2e)', () => {
  const base = Object.assign(baseFalsa([fila('rel', 'activa'), fila('pend', 'pendiente')]), {
    bien: {
      findFirst: async ({ where }: { where: { numeroInventario?: { in: string[] } } }) =>
        where.numeroInventario?.in.includes('00006349') ? { ...bien, id: 'b1' } : null,
      findMany: async () => [bien],
      groupBy: async () => [{ ubicacionFisica: 'ADMINCENTRAL', _count: { _all: 48 } }],
    },
    cambioFila: {
      findMany: async () => [
        { id: 'c1', operacion: 'INSERT', en: new Date('2026-10-22T12:00:00Z'), actorUsuarioId: null, antes: null, despues: {} },
      ],
    },
  });
  let app: INestApplication;
  let http: Parameters<typeof request>[0];

  beforeAll(async () => {
    process.env.AUTH_PROVISORIA = 'true';
    const mod = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(base)
      .compile();
    app = mod.createNestApplication();
    await app.init();
    http = app.getHttpServer();
  });
  afterAll(async () => {
    await app.close();
    delete process.env.AUTH_PROVISORIA;
  });

  const como = (cuenta: string) => ({ 'x-relevador': cuenta });

  it('devuelve la ficha aunque el número venga sin ceros', async () => {
    const r = await request(http).get('/bienes/6349').set(como('rel')).expect(200);
    expect(r.body).toMatchObject({ numeroInventario: '00006349', valorUnitario: 512, fechaIncorporacion: '1990-09-11' });
    await request(http).get('/bienes/99999999').set(como('rel')).expect(404);
  });

  it('busca por texto y responde vacío con una consulta demasiado corta', async () => {
    const r = await request(http).get('/bienes?q=fichero').set(como('rel')).expect(200);
    expect(r.body[0]).toMatchObject({ numeroInventario: '00006349', estadoBien: 'Bueno' });
    expect(r.body[0]).not.toHaveProperty('valorUnitario');
    await request(http).get('/bienes?q=f').set(como('rel')).expect(200).expect([]);
    await request(http).get('/bienes').set(como('rel')).expect(200).expect([]);
  });

  it('lista las ubicaciones y los bienes esperados de una', async () => {
    await request(http).get('/ubicaciones').set(como('rel')).expect(200).expect([{ nombre: 'ADMINCENTRAL', cantidad: 48 }]);
    const r = await request(http).get('/bienes?ubicacion=ADMINCENTRAL').set(como('rel')).expect(200);
    expect(r.body[0]).toMatchObject({ numeroInventario: '00006349' });
    await request(http).get('/ubicaciones').set(como('pend')).expect(403);
  });

  it('devuelve la línea de tiempo de la ficha', async () => {
    const r = await request(http).get('/bienes/6349/historial').set(como('rel')).expect(200);
    expect(r.body).toEqual([{ id: 'c1', operacion: 'INSERT', en: '2026-10-22T12:00:00.000Z', actor: null, cambios: [] }]);
    await request(http).get('/bienes/99999999/historial').set(como('rel')).expect(404);
  });

  it('una cuenta pendiente no accede a los bienes', async () => {
    await request(http).get('/bienes?q=fichero').set(como('pend')).expect(403);
    await request(http).get('/bienes/6349').set(como('pend')).expect(403);
    await request(http).get('/bienes/6349/historial').set(como('pend')).expect(403);
  });
});
