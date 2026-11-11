import type { RelevamientoDto } from '@patrimonio/shared';
import { describe, expect, it } from 'vitest';
import type { FilaAvance } from '../../datos/jornadas';
import { esFalloDeRed } from '../../datos/util';
import { agregarPendiente, aplicarPendientes, buscarEnFilas, marcarRechazos, porEnviarDe, quitarPendientes, rechazadasDe, type Pendiente } from './cola';

const JORNADA = '11111111-1111-4111-8111-111111111111';

const esperada = (numero: string, extra: Partial<FilaAvance> = {}): FilaAvance => ({
  tipo: 'esperado',
  relevamientoId: null,
  bienId: `bien-${numero}`,
  numeroInventario: numero,
  descripcion: `Bien ${numero}`,
  ubicacionFisica: 'Oficina 1',
  areaResponsable: 'Área',
  responsableUso: null,
  estadoBien: null,
  encontrado: false,
  resultado: null,
  ubicacionObservada: null,
  relevador: null,
  relevadoEn: null,
  fueraDeLugar: false,
  lecturas: 0,
  tambienVieron: [],
  discrepancia: false,
  codigoProvisorio: null,
  resuelta: false,
  notaResolucion: null,
  situacion: null,
  motivoSituacion: null,
  vecesSinEncontrar: 0,
  ...extra,
});

const lectura = (id: string, extra: Partial<RelevamientoDto> = {}): RelevamientoDto => ({
  idCliente: id,
  resultado: 'encontrado',
  numeroInventario: '00000001',
  jornadaId: JORNADA,
  relevadoEnDispositivo: '2026-11-02T12:00:00.000Z',
  ...extra,
});

const pendiente = (id: string, extra: Partial<Pendiente> = {}, rel: Partial<RelevamientoDto> = {}): Pendiente => ({
  idCliente: id,
  cuenta: 'cuenta-1',
  relevamiento: lectura(id, rel),
  titulo: 'Título',
  ...extra,
});

describe('esFalloDeRed', () => {
  it('reconoce los mensajes de red de Android, de los navegadores y de los cortes por tiempo', () => {
    expect(esFalloDeRed(new TypeError('Network request failed'))).toBe(true);
    expect(esFalloDeRed({ message: 'TypeError: Failed to fetch' })).toBe(true);
    expect(esFalloDeRed(new Error('timed out'))).toBe(true);
    expect(esFalloDeRed('FetchError: The user aborted a request.')).toBe(true);
  });

  it('no confunde un rechazo del servidor con un corte de red', () => {
    expect(esFalloDeRed(new Error('La jornada está cerrada'))).toBe(false);
    expect(esFalloDeRed({ message: 'permission denied for table relevamiento' })).toBe(false);
    expect(esFalloDeRed(null)).toBe(false);
  });
});

describe('la cola', () => {
  it('no repite una lectura que ya estaba', () => {
    const cola = agregarPendiente([], pendiente('a'));
    expect(agregarPendiente(cola, pendiente('a'))).toHaveLength(1);
    expect(agregarPendiente(cola, pendiente('b'))).toHaveLength(2);
  });

  it('quita las lecturas confirmadas y deja el resto', () => {
    const cola = [pendiente('a'), pendiente('b'), pendiente('c')];
    expect(quitarPendientes(cola, new Set(['a', 'c'])).map((p) => p.idCliente)).toEqual(['b']);
  });

  it('anota el rechazo solo en las indicadas, y las rechazadas no se vuelven a enviar', () => {
    const cola = marcarRechazos([pendiente('a'), pendiente('b')], new Map([['b', 'La jornada está cerrada']]));
    expect(porEnviarDe(cola, 'cuenta-1').map((p) => p.idCliente)).toEqual(['a']);
    expect(rechazadasDe(cola, 'cuenta-1').map((p) => p.rechazo)).toEqual(['La jornada está cerrada']);
  });

  it('solo envía las lecturas de la cuenta con sesión abierta', () => {
    const cola = [pendiente('a'), pendiente('b', { cuenta: 'otra' })];
    expect(porEnviarDe(cola, 'cuenta-1').map((p) => p.idCliente)).toEqual(['a']);
    expect(porEnviarDe(cola, null)).toEqual([]);
  });
});

