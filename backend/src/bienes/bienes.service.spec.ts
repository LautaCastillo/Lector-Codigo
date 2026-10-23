import { describe, expect, it, vi } from 'vitest';
import { BienesService, diferencias } from './bienes.service.js';

const bien = { id: '1', numeroInventario: '333013', descripcion: 'Silla', estadoCodigo: 'legible' };

function crear(prisma: object) {
  return new BienesService(prisma as never);
}

describe('BienesService.resolverEscaneo', () => {
  it('resuelve por código registrado', async () => {
    const svc = crear({
      codigoBien: { findUnique: vi.fn().mockResolvedValue({ bien }) },
      bien: { findFirst: vi.fn() },
    });
    const r = await svc.resolverEscaneo({ simbologia: 'code39', valor: '*abc*' });
    expect(r).toMatchObject({ encontrado: true, via: 'codigo' });
  });

  it('cae al número de inventario probando sin ceros a la izquierda', async () => {
    const findFirst = vi.fn().mockResolvedValue(bien);
    const svc = crear({
      codigoBien: { findUnique: vi.fn().mockResolvedValue(null) },
      bien: { findFirst },
    });
    const r = await svc.resolverEscaneo({ simbologia: 'ean13', valor: '00333013' });
    expect(r.via).toBe('inventario');
    expect(findFirst).toHaveBeenCalledWith({
      where: { numeroInventario: { in: ['00333013', '333013'] } },
    });
  });

  it('informa no encontrado', async () => {
    const svc = crear({
      codigoBien: { findUnique: vi.fn().mockResolvedValue(null) },
      bien: { findFirst: vi.fn().mockResolvedValue(null) },
    });
    expect(await svc.resolverEscaneo({ simbologia: 'qr', valor: 'x' })).toEqual({ encontrado: false });
  });
});

const fila = {
  id: 'b1',
  numeroInventario: '00006349',
  descripcion: 'FICHERO',
  estadoCodigo: 'legible',
  estadoBien: 'Bueno',
  ubicacionFisica: 'ADMINCENTRAL',
  areaResponsable: '1-9 Patrimonio',
  catalogo: '4.3.7.00036 - FICHERO',
  motivoAlta: 'Otros ingresos',
  valorUnitario: { toString: () => '512.50' },
  fechaIncorporacion: new Date('1990-09-11T00:00:00Z'),
  numeroSerie: null,
  numeroAnterior: '400 -461',
  expediente: null,
  responsableUso: null,
  cantidad: null,
  proveedor: null,
  numeroFactura: null,
  fechaFactura: null,
  titularidad: null,
  creadoEn: new Date('2026-10-22T12:00:00Z'),
  modificadoEn: new Date('2026-10-22T12:00:00Z'),
  codigos: [{ simbologia: 'code39', valor: '00006349' }],
};

describe('BienesService.buscarPorInventario', () => {
  it('devuelve la ficha con valor numérico y fechas sin hora', async () => {
    const findFirst = vi.fn().mockResolvedValue(fila);
    const r = await crear({ bien: { findFirst } }).buscarPorInventario('6349');
    expect(findFirst.mock.calls[0]?.[0].where).toEqual({ numeroInventario: { in: ['6349', '00006349'] } });
    expect(r).toMatchObject({
      numeroInventario: '00006349',
      valorUnitario: 512.5,
      fechaIncorporacion: '1990-09-11',
      codigos: [{ simbologia: 'code39', valor: '00006349' }],
    });
  });
  it('devuelve nulo si no existe', async () => {
    const svc = crear({ bien: { findFirst: vi.fn().mockResolvedValue(null) } });
    expect(await svc.buscarPorInventario('1')).toBeNull();
  });
});

describe('BienesService.buscar', () => {
  it('no consulta con menos caracteres de los mínimos', async () => {
    const findMany = vi.fn();
    expect(await crear({ bien: { findMany } }).buscar(' a ')).toEqual([]);
    expect(findMany).not.toHaveBeenCalled();
  });
  it('busca por número, número anterior, descripción, catálogo y ubicación, con tope', async () => {
    const findMany = vi.fn().mockResolvedValue([fila]);
    const r = await crear({ bien: { findMany } }).buscar(' silla ');
    const arg = findMany.mock.calls[0]?.[0];
    expect(arg.take).toBe(30);
    expect(arg.where.OR).toHaveLength(6);
    expect(JSON.stringify(arg.where.OR)).toContain('"contains":"silla"');
    expect(r[0]).toMatchObject({ numeroInventario: '00006349', estadoBien: 'Bueno' });
  });
});

