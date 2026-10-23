import ExcelJS from 'exceljs';

/** Datos de un bien tal como los trae el listado "Bienes de uso" de SIU Diaguita. */
export interface BienSiu {
  numeroInventario: string;
  descripcion: string | null;
  catalogo: string | null;
  ubicacionFisica: string | null;
  areaResponsable: string | null;
  motivoAlta: string | null;
  estadoBien: string | null;
  valorUnitario: number | null;
  fechaIncorporacion: Date | null;
  numeroSerie: string | null;
  numeroAnterior: string | null;
  expediente: string | null;
}

const sinAcentos = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

function texto(valor: unknown): string | null {
  if (valor === null || valor === undefined) return null;
  const limpio = String(valor).replace(/\s+/g, ' ').trim();
  return limpio || null;
}

/** dd/mm/aaaa a fecha (UTC), o null si no tiene ese formato. */
function fecha(valor: unknown): Date | null {
  const m = texto(valor)?.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const f = new Date(Date.UTC(Number(m[3]), Number(m[2]) - 1, Number(m[1])));
  return f.getUTCMonth() === Number(m[2]) - 1 ? f : null;
}

/** "NUI:00006349" a "00006349". Las filas sin número (por ejemplo, el total) se descartan. */
function inventario(valor: unknown): string | null {
  return texto(valor)?.match(/(\d+)\s*$/)?.[1] ?? null;
}

/** Expedientes vacíos vienen como "0 /0": se guardan como ausentes. */
function expediente(valor: unknown): string | null {
  const t = texto(valor);
  return t && !/^0 ?\/ ?0$/.test(t) ? t : null;
}

/** Convierte las filas del listado (la primera es el encabezado) en bienes. */
export function parsearFilasSiu(filas: unknown[][]): { bienes: BienSiu[]; omitidas: number } {
  const [encabezado, ...datos] = filas;
  if (!encabezado) throw new Error('El archivo está vacío');
  const columnas = new Map(encabezado.map((nombre, i) => [sinAcentos(String(nombre ?? '')), i]));
  const col = (nombre: string) => columnas.get(nombre);
  const iNro = col('nro. patrimonial');
  if (iNro === undefined) throw new Error('No parece un listado de SIU: falta la columna "Nro. patrimonial"');
  const dato = (fila: unknown[], nombre: string) => {
    const i = col(nombre);
    return i === undefined ? null : fila[i];
  };

  const bienes: BienSiu[] = [];
  let omitidas = 0;
  for (const fila of datos) {
    const numeroInventario = inventario(fila[iNro]);
    if (!numeroInventario) {
      omitidas += 1;
      continue;
    }
    const valor = Number(dato(fila, 'valor bienes'));
    bienes.push({
      numeroInventario,
      descripcion: texto(dato(fila, 'descripcion')),
      catalogo: texto(dato(fila, 'catalogo')),
      ubicacionFisica: texto(dato(fila, 'ubicacion fisica')),
      areaResponsable: texto(dato(fila, 'area responsable')),
      motivoAlta: texto(dato(fila, 'motivo de alta')),
      estadoBien: texto(dato(fila, 'estado')),
      valorUnitario: Number.isFinite(valor) ? valor : null,
      fechaIncorporacion: fecha(dato(fila, 'fecha incorporacion')),
      numeroSerie: texto(dato(fila, 'numero de serie')),
      numeroAnterior: texto(dato(fila, 'numero anterior')),
      expediente: expediente(dato(fila, 'expediente')),
    });
  }
  return { bienes, omitidas };
}

/** Lee la primera hoja de un .xlsx (SIU lo entrega con extensión .xls pero es xlsx). */
export async function leerExcelSiu(contenido: Buffer) {
  const libro = new ExcelJS.Workbook();
  await libro.xlsx.load(contenido as unknown as ArrayBuffer);
  const hoja = libro.worksheets[0];
  if (!hoja) throw new Error('El archivo no tiene hojas');
  const filas: unknown[][] = [];
  hoja.eachRow({ includeEmpty: false }, (fila) => {
    filas.push((fila.values as unknown[]).slice(1));
  });
  return parsearFilasSiu(filas);
}
