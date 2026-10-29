import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { leerArchivoCatalogo, leerCsv, leerXlsx, numero, parsearFilasSiu } from './catalogo-archivo.js';

const encabezado = [
  'Nro. patrimonial', 'Descripción', 'Catálogo', 'Ubicación física', 'Área responsable', 'Motivo de alta',
  'Estado', 'Valor bienes', 'Fecha incorporación', 'Número de serie', 'Número anterior', 'Expediente',
];

describe('parsearFilasSiu', () => {
  it('convierte una fila del listado de SIU', () => {
    const { bienes, omitidas } = parsearFilasSiu([
      encabezado,
      ['NUI:00006349', ' FICHERO  DE MESA ', '4.3.7.00036 - FICHERO', 'ADMINCENTRAL', '1-9 Patrimonio', 'Otros ingresos', 'Bueno', 512, '11/09/1990', null, '400 -461 -15901  -  ', '0      /0   '],
      [null, null, null, null, null, null, null, 1234],
    ]);
    expect(omitidas).toBe(1);
    expect(bienes).toHaveLength(1);
    expect(bienes[0]).toMatchObject({
      numeroInventario: '00006349',
      descripcion: 'FICHERO DE MESA',
      estadoBien: 'Bueno',
      valorUnitario: 512,
      numeroSerie: null,
      numeroAnterior: '400 -461 -15901 -',
      expediente: null,
      fechaIncorporacion: '1990-09-11',
    });
  });

  it('rechaza un archivo que no es un listado de SIU', () => {
    expect(() => parsearFilasSiu([['a', 'b'], ['1', '2']])).toThrow(/Nro. patrimonial/);
  });

  it('cuenta los repetidos y se queda con la última aparición', () => {
    const r = parsearFilasSiu([encabezado, ['NUI:00000001', 'Viejo'], ['NUI:00000002', 'Otro'], ['NUI:00000001', 'Nuevo']]);
    expect(r.bienes).toHaveLength(2);
    expect(r.repetidos).toBe(1);
    expect(r.bienes.find((b) => b.numeroInventario === '00000001')?.descripcion).toBe('Nuevo');
  });

  it('acepta una fecha como número de serie de Excel', () => {
    const r = parsearFilasSiu([encabezado, ['NUI:00000001', 'x', null, null, null, null, null, null, 33492]]);
    expect(r.bienes[0]?.fechaIncorporacion).toBe('1991-09-11');
  });
});

describe('parsearFilasSiu con un reporte de un área', () => {
  const reporte = [
    ['UNIVERSIDAD NACIONAL DE SALTA · DESARROLLO'],
    ['Reporte de bienes patrimoniales activos de la Dirección de Patrimonio (REC)'],
    ['Filtros aplicados: Bienes a mostrar: Sólo los activos | Área responsable: 1-9 Dirección de Patrimonio (REC)'],
    ['Total de registros: 2 | Generado: 26/10/2026 | Fuente: SIU-Diaguita'],
    ['Nro. patrimonial', 'Descripción', 'Catálogo', 'Ubicación física', 'Área responsable', 'Valor bienes', 'Fecha incorporación', 'Responsable de uso'],
    ['00366408', 'Monitor' + String.fromCharCode(10) + 'LG', '4.3.6.00011 - MONITOR', 'Edificio de Biblioteca Central', '1-9 Dirección de Patrimonio (REC)', '$ 100.000,00', '30/09/2026', 'RODRIGUEZ DIEGO ABEL'],
    ['00366409', 'Notebook', '4.3.6.00002 - PORTATIL', 'ADMINCENTRAL- CAST.-DEPOSITO', '1-9 Dirección de Patrimonio (REC)', '$ 1.250,50', '30/09/2026', ''],
  ];

  it('encuentra el encabezado después de la cabecera y lee el responsable de uso', () => {
    const r = parsearFilasSiu(reporte);
    expect(r.bienes).toHaveLength(2);
    expect(r.bienes[0]).toMatchObject({ numeroInventario: '00366408', descripcion: 'Monitor LG', valorUnitario: 100000, responsableUso: 'RODRIGUEZ DIEGO ABEL' });
    expect(r.bienes[1]).toMatchObject({ valorUnitario: 1250.5, responsableUso: null });
  });

  it('guarda los datos de la cabecera y verifica el total declarado', () => {
    const r = parsearFilasSiu(reporte);
    expect(r.reporte.totalDeclarado).toBe(2);
    expect(r.reporte.filtros).toMatch(/Dirección de Patrimonio/);
    expect(r.reporte.titulo).toMatch(/^Reporte de bienes/);
  });

  it('informa qué columnas trae: lo que falta no se toca (este reporte no trae estado ni número de serie)', () => {
    const r = parsearFilasSiu(reporte);
    expect(r.columnas).toContain('responsableUso');
    expect(r.columnas).toContain('ubicacionFisica');
    expect(r.columnas).not.toContain('estadoBien');
    expect(r.columnas).not.toContain('numeroSerie');
    expect(r.columnas).not.toContain('expediente');
  });
});

