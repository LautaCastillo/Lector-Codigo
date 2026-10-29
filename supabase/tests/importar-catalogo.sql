-- Pruebas de la importación del catálogo (fase 4 del plan v3). Termina con ROLLBACK; todas deben dar true.
BEGIN;
CREATE TEMP TABLE resultado (prueba text, ok boolean, detalle text);
GRANT ALL ON TABLE resultado TO PUBLIC;
CREATE FUNCTION pg_temp.intentar(p text) RETURNS text LANGUAGE plpgsql AS $f$
BEGIN EXECUTE p; RETURN 'ok'; EXCEPTION WHEN OTHERS THEN RETURN SQLSTATE; END $f$;
CREATE FUNCTION pg_temp.chk(p text, esperado text, obtenido text) RETURNS void LANGUAGE sql AS $f$
INSERT INTO pg_temp.resultado VALUES (p, esperado = obtenido, 'esperado ' || esperado || ', obtenido ' || coalesce(obtenido, 'NULL')) $f$;
GRANT EXECUTE ON FUNCTION pg_temp.intentar(text), pg_temp.chk(text, text, text) TO PUBLIC;

-- Un bien real, tal como está hoy, como fila del listado (para probar "sin cambios" y "modificado").
CREATE TEMP TABLE existente AS
  SELECT b."numeroInventario" AS numero, jsonb_build_object('numeroInventario', b."numeroInventario", 'descripcion', b."descripcion",
    'catalogo', b."catalogo", 'ubicacionFisica', b."ubicacionFisica", 'areaResponsable', b."areaResponsable", 'motivoAlta', b."motivoAlta",
    'estadoBien', b."estadoBien", 'valorUnitario', b."valorUnitario", 'fechaIncorporacion', b."fechaIncorporacion",
    'numeroSerie', b."numeroSerie", 'numeroAnterior', b."numeroAnterior", 'expediente', b."expediente") AS fila
  FROM public."bien" b ORDER BY b."numeroInventario" LIMIT 1;
GRANT SELECT ON TABLE existente TO PUBLIC;
CREATE TEMP TABLE antes AS SELECT count(*)::int AS n FROM public."bien";
GRANT SELECT ON TABLE antes TO PUBLIC;

INSERT INTO public."usuario" ("id", "cuenta", "nombre", "rol", "estado", "authId") VALUES
  ('T-ADM', 'adm@prueba', 'Admin', 'administrador', 'activa', 'ffffffff-0000-0000-0000-000000000001'),
  ('T-R1',  'r1@prueba',  'Relevador 1', 'relevador', 'activa', 'ffffffff-0000-0000-0000-000000000002');

SET LOCAL ROLE anon;
SELECT pg_temp.chk('anon no importa', '42501', pg_temp.intentar($q$SELECT * FROM public.importar_catalogo('[]'::jsonb, 'previsualizar')$q$));
RESET ROLE;

