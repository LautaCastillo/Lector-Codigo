// Relevamientos, hallazgos con foto, exportación y auditoría directo contra Supabase (plan v3, fase 3).
// Reemplaza lo que hacían `relevamientos.service.ts`, `exportaciones.service.ts` y `auditoria.service.ts` del backend.
// La seguridad la imponen las políticas RLS y las funciones de la base: cada cuenta ve e inserta lo suyo.
import {
  candidatosInventario,
  construirCsv,
  MAX_FILAS_EXPORTACION,
  nombreDeArchivo,
  validarRelevamiento,
  type BienDto,
  type ClaseHallazgo,
  type EventoAuditoriaDto,
  type RelevamientoDto,
  type RelevamientoRegistradoDto,
  type ResultadoRelevamiento,
  type ResultadoSubidaDto,
} from '@patrimonio/shared';
import * as Crypto from 'expo-crypto';
import type { File } from 'expo-file-system';
import { supabase } from './supabase';

const COLUMNAS_BIEN = 'id, numeroInventario, descripcion, estadoCodigo, estadoBien, ubicacionFisica, areaResponsable, catalogo';
const COLUMNAS_RELEVAMIENTO = `*, bien:bien(${COLUMNAS_BIEN}), usuario:usuario(cuenta, nombre)`;
/** Filas por pedido al insertar y al leer (la API corta a 1000 por pedido). */
const TANDA = 100;
const PAGINA = 1000;

type Fila = Record<string, unknown>;

function comprobar<T>(resultado: { data: T; error: { message: string } | null }): T {
  if (resultado.error) throw new Error(resultado.error.message);
  return resultado.data;
}

/** Las columnas `timestamp` sin zona llegan sin la "Z": se las toma como UTC, como las guarda el servidor. */
const aIso = (valor: unknown): string => {
  const texto = String(valor);
  return new Date(/(Z|[+-]\d{2}(:?\d{2})?)$/i.test(texto) ? texto : `${texto}Z`).toISOString();
};

let miIdEnCache: { authId: string; id: string } | null = null;

/** Identificador de la cuenta (`usuario.id`) de quien tiene la sesión abierta. */
export async function miId(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const authId = data.session?.user.id;
  if (!authId) throw new Error('Iniciá sesión para continuar.');
  if (miIdEnCache?.authId === authId) return miIdEnCache.id;
  const fila = comprobar(await supabase.from('usuario').select('id').eq('authId', authId).maybeSingle()) as { id: string } | null;
  if (!fila) throw new Error('Tu cuenta no está habilitada.');
  miIdEnCache = { authId, id: fila.id };
  return fila.id;
}

function aDto(f: Fila, yo: string): RelevamientoRegistradoDto {
  const bien = f.bien as Fila | null;
  const usuario = f.usuario as { cuenta: string; nombre: string | null } | null;
  return {
    id: f.id as string,
    idCliente: f.idCliente as string,
    loteId: (f.loteId as string | null) ?? null,
    resultado: f.resultado as ResultadoRelevamiento,
    simbologia: (f.simbologia as string | null) ?? null,
    valorLeido: (f.valorLeido as string | null) ?? null,
    ubicacionObservada: (f.ubicacionObservada as string | null) ?? null,
    observaciones: (f.observaciones as string | null) ?? null,
    estadoDetectado: (f.estadoDetectado as string | null) ?? null,
    clase: (f.clase as ClaseHallazgo | null) ?? null,
    descripcion: (f.descripcion as string | null) ?? null,
    numeroSerie: (f.numeroSerie as string | null) ?? null,
    codigoProvisorio: (f.codigoProvisorio as string | null) ?? null,
    tieneFoto: !!f.fotoPath,
    relevadoEnDispositivo: aIso(f.relevadoEnDispositivo),
    sincronizadoEn: aIso(f.sincronizadoEn),
    relevador: usuario ? (usuario.nombre ?? usuario.cuenta) : '',
    propio: f.usuarioId === yo,
    bien: bien
      ? {
          id: bien.id as string,
          numeroInventario: bien.numeroInventario as string,
          descripcion: (bien.descripcion as string | null) ?? null,
          estadoCodigo: bien.estadoCodigo as BienDto['estadoCodigo'],
          estadoBien: (bien.estadoBien as string | null) ?? null,
          ubicacionFisica: (bien.ubicacionFisica as string | null) ?? null,
          areaResponsable: (bien.areaResponsable as string | null) ?? null,
          catalogo: (bien.catalogo as string | null) ?? null,
        }
      : null,
  };
}

