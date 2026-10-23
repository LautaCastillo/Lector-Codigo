import { describe, expect, it } from 'vitest';
import { celda, construirCsv, ENCABEZADOS, fechaParaCsv, type FilaExportable } from './csv.js';
import { nombreDeArchivo } from './exportaciones.service.js';

const fila = (extra: Partial<FilaExportable> = {}): FilaExportable => ({
  relevadoEnDispositivo: new Date('2026-10-23T12:00:00Z'),
  sincronizadoEn: new Date('2026-10-23T12:05:00Z'),
  usuario: { cuenta: 'a@b.c', nombre: 'Ana Pérez' },
  loteId: '12345678-aaaa-bbbb-cccc-1234567890ab',
  resultado: 'encontrado',
  simbologia: 'code39',
  valorLeido: '00006349',
  ubicacionObservada: 'Oficina 12',
  estadoDetectado: 'Malo',
  observaciones: 'Falta una pata',
  bien: { numeroInventario: '00006349', descripcion: 'FICHERO DE MESA', ubicacionFisica: 'ADMINCENTRAL', estadoBien: 'Bueno' },
  ...extra,
});

describe('celda', () => {
  it('escapa separadores, comillas y saltos de línea', () => {
    expect(celda('a;b')).toBe('"a;b"');
    expect(celda('dice "hola"')).toBe('"dice ""hola"""');
    expect(celda('línea 1\nlínea 2')).toBe('línea 1 línea 2');
    expect(celda(null)).toBe('');
  });
  it('neutraliza las fórmulas que ejecutaría una planilla', () => {
    expect(celda('=1+1')).toBe("'=1+1");
    expect(celda('+54 387')).toBe("'+54 387");
    expect(celda('-5')).toBe("'-5");
    expect(celda('@usuario')).toBe("'@usuario");
    expect(celda('=HYPERLINK("http://x";"y")')).toBe('"\'=HYPERLINK(""http://x"";""y"")"');
  });
});

describe('hallazgos en el archivo', () => {
  it('muestra la descripción, la clase, el código provisorio y la serie del hallazgo', () => {
    const hallazgo = fila({
      resultado: 'hallazgo',
      bien: null,
      clase: 'no_identificado',
      descripcion: 'Silla giratoria negra; sin etiqueta',
      numeroSerie: 'SN-123',
      codigoProvisorio: 'H-AB12CD34',
      valorLeido: null,
      simbologia: null,
    });
    const linea = construirCsv([hallazgo]).split('\r\n')[1];
    expect(linea).toBe('23/10/2026 09:00;23/10/2026 09:05;Ana Pérez;12345678;;"Silla giratoria negra; sin etiqueta";Hallazgo;No identificado;H-AB12CD34;SN-123;;;Oficina 12;;Malo;;Falta una pata');
  });
});

describe('fechaParaCsv', () => {
  it('usa la hora de Salta, con la medianoche como 00:00', () => {
    expect(fechaParaCsv(new Date('2026-10-23T12:00:00Z'))).toBe('23/10/2026 09:00');
    expect(fechaParaCsv(new Date('2026-10-23T03:00:00Z'))).toBe('23/10/2026 00:00');
  });
});

describe('construirCsv', () => {
  it('arma el archivo con BOM, encabezados y una línea por relevamiento', () => {
    const fuera = fila({ resultado: 'no_encontrado', bien: null, valorLeido: '7790001', simbologia: 'ean13', estadoDetectado: null, observaciones: null });
    const csv = construirCsv([fila(), fuera]);
    const lineas = csv.split('\r\n');
    expect(csv.startsWith('﻿')).toBe(true);
    expect(lineas[0]).toBe(`﻿${ENCABEZADOS.join(';')}`);
    expect(lineas[1]).toBe('23/10/2026 09:00;23/10/2026 09:05;Ana Pérez;12345678;00006349;FICHERO DE MESA;Encontrado;;;;00006349;CODE39;Oficina 12;ADMINCENTRAL;Malo;Bueno;Falta una pata');
    expect(lineas[2]).toBe('23/10/2026 09:00;23/10/2026 09:05;Ana Pérez;12345678;;;No está en el catálogo;;;;7790001;EAN13;Oficina 12;;;;');
    expect(csv.endsWith('\r\n')).toBe(true);
  });
  it('sin filas devuelve solo los encabezados', () => {
    expect(construirCsv([])).toBe(`﻿${ENCABEZADOS.join(';')}\r\n`);
  });
});

describe('nombreDeArchivo', () => {
  it('lleva la fecha y la hora de Salta, como el contenido del archivo', () => {
    expect(nombreDeArchivo(new Date('2026-10-23T15:00:00Z'))).toBe('relevamientos-20261023-1200.csv');
    expect(nombreDeArchivo(new Date('2026-10-23T03:05:00Z'))).toBe('relevamientos-20261023-0005.csv');
    expect(nombreDeArchivo(new Date('2026-10-23T02:59:00Z'))).toBe('relevamientos-20261022-2359.csv');
  });
});
