// Cuentas y sesión: el perfil de quien inició sesión y la administración de cuentas (solo administradores).
import { type CuentaDto, type EstadoCuenta, type Rol } from '@patrimonio/shared';
import { supabase } from './supabase';
import { comprobar } from './util';

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

/** La cuenta de la persona que inició sesión, o null si todavía no tiene una habilitada. */
export async function obtenerPerfil(authId: string): Promise<Perfil | null> {
  const { data, error } = await supabase
    .from('usuario')
    .select('id, cuenta, nombre, rol, estado, motivoEstado, debeCambiarClave')
    .eq('authId', authId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return { ...(data as Omit<Perfil, 'activo'>), activo: data.estado === 'activa' };
}

/** Solo se puede cambiar el propio nombre: lo imponen los privilegios y las políticas de la base. */
export async function actualizarNombre(id: string, nombre: string): Promise<void> {
  const { error } = await supabase.from('usuario').update({ nombre }).eq('id', id);
  if (error) throw new Error(error.message);
}

/** La persona terminó de cambiar su contraseña: se limpia la marca de "contraseña temporal". */
export async function marcarClaveCambiada(): Promise<void> {
  const { error } = await supabase.rpc('marcar_clave_cambiada');
  if (error) throw new Error(error.message);
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
  if (error) throw new Error(error.message);
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
  if (error) throw new Error(error.message);
}

export async function cambiarRolCuenta(id: string, rol: Rol, motivo: string): Promise<void> {
  const { error } = await supabase.rpc('cambiar_rol_cuenta', { p_usuario_id: id, p_rol: rol, p_motivo: motivo });
  if (error) throw new Error(error.message);
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
