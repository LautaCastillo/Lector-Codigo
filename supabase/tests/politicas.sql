-- Pruebas de privilegios y políticas RLS por rol (fase 1 del plan v3).
-- Se ejecuta completo contra la base y termina con ROLLBACK: no deja datos ni registros de auditoría.
-- La última consulta lista cada prueba con ok = true o false; todas deben dar true.
-- Simula a cada persona con los claims del JWT (auth.uid()) y `SET LOCAL ROLE`, como hace PostgREST.

BEGIN;

CREATE TEMP TABLE resultado (prueba text, ok boolean, detalle text);
GRANT ALL ON TABLE resultado TO PUBLIC;
CREATE TEMP TABLE ctx AS SELECT (SELECT "id" FROM public."bien" ORDER BY "numeroInventario" LIMIT 1) AS bien_id;
GRANT SELECT ON TABLE ctx TO PUBLIC;

CREATE FUNCTION pg_temp.intentar(p text) RETURNS text LANGUAGE plpgsql AS $f$
BEGIN EXECUTE p; RETURN 'ok'; EXCEPTION WHEN OTHERS THEN RETURN SQLSTATE; END $f$;
CREATE FUNCTION pg_temp.afectadas(p text) RETURNS text LANGUAGE plpgsql AS $f$
DECLARE n int;
BEGIN EXECUTE p; GET DIAGNOSTICS n = ROW_COUNT; RETURN n::text; EXCEPTION WHEN OTHERS THEN RETURN SQLSTATE; END $f$;
CREATE FUNCTION pg_temp.contar(p text) RETURNS text LANGUAGE plpgsql AS $f$
DECLARE n int;
BEGIN EXECUTE 'SELECT count(*) FROM (' || p || ') t' INTO n; RETURN n::text; EXCEPTION WHEN OTHERS THEN RETURN SQLSTATE; END $f$;
CREATE FUNCTION pg_temp.chk(p text, esperado text, obtenido text) RETURNS void LANGUAGE sql AS $f$
INSERT INTO pg_temp.resultado VALUES (p, esperado = obtenido, 'esperado ' || esperado || ', obtenido ' || obtenido) $f$;
GRANT EXECUTE ON FUNCTION pg_temp.intentar(text), pg_temp.afectadas(text), pg_temp.contar(text), pg_temp.chk(text, text, text) TO PUBLIC;

-- Datos de prueba (como propietario) -----------------------------------------------------------------
INSERT INTO public."usuario" ("id", "cuenta", "nombre", "rol", "estado", "authId") VALUES
  ('T-ADM', 'adm@prueba', 'Admin', 'administrador', 'activa', 'aaaaaaaa-0000-0000-0000-000000000001'),
  ('T-R1',  'r1@prueba',  'Relevador 1', 'relevador', 'activa', 'aaaaaaaa-0000-0000-0000-000000000002'),
  ('T-R2',  'r2@prueba',  'Relevador 2', 'relevador', 'activa', 'aaaaaaaa-0000-0000-0000-000000000003'),
  ('T-SU',  'su@prueba',  'Suspendida', 'relevador', 'suspendida', 'aaaaaaaa-0000-0000-0000-000000000004');
INSERT INTO public."relevamiento" ("idCliente", "usuarioId", "resultado", "relevadoEnDispositivo")
  VALUES ('11111111-1111-4111-8111-111111111111', 'T-R2', 'no_encontrado', now());
INSERT INTO public."evento_auditoria" ("tipo", "actorUsuarioId") VALUES ('PRUEBA_R2', 'T-R2'), ('PRUEBA_ADM', 'T-ADM');

-- anon ------------------------------------------------------------------------------------------------
SELECT set_config('request.jwt.claims', '', true);
SET LOCAL ROLE anon;
SELECT pg_temp.chk('anon no lee bien', '42501', pg_temp.intentar($q$SELECT 1 FROM public."bien" LIMIT 1$q$));
SELECT pg_temp.chk('anon no lee usuario', '42501', pg_temp.intentar($q$SELECT 1 FROM public."usuario" LIMIT 1$q$));
SELECT pg_temp.chk('anon no usa funciones privadas', '42501', pg_temp.intentar($q$SELECT privado.es_activa()$q$));
RESET ROLE;

