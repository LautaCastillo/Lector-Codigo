-- Pruebas de los sectores de una jornada (tomar_sector, soltar_sector). Termina con ROLLBACK; todas deben dar true.
BEGIN;
CREATE TEMP TABLE resultado (prueba text, ok boolean, detalle text);
GRANT ALL ON TABLE resultado TO PUBLIC;
CREATE TEMP TABLE jj (n int, id text);
GRANT ALL ON TABLE jj TO PUBLIC;
CREATE FUNCTION pg_temp.intentar(p text) RETURNS text LANGUAGE plpgsql AS $f$
BEGIN EXECUTE p; RETURN 'ok'; EXCEPTION WHEN OTHERS THEN RETURN SQLSTATE; END $f$;
CREATE FUNCTION pg_temp.chk(p text, esperado text, obtenido text) RETURNS void LANGUAGE sql AS $f$
INSERT INTO pg_temp.resultado VALUES (p, esperado = obtenido, 'esperado ' || esperado || ', obtenido ' || coalesce(obtenido, 'NULL')) $f$;
CREATE FUNCTION pg_temp.mensaje(p text) RETURNS text LANGUAGE plpgsql AS $f$
BEGIN EXECUTE p; RETURN 'ok'; EXCEPTION WHEN OTHERS THEN RETURN SQLERRM; END $f$;
GRANT EXECUTE ON FUNCTION pg_temp.intentar(text), pg_temp.mensaje(text), pg_temp.chk(text, text, text) TO PUBLIC;
CREATE FUNCTION pg_temp.jid(k int) RETURNS text LANGUAGE sql SECURITY DEFINER AS $f$ SELECT id FROM pg_temp.jj WHERE n = k $f$;
GRANT EXECUTE ON FUNCTION pg_temp.jid(int) TO PUBLIC;
-- Quién tiene cada sector hoy de la jornada 1, como "ubicacion:persona" ordenado (sin pasar por la seguridad de filas).
CREATE FUNCTION pg_temp.duenos() RETURNS text LANGUAGE sql SECURITY DEFINER AS $f$
SELECT coalesce(string_agg("ubicacion" || ':' || "usuarioId", ',' ORDER BY "ubicacion"), '-') FROM public."sector_jornada" WHERE "jornadaId" = pg_temp.jid(1) AND "liberadoEn" IS NULL $f$;
CREATE FUNCTION pg_temp.historial() RETURNS text LANGUAGE sql SECURITY DEFINER AS $f$
SELECT count(*)::text FROM public."sector_jornada" $f$;
GRANT EXECUTE ON FUNCTION pg_temp.duenos(), pg_temp.historial() TO PUBLIC;

INSERT INTO public."usuario" ("id", "cuenta", "nombre", "rol", "estado", "authId") VALUES
  ('T-ADM', 'adm@prueba', 'Admin', 'administrador', 'activa', 'ffffffff-0000-0000-0000-000000000001'),
  ('T-R1', 'r1@prueba', 'Relevador 1', 'relevador', 'activa', 'ffffffff-0000-0000-0000-000000000002'),
  ('T-R2', 'r2@prueba', 'Relevador 2', 'relevador', 'activa', 'ffffffff-0000-0000-0000-000000000003'),
  ('T-R3', 'r3@prueba', 'Relevador 3', 'relevador', 'activa', 'ffffffff-0000-0000-0000-000000000005'),
  ('T-SU', 'su@prueba', 'Suspendida', 'relevador', 'suspendida', 'ffffffff-0000-0000-0000-000000000004');
INSERT INTO public."bien" ("id", "numeroInventario", "descripcion", "ubicacionFisica", "areaResponsable") VALUES
  ('B-1', '99991001', 'Silla A', 'Oficina 1', '9-9 Área de prueba'),
  ('B-2', '99991002', 'Silla B', 'Oficina 1', '9-9 Área de prueba'),
  ('B-3', '99991003', 'Silla C', 'Oficina 2', '9-9 Área de prueba'),
  ('B-4', '99991004', 'Silla D', 'Oficina 9', '9-8 Otra área de prueba');

