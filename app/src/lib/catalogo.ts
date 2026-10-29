// Lecturas del catálogo de bienes directo contra Supabase (plan v3, fase 3). Reemplazan lo que hacía el backend
// en `bienes.service.ts`. El acceso lo controlan las políticas RLS: solo las cuentas activas leen el catálogo.
import {
  candidatosInventario,
  normalizarCodigo,
  type BienDetalleDto,
  type BienDto,
  type CambioBienDto,
  type EstadoCodigo,
  type ResultadoEscaneoDto,
  type Simbologia,
  type Titularidad,
  type UbicacionDto,
} from '@patrimonio/shared';
import { supabase } from './supabase';

const MAX_RESULTADOS = 30;
/** Tope de bienes esperados por ubicación en un lote. */
const MAX_ESPERADOS = 1000;
const LARGO_MINIMO_BUSQUEDA = 2;
/** Campos que cambian solos o no aportan al historial de una ficha. */
const CAMPOS_IGNORADOS = new Set(['modificadoEn', 'creadoEn']);

const COLUMNAS_BIEN = 'id, numeroInventario, descripcion, estadoCodigo, estadoBien, ubicacionFisica, areaResponsable, catalogo';
const COLUMNAS_DETALLE = `${COLUMNAS_BIEN}, motivoAlta, valorUnitario, fechaIncorporacion, numeroSerie, numeroAnterior, expediente, responsableUso, cantidad, proveedor, numeroFactura, fechaFactura, titularidad, creadoEn, modificadoEn, codigos:codigo_bien(simbologia, valor)`;

type Fila = Record<string, unknown>;

function comprobar<T>(resultado: { data: T; error: { message: string } | null }): T {
  if (resultado.error) throw new Error(resultado.error.message);
  return resultado.data;
}

/** Las columnas `timestamp` sin zona llegan sin la "Z": se las toma como UTC, como las guarda el servidor. */
function aIso(valor: unknown): string {
  const texto = String(valor);
  return new Date(/(Z|[+-]\d{2}(:?\d{2})?)$/i.test(texto) ? texto : `${texto}Z`).toISOString();
}

function aDto(f: Fila): BienDto {
  return {
    id: f.id as string,
    numeroInventario: f.numeroInventario as string,
    descripcion: (f.descripcion as string | null) ?? null,
    estadoCodigo: f.estadoCodigo as EstadoCodigo,
    estadoBien: (f.estadoBien as string | null) ?? null,
    ubicacionFisica: (f.ubicacionFisica as string | null) ?? null,
    areaResponsable: (f.areaResponsable as string | null) ?? null,
    catalogo: (f.catalogo as string | null) ?? null,
  };
}

const nulo = <T>(valor: unknown): T | null => (valor === undefined || valor === null ? null : (valor as T));

function aDetalle(f: Fila): BienDetalleDto {
  return {
    ...aDto(f),
    motivoAlta: nulo(f.motivoAlta),
    valorUnitario: f.valorUnitario === null || f.valorUnitario === undefined ? null : Number(f.valorUnitario),
    fechaIncorporacion: nulo(f.fechaIncorporacion),
    numeroSerie: nulo(f.numeroSerie),
    numeroAnterior: nulo(f.numeroAnterior),
    expediente: nulo(f.expediente),
    responsableUso: nulo(f.responsableUso),
    cantidad: nulo(f.cantidad),
    proveedor: nulo(f.proveedor),
    numeroFactura: nulo(f.numeroFactura),
    fechaFactura: nulo(f.fechaFactura),
    titularidad: nulo<Titularidad>(f.titularidad),
    creadoEn: aIso(f.creadoEn),
    modificadoEn: aIso(f.modificadoEn),
    codigos: ((f.codigos as { simbologia: string; valor: string }[] | null) ?? []).map((c) => ({ simbologia: c.simbologia, valor: c.valor })),
  };
}

