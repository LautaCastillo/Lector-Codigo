-- Pruebas de relevamientos, fotos, vínculo de hallazgos y eventos de auditoría (fase 3 del plan v3).
-- Los eventos se filtran por las cuentas de prueba: la base real ya tiene eventos de otras personas.
-- Termina con ROLLBACK; la última consulta lista cada prueba con ok = true o false; todas deben dar true.
BEGIN;

CREATE TEMP TABLE resultado (prueba text, ok boolean, detalle text);
GRANT ALL ON TABLE resultado TO PUBLIC;
CREATE TEMP TABLE ctx AS SELECT (SELECT "id" FROM public."bien" ORDER BY "numeroInventario" LIMIT 1) AS bien_id;
GRANT SELECT ON TABLE ctx TO PUBLIC;
CREATE FUNCTION pg_temp.intentar(p text) RETURNS text LANGUAGE plpgsql AS $f$
BEGIN EXECUTE p; RETURN 'ok'; EXCEPTION WHEN OTHERS THEN RETURN SQLSTATE; END $f$;
CREATE FUNCTION pg_temp.contar(p text) RETURNS text LANGUAGE plpgsql AS $f$
DECLARE n int;
BEGIN EXECUTE 'SELECT count(*) FROM (' || p || ') t' INTO n; RETURN n::text; EXCEPTION WHEN OTHERS THEN RETURN SQLSTATE; END $f$;
CREATE FUNCTION pg_temp.chk(p text, esperado text, obtenido text) RETURNS void LANGUAGE sql AS $f$
INSERT INTO pg_temp.resultado VALUES (p, esperado = obtenido, 'esperado ' || esperado || ', obtenido ' || coalesce(obtenido, 'NULL')) $f$;
GRANT EXECUTE ON FUNCTION pg_temp.intentar(text), pg_temp.contar(text), pg_temp.chk(text, text, text) TO PUBLIC;

INSERT INTO public."usuario" ("id", "cuenta", "nombre", "rol", "estado", "authId") VALUES
  ('T-ADM', 'adm@prueba', 'Admin', 'administrador', 'activa', 'eeeeeeee-0000-0000-0000-000000000001'),
  ('T-R1',  'r1@prueba',  'Relevador 1', 'relevador', 'activa', 'eeeeeeee-0000-0000-0000-000000000002'),
  ('T-R2',  'r2@prueba',  'Relevador 2', 'relevador', 'activa', 'eeeeeeee-0000-0000-0000-000000000003'),
  ('T-SU',  'su@prueba',  'Suspendida', 'relevador', 'suspendida', 'eeeeeeee-0000-0000-0000-000000000004');

-- relevador 1 -------------------------------------------------------------------------------------------
SELECT set_config('request.jwt.claims', '{"sub":"eeeeeeee-0000-0000-0000-000000000002","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.chk('R1 registra dos relevamientos en un solo pedido', 'ok', pg_temp.intentar(
  $q$INSERT INTO public."relevamiento" ("idCliente","usuarioId","bienId","resultado","relevadoEnDispositivo","ubicacionObservada","loteId") VALUES
     ('aaaaaaaa-0000-4000-8000-000000000001','T-R1',(SELECT bien_id FROM pg_temp.ctx),'encontrado',now(),'Oficina 1','bbbbbbbb-0000-4000-8000-000000000001'),
     ('aaaaaaaa-0000-4000-8000-000000000002','T-R1',(SELECT bien_id FROM pg_temp.ctx),'encontrado',now(),'Oficina 1','bbbbbbbb-0000-4000-8000-000000000001')$q$));
SELECT pg_temp.chk('R1 reintenta el mismo pedido (idempotente)', 'ok', pg_temp.intentar(
  $q$INSERT INTO public."relevamiento" ("idCliente","usuarioId","bienId","resultado","relevadoEnDispositivo") VALUES
     ('aaaaaaaa-0000-4000-8000-000000000001','T-R1',(SELECT bien_id FROM pg_temp.ctx),'encontrado',now())
     ON CONFLICT ("idCliente") DO NOTHING$q$));
