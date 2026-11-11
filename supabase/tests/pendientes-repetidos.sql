-- Pruebas de "pendientes que se repiten" (columna vecesSinEncontrar de avance_jornada). Termina con ROLLBACK; todas deben dar true.
BEGIN;
CREATE TEMP TABLE resultado (prueba text, ok boolean, detalle text);
GRANT ALL ON TABLE resultado TO PUBLIC;
CREATE TEMP TABLE jj (n int, id text);
GRANT ALL ON TABLE jj TO PUBLIC;
CREATE FUNCTION pg_temp.chk(p text, esperado text, obtenido text) RETURNS void LANGUAGE sql AS $f$
INSERT INTO pg_temp.resultado VALUES (p, esperado = obtenido, 'esperado ' || esperado || ', obtenido ' || coalesce(obtenido, 'NULL')) $f$;
GRANT EXECUTE ON FUNCTION pg_temp.chk(text, text, text) TO PUBLIC;
CREATE FUNCTION pg_temp.jid(k int) RETURNS text LANGUAGE sql SECURITY DEFINER AS $f$ SELECT id FROM pg_temp.jj WHERE n = k $f$;
GRANT EXECUTE ON FUNCTION pg_temp.jid(int) TO PUBLIC;
-- Las veces que un bien no se encontró en las jornadas anteriores, vistas desde la jornada número k.
CREATE FUNCTION pg_temp.racha(k int, b text) RETURNS text LANGUAGE sql AS $f$
SELECT "vecesSinEncontrar"::text FROM public.avance_jornada(pg_temp.jid(k)) WHERE "bienId" = b $f$;
GRANT EXECUTE ON FUNCTION pg_temp.racha(int, text) TO PUBLIC;

INSERT INTO public."usuario" ("id", "cuenta", "nombre", "rol", "estado", "authId") VALUES
  ('T-ADM', 'adm@prueba', 'Admin', 'administrador', 'activa', 'ffffffff-0000-0000-0000-000000000001'),
  ('T-R1', 'r1@prueba', 'Relevador 1', 'relevador', 'activa', 'ffffffff-0000-0000-0000-000000000002');
INSERT INTO public."bien" ("id", "numeroInventario", "descripcion", "ubicacionFisica", "areaResponsable") VALUES
  ('B-1', '99991001', 'Silla A', 'Oficina 1', '9-9 Área de prueba'),
  ('B-2', '99991002', 'Silla B', 'Oficina 1', '9-9 Área de prueba'),
  ('B-3', '99991003', 'Silla C', 'Oficina 1', '9-9 Área de prueba'),
  ('B-4', '99991004', 'Silla D', 'Oficina 1', '9-9 Área de prueba'),
  ('B-6', '99991006', 'Silla F', 'Oficina 1', '9-9 Área de prueba');

