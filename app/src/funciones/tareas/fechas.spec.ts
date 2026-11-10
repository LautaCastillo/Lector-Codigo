import { describe, expect, it } from 'vitest';
import { aFechaIso, estaVencida, fechaEnDias, parsearFecha } from './fechas';

describe('parsearFecha', () => {
  it('entiende día, mes y año con distintos separadores', () => {
    expect(parsearFecha('05/11/2026')).toBe('2026-11-05');
    expect(parsearFecha('5-1-2027')).toBe('2027-01-05');
    expect(parsearFecha(' 15.03.2026 ')).toBe('2026-03-15');
  });

  it('completa el año de dos cifras', () => {
    expect(parsearFecha('05/11/26')).toBe('2026-11-05');
  });

  it('rechaza lo que no es una fecha real', () => {
    expect(parsearFecha('31/02/2026')).toBeNull();
    expect(parsearFecha('32/01/2026')).toBeNull();
    expect(parsearFecha('00/01/2026')).toBeNull();
    expect(parsearFecha('2026-11-05')).toBeNull();
    expect(parsearFecha('mañana')).toBeNull();
    expect(parsearFecha('')).toBeNull();
  });

  it('acepta el 29 de febrero solo en año bisiesto', () => {
    expect(parsearFecha('29/02/2028')).toBe('2028-02-29');
    expect(parsearFecha('29/02/2027')).toBeNull();
  });
});

describe('fechaEnDias', () => {
  const hoy = new Date(2026, 10, 28); // 28/11/2026

  it('suma días pasando de mes y de año', () => {
    expect(fechaEnDias(0, hoy)).toBe('2026-11-28');
    expect(fechaEnDias(1, hoy)).toBe('2026-11-29');
    expect(fechaEnDias(7, hoy)).toBe('2026-12-05');
    expect(fechaEnDias(35, hoy)).toBe('2027-01-02');
  });
});

describe('estaVencida', () => {
  it('una fecha anterior a hoy está vencida; la de hoy y las futuras, no', () => {
    expect(estaVencida('2026-11-09', '2026-11-10')).toBe(true);
    expect(estaVencida('2026-11-10', '2026-11-10')).toBe(false);
    expect(estaVencida('2026-11-11', '2026-11-10')).toBe(false);
  });
});

describe('aFechaIso', () => {
  it('usa la fecha local con ceros a la izquierda', () => {
    expect(aFechaIso(new Date(2026, 0, 5))).toBe('2026-01-05');
  });
});
