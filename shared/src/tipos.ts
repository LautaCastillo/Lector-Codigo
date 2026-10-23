import type { Simbologia } from './simbologias.js';

export const ESTADOS_CODIGO = ['legible', 'sin_codigo', 'codigo_danado', 'desconocido'] as const;
export type EstadoCodigo = (typeof ESTADOS_CODIGO)[number];

export const TITULARIDADES = ['propio', 'terceros'] as const;
export type Titularidad = (typeof TITULARIDADES)[number];

export const ROLES = ['administrador', 'relevador'] as const;
export type Rol = (typeof ROLES)[number];

export const ESTADOS_CUENTA = ['pendiente', 'activa', 'rechazada', 'suspendida', 'baja'] as const;
export type EstadoCuenta = (typeof ESTADOS_CUENTA)[number];

/** Cuenta tal como la ve el panel de administración. */
export interface CuentaDto {
  id: string;
  cuenta: string;
  nombre: string | null;
  rol: Rol;
  estado: EstadoCuenta;
  creadoEn: string;
  aprobadoEn: string | null;
  motivoEstado: string | null;
}

export interface EscaneoDto {
  simbologia: Simbologia;
  valor: string;
}

export interface BienDto {
  id: string;
  numeroInventario: string;
  descripcion: string | null;
  estadoCodigo: EstadoCodigo;
}

export interface ResultadoEscaneoDto {
  encontrado: boolean;
  /** Cómo se resolvió: por código registrado o por número de inventario. */
  via?: 'codigo' | 'inventario';
  bien?: BienDto;
}

/** Contrato de subida de relevamientos; idCliente (UUID) garantiza idempotencia. */
export interface RelevamientoDto {
  idCliente: string;
  numeroInventario?: string;
  simbologia?: Simbologia;
  valorLeido?: string;
  observaciones?: string;
  estadoDetectado?: string;
  /** ISO 8601, reloj del dispositivo. */
  relevadoEnDispositivo: string;
}
