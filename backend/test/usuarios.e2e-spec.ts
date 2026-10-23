import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

interface Fila {
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

const fila = (cuenta: string, estado: Fila['estado'], rol: Fila['rol'] = 'relevador'): Fila => ({
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

/** Base en memoria: alcanza para ejercitar guards, roles y la máquina de estados sin Postgres. */
function baseFalsa() {
  const filas = new Map<string, Fila>(
    [
      fila('admin', 'activa', 'administrador'),
      fila('rel', 'activa'),
      fila('pend', 'pendiente'),
      fila('susp', 'suspendida'),
    ].map((f) => [f.cuenta, f]),
  );
  const porId = (id: string) => [...filas.values()].find((f) => f.id === id);
  return {
    filas,
    usuario: {
      upsert: async ({ where, create }: { where: { cuenta: string }; create: Partial<Fila> }) => {
        const existente = filas.get(where.cuenta);
        if (existente) return existente;
        const nueva = { ...fila(where.cuenta, 'pendiente'), ...create };
        filas.set(nueva.cuenta, nueva);
        return nueva;
      },
      findMany: async ({ where }: { where?: { estado?: Fila['estado'] } }) =>
        [...filas.values()].filter((f) => !where?.estado || f.estado === where.estado),
      findUnique: async ({ where }: { where: { id: string } }) => porId(where.id) ?? null,
      update: async ({ where, data }: { where: { id: string }; data: Partial<Fila> }) => {
        const f = porId(where.id)!;
        Object.assign(f, data);
        return f;
      },
    },
  };
}

describe('Cuentas, estados y roles (e2e)', () => {
  const base = baseFalsa();
  let http: Parameters<typeof request>[0];
  let app: Awaited<ReturnType<typeof crearApp>>;

  async function crearApp() {
    process.env.AUTH_PROVISORIA = 'true';
    const mod = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(base)
      .compile();
    const nueva = mod.createNestApplication();
    await nueva.init();
    return nueva;
  }

  beforeAll(async () => {
    app = await crearApp();
    http = app.getHttpServer();
  });
  afterAll(async () => {
    await app.close();
    delete process.env.AUTH_PROVISORIA;
  });

  const como = (cuenta: string) => ({ 'x-relevador': cuenta });

  it('una cuenta no activa solo puede consultar su estado', async () => {
    await request(http).get('/me').set(como('pend')).expect(200).expect((r) => {
      expect(r.body).toMatchObject({ estado: 'pendiente', activo: false });
    });
    await request(http).get('/configuracion/simbologias').set(como('pend')).expect(403);
    await request(http).get('/configuracion/simbologias').set(como('susp')).expect(403);
    await request(http).patch('/me').set(como('pend')).send({ nombre: 'Ana Pérez' }).expect(403);
  });

  it('un relevador no accede a la administración', async () => {
    await request(http).get('/admin/usuarios').set(como('rel')).expect(403);
    await request(http).post('/admin/usuarios/id-pend/aprobar').set(como('rel')).expect(403);
    await request(http).get('/admin/usuarios').expect(401);
  });

  it('el administrador lista las solicitudes pendientes', async () => {
    const r = await request(http).get('/admin/usuarios?estado=pendiente').set(como('admin')).expect(200);
    expect(r.body.map((c: { cuenta: string }) => c.cuenta)).toEqual(['pend']);
    await request(http).get('/admin/usuarios?estado=foo').set(como('admin')).expect(400);
  });

  it('aprobar activa la cuenta, registra quién y permite usar la API', async () => {
    await request(http)
      .post('/admin/usuarios/id-pend/aprobar')
      .set(como('admin'))
      .send({ rol: 'relevador' })
      .expect(201)
      .expect((r) => expect(r.body).toMatchObject({ estado: 'activa', rol: 'relevador' }));
    expect(base.filas.get('pend')).toMatchObject({ aprobadoPor: 'id-admin' });
    await request(http).get('/configuracion/simbologias').set(como('pend')).expect(200);
  });

  it('exige motivo para suspender y respeta la máquina de estados', async () => {
    await request(http).post('/admin/usuarios/id-rel/suspender').set(como('admin')).send({}).expect(400);
    await request(http)
      .post('/admin/usuarios/id-rel/suspender')
      .set(como('admin'))
      .send({ motivo: 'Teléfono perdido' })
      .expect(201)
      .expect((r) => expect(r.body).toMatchObject({ estado: 'suspendida', motivoEstado: 'Teléfono perdido' }));
    await request(http).get('/configuracion/simbologias').set(como('rel')).expect(403);
    await request(http).post('/admin/usuarios/id-rel/aprobar').set(como('admin')).expect(409);
    await request(http).post('/admin/usuarios/id-rel/reactivar').set(como('admin')).expect(201);
    await request(http).get('/configuracion/simbologias').set(como('rel')).expect(200);
  });

  it('el administrador no puede cambiar su propia cuenta ni usar acciones inexistentes', async () => {
    await request(http)
      .post('/admin/usuarios/id-admin/suspender')
      .set(como('admin'))
      .send({ motivo: 'Prueba propia' })
      .expect(403);
    await request(http).patch('/admin/usuarios/id-admin/rol').set(como('admin')).send({ rol: 'relevador', motivo: 'Prueba' }).expect(403);
    await request(http).post('/admin/usuarios/id-rel/borrar').set(como('admin')).expect(404);
    await request(http).post('/admin/usuarios/no-existe/baja').set(como('admin')).send({ motivo: 'Prueba' }).expect(404);
  });

  it('cambia el rol con motivo y valida el valor', async () => {
    await request(http).patch('/admin/usuarios/id-rel/rol').set(como('admin')).send({ rol: 'superusuario', motivo: 'Prueba' }).expect(400);
    await request(http).patch('/admin/usuarios/id-rel/rol').set(como('admin')).send({ rol: 'administrador' }).expect(400);
    await request(http)
      .patch('/admin/usuarios/id-rel/rol')
      .set(como('admin'))
      .send({ rol: 'administrador', motivo: 'Nuevo responsable' })
      .expect(200)
      .expect((r) => expect(r.body.rol).toBe('administrador'));
  });
});