-- autenticado sin cuenta en la aplicación -----------------------------------------------------------
SELECT set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000005","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.chk('sin cuenta: no ve bienes', '0', pg_temp.contar($q$SELECT 1 FROM public."bien"$q$));
SELECT pg_temp.chk('sin cuenta: no ve usuarios', '0', pg_temp.contar($q$SELECT 1 FROM public."usuario"$q$));
SELECT pg_temp.chk('sin cuenta: no inserta relevamientos', '42501', pg_temp.intentar(
  $q$INSERT INTO public."relevamiento" ("idCliente","usuarioId","resultado","relevadoEnDispositivo")
     VALUES ('22222222-2222-4222-8222-222222222222','T-R1','no_encontrado',now())$q$));
RESET ROLE;

-- cuenta suspendida --------------------------------------------------------------------------------
SELECT set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000004","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.chk('suspendida: no ve bienes', '0', pg_temp.contar($q$SELECT 1 FROM public."bien"$q$));
SELECT pg_temp.chk('suspendida: no inserta relevamientos', '42501', pg_temp.intentar(
  $q$INSERT INTO public."relevamiento" ("idCliente","usuarioId","resultado","relevadoEnDispositivo")
     VALUES ('33333333-3333-4333-8333-333333333333','T-SU','no_encontrado',now())$q$));
SELECT pg_temp.chk('suspendida: no edita su nombre', '0', pg_temp.afectadas($q$UPDATE public."usuario" SET "nombre"='x' WHERE "id"='T-SU'$q$));
RESET ROLE;

-- relevador 1 ----------------------------------------------------------------------------------------
SELECT set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000002","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.chk('relevador: ve el catálogo', 'true', (SELECT (count(*) > 0)::text FROM public."bien"));
SELECT pg_temp.chk('relevador: ve solo su usuario', '1', pg_temp.contar($q$SELECT 1 FROM public."usuario"$q$));
SELECT pg_temp.chk('relevador: inserta un encontrado propio', 'ok', pg_temp.intentar(
  $q$INSERT INTO public."relevamiento" ("idCliente","usuarioId","bienId","resultado","relevadoEnDispositivo","sincronizadoEn")
     VALUES ('44444444-4444-4444-8444-444444444444','T-R1',(SELECT bien_id FROM pg_temp.ctx),'encontrado',now(),'2000-01-01')$q$));
SELECT pg_temp.chk('relevador: no inserta a nombre de otro', '42501', pg_temp.intentar(
  $q$INSERT INTO public."relevamiento" ("idCliente","usuarioId","resultado","relevadoEnDispositivo")
     VALUES ('55555555-5555-4555-8555-555555555555','T-R2','no_encontrado',now())$q$));
SELECT pg_temp.chk('relevador: encontrado sin bien se rechaza', '23514', pg_temp.intentar(
  $q$INSERT INTO public."relevamiento" ("idCliente","usuarioId","resultado","relevadoEnDispositivo")
     VALUES ('66666666-6666-4666-8666-666666666666','T-R1','encontrado',now())$q$));
SELECT pg_temp.chk('relevador: hallazgo con descripción corta se rechaza', '23514', pg_temp.intentar(
  $q$INSERT INTO public."relevamiento" ("idCliente","usuarioId","resultado","clase","descripcion","relevadoEnDispositivo")
     VALUES ('77777777-7777-4777-8777-777777777777','T-R1','hallazgo','nuevo','ab',now())$q$));
SELECT pg_temp.chk('relevador: idCliente inválido se rechaza', '23514', pg_temp.intentar(
  $q$INSERT INTO public."relevamiento" ("idCliente","usuarioId","resultado","relevadoEnDispositivo")
     VALUES ('no-es-un-uuid','T-R1','no_encontrado',now())$q$));
SELECT pg_temp.chk('relevador: observaciones demasiado largas se rechazan', '23514', pg_temp.intentar(
  $q$INSERT INTO public."relevamiento" ("idCliente","usuarioId","resultado","observaciones","relevadoEnDispositivo")
     VALUES ('88888888-8888-4888-8888-888888888888','T-R1','no_encontrado',repeat('x',501),now())$q$));
SELECT pg_temp.chk('relevador: inserta un hallazgo válido', 'ok', pg_temp.intentar(
  $q$INSERT INTO public."relevamiento" ("idCliente","usuarioId","resultado","clase","descripcion","codigoProvisorio","relevadoEnDispositivo")
     VALUES ('99999999-9999-4999-8999-999999999999','T-R1','hallazgo','nuevo','Silla de oficina','H-FALSO',now())$q$));
