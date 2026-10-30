-- Pruebas de lecturas repetidas en una jornada: figura la primera según el servidor, el resto como "también lo vieron" y
-- las lecturas que no coinciden como discrepancia. Termina con ROLLBACK; todas deben dar true.
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
  ('T-R1', 'r1@prueba', 'Relevador 1', 'relevador', 'activa', 'ffffffff-0000-0000-0000-000000000002'),
  ('T-R2', 'r2@prueba', 'Relevador 2', 'relevador', 'activa', 'ffffffff-0000-0000-0000-000000000003');
INSERT INTO public."bien" ("id", "numeroInventario", "descripcion", "ubicacionFisica", "areaResponsable") VALUES
  ('B-1', '99991001', 'Silla A', 'Oficina 1', '9-9 Área de prueba'),
  ('B-2', '99991002', 'Silla B', 'Oficina 1', '9-9 Área de prueba'),
  ('B-3', '99991003', 'Mesa C', 'Oficina 2', '9-9 Área de prueba'),
  ('B-4', '99991004', 'Mesa D', 'Oficina 2', '9-9 Área de prueba');

SELECT set_config('request.jwt.claims', '{"sub":"ffffffff-0000-0000-0000-000000000002","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
INSERT INTO pg_temp.jj SELECT 1, public.crear_jornada('area', '9-9 Área de prueba');
RESET ROLE;

-- B-1: R2 llega primero al servidor, pero el teléfono de R1 tiene la hora atrasada (parece anterior). Ubicaciones distintas.
INSERT INTO public."relevamiento" ("idCliente","usuarioId","bienId","resultado","relevadoEnDispositivo","sincronizadoEn","jornadaId","ubicacionObservada") VALUES
  ('bbbbbbbb-0000-4000-8000-000000000001','T-R2','B-1','encontrado', now(), now() - interval '10 minutes', (SELECT id FROM pg_temp.jj WHERE n = 1), 'Oficina 1'),
  ('bbbbbbbb-0000-4000-8000-000000000002','T-R1','B-1','encontrado', now() - interval '5 hours', now() - interval '5 minutes', (SELECT id FROM pg_temp.jj WHERE n = 1), 'Oficina 2');
-- B-2: solo R1, una vez.
INSERT INTO public."relevamiento" ("idCliente","usuarioId","bienId","resultado","relevadoEnDispositivo","jornadaId","ubicacionObservada") VALUES
  ('bbbbbbbb-0000-4000-8000-000000000003','T-R1','B-2','encontrado', now(), (SELECT id FROM pg_temp.jj WHERE n = 1), 'Oficina 1');
-- B-3: R1 lo lee dos veces en el mismo lugar (no es una discrepancia ni "otra persona").
INSERT INTO public."relevamiento" ("idCliente","usuarioId","bienId","resultado","relevadoEnDispositivo","sincronizadoEn","jornadaId","ubicacionObservada") VALUES
  ('bbbbbbbb-0000-4000-8000-000000000004','T-R1','B-3','encontrado', now(), now() - interval '4 minutes', (SELECT id FROM pg_temp.jj WHERE n = 1), 'Oficina 2'),
  ('bbbbbbbb-0000-4000-8000-000000000005','T-R1','B-3','encontrado', now(), now() - interval '3 minutes', (SELECT id FROM pg_temp.jj WHERE n = 1), 'Oficina 2');
-- B-4: R1 lo encuentra y R2 lo marca no encontrado: contradicción.
INSERT INTO public."relevamiento" ("idCliente","usuarioId","bienId","resultado","relevadoEnDispositivo","sincronizadoEn","jornadaId","ubicacionObservada") VALUES
  ('bbbbbbbb-0000-4000-8000-000000000006','T-R1','B-4','encontrado', now(), now() - interval '2 minutes', (SELECT id FROM pg_temp.jj WHERE n = 1), 'Oficina 2'),
  ('bbbbbbbb-0000-4000-8000-000000000007','T-R2','B-4','no_encontrado', now(), now() - interval '1 minutes', (SELECT id FROM pg_temp.jj WHERE n = 1), 'Oficina 2');

-- El servidor pone su propia hora al insertar (privado.preparar_relevamiento), y en una misma transacción todas empatarían:
-- se escalonan a mano para simular lecturas que llegaron en momentos distintos.
UPDATE public."relevamiento" r SET "sincronizadoEn" = now() - v.hace
FROM (VALUES
  ('bbbbbbbb-0000-4000-8000-000000000001', interval '10 minutes'), ('bbbbbbbb-0000-4000-8000-000000000002', interval '5 minutes'),
  ('bbbbbbbb-0000-4000-8000-000000000004', interval '4 minutes'), ('bbbbbbbb-0000-4000-8000-000000000005', interval '3 minutes'),
  ('bbbbbbbb-0000-4000-8000-000000000006', interval '2 minutes'), ('bbbbbbbb-0000-4000-8000-000000000007', interval '1 minutes')
) AS v(id, hace) WHERE r."idCliente" = v.id;

SELECT set_config('request.jwt.claims', '{"sub":"ffffffff-0000-0000-0000-000000000003","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.chk('figura quien llegó primero al servidor aunque su hora de teléfono sea posterior', 'Relevador 2',
  (SELECT "relevador" FROM public.avance_jornada((SELECT id FROM pg_temp.jj WHERE n = 1)) WHERE "numeroInventario" = '99991001'));
SELECT pg_temp.chk('la ubicación que cuenta es la de la primera lectura (Oficina 1 es la del catálogo: no está fuera de lugar)', 'false',
  (SELECT "fueraDeLugar"::text FROM public.avance_jornada((SELECT id FROM pg_temp.jj WHERE n = 1)) WHERE "numeroInventario" = '99991001'));
SELECT pg_temp.chk('se informan las dos lecturas', '2',
  (SELECT "lecturas"::text FROM public.avance_jornada((SELECT id FROM pg_temp.jj WHERE n = 1)) WHERE "numeroInventario" = '99991001'));
SELECT pg_temp.chk('la otra persona figura como "también lo vio"', 'Relevador 1',
  (SELECT array_to_string("tambienVieron", ',') FROM public.avance_jornada((SELECT id FROM pg_temp.jj WHERE n = 1)) WHERE "numeroInventario" = '99991001'));
SELECT pg_temp.chk('ubicaciones distintas son una discrepancia', 'true',
  (SELECT "discrepancia"::text FROM public.avance_jornada((SELECT id FROM pg_temp.jj WHERE n = 1)) WHERE "numeroInventario" = '99991001'));
SELECT pg_temp.chk('una sola lectura no tiene discrepancia ni otros', '1/0/false',
  (SELECT "lecturas" || '/' || cardinality("tambienVieron") || '/' || "discrepancia" FROM public.avance_jornada((SELECT id FROM pg_temp.jj WHERE n = 1)) WHERE "numeroInventario" = '99991002'));
SELECT pg_temp.chk('la misma persona leyendo dos veces igual no es discrepancia ni "otra persona"', '2/0/false',
  (SELECT "lecturas" || '/' || cardinality("tambienVieron") || '/' || "discrepancia" FROM public.avance_jornada((SELECT id FROM pg_temp.jj WHERE n = 1)) WHERE "numeroInventario" = '99991003'));
SELECT pg_temp.chk('encontrado y no encontrado a la vez es discrepancia', 'Relevador 1/true',
  (SELECT "relevador" || '/' || "discrepancia" FROM public.avance_jornada((SELECT id FROM pg_temp.jj WHERE n = 1)) WHERE "numeroInventario" = '99991004'));
SELECT pg_temp.chk('el bien sigue contando una sola vez como encontrado', '4',
  (SELECT count(*)::text FROM public.avance_jornada((SELECT id FROM pg_temp.jj WHERE n = 1)) WHERE "tipo" = 'esperado' AND "encontrado"));
RESET ROLE;

SET LOCAL ROLE anon;
SELECT pg_temp.chk('anon no ve el avance', '42501', pg_temp.intentar($q$SELECT * FROM public.avance_jornada('x')$q$));
RESET ROLE;
SELECT prueba, ok, detalle FROM pg_temp.resultado ORDER BY ctid;
ROLLBACK;