/**
 * Registra relevamientos de forma idempotente: lo que ya llegó antes (mismo `idCliente`) se cuenta como duplicado
 * y no se vuelve a guardar. Los elementos inválidos se rechazan uno por uno sin frenar al resto.
 */
export async function subirRelevamientos(items: RelevamientoDto[]): Promise<ResultadoSubidaDto> {
  const yo = await miId();
  const resultado: ResultadoSubidaDto = { registrados: 0, duplicados: 0, rechazados: [] };

  const validos = [] as ReturnType<typeof validos_>;
  const vistos = new Set<string>();
  for (const item of items) {
    const v = validarRelevamiento(item);
    if ('error' in v) resultado.rechazados.push({ idCliente: item.idCliente ?? '', motivo: v.error });
    else if (vistos.has(v.valido.idCliente)) resultado.rechazados.push({ idCliente: v.valido.idCliente, motivo: 'idCliente repetido en la subida' });
    else {
      vistos.add(v.valido.idCliente);
      validos.push(v.valido);
    }
  }
  function validos_() {
    return [] as Extract<ReturnType<typeof validarRelevamiento>, { valido: unknown }>['valido'][];
  }

  // Los "encontrados" apuntan al bien del catálogo: se resuelve su identificador.
  const numeros = [...new Set(validos.flatMap((v) => (v.resultado === 'encontrado' && v.numeroInventario ? [v.numeroInventario] : [])))];
  const bienPorNumero = new Map<string, string>();
  for (let i = 0; i < numeros.length; i += 200) {
    const filas = comprobar(
      await supabase.from('bien').select('id, numeroInventario').in('numeroInventario', numeros.slice(i, i + 200)),
    ) as { id: string; numeroInventario: string }[];
    for (const f of filas) bienPorNumero.set(f.numeroInventario, f.id);
  }

  const filas: { idCliente: string; fila: Fila }[] = [];
  for (const v of validos) {
    if (v.resultado === 'encontrado' && !bienPorNumero.has(v.numeroInventario ?? '')) {
      resultado.rechazados.push({ idCliente: v.idCliente, motivo: 'El bien no existe en el catálogo' });
      continue;
    }
    filas.push({
      idCliente: v.idCliente,
      fila: {
        idCliente: v.idCliente,
        usuarioId: yo,
        bienId: v.resultado === 'encontrado' ? (bienPorNumero.get(v.numeroInventario ?? '') ?? null) : null,
        resultado: v.resultado,
        simbologia: v.simbologia ?? null,
        valorLeido: v.valorLeido ?? null,
        ubicacionObservada: v.ubicacionObservada ?? null,
        loteId: v.loteId ?? null,
        jornadaId: v.jornadaId ?? null,
        observaciones: v.observaciones ?? null,
        estadoDetectado: v.estadoDetectado ?? null,
        ...(v.resultado === 'hallazgo' ? { clase: v.clase, descripcion: v.descripcion, numeroSerie: v.numeroSerie ?? null } : {}),
        relevadoEnDispositivo: v.fecha.toISOString(),
      },
    });
  }

  /** Inserta ignorando los que ya existen; devuelve cuántos entraron. */
  const insertar = async (tanda: Fila[]) => {
    const { data, error } = await supabase.from('relevamiento').upsert(tanda, { onConflict: 'idCliente', ignoreDuplicates: true }).select('idCliente');
    if (error) throw error;
    return data?.length ?? 0;
  };

  for (let i = 0; i < filas.length; i += TANDA) {
    const tanda = filas.slice(i, i + TANDA);
    try {
      const nuevos = await insertar(tanda.map((t) => t.fila));
      resultado.registrados += nuevos;
      resultado.duplicados += tanda.length - nuevos;
    } catch (errorTanda) {
      // Un elemento malo no tiene que frenar al resto: se reintenta uno por uno para aislar el rechazado.
      const permiso = (errorTanda as { code?: string }).code === '42501';
      if (permiso) throw new Error('Tu cuenta no tiene permiso para registrar relevamientos.');
      for (const t of tanda) {
        try {
          const nuevos = await insertar([t.fila]);
          resultado.registrados += nuevos;
          resultado.duplicados += 1 - nuevos;
        } catch (error) {
          resultado.rechazados.push({ idCliente: t.idCliente, motivo: (error as { message?: string }).message ?? 'No se pudo registrar' });
        }
      }
    }
  }
  return resultado;
}

