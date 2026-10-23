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
  areaResponsable: null,
  catalogo: null,
};

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const LOTE = uuid(900);
const hora = '2026-10-23T12:00:00.000Z';

interface FilaRelevamiento {
  id: string;
  idCliente: string;
  usuarioId: string;
  bienId: string | null;
  resultado: string;
  loteId: string | null;
  [clave: string]: unknown;
}

/** Tabla `relevamiento` en memoria, con lo mínimo que usan el servicio y el controlador. */
function tablaRelevamiento(personas: Map<string, { cuenta: string; nombre: string | null }>) {
  const filas: FilaRelevamiento[] = [];
  const conRelaciones = (f: FilaRelevamiento) => ({
    ...f,
    sincronizadoEn: new Date('2026-10-23T12:05:00Z'),
    usuario: personas.get(f.usuarioId) ?? { cuenta: '?', nombre: null },
    bien: f.bienId ? bien : null,
  });
  return {
    filas,
    findMany: async ({ where, take }: { where: { idCliente?: { in: string[] }; usuarioId?: string }; take?: number }) =>
      filas
        .filter((f) => (!where.idCliente || where.idCliente.in.includes(f.idCliente)) && (!where.usuarioId || f.usuarioId === where.usuarioId))
        .slice(0, take)
        .map(conRelaciones),
    findUnique: async ({ where }: { where: { id: string } }) => {
      const f = filas.find((x) => x.id === where.id);
      return f ? conRelaciones(f) : null;
    },
    createMany: async ({ data }: { data: Omit<FilaRelevamiento, 'id'>[] }) => {
      for (const d of data) filas.push({ ...d, id: `r-${filas.length + 1}` } as FilaRelevamiento);
      return { count: data.length };
    },
  };
}

