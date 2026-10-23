import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { describe, expect, it } from 'vitest';
import { PERMITE_INACTIVO } from './inactivo.decorator.js';
import { ES_PUBLICO } from './publico.decorator.js';
import { ROLES_REQUERIDOS } from './roles.decorator.js';
import { RolesGuard } from './roles.guard.js';

/** Contexto falso: `meta` simula los decoradores del endpoint. */
function contexto(meta: Record<string, unknown>, rol?: 'administrador' | 'relevador') {
  return {
    getHandler: () => meta,
    getClass: () => ({}),
    switchToHttp: () => ({ getRequest: () => ({ usuario: rol ? { rol } : undefined }) }),
  } as unknown as ExecutionContext;
}

const reflector = {
  getAllAndOverride: (clave: string, [handler]: [Record<string, unknown>]) => handler[clave],
} as unknown as Reflector;
const guard = new RolesGuard(reflector);

describe('RolesGuard', () => {
  it('deniega por defecto un endpoint sin decorador', () => {
    expect(() => guard.canActivate(contexto({}, 'administrador'))).toThrow(ForbiddenException);
  });
  it('deja pasar los endpoints públicos y los de consulta de estado', () => {
    expect(guard.canActivate(contexto({ [ES_PUBLICO]: true }))).toBe(true);
    expect(guard.canActivate(contexto({ [PERMITE_INACTIVO]: true }, 'relevador'))).toBe(true);
  });
  it('exige que el rol esté entre los permitidos', () => {
    const meta = { [ROLES_REQUERIDOS]: ['administrador'] };
    expect(guard.canActivate(contexto(meta, 'administrador'))).toBe(true);
    expect(() => guard.canActivate(contexto(meta, 'relevador'))).toThrow(ForbiddenException);
    expect(() => guard.canActivate(contexto(meta))).toThrow(ForbiddenException);
  });
});