/** Los relevamientos de la propia cuenta, del más reciente al más antiguo. */
export async function misRelevamientos(limite = 300): Promise<RelevamientoRegistradoDto[]> {
  const yo = await miId();
  const filas = comprobar(
    await supabase.from('relevamiento').select(COLUMNAS_RELEVAMIENTO).eq('usuarioId', yo).order('relevadoEnDispositivo', { ascending: false }).limit(limite),
  ) as Fila[];
  return filas.map((f) => aDto(f, yo));
}

/** Convierte una fila de `relevamientos_visibles` (con los datos del bien en columnas planas) en el DTO. */
function desdeFilaVisible(f: Fila): RelevamientoRegistradoDto {
  return {
    id: f.id as string,
    idCliente: f.idCliente as string,
    loteId: (f.loteId as string | null) ?? null,
    resultado: f.resultado as ResultadoRelevamiento,
    simbologia: (f.simbologia as string | null) ?? null,
    valorLeido: (f.valorLeido as string | null) ?? null,
    ubicacionObservada: (f.ubicacionObservada as string | null) ?? null,
    observaciones: (f.observaciones as string | null) ?? null,
    estadoDetectado: (f.estadoDetectado as string | null) ?? null,
    clase: (f.clase as ClaseHallazgo | null) ?? null,
    descripcion: (f.descripcion as string | null) ?? null,
    numeroSerie: (f.numeroSerie as string | null) ?? null,
    codigoProvisorio: (f.codigoProvisorio as string | null) ?? null,
    tieneFoto: !!f.tieneFoto,
    relevadoEnDispositivo: aIso(f.relevadoEnDispositivo),
    sincronizadoEn: aIso(f.sincronizadoEn),
    relevador: f.relevador as string,
    propio: !!f.propio,
    bien: f.bienId
      ? {
          id: f.bienId as string,
          numeroInventario: f.numeroInventario as string,
          descripcion: (f.bienDescripcion as string | null) ?? null,
          estadoCodigo: f.estadoCodigo as BienDto['estadoCodigo'],
          estadoBien: (f.estadoBien as string | null) ?? null,
          ubicacionFisica: (f.ubicacionFisica as string | null) ?? null,
          areaResponsable: (f.areaResponsable as string | null) ?? null,
          catalogo: (f.catalogo as string | null) ?? null,
        }
      : null,
  };
}

/** Los relevamientos de todo el equipo (cualquier cuenta activa los ve), del más reciente al más antiguo. */
export async function relevamientosDelEquipo(limite = 300): Promise<RelevamientoRegistradoDto[]> {
  const filas = (comprobar(await supabase.rpc('relevamientos_visibles', { p_solo_mios: false, p_limite: limite })) ?? []) as Fila[];
  return filas.map(desdeFilaVisible);
}

/** Un relevamiento, propio o de otra cuenta del equipo. null si no existe. */
export async function obtenerRelevamiento(id: string): Promise<RelevamientoRegistradoDto | null> {
  const filas = (comprobar(await supabase.rpc('relevamientos_visibles', { p_id: id, p_limite: 1 })) ?? []) as Fila[];
  return filas[0] ? desdeFilaVisible(filas[0]) : null;
}

