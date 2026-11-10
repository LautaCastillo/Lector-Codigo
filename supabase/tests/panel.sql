-- Pruebas del panel del administrador (panel_resumen, panel_por_area, panel_sin_relevar, panel_lecturas_por_persona).
-- Como el panel cuenta todo el catálogo, las cifras generales se comparan contra lo que había antes de crear los datos de prueba.
-- Termina con ROLLBACK; todas deben dar true.
BEGIN;
CREATE TEMP TABLE resultado (prueba text, ok boolean, detalle text);
GRANT ALL ON TABLE resultado TO PUBLIC;
CREATE TEMP TABLE jj (n int, id text);
GRANT ALL ON TABLE jj TO PUBLIC;
CREATE TEMP TABLE base (bienes int, relevados int, apartados int, abiertas int, cerradas int, lecturas int, cuentas int, hallazgos int);
GRANT ALL ON TABLE base TO PUBLIC;
CREATE FUNCTION pg_temp.intentar(p text) RETURNS text LANGUAGE plpgsql AS $f$
BEGIN EXECUTE p; RETURN 'ok'; EXCEPTION WHEN OTHERS THEN RETURN SQLSTATE; END $f$;
CREATE FUNCTION pg_temp.chk(p text, esperado text, obtenido text) RETURNS void LANGUAGE sql AS $f$
INSERT INTO pg_temp.resultado VALUES (p, esperado = obtenido, 'esperado ' || esperado || ', obtenido ' || coalesce(obtenido, 'NULL')) $f$;
GRANT EXECUTE ON FUNCTION pg_temp.intentar(text), pg_temp.chk(text, text, text) TO PUBLIC;
CREATE FUNCTION pg_temp.jid(k int) RETURNS text LANGUAGE sql SECURITY DEFINER AS $f$ SELECT id FROM pg_temp.jj WHERE n = k $f$;
GRANT EXECUTE ON FUNCTION pg_temp.jid(int) TO PUBLIC;

-- Cifras de partida (sin pasar por el panel: se calculan directo, como dueño de la base).
INSERT INTO pg_temp.base SELECT
  (SELECT count(*) FROM public."bien"),
  (SELECT count(*) FROM public."bien" b WHERE EXISTS (SELECT 1 FROM public."relevamiento" r WHERE r."bienId" = b."id" AND r."resultado" = 'encontrado' AND r."anuladoEn" IS NULL)),
  (SELECT count(*) FROM public."bien" b WHERE EXISTS (SELECT 1 FROM public."situacion_bien" s WHERE s."bienId" = b."id" AND s."levantadaEn" IS NULL)
     AND NOT EXISTS (SELECT 1 FROM public."relevamiento" r WHERE r."bienId" = b."id" AND r."resultado" = 'encontrado' AND r."anuladoEn" IS NULL)),
  (SELECT count(*) FROM public."jornada" WHERE "estado" = 'abierta'),
  (SELECT count(*) FROM public."jornada" WHERE "estado" = 'cerrada'),
  (SELECT count(*) FROM public."relevamiento" WHERE "resultado" = 'encontrado' AND "anuladoEn" IS NULL AND "relevadoEnDispositivo" >= now() - interval '7 days'),
  (SELECT count(*) FROM public."usuario" WHERE "estado" = 'activa'),
  (SELECT count(*) FROM public."relevamiento" WHERE "resultado" = 'hallazgo' AND "bienId" IS NULL AND "anuladoEn" IS NULL);

INSERT INTO public."usuario" ("id", "cuenta", "nombre", "rol", "estado", "authId") VALUES
  ('T-ADM', 'adm@prueba', 'Admin', 'administrador', 'activa', 'ffffffff-0000-0000-0000-000000000001'),
  ('T-R1', 'r1@prueba', 'Relevador 1', 'relevador', 'activa', 'ffffffff-0000-0000-0000-000000000002'),
  ('T-R2', 'r2@prueba', 'Relevador 2', 'relevador', 'activa', 'ffffffff-0000-0000-0000-000000000003'),
  ('T-SU', 'su@prueba', 'Suspendida', 'administrador', 'suspendida', 'ffffffff-0000-0000-0000-000000000004');
