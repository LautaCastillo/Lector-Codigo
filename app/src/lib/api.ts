import {
  SIMBOLOGIAS_POR_DEFECTO,
  type BienDetalleDto,
  type BienDto,
  type RelevamientoDto,
  type RelevamientoRegistradoDto,
  type ResultadoSubidaDto,
  type CambioBienDto,
  type CuentaDto,
  type UbicacionDto,
  type EstadoCuenta,
  type EventoAuditoriaDto,
  type ResultadoEscaneoDto,
  type Simbologia,
} from '@patrimonio/shared';
import { supabase } from './supabase';

// En el celular, "localhost" es el propio teléfono: usar la IP de la PC en la red local.
const BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000';

export interface Perfil {
  cuenta: string;
  nombre: string | null;
  rol: 'administrador' | 'relevador';
  estado: EstadoCuenta;
  activo: boolean;
}

export class ErrorApi extends Error {
  constructor(
    readonly estado: number,
    mensaje: string,
  ) {
    super(mensaje);
  }
}

async function pedir<T>(ruta: string, init?: RequestInit): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  const respuesta = await fetch(`${BASE_URL}${ruta}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
  });
  if (!respuesta.ok) {
    const cuerpo = (await respuesta.json().catch(() => null)) as { message?: string } | null;
    throw new ErrorApi(respuesta.status, cuerpo?.message ?? `Error ${respuesta.status} del servidor`);
  }
  return (await respuesta.json()) as T;
}

export interface FiltroExportacion {
  desde?: string;
  hasta?: string;
  ubicacion?: string;
  resultado?: 'encontrado' | 'no_encontrado' | 'sin_verificar' | 'hallazgo';
  /** Un administrador puede limitar la exportación a lo suyo. */
  mios?: boolean;
}

export interface ArchivoCsv {
  csv: string;
  nombre: string;
  filas: number;
  /** Huella SHA-256 del archivo: la misma queda registrada en el servidor. */
  hash: string;
  /** Había más de 10.000 filas: solo se exportaron las más recientes. */
  truncado: boolean;
}

/** Descarga los relevamientos en CSV. La exportación queda registrada en el servidor. */
export async function exportarRelevamientos(filtro: FiltroExportacion): Promise<ArchivoCsv> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  const params = new URLSearchParams();
  if (filtro.desde) params.set('desde', filtro.desde);
  if (filtro.hasta) params.set('hasta', filtro.hasta);
  if (filtro.ubicacion) params.set('ubicacion', filtro.ubicacion);
  if (filtro.resultado) params.set('resultado', filtro.resultado);
  if (filtro.mios) params.set('mios', '1');
  const respuesta = await fetch(`${BASE_URL}/relevamientos/exportar?${params.toString()}`, {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
  if (!respuesta.ok) {
    const cuerpo = (await respuesta.json().catch(() => null)) as { message?: string } | null;
    throw new ErrorApi(respuesta.status, cuerpo?.message ?? `Error ${respuesta.status} del servidor`);
  }
  return {
    csv: await respuesta.text(),
    nombre: respuesta.headers.get('content-disposition')?.match(/filename="([^"]+)"/)?.[1] ?? 'relevamientos.csv',
    filas: Number(respuesta.headers.get('x-filas') ?? 0),
    hash: respuesta.headers.get('x-hash-sha256') ?? '',
    truncado: respuesta.headers.get('x-truncado') === '1',
  };
}

export const obtenerPerfil = () => pedir<Perfil>('/me');

export const actualizarNombre = (nombre: string) =>
  pedir<Perfil>('/me', { method: 'PATCH', body: JSON.stringify({ nombre }) });

export type AccionCuenta = 'aprobar' | 'rechazar' | 'suspender' | 'reactivar' | 'baja';

/** Solo administradores. Sin `estado` trae todas las cuentas. */
/** Solo administradores. El servidor admite hasta 200 eventos por consulta. */
export const listarAuditoria = (limite: number) =>
  pedir<EventoAuditoriaDto[]>(`/admin/auditoria?limite=${limite}`);

export const listarCuentas = (estado?: EstadoCuenta) =>
  pedir<CuentaDto[]>(`/admin/usuarios${estado ? `?estado=${estado}` : ''}`);

export const cambiarEstadoCuenta = (id: string, accion: AccionCuenta, motivo?: string) =>
  pedir<CuentaDto>(`/admin/usuarios/${encodeURIComponent(id)}/${accion}`, {
    method: 'POST',
    body: JSON.stringify(motivo ? { motivo } : {}),
  });

/** El servidor admite hasta 500 por subida: se manda en tandas y se suman los resultados. */
export async function subirRelevamientos(relevamientos: RelevamientoDto[]): Promise<ResultadoSubidaDto> {
  const total: ResultadoSubidaDto = { registrados: 0, duplicados: 0, rechazados: [] };
  for (let i = 0; i < relevamientos.length; i += 400) {
    const r = await pedir<ResultadoSubidaDto>('/relevamientos', {
      method: 'POST',
      body: JSON.stringify({ relevamientos: relevamientos.slice(i, i + 400) }),
    });
    total.registrados += r.registrados;
    total.duplicados += r.duplicados;
    total.rechazados.push(...r.rechazados);
  }
  return total;
}

export const misRelevamientos = (limite = 300) => pedir<RelevamientoRegistradoDto[]>(`/me/relevamientos?limite=${limite}`);

/** Los últimos relevamientos de un bien, de cualquier relevador. */
export const relevamientosDeBien = (numero: string, limite = 5) =>
  pedir<RelevamientoRegistradoDto[]>(`/bienes/${encodeURIComponent(numero)}/relevamientos?limite=${limite}`);

/** Dirección y cabeceras para mostrar la foto de un hallazgo (requiere sesión). */
export async function fotoDeRelevamiento(id: string): Promise<{ uri: string; headers: Record<string, string> }> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  const headers: Record<string, string> = token ? { authorization: `Bearer ${token}` } : {};
  return { uri: `${BASE_URL}/relevamientos/${encodeURIComponent(id)}/foto`, headers };
}

/**
 * Sube la foto (un JPEG ya reducido) de un hallazgo propio. Es idempotente: reintentar con la misma
 * foto no hace nada.
 */
export async function subirFotoDeHallazgo(idCliente: string, foto: Blob): Promise<void> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  const respuesta = await fetch(`${BASE_URL}/relevamientos/cliente/${encodeURIComponent(idCliente)}/foto`, {
    method: 'PUT',
    headers: { 'content-type': 'image/jpeg', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: foto,
  });
  if (!respuesta.ok) {
    const cuerpo = (await respuesta.json().catch(() => null)) as { message?: string } | null;
    throw new ErrorApi(respuesta.status, cuerpo?.message ?? `Error ${respuesta.status} del servidor`);
  }
}

/** Solo administradores: asocia un hallazgo con el bien del catálogo al que corresponde. */
export const vincularHallazgo = (id: string, numeroInventario: string, motivo: string) =>
  pedir<RelevamientoRegistradoDto>(`/relevamientos/${encodeURIComponent(id)}/vincular`, {
    method: 'PATCH',
    body: JSON.stringify({ numeroInventario, motivo }),
  });

export const obtenerRelevamiento = (id: string) => pedir<RelevamientoRegistradoDto>(`/relevamientos/${encodeURIComponent(id)}`);

export const listarUbicaciones = () => pedir<UbicacionDto[]>('/ubicaciones');

/** Bienes que el catálogo ubica en `nombre` (hasta 1000). */
export const bienesDeUbicacion = (nombre: string) => pedir<BienDto[]>(`/bienes?ubicacion=${encodeURIComponent(nombre)}`);

export const buscarBienes = (texto: string) => pedir<BienDto[]>(`/bienes?q=${encodeURIComponent(texto)}`);

export const obtenerBien = (numero: string) => pedir<BienDetalleDto>(`/bienes/${encodeURIComponent(numero)}`);

export const historialBien = (numero: string) =>
  pedir<CambioBienDto[]>(`/bienes/${encodeURIComponent(numero)}/historial`);

export function enviarEscaneo(simbologia: Simbologia, valor: string) {
  return pedir<ResultadoEscaneoDto>('/bienes/escaneo', {
    method: 'POST',
    body: JSON.stringify({ simbologia, valor }),
  });
}

/** Si el servidor no responde, el escáner arranca con las simbologías por defecto. */
export async function simbologiasHabilitadas(): Promise<Simbologia[]> {
  try {
    const { habilitadas } = await pedir<{ habilitadas: Simbologia[] }>('/configuracion/simbologias');
    return habilitadas.length ? habilitadas : [...SIMBOLOGIAS_POR_DEFECTO];
  } catch {
    return [...SIMBOLOGIAS_POR_DEFECTO];
  }
}