/** Resuelve un escaneo: primero por (simbología, valor) en `codigo_bien`, luego por número de inventario. */
export async function resolverEscaneo(simbologia: Simbologia, valorLeido: string): Promise<ResultadoEscaneoDto> {
  const valor = normalizarCodigo(simbologia, valorLeido);

  const porCodigo = comprobar(
    await supabase.from('codigo_bien').select(`bien:bien(${COLUMNAS_BIEN})`).eq('simbologia', simbologia).eq('valor', valor).maybeSingle(),
  ) as { bien: Fila | null } | null;
  if (porCodigo?.bien) return { encontrado: true, via: 'codigo', bien: aDto(porCodigo.bien) };

  const porInventario = comprobar(
    await supabase.from('bien').select(COLUMNAS_BIEN).in('numeroInventario', candidatosInventario(valor)).limit(1).maybeSingle(),
  ) as Fila | null;
  if (porInventario) return { encontrado: true, via: 'inventario', bien: aDto(porInventario) };

  return { encontrado: false };
}

/** Ficha completa. Acepta el número con o sin ceros a la izquierda; null si no existe. */
export async function buscarPorInventario(numero: string): Promise<BienDetalleDto | null> {
  const fila = comprobar(
    await supabase.from('bien').select(COLUMNAS_DETALLE).in('numeroInventario', candidatosInventario(numero.trim())).limit(1).maybeSingle(),
  ) as Fila | null;
  return fila ? aDetalle(fila) : null;
}

