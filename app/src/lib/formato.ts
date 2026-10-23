/** Formato de datos de un bien para mostrarlos en pantalla. */

/** `aaaa-mm-dd` (o ISO completo) a `dd/mm/aaaa`, sin pasar por la zona horaria del teléfono. */
export function fechaCorta(iso: string | null | undefined): string {
  const m = iso?.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '—';
}

export function fechaHora(iso: string): string {
  return new Date(iso).toLocaleString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function moneda(valor: number | null | undefined): string {
  if (valor === null || valor === undefined) return '—';
  return valor.toLocaleString('es-AR', { style: 'currency', currency: 'ARS' });
}

/** Nombre legible de cada campo de un bien, tal como figura en las columnas de los registros de cambios. */
export const ETIQUETA_CAMPO: Record<string, string> = {
  numeroInventario: 'Número patrimonial',
  descripcion: 'Descripción',
  estadoCodigo: 'Estado del código',
  estadoBien: 'Estado',
  ubicacionFisica: 'Ubicación física',
  areaResponsable: 'Área responsable',
  catalogo: 'Catálogo',
  motivoAlta: 'Motivo de alta',
  valorUnitario: 'Valor',
  fechaIncorporacion: 'Fecha de incorporación',
  numeroSerie: 'Número de serie',
  numeroAnterior: 'Número anterior',
  expediente: 'Expediente',
  responsableUso: 'Responsable de uso',
  cantidad: 'Cantidad',
  proveedor: 'Proveedor',
  numeroFactura: 'N.º de factura',
  fechaFactura: 'Fecha de factura',
  titularidad: 'Titularidad',
};

/** Valor de un campo en el historial: fechas y montos con su formato, y "—" si está vacío. */
export function valorLegible(campo: string, valor: unknown): string {
  if (valor === null || valor === undefined || valor === '') return '—';
  if (campo === 'valorUnitario') return moneda(Number(valor));
  if ((campo === 'fechaIncorporacion' || campo === 'fechaFactura') && typeof valor === 'string') return fechaCorta(valor);
  return String(valor);
}

export type TonoEstado = 'bueno' | 'malo' | 'neutro';

/** Qué color lleva el estado del bien. Siempre se acompaña con el texto, nunca solo con color. */
export function tonoEstado(estado: string | null): TonoEstado {
  const e = estado?.toLowerCase() ?? '';
  if (e.includes('bueno')) return 'bueno';
  if (e.includes('malo') || e.includes('roto') || e.includes('deterior')) return 'malo';
  return 'neutro';
}

export const ETIQUETA_CODIGO: Record<string, string> = {
  sin_codigo: 'Sin código',
  codigo_danado: 'Código dañado',
  desconocido: 'Código desconocido',
};
