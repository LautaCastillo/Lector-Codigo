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

/** Largo del número de inventario en SIU (ej. 00366415). Las etiquetas lo imprimen con ceros a la izquierda. */
export const LARGO_INVENTARIO = 8;

/**
 * Candidatos de número de inventario para un valor normalizado: el valor tal cual, sin ceros a la
 * izquierda y completado a LARGO_INVENTARIO. Cubre códigos con relleno distinto (EAN13, ITF) al guardado.
 */
export function candidatosInventario(valorNormalizado: string): string[] {
  if (!/^\d+$/.test(valorNormalizado)) return [valorNormalizado];
  const sinCeros = valorNormalizado.replace(/^0+/, '') || '0';
  const completo = sinCeros.length <= LARGO_INVENTARIO ? sinCeros.padStart(LARGO_INVENTARIO, '0') : sinCeros;
  return [...new Set([valorNormalizado, sinCeros, completo])];
}
