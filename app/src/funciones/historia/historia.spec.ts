import type { CambioBienDto, RelevamientoRegistradoDto } from '@patrimonio/shared';
import { describe, expect, it } from 'vitest';
import type { Comentario } from '../../datos/comentarios';
import type { SituacionDeBien } from '../../datos/situaciones';
import { armarHistoria, filtrarHistoria, type FuentesHistoria } from './historia';

const lectura = (id: string, en: string, extra: Partial<RelevamientoRegistradoDto> = {}) =>
  ({ id, resultado: 'encontrado', relevadoEnDispositivo: en, relevador: 'Ana', propio: false, ubicacionObservada: null, estadoDetectado: null, observaciones: null, ...extra }) as RelevamientoRegistradoDto;

const cambio = (id: string, en: string, operacion: CambioBienDto['operacion'], cambios: CambioBienDto['cambios'] = [], actor: string | null = null): CambioBienDto => ({ id, operacion, en, actor, cambios });

const situacion = (extra: Partial<SituacionDeBien> = {}): SituacionDeBien => ({
  id: 's1',
  situacion: 'en_reparacion',
  motivo: 'Está en el taller',
  declaradaPor: 'Admin',
  declaradaEn: '2026-11-03T10:00:00.000Z',
  levantadaPor: null,
  levantadaEn: null,
  motivoLevantada: null,
  vigente: true,
  ...extra,
});

const comentario = (id: string, creadoEn: string, extra: Partial<Comentario> = {}): Comentario => ({ id, texto: 'Prestado a otra oficina', autor: 'Beto', propio: false, creadoEn, bien: null, ...extra });

const vacio: FuentesHistoria = { lecturas: [], cambios: [], situaciones: [], comentarios: [] };

describe('armarHistoria', () => {
  it('junta todo en una línea de tiempo, del hecho más nuevo al más viejo', () => {
    const h = armarHistoria({
      lecturas: [lectura('r1', '2026-11-02T09:00:00.000Z')],
      cambios: [cambio('c1', '2026-10-01T09:00:00.000Z', 'INSERT')],
      situaciones: [situacion({ declaradaEn: '2026-11-03T10:00:00.000Z' })],
      comentarios: [comentario('m1', '2026-11-04T08:00:00.000Z')],
    });
    expect(h.map((e) => e.tipo)).toEqual(['comentario', 'situacion', 'lectura', 'catalogo']);
  });

  it('marca cuando el bien cambió de lugar respecto de la lectura anterior', () => {
    const h = armarHistoria({
      ...vacio,
      lecturas: [
        lectura('r1', '2026-11-01T09:00:00.000Z', { ubicacionObservada: 'Oficina 1' }),
        lectura('r2', '2026-11-02T09:00:00.000Z', { ubicacionObservada: 'Oficina 1' }),
        lectura('r3', '2026-11-03T09:00:00.000Z', { ubicacionObservada: 'Depósito' }),
      ],
    });
    const [ultima, media, primera] = h;
    expect(ultima?.alerta).toBe(true);
    expect(ultima?.detalle).toContain('Cambió de lugar: Oficina 1 → Depósito');
    expect(media?.alerta).toBe(false);
    expect(primera?.detalle).toEqual(['Ubicación: Oficina 1']);
  });

  it('anota el cambio de estado declarado, aunque las lecturas lleguen desordenadas', () => {
    const h = armarHistoria({
      ...vacio,
      lecturas: [lectura('r2', '2026-11-02T09:00:00.000Z', { estadoDetectado: 'Malo' }), lectura('r1', '2026-11-01T09:00:00.000Z', { estadoDetectado: 'Bueno' })],
    });
    expect(h[0]?.detalle).toContain('Cambió el estado: Bueno → Malo');
    expect(h[1]?.detalle.join('|')).not.toContain('Cambió el estado');
  });

  it('muestra "vos" en lo propio y el nombre en lo ajeno', () => {
    const h = armarHistoria({ ...vacio, lecturas: [lectura('r1', '2026-11-01T09:00:00.000Z', { propio: true }), lectura('r2', '2026-11-02T09:00:00.000Z')] });
    expect(h.map((e) => e.titulo)).toEqual(['Relevado por Ana', 'Relevado por vos']);
    expect(h[1]?.propio).toBe(true);
  });

  it('una situación levantada da dos hechos: cuando se declaró y cuando se levantó', () => {
    const h = armarHistoria({ ...vacio, situaciones: [situacion({ vigente: false, levantadaEn: '2026-11-05T10:00:00.000Z', levantadaPor: 'Admin', motivoLevantada: 'Volvió del taller' })] });
    expect(h.map((e) => e.titulo)).toEqual(['Situación levantada: En reparación', 'Situación declarada: En reparación']);
    expect(h[0]?.detalle).toEqual(['Volvió del taller', 'Por Admin']);
    expect(h[1]?.alerta).toBe(true);
  });

  it('cuenta los cambios del catálogo con sus campos y descarta las actualizaciones que no cambiaron nada', () => {
    const h = armarHistoria({
      ...vacio,
      cambios: [
        cambio('c1', '2026-10-01T09:00:00.000Z', 'INSERT'),
        cambio('c2', '2026-10-02T09:00:00.000Z', 'UPDATE', [{ campo: 'ubicacionFisica', antes: 'Oficina 1', despues: 'Oficina 2' }], 'Admin'),
        cambio('c3', '2026-10-03T09:00:00.000Z', 'UPDATE'),
      ],
    });
    expect(h.map((e) => e.titulo)).toEqual(['Datos del catálogo modificados', 'Alta en el catálogo']);
    expect(h[0]?.detalle).toEqual(['Por Admin', 'Ubicación física: Oficina 1 → Oficina 2']);
    expect(h[1]?.detalle).toEqual(['Por importación de SIU']);
  });

  it('una historia sin nada queda vacía', () => {
    expect(armarHistoria(vacio)).toEqual([]);
  });
});

describe('filtrarHistoria', () => {
  const h = armarHistoria({ ...vacio, lecturas: [lectura('r1', '2026-11-01T09:00:00.000Z')], comentarios: [comentario('m1', '2026-11-02T09:00:00.000Z')] });

  it('deja solo los hechos del tipo pedido', () => {
    expect(filtrarHistoria(h, 'lectura').map((e) => e.tipo)).toEqual(['lectura']);
    expect(filtrarHistoria(h, 'situacion')).toEqual([]);
  });

  it('sin tipo deja todo', () => {
    expect(filtrarHistoria(h, null)).toHaveLength(2);
  });
});