SELECT pg_temp.chk('R1 no duplica al reintentar', '2', pg_temp.contar($q$SELECT 1 FROM public."relevamiento"$q$));
SELECT pg_temp.chk('R1 registra un hallazgo', 'ok', pg_temp.intentar(
  $q$INSERT INTO public."relevamiento" ("idCliente","usuarioId","resultado","clase","descripcion","relevadoEnDispositivo") VALUES
     ('aaaaaaaa-0000-4000-8000-000000000003','T-R1','hallazgo','nuevo','Silla sin etiqueta',now())$q$));
SELECT pg_temp.chk('R1 registra una exportación', 'ok', pg_temp.intentar(
  $q$INSERT INTO public."exportacion" ("usuarioId","formato","filas","hashSha256","filtros") VALUES ('T-R1','csv',3,repeat('a',64),'{"alcance":"propios"}')$q$));
SELECT pg_temp.chk('R1 no puede adjuntar la foto antes de subirla', 'P0002', pg_temp.intentar($q$SELECT public.adjuntar_foto('aaaaaaaa-0000-4000-8000-000000000003', 5000, repeat('b',64))$q$));
SELECT pg_temp.chk('R1 sube su foto a su carpeta', 'ok', pg_temp.intentar(
  $q$INSERT INTO storage.objects (bucket_id, name) VALUES ('hallazgos', 'T-R1/aaaaaaaa-0000-4000-8000-000000000003.jpg')$q$));
SELECT pg_temp.chk('R1 no sube a la carpeta de otro', '42501', pg_temp.intentar(
  $q$INSERT INTO storage.objects (bucket_id, name) VALUES ('hallazgos', 'T-R2/x.jpg')$q$));
SELECT pg_temp.chk('R1 adjunta la foto', 'ok', pg_temp.intentar($q$SELECT public.adjuntar_foto('aaaaaaaa-0000-4000-8000-000000000003', 5000, repeat('b',64))$q$));
SELECT pg_temp.chk('R1 repite el adjunto (idempotente)', 'ok', pg_temp.intentar($q$SELECT public.adjuntar_foto('aaaaaaaa-0000-4000-8000-000000000003', 5000, repeat('b',64))$q$));
SELECT pg_temp.chk('solo un hallazgo lleva foto', '22023', pg_temp.intentar($q$SELECT public.adjuntar_foto('aaaaaaaa-0000-4000-8000-000000000001', 5000, repeat('b',64))$q$));
SELECT pg_temp.chk('R1 ve su foto', '1', pg_temp.contar($q$SELECT 1 FROM storage.objects WHERE bucket_id = 'hallazgos' AND name LIKE 'T-R1/%'$q$));
SELECT pg_temp.chk('R1 no vincula hallazgos', '42501', pg_temp.intentar($q$SELECT public.vincular_hallazgo((SELECT "id" FROM public."relevamiento" WHERE "idCliente"='aaaaaaaa-0000-4000-8000-000000000003'), (SELECT bien_id FROM pg_temp.ctx), 'motivo largo')$q$));
SELECT pg_temp.chk('R1 registra su inicio de sesión', 'ok', pg_temp.intentar($q$SELECT public.registrar_inicio_sesion()$q$));
RESET ROLE;

CREATE TEMP TABLE ctx_rel AS SELECT "id" FROM public."relevamiento" WHERE "idCliente" = 'aaaaaaaa-0000-4000-8000-000000000001';
GRANT SELECT ON TABLE ctx_rel TO PUBLIC;
SELECT pg_temp.chk('un pedido de dos filas deja un solo evento con la cantidad', '1/2/T-R1',
  (SELECT count(*)::text || '/' || max("datos" ->> 'cantidad') || '/' || max("actorUsuarioId")
   FROM public."evento_auditoria" WHERE "tipo" = 'RELEVAMIENTO_REGISTRADO' AND "actorUsuarioId" = 'T-R1' AND ("datos" ->> 'loteId') IS NOT NULL));
