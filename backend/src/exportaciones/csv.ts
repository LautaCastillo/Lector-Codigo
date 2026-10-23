import { ETIQUETA_CLASE_CSV, ETIQUETA_RESULTADO_CSV } from './etiquetas.js';

/** Un relevamiento con lo necesario para exportarlo. */
export interface FilaExportable {
  relevadoEnDispositivo: Date;
  sincronizadoEn: Date;
  usuario: { cuenta: string; nombre: string | null };
  loteId: string | null;
  resultado: string;
  simbologia: string | null;
  valorLeido: string | null;
  ubicacionObservada: string | null;
  estadoDetectado: string | null;
  observaciones: string | null;
  /** Solo en hallazgos. */
  clase?: string | null;
  descripcion?: string | null;
  numeroSerie?: string | null;
  codigoProvisorio?: string | null;
  bien: {
    numeroInventario: string;
    descripcion: string | null;
    ubicacionFisica: string | null;
    estadoBien: string | null;
  } | null;
}

export const ENCABEZADOS = [
  'Fecha y hora (teléfono)',
  'Registrado en el servidor',
  'Relevador',
  'Lote',
  'Número patrimonial',
  'Descripción',
  'Resultado',
  'Clase de hallazgo',
  'Código provisorio',
  'Número de serie',
  'Código leído',
  'Tipo de código',
  'Ubicación relevada',
  'Ubicación según catálogo',
  'Estado declarado',
  'Estado según catálogo',
  'Observaciones',
] as const;

/** Las fechas se escriben en hora de Salta, que es la que usan quienes leen el archivo. */
const formatoFecha = new Intl.DateTimeFormat('es-AR', {
  timeZone: 'America/Argentina/Salta',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

export const fechaParaCsv = (f: Date) => formatoFecha.format(f).replace(',', '');

/**
 * Escapa una celda. Además de las comillas, neutraliza las fórmulas: Excel y otras planillas ejecutan
 * una celda que empieza con `=`, `+`, `-` o `@`, y el texto de un relevamiento lo escribe una persona.
 */
export function celda(valor: string | null | undefined): string {
  let texto = (valor ?? '').replace(/\r?\n/g, ' ').trim();
  if (/^[=+\-@\t]/.test(texto)) texto = `'${texto}`;
  return /[";,]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
}

/**
 * CSV separado por punto y coma (lo que Excel en español abre sin asistente), con BOM para que
 * respete los acentos, y saltos de línea CRLF.
 */
export function construirCsv(filas: FilaExportable[]): string {
  const lineas = filas.map((f) =>
    [
      fechaParaCsv(f.relevadoEnDispositivo),
      fechaParaCsv(f.sincronizadoEn),
      f.usuario.nombre ?? f.usuario.cuenta,
      f.loteId?.slice(0, 8),
      f.bien?.numeroInventario,
      f.bien?.descripcion ?? f.descripcion,
      ETIQUETA_RESULTADO_CSV[f.resultado] ?? f.resultado,
      f.clase ? (ETIQUETA_CLASE_CSV[f.clase] ?? f.clase) : '',
      f.codigoProvisorio,
      f.numeroSerie,
      f.valorLeido,
      f.simbologia?.toUpperCase(),
      f.ubicacionObservada,
      f.bien?.ubicacionFisica,
      f.estadoDetectado,
      f.bien?.estadoBien,
      f.observaciones,
    ]
      .map((v) => celda(v))
      .join(';'),
  );
  return `﻿${[ENCABEZADOS.join(';'), ...lineas].join('\r\n')}\r\n`;
}