describe('buscarEnFilas', () => {
  const filas = [esperada('00000001'), esperada('00000002'), { ...esperada('00000003'), tipo: 'extra' as const }];

  it('encuentra un bien esperado por su número, aunque el código venga con otro relleno de ceros', () => {
    expect(buscarEnFilas(filas, 'code39', '00000002')?.numeroInventario).toBe('00000002');
    expect(buscarEnFilas(filas, 'code39', '2')?.numeroInventario).toBe('00000002');
  });

  it('no encuentra lo que no es esperado de la jornada', () => {
    expect(buscarEnFilas(filas, 'code39', '00000003')).toBeUndefined();
    expect(buscarEnFilas(filas, 'code39', '99999999')).toBeUndefined();
  });
});

describe('aplicarPendientes', () => {
  it('marca como encontrado un bien esperado que se leyó acá y todavía no se envió', () => {
    const filas = [esperada('00000001'), esperada('00000002')];
    const r = aplicarPendientes(filas, [pendiente('a', {}, { numeroInventario: '00000001', ubicacionObservada: 'Oficina 2' })], JORNADA, 'Ana');
    expect(r[0]).toMatchObject({ encontrado: true, relevador: 'Ana', sinEnviar: true, fueraDeLugar: true, ubicacionObservada: 'Oficina 2' });
    expect(r[1]?.encontrado).toBe(false);
  });

  it('un pendiente que se repetía deja de repetirse al leerlo acá', () => {
    const r = aplicarPendientes([esperada('00000001', { vecesSinEncontrar: 3 })], [pendiente('a')], JORNADA, 'Ana');
    expect(r[0]).toMatchObject({ encontrado: true, vecesSinEncontrar: 0 });
  });

  it('no modifica las filas originales', () => {
    const filas = [esperada('00000001')];
    aplicarPendientes(filas, [pendiente('a')], JORNADA, 'Ana');
    expect(filas[0]?.encontrado).toBe(false);
  });

  it('no pisa a quien ya había relevado el bien', () => {
    const filas = [esperada('00000001', { encontrado: true, relevador: 'Beto', lecturas: 1 })];
    const r = aplicarPendientes(filas, [pendiente('a')], JORNADA, 'Ana');
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ relevador: 'Beto' });
    expect(r[0]?.sinEnviar).toBeUndefined();
  });

  it('agrega como "otros" lo que no es esperado de la jornada', () => {
    const r = aplicarPendientes([esperada('00000001')], [pendiente('a', { titulo: '00000009 · Mesa' }, { numeroInventario: '00000009' })], JORNADA, 'Ana');
    expect(r).toHaveLength(2);
    expect(r[1]).toMatchObject({ tipo: 'extra', numeroInventario: '00000009', descripcion: '00000009 · Mesa', sinEnviar: true });
  });

  it('muestra como "otros" una lectura que falta comprobar en el catálogo', () => {
    const p = pendiente('a', { porResolver: true, titulo: 'Código 123' }, { resultado: 'no_encontrado', numeroInventario: undefined, valorLeido: '123' });
    const r = aplicarPendientes([esperada('00000001')], [p], JORNADA, 'Ana');
    expect(r[0]?.encontrado).toBe(false);
    expect(r[1]).toMatchObject({ tipo: 'extra', descripcion: 'Código 123', sinEnviar: true });
  });

  it('ignora las rechazadas y las de otra jornada', () => {
    const rechazada = pendiente('a', { rechazo: 'cerrada' });
    const otraJornada = pendiente('b', {}, { jornadaId: '22222222-2222-4222-8222-222222222222' });
    expect(aplicarPendientes([esperada('00000001')], [rechazada, otraJornada], JORNADA, 'Ana')).toHaveLength(1);
    expect(aplicarPendientes([esperada('00000001')], [rechazada, otraJornada], JORNADA, 'Ana')[0]?.encontrado).toBe(false);
  });
});
