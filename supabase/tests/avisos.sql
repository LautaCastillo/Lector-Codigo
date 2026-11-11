-- Pruebas de los avisos (disparadores de jornada, discrepancia y tarea; marcar_avisos_leidos). Termina con ROLLBACK; todas deben dar true.
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
CREATE FUNCTION pg_temp.jid() RETURNS text LANGUAGE sql SECURITY DEFINER AS $f$ SELECT id FROM pg_temp.jj WHERE n = 1 $f$;
-- Los avisos de una persona (sin pasar por la seguridad de filas), como "tipo,tipo,...", ordenados; y el id de uno de ellos.
CREATE FUNCTION pg_temp.de(u text) RETURNS text LANGUAGE sql SECURITY DEFINER AS $f$
SELECT coalesce(string_agg("tipo", ',' ORDER BY "tipo"), '-') FROM public."aviso" WHERE "usuarioId" = u $f$;
CREATE FUNCTION pg_temp.uno_de(u text) RETURNS text LANGUAGE sql SECURITY DEFINER AS $f$
SELECT "id" FROM public."aviso" WHERE "usuarioId" = u ORDER BY "creadoEn", "tipo" LIMIT 1 $f$;
CREATE FUNCTION pg_temp.sin_leer(u text) RETURNS text LANGUAGE sql SECURITY DEFINER AS $f$
SELECT count(*)::text FROM public."aviso" WHERE "usuarioId" = u AND "leidoEn" IS NULL $f$;
GRANT EXECUTE ON FUNCTION pg_temp.jid(), pg_temp.de(text), pg_temp.uno_de(text), pg_temp.sin_leer(text) TO PUBLIC;

INSERT INTO public."usuario" ("id", "cuenta", "nombre", "rol", "estado", "authId") VALUES
  ('T-ADM', 'adm@prueba', 'Admin', 'administrador', 'activa', 'ffffffff-0000-0000-0000-000000000001'),
  ('T-R1', 'r1@prueba', 'Relevador 1', 'relevador', 'activa', 'ffffffff-0000-0000-0000-000000000002'),
  ('T-R2', 'r2@prueba', 'Relevador 2', 'relevador', 'activa', 'ffffffff-0000-0000-0000-000000000003'),
  ('T-SU', 'su@prueba', 'Suspendida', 'administrador', 'suspendida', 'ffffffff-0000-0000-0000-000000000004'),
  ('T-R3', 'r3@prueba', 'Relevador 3', 'relevador', 'activa', 'ffffffff-0000-0000-0000-000000000005'),
  ('T-R4', 'r4@prueba', 'Relevador 4', 'relevador', 'activa', 'ffffffff-0000-0000-0000-000000000006');
INSERT INTO public."bien" ("id", "numeroInventario", "descripcion", "ubicacionFisica", "areaResponsable") VALUES
  ('B-1', '99991001', 'Silla A', 'Oficina 1', '9-9 Área de prueba'),
  ('B-2', '99991002', 'Silla B', 'Oficina 1', '9-9 Área de prueba');