-- Área A: B-1 (se encuentra), B-2 (nunca), B-3 (prestado, nunca). Área B: B-4 (nunca) y B-5 (una lectura que se deshace).
INSERT INTO public."bien" ("id", "numeroInventario", "descripcion", "ubicacionFisica", "areaResponsable") VALUES
  ('B-1', '99991001', 'Silla A', 'Oficina 1', '9-9 Área A de prueba'),
  ('B-2', '99991002', 'Silla B', 'Oficina 1', '9-9 Área A de prueba'),
  ('B-3', '99991003', 'Silla C', 'Oficina 2', '9-9 Área A de prueba'),
  ('B-4', '99991004', 'Silla D', 'Oficina 3', '9-8 Área B de prueba'),
  ('B-5', '99991005', 'Silla E', 'Oficina 3', '9-8 Área B de prueba');
INSERT INTO public."situacion_bien" ("bienId", "situacion", "motivo", "declaradaPor") VALUES ('B-3', 'prestado', 'Prestado a Rectorado', 'T-ADM');
-- Una lectura de B-5 que después se deshace, y dos hallazgos de R2 sin vincular (uno de hace 100 días).
INSERT INTO public."relevamiento" ("idCliente","usuarioId","bienId","resultado","ubicacionObservada","relevadoEnDispositivo","anuladoEn","anuladoPor") VALUES
  ('eeeeeeee-0000-4000-8000-000000000005','T-R1','B-5','encontrado','Oficina 3',now(),now(),'T-R1');
INSERT INTO public."relevamiento" ("idCliente","usuarioId","resultado","clase","descripcion","relevadoEnDispositivo") VALUES
  ('aaaaaaaa-0000-4000-8000-000000000006','T-R2','hallazgo','nuevo','Mesa sin etiqueta',now()),
  ('bbbbbbbb-0000-4000-8000-000000000007','T-R2','hallazgo','nuevo','Estante viejo',now() - interval '100 days');

