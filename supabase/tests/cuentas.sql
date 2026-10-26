-- Pruebas de las funciones de administración de cuentas (fase 2 del plan v3).
-- Igual que politicas.sql: se ejecuta completo, simula a cada persona con los claims del JWT y termina con
-- ROLLBACK. La última consulta lista cada prueba con ok = true o false; todas deben dar true.

BEGIN;

CREATE TEMP TABLE resultado (prueba text, ok boolean, detalle text);
GRANT ALL ON TABLE resultado TO PUBLIC;
CREATE FUNCTION pg_temp.intentar(p text) RETURNS text LANGUAGE plpgsql AS $f$
BEGIN EXECUTE p; RETURN 'ok'; EXCEPTION WHEN OTHERS THEN RETURN SQLSTATE; END $f$;
CREATE FUNCTION pg_temp.chk(p text, esperado text, obtenido text) RETURNS void LANGUAGE sql AS $f$
INSERT INTO pg_temp.resultado VALUES (p, esperado = obtenido, 'esperado ' || esperado || ', obtenido ' || coalesce(obtenido, 'NULL')) $f$;
GRANT EXECUTE ON FUNCTION pg_temp.intentar(text), pg_temp.chk(text, text, text) TO PUBLIC;

-- Datos de prueba (como propietario) -----------------------------------------------------------------
INSERT INTO auth.users (id, email) VALUES
  ('bbbbbbbb-0000-0000-0000-00000000000a', 'nueva@prueba'),
  ('bbbbbbbb-0000-0000-0000-000000000003', 'r2@prueba');
INSERT INTO auth.sessions (id, user_id) VALUES ('cccccccc-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000003');
INSERT INTO public."usuario" ("id", "cuenta", "nombre", "rol", "estado", "authId", "debeCambiarClave") VALUES
  ('T-ADM', 'adm@prueba', 'Admin', 'administrador', 'activa', 'bbbbbbbb-0000-0000-0000-000000000001', false),
  ('T-R1',  'r1@prueba',  'Relevador 1', 'relevador', 'activa', 'bbbbbbbb-0000-0000-0000-000000000002', false),
  ('T-R2',  'r2@prueba',  'Relevador 2', 'relevador', 'activa', 'bbbbbbbb-0000-0000-0000-000000000003', false),
  ('T-R3',  'r3@prueba',  'Relevador 3', 'relevador', 'activa', 'bbbbbbbb-0000-0000-0000-000000000004', true),
  ('T-SU',  'su@prueba',  'Suspendida', 'relevador', 'suspendida', 'bbbbbbbb-0000-0000-0000-000000000005', true);

-- anon ------------------------------------------------------------------------------------------------
SELECT set_config('request.jwt.claims', '', true);
SET LOCAL ROLE anon;
SELECT pg_temp.chk('anon no llama a alta_cuenta', '42501', pg_temp.intentar($q$SELECT public.alta_cuenta(gen_random_uuid(), 'x@prueba', 'Persona', 'relevador')$q$));
SELECT pg_temp.chk('anon no llama a cambiar_estado_cuenta', '42501', pg_temp.intentar($q$SELECT public.cambiar_estado_cuenta('T-R2', 'suspendida', 'motivo')$q$));
RESET ROLE;