describe('BienesService.historial', () => {
  it('arma la línea de tiempo con las diferencias y el nombre de quien cambió', async () => {
    const svc = crear({
      bien: { findFirst: vi.fn().mockResolvedValue({ id: 'b1', creadoEn: new Date('2026-10-22T12:00:00Z') }) },
      cambioFila: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 'c2',
            operacion: 'UPDATE',
            en: new Date('2026-10-23T10:00:00Z'),
            actorUsuarioId: 'u1',
            antes: { descripcion: 'A', modificadoEn: 'x', estadoBien: 'Bueno' },
            despues: { descripcion: 'B', modificadoEn: 'y', estadoBien: 'Bueno' },
          },
          { id: 'c1', operacion: 'INSERT', en: new Date('2026-10-22T12:00:00Z'), actorUsuarioId: null, antes: null, despues: {} },
        ]),
      },
      usuario: { findMany: vi.fn().mockResolvedValue([{ id: 'u1', cuenta: 'a@b.c', nombre: 'Lauta' }]) },
    });
    const r = await svc.historial('6349');
    expect(r).toEqual([
      { id: 'c2', operacion: 'UPDATE', en: '2026-10-23T10:00:00.000Z', actor: 'Lauta', cambios: [{ campo: 'descripcion', antes: 'A', despues: 'B' }] },
      { id: 'c1', operacion: 'INSERT', en: '2026-10-22T12:00:00.000Z', actor: null, cambios: [] },
    ]);
  });
  it('deduce el alta de la fecha de carga si no hay registro de alta', async () => {
    const svc = crear({
      bien: { findFirst: vi.fn().mockResolvedValue({ id: 'b1', creadoEn: new Date('2026-10-22T12:00:00Z') }) },
      cambioFila: { findMany: vi.fn().mockResolvedValue([]) },
      usuario: { findMany: vi.fn() },
    });
    expect(await svc.historial('6349')).toEqual([
      { id: 'alta-b1', operacion: 'INSERT', en: '2026-10-22T12:00:00.000Z', actor: null, cambios: [] },
    ]);
  });
  it('devuelve nulo si el bien no existe', async () => {
    const svc = crear({ bien: { findFirst: vi.fn().mockResolvedValue(null) } });
    expect(await svc.historial('1')).toBeNull();
  });
});

describe('diferencias', () => {
  it('ignora los campos que cambian solos y detecta altas y bajas de valor', () => {
    expect(diferencias({ a: 1, modificadoEn: 1, b: null }, { a: 1, modificadoEn: 2, b: 'x', c: 3 })).toEqual([
      { campo: 'b', antes: null, despues: 'x' },
      { campo: 'c', antes: null, despues: 3 },
    ]);
  });
});

describe('BienesService.ubicaciones y bienesDeUbicacion', () => {
  it('agrupa las ubicaciones con su cantidad y descarta las vacías', async () => {
    const groupBy = vi.fn().mockResolvedValue([
      { ubicacionFisica: 'Biblioteca', _count: { _all: 4 } },
      { ubicacionFisica: null, _count: { _all: 9 } },
    ]);
    expect(await crear({ bien: { groupBy } }).ubicaciones()).toEqual([{ nombre: 'Biblioteca', cantidad: 4 }]);
  });

  it('lista los bienes esperados de una ubicación, con tope', async () => {
    const findMany = vi.fn().mockResolvedValue([fila]);
    const r = await crear({ bien: { findMany } }).bienesDeUbicacion('ADMINCENTRAL');
    expect(findMany.mock.calls[0]?.[0]).toMatchObject({ where: { ubicacionFisica: 'ADMINCENTRAL' }, take: 1000 });
    expect(r[0]).toMatchObject({ numeroInventario: '00006349' });
  });
});
