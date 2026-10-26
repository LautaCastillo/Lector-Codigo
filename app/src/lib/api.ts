// Punto único por el que las pantallas piden datos. Desde la fase 3 del plan v3 todo va directo a Supabase:
//  - cuentas y sesión: este archivo,
//  - catálogo de bienes: lib/catalogo.ts,
//  - relevamientos, hallazgos con foto, exportación y auditoría: lib/relevamientos.ts.
// Ya no hay llamadas al backend propio.
import {
  SIMBOLOGIAS_POR_DEFECTO,
  type BienDetalleDto,
  type CambioBienDto,
  type CuentaDto,
  type EstadoCuenta,
  type RelevamientoRegistradoDto,
  type ResultadoEscaneoDto,
  type Rol,
  type Simbologia,
} from '@patrimonio/shared';
import {
  areas,
  bienesPor,
  responsables,
  bienesDeUbicacion as bienesDeUbicacionCatalogo,
  buscar,
  buscarPorInventario,
  historial,
  resolverEscaneo,
  ubicaciones,
} from './catalogo';
import {
  obtenerRelevamiento as obtenerRelevamientoDirecto,
  relevamientosDeBien as relevamientosDeBienDirecto,
  vincularHallazgo as vincularHallazgoDirecto,
} from './relevamientos';
import { supabase } from './supabase';

export interface Perfil {
  id: string;
  cuenta: string;
  nombre: string | null;
  rol: 'administrador' | 'relevador';
  estado: EstadoCuenta;
  activo: boolean;
  motivoEstado: string | null;
  /** Tiene una contraseña temporal: debe elegir una nueva antes de usar la app. */
  debeCambiarClave: boolean;
}

/** Error con el código de estado que las pantallas usan para distinguir "no existe" (404) de otros fallos. */
export class ErrorApi extends Error {
  constructor(
    readonly estado: number,
    mensaje: string,
  ) {
    super(mensaje);
  }
}

const mensajeDe = (error: { message: string }) => error.message;

// ---------------------------------------------------------------------------------------------------------
// Cuentas y sesión
// ---------------------------------------------------------------------------------------------------------

/** La cuenta de la persona que inició sesión, o null si todavía no tiene una habilitada. */
export async function obtenerPerfil(authId: string): Promise<Perfil | null> {
  const { data, error } = await supabase
    .from('usuario')
    .select('id, cuenta, nombre, rol, estado, motivoEstado, debeCambiarClave')
    .eq('authId', authId)
    .maybeSingle();
  if (error) throw new Error(mensajeDe(error));
  if (!data) return null;
  return { ...(data as Omit<Perfil, 'activo'>), activo: data.estado === 'activa' };
}

/** Solo se puede cambiar el propio nombre: lo imponen los privilegios y las políticas de la base. */
export async function actualizarNombre(id: string, nombre: string): Promise<void> {
  const { error } = await supabase.from('usuario').update({ nombre }).eq('id', id);
  if (error) throw new Error(mensajeDe(error));
}

/** La persona terminó de cambiar su contraseña: se limpia la marca de "contraseña temporal". */
export async function marcarClaveCambiada(): Promise<void> {
  const { error } = await supabase.rpc('marcar_clave_cambiada');
  if (error) throw new Error(mensajeDe(error));
}

/** Deja el último acceso y el evento de auditoría de un inicio de sesión. Un fallo no impide entrar. */
export async function registrarInicioDeSesion(): Promise<void> {
  await supabase.rpc('registrar_inicio_sesion');
}

/** Solo administradores: todas las cuentas, de la más nueva a la más vieja. */
export async function listarCuentas(): Promise<CuentaDto[]> {
  const { data, error } = await supabase
    .from('usuario')
    .select('id, cuenta, nombre, rol, estado, creadoEn, aprobadoEn, motivoEstado, debeCambiarClave')
    .order('creadoEn', { ascending: false });
  if (error) throw new Error(mensajeDe(error));
  return (data ?? []) as CuentaDto[];
}

export type AccionCuenta = 'suspender' | 'reactivar' | 'baja';
const ESTADO_DE: Record<AccionCuenta, EstadoCuenta> = { suspender: 'suspendida', reactivar: 'activa', baja: 'baja' };

/** Solo administradores. Suspender y dar de baja piden un motivo y cierran las sesiones abiertas. */
export async function cambiarEstadoCuenta(id: string, accion: AccionCuenta, motivo?: string): Promise<void> {
  const { error } = await supabase.rpc('cambiar_estado_cuenta', {
    p_usuario_id: id,
    p_estado: ESTADO_DE[accion],
    p_motivo: motivo ?? null,
  });
  if (error) throw new Error(mensajeDe(error));
}

