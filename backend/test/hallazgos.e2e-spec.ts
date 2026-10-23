import type { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { configurarApp } from '../src/configurar-app.js';
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
const uuid = (n: number) => `${String(n).padStart(8, '0')}-0000-4000-8000-000000000000`;
const hora = '2026-10-23T12:00:00.000Z';

interface FilaRel {
  id: string;
  idCliente: string;
  usuarioId: string;
  bienId: string | null;
  resultado: string;
  [clave: string]: unknown;
}
interface FotoFila {
  id: string;
  relevamientoId: string;
  hashSha256: string;
  tipo: string;
  contenido: Uint8Array;
}

/** Relevamientos y fotos en memoria, con lo mínimo que usan el servicio y el controlador. */
function tablas(personas: Map<string, { cuenta: string; nombre: string | null }>) {
  const filas: FilaRel[] = [];
  const fotos = new Map<string, FotoFila>();
  const completa = (f: FilaRel) => ({
    clase: null,
    descripcion: null,
    numeroSerie: null,
    codigoProvisorio: null,
    ...f,
    sincronizadoEn: new Date('2026-10-23T12:05:00Z'),
    usuario: personas.get(f.usuarioId) ?? { cuenta: '?', nombre: null },
    bien: f.bienId ? bien : null,
    foto: fotos.get(f.id) ?? null,
  });
  return {
    filas,
    fotos,
    relevamiento: {
      findMany: async ({ where }: { where: { idCliente?: { in: string[] }; usuarioId?: string } }) =>
        filas
          .filter((f) => (!where.idCliente || where.idCliente.in.includes(f.idCliente)) && (!where.usuarioId || f.usuarioId === where.usuarioId))
          .map(completa),
      findUnique: async ({ where }: { where: { id?: string; idCliente?: string } }) => {
        const f = filas.find((x) => (where.id ? x.id === where.id : x.idCliente === where.idCliente));
        return f ? completa(f) : null;
      },
      createMany: async ({ data }: { data: Omit<FilaRel, 'id'>[] }) => {
        for (const d of data) filas.push({ ...d, id: `r-${filas.length + 1}` } as FilaRel);
        return { count: data.length };
      },
      update: async ({ where, data }: { where: { id: string }; data: Partial<FilaRel> }) => {
        const f = filas.find((x) => x.id === where.id)!;
        Object.assign(f, data);
        return completa(f);
      },
    },
    fotoRelevamiento: {
      create: async ({ data }: { data: Omit<FotoFila, 'id'> }) => void fotos.set(data.relevamientoId, { ...data, id: `f-${fotos.size + 1}` }),
    },
  };
}

const jpeg = (bytes: number) => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(bytes - 4, 7)]);

