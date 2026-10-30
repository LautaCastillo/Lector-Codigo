// Relevamientos directo contra Supabase: subir lecturas y consultar las propias, las del equipo y las de un bien.
// La seguridad la imponen las políticas RLS y las funciones de la base: cada cuenta ve e inserta lo suyo.
import {
  candidatosInventario,
  validarRelevamiento,
  type BienDto,
  type ClaseHallazgo,
  type RelevamientoDto,
  type RelevamientoRegistradoDto,
  type ResultadoRelevamiento,
  type ResultadoSubidaDto,
} from '@patrimonio/shared';
import { aBienDto, COLUMNAS_BIEN } from './catalogo';
import { miId } from './cuentas';
import { supabase } from './supabase';
import { aIso, comprobar, ErrorApi, type Fila } from './util';

export const COLUMNAS_RELEVAMIENTO = `*, bien:bien(${COLUMNAS_BIEN}), usuario:usuario(cuenta, nombre)`;
/** Filas por pedido al insertar (la API corta a 1000 por pedido). */
const TANDA = 100;

const texto = (valor: unknown) => (valor as string | null) ?? null;

/** Los campos que tiene todo relevamiento, vengan de la tabla o de una función de la base. */
function datosBase(f: Fila) {
  return {
    id: f.id as string,
    idCliente: f.idCliente as string,
    loteId: texto(f.loteId),
    resultado: f.resultado as ResultadoRelevamiento,
    simbologia: texto(f.simbologia),
    valorLeido: texto(f.valorLeido),
    ubicacionObservada: texto(f.ubicacionObservada),
    observaciones: texto(f.observaciones),
    estadoDetectado: texto(f.estadoDetectado),
    clase: (f.clase as ClaseHallazgo | null) ?? null,
    descripcion: texto(f.descripcion),
    numeroSerie: texto(f.numeroSerie),
    codigoProvisorio: texto(f.codigoProvisorio),
    relevadoEnDispositivo: aIso(f.relevadoEnDispositivo),
    sincronizadoEn: aIso(f.sincronizadoEn),
  };
}

/** Un relevamiento leído de la tabla, con el bien y la cuenta anidados. */
function desdeTabla(f: Fila, yo: string): RelevamientoRegistradoDto {
  const bien = f.bien as Fila | null;
  const usuario = f.usuario as { cuenta: string; nombre: string | null } | null;
  return {
    ...datosBase(f),
    tieneFoto: !!f.fotoPath,
    relevador: usuario ? (usuario.nombre ?? usuario.cuenta) : '',
    propio: f.usuarioId === yo,
    bien: bien ? aBienDto(bien) : null,
  };
}

/** Un relevamiento devuelto por `relevamientos_visibles` (con los datos del bien en columnas planas). */
function desdeFilaVisible(f: Fila): RelevamientoRegistradoDto {
  return {
    ...datosBase(f),
    tieneFoto: !!f.tieneFoto,
    relevador: f.relevador as string,
    propio: !!f.propio,
    bien: f.bienId ? aBienDto({ ...f, id: f.bienId, descripcion: f.bienDescripcion }) : null,
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
  return filas.map((f) => desdeTabla(f, yo));
}

/** Los relevamientos de todo el equipo (cualquier cuenta activa los ve), del más reciente al más antiguo. */
export async function relevamientosDelEquipo(limite = 300): Promise<RelevamientoRegistradoDto[]> {
  const filas = (comprobar(await supabase.rpc('relevamientos_visibles', { p_solo_mios: false, p_limite: limite })) ?? []) as Fila[];
  return filas.map(desdeFilaVisible);
}

/** Un relevamiento, propio o de otra cuenta del equipo; lanza un `ErrorApi` 404 si no existe o no se puede ver. */
export async function obtenerRelevamiento(id: string): Promise<RelevamientoRegistradoDto> {
  const filas = (comprobar(await supabase.rpc('relevamientos_visibles', { p_id: id, p_limite: 1 })) ?? []) as Fila[];
  if (!filas[0]) throw new ErrorApi(404, 'No se encontró el relevamiento o no tenés permiso para verlo.');
  return desdeFilaVisible(filas[0]);
}

/** Los últimos relevamientos de un bien, de cualquier relevador; lanza un `ErrorApi` 404 si el bien no existe. */
export async function relevamientosDeBien(numero: string, limite = 5): Promise<RelevamientoRegistradoDto[]> {
  const bien = comprobar(
    await supabase.from('bien').select(COLUMNAS_BIEN).in('numeroInventario', candidatosInventario(numero.trim())).limit(1).maybeSingle(),
  ) as Fila | null;
  if (!bien) throw new ErrorApi(404, 'Este bien no está en el catálogo.');
  const filas = (comprobar(await supabase.rpc('relevamientos_de_bien', { p_bien_id: bien.id, p_limite: limite })) ?? []) as Fila[];
  const resumen: BienDto = aBienDto(bien);
  return filas.map((f) => ({ ...desdeFilaVisible(f), bien: resumen }));
}
