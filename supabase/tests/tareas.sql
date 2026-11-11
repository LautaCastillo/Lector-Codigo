-- Pruebas de las tareas (asignar_tarea, iniciar_tarea, terminar_tarea, cancelar_tarea) y de quién las ve. Termina con ROLLBACK; todas deben dar true.
BEGIN;
CREATE TEMP TABLE resultado (prueba text, ok boolean, detalle text);
GRANT ALL ON TABLE resultado TO PUBLIC;
CREATE TEMP TABLE tt (n int, id text);
GRANT ALL ON TABLE tt TO PUBLIC;
CREATE FUNCTION pg_temp.intentar(p text) RETURNS text LANGUAGE plpgsql AS $f$
BEGIN EXECUTE p; RETURN 'ok'; EXCEPTION WHEN OTHERS THEN RETURN SQLSTATE; END $f$;
CREATE FUNCTION pg_temp.chk(p text, esperado text, obtenido text) RETURNS void LANGUAGE sql AS $f$
INSERT INTO pg_temp.resultado VALUES (p, esperado = obtenido, 'esperado ' || esperado || ', obtenido ' || coalesce(obtenido, 'NULL')) $f$;
GRANT EXECUTE ON FUNCTION pg_temp.intentar(text), pg_temp.chk(text, text, text) TO PUBLIC;
CREATE FUNCTION pg_temp.tid(k int) RETURNS text LANGUAGE sql SECURITY DEFINER AS $f$ SELECT id FROM pg_temp.tt WHERE n = k $f$;
GRANT EXECUTE ON FUNCTION pg_temp.tid(int) TO PUBLIC;
CREATE FUNCTION pg_temp.estado(k int) RETURNS text LANGUAGE sql SECURITY DEFINER AS $f$ SELECT "estado" FROM public."tarea" WHERE "id" = pg_temp.tid(k) $f$;
GRANT EXECUTE ON FUNCTION pg_temp.estado(int) TO PUBLIC;

INSERT INTO public."usuario" ("id", "cuenta", "nombre", "rol", "estado", "authId") VALUES
  ('T-ADM', 'adm@prueba', 'Admin', 'administrador', 'activa', 'ffffffff-0000-0000-0000-000000000001'),
  ('T-R1', 'r1@prueba', 'Relevador 1', 'relevador', 'activa', 'ffffffff-0000-0000-0000-000000000002'),
  ('T-R2', 'r2@prueba', 'Relevador 2', 'relevador', 'activa', 'ffffffff-0000-0000-0000-000000000003'),
  ('T-SU', 'su@prueba', 'Suspendida', 'relevador', 'suspendida', 'ffffffff-0000-0000-0000-000000000004');
INSERT INTO public."bien" ("id", "numeroInventario", "descripcion", "ubicacionFisica", "areaResponsable") VALUES
  ('B-1', '99991001', 'Silla A', 'Oficina 1', '9-9 Área de prueba');