-- Jornada 1 del área: se lee B-1 y se cierra. Jornada 2: se lee B-1 y se cierra. Jornada 3: queda abierta.
-- Jornada 4 (de la ubicación "Oficina 1"): se cierra sin leer nada; es de otro alcance y no debe contar.
SELECT set_config('request.jwt.claims', '{"sub":"ffffffff-0000-0000-0000-000000000002","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
INSERT INTO pg_temp.jj SELECT 1, public.crear_jornada('area', '9-9 Área de prueba');
INSERT INTO public."relevamiento" ("idCliente","usuarioId","bienId","resultado","ubicacionObservada","relevadoEnDispositivo","jornadaId") VALUES
  ('eeeeeeee-0000-4000-8000-000000000001','T-R1','B-1','encontrado','Oficina 1',now(),pg_temp.jid(1));
SELECT public.cerrar_jornada(pg_temp.jid(1));
INSERT INTO pg_temp.jj SELECT 2, public.crear_jornada('area', '9-9 Área de prueba');
INSERT INTO public."relevamiento" ("idCliente","usuarioId","bienId","resultado","ubicacionObservada","relevadoEnDispositivo","jornadaId") VALUES
  ('eeeeeeee-0000-4000-8000-000000000002','T-R1','B-1','encontrado','Oficina 1',now(),pg_temp.jid(2));
SELECT public.cerrar_jornada(pg_temp.jid(2));
INSERT INTO pg_temp.jj SELECT 4, public.crear_jornada('ubicacion', 'Oficina 1');
SELECT public.cerrar_jornada(pg_temp.jid(4));
INSERT INTO pg_temp.jj SELECT 3, public.crear_jornada('area', '9-9 Área de prueba');
RESET ROLE;

-- Dentro de una transacción now() no cambia: se acomodan las fechas (J1 hace 30 días, J2 hace 20, la de ubicación hace 5).
UPDATE public."jornada" SET "creadoEn" = now() - interval '30 days', "cerradaEn" = now() - interval '29 days' WHERE "id" = pg_temp.jid(1);
UPDATE public."jornada" SET "creadoEn" = now() - interval '20 days', "cerradaEn" = now() - interval '19 days' WHERE "id" = pg_temp.jid(2);
UPDATE public."jornada" SET "creadoEn" = now() - interval '6 days', "cerradaEn" = now() - interval '5 days' WHERE "id" = pg_temp.jid(4);
-- Los bienes ya estaban en el catálogo salvo B-6, que se dio de alta hace 5 días (después de las dos jornadas del área).
UPDATE public."bien" SET "creadoEn" = now() - interval '60 days' WHERE "id" IN ('B-1', 'B-2', 'B-3', 'B-4');
UPDATE public."bien" SET "creadoEn" = now() - interval '5 days' WHERE "id" = 'B-6';
-- B-4 estuvo en reparación hace 25 días hasta hace 10: la segunda jornada (cerrada hace 19) lo encontró apartado.
INSERT INTO public."situacion_bien" ("bienId", "situacion", "motivo", "declaradaPor", "declaradaEn", "levantadaPor", "levantadaEn")
  VALUES ('B-4', 'en_reparacion', 'Estaba en el taller', 'T-ADM', now() - interval '25 days', 'T-ADM', now() - interval '10 days');

SET LOCAL ROLE authenticated;
SELECT pg_temp.chk('en la primera jornada no hay anteriores: nada se repite', '0', pg_temp.racha(1, 'B-2'));
SELECT pg_temp.chk('en la segunda, un bien que faltó en la primera lleva 1', '1', pg_temp.racha(2, 'B-2'));
SELECT pg_temp.chk('en la tercera, un bien que faltó en las dos anteriores lleva 2', '2', pg_temp.racha(3, 'B-2'));
SELECT pg_temp.chk('otro bien en la misma situación también lleva 2', '2', pg_temp.racha(3, 'B-3'));
SELECT pg_temp.chk('un bien encontrado en la jornada anterior arranca de cero', '0', pg_temp.racha(3, 'B-1'));
SELECT pg_temp.chk('un bien que estaba apartado en la jornada anterior arranca de cero', '0', pg_temp.racha(3, 'B-4'));
SELECT pg_temp.chk('un bien dado de alta después de las jornadas anteriores arranca de cero', '0', pg_temp.racha(3, 'B-6'));
SELECT pg_temp.chk('la jornada de otro alcance no suma a la racha', '2', pg_temp.racha(3, 'B-3'));
RESET ROLE;

-- Si en la jornada abierta se encuentra el bien, deja de ser un pendiente repetido.
SELECT set_config('request.jwt.claims', '{"sub":"ffffffff-0000-0000-0000-000000000002","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
INSERT INTO public."relevamiento" ("idCliente","usuarioId","bienId","resultado","ubicacionObservada","relevadoEnDispositivo","jornadaId") VALUES
  ('eeeeeeee-0000-4000-8000-000000000003','T-R1','B-2','encontrado','Oficina 1',now(),pg_temp.jid(3));
SELECT pg_temp.chk('un bien encontrado en la jornada abierta no lleva racha', '0', pg_temp.racha(3, 'B-2'));
SELECT pg_temp.chk('los demás siguen igual', '2', pg_temp.racha(3, 'B-3'));
RESET ROLE;

-- Si el bien se encuentra en la jornada 3 y ésta se cierra, en la siguiente arranca de cero.
SELECT set_config('request.jwt.claims', '{"sub":"ffffffff-0000-0000-0000-000000000002","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
SELECT public.cerrar_jornada(pg_temp.jid(3));
INSERT INTO pg_temp.jj SELECT 5, public.crear_jornada('area', '9-9 Área de prueba');
RESET ROLE;
UPDATE public."jornada" SET "creadoEn" = now() - interval '1 day', "cerradaEn" = now() - interval '2 hours' WHERE "id" = pg_temp.jid(3);
UPDATE public."jornada" SET "creadoEn" = now() - interval '1 hour' WHERE "id" = pg_temp.jid(5);
SET LOCAL ROLE authenticated;
SELECT pg_temp.chk('en la jornada siguiente, lo encontrado en la anterior arranca de cero', '0', pg_temp.racha(5, 'B-2'));
SELECT pg_temp.chk('y lo que sigue sin aparecer suma una más', '3', pg_temp.racha(5, 'B-3'));
RESET ROLE;

SELECT prueba, ok, detalle FROM pg_temp.resultado ORDER BY ctid;
ROLLBACK;