/** Los últimos relevamientos de un bien, de cualquier relevador; null si el bien no existe. */
export async function relevamientosDeBien(numero: string, limite: number): Promise<RelevamientoRegistradoDto[] | null> {
  const bien = comprobar(
    await supabase.from('bien').select(COLUMNAS_BIEN).in('numeroInventario', candidatosInventario(numero.trim())).limit(1).maybeSingle(),
  ) as Fila | null;
  if (!bien) return null;
  const filas = (comprobar(await supabase.rpc('relevamientos_de_bien', { p_bien_id: bien.id, p_limite: limite })) ?? []) as Fila[];
  return filas.map((f) => ({
    id: f.id as string,
    idCliente: f.idCliente as string,
    loteId: (f.loteId as string | null) ?? null,
    resultado: f.resultado as ResultadoRelevamiento,
    simbologia: (f.simbologia as string | null) ?? null,
    valorLeido: (f.valorLeido as string | null) ?? null,
    ubicacionObservada: (f.ubicacionObservada as string | null) ?? null,
    observaciones: (f.observaciones as string | null) ?? null,
    estadoDetectado: (f.estadoDetectado as string | null) ?? null,
    clase: (f.clase as ClaseHallazgo | null) ?? null,
    descripcion: (f.descripcion as string | null) ?? null,
    numeroSerie: (f.numeroSerie as string | null) ?? null,
    codigoProvisorio: (f.codigoProvisorio as string | null) ?? null,
    tieneFoto: !!f.tieneFoto,
    relevadoEnDispositivo: aIso(f.relevadoEnDispositivo),
    sincronizadoEn: aIso(f.sincronizadoEn),
    relevador: f.relevador as string,
    propio: !!f.propio,
    bien: {
      id: bien.id as string,
      numeroInventario: bien.numeroInventario as string,
      descripcion: (bien.descripcion as string | null) ?? null,
      estadoCodigo: bien.estadoCodigo as BienDto['estadoCodigo'],
      estadoBien: (bien.estadoBien as string | null) ?? null,
      ubicacionFisica: (bien.ubicacionFisica as string | null) ?? null,
      areaResponsable: (bien.areaResponsable as string | null) ?? null,
      catalogo: (bien.catalogo as string | null) ?? null,
    },
  }));
}

const aHex = (bytes: ArrayBuffer) => Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, '0')).join('');

/**
 * Sube la foto (un JPEG ya reducido) de un hallazgo propio al bucket privado y la adjunta al registro.
 * Es idempotente: si el archivo ya estaba subido o el hallazgo ya tiene foto, no se pisa nada.
 */
export async function subirFotoDeHallazgo(idCliente: string, foto: File): Promise<void> {
  const yo = await miId();
  const bytes = await foto.arrayBuffer();
  const ruta = `${yo}/${idCliente}.jpg`;
  const { error } = await supabase.storage.from('hallazgos').upload(ruta, bytes, { contentType: 'image/jpeg', upsert: false });
  // Si ya estaba subida (un reintento), se sigue con el adjunto.
  if (error && !/already exists|duplicate|409/i.test(`${error.message} ${(error as { statusCode?: string }).statusCode ?? ''}`)) {
    throw new Error(error.message);
  }
  const hash = aHex(await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, bytes));
  const respuesta = await supabase.rpc('adjuntar_foto', { p_id_cliente: idCliente, p_tamano: bytes.byteLength, p_hash: hash });
  if (respuesta.error) throw new Error(respuesta.error.message);
}

/** Dirección temporal (5 minutos) para mostrar la foto de un hallazgo; solo la ven su dueño y los administradores. */
export async function fotoDeRelevamiento(id: string): Promise<{ uri: string; headers: Record<string, string> } | null> {
  const fila = comprobar(await supabase.from('relevamiento').select('fotoPath').eq('id', id).maybeSingle()) as { fotoPath: string | null } | null;
  if (!fila?.fotoPath) return null;
  const { data, error } = await supabase.storage.from('hallazgos').createSignedUrl(fila.fotoPath, 300);
  if (error || !data) throw new Error(error?.message ?? 'No se pudo abrir la foto.');
  return { uri: data.signedUrl, headers: {} };
}

/** Solo administradores: asocia un hallazgo con el bien del catálogo al que corresponde. */
export async function vincularHallazgo(id: string, bienId: string, motivo: string): Promise<void> {
  const { error } = await supabase.rpc('vincular_hallazgo', { p_id: id, p_bien_id: bienId, p_motivo: motivo });
  if (error) throw new Error(error.message);
}

export interface FiltroExportacion {
  desde?: string;
  hasta?: string;
  ubicacion?: string;
  resultado?: ResultadoRelevamiento;
  /** Un administrador puede limitar la exportación a lo suyo. */
  mios?: boolean;
}

