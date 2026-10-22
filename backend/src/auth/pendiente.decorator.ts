import { SetMetadata } from '@nestjs/common';

export const PERMITE_PENDIENTE = 'permitePendiente';
/** Deja pasar a cuentas registradas pero todavía no aprobadas por un administrador. */
export const PermitirPendiente = () => SetMetadata(PERMITE_PENDIENTE, true);
