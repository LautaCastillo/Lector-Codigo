import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { UsuarioActual } from './relevador.guard.js';

export const Usuario = createParamDecorator((_: unknown, ctx: ExecutionContext): UsuarioActual => {
  return ctx.switchToHttp().getRequest().usuario;
});
