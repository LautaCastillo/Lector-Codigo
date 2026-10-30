-- Pruebas del historial de exportaciones (visible para cualquier cuenta activa). Termina con ROLLBACK; todas deben dar true.
BEGIN;
CREATE TEMP TABLE resultado (prueba text, ok boolean, detalle text);
GRANT ALL ON TABLE resultado TO PUBLIC;
CREATE FUNCTION pg_temp.intentar(p text) RETURNS text LANGUAGE plpgsql AS $f$
BEGIN EXECUTE p; RETURN 'ok'; EXCEPTION WHEN OTHERS THEN RETURN SQLSTATE; END $f$;
CREATE FUNCTION pg_temp.chk(p text, esperado text, obtenido text) RETURNS void LANGUAGE sql AS $f$
INSERT INTO pg_temp.resultado VALUES (p, esperado = obtenido, 'esperado ' || esperado || ', obtenido ' || coalesce(obtenido, 'NULL')) $f$;
GRANT EXECUTE ON FUNCTION pg_temp.intentar(text), pg_temp.chk(text, text, text) TO PUBLIC;

INSERT INTO public."usuario" ("id", "cuenta", "nombre", "rol", "estado", "authId") VALUES
  ('T-ADM', 'adm@prueba', 'Admin de prueba', 'administrador', 'activa', 'ffffffff-0000-0000-0000-000000000001'),
  ('T-R1', 'r1@prueba', 'Relevador 1', 'relevador', 'activa', 'ffffffff-0000-0000-0000-000000000002'),
  ('T-R2', 'r2@prueba', 'Relevador 2', 'relevador', 'activa', 'ffffffff-0000-0000-0000-000000000003'),
  ('T-SU', 'su@prueba', 'Suspendida', 'relevador', 'suspendida', 'ffffffff-0000-0000-0000-000000000004');

-- R1 exporta lo suyo; el administrador exporta todo (una hora antes, para comprobar el orden).
SELECT set_config('request.jwt.claims', '{"sub":"ffffffff-0000-0000-0000-000000000002","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.chk('R1 deja constancia de su exportación', 'ok', pg_temp.intentar(
  $q$INSERT INTO public."exportacion" ("usuarioId","formato","filtros","filas","hashSha256") VALUES ('T-R1','csv','{"alcance":"propios"}'::jsonb,12,repeat('a',64))$q$));
RESET ROLE;
INSERT INTO public."exportacion" ("usuarioId","formato","filtros","filas","hashSha256","creadoEn")
  VALUES ('T-ADM','csv','{"alcance":"todos"}'::jsonb, 340, repeat('b',64), now() - interval '1 hour');

SELECT set_config('request.jwt.claims', '{"sub":"ffffffff-0000-0000-0000-000000000003","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.chk('R2 ve las exportaciones de otras personas con su nombre', 'Relevador 1/12',
  (SELECT "usuario" || '/' || "filas" FROM public.historial_exportaciones(100) WHERE "hashSha256" = repeat('a',64)));
SELECT pg_temp.chk('R2 ve también la del administrador y sus filtros', 'Admin de prueba/todos',
  (SELECT "usuario" || '/' || ("filtros" ->> 'alcance') FROM public.historial_exportaciones(100) WHERE "hashSha256" = repeat('b',64)));
SELECT pg_temp.chk('lo más reciente va primero', repeat('a',64),
  (SELECT "hashSha256" FROM public.historial_exportaciones(100) WHERE "hashSha256" IN (repeat('a',64), repeat('b',64)) LIMIT 1));
SELECT pg_temp.chk('la tabla sigue mostrando a R2 solo lo propio', '0', (SELECT count(*)::text FROM public."exportacion"));
SELECT pg_temp.chk('R2 no puede registrar una exportación a nombre de otra persona', '42501', pg_temp.intentar(
  $q$INSERT INTO public."exportacion" ("usuarioId","formato","filtros","filas") VALUES ('T-R1','csv','{}'::jsonb,1)$q$));
RESET ROLE;

SELECT set_config('request.jwt.claims', '{"sub":"ffffffff-0000-0000-0000-000000000004","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.chk('suspendida no ve el historial', '42501', pg_temp.intentar($q$SELECT * FROM public.historial_exportaciones(10)$q$));
RESET ROLE;
SET LOCAL ROLE anon;
SELECT pg_temp.chk('anon no ve el historial', '42501', pg_temp.intentar($q$SELECT * FROM public.historial_exportaciones(10)$q$));
RESET ROLE;
SELECT prueba, ok, detalle FROM pg_temp.resultado ORDER BY ctid;
ROLLBACK;
