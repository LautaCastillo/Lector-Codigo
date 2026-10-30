-- Pruebas de hallazgos y códigos desconocidos dentro de una jornada. Termina con ROLLBACK; todas deben dar true.
BEGIN;
CREATE TEMP TABLE resultado (prueba text, ok boolean, detalle text);
GRANT ALL ON TABLE resultado TO PUBLIC;
CREATE TEMP TABLE jj (n int, id text);
GRANT ALL ON TABLE jj TO PUBLIC;
CREATE FUNCTION pg_temp.chk(p text, esperado text, obtenido text) RETURNS void LANGUAGE sql AS $f$
INSERT INTO pg_temp.resultado VALUES (p, esperado = obtenido, 'esperado ' || esperado || ', obtenido ' || coalesce(obtenido, 'NULL')) $f$;
GRANT EXECUTE ON FUNCTION pg_temp.chk(text, text, text) TO PUBLIC;
INSERT INTO public."usuario" ("id", "cuenta", "nombre", "rol", "estado", "authId") VALUES
  ('T-R1', 'r1@prueba', 'Relevador 1', 'relevador', 'activa', 'ffffffff-0000-0000-0000-000000000002');
INSERT INTO public."bien" ("id", "numeroInventario", "descripcion", "ubicacionFisica", "areaResponsable") VALUES
  ('B-1', '99991001', 'Silla A', 'Oficina 1', '9-9 Área de prueba');
SELECT set_config('request.jwt.claims', '{"sub":"ffffffff-0000-0000-0000-000000000002","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
INSERT INTO pg_temp.jj SELECT 1, public.crear_jornada('area', '9-9 Área de prueba');
-- Un hallazgo y un código desconocido registrados dentro de la jornada, con la cuenta común (pasan por RLS).
INSERT INTO public."relevamiento" ("idCliente","usuarioId","resultado","clase","descripcion","ubicacionObservada","relevadoEnDispositivo","jornadaId")
  VALUES ('cccccccc-0000-4000-8000-000000000001','T-R1','hallazgo','nuevo','Mesa sin etiqueta','Oficina 1',now(),(SELECT id FROM pg_temp.jj WHERE n=1));
INSERT INTO public."relevamiento" ("idCliente","usuarioId","resultado","valorLeido","relevadoEnDispositivo","jornadaId")
  VALUES ('cccccccc-0000-4000-8000-000000000002','T-R1','no_encontrado','123456',now(),(SELECT id FROM pg_temp.jj WHERE n=1));
SELECT pg_temp.chk('el hallazgo aparece en Otros con su descripción', 'extra/hallazgo/Mesa sin etiqueta',
  (SELECT "tipo" || '/' || "resultado" || '/' || "descripcion" FROM public.avance_jornada((SELECT id FROM pg_temp.jj WHERE n=1)) WHERE "resultado" = 'hallazgo'));
SELECT pg_temp.chk('el hallazgo trae su código provisorio H-XXXXXXXX', 'true',
  (SELECT ("codigoProvisorio" ~ '^H-[0-9A-F]{8}$')::text FROM public.avance_jornada((SELECT id FROM pg_temp.jj WHERE n=1)) WHERE "resultado" = 'hallazgo'));
SELECT pg_temp.chk('un código desconocido se muestra como "Código <número>"', 'Código 123456',
  (SELECT "descripcion" FROM public.avance_jornada((SELECT id FROM pg_temp.jj WHERE n=1)) WHERE "resultado" = 'no_encontrado'));
SELECT pg_temp.chk('lo esperado no cambia', '1/0',
  (SELECT count(*) FILTER (WHERE "tipo"='esperado')::text || '/' || count(*) FILTER (WHERE "tipo"='esperado' AND "encontrado")::text FROM public.avance_jornada((SELECT id FROM pg_temp.jj WHERE n=1))));
RESET ROLE;
SELECT prueba, ok, detalle FROM pg_temp.resultado ORDER BY ctid;
ROLLBACK;
