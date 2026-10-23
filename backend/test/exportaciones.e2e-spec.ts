import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { createHash } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { baseFalsa, fila } from './base-falsa.js';

const bien = { id: 'b1', numeroInventario: '00006349', descripcion: 'FICHERO', ubicacionFisica: 'ADMINCENTRAL', estadoBien: 'Bueno' };

const relevamiento = (usuarioId: string, resultado: string, ubicacion: string, dia: number, extra: Record<string, unknown> = {}) => ({
  usuarioId,
  resultado,
  ubicacionObservada: ubicacion,
  relevadoEnDispositivo: new Date(Date.UTC(2026, 9, dia, 12)),
  sincronizadoEn: new Date(Date.UTC(2026, 9, dia, 12, 5)),
  loteId: null,
  simbologia: null,
  valorLeido: resultado === 'encontrado' ? '00006349' : '7790001',
  estadoDetectado: null,
  observaciones: null,
  usuario: { cuenta: usuarioId, nombre: null },
  bien: resultado === 'encontrado' ? bien : null,
  ...extra,
});

type Filtro = {
  usuarioId?: string;
  ubicacionObservada?: string;
  resultado?: string;
  relevadoEnDispositivo?: { gte?: Date; lte?: Date };
};

describe('Exportación de relevamientos a CSV (e2e)', () => {
  const datos = [
    relevamiento('id-rel', 'encontrado', 'Sala 1', 20),
    relevamiento('id-rel', 'no_encontrado', 'Sala 2', 21),
    relevamiento('id-otro', 'encontrado', 'Sala 1', 22, { observaciones: '=CMD()' }),
  ];
  const exportaciones: Record<string, unknown>[] = [];
  const base = Object.assign(
    baseFalsa([fila('rel', 'activa'), fila('otro', 'activa'), fila('admin', 'activa', 'administrador'), fila('pend', 'pendiente')]),
    {
      relevamiento: {
        findMany: async ({ where }: { where: Filtro }) =>
          datos.filter(
            (r) =>
              (!where.usuarioId || r.usuarioId === where.usuarioId) &&
              (!where.ubicacionObservada || r.ubicacionObservada === where.ubicacionObservada) &&
              (!where.resultado || r.resultado === where.resultado) &&
              (!where.relevadoEnDispositivo?.gte || r.relevadoEnDispositivo >= where.relevadoEnDispositivo.gte) &&
              (!where.relevadoEnDispositivo?.lte || r.relevadoEnDispositivo <= where.relevadoEnDispositivo.lte),
          ),
      },
      exportacion: { create: async ({ data }: { data: Record<string, unknown> }) => void exportaciones.push(data) },
    },
  );
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
  const lineas = (texto: string) => texto.split('\r\n').filter(Boolean);

  it('un relevador exporta solo lo suyo, con cabeceras de constancia', async () => {
    const r = await request(http).get('/relevamientos/exportar').set(como('rel')).buffer(true).expect(200);
    expect(r.headers['content-type']).toContain('text/csv');
    expect(r.headers['content-disposition']).toMatch(/^attachment; filename="relevamientos-\d{8}-\d{4}\.csv"$/);
    expect(r.headers['x-filas']).toBe('2');
    expect(r.headers['x-truncado']).toBe('0');
    expect(r.text.startsWith('﻿')).toBe(true);
    expect(lineas(r.text)).toHaveLength(3);
    expect(r.headers['x-hash-sha256']).toBe(createHash('sha256').update(r.text).digest('hex'));
  });

  it('deja constancia en la tabla de exportaciones y en la auditoría', () => {
    expect(exportaciones[0]).toMatchObject({ usuarioId: 'id-rel', formato: 'csv', filas: 2, filtros: { alcance: 'propios' } });
    expect(String(exportaciones[0]?.hashSha256)).toMatch(/^[0-9a-f]{64}$/);
    expect(base.eventos.find((e) => e.tipo === 'EXPORTACION_GENERADA')).toMatchObject({
      actorUsuarioId: 'id-rel',
      datos: { formato: 'csv', filas: 2, truncado: false },
    });
  });

  it('un relevador no puede pedir los relevamientos de otra cuenta', async () => {
    const r = await request(http).get('/relevamientos/exportar?usuarioId=id-otro').set(como('rel')).expect(200);
    expect(r.headers['x-filas']).toBe('2');
  });

  it('el administrador exporta todo, o filtra por cuenta', async () => {
    const todo = await request(http).get('/relevamientos/exportar').set(como('admin')).expect(200);
    expect(todo.headers['x-filas']).toBe('3');
    expect(base.eventos.filter((e) => e.tipo === 'EXPORTACION_GENERADA').at(-1)).toMatchObject({ datos: { filtros: { alcance: 'todos' } } });
    const deOtro = await request(http).get('/relevamientos/exportar?usuarioId=id-otro').set(como('admin')).expect(200);
    expect(deOtro.headers['x-filas']).toBe('1');
  });

  it('filtra por ubicación, resultado y fechas', async () => {
    const u = await request(http).get('/relevamientos/exportar?ubicacion=Sala%201').set(como('admin')).expect(200);
    expect(u.headers['x-filas']).toBe('2');
    const res = await request(http).get('/relevamientos/exportar?resultado=no_encontrado').set(como('admin')).expect(200);
    expect(res.headers['x-filas']).toBe('1');
    const fechas = await request(http)
      .get('/relevamientos/exportar?desde=2026-10-21T00:00:00Z&hasta=2026-10-21T23:59:59Z')
      .set(como('admin'))
      .expect(200);
    expect(fechas.headers['x-filas']).toBe('1');
  });

  it('neutraliza fórmulas escritas en las observaciones', async () => {
    const r = await request(http).get('/relevamientos/exportar?usuarioId=id-otro').set(como('admin')).expect(200);
    expect(r.text).toContain("'=CMD()");
    expect(r.text).not.toContain(';=CMD()');
  });

  it('valida los filtros y no deja exportar a las cuentas no activas', async () => {
    await request(http).get('/relevamientos/exportar?resultado=inventado').set(como('rel')).expect(400);
    await request(http).get('/relevamientos/exportar?desde=ayer').set(como('rel')).expect(400);
    await request(http).get('/relevamientos/exportar').set(como('pend')).expect(403);
    await request(http).get('/relevamientos/exportar').expect(401);
  });
});