SELECT set_config('request.jwt.claims', '{"sub":"ffffffff-0000-0000-0000-000000000002","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.chk('relevador no previsualiza', '42501', pg_temp.intentar($q$SELECT * FROM public.importar_catalogo('[]'::jsonb, 'previsualizar')$q$));
SELECT pg_temp.chk('relevador no aplica', '42501', pg_temp.intentar($q$SELECT * FROM public.importar_catalogo('[]'::jsonb, 'aplicar')$q$));
SELECT pg_temp.chk('relevador no registra la constancia', '42501', pg_temp.intentar($q$SELECT public.registrar_importacion_catalogo('a.xlsx', repeat('a',64), 1, 1, 0, 0)$q$));
SELECT pg_temp.chk('relevador no lee las constancias', '0', (SELECT count(*)::text FROM public."importacion_catalogo"));
RESET ROLE;

SELECT set_config('request.jwt.claims', '{"sub":"ffffffff-0000-0000-0000-000000000001","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.chk('admin: modo inválido', '22023', pg_temp.intentar($q$SELECT * FROM public.importar_catalogo('[]'::jsonb, 'borrar')$q$));
SELECT pg_temp.chk('admin: número inválido', '22023', pg_temp.intentar($q$SELECT * FROM public.importar_catalogo('[{"numeroInventario":"abc"}]'::jsonb, 'previsualizar')$q$));
SELECT pg_temp.chk('admin: más de 1000 filas por tanda', '22023', pg_temp.intentar(
  $q$SELECT * FROM public.importar_catalogo((SELECT jsonb_agg(jsonb_build_object('numeroInventario', g::text)) FROM generate_series(1, 1001) g), 'previsualizar')$q$));
SELECT pg_temp.chk('admin: previsualiza dos nuevos y un repetido', '2/0/0',
  (SELECT "nuevos" || '/' || "modificados" || '/' || "sinCambios" FROM public.importar_catalogo(
    '[{"numeroInventario":"99990001","descripcion":"Silla de prueba"},{"numeroInventario":"99990002","descripcion":"Mesa"},{"numeroInventario":"99990002","descripcion":"Mesa repetida"}]'::jsonb, 'previsualizar')));
SELECT pg_temp.chk('admin: un bien igual al existente no cambia', '0/0/1',
  (SELECT "nuevos" || '/' || "modificados" || '/' || "sinCambios" FROM public.importar_catalogo(jsonb_build_array((SELECT fila FROM pg_temp.existente)), 'previsualizar')));
SELECT pg_temp.chk('admin: un bien con otra descripción se cuenta como modificado', '0/1/0',
  (SELECT "nuevos" || '/' || "modificados" || '/' || "sinCambios" FROM public.importar_catalogo(
    jsonb_build_array((SELECT fila || '{"descripcion":"DESCRIPCION MODIFICADA"}'::jsonb FROM pg_temp.existente)), 'previsualizar')));
SELECT pg_temp.chk('previsualizar no escribe', 'true', (SELECT ((SELECT count(*)::int FROM public."bien") = (SELECT n FROM pg_temp.antes))::text));
SELECT pg_temp.chk('admin: aplica dos nuevos y uno modificado', '2/1/0',
  (SELECT "nuevos" || '/' || "modificados" || '/' || "sinCambios" FROM public.importar_catalogo(
    jsonb_build_array(
      jsonb_build_object('numeroInventario','99990001','descripcion','Silla de prueba','ubicacionFisica','Oficina X','valorUnitario',1500.5,'fechaIncorporacion','2026-10-01'),
      jsonb_build_object('numeroInventario','99990002','descripcion','Mesa'),
      (SELECT fila || '{"descripcion":"DESCRIPCION MODIFICADA"}'::jsonb FROM pg_temp.existente)), 'aplicar')));
SELECT pg_temp.chk('aplicar repetido es idempotente', '0/0/3',
  (SELECT "nuevos" || '/' || "modificados" || '/' || "sinCambios" FROM public.importar_catalogo(
    jsonb_build_array(
      jsonb_build_object('numeroInventario','99990001','descripcion','Silla de prueba','ubicacionFisica','Oficina X','valorUnitario',1500.5,'fechaIncorporacion','2026-10-01'),
      jsonb_build_object('numeroInventario','99990002','descripcion','Mesa'),
      (SELECT fila || '{"descripcion":"DESCRIPCION MODIFICADA"}'::jsonb FROM pg_temp.existente)), 'aplicar')));
SELECT pg_temp.chk('admin: constancia de la carga', 'ok', pg_temp.intentar($q$SELECT public.registrar_importacion_catalogo('listado.xlsx', repeat('a',64), 3, 2, 1, 0)$q$));
SELECT pg_temp.chk('admin: la huella debe ser válida', '23514', pg_temp.intentar($q$SELECT public.registrar_importacion_catalogo('listado.xlsx', 'no-es-una-huella', 3, 2, 1, 0)$q$));
SELECT pg_temp.chk('admin lee las constancias', '1', (SELECT count(*)::text FROM public."importacion_catalogo"));
RESET ROLE;

SELECT pg_temp.chk('quedaron los dos bienes nuevos con sus datos', '2/1500.50/Oficina X',
  (SELECT count(*)::text || '/' || max("valorUnitario")::text || '/' || max("ubicacionFisica") FROM public."bien" WHERE "numeroInventario" IN ('99990001', '99990002')));
SELECT pg_temp.chk('el bien modificado cambió', 'DESCRIPCION MODIFICADA', (SELECT b."descripcion" FROM public."bien" b WHERE b."numeroInventario" = (SELECT numero FROM pg_temp.existente)));
SELECT pg_temp.chk('el cambio quedó en el historial con el administrador como actor', 'T-ADM',
  (SELECT c."actorUsuarioId" FROM public."cambio_fila" c JOIN public."bien" b ON b."id" = c."filaId" AND c."tabla" = 'bien'
   WHERE b."numeroInventario" = (SELECT numero FROM pg_temp.existente) AND c."operacion" = 'UPDATE' AND c."actorUsuarioId" = 'T-ADM' LIMIT 1));
SELECT pg_temp.chk('repetir la carga no agrega cambios al historial', '1',
  (SELECT count(*)::text FROM public."cambio_fila" c JOIN public."bien" b ON b."id" = c."filaId" AND c."tabla" = 'bien'
   WHERE b."numeroInventario" = (SELECT numero FROM pg_temp.existente) AND c."operacion" = 'UPDATE' AND c."actorUsuarioId" = 'T-ADM'));
SELECT pg_temp.chk('la constancia deja el evento', 'T-ADM/3', (SELECT "actorUsuarioId" || '/' || ("datos" ->> 'filas') FROM public."evento_auditoria" WHERE "tipo" = 'CATALOGO_IMPORTADO' AND "actorUsuarioId" = 'T-ADM'));

SELECT prueba, ok, detalle FROM pg_temp.resultado ORDER BY ctid;
ROLLBACK;
