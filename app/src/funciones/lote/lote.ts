import { candidatosInventario, normalizarCodigo, type BienDto, type RelevamientoDto, type Simbologia } from '@patrimonio/shared';

/**
 * Escaneo por lotes: se elige una ubicación física y se escanea en ráfaga. Todo esto es lógica pura
 * (sin red ni pantalla) para poder probarla: la pantalla solo la usa.
 */

type EstadoItem = 'encontrado' | 'no_encontrado' | 'sin_verificar';

export interface ItemLote {
  /** UUID generado acá: vuelve idempotente el envío al servidor (reenviar no duplica). */
  idCliente: string;
  /** Identifica el ítem para detectar repetidos: el bien si se encontró, o la lectura si no. */
  clave: string;
  leido: string;
  simbologia: Simbologia;
  estado: EstadoItem;
  bien?: BienDto;
  /** Cuántas veces se leyó. Más de 1 significa que se escaneó repetido. */
  veces: number;
  /** El catálogo ubica este bien en la ubicación del lote. */
  enEsperados: boolean;
  hora: string;
}

export interface Lote {
  /** UUID del lote: agrupa los relevamientos en el servidor. */
  id: string;
  ubicacion: string;
  iniciadoEn: string;
  /** Bienes que el catálogo ubica en `ubicacion`: contra esto se calculan los faltantes. */
  esperados: BienDto[];
  items: ItemLote[];
  /** `idCliente` de los ítems que el servidor ya confirmó. */
  enviados: string[];
  /** Jornada a la que se suma el lote: sus relevamientos cuentan en el avance compartido. */
  jornadaId?: string;
}

export type Resolucion = { estado: 'encontrado'; bien: BienDto } | { estado: 'no_encontrado' } | { estado: 'sin_verificar' };

export const nuevoLote = (ubicacion: string, esperados: BienDto[], id: string, ahora = new Date(), jornadaId?: string): Lote => ({
  id,
  ubicacion,
  iniciadoEn: ahora.toISOString(),
  esperados,
  items: [],
  enviados: [],
  ...(jornadaId ? { jornadaId } : {}),
});

/** Busca una lectura entre los bienes esperados, sin red. Acepta el número con otro relleno de ceros. */
export function buscarEnEsperados(lote: Lote, simbologia: Simbologia, valor: string): BienDto | undefined {
  const candidatos = candidatosInventario(normalizarCodigo(simbologia, valor));
  return lote.esperados.find((b) => candidatos.includes(b.numeroInventario));
}

const claveDeBien = (bien: BienDto) => `bien:${bien.numeroInventario}`;
const claveDeLectura = (simbologia: Simbologia, valor: string) => `lectura:${simbologia}:${normalizarCodigo(simbologia, valor)}`;

function claveDe(simbologia: Simbologia, valor: string, r: Resolucion) {
  return r.estado === 'encontrado' ? claveDeBien(r.bien) : claveDeLectura(simbologia, valor);
}

/** Agrega una lectura. Si ya estaba, suma una vez más en lugar de duplicarla y avisa que fue repetida. */
export function agregarLectura(
  lote: Lote,
  lectura: { simbologia: Simbologia; valor: string },
  resolucion: Resolucion,
  nuevoId: () => string,
  ahora = new Date(),
): { lote: Lote; repetido: boolean; item: ItemLote } {
  const clave = claveDe(lectura.simbologia, lectura.valor, resolucion);
  const existente = lote.items.find((i) => i.clave === clave);
  if (existente) {
    const actualizado = { ...existente, veces: existente.veces + 1 };
    return { lote: { ...lote, items: lote.items.map((i) => (i.clave === clave ? actualizado : i)) }, repetido: true, item: actualizado };
  }
  const enEsperados = resolucion.estado === 'encontrado' && lote.esperados.some((b) => b.numeroInventario === resolucion.bien.numeroInventario);
  const item: ItemLote = {
    idCliente: nuevoId(),
    clave,
    leido: lectura.valor,
    simbologia: lectura.simbologia,
    estado: resolucion.estado,
    ...(resolucion.estado === 'encontrado' ? { bien: resolucion.bien } : {}),
    veces: 1,
    enEsperados,
    hora: ahora.toISOString(),
  };
  // Los más recientes van primero.
  return { lote: { ...lote, items: [item, ...lote.items] }, repetido: false, item };
}

/** Quita un ítem (por ejemplo, una lectura equivocada). */
export const quitarItem = (lote: Lote, clave: string): Lote => ({ ...lote, items: lote.items.filter((i) => i.clave !== clave) });

/** Aplica el resultado de volver a consultar un ítem que había quedado sin verificar. */
export function resolverPendiente(lote: Lote, clave: string, resolucion: Resolucion): Lote {
  const pendiente = lote.items.find((i) => i.clave === clave && i.estado === 'sin_verificar');
  if (!pendiente || resolucion.estado === 'sin_verificar') return lote;
  const nuevaClave = claveDe(pendiente.simbologia, pendiente.leido, resolucion);
  const resto = lote.items.filter((i) => i.clave !== clave);
  const igual = resto.find((i) => i.clave === nuevaClave);
  if (igual) {
    return { ...lote, items: resto.map((i) => (i.clave === nuevaClave ? { ...i, veces: i.veces + pendiente.veces } : i)) };
  }
  const resuelto: ItemLote = {
    ...pendiente,
    clave: nuevaClave,
    estado: resolucion.estado,
    ...(resolucion.estado === 'encontrado' ? { bien: resolucion.bien } : {}),
    enEsperados: resolucion.estado === 'encontrado' && lote.esperados.some((b) => b.numeroInventario === resolucion.bien.numeroInventario),
  };
  return { ...lote, items: lote.items.map((i) => (i.clave === clave ? resuelto : i)) };
}

