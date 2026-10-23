import { SetMetadata } from '@nestjs/common';
import type { Rol } from '@patrimonio/shared';

export const ROLES_REQUERIDOS = 'rolesRequeridos';
/** Roles que pueden usar el endpoint. Un endpoint sin @Roles, @Publico ni @PermitirInactivo se deniega. */
export const Roles = (...roles: Rol[]) => SetMetadata(ROLES_REQUERIDOS, roles);