-- R1 abre la jornada del área A, encuentra B-1 y la cierra. R2 abre la del área B y la deja abierta.
SELECT set_config('request.jwt.claims', '{"sub":"ffffffff-0000-0000-0000-000000000002","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
INSERT INTO pg_temp.jj SELECT 1, public.crear_jornada('area', '9-9 Área A de prueba');
INSERT INTO public."relevamiento" ("idCliente","usuarioId","bienId","resultado","ubicacionObservada","relevadoEnDispositivo","jornadaId") VALUES
  ('eeeeeeee-0000-4000-8000-000000000001','T-R1','B-1','encontrado','Oficina 1',now(),pg_temp.jid(1));
SELECT public.cerrar_jornada(pg_temp.jid(1));
RESET ROLE;
SELECT set_config('request.jwt.claims', '{"sub":"ffffffff-0000-0000-0000-000000000003","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
INSERT INTO pg_temp.jj SELECT 2, public.crear_jornada('area', '9-8 Área B de prueba');
RESET ROLE;

-- Quién puede ver el panel: solo un administrador activo.
SELECT set_config('request.jwt.claims', '{"sub":"ffffffff-0000-0000-0000-000000000002","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.chk('un relevador no ve el resumen', '42501', pg_temp.intentar($q$SELECT * FROM public.panel_resumen()$q$));
SELECT pg_temp.chk('un relevador no ve el avance por área', '42501', pg_temp.intentar($q$SELECT * FROM public.panel_por_area()$q$));
SELECT pg_temp.chk('un relevador no ve los sin relevar', '42501', pg_temp.intentar($q$SELECT * FROM public.panel_sin_relevar()$q$));
SELECT pg_temp.chk('un relevador no ve las lecturas por persona', '42501', pg_temp.intentar($q$SELECT * FROM public.panel_lecturas_por_persona(30)$q$));
RESET ROLE;
SET LOCAL ROLE anon;
SELECT pg_temp.chk('anon no ve el panel', '42501', pg_temp.intentar($q$SELECT * FROM public.panel_resumen()$q$));
RESET ROLE;
SELECT set_config('request.jwt.claims', '{"sub":"ffffffff-0000-0000-0000-000000000004","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.chk('un administrador suspendido no ve el panel', '42501', pg_temp.intentar($q$SELECT * FROM public.panel_resumen()$q$));
RESET ROLE;

SELECT set_config('request.jwt.claims', '{"sub":"ffffffff-0000-0000-0000-000000000001","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;

-- Resumen: la diferencia con la partida.
SELECT pg_temp.chk('resumen: bienes, relevados y apartados', '5/1/1',
  (SELECT (r.bienes - b.bienes) || '/' || (r.relevados - b.relevados) || '/' || (r.apartados - b.apartados) FROM public.panel_resumen() r, pg_temp.base b));
SELECT pg_temp.chk('resumen: jornadas abiertas y cerradas', '1/1',
  (SELECT (r."jornadasAbiertas" - b.abiertas) || '/' || (r."jornadasCerradas" - b.cerradas) FROM public.panel_resumen() r, pg_temp.base b));
SELECT pg_temp.chk('resumen: lecturas de la semana, cuentas activas y hallazgos sin vincular', '1/3/2',
  (SELECT (r."lecturas7Dias" - b.lecturas) || '/' || (r."cuentasActivas" - b.cuentas) || '/' || (r."hallazgosSinVincular" - b.hallazgos) FROM public.panel_resumen() r, pg_temp.base b));

-- Por área.
SELECT pg_temp.chk('área A: bienes, relevados, sin relevar y apartados', '3/1/1/1',
  (SELECT bienes || '/' || relevados || '/' || "sinRelevar" || '/' || apartados FROM public.panel_por_area() WHERE area = '9-9 Área A de prueba'));
SELECT pg_temp.chk('área A: la última jornada cerrada y su resultado', 'true/2/1',
  (SELECT ("ultimaJornadaId" = pg_temp.jid(1))::text || '/' || "ultimaEsperados" || '/' || "ultimaEncontrados" FROM public.panel_por_area() WHERE area = '9-9 Área A de prueba'));
SELECT pg_temp.chk('área B: una lectura deshecha no cuenta', '2/0/2/0',
  (SELECT bienes || '/' || relevados || '/' || "sinRelevar" || '/' || apartados FROM public.panel_por_area() WHERE area = '9-8 Área B de prueba'));
SELECT pg_temp.chk('área B: sin jornada cerrada no hay última', 'true',
  (SELECT ("ultimaJornadaId" IS NULL AND "ultimaCerradaEn" IS NULL)::text FROM public.panel_por_area() WHERE area = '9-8 Área B de prueba'));

-- Sin relevar.
SELECT pg_temp.chk('sin relevar del área A, con la situación', 'B-2:-,B-3:prestado',
  (SELECT string_agg("bienId" || ':' || coalesce(situacion, '-'), ',' ORDER BY "numeroInventario") FROM public.panel_sin_relevar('9-9 Área A de prueba')));
SELECT pg_temp.chk('sin relevar del área B: incluye el de la lectura deshecha', 'B-4,B-5',
  (SELECT string_agg("bienId", ',' ORDER BY "numeroInventario") FROM public.panel_sin_relevar('9-8 Área B de prueba')));
SELECT pg_temp.chk('el límite recorta la lista', '1', (SELECT count(*)::text FROM public.panel_sin_relevar('9-8 Área B de prueba', 1)));
SELECT pg_temp.chk('sin indicar área trae los de todas', 'true', (SELECT (count(*) >= 4)::text FROM public.panel_sin_relevar(NULL, 500)));

-- Lecturas por persona.
SELECT pg_temp.chk('R1 en 30 días: una lectura, ningún hallazgo, una deshecha', '1/0/1',
  (SELECT lecturas || '/' || hallazgos || '/' || deshechas FROM public.panel_lecturas_por_persona(30) WHERE "usuarioId" = 'T-R1'));
SELECT pg_temp.chk('R2 en 30 días: un hallazgo y una jornada abierta', '0/1/1',
  (SELECT lecturas || '/' || hallazgos || '/' || "jornadasAbiertas" FROM public.panel_lecturas_por_persona(30) WHERE "usuarioId" = 'T-R2'));
SELECT pg_temp.chk('R2 en 365 días: se suma el hallazgo viejo', '2',
  (SELECT hallazgos::text FROM public.panel_lecturas_por_persona(365) WHERE "usuarioId" = 'T-R2'));
SELECT pg_temp.chk('la última actividad no depende del período', 'true',
  (SELECT ("ultimaActividad" IS NOT NULL)::text FROM public.panel_lecturas_por_persona(1) WHERE "usuarioId" = 'T-R2'));
SELECT pg_temp.chk('quien no hizo nada figura en cero', '0/0/0',
  (SELECT lecturas || '/' || hallazgos || '/' || deshechas FROM public.panel_lecturas_por_persona(30) WHERE "usuarioId" = 'T-ADM'));
SELECT pg_temp.chk('las cuentas suspendidas también figuran, con su estado', 'suspendida',
  (SELECT estado FROM public.panel_lecturas_por_persona(30) WHERE "usuarioId" = 'T-SU'));
RESET ROLE;

SELECT prueba, ok, detalle FROM pg_temp.resultado ORDER BY ctid;
ROLLBACK;
