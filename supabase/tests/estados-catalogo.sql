-- Pruebas de estados_catalogo (la lista de estados del bien para filtrar la búsqueda). Termina con ROLLBACK; todas deben dar true.
BEGIN;
CREATE TEMP TABLE resultado (prueba text, ok boolean, detalle text);
GRANT ALL ON TABLE resultado TO PUBLIC;
CREATE FUNCTION pg_temp.intentar(p text) RETURNS text LANGUAGE plpgsql AS $f$
BEGIN EXECUTE p; RETURN 'ok'; EXCEPTION WHEN OTHERS THEN RETURN SQLSTATE; END $f$;
CREATE FUNCTION pg_temp.chk(p text, esperado text, obtenido text) RETURNS void LANGUAGE sql AS $f$
INSERT INTO pg_temp.resultado VALUES (p, esperado = obtenido, 'esperado ' || esperado || ', obtenido ' || coalesce(obtenido, 'NULL')) $f$;
GRANT EXECUTE ON FUNCTION pg_temp.intentar(text), pg_temp.chk(text, text, text) TO PUBLIC;

INSERT INTO public."usuario" ("id", "cuenta", "nombre", "rol", "estado", "authId") VALUES
  ('T-R1', 'r1@prueba', 'Relevador 1', 'relevador', 'activa', 'ffffffff-0000-0000-0000-000000000002'),
  ('T-SU', 'su@prueba', 'Suspendida', 'relevador', 'suspendida', 'ffffffff-0000-0000-0000-000000000004');
INSERT INTO public."bien" ("id", "numeroInventario", "descripcion", "estadoBien", "areaResponsable") VALUES
  ('B-1', '99991001', 'Silla A', 'ZZ Estado de prueba', '9-9 Área de prueba'),
  ('B-2', '99991002', 'Silla B', 'ZZ Estado de prueba', '9-9 Área de prueba'),
  ('B-3', '99991003', 'Silla C', 'ZZ Otro estado', '9-9 Área de prueba'),
  ('B-4', '99991004', 'Silla D', NULL, '9-9 Área de prueba'),
  ('B-5', '99991005', 'Silla E', '   ', '9-9 Área de prueba');

SELECT set_config('request.jwt.claims', '{"sub":"ffffffff-0000-0000-0000-000000000002","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.chk('una cuenta activa ve cada estado con su cantidad', '2/1',
  (SELECT (SELECT cantidad FROM public.estados_catalogo() WHERE nombre = 'ZZ Estado de prueba') || '/' || (SELECT cantidad FROM public.estados_catalogo() WHERE nombre = 'ZZ Otro estado')));
SELECT pg_temp.chk('los bienes sin estado o con estado en blanco no figuran', '0', (SELECT count(*)::text FROM public.estados_catalogo() WHERE nombre IS NULL OR btrim(nombre) = ''));
SELECT pg_temp.chk('el estado más frecuente va antes', 'true',
  (WITH e AS (SELECT nombre, row_number() OVER () AS n FROM public.estados_catalogo())
   SELECT ((SELECT n FROM e WHERE nombre = 'ZZ Estado de prueba') < (SELECT n FROM e WHERE nombre = 'ZZ Otro estado'))::text));
RESET ROLE;

SET LOCAL ROLE anon;
SELECT pg_temp.chk('anon no ve los estados', '42501', pg_temp.intentar($q$SELECT * FROM public.estados_catalogo()$q$));
RESET ROLE;
SELECT set_config('request.jwt.claims', '{"sub":"ffffffff-0000-0000-0000-000000000004","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.chk('una cuenta suspendida no ve nada del catálogo', '0', (SELECT count(*)::text FROM public.estados_catalogo()));
RESET ROLE;

SELECT prueba, ok, detalle FROM pg_temp.resultado ORDER BY ctid;
ROLLBACK;
