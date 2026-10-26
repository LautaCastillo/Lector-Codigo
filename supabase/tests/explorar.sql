-- Pruebas de los listados por área y por responsable (fase 5 del plan v3). Termina con ROLLBACK; todas deben dar true.
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
-- Un área nueva, como si se hubiera importado su archivo.
INSERT INTO public."bien" ("numeroInventario", "descripcion", "ubicacionFisica", "areaResponsable", "responsableUso") VALUES
  ('99990101', 'Silla A', 'Oficina 1', '9-9 Área de prueba', 'PEREZ JUAN'),
  ('99990102', 'Silla B', 'Oficina 2', '9-9 Área de prueba', 'PEREZ JUAN'),
  ('99990103', 'Silla C', 'Oficina 2', '9-9 Área de prueba', 'GOMEZ ANA');

SET LOCAL ROLE anon;
SELECT pg_temp.chk('anon no ve las áreas', '42501', pg_temp.intentar($q$SELECT * FROM public.areas_catalogo()$q$));
SELECT pg_temp.chk('anon no ve los responsables', '42501', pg_temp.intentar($q$SELECT * FROM public.responsables_catalogo()$q$));
RESET ROLE;

SELECT set_config('request.jwt.claims', '{"sub":"ffffffff-0000-0000-0000-000000000002","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.chk('un área recién importada aparece con sus cantidades', '3/2/2',
  (SELECT cantidad || '/' || ubicaciones || '/' || responsables FROM public.areas_catalogo() WHERE nombre = '9-9 Área de prueba'));
SELECT pg_temp.chk('el responsable aparece con su cantidad y áreas', '2/1',
  (SELECT cantidad || '/' || areas FROM public.responsables_catalogo() WHERE nombre = 'PEREZ JUAN'));
SELECT pg_temp.chk('las ubicaciones también se actualizan', '2',
  (SELECT cantidad::text FROM public.ubicaciones_catalogo() WHERE nombre = 'Oficina 2'));
RESET ROLE;

SELECT set_config('request.jwt.claims', '{"sub":"ffffffff-0000-0000-0000-000000000004","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.chk('suspendida no ve áreas', '0', (SELECT count(*)::text FROM public.areas_catalogo()));
SELECT pg_temp.chk('suspendida no ve responsables', '0', (SELECT count(*)::text FROM public.responsables_catalogo()));
RESET ROLE;
SELECT prueba, ok, detalle FROM pg_temp.resultado ORDER BY ctid;
ROLLBACK;