SELECT pg_temp.chk('el reintento no genera otro evento con filas', '2', (SELECT count(*)::text FROM public."evento_auditoria" WHERE "tipo" = 'RELEVAMIENTO_REGISTRADO' AND "actorUsuarioId" = 'T-R1'));
SELECT pg_temp.chk('la exportación deja su evento', 'T-R1/3', (SELECT "actorUsuarioId" || '/' || ("datos" ->> 'filas') FROM public."evento_auditoria" WHERE "tipo" = 'EXPORTACION_GENERADA' AND "actorUsuarioId" = 'T-R1'));
SELECT pg_temp.chk('adjuntar dos veces deja un solo evento de foto', '1', (SELECT count(*)::text FROM public."evento_auditoria" WHERE "tipo" = 'FOTO_ADJUNTADA' AND "actorUsuarioId" = 'T-R1'));
SELECT pg_temp.chk('el inicio de sesión queda registrado', 'true/1', (SELECT (u."ultimoAccesoEn" IS NOT NULL)::text || '/' || (SELECT count(*) FROM public."evento_auditoria" WHERE "tipo" = 'SESION_INICIADA' AND "actorUsuarioId" = 'T-R1')::text FROM public."usuario" u WHERE u."id" = 'T-R1'));
SELECT set_config('request.jwt.claims', '', true);  -- sin cuenta de la app, como el backend o un script
INSERT INTO public."relevamiento" ("idCliente","usuarioId","resultado","relevadoEnDispositivo") VALUES ('aaaaaaaa-0000-4000-8000-000000000009','T-R1','no_encontrado',now());
SELECT pg_temp.chk('lo que escribe el backend (sin cuenta de la app) no duplica eventos', '2', (SELECT count(*)::text FROM public."evento_auditoria" WHERE "tipo" = 'RELEVAMIENTO_REGISTRADO' AND "actorUsuarioId" = 'T-R1'));