-- relevador: nada de administración ----------------------------------------------------------------------
SELECT set_config('request.jwt.claims', '{"sub":"bbbbbbbb-0000-0000-0000-000000000002","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.chk('relevador no crea cuentas', '42501', pg_temp.intentar($q$SELECT public.alta_cuenta('bbbbbbbb-0000-0000-0000-00000000000a', 'nueva@prueba', 'Persona Nueva', 'relevador')$q$));
SELECT pg_temp.chk('relevador no cambia estados', '42501', pg_temp.intentar($q$SELECT public.cambiar_estado_cuenta('T-R2', 'suspendida', 'motivo largo')$q$));
SELECT pg_temp.chk('relevador no cambia roles', '42501', pg_temp.intentar($q$SELECT public.cambiar_rol_cuenta('T-R2', 'administrador', 'motivo largo')$q$));
SELECT pg_temp.chk('relevador no restablece contraseñas', '42501', pg_temp.intentar($q$SELECT public.marcar_clave_temporal('T-R2')$q$));
RESET ROLE;

-- administrador ----------------------------------------------------------------------------------------
SELECT set_config('request.jwt.claims', '{"sub":"bbbbbbbb-0000-0000-0000-000000000001","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.chk('alta: usuario de autenticación inexistente', '22023', pg_temp.intentar($q$SELECT public.alta_cuenta(gen_random_uuid(), 'otra@prueba', 'Persona Nueva', 'relevador')$q$));
SELECT pg_temp.chk('alta: nombre corto', '22023', pg_temp.intentar($q$SELECT public.alta_cuenta('bbbbbbbb-0000-0000-0000-00000000000a', 'nueva@prueba', 'ab', 'relevador')$q$));
SELECT pg_temp.chk('alta: correo que no coincide con el usuario de autenticación', '22023', pg_temp.intentar($q$SELECT public.alta_cuenta('bbbbbbbb-0000-0000-0000-00000000000a', 'otra@prueba', 'Persona Nueva', 'relevador')$q$));
SELECT public.alta_cuenta('bbbbbbbb-0000-0000-0000-00000000000a', 'Nueva@Prueba', 'Persona Nueva', 'relevador');
RESET ROLE;

SELECT pg_temp.chk('alta: la cuenta queda activa y con clave por cambiar', 'activa/true/T-ADM/relevador',
  (SELECT "estado"::text || '/' || "debeCambiarClave"::text || '/' || "aprobadoPor" || '/' || "rol"::text
   FROM public."usuario" WHERE "cuenta" = 'nueva@prueba'));
SELECT pg_temp.chk('alta: queda vinculada con Supabase Auth', 'bbbbbbbb-0000-0000-0000-00000000000a',
  (SELECT "authId"::text FROM public."usuario" WHERE "cuenta" = 'nueva@prueba'));
SELECT pg_temp.chk('alta: evento CUENTA_CREADA con el administrador como actor', 'T-ADM/administrador',
  (SELECT "actorUsuarioId" || '/' || "actorRol"::text FROM public."evento_auditoria" WHERE "tipo" = 'CUENTA_CREADA'));
SELECT pg_temp.chk('alta: cambio_fila con el administrador como actor', 'T-ADM',
  (SELECT "actorUsuarioId" FROM public."cambio_fila" WHERE "tabla" = 'usuario' AND "operacion" = 'INSERT' AND "despues" ->> 'cuenta' = 'nueva@prueba'));

SET LOCAL ROLE authenticated;
SELECT pg_temp.chk('alta: cuenta repetida', '23505', pg_temp.intentar($q$SELECT public.alta_cuenta('bbbbbbbb-0000-0000-0000-00000000000a', 'nueva@prueba', 'Persona Nueva', 'relevador')$q$));
SELECT pg_temp.chk('estado: suspender exige motivo', '22023', pg_temp.intentar($q$SELECT public.cambiar_estado_cuenta('T-R2', 'suspendida', NULL)$q$));
SELECT pg_temp.chk('estado: motivo demasiado corto', '22023', pg_temp.intentar($q$SELECT public.cambiar_estado_cuenta('T-R2', 'suspendida', 'ab')$q$));
SELECT pg_temp.chk('estado: no se vuelve a pendiente', '22023', pg_temp.intentar($q$SELECT public.cambiar_estado_cuenta('T-R2', 'pendiente', 'motivo largo')$q$));
SELECT pg_temp.chk('estado: cuenta inexistente', 'P0002', pg_temp.intentar($q$SELECT public.cambiar_estado_cuenta('no-existe', 'suspendida', 'motivo largo')$q$));
SELECT pg_temp.chk('estado: no cambia la propia cuenta', '42501', pg_temp.intentar($q$SELECT public.cambiar_estado_cuenta('T-ADM', 'suspendida', 'motivo largo')$q$));
SELECT pg_temp.chk('rol: no cambia el propio rol', '42501', pg_temp.intentar($q$SELECT public.cambiar_rol_cuenta('T-ADM', 'relevador', 'motivo largo')$q$));
SELECT pg_temp.chk('estado: suspende con motivo', 'ok', pg_temp.intentar($q$SELECT public.cambiar_estado_cuenta('T-R2', 'suspendida', 'Se perdió el teléfono')$q$));
SELECT pg_temp.chk('estado: ya está suspendida', '22023', pg_temp.intentar($q$SELECT public.cambiar_estado_cuenta('T-R2', 'suspendida', 'motivo largo')$q$));
RESET ROLE;
SELECT pg_temp.chk('estado: suspender cierra las sesiones abiertas', '0', (SELECT count(*)::text FROM auth.sessions WHERE user_id = 'bbbbbbbb-0000-0000-0000-000000000003'));
SELECT pg_temp.chk('estado: quedó suspendida con el motivo', 'suspendida/Se perdió el teléfono',
  (SELECT "estado"::text || '/' || "motivoEstado" FROM public."usuario" WHERE "id" = 'T-R2'));
SELECT pg_temp.chk('estado: evento con acción y estados', 'suspender/activa/suspendida',
  (SELECT "datos" ->> 'accion' || '/' || ("datos" ->> 'estadoAnterior') || '/' || ("datos" ->> 'estadoNuevo')
   FROM public."evento_auditoria" WHERE "tipo" = 'ESTADO_CUENTA_CAMBIADO' AND "entidadId" = 'T-R2'));

SET LOCAL ROLE authenticated;
SELECT pg_temp.chk('estado: reactiva sin motivo', 'ok', pg_temp.intentar($q$SELECT public.cambiar_estado_cuenta('T-R2', 'activa', NULL)$q$));
SELECT pg_temp.chk('estado: da de baja con motivo', 'ok', pg_temp.intentar($q$SELECT public.cambiar_estado_cuenta('T-R2', 'baja', 'Dejó de trabajar en el área')$q$));
SELECT pg_temp.chk('estado: una baja no se reactiva', '22023', pg_temp.intentar($q$SELECT public.cambiar_estado_cuenta('T-R2', 'activa', NULL)$q$));
SELECT pg_temp.chk('rol: una baja no cambia de rol', '22023', pg_temp.intentar($q$SELECT public.cambiar_rol_cuenta('T-R2', 'administrador', 'motivo largo')$q$));
SELECT pg_temp.chk('rol: exige motivo', '22023', pg_temp.intentar($q$SELECT public.cambiar_rol_cuenta('T-R1', 'administrador', '')$q$));
SELECT pg_temp.chk('rol: igual al actual', '22023', pg_temp.intentar($q$SELECT public.cambiar_rol_cuenta('T-R1', 'relevador', 'motivo largo')$q$));
SELECT pg_temp.chk('rol: asciende a administrador', 'ok', pg_temp.intentar($q$SELECT public.cambiar_rol_cuenta('T-R1', 'administrador', 'Nuevo responsable')$q$));
SELECT pg_temp.chk('clave: restablece la de otra cuenta', 'ok', pg_temp.intentar($q$SELECT public.marcar_clave_temporal('T-R3')$q$));
SELECT pg_temp.chk('clave: no restablece la propia', '42501', pg_temp.intentar($q$SELECT public.marcar_clave_temporal('T-ADM')$q$));
SELECT pg_temp.chk('clave: cuenta inexistente', 'P0002', pg_temp.intentar($q$SELECT public.marcar_clave_temporal('no-existe')$q$));
SELECT pg_temp.chk('clave: una baja no se restablece', 'P0002', pg_temp.intentar($q$SELECT public.marcar_clave_temporal('T-R2')$q$));
RESET ROLE;
SELECT pg_temp.chk('estado: la cuenta quedó en baja', 'baja', (SELECT "estado"::text FROM public."usuario" WHERE "id" = 'T-R2'));
SELECT pg_temp.chk('rol: quedó el nuevo rol y el evento lo registra', 'administrador/relevador/administrador',
  (SELECT u."rol"::text || '/' || (e."datos" ->> 'rolAnterior') || '/' || (e."datos" ->> 'rolNuevo')
   FROM public."usuario" u JOIN public."evento_auditoria" e ON e."entidadId" = u."id" AND e."tipo" = 'ROL_CAMBIADO' WHERE u."id" = 'T-R1'));
SELECT pg_temp.chk('clave: la cuenta quedó con clave por cambiar y hay evento', 'true/1',
  (SELECT u."debeCambiarClave"::text || '/' || (SELECT count(*) FROM public."evento_auditoria" WHERE "tipo" = 'CLAVE_RESTABLECIDA' AND "entidadId" = 'T-R3')::text
   FROM public."usuario" u WHERE u."id" = 'T-R3'));

-- cambio de contraseña por la propia persona ----------------------------------------------------------------
SELECT set_config('request.jwt.claims', '{"sub":"bbbbbbbb-0000-0000-0000-000000000004","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.chk('clave: la persona confirma su cambio', 'ok', pg_temp.intentar($q$SELECT public.marcar_clave_cambiada()$q$));
RESET ROLE;
SELECT pg_temp.chk('clave: se limpia la marca y queda el evento', 'false/T-R3',
  (SELECT u."debeCambiarClave"::text || '/' || e."actorUsuarioId"
   FROM public."usuario" u JOIN public."evento_auditoria" e ON e."tipo" = 'CLAVE_CAMBIADA' AND e."entidadId" = u."id" WHERE u."id" = 'T-R3'));

SELECT set_config('request.jwt.claims', '{"sub":"bbbbbbbb-0000-0000-0000-000000000005","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.chk('clave: una cuenta suspendida no puede', '42501', pg_temp.intentar($q$SELECT public.marcar_clave_cambiada()$q$));
RESET ROLE;

SELECT prueba, ok, detalle FROM pg_temp.resultado ORDER BY ctid;
ROLLBACK;