describe('Relevamientos: subida idempotente, listado y detalle (e2e)', () => {
  const personas = new Map([
    ['id-rel', { cuenta: 'rel', nombre: 'Ana Pérez' }],
    ['id-otro', { cuenta: 'otro', nombre: null }],
  ]);
  const tabla = tablaRelevamiento(personas);
  const base = Object.assign(baseFalsa([fila('rel', 'activa'), fila('otro', 'activa'), fila('admin', 'activa', 'administrador'), fila('pend', 'pendiente')]), {
    bien: { findMany: async ({ where }: { where: { numeroInventario: { in: string[] } } }) => (where.numeroInventario.in.includes('00006349') ? [{ id: 'b1', numeroInventario: '00006349' }] : []) },
    relevamiento: tabla,
  });
  let app: INestApplication;
  let http: Parameters<typeof request>[0];

  beforeAll(async () => {
    process.env.AUTH_PROVISORIA = 'true';
    const mod = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(PrismaService).useValue(base).compile();
    app = mod.createNestApplication();
    await app.init();
    http = app.getHttpServer();
  });
  afterAll(async () => {
    await app.close();
    delete process.env.AUTH_PROVISORIA;
  });

  const como = (cuenta: string) => ({ 'x-relevador': cuenta });
  const encontrado = (n: number) => ({ idCliente: uuid(n), loteId: LOTE, resultado: 'encontrado', numeroInventario: '00006349', simbologia: 'code39', valorLeido: '00006349', ubicacionObservada: 'ADMINCENTRAL', relevadoEnDispositivo: hora });
  const fuera = (n: number) => ({ idCliente: uuid(n), loteId: LOTE, resultado: 'no_encontrado', simbologia: 'ean13', valorLeido: '7790001', ubicacionObservada: 'ADMINCENTRAL', relevadoEnDispositivo: hora });

  it('registra una subida y deja un evento de auditoría', async () => {
    const r = await request(http).post('/relevamientos').set(como('rel')).send({ relevamientos: [encontrado(1), fuera(2)] }).expect(201);
    expect(r.body).toEqual({ registrados: 2, duplicados: 0, rechazados: [] });
    expect(tabla.filas.find((f) => f.idCliente === uuid(1))).toMatchObject({ usuarioId: 'id-rel', bienId: 'b1', resultado: 'encontrado', loteId: LOTE });
    expect(tabla.filas.find((f) => f.idCliente === uuid(2))).toMatchObject({ bienId: null, resultado: 'no_encontrado' });
    const evento = base.eventos.find((e) => e.tipo === 'RELEVAMIENTO_REGISTRADO');
    expect(evento).toMatchObject({ actorUsuarioId: 'id-rel', datos: { cantidad: 2, ubicacion: 'ADMINCENTRAL', loteId: LOTE } });
  });

  it('es idempotente: repetir la subida no duplica ni genera otro evento', async () => {
    const antes = base.eventos.length;
    const r = await request(http).post('/relevamientos').set(como('rel')).send({ relevamientos: [encontrado(1), fuera(2)] }).expect(201);
    expect(r.body).toEqual({ registrados: 0, duplicados: 2, rechazados: [] });
    expect(tabla.filas).toHaveLength(2);
    expect(base.eventos).toHaveLength(antes);
  });

  it('rechaza lo inválido sin frenar el resto de la subida', async () => {
    const r = await request(http)
      .post('/relevamientos')
      .set(como('rel'))
      .send({
        relevamientos: [
          encontrado(3),
          { ...fuera(4), idCliente: 'no-es-uuid' },
          { ...encontrado(5), numeroInventario: '99999999' },
          { ...fuera(6), resultado: 'inventado' },
          { ...fuera(7), relevadoEnDispositivo: 'ayer' },
          { ...encontrado(8), numeroInventario: undefined },
          fuera(3),
        ],
      })
      .expect(201);
    expect(r.body.registrados).toBe(1);
    const motivos = r.body.rechazados.map((x: { motivo: string }) => x.motivo);
    expect(motivos).toEqual(
      expect.arrayContaining([
        'idCliente debe ser un UUID',
        'El bien no existe en el catálogo',
        'resultado inválido',
        'relevadoEnDispositivo debe ser una fecha ISO 8601',
        'Un bien encontrado necesita numeroInventario',
        'idCliente repetido en la subida',
      ]),
    );
  });

  it('no deja pisar el identificador de otra cuenta', async () => {
    const r = await request(http).post('/relevamientos').set(como('otro')).send({ relevamientos: [fuera(2)] }).expect(201);
    expect(r.body).toEqual({ registrados: 0, duplicados: 0, rechazados: [{ idCliente: uuid(2), motivo: 'idCliente ya usado por otra cuenta' }] });
  });

  it('valida la forma del pedido y las cuentas no activas no suben', async () => {
    await request(http).post('/relevamientos').set(como('rel')).send({}).expect(400);
    await request(http).post('/relevamientos').set(como('rel')).send({ relevamientos: [] }).expect(400);
    await request(http).post('/relevamientos').set(como('rel')).send({ relevamientos: Array.from({ length: 501 }, (_, i) => ({ idCliente: uuid(1000 + i), resultado: 'no_encontrado', relevadoEnDispositivo: hora })) }).expect(400);
    await request(http).post('/relevamientos').set(como('pend')).send({ relevamientos: [fuera(50)] }).expect(403);
    await request(http).post('/relevamientos').send({ relevamientos: [fuera(50)] }).expect(401);
  });

  it('cada persona lista solo sus relevamientos, con el bien y quién los hizo', async () => {
    const r = await request(http).get('/me/relevamientos').set(como('rel')).expect(200);
    expect(r.body.length).toBe(3);
    expect(r.body.every((x: { relevador: string }) => x.relevador === 'Ana Pérez')).toBe(true);
    const conBien = r.body.find((x: { idCliente: string }) => x.idCliente === uuid(1));
    expect(conBien).toMatchObject({ resultado: 'encontrado', loteId: LOTE, ubicacionObservada: 'ADMINCENTRAL', bien: { numeroInventario: '00006349', estadoBien: 'Bueno' } });
    expect(conBien.bien).not.toHaveProperty('valorUnitario');
    await request(http).get('/me/relevamientos').set(como('otro')).expect(200).expect([]);
    await request(http).get('/me/relevamientos?limite=0').set(como('rel')).expect(400);
  });

  it('el detalle es de su dueño o de un administrador', async () => {
    const id = tabla.filas.find((f) => f.idCliente === uuid(1))!.id;
    const propio = await request(http).get(`/relevamientos/${id}`).set(como('rel')).expect(200);
    expect(propio.body).toMatchObject({ id, relevador: 'Ana Pérez', sincronizadoEn: '2026-10-23T12:05:00.000Z', relevadoEnDispositivo: hora });
    await request(http).get(`/relevamientos/${id}`).set(como('otro')).expect(403);
    await request(http).get(`/relevamientos/${id}`).set(como('admin')).expect(200);
    await request(http).get('/relevamientos/no-existe').set(como('rel')).expect(404);
  });

  it('la actividad refleja el registro de relevamientos', async () => {
    expect(base.eventos.filter((e) => e.tipo === 'RELEVAMIENTO_REGISTRADO')).toHaveLength(2);
    const r = await request(http).get('/me/actividad').set(como('rel')).expect(200);
    expect(r.body.some((e: { tipo: string }) => e.tipo === 'RELEVAMIENTO_REGISTRADO')).toBe(true);
  });
});
