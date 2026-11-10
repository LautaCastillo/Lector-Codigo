-- Pruebas de comparar_jornadas. Termina con ROLLBACK; todas deben dar true.
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
CREATE FUNCTION pg_temp.jid(k int) RETURNS text LANGUAGE sql SECURITY DEFINER AS $f$ SELECT id FROM pg_temp.jj WHERE n = k $f$;
GRANT EXECUTE ON FUNCTION pg_temp.jid(int) TO PUBLIC;
-- Lo que dice la comparación de las jornadas 1 y 2 sobre un bien: campos separados por "/".
CREATE FUNCTION pg_temp.cmp(b text) RETURNS text LANGUAGE sql AS $f$
SELECT cambio || '/' || coalesce("ubicacionAntes", '-') || '/' || coalesce("ubicacionDespues", '-') || '/' || coalesce("relevadorAntes", '-') || '/' || coalesce("relevadorDespues", '-') || '/' || coalesce("situacionDespues", '-')
FROM public.comparar_jornadas(pg_temp.jid(1), pg_temp.jid(2)) WHERE "bienId" = b $f$;
GRANT EXECUTE ON FUNCTION pg_temp.cmp(text) TO PUBLIC;

INSERT INTO public."usuario" ("id", "cuenta", "nombre", "rol", "estado", "authId") VALUES
  ('T-ADM', 'adm@prueba', 'Admin', 'administrador', 'activa', 'ffffffff-0000-0000-0000-000000000001'),
  ('T-R1', 'r1@prueba', 'Relevador 1', 'relevador', 'activa', 'ffffffff-0000-0000-0000-000000000002'),
  ('T-R2', 'r2@prueba', 'Relevador 2', 'relevador', 'activa', 'ffffffff-0000-0000-0000-000000000003'),
  ('T-SU', 'su@prueba', 'Suspendida', 'relevador', 'suspendida', 'ffffffff-0000-0000-0000-000000000004');
INSERT INTO public."bien" ("id", "numeroInventario", "descripcion", "ubicacionFisica", "areaResponsable") VALUES
  ('B-1', '99991001', 'Silla A', 'Oficina 1', '9-9 Área de prueba'),
  ('B-2', '99991002', 'Silla B', 'Oficina 1', '9-9 Área de prueba'),
  ('B-3', '99991003', 'Silla C', 'Oficina 1', '9-9 Área de prueba'),
  ('B-4', '99991004', 'Silla D', 'Oficina 1', '9-9 Área de prueba'),
  ('B-5', '99991005', 'Silla E', 'Oficina 1', '9-9 Área de prueba'),
  ('B-6', '99991006', 'Silla F', 'Oficina 1', '9-9 Área de prueba');