describe('Hallazgos: registro, foto y vínculo con el catálogo (e2e)', () => {
  const personas = new Map([
    ['id-rel', { cuenta: 'rel', nombre: 'Ana Pérez' }],
    ['id-otro', { cuenta: 'otro', nombre: null }],
  ]);
  const t = tablas(personas);
  const base = Object.assign(baseFalsa([fila('rel', 'activa'), fila('otro', 'activa'), fila('admin', 'activa', 'administrador')]), {
    bien: {
      findFirst: async ({ where }: { where: { numeroInventario: { in: string[] } } }) => (where.numeroInventario.in.includes('00006349') ? { id: 'b1', numeroInventario: '00006349' } : null),
      findMany: async () => [],
    },
    relevamiento: t.relevamiento,
    fotoRelevamiento: t.fotoRelevamiento,
  });
  let app: INestApplication;
  let http: Parameters<typeof request>[0];

  beforeAll(async () => {
    process.env.AUTH_PROVISORIA = 'true';
    const mod = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(PrismaService).useValue(base).compile();
    const nueva = mod.createNestApplication<NestExpressApplication>();
    configurarApp(nueva);
    await nueva.init();
    app = nueva;
    http = nueva.getHttpServer();
  });
  afterAll(async () => {
    await app.close();
    delete process.env.AUTH_PROVISORIA;
  });

  const como = (cuenta: string) => ({ 'x-relevador': cuenta });
  const hallazgo = (n: number, extra: Record<string, unknown> = {}) => ({
    idCliente: uuid(n),
    resultado: 'hallazgo',
    clase: 'no_identificado',
    descripcion: 'Silla giratoria negra sin etiqueta',
    numeroSerie: 'SN-123',
    ubicacionObservada: 'Oficina 12',
    estadoDetectado: 'Malo',
    observaciones: 'Etiqueta despegada',
    relevadoEnDispositivo: hora,
    ...extra,
  });
  const subir = (cuenta: string, items: unknown[]) => request(http).post('/relevamientos').set(como(cuenta)).send({ relevamientos: items });

  it('registra un hallazgo con su código provisorio', async () => {
    const r = await subir('rel', [hallazgo(1)]).expect(201);
    expect(r.body).toEqual({ registrados: 1, duplicados: 0, rechazados: [] });
    expect(t.filas[0]).toMatchObject({
      usuarioId: 'id-rel',
      bienId: null,
      resultado: 'hallazgo',
      clase: 'no_identificado',
      descripcion: 'Silla giratoria negra sin etiqueta',
      numeroSerie: 'SN-123',
      codigoProvisorio: 'H-00000001',
      ubicacionObservada: 'Oficina 12',
    });
  });

  it('un hallazgo ignora el número de inventario que traiga y es idempotente', async () => {
    const r = await subir('rel', [hallazgo(2, { numeroInventario: '00006349' })]).expect(201);
    expect(r.body.registrados).toBe(1);
    expect(t.filas[1]?.bienId).toBeNull();
    const otra = await subir('rel', [hallazgo(2)]).expect(201);
    expect(otra.body).toEqual({ registrados: 0, duplicados: 1, rechazados: [] });
  });

  it('rechaza los hallazgos incompletos', async () => {
    const r = await subir('rel', [
      hallazgo(10, { clase: undefined }),
      hallazgo(11, { clase: 'raro' }),
      hallazgo(12, { descripcion: undefined }),
      hallazgo(13, { descripcion: 'ab' }),
      hallazgo(14, { descripcion: 'x'.repeat(301) }),
      hallazgo(15, { numeroSerie: 'x'.repeat(101) }),
    ]).expect(201);
    expect(r.body.registrados).toBe(0);
    expect(r.body.rechazados.map((x: { motivo: string }) => x.motivo)).toEqual([
      'Un hallazgo necesita una clase válida',
      'Un hallazgo necesita una clase válida',
      'La descripción del hallazgo debe tener entre 3 y 300 caracteres',
      'La descripción del hallazgo debe tener entre 3 y 300 caracteres',
      'La descripción del hallazgo debe tener entre 3 y 300 caracteres',
      'numeroSerie demasiado largo',
    ]);
  });

  it('el listado trae los datos del hallazgo y si tiene foto', async () => {
    const r = await request(http).get('/me/relevamientos').set(como('rel')).expect(200);
    const h = r.body.find((x: { idCliente: string }) => x.idCliente === uuid(1));
    expect(h).toMatchObject({ resultado: 'hallazgo', clase: 'no_identificado', descripcion: 'Silla giratoria negra sin etiqueta', numeroSerie: 'SN-123', codigoProvisorio: 'H-00000001', tieneFoto: false, bien: null });
  });

  it('adjunta la foto: solo JPEG, hasta 1 MB, solo del dueño', async () => {
    const put = (cuenta: string, id: string, cuerpo: Buffer | string, tipo = 'image/jpeg') =>
      request(http).put(`/relevamientos/cliente/${id}/foto`).set(como(cuenta)).set('Content-Type', tipo).send(cuerpo);
    await put('rel', uuid(1), '', 'image/jpeg').expect(400);
    await put('rel', uuid(1), Buffer.from('no soy una foto, soy texto largo'), 'image/jpeg').expect(400);
    await put('rel', uuid(1), jpeg(1_100_000)).expect(400);
    await put('rel', uuid(1), jpeg(1_300_000)).expect(413);
    await put('otro', uuid(1), jpeg(2000)).expect(403);
    await put('rel', uuid(99), jpeg(2000)).expect(404);
    const ok = await put('rel', uuid(1), jpeg(2000)).expect(200);
    expect(ok.body).toMatchObject({ tamano: 2000 });
    expect(ok.body.hashSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(t.fotos.size).toBe(1);
    expect(base.eventos.filter((e) => e.tipo === 'FOTO_ADJUNTADA')).toHaveLength(1);
  });

  it('repetir la misma foto no hace nada y una distinta se rechaza', async () => {
    await request(http).put(`/relevamientos/cliente/${uuid(1)}/foto`).set(como('rel')).set('Content-Type', 'image/jpeg').send(jpeg(2000)).expect(200);
    expect(base.eventos.filter((e) => e.tipo === 'FOTO_ADJUNTADA')).toHaveLength(1);
    await request(http).put(`/relevamientos/cliente/${uuid(1)}/foto`).set(como('rel')).set('Content-Type', 'image/jpeg').send(jpeg(3000)).expect(409);
  });

  it('solo los hallazgos llevan foto', async () => {
    await subir('rel', [{ idCliente: uuid(20), resultado: 'no_encontrado', relevadoEnDispositivo: hora }]).expect(201);
    await request(http).put(`/relevamientos/cliente/${uuid(20)}/foto`).set(como('rel')).set('Content-Type', 'image/jpeg').send(jpeg(2000)).expect(400);
  });

  it('la foto la ven su dueño y los administradores', async () => {
    const id = t.filas.find((f) => f.idCliente === uuid(1))!.id;
    const r = await request(http).get(`/relevamientos/${id}/foto`).set(como('rel')).buffer(true).parse((res, cb) => {
      const partes: Buffer[] = [];
      res.on('data', (d: Buffer) => partes.push(d));
      res.on('end', () => cb(null, Buffer.concat(partes)));
    }).expect(200);
    expect(r.headers['content-type']).toContain('image/jpeg');
    expect(Buffer.isBuffer(r.body) && r.body.length).toBe(2000);
    await request(http).get(`/relevamientos/${id}/foto`).set(como('otro')).expect(403);
    await request(http).get(`/relevamientos/${id}/foto`).set(como('admin')).expect(200);
    const sinFoto = t.filas.find((f) => f.idCliente === uuid(2))!.id;
    await request(http).get(`/relevamientos/${sinFoto}/foto`).set(como('rel')).expect(404);
    const conFoto = await request(http).get('/me/relevamientos').set(como('rel')).expect(200);
    expect(conFoto.body.find((x: { idCliente: string }) => x.idCliente === uuid(1)).tieneFoto).toBe(true);
  });

  it('solo un administrador vincula un hallazgo con el catálogo, con motivo', async () => {
    const id = t.filas.find((f) => f.idCliente === uuid(1))!.id;
    const url = `/relevamientos/${id}/vincular`;
    await request(http).patch(url).set(como('rel')).send({ numeroInventario: '6349', motivo: 'Se reetiquetó' }).expect(403);
    await request(http).patch(url).set(como('admin')).send({ numeroInventario: '6349' }).expect(400);
    await request(http).patch(url).set(como('admin')).send({ motivo: 'Se reetiquetó' }).expect(400);
    await request(http).patch(url).set(como('admin')).send({ numeroInventario: '99999999', motivo: 'Se reetiquetó' }).expect(404);
    const ok = await request(http).patch(url).set(como('admin')).send({ numeroInventario: '6349', motivo: 'Se reetiquetó con el número del catálogo' }).expect(200);
    expect(ok.body).toMatchObject({ resultado: 'hallazgo', codigoProvisorio: 'H-00000001', bien: { numeroInventario: '00006349' } });
    expect(base.eventos.find((e) => e.tipo === 'HALLAZGO_VINCULADO')).toMatchObject({
      actorUsuarioId: 'id-admin',
      motivo: 'Se reetiquetó con el número del catálogo',
      datos: { numeroInventario: '00006349', codigoProvisorio: 'H-00000001' },
    });
    await request(http).patch(url).set(como('admin')).send({ numeroInventario: '6349', motivo: 'Otra vez' }).expect(409);
  });

  it('no se vinculan relevamientos que no son hallazgos', async () => {
    const id = t.filas.find((f) => f.idCliente === uuid(20))!.id;
    await request(http).patch(`/relevamientos/${id}/vincular`).set(como('admin')).send({ numeroInventario: '6349', motivo: 'Prueba' }).expect(400);
  });
});