-- relevador 2 -------------------------------------------------------------------------------------------
SELECT set_config('request.jwt.claims', '{"sub":"eeeeeeee-0000-0000-0000-000000000003","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.chk('R2 ve los últimos relevamientos de un bien (de otros)', '2/false', (SELECT count(*)::text || '/' || bool_or("propio")::text FROM public.relevamientos_de_bien((SELECT bien_id FROM pg_temp.ctx), 5)));
SELECT pg_temp.chk('R2 no ve sus relevamientos ajenos por la tabla', '0', pg_temp.contar($q$SELECT 1 FROM public."relevamiento"$q$));
SELECT pg_temp.chk('R2 ve los relevamientos de R1 por la función del equipo', 'true', (SELECT (count(*) >= 3)::text FROM public.relevamientos_visibles(NULL, false, 1000) WHERE "relevador" = 'Relevador 1' AND NOT "propio"));
SELECT pg_temp.chk('R2 abre un relevamiento de R1 con los datos del bien', 'true', (SELECT ("numeroInventario" IS NOT NULL)::text FROM public.relevamientos_visibles((SELECT "id" FROM pg_temp.ctx_rel), false, 1)));
SELECT pg_temp.chk('R2 con "solo míos" no ve lo de R1', '0', (SELECT count(*)::text FROM public.relevamientos_visibles(NULL, true, 300) WHERE "relevador" = 'Relevador 1'));
SELECT pg_temp.chk('R2 ve la foto de otro (equipo)', '1', pg_temp.contar($q$SELECT 1 FROM storage.objects WHERE bucket_id = 'hallazgos' AND name LIKE 'T-R1/%'$q$));
SELECT pg_temp.chk('R2 no adjunta foto a un hallazgo ajeno', '42501', pg_temp.intentar($q$SELECT public.adjuntar_foto('aaaaaaaa-0000-4000-8000-000000000003', 5000, repeat('b',64))$q$));
RESET ROLE;

-- administrador -------------------------------------------------------------------------------------------
SELECT set_config('request.jwt.claims', '{"sub":"eeeeeeee-0000-0000-0000-000000000001","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.chk('admin ve la foto de otro', '1', pg_temp.contar($q$SELECT 1 FROM storage.objects WHERE bucket_id = 'hallazgos' AND name LIKE 'T-R1/%'$q$));
SELECT pg_temp.chk('vincular: motivo corto', '22023', pg_temp.intentar($q$SELECT public.vincular_hallazgo((SELECT "id" FROM public."relevamiento" WHERE "idCliente"='aaaaaaaa-0000-4000-8000-000000000003'), (SELECT bien_id FROM pg_temp.ctx), 'ab')$q$));
SELECT pg_temp.chk('vincular: solo hallazgos', '22023', pg_temp.intentar($q$SELECT public.vincular_hallazgo((SELECT "id" FROM public."relevamiento" WHERE "idCliente"='aaaaaaaa-0000-4000-8000-000000000001'), (SELECT bien_id FROM pg_temp.ctx), 'motivo largo')$q$));
SELECT pg_temp.chk('vincular: bien inexistente', 'P0002', pg_temp.intentar($q$SELECT public.vincular_hallazgo((SELECT "id" FROM public."relevamiento" WHERE "idCliente"='aaaaaaaa-0000-4000-8000-000000000003'), 'no-existe', 'motivo largo')$q$));
SELECT pg_temp.chk('vincular: ok', 'ok', pg_temp.intentar($q$SELECT public.vincular_hallazgo((SELECT "id" FROM public."relevamiento" WHERE "idCliente"='aaaaaaaa-0000-4000-8000-000000000003'), (SELECT bien_id FROM pg_temp.ctx), 'Se reetiquetó el bien')$q$));
SELECT pg_temp.chk('vincular: ya vinculado', '22023', pg_temp.intentar($q$SELECT public.vincular_hallazgo((SELECT "id" FROM public."relevamiento" WHERE "idCliente"='aaaaaaaa-0000-4000-8000-000000000003'), (SELECT bien_id FROM pg_temp.ctx), 'motivo largo')$q$));
RESET ROLE;
SELECT pg_temp.chk('vincular deja el evento con motivo y número', 'T-ADM/Se reetiquetó el bien/true',
  (SELECT "actorUsuarioId" || '/' || "motivo" || '/' || (("datos" ->> 'numeroInventario') IS NOT NULL)::text FROM public."evento_auditoria" WHERE "tipo" = 'HALLAZGO_VINCULADO' AND "actorUsuarioId" = 'T-ADM'));

-- cuenta suspendida y anónimo -----------------------------------------------------------------------------
SELECT set_config('request.jwt.claims', '{"sub":"eeeeeeee-0000-0000-0000-000000000004","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.chk('suspendida no registra inicio de sesión', '42501', pg_temp.intentar($q$SELECT public.registrar_inicio_sesion()$q$));
SELECT pg_temp.chk('suspendida no ve los relevamientos del equipo', '42501', pg_temp.intentar($q$SELECT * FROM public.relevamientos_visibles(NULL, false, 10)$q$));
SELECT pg_temp.chk('suspendida no ve fotos', '0', pg_temp.contar($q$SELECT 1 FROM storage.objects WHERE bucket_id = 'hallazgos' AND name LIKE 'T-R1/%'$q$));
SELECT pg_temp.chk('suspendida no ve relevamientos de un bien', '42501', pg_temp.intentar($q$SELECT * FROM public.relevamientos_de_bien((SELECT bien_id FROM pg_temp.ctx), 5)$q$));
RESET ROLE;
SET LOCAL ROLE anon;
SELECT pg_temp.chk('anon no adjunta fotos', '42501', pg_temp.intentar($q$SELECT public.adjuntar_foto('x', 1, 'x')$q$));
SELECT pg_temp.chk('anon no vincula', '42501', pg_temp.intentar($q$SELECT public.vincular_hallazgo('x', 'x', 'motivo largo')$q$));
RESET ROLE;

SELECT prueba, ok, detalle FROM pg_temp.resultado ORDER BY ctid;
ROLLBACK;