-- Jornada 1 (R1): B-1, B-2, B-3 en Oficina 1 y B-6 sin ubicación indicada. Se cierra.
SELECT set_config('request.jwt.claims', '{"sub":"ffffffff-0000-0000-0000-000000000002","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
INSERT INTO pg_temp.jj SELECT 1, public.crear_jornada('area', '9-9 Área de prueba');
INSERT INTO public."relevamiento" ("idCliente","usuarioId","bienId","resultado","ubicacionObservada","relevadoEnDispositivo","jornadaId") VALUES
  ('eeeeeeee-0000-4000-8000-000000000001','T-R1','B-1','encontrado','Oficina 1',now(),pg_temp.jid(1)),
  ('eeeeeeee-0000-4000-8000-000000000002','T-R1','B-2','encontrado','Oficina 1',now(),pg_temp.jid(1)),
  ('eeeeeeee-0000-4000-8000-000000000003','T-R1','B-3','encontrado','Oficina 1',now(),pg_temp.jid(1)),
  ('eeeeeeee-0000-4000-8000-000000000006','T-R1','B-6','encontrado',NULL,now(),pg_temp.jid(1));
SELECT public.cerrar_jornada(pg_temp.jid(1));
-- Una jornada de ubicación, para probar que no se compara con otro alcance.
INSERT INTO pg_temp.jj SELECT 3, public.crear_jornada('ubicacion', 'Oficina 1');
RESET ROLE;

-- Jornada 2 (R2): B-1 igual, B-2 en otra ubicación, B-3 no aparece, B-4 aparece, B-5 no aparece, B-6 con ubicación.
SELECT set_config('request.jwt.claims', '{"sub":"ffffffff-0000-0000-0000-000000000003","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
INSERT INTO pg_temp.jj SELECT 2, public.crear_jornada('area', '9-9 Área de prueba');
INSERT INTO public."relevamiento" ("idCliente","usuarioId","bienId","resultado","ubicacionObservada","relevadoEnDispositivo","jornadaId") VALUES
  ('eeeeeeee-0000-4000-8000-000000000011','T-R2','B-1','encontrado','Oficina 1',now(),pg_temp.jid(2)),
  ('eeeeeeee-0000-4000-8000-000000000012','T-R2','B-2','encontrado','Oficina 2',now(),pg_temp.jid(2)),
  ('eeeeeeee-0000-4000-8000-000000000014','T-R2','B-4','encontrado','Oficina 1',now(),pg_temp.jid(2)),
  ('eeeeeeee-0000-4000-8000-000000000016','T-R2','B-6','encontrado','Oficina 1',now(),pg_temp.jid(2));
RESET ROLE;
-- B-3 pasó a estar prestado (lo declara un administrador).
SELECT set_config('request.jwt.claims', '{"sub":"ffffffff-0000-0000-0000-000000000001","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
SELECT public.declarar_situacion('B-3', 'prestado', 'Prestado a Rectorado');
RESET ROLE;

SELECT set_config('request.jwt.claims', '{"sub":"ffffffff-0000-0000-0000-000000000002","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.chk('encontrado en las dos y en el mismo lugar: igual', 'igual/Oficina 1/Oficina 1/Relevador 1/Relevador 2/-', pg_temp.cmp('B-1'));
SELECT pg_temp.chk('encontrado en las dos en otro lugar: cambió de lugar', 'cambio_lugar/Oficina 1/Oficina 2/Relevador 1/Relevador 2/-', pg_temp.cmp('B-2'));
SELECT pg_temp.chk('encontrado antes y no ahora: desapareció (y muestra su situación)', 'desaparecio/Oficina 1/-/Relevador 1/-/prestado', pg_temp.cmp('B-3'));
SELECT pg_temp.chk('no encontrado antes y sí ahora: apareció', 'aparecio/-/Oficina 1/-/Relevador 2/-', pg_temp.cmp('B-4'));
SELECT pg_temp.chk('no encontrado en ninguna: faltó en las dos', 'falto_en_ambas/-/-/-/-/-', pg_temp.cmp('B-5'));
SELECT pg_temp.chk('si antes no se indicó ubicación no se cuenta como cambio de lugar', 'igual/-/Oficina 1/Relevador 1/Relevador 2/-', pg_temp.cmp('B-6'));
SELECT pg_temp.chk('hay una fila por bien esperado', '6', (SELECT count(*)::text FROM public.comparar_jornadas(pg_temp.jid(1), pg_temp.jid(2))));
SELECT pg_temp.chk('al revés, lo que apareció pasa a haber desaparecido', 'desaparecio',
  (SELECT cambio FROM public.comparar_jornadas(pg_temp.jid(2), pg_temp.jid(1)) WHERE "bienId" = 'B-4'));
SELECT pg_temp.chk('no se compara una jornada consigo misma', '22023', pg_temp.intentar($q$SELECT * FROM public.comparar_jornadas(pg_temp.jid(1), pg_temp.jid(1))$q$));
SELECT pg_temp.chk('no se comparan jornadas de distinto alcance', '22023', pg_temp.intentar($q$SELECT * FROM public.comparar_jornadas(pg_temp.jid(1), pg_temp.jid(3))$q$));
SELECT pg_temp.chk('una jornada que no existe se rechaza', 'P0002', pg_temp.intentar($q$SELECT * FROM public.comparar_jornadas(pg_temp.jid(1), 'NO-EXISTE')$q$));
RESET ROLE;

-- Si en la primera se deshace una lectura, ese bien deja de figurar como encontrado antes.
UPDATE public."relevamiento" SET "anuladoEn" = now(), "anuladoPor" = 'T-R1' WHERE "idCliente" = 'eeeeeeee-0000-4000-8000-000000000002';
SELECT set_config('request.jwt.claims', '{"sub":"ffffffff-0000-0000-0000-000000000002","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.chk('con la lectura anterior deshecha, B-2 aparece', 'aparecio', (SELECT cambio FROM public.comparar_jornadas(pg_temp.jid(1), pg_temp.jid(2)) WHERE "bienId" = 'B-2'));
RESET ROLE;

-- Quién puede comparar.
SET LOCAL ROLE anon;
SELECT pg_temp.chk('anon no compara', '42501', pg_temp.intentar($q$SELECT * FROM public.comparar_jornadas(pg_temp.jid(1), pg_temp.jid(2))$q$));
RESET ROLE;
SELECT set_config('request.jwt.claims', '{"sub":"ffffffff-0000-0000-0000-000000000004","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.chk('una cuenta suspendida no compara', '42501', pg_temp.intentar($q$SELECT * FROM public.comparar_jornadas(pg_temp.jid(1), pg_temp.jid(2))$q$));
RESET ROLE;

SELECT prueba, ok, detalle FROM pg_temp.resultado ORDER BY ctid;
ROLLBACK;
