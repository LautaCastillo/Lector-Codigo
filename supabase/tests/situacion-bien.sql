-- Pruebas de la situación del bien (declarar_situacion, levantar_situacion) y de cómo la ven las jornadas. Termina con ROLLBACK; todas deben dar true.
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
  ('T-SU', 'su@prueba', 'Suspendida', 'administrador', 'suspendida', 'ffffffff-0000-0000-0000-000000000004');
INSERT INTO public."bien" ("id", "numeroInventario", "descripcion", "ubicacionFisica", "areaResponsable") VALUES
  ('B-1', '99991001', 'Silla A', 'Oficina 1', '9-9 Área de prueba'),
  ('B-2', '99991002', 'Silla B', 'Oficina 1', '9-9 Área de prueba'),
  ('B-3', '99991003', 'Silla C', 'Oficina 1', '9-9 Área de prueba');

CREATE FUNCTION pg_temp.jid() RETURNS text LANGUAGE sql SECURITY DEFINER AS $f$ SELECT id FROM pg_temp.jj WHERE n = 1 $f$;
GRANT EXECUTE ON FUNCTION pg_temp.jid() TO PUBLIC;
-- "esperados/encontrados" que muestra la lista de jornadas y la situación que muestra el avance, de un bien.
CREATE FUNCTION pg_temp.lista() RETURNS text LANGUAGE sql AS $f$
SELECT "esperados"::text || '/' || "encontrados"::text FROM public.listar_jornadas(NULL, pg_temp.jid()) $f$;
CREATE FUNCTION pg_temp.sit(b text) RETURNS text LANGUAGE sql AS $f$
SELECT coalesce("situacion", '-') || '/' || coalesce("motivoSituacion", '-') FROM public.avance_jornada(pg_temp.jid()) WHERE "bienId" = b $f$;
CREATE FUNCTION pg_temp.vigentes() RETURNS text LANGUAGE sql SECURITY DEFINER AS $f$
SELECT count(*)::text FROM public."situacion_bien" WHERE "levantadaEn" IS NULL $f$;
CREATE FUNCTION pg_temp.historial() RETURNS text LANGUAGE sql SECURITY DEFINER AS $f$
SELECT count(*)::text FROM public."situacion_bien" $f$;
GRANT EXECUTE ON FUNCTION pg_temp.lista(), pg_temp.sit(text), pg_temp.vigentes(), pg_temp.historial() TO PUBLIC;