-- Quién puede asignar.
SELECT set_config('request.jwt.claims', '{"sub":"ffffffff-0000-0000-0000-000000000002","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.chk('un relevador no asigna tareas', '42501', pg_temp.intentar($q$SELECT public.asignar_tarea('area', '9-9 Área de prueba', 'T-R1', current_date, NULL)$q$));
RESET ROLE;
SET LOCAL ROLE anon;
SELECT pg_temp.chk('anon no asigna tareas', '42501', pg_temp.intentar($q$SELECT public.asignar_tarea('area', '9-9 Área de prueba', 'T-R1', current_date, NULL)$q$));
RESET ROLE;

-- El administrador asigna: validaciones y alta.
SELECT set_config('request.jwt.claims', '{"sub":"ffffffff-0000-0000-0000-000000000001","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.chk('un tipo inválido se rechaza', '22023', pg_temp.intentar($q$SELECT public.asignar_tarea('piso', '9-9 Área de prueba', 'T-R1', current_date, NULL)$q$));
SELECT pg_temp.chk('sin fecha se rechaza', '22023', pg_temp.intentar($q$SELECT public.asignar_tarea('area', '9-9 Área de prueba', 'T-R1', NULL, NULL)$q$));
SELECT pg_temp.chk('un área sin bienes se rechaza', 'P0002', pg_temp.intentar($q$SELECT public.asignar_tarea('area', 'Área que no existe', 'T-R1', current_date, NULL)$q$));
SELECT pg_temp.chk('una cuenta suspendida no puede recibir tareas', '22023', pg_temp.intentar($q$SELECT public.asignar_tarea('area', '9-9 Área de prueba', 'T-SU', current_date, NULL)$q$));
SELECT pg_temp.chk('una persona que no existe se rechaza', '22023', pg_temp.intentar($q$SELECT public.asignar_tarea('area', '9-9 Área de prueba', 'NO-EXISTE', current_date, NULL)$q$));
INSERT INTO pg_temp.tt SELECT 1, public.asignar_tarea('area', '9-9 Área de prueba', 'T-R1', current_date + 3, '  Revisar con cuidado  ');
INSERT INTO pg_temp.tt SELECT 2, public.asignar_tarea('ubicacion', 'Oficina 1', 'T-R2', current_date + 5, NULL);
INSERT INTO pg_temp.tt SELECT 3, public.asignar_tarea('area', '9-9 Área de prueba', 'T-R1', current_date + 9, NULL);
SELECT pg_temp.chk('la tarea queda pendiente, con su nota recortada y quien la creó', 'pendiente/Revisar con cuidado/T-ADM',
  (SELECT "estado" || '/' || "nota" || '/' || "creadaPor" FROM public."tarea" WHERE "id" = pg_temp.tid(1)));
SELECT pg_temp.chk('el administrador ve todas las tareas', '3', (SELECT count(*)::text FROM public."tarea"));
RESET ROLE;

-- Quién ve qué.
SELECT set_config('request.jwt.claims', '{"sub":"ffffffff-0000-0000-0000-000000000002","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.chk('cada persona ve solo sus tareas', '2', (SELECT count(*)::text FROM public."tarea"));
SELECT pg_temp.chk('y no escribe directo en la tabla', '42501',
  pg_temp.intentar($q$INSERT INTO public."tarea" ("tipo","alcance","asignadaA","fechaPrevista","creadaPor") VALUES ('area','x','T-R1',current_date,'T-R1')$q$));
SELECT pg_temp.chk('ni modifica una tarea', '42501', pg_temp.intentar($q$UPDATE public."tarea" SET "estado" = 'hecha'$q$));
RESET ROLE;
SELECT set_config('request.jwt.claims', '{"sub":"ffffffff-0000-0000-0000-000000000003","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.chk('la otra persona ve la suya', '1', (SELECT count(*)::text FROM public."tarea"));
RESET ROLE;
SELECT set_config('request.jwt.claims', '{"sub":"ffffffff-0000-0000-0000-000000000004","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.chk('una cuenta suspendida no ve ninguna', '0', (SELECT count(*)::text FROM public."tarea"));
RESET ROLE;

-- Empezar una tarea: solo quien la tiene asignada.
SELECT set_config('request.jwt.claims', '{"sub":"ffffffff-0000-0000-0000-000000000003","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.chk('no se empieza una tarea ajena', '42501', pg_temp.intentar($q$SELECT public.iniciar_tarea(pg_temp.tid(1))$q$));
RESET ROLE;
SELECT set_config('request.jwt.claims', '{"sub":"ffffffff-0000-0000-0000-000000000002","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
INSERT INTO pg_temp.tt SELECT 9, public.iniciar_tarea(pg_temp.tid(1));
SELECT pg_temp.chk('quien la tiene asignada la empieza y obtiene la jornada del área', 'true',
  (SELECT (j."tipo" = 'area' AND j."alcance" = '9-9 Área de prueba' AND j."estado" = 'abierta')::text FROM public.listar_jornadas(NULL, pg_temp.tid(9)) j));
SELECT pg_temp.chk('la tarea queda vinculada a esa jornada', 'true', (SELECT ("jornadaId" IS NOT NULL)::text FROM public."tarea" WHERE "id" = pg_temp.tid(1)));
SELECT pg_temp.chk('empezarla de nuevo devuelve la misma jornada', 'true',
  (pg_temp.tid(9) = public.iniciar_tarea(pg_temp.tid(1)))::text);
SELECT pg_temp.chk('una tarea que no existe se rechaza', 'P0002', pg_temp.intentar($q$SELECT public.iniciar_tarea('NO-EXISTE')$q$));
-- Terminar.
SELECT pg_temp.chk('quien la tiene la termina', 'ok', pg_temp.intentar($q$SELECT public.terminar_tarea(pg_temp.tid(1))$q$));
RESET ROLE;
SELECT pg_temp.chk('queda hecha, con quién y cuándo', 'hecha/T-R1/true', (SELECT "estado" || '/' || "resueltaPor" || '/' || ("resueltaEn" IS NOT NULL)::text FROM public."tarea" WHERE "id" = pg_temp.tid(1)));
SELECT set_config('request.jwt.claims', '{"sub":"ffffffff-0000-0000-0000-000000000002","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.chk('terminarla de nuevo no falla', 'ok', pg_temp.intentar($q$SELECT public.terminar_tarea(pg_temp.tid(1))$q$));
SELECT pg_temp.chk('una tarea hecha ya no se empieza', '22023', pg_temp.intentar($q$SELECT public.iniciar_tarea(pg_temp.tid(1))$q$));
SELECT pg_temp.chk('un relevador no termina la tarea de otro', '42501', pg_temp.intentar($q$SELECT public.terminar_tarea(pg_temp.tid(2))$q$));
SELECT pg_temp.chk('un relevador no cancela tareas', '42501', pg_temp.intentar($q$SELECT public.cancelar_tarea(pg_temp.tid(3))$q$));
RESET ROLE;

-- El administrador cancela y también puede terminar la de otro.
SELECT set_config('request.jwt.claims', '{"sub":"ffffffff-0000-0000-0000-000000000001","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.chk('el administrador cancela una tarea pendiente', 'ok', pg_temp.intentar($q$SELECT public.cancelar_tarea(pg_temp.tid(3))$q$));
SELECT pg_temp.chk('cancelarla de nuevo no falla', 'ok', pg_temp.intentar($q$SELECT public.cancelar_tarea(pg_temp.tid(3))$q$));
SELECT pg_temp.chk('una tarea cancelada no se puede terminar', '22023', pg_temp.intentar($q$SELECT public.terminar_tarea(pg_temp.tid(3))$q$));
SELECT pg_temp.chk('una tarea hecha no se puede cancelar', '22023', pg_temp.intentar($q$SELECT public.cancelar_tarea(pg_temp.tid(1))$q$));
SELECT pg_temp.chk('el administrador termina la tarea de otra persona', 'ok', pg_temp.intentar($q$SELECT public.terminar_tarea(pg_temp.tid(2))$q$));
RESET ROLE;
SELECT pg_temp.chk('los estados finales', 'hecha/hecha/cancelada', pg_temp.estado(1) || '/' || pg_temp.estado(2) || '/' || pg_temp.estado(3));
SELECT pg_temp.chk('quedan los eventos de auditoría', '3/1/2/1',
  (SELECT count(*) FILTER (WHERE "tipo" = 'TAREA_ASIGNADA')::text || '/' || count(*) FILTER (WHERE "tipo" = 'TAREA_INICIADA')::text || '/' || count(*) FILTER (WHERE "tipo" = 'TAREA_TERMINADA')::text || '/' || count(*) FILTER (WHERE "tipo" = 'TAREA_CANCELADA')::text FROM public."evento_auditoria"));

SELECT prueba, ok, detalle FROM pg_temp.resultado ORDER BY ctid;
ROLLBACK;