export interface ArchivoCsv {
  csv: string;
  nombre: string;
  filas: number;
  /** Huella SHA-256 del archivo: la misma queda registrada en la constancia de la exportación. */
  hash: string;
  /** Había más de 10.000 filas: solo se exportaron las más recientes. */
  truncado: boolean;
}

/**
 * Arma el CSV de relevamientos en el teléfono. Un relevador exporta lo suyo (lo impone la base) y un
 * administrador, lo de todos o solo lo propio. Queda la constancia con filtros, filas y huella SHA-256.
 */
export async function exportarRelevamientos(filtro: FiltroExportacion, administrador: boolean): Promise<ArchivoCsv> {
  const yo = await miId();
  const solo = !administrador || filtro.mios;
  const recolectadas: Fila[] = [];
  for (let desde = 0; recolectadas.length <= MAX_FILAS_EXPORTACION; desde += PAGINA) {
    let consulta = supabase.from('relevamiento').select(COLUMNAS_RELEVAMIENTO).order('relevadoEnDispositivo', { ascending: false });
    if (solo) consulta = consulta.eq('usuarioId', yo);
    if (filtro.ubicacion) consulta = consulta.eq('ubicacionObservada', filtro.ubicacion);
    if (filtro.resultado) consulta = consulta.eq('resultado', filtro.resultado);
    if (filtro.desde) consulta = consulta.gte('relevadoEnDispositivo', filtro.desde);
    if (filtro.hasta) consulta = consulta.lte('relevadoEnDispositivo', filtro.hasta);
    const pagina = comprobar(await consulta.range(desde, desde + PAGINA - 1)) as Fila[];
    recolectadas.push(...pagina);
    if (pagina.length < PAGINA) break;
  }
  const truncado = recolectadas.length > MAX_FILAS_EXPORTACION;
  const filas = truncado ? recolectadas.slice(0, MAX_FILAS_EXPORTACION) : recolectadas;

  const csv = construirCsv(
    filas.map((f) => {
      const usuario = f.usuario as { cuenta: string; nombre: string | null };
      const bien = f.bien as { numeroInventario: string; descripcion: string | null; ubicacionFisica: string | null; estadoBien: string | null } | null;
      return {
        relevadoEnDispositivo: new Date(aIso(f.relevadoEnDispositivo)),
        sincronizadoEn: new Date(aIso(f.sincronizadoEn)),
        usuario,
        loteId: (f.loteId as string | null) ?? null,
        resultado: f.resultado as string,
        simbologia: (f.simbologia as string | null) ?? null,
        valorLeido: (f.valorLeido as string | null) ?? null,
        ubicacionObservada: (f.ubicacionObservada as string | null) ?? null,
        estadoDetectado: (f.estadoDetectado as string | null) ?? null,
        observaciones: (f.observaciones as string | null) ?? null,
        clase: (f.clase as string | null) ?? null,
        descripcion: (f.descripcion as string | null) ?? null,
        numeroSerie: (f.numeroSerie as string | null) ?? null,
        codigoProvisorio: (f.codigoProvisorio as string | null) ?? null,
        bien,
      };
    }),
  );
  const hash = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, csv);

  const filtros = {
    desde: filtro.desde ?? null,
    hasta: filtro.hasta ?? null,
    ubicacion: filtro.ubicacion ?? null,
    resultado: filtro.resultado ?? null,
    alcance: solo ? 'propios' : 'todos',
  };
  const constancia = await supabase.from('exportacion').insert({ usuarioId: yo, formato: 'csv', filtros, filas: filas.length, hashSha256: hash });
  if (constancia.error) throw new Error(constancia.error.message);

  return { csv, nombre: nombreDeArchivo(new Date()), filas: filas.length, hash, truncado };
}

/** Solo administradores (lo impone la base): los eventos más recientes del registro de auditoría. */
export async function listarAuditoria(limite: number): Promise<EventoAuditoriaDto[]> {
  const filas = comprobar(
    await supabase.from('evento_auditoria').select('*').order('horaServidor', { ascending: false }).limit(Math.min(limite, 200)),
  ) as Fila[];
  return filas.map((f) => ({
    id: f.id as string,
    tipo: f.tipo as string,
    actorUsuarioId: (f.actorUsuarioId as string | null) ?? null,
    actorRol: (f.actorRol as EventoAuditoriaDto['actorRol']) ?? null,
    entidadTipo: (f.entidadTipo as string | null) ?? null,
    entidadId: (f.entidadId as string | null) ?? null,
    resultado: f.resultado as string,
    motivo: (f.motivo as string | null) ?? null,
    datos: f.datos ?? null,
    horaServidor: aIso(f.horaServidor),
  }));
}

