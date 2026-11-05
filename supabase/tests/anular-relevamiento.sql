-- Pruebas de deshacer una lectura (anular_relevamiento). Termina con ROLLBACK; todas deben dar true.
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
INSERT INTO public."bien" ("id", "numeroInventario", "descripcion", "ubicacionFisica", "areaResponsable") VALUES
  ('B-1', '99991001', 'Silla A', 'Oficina 1', '9-9 Área de prueba'),
  ('B-2', '99991002', 'Silla B', 'Oficina 1', '9-9 Área de prueba');

-- R1 abre la jornada y lee B-1 y B-2; después R2 también lee B-1.
SELECT set_config('request.jwt.claims', '{"sub":"ffffffff-0000-0000-0000-000000000002","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
INSERT INTO pg_temp.jj SELECT 1, public.crear_jornada('area', '9-9 Área de prueba');
INSERT INTO public."relevamiento" ("idCliente","usuarioId","bienId","resultado","relevadoEnDispositivo","jornadaId") VALUES
  ('dddddddd-0000-4000-8000-000000000001','T-R1','B-1','encontrado',now(),(SELECT id FROM pg_temp.jj WHERE n=1)),
  ('dddddddd-0000-4000-8000-000000000002','T-R1','B-2','encontrado',now(),(SELECT id FROM pg_temp.jj WHERE n=1));
RESET ROLE;
SELECT set_config('request.jwt.claims', '{"sub":"ffffffff-0000-0000-0000-000000000003","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
INSERT INTO public."relevamiento" ("idCliente","usuarioId","bienId","resultado","relevadoEnDispositivo","jornadaId") VALUES
  ('dddddddd-0000-4000-8000-000000000003','T-R2','B-1','encontrado',now(),(SELECT id FROM pg_temp.jj WHERE n=1));
RESET ROLE;
-- En una transacción todas las horas del servidor son iguales: se escalonan para que R1 sea el primero.
UPDATE public."relevamiento" SET "sincronizadoEn" = now() + interval '1 second' WHERE "idCliente" = 'dddddddd-0000-4000-8000-000000000003';

CREATE FUNCTION pg_temp.rid(p text) RETURNS text LANGUAGE sql SECURITY DEFINER AS $f$ SELECT "id" FROM public."relevamiento" WHERE "idCliente" = p $f$;
GRANT EXECUTE ON FUNCTION pg_temp.rid(text) TO PUBLIC;
CREATE FUNCTION pg_temp.quien(b text) RETURNS text LANGUAGE sql AS $f$
SELECT "relevador" || '/' || "lecturas" FROM public.avance_jornada((SELECT id FROM pg_temp.jj WHERE n=1)) WHERE "bienId" = b $f$;
GRANT EXECUTE ON FUNCTION pg_temp.quien(text) TO PUBLIC;

SET LOCAL ROLE anon;
SELECT pg_temp.chk('anon no anula', '42501', pg_temp.intentar($q$SELECT public.anular_relevamiento(pg_temp.rid('dddddddd-0000-4000-8000-000000000001'))$q$));
RESET ROLE;
SELECT set_config('request.jwt.claims', '{"sub":"ffffffff-0000-0000-0000-000000000004","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.chk('una cuenta suspendida no anula', '42501', pg_temp.intentar($q$SELECT public.anular_relevamiento(pg_temp.rid('dddddddd-0000-4000-8000-000000000001'))$q$));
RESET ROLE;

-- R2 no puede anular la lectura de R1.
SELECT set_config('request.jwt.claims', '{"sub":"ffffffff-0000-0000-0000-000000000003","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.chk('un relevador no anula la lectura de otro', '42501', pg_temp.intentar($q$SELECT public.anular_relevamiento(pg_temp.rid('dddddddd-0000-4000-8000-000000000001'))$q$));
SELECT pg_temp.chk('antes de anular, figura R1 con 2 lecturas', 'Relevador 1/2', pg_temp.quien('B-1'));
RESET ROLE;

-- R1 anula la suya: pasa a figurar R2 y la lectura deja de contar.
SELECT set_config('request.jwt.claims', '{"sub":"ffffffff-0000-0000-0000-000000000002","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.chk('un relevador anula su propia lectura', 'ok', pg_temp.intentar($q$SELECT public.anular_relevamiento(pg_temp.rid('dddddddd-0000-4000-8000-000000000001'))$q$));
SELECT pg_temp.chk('al anular la primera, figura la siguiente', 'Relevador 2/1', pg_temp.quien('B-1'));
SELECT pg_temp.chk('anular dos veces no falla', 'ok', pg_temp.intentar($q$SELECT public.anular_relevamiento(pg_temp.rid('dddddddd-0000-4000-8000-000000000001'))$q$));
SELECT pg_temp.chk('el conteo de la lista de jornadas ignora lo anulado', '2',
  (SELECT "encontrados"::text FROM public.listar_jornadas(NULL, (SELECT id FROM pg_temp.jj WHERE n=1))));
SELECT pg_temp.chk('anular un relevamiento que no existe falla', 'P0002', pg_temp.intentar($q$SELECT public.anular_relevamiento('no-existe')$q$));
RESET ROLE;

-- Un administrador puede anular la lectura de otra persona; queda quién y cuándo.
SELECT set_config('request.jwt.claims', '{"sub":"ffffffff-0000-0000-0000-000000000001","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.chk('un administrador anula la lectura de otro', 'ok', pg_temp.intentar($q$SELECT public.anular_relevamiento(pg_temp.rid('dddddddd-0000-4000-8000-000000000002'))$q$));
RESET ROLE;
SELECT pg_temp.chk('queda registrado quién la anuló', 'T-ADM',
  (SELECT "anuladoPor" FROM public."relevamiento" WHERE "idCliente" = 'dddddddd-0000-4000-8000-000000000002'));
SELECT pg_temp.chk('queda el evento de auditoría', '2',
  (SELECT count(*)::text FROM public."evento_auditoria" WHERE "tipo" = 'RELEVAMIENTO_ANULADO'));

-- Con la jornada cerrada ya no se deshace nada.
SELECT set_config('request.jwt.claims', '{"sub":"ffffffff-0000-0000-0000-000000000001","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
SELECT public.cerrar_jornada((SELECT id FROM pg_temp.jj WHERE n=1));
RESET ROLE;
SELECT set_config('request.jwt.claims', '{"sub":"ffffffff-0000-0000-0000-000000000003","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.chk('en una jornada cerrada no se anula', '22023', pg_temp.intentar($q$SELECT public.anular_relevamiento(pg_temp.rid('dddddddd-0000-4000-8000-000000000003'))$q$));
RESET ROLE;

SELECT prueba, ok, detalle FROM pg_temp.resultado ORDER BY ctid;
ROLLBACK;
