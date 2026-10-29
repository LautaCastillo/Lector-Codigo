-- Pruebas de las funciones de lectura del catálogo (fase 3 del plan v3). Termina con ROLLBACK; todas deben dar true.
BEGIN;
CREATE TEMP TABLE resultado (prueba text, ok boolean, detalle text);
GRANT ALL ON TABLE resultado TO PUBLIC;
CREATE FUNCTION pg_temp.intentar(p text) RETURNS text LANGUAGE plpgsql AS $f$
BEGIN EXECUTE p; RETURN 'ok'; EXCEPTION WHEN OTHERS THEN RETURN SQLSTATE; END $f$;
CREATE FUNCTION pg_temp.contar(p text) RETURNS text LANGUAGE plpgsql AS $f$
DECLARE n int;
BEGIN EXECUTE 'SELECT count(*) FROM (' || p || ') t' INTO n; RETURN n::text; EXCEPTION WHEN OTHERS THEN RETURN SQLSTATE; END $f$;
CREATE FUNCTION pg_temp.chk(p text, esperado text, obtenido text) RETURNS void LANGUAGE sql AS $f$
INSERT INTO pg_temp.resultado VALUES (p, esperado = obtenido, 'esperado ' || esperado || ', obtenido ' || coalesce(obtenido, 'NULL')) $f$;
GRANT EXECUTE ON FUNCTION pg_temp.intentar(text), pg_temp.contar(text), pg_temp.chk(text, text, text) TO PUBLIC;
INSERT INTO public."usuario" ("id", "cuenta", "rol", "estado", "authId") VALUES
  ('T-R1', 'r1@prueba', 'relevador', 'activa', 'dddddddd-0000-0000-0000-000000000002'),
  ('T-SU', 'su@prueba', 'relevador', 'suspendida', 'dddddddd-0000-0000-0000-000000000004');

SET LOCAL ROLE anon;
SELECT pg_temp.chk('anon no llama a ubicaciones_catalogo', '42501', pg_temp.intentar($q$SELECT * FROM public.ubicaciones_catalogo()$q$));
SELECT pg_temp.chk('anon no llama a historial_bien', '42501', pg_temp.intentar($q$SELECT * FROM public.historial_bien('x')$q$));
RESET ROLE;

SELECT set_config('request.jwt.claims', '{"sub":"dddddddd-0000-0000-0000-000000000002","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.chk('relevador ve las ubicaciones del catálogo', 'true', (SELECT (count(*) > 0)::text FROM public.ubicaciones_catalogo()));
SELECT pg_temp.chk('relevador lee el historial de un bien', 'ok', pg_temp.intentar($q$SELECT * FROM public.historial_bien((SELECT "id" FROM public."bien" LIMIT 1))$q$));
RESET ROLE;

SELECT set_config('request.jwt.claims', '{"sub":"dddddddd-0000-0000-0000-000000000004","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.chk('suspendida no ve ubicaciones', '0', pg_temp.contar($q$SELECT * FROM public.ubicaciones_catalogo()$q$));
SELECT pg_temp.chk('suspendida no lee historial', '42501', pg_temp.intentar($q$SELECT * FROM public.historial_bien('x')$q$));
RESET ROLE;
SELECT prueba, ok, detalle FROM pg_temp.resultado;
ROLLBACK;
