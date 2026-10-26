-- Pruebas de las jornadas de relevamiento compartidas (fase 5 del plan v3). Termina con ROLLBACK; todas deben dar true.
BEGIN;
CREATE TEMP TABLE resultado (prueba text, ok boolean, detalle text);
GRANT ALL ON TABLE resultado TO PUBLIC;
CREATE TEMP TABLE jj (n int, id text);
GRANT ALL ON TABLE jj TO PUBLIC;
CREATE FUNCTION pg_temp.intentar(p text) RETURNS text LANGUAGE plpgsql AS $f$
BEGIN EXECUTE p; RETURN 'ok'; EXCEPTION WHEN OTHERS THEN RETURN SQLSTATE; END $f$;
CREATE FUNCTION pg_temp.chk(p text, esperado text, obtenido text) RETURNS void LANGUAGE sql AS $f$
INSERT INTO pg_temp.resultado VALUES (p, esperado = obtenido, 'esperado ' || esperado || ', obtenido ' || coalesce(obtenido, 'NULL')) $f$;
GRANT EXECUTE ON FUNCTION pg_temp.intentar(text), pg_temp.chk(text, text, text) TO PUBLIC;

INSERT INTO public."usuario" ("id", "cuenta", "nombre", "rol", "estado", "authId") VALUES
  ('T-ADM', 'adm@prueba', 'Admin', 'administrador', 'activa', 'ffffffff-0000-0000-0000-000000000001'),
  ('T-R1', 'r1@prueba', 'Relevador 1', 'relevador', 'activa', 'ffffffff-0000-0000-0000-000000000002'),
  ('T-R2', 'r2@prueba', 'Relevador 2', 'relevador', 'activa', 'ffffffff-0000-0000-0000-000000000003'),
  ('T-SU', 'su@prueba', 'Suspendida', 'relevador', 'suspendida', 'ffffffff-0000-0000-0000-000000000004');
-- Un área de prueba con tres bienes en dos ubicaciones, y un bien de otra área.
INSERT INTO public."bien" ("id", "numeroInventario", "descripcion", "ubicacionFisica", "areaResponsable") VALUES
  ('B-1', '99991001', 'Silla A', 'Oficina 1', '9-9 Área de prueba'),
  ('B-2', '99991002', 'Silla B', 'Oficina 1', '9-9 Área de prueba'),
  ('B-3', '99991003', 'Mesa C', 'Oficina 2', '9-9 Área de prueba'),
  ('B-4', '99991004', 'Armario de otra área', 'Pasillo', '8-8 Otra área');

