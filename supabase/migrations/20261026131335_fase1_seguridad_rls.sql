-- Fase 1 del plan v3: seguridad por RLS y privilegios mínimos (ADR 0005 y 0006).
-- Aditiva: el backend NestJS actual se conecta como `postgres` y no se ve afectado.

-- 1. Vínculo de cada cuenta con Supabase Auth -------------------------------------------------------
ALTER TABLE public."usuario" ADD COLUMN IF NOT EXISTS "authId" uuid;
CREATE UNIQUE INDEX IF NOT EXISTS "usuario_authId_key" ON public."usuario" ("authId");

-- 2. Esquema privado: la API pública de Supabase no lo expone ---------------------------------------
CREATE SCHEMA IF NOT EXISTS privado;
REVOKE ALL ON SCHEMA privado FROM PUBLIC;
GRANT USAGE ON SCHEMA privado TO authenticated;

-- Identificador de `usuario` de quien hace el pedido (nulo si no tiene cuenta).
CREATE OR REPLACE FUNCTION privado.usuario_actual() RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$ SELECT u."id" FROM public."usuario" u WHERE u."authId" = (SELECT auth.uid()) $$;

-- Cuenta activa: una cuenta suspendida o dada de baja pierde el acceso al instante, con o sin token.
CREATE OR REPLACE FUNCTION privado.es_activa() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$ SELECT EXISTS (
  SELECT 1 FROM public."usuario" u WHERE u."authId" = (SELECT auth.uid()) AND u."estado" = 'activa'
) $$;

CREATE OR REPLACE FUNCTION privado.es_administrador() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$ SELECT EXISTS (
  SELECT 1 FROM public."usuario" u
  WHERE u."authId" = (SELECT auth.uid()) AND u."estado" = 'activa' AND u."rol" = 'administrador'
) $$;

REVOKE ALL ON FUNCTION privado.usuario_actual(), privado.es_activa(), privado.es_administrador() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION privado.usuario_actual(), privado.es_activa(), privado.es_administrador() TO authenticated;

-- Al crear una cuenta se vincula sola con el usuario de Supabase Auth que tenga ese correo.
CREATE OR REPLACE FUNCTION privado.vincular_auth() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  IF NEW."authId" IS NULL THEN
    SELECT a.id INTO NEW."authId" FROM auth.users a WHERE lower(a.email) = lower(NEW."cuenta") LIMIT 1;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION privado.vincular_auth() FROM PUBLIC;
CREATE TRIGGER usuario_vincular_auth BEFORE INSERT ON public."usuario"
  FOR EACH ROW EXECUTE FUNCTION privado.vincular_auth();

UPDATE public."usuario" u SET "authId" = a.id
FROM auth.users a WHERE lower(a.email) = lower(u."cuenta") AND u."authId" IS NULL;

-- 3. Privilegios mínimos ----------------------------------------------------------------------------
-- Supabase concede por defecto todos los privilegios a anon y authenticated; hoy solo los frena RLS.
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon, authenticated;

GRANT SELECT ON public."usuario", public."bien", public."codigo_bien", public."relevamiento",
  public."exportacion", public."evento_auditoria", public."cambio_fila" TO authenticated;
GRANT UPDATE ("nombre") ON public."usuario" TO authenticated;
GRANT INSERT ON public."relevamiento", public."exportacion" TO authenticated;

-- 4. Políticas ---------------------------------------------------------------------------------------
-- `usuario`: cada cuenta ve la suya; el administrador ve todas. Solo se edita el propio nombre.
CREATE POLICY usuario_leer ON public."usuario" FOR SELECT TO authenticated
  USING ("id" = (SELECT privado.usuario_actual()) OR (SELECT privado.es_administrador()));
CREATE POLICY usuario_editar_nombre ON public."usuario" FOR UPDATE TO authenticated
  USING ("id" = (SELECT privado.usuario_actual()) AND (SELECT privado.es_activa()))
  WITH CHECK ("id" = (SELECT privado.usuario_actual()));

-- Catálogo: lo leen las cuentas activas. Se escribe solo desde funciones de administración.
CREATE POLICY bien_leer ON public."bien" FOR SELECT TO authenticated USING ((SELECT privado.es_activa()));
CREATE POLICY codigo_bien_leer ON public."codigo_bien" FOR SELECT TO authenticated USING ((SELECT privado.es_activa()));

-- Relevamientos: cada cuenta ve e inserta los suyos; el administrador ve todos. Nadie modifica ni borra.
CREATE POLICY relevamiento_leer ON public."relevamiento" FOR SELECT TO authenticated
  USING ((SELECT privado.es_activa())
    AND ("usuarioId" = (SELECT privado.usuario_actual()) OR (SELECT privado.es_administrador())));
CREATE POLICY relevamiento_insertar ON public."relevamiento" FOR INSERT TO authenticated
  WITH CHECK ((SELECT privado.es_activa()) AND "usuarioId" = (SELECT privado.usuario_actual()));

CREATE POLICY exportacion_leer ON public."exportacion" FOR SELECT TO authenticated
  USING ((SELECT privado.es_activa())
    AND ("usuarioId" = (SELECT privado.usuario_actual()) OR (SELECT privado.es_administrador())));
CREATE POLICY exportacion_insertar ON public."exportacion" FOR INSERT TO authenticated
  WITH CHECK ((SELECT privado.es_activa()) AND "usuarioId" = (SELECT privado.usuario_actual()));