/** Búsqueda manual por número, número anterior, descripción, catálogo o ubicación. */
export async function buscar(texto: string): Promise<BienDto[]> {
  // Se quitan los caracteres que tienen significado en los filtros de la API (comas, paréntesis, comodines).
  const q = texto.replace(/[%*,()\\"]/g, ' ').trim();
  if (q.length < LARGO_MINIMO_BUSQUEDA) return [];
  const candidatos = candidatosInventario(q).map((c) => c.replace(/[^A-Za-z0-9]/g, '')).filter(Boolean);
  const filtros = [
    candidatos.length ? `numeroInventario.in.(${candidatos.join(',')})` : null,
    `numeroInventario.ilike.*${q}*`,
    `numeroAnterior.ilike.*${q}*`,
    `descripcion.ilike.*${q}*`,
    `catalogo.ilike.*${q}*`,
    `ubicacionFisica.ilike.*${q}*`,
  ].filter(Boolean);
  const filas = comprobar(
    await supabase.from('bien').select(COLUMNAS_BIEN).or(filtros.join(',')).order('numeroInventario', { ascending: true }).limit(MAX_RESULTADOS),
  ) as Fila[];
  return filas.map(aDto);
}

/** Ubicaciones físicas del catálogo con su cantidad de bienes, para elegir dónde hacer un lote. */
export async function ubicaciones(): Promise<UbicacionDto[]> {
  const filas = comprobar(await supabase.rpc('ubicaciones_catalogo')) as { nombre: string; cantidad: number | string }[] | null;
  return (filas ?? []).map((f) => ({ nombre: f.nombre, cantidad: Number(f.cantidad) }));
}

/** Bienes que el catálogo ubica en `nombre`: lo esperado al relevar esa ubicación. */
export async function bienesDeUbicacion(nombre: string): Promise<BienDto[]> {
  const filas = comprobar(
    await supabase.from('bien').select(COLUMNAS_BIEN).eq('ubicacionFisica', nombre).order('numeroInventario', { ascending: true }).limit(MAX_ESPERADOS),
  ) as Fila[];
  return filas.map(aDto);
}

/** Campos que difieren entre dos versiones de una fila. */
export function diferencias(antes: unknown, despues: unknown): CambioBienDto['cambios'] {
  const a = (antes ?? {}) as Record<string, unknown>;
  const d = (despues ?? {}) as Record<string, unknown>;
  return [...new Set([...Object.keys(a), ...Object.keys(d)])]
    .filter((campo) => !CAMPOS_IGNORADOS.has(campo) && JSON.stringify(a[campo]) !== JSON.stringify(d[campo]))
    .map((campo) => ({ campo, antes: a[campo] ?? null, despues: d[campo] ?? null }));
}

/** Línea de tiempo de una ficha, del cambio más reciente al más antiguo; null si el bien no existe. */
export async function historial(numero: string): Promise<CambioBienDto[] | null> {
  const bien = comprobar(
    await supabase.from('bien').select('id, creadoEn').in('numeroInventario', candidatosInventario(numero.trim())).limit(1).maybeSingle(),
  ) as { id: string; creadoEn: string } | null;
  if (!bien) return null;

  const filas = (comprobar(await supabase.rpc('historial_bien', { p_bien_id: bien.id })) ?? []) as {
    id: string;
    operacion: CambioBienDto['operacion'];
    en: string;
    actor: string | null;
    antes: unknown;
    despues: unknown;
  }[];
  const cambios: CambioBienDto[] = filas.map((f) => ({
    id: f.id,
    operacion: f.operacion,
    en: aIso(f.en),
    actor: f.actor,
    cambios: f.operacion === 'UPDATE' ? diferencias(f.antes, f.despues) : [],
  }));
  // Los bienes cargados antes de que existieran los triggers no tienen registro de alta: se deduce de su fecha de carga.
  if (filas.length < 50 && !filas.some((f) => f.operacion === 'INSERT')) {
    cambios.push({ id: `alta-${bien.id}`, operacion: 'INSERT', en: aIso(bien.creadoEn), actor: null, cambios: [] });
  }
  return cambios;
}

// --- Explorar por área, responsable y ubicación -------------------------------------------------------------

export interface Agrupacion {
  nombre: string;
  cantidad: number;
  /** Una línea para la lista, por ejemplo "5 ubicaciones · 3 responsables". */
  detalle: string;
}

const pl = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

/** Áreas responsables del catálogo, con su cantidad de bienes (en vivo: reflejan lo último que se importó). */
export async function areas(): Promise<Agrupacion[]> {
  const filas = (comprobar(await supabase.rpc('areas_catalogo')) ?? []) as { nombre: string; cantidad: number; ubicaciones: number; responsables: number }[];
  return filas.map((f) => ({
    nombre: f.nombre,
    cantidad: Number(f.cantidad),
    detalle: `${pl(Number(f.ubicaciones), 'ubicación', 'ubicaciones')} · ${pl(Number(f.responsables), 'responsable', 'responsables')}`,
  }));
}

/** Responsables de uso del catálogo, con su cantidad de bienes. */
export async function responsables(): Promise<Agrupacion[]> {
  const filas = (comprobar(await supabase.rpc('responsables_catalogo')) ?? []) as { nombre: string; cantidad: number; areas: number }[];
  return filas.map((f) => ({ nombre: f.nombre, cantidad: Number(f.cantidad), detalle: pl(Number(f.areas), 'área', 'áreas') }));
}

export type CampoAgrupacion = 'areaResponsable' | 'responsableUso' | 'ubicacionFisica';

export interface BienDeLista extends BienDto {
  responsableUso: string | null;
}

/** Bienes de un área, de un responsable o de una ubicación (hasta 5000, en tandas de 1000). */
export async function bienesPor(campo: CampoAgrupacion, valor: string): Promise<BienDeLista[]> {
  const todos: Fila[] = [];
  for (let desde = 0; desde < 5000; desde += 1000) {
    const pagina = comprobar(
      await supabase
        .from('bien')
        .select(`${COLUMNAS_BIEN}, responsableUso`)
        .eq(campo, valor)
        .order('numeroInventario', { ascending: true })
        .range(desde, desde + 999),
    ) as Fila[];
    todos.push(...pagina);
    if (pagina.length < 1000) break;
  }
  return todos.map((f) => ({ ...aDto(f), responsableUso: (f.responsableUso as string | null) ?? null }));
}
