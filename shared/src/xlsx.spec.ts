import { strFromU8, unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { ENCABEZADOS, type FilaExportable } from './csv.js';
import { construirXlsx } from './xlsx.js';

const fila = (extra: Partial<FilaExportable> = {}): FilaExportable => ({
  relevadoEnDispositivo: new Date('2026-10-23T12:00:00Z'),
  sincronizadoEn: new Date('2026-10-23T12:05:00Z'),
  usuario: { cuenta: 'a@b.c', nombre: 'Ana Pérez' },
  loteId: null,
  jornada: 'Dirección de Patrimonio',
  resultado: 'encontrado',
  simbologia: 'code39',
  valorLeido: '0304016',
  ubicacionObservada: 'Oficina 12',
  estadoDetectado: 'Malo',
  observaciones: 'Cable <roto> & "suelto"',
  bien: { numeroInventario: '00304016', descripcion: 'MONITOR CONEXIÓN HDMI', ubicacionFisica: 'ADMINCENTRAL', estadoBien: 'Bueno' },
  ...extra,
});

const hojaDe = (filas: FilaExportable[]) => strFromU8(unzipSync(construirXlsx(filas))['xl/worksheets/sheet1.xml']!);

describe('construirXlsx', () => {
  it('es un libro con las partes que Excel necesita', () => {
    const partes = Object.keys(unzipSync(construirXlsx([fila()])));
    expect(partes).toEqual(
      expect.arrayContaining(['[Content_Types].xml', '_rels/.rels', 'xl/workbook.xml', 'xl/_rels/workbook.xml.rels', 'xl/styles.xml', 'xl/worksheets/sheet1.xml']),
    );
  });
  it('lleva los encabezados, el rango del filtro y conserva tildes y ceros a la izquierda', () => {
    const hoja = hojaDe([fila(), fila()]);
    for (const h of ENCABEZADOS) expect(hoja).toContain(h);
    expect(hoja).toContain('<autoFilter ref="A1:R3"/>');
    expect(hoja).toContain('MONITOR CONEXIÓN HDMI');
    expect(hoja).toContain('>00304016<');
  });
  it('escapa el XML y no deja que el texto se ejecute como fórmula', () => {
    const hoja = hojaDe([fila({ observaciones: '=1+1' })]);
    expect(hoja).toContain('t="inlineStr"><is><t xml:space="preserve">=1+1</t>');
    expect(hojaDe([fila()])).toContain('Cable &lt;roto&gt; &amp; &quot;suelto&quot;');
  });
  it('descarta los caracteres de control', () => {
    expect(hojaDe([fila({ observaciones: 'a\u0001b' })])).toContain('>ab<');
  });
  it('sin filas deja solo el encabezado', () => {
    expect(hojaDe([])).toContain('<autoFilter ref="A1:R1"/>');
  });
});