-- El administrador le asigna a R3 una tarea del área, y a sí mismo otra (esa no avisa).
SELECT set_config('request.jwt.claims', '{"sub":"ffffffff-0000-0000-0000-000000000001","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
SELECT public.asignar_tarea('area', '9-9 Área de prueba', 'T-R3', current_date + 2, NULL);
SELECT public.asignar_tarea('area', '9-9 Área de prueba', 'T-ADM', current_date + 2, NULL);
RESET ROLE;
SELECT pg_temp.chk('la persona a quien se asigna una tarea recibe el aviso', 'tarea_asignada', pg_temp.de('T-R3'));
SELECT pg_temp.chk('quien se la asigna a sí mismo no recibe aviso', '-', pg_temp.de('T-ADM'));

-- R1 abre la jornada del área (y otra vez, que se suma a la misma).
SELECT set_config('request.jwt.claims', '{"sub":"ffffffff-0000-0000-0000-000000000002","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
INSERT INTO pg_temp.jj SELECT 1, public.crear_jornada('area', '9-9 Área de prueba');
SELECT public.crear_jornada('area', '9-9 Área de prueba');
RESET ROLE;
SELECT pg_temp.chk('al abrirse una jornada se avisa a los administradores', 'jornada_abierta', pg_temp.de('T-ADM'));
SELECT pg_temp.chk('y a quien tiene una tarea pendiente de ese alcance', 'jornada_abierta,tarea_asignada', pg_temp.de('T-R3'));
SELECT pg_temp.chk('no a quien la abrió', '-', pg_temp.de('T-R1'));
SELECT pg_temp.chk('ni a quien no tiene que ver', '-', pg_temp.de('T-R4'));
SELECT pg_temp.chk('ni a una cuenta suspendida', '-', pg_temp.de('T-SU'));
SELECT pg_temp.chk('sumarse a la jornada abierta no repite el aviso', '1',
  (SELECT count(*)::text FROM public."aviso" WHERE "tipo" = 'jornada_abierta' AND "usuarioId" = 'T-ADM'));

-- Lecturas: R1 abre con B-1 y B-2 en Oficina 1; R2 ve B-1 en Oficina 2 (discrepancia) y B-2 en el mismo lugar (no).
SELECT set_config('request.jwt.claims', '{"sub":"ffffffff-0000-0000-0000-000000000002","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
INSERT INTO public."relevamiento" ("idCliente","usuarioId","bienId","resultado","ubicacionObservada","relevadoEnDispositivo","jornadaId") VALUES
  ('eeeeeeee-0000-4000-8000-000000000001','T-R1','B-1','encontrado','Oficina 1',now(),pg_temp.jid()),
  ('eeeeeeee-0000-4000-8000-000000000002','T-R1','B-2','encontrado','Oficina 1',now(),pg_temp.jid());
RESET ROLE;
SELECT pg_temp.chk('la primera lectura de un bien no avisa nada', '0', (SELECT count(*)::text FROM public."aviso" WHERE "tipo" = 'discrepancia'));
SELECT set_config('request.jwt.claims', '{"sub":"ffffffff-0000-0000-0000-000000000003","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
INSERT INTO public."relevamiento" ("idCliente","usuarioId","bienId","resultado","ubicacionObservada","relevadoEnDispositivo","jornadaId") VALUES
  ('eeeeeeee-0000-4000-8000-000000000011','T-R2','B-1','encontrado','Oficina 2',now(),pg_temp.jid()),
  ('eeeeeeee-0000-4000-8000-000000000012','T-R2','B-2','encontrado','Oficina 1',now(),pg_temp.jid());
RESET ROLE;
SELECT pg_temp.chk('una lectura que no coincide avisa a quien abrió la jornada', 'discrepancia', pg_temp.de('T-R1'));
SELECT pg_temp.chk('y a los administradores', 'discrepancia,jornada_abierta', pg_temp.de('T-ADM'));
SELECT pg_temp.chk('no a quien hizo la lectura', '-', pg_temp.de('T-R2'));
SELECT pg_temp.chk('si las dos lecturas coinciden no hay aviso', '0', (SELECT count(*)::text FROM public."aviso" WHERE "tipo" = 'discrepancia' AND "bienId" = 'B-2'));
-- Una tercera lectura distinta del mismo bien no repite el aviso.
SELECT set_config('request.jwt.claims', '{"sub":"ffffffff-0000-0000-0000-000000000006","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
INSERT INTO public."relevamiento" ("idCliente","usuarioId","bienId","resultado","ubicacionObservada","relevadoEnDispositivo","jornadaId") VALUES
  ('eeeeeeee-0000-4000-8000-000000000021','T-R4','B-1','encontrado','Oficina 3',now(),pg_temp.jid());
RESET ROLE;
SELECT pg_temp.chk('el aviso de discrepancia de un bien no se repite', '1',
  (SELECT count(*)::text FROM public."aviso" WHERE "tipo" = 'discrepancia' AND "bienId" = 'B-1' AND "usuarioId" = 'T-ADM'));

-- R1 cierra la jornada: se avisa a quienes relevaron, a los administradores y a quien tenía la tarea; no a quien la cerró.
SELECT set_config('request.jwt.claims', '{"sub":"ffffffff-0000-0000-0000-000000000002","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
SELECT public.cerrar_jornada(pg_temp.jid());
RESET ROLE;
SELECT pg_temp.chk('al cerrarse se avisa a los administradores', 'discrepancia,jornada_abierta,jornada_cerrada', pg_temp.de('T-ADM'));
SELECT pg_temp.chk('a quien relevó en la jornada', 'jornada_cerrada', pg_temp.de('T-R2'));
SELECT pg_temp.chk('también a quien relevó sin haberla abierto', 'jornada_cerrada', pg_temp.de('T-R4'));
SELECT pg_temp.chk('y a quien tenía la tarea', 'jornada_abierta,jornada_cerrada,tarea_asignada', pg_temp.de('T-R3'));
SELECT pg_temp.chk('no a quien la cerró', 'discrepancia', pg_temp.de('T-R1'));
SELECT pg_temp.chk('ni a una cuenta suspendida', '-', pg_temp.de('T-SU'));

-- Quién ve qué y quién escribe.
SELECT set_config('request.jwt.claims', '{"sub":"ffffffff-0000-0000-0000-000000000005","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.chk('cada persona ve solo sus avisos', '3', (SELECT count(*)::text FROM public."aviso"));
SELECT pg_temp.chk('nadie escribe directo en la tabla', '42501',
  pg_temp.intentar($q$INSERT INTO public."aviso" ("usuarioId","tipo","titulo","clave") VALUES ('T-R3','discrepancia','x','x')$q$));
SELECT pg_temp.chk('ni modifica un aviso', '42501', pg_temp.intentar($q$UPDATE public."aviso" SET "leidoEn" = now()$q$));
SELECT pg_temp.chk('ni borra uno', '42501', pg_temp.intentar($q$DELETE FROM public."aviso"$q$));
RESET ROLE;
SET LOCAL ROLE anon;
SELECT pg_temp.chk('anon no ve avisos', '42501', pg_temp.intentar($q$SELECT count(*) FROM public."aviso"$q$));
SELECT pg_temp.chk('anon no marca avisos', '42501', pg_temp.intentar($q$SELECT public.marcar_avisos_leidos()$q$));
RESET ROLE;
SELECT set_config('request.jwt.claims', '{"sub":"ffffffff-0000-0000-0000-000000000004","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.chk('una cuenta suspendida no ve avisos', '0', (SELECT count(*)::text FROM public."aviso"));
SELECT pg_temp.chk('ni marca avisos', '42501', pg_temp.intentar($q$SELECT public.marcar_avisos_leidos()$q$));
RESET ROLE;

-- Marcar como leídos: solo los propios.
SELECT set_config('request.jwt.claims', '{"sub":"ffffffff-0000-0000-0000-000000000003","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.chk('no se marcan los avisos de otra persona', '0', public.marcar_avisos_leidos(ARRAY[pg_temp.uno_de('T-R3')])::text);
RESET ROLE;
SELECT pg_temp.chk('y siguen sin leer', '3', pg_temp.sin_leer('T-R3'));
SELECT set_config('request.jwt.claims', '{"sub":"ffffffff-0000-0000-0000-000000000005","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.chk('uno solo, indicándolo', '1', public.marcar_avisos_leidos(ARRAY[pg_temp.uno_de('T-R3')])::text);
SELECT pg_temp.chk('todos los que quedan, sin indicar cuáles', '2', public.marcar_avisos_leidos()::text);
SELECT pg_temp.chk('repetirlo no marca nada', '0', public.marcar_avisos_leidos()::text);
RESET ROLE;
SELECT pg_temp.chk('quedan todos leídos', '0/1', pg_temp.sin_leer('T-R3') || '/' || pg_temp.sin_leer('T-R2'));

SELECT prueba, ok, detalle FROM pg_temp.resultado ORDER BY ctid;
ROLLBACK;