SELECT pg_temp.chk('relevador: el código provisorio lo fija la base', 'H-99999999',
  (SELECT "codigoProvisorio" FROM public."relevamiento" WHERE "idCliente" = '99999999-9999-4999-8999-999999999999'));
SELECT pg_temp.chk('relevador: la fecha de sincronización la fija la base', 'true',
  (SELECT ("sincronizadoEn" > '2020-01-01')::text FROM public."relevamiento" WHERE "idCliente" = '44444444-4444-4444-8444-444444444444'));
SELECT pg_temp.chk('relevador: ve solo sus relevamientos', '2', pg_temp.contar($q$SELECT 1 FROM public."relevamiento"$q$));
SELECT pg_temp.chk('relevador: no modifica relevamientos', '42501', pg_temp.intentar($q$UPDATE public."relevamiento" SET "observaciones"='x'$q$));
SELECT pg_temp.chk('relevador: no borra relevamientos', '42501', pg_temp.intentar($q$DELETE FROM public."relevamiento"$q$));
SELECT pg_temp.chk('relevador: edita su nombre', '1', pg_temp.afectadas($q$UPDATE public."usuario" SET "nombre"='Nuevo' WHERE "id"='T-R1'$q$));
SELECT pg_temp.chk('relevador: no edita el nombre de otro', '0', pg_temp.afectadas($q$UPDATE public."usuario" SET "nombre"='x' WHERE "id"='T-R2'$q$));
SELECT pg_temp.chk('relevador: no se cambia el rol', '42501', pg_temp.intentar($q$UPDATE public."usuario" SET "rol"='administrador' WHERE "id"='T-R1'$q$));
SELECT pg_temp.chk('relevador: no se cambia el estado', '42501', pg_temp.intentar($q$UPDATE public."usuario" SET "estado"='activa' WHERE "id"='T-R1'$q$));
SELECT pg_temp.chk('relevador: no inserta ni borra usuarios', '42501', pg_temp.intentar($q$DELETE FROM public."usuario"$q$));
SELECT pg_temp.chk('relevador: no ve eventos ajenos', '0', pg_temp.contar($q$SELECT 1 FROM public."evento_auditoria"$q$));
SELECT pg_temp.chk('relevador: no ve cambio_fila', '0', pg_temp.contar($q$SELECT 1 FROM public."cambio_fila"$q$));
SELECT pg_temp.chk('relevador: no escribe auditoría', '42501', pg_temp.intentar(
  $q$INSERT INTO public."evento_auditoria" ("tipo") VALUES ('FALSO')$q$));
SELECT pg_temp.chk('relevador: no escribe cambio_fila', '42501', pg_temp.intentar(
  $q$INSERT INTO public."cambio_fila" ("tabla","operacion","filaId") VALUES ('x','INSERT','x')$q$));
SELECT pg_temp.chk('relevador: exportación propia válida', 'ok', pg_temp.intentar(
  $q$INSERT INTO public."exportacion" ("usuarioId","formato","filas","hashSha256") VALUES ('T-R1','csv',3,repeat('a',64))$q$));
SELECT pg_temp.chk('relevador: exportación con formato inválido', '23514', pg_temp.intentar(
  $q$INSERT INTO public."exportacion" ("usuarioId","formato") VALUES ('T-R1','xls')$q$));
SELECT pg_temp.chk('relevador: exportación a nombre de otro', '42501', pg_temp.intentar(
  $q$INSERT INTO public."exportacion" ("usuarioId","formato") VALUES ('T-R2','csv')$q$));
SELECT pg_temp.chk('relevador: sin acceso a fotos', '42501', pg_temp.intentar($q$SELECT 1 FROM public."foto_relevamiento"$q$));
SELECT pg_temp.chk('relevador: sin acceso a historial_cambio', '42501', pg_temp.intentar($q$SELECT 1 FROM public."historial_cambio"$q$));
SELECT pg_temp.chk('relevador: sin acceso a _prisma_migrations', '42501', pg_temp.intentar($q$SELECT 1 FROM public."_prisma_migrations"$q$));
SELECT pg_temp.chk('relevador: no llama al trigger de auditoría', '42501', pg_temp.intentar($q$SELECT public.registrar_cambio_fila()$q$));
SELECT pg_temp.chk('relevador: no escribe eventos con la función privada', '42501', pg_temp.intentar($q$SELECT privado.registrar_evento('FALSO')$q$));
RESET ROLE;

