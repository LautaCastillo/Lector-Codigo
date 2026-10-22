import { describe, expect, it } from 'vitest';
import { candidatosInventario, normalizarCodigo } from './codigos.js';
import { parsearSimbologias, SIMBOLOGIAS_POR_DEFECTO } from './simbologias.js';

describe('normalizarCodigo', () => {
  it('quita asteriscos de Code 39 y pasa a mayúsculas', () => {
    expect(normalizarCodigo('code39', '*ab-12*')).toBe('AB-12');
  });
  it('no toca el contenido de un QR salvo espacios', () => {
    expect(normalizarCodigo('qr', '  abc  ')).toBe('abc');
  });
  it('elimina caracteres de control', () => {
    expect(normalizarCodigo('code128', '00333013\r\n')).toBe('00333013');
  });
});

describe('candidatosInventario', () => {
  it('genera variante sin ceros a la izquierda', () => {
    expect(candidatosInventario('00333013')).toEqual(['00333013', '333013']);
  });
  it('completa a 8 dígitos un valor sin ceros', () => {
    expect(candidatosInventario('333013')).toEqual(['333013', '00333013']);
  });
  it('encuentra el inventario desde un EAN13 con relleno distinto', () => {
    expect(candidatosInventario('0000000333013')).toContain('00333013');
  });
  it('deja intacto un valor no numérico', () => {
    expect(candidatosInventario('AB-12')).toEqual(['AB-12']);
  });
});

describe('parsearSimbologias', () => {
  it('usa los valores por defecto si está vacío', () => {
    expect(parsearSimbologias('')).toEqual([...SIMBOLOGIAS_POR_DEFECTO]);
  });
  it('filtra inválidos y duplicados', () => {
    expect(parsearSimbologias('code39, EAN13, foo, code39')).toEqual(['code39', 'ean13']);
  });
});
