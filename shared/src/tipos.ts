import type { Simbologia } from './simbologias.js';

export const ESTADOS_CODIGO = ['legible', 'sin_codigo', 'codigo_danado', 'desconocido'] as const;
export type EstadoCodigo = (typeof ESTADOS_CODIGO)[number];

export const TITULARIDADES = ['propio', 'terceros'] as const;
export type Titularidad = (typeof TITULARIDADES)[number];

export const ROLES = ['administrador', 'relevador'] as const;
export type Rol = (typeof ROLES)[number];

export const ESTADOS_CUENTA = ['pendiente', 'activa', 'rechazada', 'suspendida', 'baja'] as const;
export type EstadoCuenta = (typeof ESTADOS_CUENTA)[number];

/** Tipos de evento del registro de auditoría. Se amplían al sumar funciones (relevamientos, exportaciones, sincronización). */
export const TIPOS_EVENTO_AUDITORIA = [
  'CUENTA_REGISTRADA',
  'CUENTA_APROBADA',
  'CUENTA_RECHAZADA',
  'ESTADO_CUENTA_CAMBIADO',
  'ROL_CAMBIADO',
  'SESION_INICIADA',
  'AUDITORIA_CONSULTADA',
] as const;
export type TipoEventoAuditoria = (typeof TIPOS_EVENTO_AUDITORIA)[number];

/** Evento de auditoría tal como lo devuelve la API. */
export interface EventoAuditoriaDto {
  id: string;
  tipo: string;
  actorUsuarioId: string | null;
  actorRol: Rol | null;
  entidadTipo: string | null;
  entidadId: string | null;
  resultado: string;
  motivo: string | null;
  datos: unknown;
  horaServidor: string;
}

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

/** Resumen de un bien: lo que se muestra al escanear y en los resultados de búsqueda. */
export interface BienDto {
  id: string;
  numeroInventario: string;
  descripcion: string | null;
  estadoCodigo: EstadoCodigo;
  estadoBien: string | null;
  ubicacionFisica: string | null;
  areaResponsable: string | null;
  catalogo: string | null;
}

/** Ubicación física y cuántos bienes del catálogo tiene asignados. */
export interface UbicacionDto {
  nombre: string;
  cantidad: number;
}

/** Ficha completa de un bien. Las fechas viajan como `aaaa-mm-dd` y el valor como número. */
export interface BienDetalleDto extends BienDto {
  motivoAlta: string | null;
  valorUnitario: number | null;
  fechaIncorporacion: string | null;
  numeroSerie: string | null;
  numeroAnterior: string | null;
  expediente: string | null;
  responsableUso: string | null;
  cantidad: number | null;
  proveedor: string | null;
  numeroFactura: string | null;
  fechaFactura: string | null;
  titularidad: Titularidad | null;
  /** Cuándo se cargó en la app y cuándo cambió por última vez (ISO 8601). */
  creadoEn: string;
  modificadoEn: string;
  codigos: { simbologia: string; valor: string }[];
}

/** Un cambio en la ficha de un bien, leído de los registros que dejan los triggers. */
export interface CambioBienDto {
  id: string;
  /** INSERT (alta en el catálogo), UPDATE o DELETE. */
  operacion: 'INSERT' | 'UPDATE' | 'DELETE';
  en: string;
  /** Nombre o cuenta de quien lo hizo; nulo si fue una importación o un cambio hecho fuera de la app. */
  actor: string | null;
  cambios: { campo: string; antes: unknown; despues: unknown }[];
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