-- El actor de cambio_fila sale de auth.uid() cuando no hay app.usuario_id ----------------------------------
SELECT pg_temp.chk('auditoría: el actor del cambio es quien insertó', 'T-R1',
  (SELECT "actorUsuarioId" FROM public."cambio_fila"
   WHERE "tabla" = 'relevamiento' AND "filaId" = (SELECT "id" FROM public."relevamiento" WHERE "idCliente" = '44444444-4444-4444-8444-444444444444')));

-- administrador ----------------------------------------------------------------------------------------
SELECT set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.chk('admin: ve todos los usuarios de prueba', '4', (SELECT count(*)::text FROM public."usuario" WHERE "id" LIKE 'T-%'));
SELECT pg_temp.chk('admin: ve los relevamientos de otros', 'true', (SELECT (count(*) >= 3)::text FROM public."relevamiento"));
SELECT pg_temp.chk('admin: ve eventos de todos', 'true', (SELECT (count(*) >= 2)::text FROM public."evento_auditoria"));
SELECT pg_temp.chk('admin: ve cambio_fila', 'true', (SELECT (count(*) > 0)::text FROM public."cambio_fila"));
SELECT pg_temp.chk('admin: no modifica auditoría', '42501', pg_temp.intentar($q$UPDATE public."evento_auditoria" SET "tipo"='X'$q$));
SELECT pg_temp.chk('admin: no borra cambio_fila', '42501', pg_temp.intentar($q$DELETE FROM public."cambio_fila"$q$));
SELECT pg_temp.chk('admin: no trunca auditoría', '42501', pg_temp.intentar($q$TRUNCATE public."evento_auditoria"$q$));
SELECT pg_temp.chk('admin: no cambia roles directo', '42501', pg_temp.intentar($q$UPDATE public."usuario" SET "rol"='relevador' WHERE "id"='T-R1'$q$));
SELECT pg_temp.chk('admin: no escribe el catálogo directo', '42501', pg_temp.intentar($q$DELETE FROM public."bien"$q$));
RESET ROLE;

-- Inmutabilidad también para el propietario (triggers) -------------------------------------------------
SELECT pg_temp.chk('propietario: UPDATE de evento_auditoria bloqueado', '42501', pg_temp.intentar($q$UPDATE public."evento_auditoria" SET "tipo"='X'$q$));
SELECT pg_temp.chk('propietario: DELETE de cambio_fila bloqueado', '42501', pg_temp.intentar($q$DELETE FROM public."cambio_fila"$q$));
SELECT pg_temp.chk('propietario: TRUNCATE de auditoría bloqueado', '42501', pg_temp.intentar($q$TRUNCATE public."evento_auditoria"$q$));

-- Función de eventos (la usarán las funciones de administración) ---------------------------------------
SELECT set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated"}', true);
SELECT privado.registrar_evento('PRUEBA_FUNCION', 'usuario', 'T-R1', '{"dato":1}'::jsonb, 'prueba');
SELECT pg_temp.chk('registrar_evento: guarda actor y rol', 'T-ADM/administrador',
  (SELECT "actorUsuarioId" || '/' || "actorRol"::text FROM public."evento_auditoria" WHERE "tipo" = 'PRUEBA_FUNCION'));

-- Corte inmediato al suspender -------------------------------------------------------------------------
UPDATE public."usuario" SET "estado" = 'suspendida' WHERE "id" = 'T-R1';
SELECT set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000002","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.chk('suspendido: pierde el catálogo al instante', '0', pg_temp.contar($q$SELECT 1 FROM public."bien"$q$));
SELECT pg_temp.chk('suspendido: pierde sus relevamientos', '0', pg_temp.contar($q$SELECT 1 FROM public."relevamiento"$q$));
SELECT pg_temp.chk('suspendido: no inserta', '42501', pg_temp.intentar(
  $q$INSERT INTO public."relevamiento" ("idCliente","usuarioId","resultado","relevadoEnDispositivo")
     VALUES ('aaaaaaaa-1111-4111-8111-111111111111','T-R1','no_encontrado',now())$q$));
RESET ROLE;

SELECT prueba, ok, detalle FROM pg_temp.resultado ORDER BY ctid;
ROLLBACK;