// --- Jornadas compartidas (plan v3, fase 5) -------------------------------------------------------------------

export interface Jornada {
  id: string;
  tipo: 'area' | 'ubicacion';
  alcance: string;
  nombre: string | null;
  estado: 'abierta' | 'cerrada';
  creadaPor: string;
  creadoEn: string;
  cerradaEn: string | null;
  esperados: number;
  encontrados: number;
  propia: boolean;
}

/** Una fila del avance: un bien esperado (con o sin relevar) o algo que apareció y no era del alcance de la jornada. */
export interface FilaAvance {
  tipo: 'esperado' | 'extra';
  relevamientoId: string | null;
  bienId: string | null;
  numeroInventario: string | null;
  descripcion: string | null;
  ubicacionFisica: string | null;
  areaResponsable: string | null;
  responsableUso: string | null;
  estadoBien: string | null;
  encontrado: boolean;
  resultado: ResultadoRelevamiento | null;
  ubicacionObservada: string | null;
  relevador: string | null;
  relevadoEn: string | null;
  /** Se lo encontró en una ubicación distinta de la que dice el catálogo. */
  fueraDeLugar: boolean;
}

/** Las jornadas, de la más reciente a la más antigua, con su avance. */
export async function listarJornadas(estado?: 'abierta' | 'cerrada'): Promise<Jornada[]> {
  const filas = (comprobar(await supabase.rpc('listar_jornadas', { p_estado: estado ?? null, p_id: null })) ?? []) as Jornada[];
  return filas.map((j) => ({ ...j, creadoEn: new Date(j.creadoEn).toISOString(), cerradaEn: j.cerradaEn ? new Date(j.cerradaEn).toISOString() : null }));
}

export async function obtenerJornada(id: string): Promise<Jornada | null> {
  const filas = (comprobar(await supabase.rpc('listar_jornadas', { p_estado: null, p_id: id })) ?? []) as Jornada[];
  const j = filas[0];
  return j ? { ...j, creadoEn: new Date(j.creadoEn).toISOString(), cerradaEn: j.cerradaEn ? new Date(j.cerradaEn).toISOString() : null } : null;
}

/** Abre una jornada del área o la ubicación, o devuelve la que ya está abierta (así se suma quien llega después). */
export async function abrirJornada(tipo: Jornada['tipo'], alcance: string): Promise<string> {
  const { data, error } = await supabase.rpc('crear_jornada', { p_tipo: tipo, p_alcance: alcance, p_nombre: null });
  if (error) throw new Error(error.message);
  return data as string;
}

export async function cerrarJornada(id: string): Promise<void> {
  const { error } = await supabase.rpc('cerrar_jornada', { p_id: id });
  if (error) throw new Error(error.message);
}

export async function avanceDeJornada(id: string): Promise<FilaAvance[]> {
  const filas = (comprobar(await supabase.rpc('avance_jornada', { p_id: id })) ?? []) as FilaAvance[];
  return filas.map((f) => ({ ...f, relevadoEn: f.relevadoEn ? aIso(f.relevadoEn) : null }));
}

/**
 * Avisa cada vez que alguien registra un relevamiento o cambia una jornada, para que la pantalla vuelva a pedir el avance.
 * Devuelve la función que cancela la suscripción.
 */
export function suscribirseAJornada(alCambiar: () => void): () => void {
  let temporizador: ReturnType<typeof setTimeout> | null = null;
  const avisar = () => {
    // Varias lecturas seguidas (un lote que se envía de golpe) se agrupan en una sola actualización.
    if (temporizador) clearTimeout(temporizador);
    temporizador = setTimeout(alCambiar, 400);
  };
  const canal = supabase
    .channel(`jornada-${Date.now()}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'relevamiento' }, avisar)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'jornada' }, avisar)
    .subscribe();
  return () => {
    if (temporizador) clearTimeout(temporizador);
    void supabase.removeChannel(canal);
  };
}
