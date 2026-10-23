import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { baseFalsa, fila } from './base-falsa.js';

describe('Cuentas, estados, roles y auditoría (e2e)', () => {
  const base = baseFalsa([
    fila('admin', 'activa', 'administrador'),
    fila('rel', 'activa'),
    fila('pend', 'pendiente'),
    fila('susp', 'suspendida'),
  ]);
  let http: Parameters<typeof request>[0];
  let app: INestApplication;

  beforeAll(async () => {
    process.env.AUTH_PROVISORIA = 'true';
    const mod = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(base)
      .compile();
    app = mod.createNestApplication();
    await app.init();
    http = app.getHttpServer();
  });
  afterAll(async () => {
    await app.close();
    delete process.env.AUTH_PROVISORIA;
  });

  const como = (cuenta: string) => ({ 'x-relevador': cuenta });
  const eventos = (tipo: string) => base.eventos.filter((e) => e.tipo === tipo);

  it('una cuenta no activa solo puede consultar su estado', async () => {
    await request(http).get('/me').set(como('pend')).expect(200).expect((r) => {
      expect(r.body).toMatchObject({ estado: 'pendiente', activo: false });
    });
    await request(http).get('/configuracion/simbologias').set(como('pend')).expect(403);
    await request(http).get('/configuracion/simbologias').set(como('susp')).expect(403);
    await request(http).patch('/me').set(como('pend')).send({ nombre: 'Ana Pérez' }).expect(403);
  });

  it('un relevador no accede a la administración ni al registro de auditoría', async () => {
    await request(http).get('/admin/usuarios').set(como('rel')).expect(403);
    await request(http).post('/admin/usuarios/id-pend/aprobar').set(como('rel')).expect(403);
    await request(http).get('/admin/auditoria').set(como('rel')).expect(403);
    await request(http).get('/admin/usuarios').expect(401);
  });

  it('el administrador lista las solicitudes pendientes', async () => {
    const r = await request(http).get('/admin/usuarios?estado=pendiente').set(como('admin')).expect(200);
    expect(r.body.map((c: { cuenta: string }) => c.cuenta)).toEqual(['pend']);
    await request(http).get('/admin/usuarios?estado=foo').set(como('admin')).expect(400);
  });

  it('aprobar activa la cuenta, registra quién y deja un evento de auditoría', async () => {
    await request(http)
      .post('/admin/usuarios/id-pend/aprobar')
      .set(como('admin'))
      .send({ rol: 'relevador' })
      .expect(201)
      .expect((r) => expect(r.body).toMatchObject({ estado: 'activa', rol: 'relevador' }));
    expect(base.filas.get('pend')).toMatchObject({ aprobadoPor: 'id-admin' });
    await request(http).get('/configuracion/simbologias').set(como('pend')).expect(200);

    expect(eventos('CUENTA_APROBADA')).toHaveLength(1);
    expect(eventos('CUENTA_APROBADA')[0]).toMatchObject({
      actorUsuarioId: 'id-admin',
      actorRol: 'administrador',
      entidadTipo: 'usuario',
      entidadId: 'id-pend',
      datos: { accion: 'aprobar', estadoAnterior: 'pendiente', estadoNuevo: 'activa' },
    });
  });

  it('el actor llega a la base antes de cada cambio, para que los triggers lo conozcan', () => {
    expect(base.actores).toContain('id-admin');
  });

  it('exige motivo para suspender y respeta la máquina de estados', async () => {
    await request(http).post('/admin/usuarios/id-rel/suspender').set(como('admin')).send({}).expect(400);
    expect(eventos('ESTADO_CUENTA_CAMBIADO')).toHaveLength(0);
    await request(http)
      .post('/admin/usuarios/id-rel/suspender')
      .set(como('admin'))
      .send({ motivo: 'Teléfono perdido' })
      .expect(201)
      .expect((r) => expect(r.body).toMatchObject({ estado: 'suspendida', motivoEstado: 'Teléfono perdido' }));
    expect(eventos('ESTADO_CUENTA_CAMBIADO')[0]).toMatchObject({
      motivo: 'Teléfono perdido',
      entidadId: 'id-rel',
      datos: { estadoAnterior: 'activa', estadoNuevo: 'suspendida' },
    });
    await request(http).get('/configuracion/simbologias').set(como('rel')).expect(403);
    await request(http).post('/admin/usuarios/id-rel/aprobar').set(como('admin')).expect(409);
    await request(http).post('/admin/usuarios/id-rel/reactivar').set(como('admin')).expect(201);
    await request(http).get('/configuracion/simbologias').set(como('rel')).expect(200);
    expect(eventos('ESTADO_CUENTA_CAMBIADO')).toHaveLength(2);
  });

  it('un cambio rechazado no deja evento', async () => {
    const antes = base.eventos.length;
    await request(http).post('/admin/usuarios/id-rel/aprobar').set(como('admin')).expect(409);
    await request(http).post('/admin/usuarios/no-existe/baja').set(como('admin')).send({ motivo: 'Prueba' }).expect(404);
    expect(base.eventos).toHaveLength(antes);
  });

  it('el administrador no puede cambiar su propia cuenta ni usar acciones inexistentes', async () => {
    await request(http).post('/admin/usuarios/id-admin/suspender').set(como('admin')).send({ motivo: 'Prueba propia' }).expect(403);
    await request(http).patch('/admin/usuarios/id-admin/rol').set(como('admin')).send({ rol: 'relevador', motivo: 'Prueba' }).expect(403);
    await request(http).post('/admin/usuarios/id-rel/borrar').set(como('admin')).expect(404);
  });

  it('cambia el rol con motivo, valida el valor y lo registra', async () => {
    await request(http).patch('/admin/usuarios/id-rel/rol').set(como('admin')).send({ rol: 'superusuario', motivo: 'Prueba' }).expect(400);
    await request(http).patch('/admin/usuarios/id-rel/rol').set(como('admin')).send({ rol: 'administrador' }).expect(400);
    await request(http)
      .patch('/admin/usuarios/id-rel/rol')
      .set(como('admin'))
      .send({ rol: 'administrador', motivo: 'Nuevo responsable' })
      .expect(200)
      .expect((r) => expect(r.body.rol).toBe('administrador'));
    expect(eventos('ROL_CAMBIADO')[0]).toMatchObject({
      motivo: 'Nuevo responsable',
      datos: { rolAnterior: 'relevador', rolNuevo: 'administrador' },
    });
    await request(http).patch('/admin/usuarios/id-rel/rol').set(como('admin')).send({ rol: 'relevador', motivo: 'Vuelve a su rol' }).expect(200);
  });

  it('registra el alta de una cuenta nueva', async () => {
    await request(http).get('/me').set(como('nueva')).expect(200);
    expect(eventos('CUENTA_REGISTRADA').at(-1)).toMatchObject({
      actorUsuarioId: 'id-nueva',
      entidadId: 'id-nueva',
      datos: { estadoInicial: 'activa' },
    });
  });

  it('el administrador consulta el registro y la consulta queda registrada', async () => {
    const r = await request(http).get('/admin/auditoria?limite=100').set(como('admin')).expect(200);
    expect(r.body.length).toBeGreaterThan(3);
    expect(r.body[0]).toHaveProperty('tipo');
    expect(r.body[0]).not.toHaveProperty('ip');
    expect(eventos('AUDITORIA_CONSULTADA')).toHaveLength(1);

    const filtrado = await request(http).get('/admin/auditoria?tipo=ROL_CAMBIADO').set(como('admin')).expect(200);
    expect(filtrado.body.every((e: { tipo: string }) => e.tipo === 'ROL_CAMBIADO')).toBe(true);
    await request(http).get('/admin/auditoria?tipo=INVENTADO').set(como('admin')).expect(400);
    await request(http).get('/admin/auditoria?desde=ayer').set(como('admin')).expect(400);
    await request(http).get('/admin/auditoria?limite=0').set(como('admin')).expect(400);
  });

  it('cada usuario ve solo su propia actividad', async () => {
    const r = await request(http).get('/me/actividad').set(como('admin')).expect(200);
    expect(r.body.length).toBeGreaterThan(0);
    expect(r.body.every((e: { actorUsuarioId: string }) => e.actorUsuarioId === 'id-admin')).toBe(true);
    const ajena = await request(http).get('/me/actividad').set(como('nueva')).expect(200);
    expect(ajena.body.every((e: { actorUsuarioId: string }) => e.actorUsuarioId === 'id-nueva')).toBe(true);
  });
});