-- Auditoría: solo lectura. El administrador ve todo; cada cuenta, sus propios eventos.
CREATE POLICY evento_auditoria_leer ON public."evento_auditoria" FOR SELECT TO authenticated
  USING ((SELECT privado.es_administrador())
    OR ((SELECT privado.es_activa()) AND "actorUsuarioId" = (SELECT privado.usuario_actual())));
CREATE POLICY cambio_fila_leer ON public."cambio_fila" FOR SELECT TO authenticated
  USING ((SELECT privado.es_administrador()));

-- 5. Validaciones que hacía el backend, ahora en la base -------------------------------------------
ALTER TABLE public."relevamiento" ALTER COLUMN "id" SET DEFAULT gen_random_uuid()::text;
ALTER TABLE public."exportacion" ALTER COLUMN "id" SET DEFAULT gen_random_uuid()::text;
ALTER TABLE public."evento_auditoria" ALTER COLUMN "id" SET DEFAULT gen_random_uuid()::text;

ALTER TABLE public."relevamiento"
  ADD CONSTRAINT relevamiento_idcliente_uuid CHECK
    ("idCliente" ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') NOT VALID,
  ADD CONSTRAINT relevamiento_loteid_uuid CHECK
    ("loteId" IS NULL OR "loteId" ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') NOT VALID,
  ADD CONSTRAINT relevamiento_largos CHECK (
    length("valorLeido") <= 200 AND length("ubicacionObservada") <= 300 AND length("observaciones") <= 500
    AND length("estadoDetectado") <= 100 AND length("numeroSerie") <= 100 AND length("descripcion") <= 300) NOT VALID,
  ADD CONSTRAINT relevamiento_coherente CHECK (
    CASE "resultado"
      WHEN 'encontrado' THEN "bienId" IS NOT NULL
      WHEN 'hallazgo' THEN "clase" IS NOT NULL AND length(btrim(coalesce("descripcion", ''))) BETWEEN 3 AND 300
      ELSE true
    END) NOT VALID;
ALTER TABLE public."relevamiento"
  VALIDATE CONSTRAINT relevamiento_idcliente_uuid,
  VALIDATE CONSTRAINT relevamiento_loteid_uuid,
  VALIDATE CONSTRAINT relevamiento_largos,
  VALIDATE CONSTRAINT relevamiento_coherente;

ALTER TABLE public."exportacion"
  ADD CONSTRAINT exportacion_valida CHECK (
    "formato" IN ('csv', 'pdf') AND "filas" >= 0 AND ("hashSha256" IS NULL OR "hashSha256" ~ '^[0-9a-f]{64}$')) NOT VALID;
ALTER TABLE public."exportacion" VALIDATE CONSTRAINT exportacion_valida;

-- Fecha de sincronización y código provisorio los fija la base, no el cliente.
CREATE OR REPLACE FUNCTION privado.preparar_relevamiento() RETURNS trigger
LANGUAGE plpgsql SET search_path = ''
AS $$
BEGIN
  NEW."sincronizadoEn" := now();
  NEW."codigoProvisorio" := CASE WHEN NEW."resultado" = 'hallazgo'
    THEN 'H-' || upper(substr(replace(NEW."idCliente", '-', ''), 1, 8)) ELSE NULL END;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION privado.preparar_relevamiento() FROM PUBLIC;
CREATE TRIGGER relevamiento_preparar BEFORE INSERT ON public."relevamiento"
  FOR EACH ROW EXECUTE FUNCTION privado.preparar_relevamiento();

-- 6. Auditoría: el actor sale de app.usuario_id (backend actual) o de auth.uid() --------------------
-- SECURITY DEFINER porque los clientes ya no pueden escribir en `cambio_fila`.
CREATE OR REPLACE FUNCTION public.registrar_cambio_fila() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  fila jsonb := to_jsonb(CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END);
BEGIN
  INSERT INTO public."cambio_fila" ("tabla", "operacion", "filaId", "antes", "despues", "actorUsuarioId")
  VALUES (
    TG_TABLE_NAME,
    TG_OP,
    fila ->> 'id',
    CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE to_jsonb(OLD) END,
    CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE to_jsonb(NEW) END,
    coalesce(NULLIF(current_setting('app.usuario_id', true), ''), privado.usuario_actual())
  );
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.registrar_cambio_fila() FROM PUBLIC, anon, authenticated;

-- Para funciones de administración y Edge Functions: escribe un evento de negocio a nombre de quien llama.
CREATE OR REPLACE FUNCTION privado.registrar_evento(
  p_tipo text, p_entidad_tipo text DEFAULT NULL, p_entidad_id text DEFAULT NULL,
  p_datos jsonb DEFAULT NULL, p_motivo text DEFAULT NULL, p_resultado text DEFAULT 'ok'
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_id text := privado.usuario_actual();
  v_rol public."Rol";
BEGIN
  SELECT u."rol" INTO v_rol FROM public."usuario" u WHERE u."id" = v_id;
  INSERT INTO public."evento_auditoria" ("tipo", "actorUsuarioId", "actorRol", "entidadTipo", "entidadId", "datos", "motivo", "resultado")
  VALUES (p_tipo, v_id, v_rol, p_entidad_tipo, p_entidad_id, p_datos, p_motivo, p_resultado);
END;
$$;
REVOKE ALL ON FUNCTION privado.registrar_evento(text, text, text, jsonb, text, text) FROM PUBLIC;

COMMENT ON SCHEMA privado IS 'Funciones de apoyo de RLS y auditoría. No se expone por la API de Supabase.';