export async function cambiarRolCuenta(id: string, rol: Rol, motivo: string): Promise<void> {
  const { error } = await supabase.rpc('cambiar_rol_cuenta', { p_usuario_id: id, p_rol: rol, p_motivo: motivo });
  if (error) throw new Error(mensajeDe(error));
}

/** Llama a la Edge Function de administración. Devuelve el mensaje del servidor si falla. */
async function administrarCuentas<T>(cuerpo: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('admin-cuentas', { body: cuerpo });
  if (error) {
    const respuesta = (error as { context?: Response }).context;
    const detalle = respuesta ? ((await respuesta.json().catch(() => null)) as { error?: string } | null) : null;
    throw new Error(detalle?.error ?? 'No se pudo completar la operación. Revisá la conexión.');
  }
  return data as T;
}

export interface CuentaCreada {
  id: string;
  cuenta: string;
  /** Se muestra una sola vez: el administrador se la entrega a la persona. */
  claveTemporal: string;
}

export const crearCuenta = (usuario: string, nombre: string, rol: Rol) =>
  administrarCuentas<CuentaCreada>({ accion: 'crear', usuario, nombre, rol });

export const restablecerClave = (usuarioId: string) =>
  administrarCuentas<{ claveTemporal: string }>({ accion: 'restablecer', usuarioId });

// ---------------------------------------------------------------------------------------------------------
// Relevamientos, hallazgos con foto, exportación y auditoría (lib/relevamientos.ts)
// ---------------------------------------------------------------------------------------------------------
export { exportarRelevamientos, fotoDeRelevamiento, listarAuditoria, misRelevamientos, relevamientosDelEquipo, listarJornadas, obtenerJornada, abrirJornada, cerrarJornada, avanceDeJornada, suscribirseAJornada, subirFotoDeHallazgo, subirRelevamientos } from './relevamientos';
export type { ArchivoCsv, FiltroExportacion, FilaAvance, Jornada } from './relevamientos';

/** Los últimos relevamientos de un bien, de cualquier relevador. */
export async function relevamientosDeBien(numero: string, limite = 5): Promise<RelevamientoRegistradoDto[]> {
  const lista = await relevamientosDeBienDirecto(numero, limite);
  if (!lista) throw new ErrorApi(404, 'Este bien no está en el catálogo.');
  return lista;
}

export async function obtenerRelevamiento(id: string): Promise<RelevamientoRegistradoDto> {
  const relevamiento = await obtenerRelevamientoDirecto(id);
  if (!relevamiento) throw new ErrorApi(404, 'No se encontró el relevamiento o no tenés permiso para verlo.');
  return relevamiento;
}

/** Solo administradores: asocia un hallazgo con el bien del catálogo al que corresponde. */
export async function vincularHallazgo(id: string, numeroInventario: string, motivo: string): Promise<RelevamientoRegistradoDto> {
  const bien = await buscarPorInventario(numeroInventario);
  if (!bien) throw new ErrorApi(404, 'El bien no existe en el catálogo.');
  await vincularHallazgoDirecto(id, bien.id, motivo);
  return obtenerRelevamiento(id);
}

// ---------------------------------------------------------------------------------------------------------
// Catálogo de bienes (lib/catalogo.ts)
// ---------------------------------------------------------------------------------------------------------
export const listarUbicaciones = () => ubicaciones();
export const listarAreas = () => areas();
export const listarResponsables = () => responsables();
export const bienesDe = bienesPor;
export type { Agrupacion, BienDeLista, CampoAgrupacion } from './catalogo';

/** Bienes que el catálogo ubica en `nombre` (hasta 1000). */
export const bienesDeUbicacion = (nombre: string) => bienesDeUbicacionCatalogo(nombre);

export const buscarBienes = (texto: string) => buscar(texto);

export async function obtenerBien(numero: string): Promise<BienDetalleDto> {
  const bien = await buscarPorInventario(numero);
  if (!bien) throw new ErrorApi(404, 'Este bien no está en el catálogo.');
  return bien;
}

export async function historialBien(numero: string): Promise<CambioBienDto[]> {
  const cambios = await historial(numero);
  if (!cambios) throw new ErrorApi(404, 'Este bien no está en el catálogo.');
  return cambios;
}

export const enviarEscaneo = (simbologia: Simbologia, valor: string): Promise<ResultadoEscaneoDto> => resolverEscaneo(simbologia, valor);

/** Simbologías que lee la cámara. Por ahora son las predeterminadas; una lista configurable llegará con la tabla de ajustes. */
export async function simbologiasHabilitadas(): Promise<Simbologia[]> {
  return [...SIMBOLOGIAS_POR_DEFECTO];
}
