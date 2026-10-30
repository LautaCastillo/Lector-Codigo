// Exportación de relevamientos a CSV (armada en el teléfono) y su historial de constancias.
import { construirCsv, MAX_FILAS_EXPORTACION, nombreDeArchivo, type ResultadoRelevamiento } from '@patrimonio/shared';
import * as Crypto from 'expo-crypto';
import { miId } from './cuentas';
import { COLUMNAS_RELEVAMIENTO } from './relevamientos';
import { supabase } from './supabase';
import { aIso, comprobar, type Fila } from './util';

/** Filas por pedido al leer (la API corta a 1000 por pedido). */
const PAGINA = 1000;

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

export interface Exportacion {
  id: string;
  formato: 'csv' | 'pdf';
  filtros: { desde?: string | null; hasta?: string | null; ubicacion?: string | null; resultado?: string | null; alcance?: 'propios' | 'todos' } | null;
  filas: number;
  hashSha256: string | null;
  creadoEn: string;
  usuario: string;
}

/** Las exportaciones hechas, de la más reciente a la más antigua. Cualquier cuenta activa puede verlas (solo la constancia, no el contenido). */
export async function historialExportaciones(limite = 100): Promise<Exportacion[]> {
  const filas = (comprobar(await supabase.rpc('historial_exportaciones', { p_limite: limite })) ?? []) as Exportacion[];
  return filas.map((f) => ({ ...f, creadoEn: aIso(f.creadoEn) }));
}
