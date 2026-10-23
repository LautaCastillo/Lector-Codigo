import { describe, expect, it, vi } from 'vitest';
import { AuditoriaService } from './auditoria.service.js';

function crear() {
  const consultas: unknown[][] = [];
  const creados: Record<string, unknown>[] = [];
  const tx = {
    $queryRaw: async (_texto: unknown, ...valores: unknown[]) => {
      consultas.push(valores);
      return [];
    },
    eventoAuditoria: { create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => creados.push(data)) },
  };
  const prisma = { ...tx, $transaction: async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx) };
  return { servicio: new AuditoriaService(prisma as never), tx, consultas, creados };
}

const actor = { id: 'u1', cuenta: 'a@b.c', nombre: null, rol: 'administrador' as const, estado: 'activa' as const };

describe('AuditoriaService', () => {
  it('fija el actor antes de ejecutar el cambio y pasa la transacción', async () => {
    const { servicio, consultas } = crear();
    const resultado = await servicio.conActor('u1', async (tx) => {
      expect(consultas).toEqual([['u1']]);
      expect(tx).toBeDefined();
      return 'listo';
    });
    expect(resultado).toBe('listo');
  });

  it('sin actor fija una cadena vacía (los triggers la leen como nulo)', async () => {
    const { servicio, consultas } = crear();
    await servicio.conActor(null, async () => undefined);
    expect(consultas).toEqual([['']]);
  });

  it('registra el evento con el contexto del actor', async () => {
    const { servicio, tx, creados } = crear();
    await servicio.registrar(
      { tipo: 'ROL_CAMBIADO', actor: { ...actor, sesionId: 's1', ip: '10.0.0.1', userAgent: 'ua' }, entidadTipo: 'usuario', entidadId: 'u2', motivo: 'Prueba', datos: { rolNuevo: 'relevador' } },
      tx as never,
    );
    expect(creados[0]).toMatchObject({
      tipo: 'ROL_CAMBIADO',
      actorUsuarioId: 'u1',
      actorRol: 'administrador',
      sesionId: 's1',
      ip: '10.0.0.1',
      userAgent: 'ua',
      entidadId: 'u2',
      resultado: 'ok',
      motivo: 'Prueba',
    });
  });

  it('un evento sin actor queda con actor nulo', async () => {
    const { servicio, tx, creados } = crear();
    await servicio.registrar({ tipo: 'SESION_INICIADA' }, tx as never);
    expect(creados[0]).toMatchObject({ actorUsuarioId: null, actorRol: null, resultado: 'ok' });
  });
});
