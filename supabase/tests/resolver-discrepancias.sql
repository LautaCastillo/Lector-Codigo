-- Pruebas de la cola de discrepancias (resolver_discrepancia, lecturas_de_bien_en_jornada). Termina con ROLLBACK; todas deben dar true.
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

-- R1 abre la jornada y ve B-1 en Oficina 1; R2 ve el mismo bien en Oficina 2 (no coinciden) y B-2 también.
SELECT set_config('request.jwt.claims', '{"sub":"ffffffff-0000-0000-0000-000000000002","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
INSERT INTO pg_temp.jj SELECT 1, public.crear_jornada('area', '9-9 Área de prueba');
INSERT INTO public."relevamiento" ("idCliente","usuarioId","bienId","resultado","ubicacionObservada","relevadoEnDispositivo","jornadaId") VALUES
  ('eeeeeeee-0000-4000-8000-000000000001','T-R1','B-1','encontrado','Oficina 1',now(),(SELECT id FROM pg_temp.jj WHERE n=1));
RESET ROLE;
SELECT set_config('request.jwt.claims', '{"sub":"ffffffff-0000-0000-0000-000000000003","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
INSERT INTO public."relevamiento" ("idCliente","usuarioId","bienId","resultado","ubicacionObservada","relevadoEnDispositivo","jornadaId") VALUES
  ('eeeeeeee-0000-4000-8000-000000000002','T-R2','B-1','encontrado','Oficina 2',now(),(SELECT id FROM pg_temp.jj WHERE n=1)),
  ('eeeeeeee-0000-4000-8000-000000000003','T-R2','B-2','encontrado','Oficina 1',now(),(SELECT id FROM pg_temp.jj WHERE n=1));
RESET ROLE;
UPDATE public."relevamiento" SET "sincronizadoEn" = now() + interval '1 second' WHERE "idCliente" IN ('eeeeeeee-0000-4000-8000-000000000002', 'eeeeeeee-0000-4000-8000-000000000003');

CREATE FUNCTION pg_temp.rid(p text) RETURNS text LANGUAGE sql SECURITY DEFINER AS $f$ SELECT "id" FROM public."relevamiento" WHERE "idCliente" = p $f$;
GRANT EXECUTE ON FUNCTION pg_temp.rid(text) TO PUBLIC;
CREATE FUNCTION pg_temp.fila(b text) RETURNS text LANGUAGE sql AS $f$
SELECT "relevador" || '/' || "discrepancia"::text || '/' || "resuelta"::text || '/' || coalesce("notaResolucion", '-')
FROM public.avance_jornada((SELECT id FROM pg_temp.jj WHERE n=1)) WHERE "bienId" = b $f$;
GRANT EXECUTE ON FUNCTION pg_temp.fila(text) TO PUBLIC;

-- Antes de resolver: figura la primera lectura y la jornada marca la discrepancia.
SELECT set_config('request.jwt.claims', '{"sub":"ffffffff-0000-0000-0000-000000000002","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.chk('antes de resolver figura la primera y se marca la discrepancia', 'Relevador 1/true/false/-', pg_temp.fila('B-1'));
SELECT pg_temp.chk('un bien sin discrepancia no se marca', 'Relevador 2/false/false/-', pg_temp.fila('B-2'));
SELECT pg_temp.chk('se ven las dos lecturas del bien, de la primera a la última', 'Relevador 1,Relevador 2',
  (SELECT string_agg(relevador, ',') FROM (SELECT * FROM public.lecturas_de_bien_en_jornada((SELECT id FROM pg_temp.jj WHERE n=1), 'B-1')) s));
RESET ROLE;

-- Sin sesión, suspendida y quien no abrió la jornada ni es administrador: no pueden resolver.
SET LOCAL ROLE anon;
SELECT pg_temp.chk('anon no resuelve', '42501', pg_temp.intentar($q$SELECT public.resolver_discrepancia((SELECT id FROM pg_temp.jj WHERE n=1), 'B-1', pg_temp.rid('eeeeeeee-0000-4000-8000-000000000002'))$q$));
RESET ROLE;
SELECT set_config('request.jwt.claims', '{"sub":"ffffffff-0000-0000-0000-000000000004","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.chk('una cuenta suspendida no resuelve', '42501', pg_temp.intentar($q$SELECT public.resolver_discrepancia((SELECT id FROM pg_temp.jj WHERE n=1), 'B-1', pg_temp.rid('eeeeeeee-0000-4000-8000-000000000002'))$q$));
RESET ROLE;
SELECT set_config('request.jwt.claims', '{"sub":"ffffffff-0000-0000-0000-000000000003","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.chk('quien no abrió la jornada ni es administrador no resuelve', '42501', pg_temp.intentar($q$SELECT public.resolver_discrepancia((SELECT id FROM pg_temp.jj WHERE n=1), 'B-1', pg_temp.rid('eeeeeeee-0000-4000-8000-000000000002'))$q$));
RESET ROLE;

-- R1 (abrió la jornada) elige la lectura de R2 y deja una nota.
SELECT set_config('request.jwt.claims', '{"sub":"ffffffff-0000-0000-0000-000000000002","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.chk('no se puede elegir una lectura de otro bien', '22023', pg_temp.intentar($q$SELECT public.resolver_discrepancia((SELECT id FROM pg_temp.jj WHERE n=1), 'B-1', pg_temp.rid('eeeeeeee-0000-4000-8000-000000000003'))$q$));
SELECT pg_temp.chk('quien abrió la jornada resuelve', 'ok', pg_temp.intentar($q$SELECT public.resolver_discrepancia((SELECT id FROM pg_temp.jj WHERE n=1), 'B-1', pg_temp.rid('eeeeeeee-0000-4000-8000-000000000002'), 'Estaba en Oficina 2, lo traslada Patrimonio')$q$));
SELECT pg_temp.chk('figura la lectura elegida, resuelta y con su nota', 'Relevador 2/false/true/Estaba en Oficina 2, lo traslada Patrimonio', pg_temp.fila('B-1'));
SELECT pg_temp.chk('la lectura elegida queda marcada', 'Relevador 2',
  (SELECT relevador FROM public.lecturas_de_bien_en_jornada((SELECT id FROM pg_temp.jj WHERE n=1), 'B-1') WHERE elegida));
RESET ROLE;

-- Un administrador puede cambiar la elección.
SELECT set_config('request.jwt.claims', '{"sub":"ffffffff-0000-0000-0000-000000000001","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.chk('un administrador cambia la elección', 'ok', pg_temp.intentar($q$SELECT public.resolver_discrepancia((SELECT id FROM pg_temp.jj WHERE n=1), 'B-1', pg_temp.rid('eeeeeeee-0000-4000-8000-000000000001'), '   ')$q$));
SELECT pg_temp.chk('una nota en blanco queda vacía', 'Relevador 1/false/true/-', pg_temp.fila('B-1'));
RESET ROLE;
SELECT pg_temp.chk('hay una sola resolución por bien y jornada', '1', (SELECT count(*)::text FROM public."resolucion_discrepancia"));
SELECT pg_temp.chk('quedan los eventos de auditoría', '2', (SELECT count(*)::text FROM public."evento_auditoria" WHERE "tipo" = 'DISCREPANCIA_RESUELTA'));

-- Si se deshace la lectura elegida, la resolución deja de aplicar y figura la que queda.
SELECT set_config('request.jwt.claims', '{"sub":"ffffffff-0000-0000-0000-000000000002","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
SELECT public.anular_relevamiento(pg_temp.rid('eeeeeeee-0000-4000-8000-000000000001'));
SELECT pg_temp.chk('al deshacer la lectura elegida figura la que queda, sin marca', 'Relevador 2/false/false/-', pg_temp.fila('B-1'));
RESET ROLE;

-- Con la jornada cerrada ya no se resuelve.
SELECT set_config('request.jwt.claims', '{"sub":"ffffffff-0000-0000-0000-000000000001","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
SELECT public.cerrar_jornada((SELECT id FROM pg_temp.jj WHERE n=1));
SELECT pg_temp.chk('en una jornada cerrada no se resuelve', '22023', pg_temp.intentar($q$SELECT public.resolver_discrepancia((SELECT id FROM pg_temp.jj WHERE n=1), 'B-1', pg_temp.rid('eeeeeeee-0000-4000-8000-000000000002'))$q$));
RESET ROLE;

SELECT prueba, ok, detalle FROM pg_temp.resultado ORDER BY ctid;
ROLLBACK;
