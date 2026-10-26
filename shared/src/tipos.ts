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
  'CATALOGO_IMPORTADO',
  'JORNADA_CREADA',
  'JORNADA_CERRADA',
  'CUENTA_CREADA',
  'CLAVE_CAMBIADA',
  'CLAVE_RESTABLECIDA',
  'CUENTA_REGISTRADA',
  'CUENTA_APROBADA',
  'CUENTA_RECHAZADA',
  'ESTADO_CUENTA_CAMBIADO',
  'ROL_CAMBIADO',
  'SESION_INICIADA',
  'RELEVAMIENTO_REGISTRADO',
  'FOTO_ADJUNTADA',
  'HALLAZGO_VINCULADO',
  'EXPORTACION_GENERADA',
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
  /** La persona todavía no cambió la contraseña temporal que le dio un administrador. */
  debeCambiarClave?: boolean;
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

/**
 * Estados físicos que se pueden declarar al relevar. Son los valores que trae el catálogo de SIU en los
 * bienes cargados; la lista definitiva (cerrada) está pendiente de acordar con Patrimonio.
 */
export const ESTADOS_OBSERVABLES = ['Muy Bueno', 'Bueno', 'Malo'] as const;

export const RESULTADOS_RELEVAMIENTO = ['encontrado', 'no_encontrado', 'sin_verificar', 'hallazgo'] as const;
/**
 * `sin_verificar`: se leyó sin conexión y no se pudo comprobar si el bien está en el catálogo.
 * `hallazgo`: algo visto en campo que no se pudo asociar a un bien del catálogo (ver `ClaseHallazgo`).
 */
export type ResultadoRelevamiento = (typeof RESULTADOS_RELEVAMIENTO)[number];

export const CLASES_HALLAZGO = ['no_identificado', 'nuevo'] as const;
/**
 * `no_identificado`: existe, pero no se pudo asociar al catálogo (código dañado, ilegible o ausente).
 * `nuevo`: la persona cree que no figura en el catálogo. La diferencia exacta se acuerda con Patrimonio.
 */
export type ClaseHallazgo = (typeof CLASES_HALLAZGO)[number];

/** Foto de un hallazgo: un solo JPEG de hasta este tamaño, en bytes. */
export const MAX_BYTES_FOTO = 1_000_000;

/** Contrato de subida de relevamientos; idCliente (UUID) garantiza idempotencia. */
export interface RelevamientoDto {
  idCliente: string;
  /** UUID del lote del que forma parte, si se relevó en ráfaga. */
  loteId?: string;
  /** Jornada compartida (relevamiento de un área o una ubicación) a la que pertenece la lectura. */
  jornadaId?: string;
  /** Obligatorio cuando el resultado es `encontrado`. */
  numeroInventario?: string;
  /** Solo en hallazgos. La clase y la descripción son obligatorias. */
  clase?: ClaseHallazgo;
  descripcion?: string;
  numeroSerie?: string;
  simbologia?: Simbologia;
  valorLeido?: string;
  resultado: ResultadoRelevamiento;
  ubicacionObservada?: string;
  observaciones?: string;
  estadoDetectado?: string;
  /** ISO 8601, reloj del dispositivo. */
  relevadoEnDispositivo: string;
}

/** Respuesta a una subida: lo ya registrado antes se cuenta como duplicado y no se vuelve a guardar. */
export interface ResultadoSubidaDto {
  registrados: number;
  duplicados: number;
  rechazados: { idCliente: string; motivo: string }[];
}

/** Un relevamiento ya registrado en el servidor. */
export interface RelevamientoRegistradoDto {
  id: string;
  idCliente: string;
  loteId: string | null;
  resultado: ResultadoRelevamiento;
  simbologia: string | null;
  valorLeido: string | null;
  ubicacionObservada: string | null;
  observaciones: string | null;
  estadoDetectado: string | null;
  /** Solo en hallazgos. */
  clase: ClaseHallazgo | null;
  descripcion: string | null;
  numeroSerie: string | null;
  /** Identificador interno (H-XXXXXXXX) mientras el hallazgo no se vincule a un bien del catálogo. */
  codigoProvisorio: string | null;
  tieneFoto: boolean;
  /** Hora del reloj del dispositivo y hora en que llegó al servidor (ISO 8601). */
  relevadoEnDispositivo: string;
  sincronizadoEn: string;
  /** Nombre o cuenta de quien relevó. */
  relevador: string | null;
  /** El relevamiento es de la cuenta que consulta (solo esos se pueden abrir en detalle). */
  propio: boolean;
  bien: BienDto | null;
}