-- R1 abre la jornada del área: 3 esperados.
SELECT set_config('request.jwt.claims', '{"sub":"ffffffff-0000-0000-0000-000000000002","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
INSERT INTO pg_temp.jj SELECT 1, public.crear_jornada('area', '9-9 Área de prueba');
SELECT pg_temp.chk('la jornada parte con 3 esperados y ninguno encontrado', '3/0', pg_temp.lista());
SELECT pg_temp.chk('sin situación, el avance no muestra nada', '-/-', pg_temp.sit('B-2'));

-- Quién puede declarar.
SELECT pg_temp.chk('un relevador no declara la situación de un bien', '42501', pg_temp.intentar($q$SELECT public.declarar_situacion('B-2', 'en_reparacion', 'Está en el taller')$q$));
SELECT pg_temp.chk('un relevador no levanta una situación', '42501', pg_temp.intentar($q$SELECT public.levantar_situacion('B-2')$q$));
RESET ROLE;
SET LOCAL ROLE anon;
SELECT pg_temp.chk('anon no declara', '42501', pg_temp.intentar($q$SELECT public.declarar_situacion('B-2', 'en_reparacion', 'Está en el taller')$q$));
RESET ROLE;
SELECT set_config('request.jwt.claims', '{"sub":"ffffffff-0000-0000-0000-000000000004","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.chk('una cuenta suspendida no declara', '42501', pg_temp.intentar($q$SELECT public.declarar_situacion('B-2', 'en_reparacion', 'Está en el taller')$q$));
RESET ROLE;

-- Validaciones del administrador.
SELECT set_config('request.jwt.claims', '{"sub":"ffffffff-0000-0000-0000-000000000001","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.chk('una situación desconocida se rechaza', '22023', pg_temp.intentar($q$SELECT public.declarar_situacion('B-2', 'perdido', 'No aparece nada')$q$));
SELECT pg_temp.chk('sin motivo se rechaza', '22023', pg_temp.intentar($q$SELECT public.declarar_situacion('B-2', 'en_reparacion', '  ')$q$));
SELECT pg_temp.chk('un motivo de más de 300 caracteres se rechaza', '22023', pg_temp.intentar($q$SELECT public.declarar_situacion('B-2', 'en_reparacion', repeat('x', 301))$q$));
SELECT pg_temp.chk('un bien que no existe se rechaza', 'P0002', pg_temp.intentar($q$SELECT public.declarar_situacion('NO-EXISTE', 'en_reparacion', 'Está en el taller')$q$));
SELECT pg_temp.chk('lo rechazado no deja nada', '0', pg_temp.historial());

-- Declarar: el bien sale de lo esperado y el avance lo muestra aparte.
SELECT pg_temp.chk('el administrador declara la situación', 'ok', pg_temp.intentar($q$SELECT public.declarar_situacion('B-2', 'en_reparacion', 'Está en el taller')$q$));
SELECT pg_temp.chk('el bien con situación no cuenta entre los esperados', '2/0', pg_temp.lista());
SELECT pg_temp.chk('el avance muestra la situación y el motivo', 'en_reparacion/Está en el taller', pg_temp.sit('B-2'));
SELECT pg_temp.chk('los demás bienes siguen sin situación', '-/-', pg_temp.sit('B-1'));
RESET ROLE;
SELECT pg_temp.chk('hay una sola situación vigente', '1', pg_temp.vigentes());

-- Repetir lo mismo no hace nada; cambiar la situación levanta la anterior y deja las dos en el historial.
SELECT set_config('request.jwt.claims', '{"sub":"ffffffff-0000-0000-0000-000000000001","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
SELECT public.declarar_situacion('B-2', 'en_reparacion', 'Está en el taller');
RESET ROLE;
SELECT pg_temp.chk('repetir la misma declaración no suma filas', '1', pg_temp.historial());
SET LOCAL ROLE authenticated;
SELECT public.declarar_situacion('B-2', 'para_baja', 'No tiene arreglo');
RESET ROLE;
SELECT pg_temp.chk('cambiar la situación deja dos filas en el historial', '2', pg_temp.historial());
SELECT pg_temp.chk('pero una sola vigente', '1', pg_temp.vigentes());
SELECT pg_temp.chk('la vigente es la nueva', 'para_baja/No tiene arreglo', (SELECT "situacion" || '/' || "motivo" FROM public."situacion_bien" WHERE "levantadaEn" IS NULL));
SELECT pg_temp.chk('la anterior quedó levantada con quién y motivo', 'T-ADM/Cambió la situación',
  (SELECT "levantadaPor" || '/' || "motivoLevantada" FROM public."situacion_bien" WHERE "levantadaEn" IS NOT NULL));

-- Un bien apartado que igual se encuentra cuenta como cualquier otro.
SELECT set_config('request.jwt.claims', '{"sub":"ffffffff-0000-0000-0000-000000000002","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
INSERT INTO public."relevamiento" ("idCliente","usuarioId","bienId","resultado","ubicacionObservada","relevadoEnDispositivo","jornadaId") VALUES
  ('eeeeeeee-0000-4000-8000-000000000001','T-R1','B-2','encontrado','Oficina 1',now(),pg_temp.jid());
SELECT pg_temp.chk('si se lo encuentra vuelve a contar entre los esperados', '3/1', pg_temp.lista());
SELECT pg_temp.chk('y el avance sigue mostrando su situación', 'para_baja/No tiene arreglo', pg_temp.sit('B-2'));
RESET ROLE;

-- Levantar: el bien vuelve a lo esperado. Levantar de nuevo no hace nada.
UPDATE public."relevamiento" SET "anuladoEn" = now(), "anuladoPor" = 'T-R1' WHERE "idCliente" = 'eeeeeeee-0000-4000-8000-000000000001';
SELECT set_config('request.jwt.claims', '{"sub":"ffffffff-0000-0000-0000-000000000001","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.chk('con la lectura anulada el bien vuelve a quedar apartado', '2/0', pg_temp.lista());
SELECT pg_temp.chk('el administrador levanta la situación', 'ok', pg_temp.intentar($q$SELECT public.levantar_situacion('B-2', 'Volvió del taller')$q$));
SELECT pg_temp.chk('el bien vuelve a contar entre los esperados', '3/0', pg_temp.lista());
SELECT pg_temp.chk('el avance ya no muestra situación', '-/-', pg_temp.sit('B-2'));
SELECT pg_temp.chk('levantar de nuevo no falla', 'ok', pg_temp.intentar($q$SELECT public.levantar_situacion('B-2')$q$));
RESET ROLE;
SELECT pg_temp.chk('no queda ninguna vigente', '0', pg_temp.vigentes());
SELECT pg_temp.chk('el historial conserva las dos situaciones', '2', pg_temp.historial());
SELECT pg_temp.chk('quedan los eventos de auditoría', '2/1',
  (SELECT count(*) FILTER (WHERE "tipo" = 'SITUACION_DECLARADA')::text || '/' || count(*) FILTER (WHERE "tipo" = 'SITUACION_LEVANTADA')::text FROM public."evento_auditoria"));
SELECT pg_temp.chk('y los cambios de fila de la tabla', 'true', (SELECT (count(*) >= 4)::text FROM public."cambio_fila" WHERE "tabla" = 'situacion_bien'));

-- Una jornada cerrada conserva sus números aunque después se levante la situación.
SELECT set_config('request.jwt.claims', '{"sub":"ffffffff-0000-0000-0000-000000000001","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
SELECT public.declarar_situacion('B-3', 'prestado', 'Prestado a Rectorado');
SELECT public.cerrar_jornada(pg_temp.jid());
RESET ROLE;
SELECT pg_temp.chk('el evento de cierre cuenta lo apartado', '2/1', (SELECT ("datos"->>'esperados') || '/' || ("datos"->>'apartados') FROM public."evento_auditoria" WHERE "tipo" = 'JORNADA_CERRADA' AND "entidadId" = (SELECT id FROM pg_temp.jj WHERE n = 1)));
-- Se acomodan las horas (dentro de una transacción now() no cambia): declarada hace 3 horas, jornada cerrada hace 2, situación levantada hace 1.
UPDATE public."situacion_bien" SET "declaradaEn" = now() - interval '3 hours' WHERE "bienId" = 'B-3';
UPDATE public."jornada" SET "cerradaEn" = now() - interval '2 hours' WHERE "id" = (SELECT id FROM pg_temp.jj WHERE n = 1);
SELECT set_config('request.jwt.claims', '{"sub":"ffffffff-0000-0000-0000-000000000001","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
SELECT public.levantar_situacion('B-3', 'Volvió');
RESET ROLE;
UPDATE public."situacion_bien" SET "levantadaEn" = now() - interval '1 hour' WHERE "bienId" = 'B-3';
SET LOCAL ROLE authenticated;
SELECT pg_temp.chk('la jornada cerrada sigue sin contar lo que estaba apartado al cerrarla', '2/0', pg_temp.lista());
SELECT pg_temp.chk('y el avance de la jornada cerrada muestra la situación que había', 'prestado/Prestado a Rectorado', pg_temp.sit('B-3'));
RESET ROLE;

-- Lectura de la tabla: cualquier cuenta activa la ve; nadie la escribe directo.
SELECT set_config('request.jwt.claims', '{"sub":"ffffffff-0000-0000-0000-000000000002","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.chk('una cuenta activa lee las situaciones', 'true', (SELECT (count(*) >= 1)::text FROM public."situacion_bien"));
SELECT pg_temp.chk('nadie escribe directo en la tabla', '42501',
  pg_temp.intentar($q$INSERT INTO public."situacion_bien" ("bienId","situacion","motivo","declaradaPor") VALUES ('B-1','prestado','Prestado a alguien','T-R1')$q$));
RESET ROLE;
SET LOCAL ROLE anon;
SELECT pg_temp.chk('anon no lee la tabla', '42501', pg_temp.intentar($q$SELECT count(*) FROM public."situacion_bien"$q$));
RESET ROLE;

SELECT prueba, ok, detalle FROM pg_temp.resultado ORDER BY ctid;
ROLLBACK;
