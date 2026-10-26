// Lectura del listado "Bienes de uso" de SIU Diaguita desde un archivo CSV o XLSX (plan v3, ADR 0003).
// Corre en el teléfono: el administrador elige el archivo y la app lo convierte en filas normalizadas antes de subirlas.
// El XLSX se lee a mano (es un ZIP con XML) para no depender de una biblioteca de planillas completa.
import { strFromU8, unzipSync } from 'fflate';

/** Datos de un bien tal como los trae el listado de SIU Diaguita. Las fechas van como "aaaa-mm-dd". */
export interface BienSiu {
  numeroInventario: string;
  descripcion: string | null;
  catalogo: string | null;
  ubicacionFisica: string | null;
  areaResponsable: string | null;
  motivoAlta: string | null;
  estadoBien: string | null;
  valorUnitario: number | null;
  fechaIncorporacion: string | null;
  numeroSerie: string | null;
  numeroAnterior: string | null;
  expediente: string | null;
  responsableUso: string | null;
}

export interface ResultadoLectura {
  bienes: BienSiu[];
  /** Filas sin número patrimonial (por ejemplo, la de totales): no se importan. */
  omitidas: number;
  /** Números patrimoniales que aparecen más de una vez: se toma la última aparición. */
  repetidos: number;
  /**
   * Campos que el archivo trae como columna. Los reportes de SIU no son todos iguales (el de un área, por ejemplo, no trae
   * el estado ni el número de serie): lo que no viene como columna no se toca en el catálogo.
   */
  columnas: (keyof BienSiu)[];
  /** Datos de la cabecera de los reportes ("Total de registros", "Filtros aplicados"), si el archivo los trae. */
  reporte: { titulo: string | null; filtros: string | null; totalDeclarado: number | null };
}

const sinAcentos = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

function texto(valor: unknown): string | null {
  if (valor === null || valor === undefined) return null;
  const limpio = String(valor).replace(/\s+/g, ' ').trim();
  return limpio || null;
}

/** Fecha en dd/mm/aaaa (o un número de serie de Excel) a "aaaa-mm-dd"; null si no es una fecha válida. */
function fecha(valor: unknown): string | null {
  if (typeof valor === 'number' && valor > 20_000 && valor < 80_000) {
    return new Date(Date.UTC(1899, 11, 30) + Math.floor(valor) * 86_400_000).toISOString().slice(0, 10);
  }
  const m = texto(valor)?.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const f = new Date(Date.UTC(Number(m[3]), Number(m[2]) - 1, Number(m[1])));
  return f.getUTCMonth() === Number(m[2]) - 1 ? f.toISOString().slice(0, 10) : null;
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

/** Número en formato argentino ("1.234,50"), con punto decimal ("1234.5") o ya numérico. */
export function numero(valor: unknown): number | null {
  if (typeof valor === 'number') return Number.isFinite(valor) ? valor : null;
  const t = texto(valor)?.replace(/[^\d.,-]/g, '');
  if (!t) return null;
  const ultimaComa = t.lastIndexOf(',');
  const ultimoPunto = t.lastIndexOf('.');
  const normalizado = ultimaComa > ultimoPunto ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, '');
  const n = Number(normalizado);
  return Number.isFinite(n) ? n : null;
}

/** Nombre de cada columna del listado (sin acentos ni mayúsculas) y el campo del bien que llena. */
const COLUMNAS: [string, keyof BienSiu][] = [
  ['descripcion', 'descripcion'],
  ['catalogo', 'catalogo'],
  ['ubicacion fisica', 'ubicacionFisica'],
  ['area responsable', 'areaResponsable'],
  ['motivo de alta', 'motivoAlta'],
  ['estado', 'estadoBien'],
  ['valor bienes', 'valorUnitario'],
  ['fecha incorporacion', 'fechaIncorporacion'],
  ['numero de serie', 'numeroSerie'],
  ['numero anterior', 'numeroAnterior'],
  ['expediente', 'expediente'],
  ['responsable de uso', 'responsableUso'],
];

