import {
  SIMBOLOGIAS_POR_DEFECTO,
  type ResultadoEscaneoDto,
  type Simbologia,
} from '@patrimonio/shared';
import { supabase } from './supabase';

// En el celular, "localhost" es el propio teléfono: usar la IP de la PC en la red local.
const BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000';
const API_KEY = process.env.EXPO_PUBLIC_API_KEY;

export interface Perfil {
  cuenta: string;
  nombre: string | null;
  rol: 'administrador' | 'relevador';
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
      ...(API_KEY ? { 'x-api-key': API_KEY } : {}),
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
