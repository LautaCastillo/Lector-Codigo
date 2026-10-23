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