/** Convierte las filas de un listado o reporte de SIU en bienes. El encabezado es la primera fila que tiene "Nro. patrimonial". */
export function parsearFilasSiu(filas: unknown[][]): ResultadoLectura {
  if (filas.length === 0) throw new Error('El archivo está vacío');
  const iEncabezado = filas.slice(0, 30).findIndex((f) => f.some((v) => sinAcentos(String(v ?? '')) === 'nro. patrimonial'));
  if (iEncabezado < 0) throw new Error('No parece un listado de SIU: falta la columna "Nro. patrimonial"');
  const encabezado = filas[iEncabezado] ?? [];
  const datos = filas.slice(iEncabezado + 1);

  // Los reportes traen arriba el título, los filtros y el total de registros.
  const cabecera = filas.slice(0, iEncabezado).map((f) => texto(f[0])).filter((t): t is string => !!t);
  const reporte = {
    titulo: cabecera.find((t) => /^reporte|^listado/i.test(t)) ?? null,
    filtros: cabecera.find((t) => /^filtros/i.test(t)) ?? null,
    totalDeclarado: Number(cabecera.map((t) => t.match(/total de registros:\s*(\d+)/i)?.[1]).find(Boolean)) || null,
  };

  const columnas = new Map(encabezado.map((nombre, i) => [sinAcentos(String(nombre ?? '')), i]));
  const iNro = columnas.get('nro. patrimonial') ?? 0;
  const dato = (fila: unknown[], nombre: string) => {
    const i = columnas.get(nombre);
    return i === undefined ? null : fila[i];
  };
  const presentes: (keyof BienSiu)[] = ['numeroInventario', ...COLUMNAS.filter(([nombre]) => columnas.has(nombre)).map(([, campo]) => campo)];

  const porNumero = new Map<string, BienSiu>();
  let omitidas = 0;
  let repetidos = 0;
  for (const fila of datos) {
    const numeroInventario = inventario(fila[iNro]);
    if (!numeroInventario) {
      omitidas += 1;
      continue;
    }
    if (porNumero.has(numeroInventario)) repetidos += 1;
    porNumero.set(numeroInventario, {
      numeroInventario,
      descripcion: texto(dato(fila, 'descripcion')),
      catalogo: texto(dato(fila, 'catalogo')),
      ubicacionFisica: texto(dato(fila, 'ubicacion fisica')),
      areaResponsable: texto(dato(fila, 'area responsable')),
      motivoAlta: texto(dato(fila, 'motivo de alta')),
      estadoBien: texto(dato(fila, 'estado')),
      valorUnitario: numero(dato(fila, 'valor bienes')),
      fechaIncorporacion: fecha(dato(fila, 'fecha incorporacion')),
      numeroSerie: texto(dato(fila, 'numero de serie')),
      numeroAnterior: texto(dato(fila, 'numero anterior')),
      expediente: expediente(dato(fila, 'expediente')),
      responsableUso: texto(dato(fila, 'responsable de uso')),
    });
  }
  return { bienes: [...porNumero.values()], omitidas, repetidos, columnas: presentes, reporte };
}

// --- CSV ----------------------------------------------------------------------------------------------------

/** Lee un CSV (separado por punto y coma, coma o tabulación; con o sin comillas y BOM) en filas de texto. */
export function leerCsv(contenido: string): string[][] {
  const limpio = contenido.replace(/^﻿/, '');
  const primera = limpio.split(/\r?\n/, 1)[0] ?? '';
  const separador = [';', '\t', ','].reduce((mejor, s) => (primera.split(s).length > primera.split(mejor).length ? s : mejor), ';');
  const filas: string[][] = [];
  let fila: string[] = [];
  let campo = '';
  let entreComillas = false;
  for (let i = 0; i < limpio.length; i += 1) {
    const c = limpio[i];
    if (entreComillas) {
      if (c === '"' && limpio[i + 1] === '"') {
        campo += '"';
        i += 1;
      } else if (c === '"') entreComillas = false;
      else campo += c;
    } else if (c === '"') entreComillas = true;
    else if (c === separador) {
      fila.push(campo);
      campo = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && limpio[i + 1] === '\n') i += 1;
      fila.push(campo);
      campo = '';
      if (fila.some((v) => v.trim() !== '')) filas.push(fila);
      fila = [];
    } else campo += c;
  }
  fila.push(campo);
  if (fila.some((v) => v.trim() !== '')) filas.push(fila);
  return filas;
}

// --- XLSX ---------------------------------------------------------------------------------------------------