SET LOCAL ROLE anon;
SELECT pg_temp.chk('anon no crea jornadas', '42501', pg_temp.intentar($q$SELECT public.crear_jornada('area', '9-9 Área de prueba')$q$));
RESET ROLE;
SELECT set_config('request.jwt.claims', '{"sub":"ffffffff-0000-0000-0000-000000000004","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.chk('una cuenta suspendida no crea jornadas', '42501', pg_temp.intentar($q$SELECT public.crear_jornada('area', '9-9 Área de prueba')$q$));
RESET ROLE;

SELECT set_config('request.jwt.claims', '{"sub":"ffffffff-0000-0000-0000-000000000002","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.chk('alcance sin bienes', '22023', pg_temp.intentar($q$SELECT public.crear_jornada('area', 'No existe')$q$));
SELECT pg_temp.chk('tipo inválido', '22023', pg_temp.intentar($q$SELECT public.crear_jornada('sector', '9-9 Área de prueba')$q$));
INSERT INTO pg_temp.jj SELECT 1, public.crear_jornada('area', '9-9 Área de prueba');
RESET ROLE;

SELECT set_config('request.jwt.claims', '{"sub":"ffffffff-0000-0000-0000-000000000003","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
INSERT INTO pg_temp.jj SELECT 2, public.crear_jornada('area', '9-9 Área de prueba');
SELECT pg_temp.chk('quien abre el mismo alcance se suma a la jornada abierta', 'true', (SELECT ((SELECT id FROM pg_temp.jj WHERE n = 1) = (SELECT id FROM pg_temp.jj WHERE n = 2))::text));
-- R2 encuentra B-1 en su lugar.
SELECT pg_temp.chk('R2 releva un bien de la jornada', 'ok', pg_temp.intentar(
  $q$INSERT INTO public."relevamiento" ("idCliente","usuarioId","bienId","resultado","relevadoEnDispositivo","jornadaId","ubicacionObservada")
     VALUES ('aaaaaaaa-0000-4000-8000-000000000001','T-R2','B-1','encontrado',now(),(SELECT id FROM pg_temp.jj WHERE n = 1),'Oficina 1')$q$));
RESET ROLE;

SELECT set_config('request.jwt.claims', '{"sub":"ffffffff-0000-0000-0000-000000000002","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
-- R1 encuentra B-2 en otra ubicación del área (aviso), un bien de otra área y un código desconocido.
SELECT pg_temp.chk('R1 releva un bien en otra ubicación del área', 'ok', pg_temp.intentar(
  $q$INSERT INTO public."relevamiento" ("idCliente","usuarioId","bienId","resultado","relevadoEnDispositivo","jornadaId","ubicacionObservada")
     VALUES ('aaaaaaaa-0000-4000-8000-000000000002','T-R1','B-2','encontrado',now(),(SELECT id FROM pg_temp.jj WHERE n = 1),'Oficina 2')$q$));
SELECT pg_temp.chk('R1 releva un bien de otra área', 'ok', pg_temp.intentar(
  $q$INSERT INTO public."relevamiento" ("idCliente","usuarioId","bienId","resultado","relevadoEnDispositivo","jornadaId")
     VALUES ('aaaaaaaa-0000-4000-8000-000000000003','T-R1','B-4','encontrado',now(),(SELECT id FROM pg_temp.jj WHERE n = 1))$q$));
SELECT pg_temp.chk('R1 registra un código fuera del catálogo', 'ok', pg_temp.intentar(
  $q$INSERT INTO public."relevamiento" ("idCliente","usuarioId","resultado","valorLeido","relevadoEnDispositivo","jornadaId")
     VALUES ('aaaaaaaa-0000-4000-8000-000000000004','T-R1','no_encontrado','123456',now(),(SELECT id FROM pg_temp.jj WHERE n = 1))$q$));
SELECT pg_temp.chk('el avance cuenta esperados y encontrados', '3/2',
  (SELECT count(*) FILTER (WHERE "tipo" = 'esperado')::text || '/' || count(*) FILTER (WHERE "tipo" = 'esperado' AND "encontrado")::text
   FROM public.avance_jornada((SELECT id FROM pg_temp.jj WHERE n = 1))));
SELECT pg_temp.chk('el avance trae los extras (otra área y código desconocido)', '2',
  (SELECT count(*)::text FROM public.avance_jornada((SELECT id FROM pg_temp.jj WHERE n = 1)) WHERE "tipo" = 'extra'));
SELECT pg_temp.chk('un bien visto en otra ubicación del área cuenta como encontrado, con aviso', 'true/true',
  (SELECT "encontrado"::text || '/' || "fueraDeLugar"::text FROM public.avance_jornada((SELECT id FROM pg_temp.jj WHERE n = 1)) WHERE "numeroInventario" = '99991002' AND "tipo" = 'esperado'));
SELECT pg_temp.chk('se sabe quién relevó cada bien', 'Relevador 2',
  (SELECT "relevador" FROM public.avance_jornada((SELECT id FROM pg_temp.jj WHERE n = 1)) WHERE "numeroInventario" = '99991001' AND "tipo" = 'esperado'));
SELECT pg_temp.chk('lo no relevado queda pendiente', 'false',
  (SELECT "encontrado"::text FROM public.avance_jornada((SELECT id FROM pg_temp.jj WHERE n = 1)) WHERE "numeroInventario" = '99991003' AND "tipo" = 'esperado'));
SELECT pg_temp.chk('la lista de jornadas trae el avance', '3/2/true',
  (SELECT "esperados" || '/' || "encontrados" || '/' || "propia" FROM public.listar_jornadas(NULL, (SELECT id FROM pg_temp.jj WHERE n = 1))));
SELECT pg_temp.chk('R1 ve lo que relevó R2 (el equipo se ve)', '1',
  (SELECT count(*)::text FROM public."relevamiento" WHERE "usuarioId" = 'T-R2' AND "jornadaId" = (SELECT id FROM pg_temp.jj WHERE n = 1)));
RESET ROLE;

SELECT set_config('request.jwt.claims', '{"sub":"ffffffff-0000-0000-0000-000000000003","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.chk('R2 no cierra una jornada que no creó', '42501', pg_temp.intentar($q$SELECT public.cerrar_jornada((SELECT id FROM pg_temp.jj WHERE n = 1))$q$));
RESET ROLE;
SELECT set_config('request.jwt.claims', '{"sub":"ffffffff-0000-0000-0000-000000000002","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.chk('quien la creó la cierra', 'ok', pg_temp.intentar($q$SELECT public.cerrar_jornada((SELECT id FROM pg_temp.jj WHERE n = 1))$q$));
SELECT pg_temp.chk('una jornada cerrada no se cierra de nuevo', '22023', pg_temp.intentar($q$SELECT public.cerrar_jornada((SELECT id FROM pg_temp.jj WHERE n = 1))$q$));
RESET ROLE;
SELECT set_config('request.jwt.claims', '{"sub":"ffffffff-0000-0000-0000-000000000003","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.chk('en una jornada cerrada ya no se relevó', '42501', pg_temp.intentar(
  $q$INSERT INTO public."relevamiento" ("idCliente","usuarioId","bienId","resultado","relevadoEnDispositivo","jornadaId")
     VALUES ('aaaaaaaa-0000-4000-8000-000000000005','T-R2','B-3','encontrado',now(),(SELECT id FROM pg_temp.jj WHERE n = 1))$q$));
INSERT INTO pg_temp.jj SELECT 3, public.crear_jornada('ubicacion', 'Oficina 2');
RESET ROLE;
SELECT set_config('request.jwt.claims', '{"sub":"ffffffff-0000-0000-0000-000000000001","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.chk('un administrador cierra la jornada de otro', 'ok', pg_temp.intentar($q$SELECT public.cerrar_jornada((SELECT id FROM pg_temp.jj WHERE n = 3))$q$));
RESET ROLE;

SELECT pg_temp.chk('quedan los eventos de creación (uno por jornada, no por quien se suma)', '1',
  (SELECT count(*)::text FROM public."evento_auditoria" WHERE "tipo" = 'JORNADA_CREADA' AND "actorUsuarioId" = 'T-R1'));
SELECT pg_temp.chk('el evento de cierre trae esperados y encontrados', '3/2',
  (SELECT ("datos" ->> 'esperados') || '/' || ("datos" ->> 'encontrados') FROM public."evento_auditoria" WHERE "tipo" = 'JORNADA_CERRADA' AND "actorUsuarioId" = 'T-R1'));
SELECT pg_temp.chk('el tiempo real está activo para relevamiento y jornada', '2',
  (SELECT count(*)::text FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename IN ('relevamiento', 'jornada')));

SET LOCAL ROLE anon;
SELECT pg_temp.chk('anon no ve el avance', '42501', pg_temp.intentar($q$SELECT * FROM public.avance_jornada('x')$q$));
SELECT pg_temp.chk('anon no ve las jornadas', '42501', pg_temp.intentar($q$SELECT * FROM public.listar_jornadas()$q$));
RESET ROLE;
SELECT prueba, ok, detalle FROM pg_temp.resultado ORDER BY ctid;
ROLLBACK;
