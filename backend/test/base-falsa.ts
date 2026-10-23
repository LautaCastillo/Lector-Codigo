/** Base en memoria: alcanza para ejercitar guards, roles, auditoría y la máquina de estados sin Postgres. */
export interface Fila {
  id: string;
  cuenta: string;
  nombre: string | null;
  rol: 'administrador' | 'relevador';
  estado: 'pendiente' | 'activa' | 'rechazada' | 'suspendida' | 'baja';
  creadoEn: Date;
  aprobadoPor: string | null;
  aprobadoEn: Date | null;
  motivoEstado: string | null;
  ultimoAccesoEn: Date | null;
}

export type Evento = Record<string, unknown> & { tipo: string; actorUsuarioId: string | null };

export const fila = (cuenta: string, estado: Fila['estado'], rol: Fila['rol'] = 'relevador'): Fila => ({
  id: `id-${cuenta}`,
  cuenta,
  nombre: null,
  rol,
  estado,
  creadoEn: new Date('2026-10-01T00:00:00Z'),
  aprobadoPor: null,
  aprobadoEn: null,
  motivoEstado: null,
  ultimoAccesoEn: new Date(),
});

export function baseFalsa(inicial: Fila[] = []) {
  const filas = new Map<string, Fila>(inicial.map((f) => [f.cuenta, f]));
  const eventos: Evento[] = [];
  /** Valores con los que se llamó a set_config, en orden. */
  const actores: unknown[] = [];
  const porId = (id: string) => [...filas.values()].find((f) => f.id === id);

  const base = {
    filas,
    eventos,
    actores,
    usuario: {
      // Devuelven copias, como la base real: un cambio posterior no altera lo ya leído.
      findUnique: async ({ where }: { where: { cuenta?: string; id?: string } }) => {
        const f = where.cuenta ? filas.get(where.cuenta) : porId(where.id ?? '');
        return f ? { ...f } : null;
      },
      create: async ({ data }: { data: Partial<Fila> & { cuenta: string } }) => {
        const nueva = { ...fila(data.cuenta, 'pendiente'), ...data };
        filas.set(nueva.cuenta, nueva);
        return { ...nueva };
      },
      findMany: async ({ where }: { where?: { estado?: Fila['estado'] } }) =>
        [...filas.values()].filter((f) => !where?.estado || f.estado === where.estado).map((f) => ({ ...f })),
      update: async ({ where, data }: { where: { id: string }; data: Partial<Fila> }) => {
        const f = porId(where.id)!;
        Object.assign(f, data);
        return { ...f };
      },
    },
    eventoAuditoria: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        eventos.push({
          id: `ev-${eventos.length + 1}`,
          horaServidor: new Date(),
          resultado: 'ok',
          actorRol: null,
          entidadTipo: null,
          entidadId: null,
          motivo: null,
          datos: null,
          sesionId: null,
          ...data,
        } as unknown as Evento);
      },
      findFirst: async ({ where }: { where: { tipo: string; sesionId: string } }) =>
        eventos.find((e) => e.tipo === where.tipo && e.sesionId === where.sesionId) ?? null,
      findMany: async ({ where, take }: { where?: { tipo?: string; actorUsuarioId?: string }; take?: number }) =>
        eventos
          .filter((e) => (!where?.tipo || e.tipo === where.tipo) && (!where?.actorUsuarioId || e.actorUsuarioId === where.actorUsuarioId))
          .slice()
          .reverse()
          .slice(0, take),
    },
    codigoBien: { findUnique: async () => null },
    bien: { findFirst: async () => null },
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(base),
    $queryRaw: async (_texto: unknown, ...valores: unknown[]) => {
      actores.push(valores[0]);
      return [];
    },
  };
  return base;
}