const ENTIDADES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const desescapar = (t: string) =>
  t.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (todo, e: string) => {
    if (e.startsWith('#x') || e.startsWith('#X')) return String.fromCodePoint(parseInt(e.slice(2), 16));
    if (e.startsWith('#')) return String.fromCodePoint(Number(e.slice(1)));
    return ENTIDADES[e.toLowerCase()] ?? todo;
  });

/** Texto de los `<t>` de un fragmento (cadenas compartidas, incluso con formato mixto). */
const textosDe = (xml: string) => [...xml.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((m) => desescapar(m[1] ?? '')).join('');

function columnaDe(referencia: string): number {
  const letras = referencia.match(/^[A-Z]+/i)?.[0].toUpperCase() ?? 'A';
  return [...letras].reduce((n, l) => n * 26 + (l.charCodeAt(0) - 64), 0) - 1;
}

/** Lee la primera hoja de un .xlsx (SIU lo entrega con extensión .xls, pero es un xlsx). */
export function leerXlsx(bytes: Uint8Array): unknown[][] {
  let partes: Record<string, Uint8Array>;
  try {
    partes = unzipSync(bytes, { filter: (f) => /^xl\/(workbook\.xml|_rels\/workbook\.xml\.rels|sharedStrings\.xml|worksheets\/[^/]+\.xml)$/.test(f.name) });
  } catch {
    throw new Error('El archivo no es un Excel (.xlsx) válido');
  }
  const leer = (nombre: string) => (partes[nombre] ? strFromU8(partes[nombre]) : null);

  const compartidas = [...(leer('xl/sharedStrings.xml') ?? '').matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)].map((m) => textosDe(m[1] ?? ''));

  // La primera hoja según el libro; si no se puede resolver, la primera de la carpeta de hojas.
  let ruta = 'xl/worksheets/sheet1.xml';
  const idPrimera = leer('xl/workbook.xml')?.match(/<sheet\b[^>]*\br:id="([^"]+)"/)?.[1];
  const relaciones = leer('xl/_rels/workbook.xml.rels');
  if (idPrimera && relaciones) {
    for (const m of relaciones.matchAll(/<Relationship\b([^>]*)\/?>/g)) {
      const atributos = m[1] ?? '';
      if (atributos.match(/\bId="([^"]+)"/)?.[1] === idPrimera) {
        const destino = atributos.match(/\bTarget="([^"]+)"/)?.[1];
        if (destino) ruta = destino.startsWith('/') ? destino.slice(1) : `xl/${destino}`;
      }
    }
  }
  const hoja = leer(ruta) ?? leer(Object.keys(partes).find((n) => n.startsWith('xl/worksheets/')) ?? '');
  if (!hoja) throw new Error('El archivo no tiene hojas');

  const filas: unknown[][] = [];
  for (const m of hoja.matchAll(/<row\b[^>]*?(?:\/>|>([\s\S]*?)<\/row>)/g)) {
    const celdas: unknown[] = [];
    for (const c of (m[1] ?? '').matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const atributos = c[1] ?? '';
      const cuerpo = c[2] ?? '';
      const posicion = columnaDe(atributos.match(/\br="([^"]+)"/)?.[1] ?? 'A');
      const tipo = atributos.match(/\bt="([^"]+)"/)?.[1];
      const v = cuerpo.match(/<v\b[^>]*>([\s\S]*?)<\/v>/)?.[1];
      let valor: unknown = null;
      if (tipo === 'inlineStr') valor = textosDe(cuerpo);
      else if (v !== undefined) {
        if (tipo === 's') valor = compartidas[Number(v)] ?? null;
        else if (tipo === 'str' || tipo === 'e') valor = desescapar(v);
        else if (tipo === 'b') valor = v === '1';
        else valor = Number(v);
      }
      while (celdas.length < posicion) celdas.push(null);
      celdas[posicion] = valor;
    }
    if (celdas.some((v) => v !== null && v !== '')) filas.push(celdas);
  }
  return filas;
}

/**
 * Lee el contenido de un archivo del listado: XLSX si empieza con la firma de un ZIP ("PK"), CSV en otro caso.
 * Devuelve los bienes listos para subir y cuántas filas se descartaron.
 */
export function leerArchivoCatalogo(bytes: Uint8Array): ResultadoLectura {
  const esZip = bytes[0] === 0x50 && bytes[1] === 0x4b;
  const filas = esZip ? leerXlsx(bytes) : leerCsv(new TextDecoder('utf-8').decode(bytes));
  return parsearFilasSiu(filas);
}
