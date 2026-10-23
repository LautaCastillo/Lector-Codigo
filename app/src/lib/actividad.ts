import type { EventoAuditoriaDto } from '@patrimonio/shared';

export type Categoria = 'cuentas' | 'sesiones' | 'consultas';

export const CATEGORIAS: { valor: Categoria; titulo: string }[] = [
  { valor: 'cuentas', titulo: 'Cuentas' },
  { valor: 'sesiones', titulo: 'Sesiones' },
  { valor: 'consultas', titulo: 'Consultas' },
];

/** Agrupa los tipos de evento para poder filtrarlos desde la pantalla. */
export function categoria(tipo: string): Categoria {
  if (tipo === 'SESION_INICIADA') return 'sesiones';
  if (tipo === 'AUDITORIA_CONSULTADA') return 'consultas';
  return 'cuentas';
}

type Datos = { accion?: string; rolAnterior?: string; rolNuevo?: string; estadoInicial?: string } | null;

const ROL: Record<string, string> = { administrador: 'administrador', relevador: 'relevador' };

/** Traduce un evento a una frase para leer. `nombre` resuelve el id de una cuenta a su nombre o correo. */
export function describirEvento(e: EventoAuditoriaDto, nombre: (id: string | null) => string): string {
  const actor = e.actorUsuarioId ? nombre(e.actorUsuarioId) : 'El sistema';
  const afectada = nombre(e.entidadId);
  const datos = (e.datos ?? null) as Datos;

  switch (e.tipo) {
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
    case 'SESION_INICIADA':
      return `${actor} inició sesión`;
    case 'AUDITORIA_CONSULTADA':
      return `${actor} consultó el registro de actividad`;
    default:
      return `${actor}: ${e.tipo}`;
  }
}
