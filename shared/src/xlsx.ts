import { strToU8, zipSync } from 'fflate';
import { ENCABEZADOS, valoresDeFila, type FilaExportable } from './csv.js';

/** Ancho de cada columna, en caracteres, en el orden de ENCABEZADOS. */
const ANCHOS = [17, 17, 16, 10, 28, 14, 50, 22, 18, 16, 20, 18, 12, 24, 30, 16, 16, 40];

const columna = (i: number) => String.fromCharCode(65 + i);

/** Escapa texto para XML y descarta los caracteres de control que Excel no admite. */
const xml = (t: string) =>
  t
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/** Toda celda es texto: así los ceros a la izquierda se conservan y nada se ejecuta como fórmula. */
const celdaXlsx = (i: number, fila: number, valor: string | null | undefined, estilo: number) => {
  const texto = (valor ?? '').replace(/\r?\n/g, ' ').trim();
  return texto === ''
    ? `<c r="${columna(i)}${fila}" s="${estilo}"/>`
    : `<c r="${columna(i)}${fila}" s="${estilo}" t="inlineStr"><is><t xml:space="preserve">${xml(texto)}</t></is></c>`;
};

const CABECERA_XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
const NOMBRE_HOJA = 'Relevamientos';

/**
 * Arma un libro de Excel (.xlsx) con los relevamientos: encabezado en negrita y fijo, filtros, anchos de
 * columna y texto ajustado. A diferencia del CSV, no depende de la codificación con que se abra.
 */
export function construirXlsx(filas: FilaExportable[]): Uint8Array {
  const ultima = filas.length + 1;
  const ultimaColumna = columna(ENCABEZADOS.length - 1);
  const filaEncabezado = `<row r="1">${ENCABEZADOS.map((h, i) => celdaXlsx(i, 1, h, 1)).join('')}</row>`;
  const cuerpo = filas
    .map((f, n) => `<row r="${n + 2}">${valoresDeFila(f).map((v, i) => celdaXlsx(i, n + 2, v, 2)).join('')}</row>`)
    .join('');

  const hoja =
    `${CABECERA_XML}<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>' +
    `<cols>${ANCHOS.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>` +
    `<sheetData>${filaEncabezado}${cuerpo}</sheetData><autoFilter ref="A1:${ultimaColumna}${ultima}"/></worksheet>`;

  const estilos =
    `${CABECERA_XML}<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font></fonts>' +
    '<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF0B3A63"/></patternFill></fill></fills>' +
    '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
    '<cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
    '<xf numFmtId="49" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>' +
    '<xf numFmtId="49" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf></cellXfs>' +
    '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>';

  const libro =
    `${CABECERA_XML}<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
    `<sheets><sheet name="${NOMBRE_HOJA}" sheetId="1" r:id="rId1"/></sheets>` +
    `<definedNames><definedName name="_xlnm._FilterDatabase" localSheetId="0" hidden="1">${NOMBRE_HOJA}!$A$1:$${ultimaColumna}$${ultima}</definedName></definedNames></workbook>`;

  const relaciones = (items: string) => `${CABECERA_XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${items}</Relationships>`;
  const tipos =
    `${CABECERA_XML}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
    '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
    '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>';

  return zipSync({
    '[Content_Types].xml': strToU8(tipos),
    '_rels/.rels': strToU8(relaciones('<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>')),
    'xl/workbook.xml': strToU8(libro),
    'xl/_rels/workbook.xml.rels': strToU8(
      relaciones(
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
          '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>',
      ),
    ),
    'xl/styles.xml': strToU8(estilos),
    'xl/worksheets/sheet1.xml': strToU8(hoja),
  });
}