-- R1 abre la jornada del área (1) y otra de una ubicación (2).
SELECT set_config('request.jwt.claims', '{"sub":"ffffffff-0000-0000-0000-000000000002","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
INSERT INTO pg_temp.jj SELECT 1, public.crear_jornada('area', '9-9 Área de prueba');
INSERT INTO pg_temp.jj SELECT 2, public.crear_jornada('ubicacion', 'Oficina 1');
SELECT pg_temp.chk('R1 toma un sector', 'ok', pg_temp.intentar($q$SELECT public.tomar_sector(pg_temp.jid(1), 'Oficina 1')$q$));
SELECT pg_temp.chk('tomar el propio sector otra vez no hace nada', 'ok', pg_temp.intentar($q$SELECT public.tomar_sector(pg_temp.jid(1), 'Oficina 1')$q$));
RESET ROLE;
SELECT pg_temp.chk('queda tomado por R1, una sola vez', 'Oficina 1:T-R1/1', pg_temp.duenos() || '/' || pg_temp.historial());

-- R2: no puede tomar el de R1, sí otro; ubicaciones que no son del área; jornadas que no se dividen.
SELECT set_config('request.jwt.claims', '{"sub":"ffffffff-0000-0000-0000-000000000003","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.chk('un sector ya tomado por otra persona no se toma', '23505', pg_temp.intentar($q$SELECT public.tomar_sector(pg_temp.jid(1), 'Oficina 1')$q$));
SELECT pg_temp.chk('el mensaje dice quién lo tiene', 'Ese sector ya lo tiene Relevador 1', pg_temp.mensaje($q$SELECT public.tomar_sector(pg_temp.jid(1), 'Oficina 1')$q$));
SELECT pg_temp.chk('R2 toma otro sector del área', 'ok', pg_temp.intentar($q$SELECT public.tomar_sector(pg_temp.jid(1), 'Oficina 2')$q$));
SELECT pg_temp.chk('una ubicación de otra área se rechaza', 'P0002', pg_temp.intentar($q$SELECT public.tomar_sector(pg_temp.jid(1), 'Oficina 9')$q$));
SELECT pg_temp.chk('una ubicación que no existe se rechaza', 'P0002', pg_temp.intentar($q$SELECT public.tomar_sector(pg_temp.jid(1), 'No existe')$q$));
SELECT pg_temp.chk('una jornada de ubicación no se divide en sectores', '22023', pg_temp.intentar($q$SELECT public.tomar_sector(pg_temp.jid(2), 'Oficina 1')$q$));
SELECT pg_temp.chk('una jornada que no existe se rechaza', 'P0002', pg_temp.intentar($q$SELECT public.tomar_sector('NO-EXISTE', 'Oficina 1')$q$));
RESET ROLE;
SELECT pg_temp.chk('cada sector, con su dueño', 'Oficina 1:T-R1,Oficina 2:T-R2', pg_temp.duenos());

-- Quién puede soltar.
SELECT set_config('request.jwt.claims', '{"sub":"ffffffff-0000-0000-0000-000000000005","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.chk('quien no lo tiene, no abrió la jornada y no es administrador no suelta', '42501', pg_temp.intentar($q$SELECT public.soltar_sector(pg_temp.jid(1), 'Oficina 1')$q$));
SELECT pg_temp.chk('soltar un sector que nadie tiene no hace nada', 'ok', pg_temp.intentar($q$SELECT public.soltar_sector(pg_temp.jid(1), 'Oficina 7')$q$));
RESET ROLE;
SELECT set_config('request.jwt.claims', '{"sub":"ffffffff-0000-0000-0000-000000000003","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.chk('quien lo tiene lo suelta', 'ok', pg_temp.intentar($q$SELECT public.soltar_sector(pg_temp.jid(1), 'Oficina 2')$q$));
RESET ROLE;
SELECT pg_temp.chk('el sector queda libre y en el historial', 'Oficina 1:T-R1/2', pg_temp.duenos() || '/' || pg_temp.historial());
-- R3 toma el sector que quedó libre; quien abrió la jornada (R1) se lo puede sacar.
SELECT set_config('request.jwt.claims', '{"sub":"ffffffff-0000-0000-0000-000000000005","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
SELECT public.tomar_sector(pg_temp.jid(1), 'Oficina 2');
RESET ROLE;
SELECT set_config('request.jwt.claims', '{"sub":"ffffffff-0000-0000-0000-000000000002","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.chk('quien abrió la jornada suelta el sector de otra persona', 'ok', pg_temp.intentar($q$SELECT public.soltar_sector(pg_temp.jid(1), 'Oficina 2')$q$));
RESET ROLE;
SELECT pg_temp.chk('queda libre', 'Oficina 1:T-R1', pg_temp.duenos());
-- Un administrador suelta el de R1.
SELECT set_config('request.jwt.claims', '{"sub":"ffffffff-0000-0000-0000-000000000001","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.chk('un administrador suelta el sector de cualquiera', 'ok', pg_temp.intentar($q$SELECT public.soltar_sector(pg_temp.jid(1), 'Oficina 1')$q$));
RESET ROLE;
SELECT pg_temp.chk('no queda ninguno', '-', pg_temp.duenos());

-- Lectura y escritura de la tabla; cuentas sin permiso.
SELECT set_config('request.jwt.claims', '{"sub":"ffffffff-0000-0000-0000-000000000005","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
SELECT public.tomar_sector(pg_temp.jid(1), 'Oficina 1');
SELECT pg_temp.chk('cualquier cuenta activa ve los sectores', 'true', (SELECT (count(*) >= 3)::text FROM public."sector_jornada"));
SELECT pg_temp.chk('nadie escribe directo en la tabla', '42501',
  pg_temp.intentar($q$INSERT INTO public."sector_jornada" ("jornadaId","ubicacion","usuarioId") VALUES (pg_temp.jid(1),'Oficina 2','T-R3')$q$));
SELECT pg_temp.chk('ni modifica una fila', '42501', pg_temp.intentar($q$UPDATE public."sector_jornada" SET "usuarioId" = 'T-R3'$q$));
RESET ROLE;
SET LOCAL ROLE anon;
SELECT pg_temp.chk('anon no toma sectores', '42501', pg_temp.intentar($q$SELECT public.tomar_sector(pg_temp.jid(1), 'Oficina 2')$q$));
RESET ROLE;
SELECT set_config('request.jwt.claims', '{"sub":"ffffffff-0000-0000-0000-000000000004","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.chk('una cuenta suspendida no toma sectores', '42501', pg_temp.intentar($q$SELECT public.tomar_sector(pg_temp.jid(1), 'Oficina 2')$q$));
SELECT pg_temp.chk('ni los ve', '0', (SELECT count(*)::text FROM public."sector_jornada"));
RESET ROLE;

-- Con la jornada cerrada ya no se toman sectores.
SELECT set_config('request.jwt.claims', '{"sub":"ffffffff-0000-0000-0000-000000000002","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
SELECT public.cerrar_jornada(pg_temp.jid(1));
SELECT pg_temp.chk('en una jornada cerrada no se toman sectores', '22023', pg_temp.intentar($q$SELECT public.tomar_sector(pg_temp.jid(1), 'Oficina 2')$q$));
RESET ROLE;
SELECT pg_temp.chk('quedan los eventos de auditoría', '4/3',
  (SELECT count(*) FILTER (WHERE "tipo" = 'SECTOR_TOMADO')::text || '/' || count(*) FILTER (WHERE "tipo" = 'SECTOR_LIBERADO')::text FROM public."evento_auditoria"));

SELECT prueba, ok, detalle FROM pg_temp.resultado ORDER BY ctid;
ROLLBACK;
