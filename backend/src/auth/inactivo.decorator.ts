import { SetMetadata } from '@nestjs/common';

export const PERMITE_INACTIVO = 'permiteInactivo';
/**
 * Deja pasar a cualquier cuenta autenticada, aunque no esté activa (pendiente, rechazada, suspendida
 * o dada de baja), y sin exigir un rol. Solo para que la app pueda consultar el estado de su cuenta.
 */
export const PermitirInactivo = () => SetMetadata(PERMITE_INACTIVO, true);