/** Completa lo que les falta a los lotes guardados por una versión anterior de la app. */
export function asegurarIds(lote: Lote, nuevoId: () => string): Lote {
  return {
    ...lote,
    id: lote.id ?? nuevoId(),
    enviados: lote.enviados ?? [],
    items: lote.items.map((i) => (i.idCliente ? i : { ...i, idCliente: nuevoId() })),
  };
}

/**
 * Relevamientos listos para subir: todo lo que el servidor todavía no confirmó, salvo lo que quedó sin
 * verificar (se resuelve antes de enviar, porque el servidor no modifica un relevamiento ya registrado).
 */
export function relevamientosPorEnviar(lote: Lote): RelevamientoDto[] {
  const hechos = new Set(lote.enviados);
  return lote.items
    .filter((i) => i.estado !== 'sin_verificar' && !hechos.has(i.idCliente))
    .map((i) => ({
      idCliente: i.idCliente,
      loteId: lote.id,
      ...(lote.jornadaId ? { jornadaId: lote.jornadaId } : {}),
      resultado: i.estado === 'encontrado' ? 'encontrado' : 'no_encontrado',
      ...(i.bien ? { numeroInventario: i.bien.numeroInventario } : {}),
      simbologia: i.simbologia,
      valorLeido: i.leido,
      ubicacionObservada: lote.ubicacion,
      relevadoEnDispositivo: i.hora,
    }));
}

/** Marca como confirmados por el servidor los relevamientos indicados. */
export const marcarEnviados = (lote: Lote, idsClientes: string[]): Lote => ({
  ...lote,
  enviados: [...new Set([...lote.enviados, ...idsClientes])],
});

interface ResumenLote {
  esperados: number;
  /** Escaneados que el catálogo ubica en esta ubicación. */
  encontrados: ItemLote[];
  /** Escaneados que el catálogo ubica en otra ubicación. */
  otraUbicacion: ItemLote[];
  noEncontrados: ItemLote[];
  sinVerificar: ItemLote[];
  /** Esperados que no se escanearon. */
  faltantes: BienDto[];
  repetidos: number;
}

export function resumir(lote: Lote): ResumenLote {
  const encontrados = lote.items.filter((i) => i.estado === 'encontrado' && i.enEsperados);
  const vistos = new Set(encontrados.map((i) => i.bien!.numeroInventario));
  return {
    esperados: lote.esperados.length,
    encontrados,
    otraUbicacion: lote.items.filter((i) => i.estado === 'encontrado' && !i.enEsperados),
    noEncontrados: lote.items.filter((i) => i.estado === 'no_encontrado'),
    sinVerificar: lote.items.filter((i) => i.estado === 'sin_verificar'),
    faltantes: lote.esperados.filter((b) => !vistos.has(b.numeroInventario)),
    repetidos: lote.items.filter((i) => i.veces > 1).length,
  };
}

const MAX_LINEAS = 200;

function lista(titulo: string, lineas: string[]) {
  if (!lineas.length) return [];
  const mostradas = lineas.slice(0, MAX_LINEAS).map((l) => `- ${l}`);
  if (lineas.length > MAX_LINEAS) mostradas.push(`… y ${lineas.length - MAX_LINEAS} más`);
  return ['', `${titulo} (${lineas.length}):`, ...mostradas];
}

const recortar = (texto: string | null | undefined, largo = 70) => {
  const t = (texto ?? 'Sin descripción').replace(/\s+/g, ' ').trim();
  return t.length > largo ? `${t.slice(0, largo - 1)}…` : t;
};

/** Resumen en texto plano, para compartir por correo o mensajería. */
export function textoResumen(lote: Lote, fecha: string): string {
  const r = resumir(lote);
  return [
    `Relevamiento por lote — ${lote.ubicacion}`,
    `Fecha: ${fecha}`,
    `Esperados en el catálogo: ${r.esperados}`,
    `Encontrados en esta ubicación: ${r.encontrados.length} de ${r.esperados}`,
    `Encontrados que figuran en otra ubicación: ${r.otraUbicacion.length}`,
    `No encontrados en el catálogo: ${r.noEncontrados.length}`,
    ...(r.sinVerificar.length ? [`Sin verificar (sin conexión): ${r.sinVerificar.length}`] : []),
    `Faltantes: ${r.faltantes.length}`,
    ...lista('Faltantes', r.faltantes.map((b) => `${b.numeroInventario} ${recortar(b.descripcion)}`)),
    ...lista('Encontrados que figuran en otra ubicación', r.otraUbicacion.map((i) => `${i.bien!.numeroInventario} ${recortar(i.bien!.descripcion)} (figura en: ${i.bien!.ubicacionFisica ?? 'sin ubicación'})`)),
    ...lista('No encontrados en el catálogo', r.noEncontrados.map((i) => i.leido)),
    ...lista('Sin verificar', r.sinVerificar.map((i) => i.leido)),
    '',
    'Este resumen es informativo: no modifica SIU Diaguita.',
  ].join('\n');
}
