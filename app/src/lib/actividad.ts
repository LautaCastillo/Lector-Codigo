import type { EventoAuditoriaDto } from '@patrimonio/shared';

export type Categoria = 'cuentas' | 'sesiones' | 'relevamientos' | 'consultas';

export const CATEGORIAS: { valor: Categoria; titulo: string }[] = [
  { valor: 'cuentas', titulo: 'Cuentas' },
  { valor: 'sesiones', titulo: 'Sesiones' },
  { valor: 'relevamientos', titulo: 'Relevamientos' },
  { valor: 'consultas', titulo: 'Consultas' },
];

/** Agrupa los tipos de evento para poder filtrarlos desde la pantalla. */
export function categoria(tipo: string): Categoria {
  if (tipo === 'SESION_INICIADA') return 'sesiones';
  if (tipo === 'JORNADA_CREADA' || tipo === 'JORNADA_CERRADA' || tipo === 'CATALOGO_IMPORTADO' || tipo === 'RELEVAMIENTO_REGISTRADO' || tipo === 'EXPORTACION_GENERADA' || tipo === 'FOTO_ADJUNTADA' || tipo === 'HALLAZGO_VINCULADO') return 'relevamientos';
  if (tipo === 'AUDITORIA_CONSULTADA') return 'consultas';
  return 'cuentas';
}

type Datos = { accion?: string; rolAnterior?: string; rolNuevo?: string; estadoInicial?: string; cantidad?: number; ubicacion?: string | null; filas?: number; formato?: string; codigoProvisorio?: string | null; numeroInventario?: string; archivo?: string; tipo?: string; alcance?: string; esperados?: number; encontrados?: number; nuevos?: number; modificados?: number } | null;

const ROL: Record<string, string> = { administrador: 'administrador', relevador: 'relevador' };

/** Traduce un evento a una frase para leer. `nombre` resuelve el id de una cuenta a su nombre o correo. */
export function describirEvento(e: EventoAuditoriaDto, nombre: (id: string | null) => string): string {
  const actor = e.actorUsuarioId ? nombre(e.actorUsuarioId) : 'El sistema';
  const afectada = nombre(e.entidadId);
  const datos = (e.datos ?? null) as Datos;

  switch (e.tipo) {
    case 'CUENTA_CREADA':
      return `${actor} creó la cuenta de ${afectada}${datos?.rolNuevo ? ` como ${ROL[datos.rolNuevo] ?? datos.rolNuevo}` : ''}`;
    case 'CATALOGO_IMPORTADO':
      return `${actor} importó el catálogo (${datos?.archivo ?? 'archivo'}): ${datos?.nuevos ?? 0} nuevos, ${datos?.modificados ?? 0} modificados`;
    case 'JORNADA_CREADA':
      return `${actor} abrió una jornada de relevamiento (${datos?.tipo === 'area' ? 'área' : 'ubicación'}: ${datos?.alcance ?? ''})`;
    case 'JORNADA_CERRADA':
      return `${actor} cerró la jornada de ${datos?.alcance ?? ''}: ${datos?.encontrados ?? 0} de ${datos?.esperados ?? 0} encontrados`;
    case 'CLAVE_CAMBIADA':
      return `${actor} cambió su contraseña`;
    case 'CLAVE_RESTABLECIDA':
      return `${actor} restableció la contraseña de ${afectada}`;
    case 'CUENTA_REGISTRADA':
      return `${actor} se registró${datos?.estadoInicial === 'pendiente' ? ' y espera aprobación' : ''}`;
    case 'CUENTA_APROBADA':
      return `${actor} aprobó la cuenta de ${afectada}${datos?.rolNuevo ? ` como ${ROL[datos.rolNuevo] ?? datos.rolNuevo}` : ''}`;
    case 'CUENTA_RECHAZADA':
      return `${actor} rechazó la solicitud de ${afectada}`;
    case 'ESTADO_CUENTA_CAMBIADO': {
      if (datos?.accion === 'suspender') return `${actor} suspendió la cuenta de ${afectada}`;
      if (datos?.accion === 'reactivar') return `${actor} reactivó la cuenta de ${afectada}`;
      if (datos?.accion === 'baja') return `${actor} dio de baja la cuenta de ${afectada}`;
      return `${actor} cambió el estado de la cuenta de ${afectada}`;
    }
    case 'ROL_CAMBIADO':
      return `${actor} cambió el rol de ${afectada}${datos?.rolAnterior && datos.rolNuevo ? ` de ${datos.rolAnterior} a ${datos.rolNuevo}` : ''}`;
    case 'RELEVAMIENTO_REGISTRADO': {
      const n = datos?.cantidad ?? 0;
      return `${actor} registró ${n} relevamiento${n === 1 ? '' : 's'}${datos?.ubicacion ? ` en ${datos.ubicacion}` : ''}`;
    }
    case 'FOTO_ADJUNTADA':
      return `${actor} adjuntó la foto de un hallazgo`;
    case 'HALLAZGO_VINCULADO':
      return `${actor} vinculó un hallazgo${datos?.codigoProvisorio ? ` (${datos.codigoProvisorio})` : ''} con el bien ${datos?.numeroInventario ?? ''}`.trim();
    case 'EXPORTACION_GENERADA':
      return `${actor} exportó ${datos?.filas ?? 0} relevamiento${datos?.filas === 1 ? '' : 's'} a ${(datos?.formato ?? 'archivo').toUpperCase()}`;
    case 'SESION_INICIADA':
      return `${actor} inició sesión`;
    case 'AUDITORIA_CONSULTADA':
      return `${actor} consultó el registro de actividad`;
    default:
      return `${actor}: ${e.tipo}`;
  }
}
