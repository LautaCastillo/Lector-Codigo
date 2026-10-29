-- Pruebas del historial de importaciones del catálogo. Termina con ROLLBACK; todas deben dar true.
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
  ('T-SU', 'su@prueba', 'Suspendida', 'relevador', 'suspendida', 'ffffffff-0000-0000-0000-000000000004');

SELECT set_config('request.jwt.claims', '{"sub":"ffffffff-0000-0000-0000-000000000001","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.chk('admin registra una carga con sus áreas', 'ok', pg_temp.intentar(
  $q$SELECT public.registrar_importacion_catalogo('area-x.xlsx', repeat('c',64), 84, 80, 4, 0, ARRAY['1-9 Dirección de Patrimonio (REC)', '2-2 Otra área'])$q$));
SELECT pg_temp.chk('la constancia sin áreas también anda', 'ok', pg_temp.intentar(
  $q$SELECT public.registrar_importacion_catalogo('viejo.xls', repeat('d',64), 5, 0, 0, 5)$q$));
RESET ROLE;
-- En una misma transacción las dos cargas tendrían la misma hora: se retrasa una para comprobar el orden.
UPDATE public."importacion_catalogo" SET "creadoEn" = now() - interval '1 day' WHERE "archivo" = 'area-x.xlsx';

SELECT set_config('request.jwt.claims', '{"sub":"ffffffff-0000-0000-0000-000000000002","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.chk('relevador no registra cargas', '42501', pg_temp.intentar($q$SELECT public.registrar_importacion_catalogo('x.xlsx', repeat('e',64), 1, 1, 0, 0)$q$));
SELECT pg_temp.chk('relevador ve el historial con quién cargó y las áreas', 'Admin de prueba/84/2',
  (SELECT "usuario" || '/' || "filas" || '/' || array_length("areas", 1) FROM public.historial_importaciones(100) WHERE "archivo" = 'area-x.xlsx'));
SELECT pg_temp.chk('el historial trae la huella para detectar un archivo repetido', 'true',
  (SELECT (count(*) = 1)::text FROM public.historial_importaciones(100) WHERE "hashSha256" = repeat('c',64)));
SELECT pg_temp.chk('lo más reciente va primero', 'viejo.xls',
  (SELECT "archivo" FROM public.historial_importaciones(100) WHERE "hashSha256" IN (repeat('c',64), repeat('d',64)) LIMIT 1));
SELECT pg_temp.chk('relevador no lee la tabla directo', '0', (SELECT count(*)::text FROM public."importacion_catalogo"));
RESET ROLE;

SELECT set_config('request.jwt.claims', '{"sub":"ffffffff-0000-0000-0000-000000000004","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.chk('suspendida no ve el historial', '42501', pg_temp.intentar($q$SELECT * FROM public.historial_importaciones(10)$q$));
RESET ROLE;
SET LOCAL ROLE anon;
SELECT pg_temp.chk('anon no ve el historial', '42501', pg_temp.intentar($q$SELECT * FROM public.historial_importaciones(10)$q$));
RESET ROLE;
SELECT prueba, ok, detalle FROM pg_temp.resultado ORDER BY ctid;
ROLLBACK;
