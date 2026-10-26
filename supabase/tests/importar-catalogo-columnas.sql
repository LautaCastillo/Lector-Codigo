-- Importación con columnas parciales (fase 4 del plan v3): un reporte que no trae todas las columnas (el de un área no
-- trae el estado) no debe pisar lo que ya está en el catálogo. Termina con ROLLBACK; todas deben dar true.
BEGIN;
CREATE TEMP TABLE resultado (prueba text, ok boolean, detalle text);
GRANT ALL ON TABLE resultado TO PUBLIC;
CREATE FUNCTION pg_temp.intentar(p text) RETURNS text LANGUAGE plpgsql AS $f$
BEGIN EXECUTE p; RETURN 'ok'; EXCEPTION WHEN OTHERS THEN RETURN SQLSTATE; END $f$;
CREATE FUNCTION pg_temp.chk(p text, esperado text, obtenido text) RETURNS void LANGUAGE sql AS $f$
INSERT INTO pg_temp.resultado VALUES (p, esperado = obtenido, 'esperado ' || esperado || ', obtenido ' || coalesce(obtenido, 'NULL')) $f$;
GRANT EXECUTE ON FUNCTION pg_temp.intentar(text), pg_temp.chk(text, text, text) TO PUBLIC;
CREATE TEMP TABLE ex AS SELECT "numeroInventario" AS numero, "estadoBien" AS estado, "descripcion" AS descr FROM public."bien" WHERE "estadoBien" IS NOT NULL ORDER BY "numeroInventario" LIMIT 1;
GRANT SELECT ON TABLE ex TO PUBLIC;
INSERT INTO public."usuario" ("id", "cuenta", "nombre", "rol", "estado", "authId") VALUES
  ('T-ADM', 'adm@prueba', 'Admin', 'administrador', 'activa', 'ffffffff-0000-0000-0000-000000000001'),
  ('T-R1',  'r1@prueba',  'Relevador 1', 'relevador', 'activa', 'ffffffff-0000-0000-0000-000000000002');

SELECT set_config('request.jwt.claims', '{"sub":"ffffffff-0000-0000-0000-000000000002","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.chk('relevador no importa (con columnas)', '42501', pg_temp.intentar($q$SELECT * FROM public.importar_catalogo('[]'::jsonb, 'aplicar', ARRAY['numeroInventario'])$q$));
RESET ROLE;

SELECT set_config('request.jwt.claims', '{"sub":"ffffffff-0000-0000-0000-000000000001","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.chk('columna que no se puede importar', '22023', pg_temp.intentar($q$SELECT * FROM public.importar_catalogo('[]'::jsonb, 'previsualizar', ARRAY['id'])$q$));
SELECT pg_temp.chk('con columnas parciales: se detecta el cambio de responsable', '0/1/0',
  (SELECT "nuevos" || '/' || "modificados" || '/' || "sinCambios" FROM public.importar_catalogo(
    (SELECT jsonb_build_array(jsonb_build_object('numeroInventario', numero, 'responsableUso', 'PEREZ JUAN')) FROM pg_temp.ex), 'previsualizar',
    ARRAY['numeroInventario', 'responsableUso'])));
SELECT pg_temp.chk('aplicar guarda el responsable', '0/1/0',
  (SELECT "nuevos" || '/' || "modificados" || '/' || "sinCambios" FROM public.importar_catalogo(
    (SELECT jsonb_build_array(jsonb_build_object('numeroInventario', numero, 'responsableUso', 'PEREZ JUAN')) FROM pg_temp.ex), 'aplicar',
    ARRAY['numeroInventario', 'responsableUso'])));
RESET ROLE;
SELECT pg_temp.chk('el responsable quedó y el estado y la descripción siguen igual', 'PEREZ JUAN/true/true',
  (SELECT b."responsableUso" || '/' || (b."estadoBien" = e.estado)::text || '/' || (b."descripcion" IS NOT DISTINCT FROM e.descr)::text
   FROM public."bien" b JOIN pg_temp.ex e ON e.numero = b."numeroInventario"));
SET LOCAL ROLE authenticated;
SELECT pg_temp.chk('repetir no cambia nada', '0/0/1',
  (SELECT "nuevos" || '/' || "modificados" || '/' || "sinCambios" FROM public.importar_catalogo(
    (SELECT jsonb_build_array(jsonb_build_object('numeroInventario', numero, 'responsableUso', 'PEREZ JUAN')) FROM pg_temp.ex), 'aplicar',
    ARRAY['numeroInventario', 'responsableUso'])));
SELECT pg_temp.chk('un bien nuevo con columnas parciales se crea', '1/0/0',
  (SELECT "nuevos" || '/' || "modificados" || '/' || "sinCambios" FROM public.importar_catalogo(
    '[{"numeroInventario":"99990077","descripcion":"Nuevo","responsableUso":"GOMEZ ANA"}]'::jsonb, 'aplicar', ARRAY['numeroInventario','descripcion','responsableUso'])));
SELECT pg_temp.chk('sin columnas (todas) sigue andando', '0/0/1',
  (SELECT "nuevos" || '/' || "modificados" || '/' || "sinCambios" FROM public.importar_catalogo(
    '[{"numeroInventario":"99990077","descripcion":"Nuevo","responsableUso":"GOMEZ ANA"}]'::jsonb, 'previsualizar')));
RESET ROLE;
SELECT prueba, ok, detalle FROM pg_temp.resultado ORDER BY ctid;
ROLLBACK;