describe('numero', () => {
  it('lee los formatos habituales', () => {
    expect(numero('1.234,50')).toBe(1234.5);
    expect(numero('$ 512,00')).toBe(512);
    expect(numero('1234.5')).toBe(1234.5);
    expect(numero('1,234.50')).toBe(1234.5);
    expect(numero(77)).toBe(77);
    expect(numero('')).toBeNull();
    expect(numero('abc')).toBeNull();
  });
});

describe('leerCsv', () => {
  it('lee punto y coma, comillas, comillas dobles, saltos dentro de un campo y BOM', () => {
    const filas = leerCsv('﻿a;b;c\r\n1;"dos;tres";"con ""comillas"""\r\n"x\ny";;\r\n\r\n');
    expect(filas).toEqual([['a', 'b', 'c'], ['1', 'dos;tres', 'con "comillas"'], ['x\ny', '', '']]);
  });

  it('detecta la coma y la tabulación', () => {
    expect(leerCsv('a,b\n1,2')).toEqual([['a', 'b'], ['1', '2']]);
    expect(leerCsv('a\tb\n1\t2')).toEqual([['a', 'b'], ['1', '2']]);
  });
});

/** Arma un .xlsx mínimo: libro, relaciones, cadenas compartidas y una hoja. */
function armarXlsx(hojaXml: string, compartidas: string[]) {
  return zipSync({
    'xl/workbook.xml': strToU8('<workbook><sheets><sheet name="Hoja1" sheetId="1" r:id="rId7"/></sheets></workbook>'),
    'xl/_rels/workbook.xml.rels': strToU8('<Relationships><Relationship Id="rId7" Type="x" Target="worksheets/sheet2.xml"/></Relationships>'),
    'xl/sharedStrings.xml': strToU8(`<sst>${compartidas.map((t) => `<si><t>${t}</t></si>`).join('')}</sst>`),
    'xl/worksheets/sheet2.xml': strToU8(hojaXml),
    'xl/worksheets/sheet1.xml': strToU8('<worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>OTRA</t></is></c></row></sheetData></worksheet>'),
  });
}

describe('leerXlsx', () => {
  it('lee la primera hoja del libro, con cadenas compartidas, números, texto en línea y celdas vacías', () => {
    const hoja = `<worksheet><sheetData>
      <row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="D1" t="s"><v>2</v></c></row>
      <row r="2"><c r="A2" t="s"><v>3</v></c><c r="B2" t="inlineStr"><is><t>Caf&#233; &amp; Mesa</t></is></c><c r="C2"/><c r="D2"><v>512.5</v></c></row>
      <row r="3"/>
    </sheetData></worksheet>`;
    const filas = leerXlsx(armarXlsx(hoja, ['Nro. patrimonial', 'Descripción', 'Valor bienes', 'NUI:00000007']));
    expect(filas).toEqual([
      ['Nro. patrimonial', 'Descripción', null, 'Valor bienes'],
      ['NUI:00000007', 'Café & Mesa', null, 512.5],
    ]);
  });

  it('rechaza algo que no es un xlsx', () => {
    expect(() => leerXlsx(strToU8('esto no es un zip'))).toThrow(/xlsx/);
  });
});

describe('leerArchivoCatalogo', () => {
  it('distingue XLSX y CSV por el contenido', () => {
    const hoja = `<worksheet><sheetData>
      <row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row>
      <row r="2"><c r="A2" t="s"><v>2</v></c><c r="B2" t="s"><v>3</v></c></row>
    </sheetData></worksheet>`;
    const desdeXlsx = leerArchivoCatalogo(armarXlsx(hoja, ['Nro. patrimonial', 'Descripción', 'NUI:00000001', 'Silla']));
    const desdeCsv = leerArchivoCatalogo(strToU8('Nro. patrimonial;Descripción\r\nNUI:00000001;Silla\r\n'));
    expect(desdeXlsx.bienes[0]).toMatchObject({ numeroInventario: '00000001', descripcion: 'Silla' });
    expect(desdeCsv.bienes).toEqual(desdeXlsx.bienes);
  });
});
