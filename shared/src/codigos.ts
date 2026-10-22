import type { Simbologia } from './simbologias.js';

/**
 * Normaliza el valor leído: quita espacios, caracteres de control y, en Code 39,
 * los asteriscos delimitadores. Mayúsculas para simbologías alfanuméricas lineales.
 */
export function normalizarCodigo(simbologia: Simbologia, valor: string): string {
  // eslint-disable-next-line no-control-regex
  let v = valor.replace(/[\u0000-\u001f\u007f]/g, '').trim();
  if (simbologia === 'code39') {
    v = v.replace(/^\*+|\*+$/g, '');
  }
  if (simbologia === 'code39' || simbologia === 'code93' || simbologia === 'code128') {
    v = v.toUpperCase();
  }
  return v;
}

/** Candidatos de número de inventario para un valor normalizado (con y sin ceros a la izquierda). */
export function candidatosInventario(valorNormalizado: string): string[] {
  if (!/^\d+$/.test(valorNormalizado)) return [valorNormalizado];
  const sinCeros = valorNormalizado.replace(/^0+/, '') || '0';
  return [...new Set([valorNormalizado, sinCeros])];
}
