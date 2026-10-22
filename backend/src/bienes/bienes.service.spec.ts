import { describe, expect, it, vi } from 'vitest';
import { BienesService } from './bienes.service.js';

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
