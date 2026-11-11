-- Pruebas de los comentarios (comentar, retirar_comentario). Termina con ROLLBACK; todas deben dar true.
BEGIN;
CREATE TEMP TABLE resultado (prueba text, ok boolean, detalle text);
GRANT ALL ON TABLE resultado TO PUBLIC;
CREATE TEMP TABLE jj (n int, id text);
GRANT ALL ON TABLE jj TO PUBLIC;
CREATE TEMP TABLE cc (n int, id text);
GRANT ALL ON TABLE cc TO PUBLIC;
CREATE FUNCTION pg_temp.intentar(p text) RETURNS text LANGUAGE plpgsql AS $f$
BEGIN EXECUTE p; RETURN 'ok'; EXCEPTION WHEN OTHERS THEN RETURN SQLSTATE; END $f$;
CREATE FUNCTION pg_temp.chk(p text, esperado text, obtenido text) RETURNS void LANGUAGE sql AS $f$
INSERT INTO pg_temp.resultado VALUES (p, esperado = obtenido, 'esperado ' || esperado || ', obtenido ' || coalesce(obtenido, 'NULL')) $f$;
GRANT EXECUTE ON FUNCTION pg_temp.intentar(text), pg_temp.chk(text, text, text) TO PUBLIC;
CREATE FUNCTION pg_temp.jid() RETURNS text LANGUAGE sql SECURITY DEFINER AS $f$ SELECT id FROM pg_temp.jj WHERE n = 1 $f$;
CREATE FUNCTION pg_temp.cid(k int) RETURNS text LANGUAGE sql SECURITY DEFINER AS $f$ SELECT id FROM pg_temp.cc WHERE n = k $f$;
-- Cuántos comentarios vigentes (no retirados) hay en total, y cuántos retirados.
CREATE FUNCTION pg_temp.vigentes() RETURNS text LANGUAGE sql SECURITY DEFINER AS $f$ SELECT count(*)::text FROM public."comentario" WHERE "retiradoEn" IS NULL $f$;
CREATE FUNCTION pg_temp.retirados() RETURNS text LANGUAGE sql SECURITY DEFINER AS $f$ SELECT count(*)::text FROM public."comentario" WHERE "retiradoEn" IS NOT NULL $f$;
GRANT EXECUTE ON FUNCTION pg_temp.jid(), pg_temp.cid(int), pg_temp.vigentes(), pg_temp.retirados() TO PUBLIC;

INSERT INTO public."usuario" ("id", "cuenta", "nombre", "rol", "estado", "authId") VALUES
  ('T-ADM', 'adm@prueba', 'Admin', 'administrador', 'activa', 'ffffffff-0000-0000-0000-000000000001'),
  ('T-R1', 'r1@prueba', 'Relevador 1', 'relevador', 'activa', 'ffffffff-0000-0000-0000-000000000002'),
  ('T-R2', 'r2@prueba', 'Relevador 2', 'relevador', 'activa', 'ffffffff-0000-0000-0000-000000000003'),
  ('T-SU', 'su@prueba', 'Suspendida', 'relevador', 'suspendida', 'ffffffff-0000-0000-0000-000000000004');
INSERT INTO public."bien" ("id", "numeroInventario", "descripcion", "ubicacionFisica", "areaResponsable") VALUES
  ('B-1', '99991001', 'Silla A', 'Oficina 1', '9-9 Área de prueba');

-- R1 abre una jornada y comenta el bien y la jornada.
SELECT set_config('request.jwt.claims', '{"sub":"ffffffff-0000-0000-0000-000000000002","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
INSERT INTO pg_temp.jj SELECT 1, public.crear_jornada('area', '9-9 Área de prueba');
INSERT INTO pg_temp.cc SELECT 1, public.comentar('B-1', NULL, '  Prestado a otra oficina  ', 'cccccccc-0000-4000-8000-000000000001');
SELECT pg_temp.chk('se comenta un bien', 'Prestado a otra oficina', (SELECT "texto" FROM public."comentario" WHERE "id" = pg_temp.cid(1)));
SELECT pg_temp.chk('el comentario guarda el autor', 'T-R1', (SELECT "autorId" FROM public."comentario" WHERE "id" = pg_temp.cid(1)));
INSERT INTO pg_temp.cc SELECT 2, public.comentar(NULL, pg_temp.jid(), 'La puerta del sector estaba cerrada', 'cccccccc-0000-4000-8000-000000000002');
SELECT pg_temp.chk('se comenta una jornada', 'true', (SELECT ("jornadaId" = pg_temp.jid() AND "bienId" IS NULL)::text FROM public."comentario" WHERE "id" = pg_temp.cid(2)));
SELECT pg_temp.chk('repetir el mismo idCliente devuelve el mismo comentario', 'true',
  (public.comentar('B-1', NULL, 'Prestado a otra oficina', 'cccccccc-0000-4000-8000-000000000001') = pg_temp.cid(1))::text);
RESET ROLE;
SELECT pg_temp.chk('y no suma otro', '2', pg_temp.vigentes());

-- Validaciones.
SELECT set_config('request.jwt.claims', '{"sub":"ffffffff-0000-0000-0000-000000000002","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.chk('un comentario vacío se rechaza', '22023', pg_temp.intentar($q$SELECT public.comentar('B-1', NULL, '   ', 'cccccccc-0000-4000-8000-000000000003')$q$));
SELECT pg_temp.chk('un comentario de más de 500 caracteres se rechaza', '22023', pg_temp.intentar($q$SELECT public.comentar('B-1', NULL, repeat('x', 501), 'cccccccc-0000-4000-8000-000000000003')$q$));
SELECT pg_temp.chk('sin bien ni jornada se rechaza', '22023', pg_temp.intentar($q$SELECT public.comentar(NULL, NULL, 'Hola', 'cccccccc-0000-4000-8000-000000000003')$q$));
SELECT pg_temp.chk('un idCliente que no es UUID se rechaza', '22023', pg_temp.intentar($q$SELECT public.comentar('B-1', NULL, 'Hola', 'no-es-un-uuid')$q$));
SELECT pg_temp.chk('un bien que no existe se rechaza', 'P0002', pg_temp.intentar($q$SELECT public.comentar('NO-EXISTE', NULL, 'Hola', 'cccccccc-0000-4000-8000-000000000003')$q$));
SELECT pg_temp.chk('una jornada que no existe se rechaza', 'P0002', pg_temp.intentar($q$SELECT public.comentar(NULL, 'NO-EXISTE', 'Hola', 'cccccccc-0000-4000-8000-000000000003')$q$));
RESET ROLE;
SELECT pg_temp.chk('lo rechazado no deja nada', '2', pg_temp.vigentes());

-- Quién puede comentar y leer.
SET LOCAL ROLE anon;
SELECT pg_temp.chk('anon no comenta', '42501', pg_temp.intentar($q$SELECT public.comentar('B-1', NULL, 'Hola', 'cccccccc-0000-4000-8000-000000000004')$q$));
SELECT pg_temp.chk('anon no lee los comentarios', '42501', pg_temp.intentar($q$SELECT count(*) FROM public."comentario"$q$));
RESET ROLE;
SELECT set_config('request.jwt.claims', '{"sub":"ffffffff-0000-0000-0000-000000000004","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.chk('una cuenta suspendida no comenta', '42501', pg_temp.intentar($q$SELECT public.comentar('B-1', NULL, 'Hola', 'cccccccc-0000-4000-8000-000000000004')$q$));
SELECT pg_temp.chk('una cuenta suspendida no lee', '0', (SELECT count(*)::text FROM public."comentario"));
RESET ROLE;

-- R2 ve lo de R1, comenta, pero no puede escribir directo en la tabla ni retirar lo ajeno.
SELECT set_config('request.jwt.claims', '{"sub":"ffffffff-0000-0000-0000-000000000003","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.chk('otra cuenta activa ve los comentarios del equipo', '2', (SELECT count(*)::text FROM public."comentario"));
INSERT INTO pg_temp.cc SELECT 3, public.comentar('B-1', NULL, 'Lo vi en depósito', 'cccccccc-0000-4000-8000-000000000005');
SELECT pg_temp.chk('otra cuenta también comenta', 'T-R2', (SELECT "autorId" FROM public."comentario" WHERE "id" = pg_temp.cid(3)));
SELECT pg_temp.chk('nadie escribe directo en la tabla', '42501',
  pg_temp.intentar($q$INSERT INTO public."comentario" ("idCliente","bienId","texto","autorId") VALUES ('cccccccc-0000-4000-8000-000000000006','B-1','Hola','T-R2')$q$));
SELECT pg_temp.chk('nadie edita directo un comentario', '42501', pg_temp.intentar($q$UPDATE public."comentario" SET "texto" = 'Otro' WHERE "autorId" = 'T-R2'$q$));
SELECT pg_temp.chk('nadie borra un comentario', '42501', pg_temp.intentar($q$DELETE FROM public."comentario" WHERE "autorId" = 'T-R2'$q$));
SELECT pg_temp.chk('un relevador no retira el comentario de otro', '42501', pg_temp.intentar($q$SELECT public.retirar_comentario(pg_temp.cid(1))$q$));
SELECT pg_temp.chk('quien lo escribió lo retira', 'ok', pg_temp.intentar($q$SELECT public.retirar_comentario(pg_temp.cid(3))$q$));
SELECT pg_temp.chk('retirar de nuevo no falla', 'ok', pg_temp.intentar($q$SELECT public.retirar_comentario(pg_temp.cid(3))$q$));
SELECT pg_temp.chk('un comentario que no existe se rechaza', 'P0002', pg_temp.intentar($q$SELECT public.retirar_comentario('NO-EXISTE')$q$));
RESET ROLE;
SELECT pg_temp.chk('queda uno retirado y quién lo retiró', '1/T-R2', pg_temp.retirados() || '/' || (SELECT "retiradoPor" FROM public."comentario" WHERE "id" = pg_temp.cid(3)));

-- Un administrador retira cualquiera.
SELECT set_config('request.jwt.claims', '{"sub":"ffffffff-0000-0000-0000-000000000001","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.chk('un administrador retira el comentario de otro', 'ok', pg_temp.intentar($q$SELECT public.retirar_comentario(pg_temp.cid(1))$q$));
RESET ROLE;
SELECT pg_temp.chk('quedan dos retirados y uno vigente', '2/1', pg_temp.retirados() || '/' || pg_temp.vigentes());

-- Auditoría.
SELECT pg_temp.chk('quedan los eventos de auditoría', '3/2',
  (SELECT count(*) FILTER (WHERE "tipo" = 'COMENTARIO_CREADO')::text || '/' || count(*) FILTER (WHERE "tipo" = 'COMENTARIO_RETIRADO')::text FROM public."evento_auditoria"));
SELECT pg_temp.chk('y los cambios de fila de la tabla', 'true', (SELECT (count(*) >= 5)::text FROM public."cambio_fila" WHERE "tabla" = 'comentario'));

SELECT prueba, ok, detalle FROM pg_temp.resultado ORDER BY ctid;
ROLLBACK;
