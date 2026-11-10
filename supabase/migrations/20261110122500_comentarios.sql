-- Comentarios en un bien o en una jornada: notas con autor y fecha ("prestado a otra oficina", "la puerta estaba cerrada").
-- Cualquier cuenta activa comenta y todas los ven. Un comentario no se edita ni se borra: quien lo escribió (o un administrador) puede
-- retirarlo y deja de mostrarse, pero queda registrado quién lo retiró y cuándo. Escribir y retirar pasan por funciones (con auditoría);
-- las cuentas no escriben en la tabla directamente. `idCliente` hace idempotente el envío (reintentar no duplica).

CREATE TABLE public."comentario" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "idCliente" text NOT NULL UNIQUE,
  "bienId" text REFERENCES public."bien" ("id") ON DELETE RESTRICT,
  "jornadaId" text REFERENCES public."jornada" ("id") ON DELETE RESTRICT,
  "texto" text NOT NULL CHECK (length("texto") BETWEEN 1 AND 500),
  "autorId" text NOT NULL REFERENCES public."usuario" ("id") ON DELETE RESTRICT,
  "creadoEn" timestamp with time zone NOT NULL DEFAULT now(),
  "retiradoPor" text REFERENCES public."usuario" ("id") ON DELETE RESTRICT,
  "retiradoEn" timestamp with time zone,
  CHECK ("bienId" IS NOT NULL OR "jornadaId" IS NOT NULL),
  CHECK (("retiradoEn" IS NULL) = ("retiradoPor" IS NULL))
);
CREATE INDEX comentario_por_bien ON public."comentario" ("bienId", "creadoEn");
CREATE INDEX comentario_por_jornada ON public."comentario" ("jornadaId", "creadoEn");
ALTER TABLE public."comentario" ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public."comentario" TO authenticated;
CREATE POLICY comentario_leer ON public."comentario" FOR SELECT TO authenticated USING ((SELECT privado.es_activa()));
CREATE TRIGGER comentario_auditar AFTER INSERT OR UPDATE OR DELETE ON public."comentario"
  FOR EACH ROW EXECUTE FUNCTION public.registrar_cambio_fila();
ALTER PUBLICATION supabase_realtime ADD TABLE public."comentario";

-- Escribe un comentario sobre un bien, sobre una jornada o sobre ambos. Devuelve su id; repetir el mismo `p_id_cliente` devuelve el mismo comentario.
CREATE OR REPLACE FUNCTION public.comentar(p_bien_id text, p_jornada_id text, p_texto text, p_id_cliente text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_yo text := privado.usuario_actual();
  v_texto text := btrim(coalesce(p_texto, ''));
  v_id text;
BEGIN
  IF NOT privado.es_activa() THEN
    RAISE EXCEPTION 'La cuenta no está activa' USING ERRCODE = '42501';
  END IF;
  IF p_id_cliente IS NULL OR p_id_cliente !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' THEN
    RAISE EXCEPTION 'idCliente debe ser un UUID' USING ERRCODE = '22023';
  END IF;
  IF length(v_texto) < 1 OR length(v_texto) > 500 THEN
    RAISE EXCEPTION 'El comentario debe tener entre 1 y 500 caracteres' USING ERRCODE = '22023';
  END IF;
  IF p_bien_id IS NULL AND p_jornada_id IS NULL THEN
    RAISE EXCEPTION 'Indicá el bien o la jornada' USING ERRCODE = '22023';
  END IF;
  IF p_bien_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public."bien" b WHERE b."id" = p_bien_id) THEN
    RAISE EXCEPTION 'El bien no existe' USING ERRCODE = 'P0002';
  END IF;
  IF p_jornada_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public."jornada" j WHERE j."id" = p_jornada_id) THEN
    RAISE EXCEPTION 'La jornada no existe' USING ERRCODE = 'P0002';
  END IF;
  INSERT INTO public."comentario" ("idCliente", "bienId", "jornadaId", "texto", "autorId")
  VALUES (p_id_cliente, p_bien_id, p_jornada_id, v_texto, v_yo)
  ON CONFLICT ("idCliente") DO NOTHING
  RETURNING "id" INTO v_id;
  IF v_id IS NULL THEN
    SELECT c."id" INTO v_id FROM public."comentario" c WHERE c."idCliente" = p_id_cliente AND c."autorId" = v_yo;
    IF v_id IS NULL THEN
      RAISE EXCEPTION 'idCliente repetido' USING ERRCODE = '22023';
    END IF;
    RETURN v_id;
  END IF;
  PERFORM privado.registrar_evento('COMENTARIO_CREADO', CASE WHEN p_bien_id IS NOT NULL THEN 'bien' ELSE 'jornada' END, coalesce(p_bien_id, p_jornada_id),
    jsonb_build_object('comentarioId', v_id, 'bienId', p_bien_id, 'jornadaId', p_jornada_id));
  RETURN v_id;
END;
$function$;

-- Retira un comentario: quien lo escribió o un administrador. Deja de mostrarse; queda quién lo retiró y cuándo. Repetir no hace nada.
CREATE OR REPLACE FUNCTION public.retirar_comentario(p_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_yo text := privado.usuario_actual();
  v_autor text;
  v_retirado timestamp with time zone;
  v_bien text;
  v_jornada text;
BEGIN
  IF NOT privado.es_activa() THEN
    RAISE EXCEPTION 'La cuenta no está activa' USING ERRCODE = '42501';
  END IF;
  SELECT c."autorId", c."retiradoEn", c."bienId", c."jornadaId" INTO v_autor, v_retirado, v_bien, v_jornada
  FROM public."comentario" c WHERE c."id" = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'El comentario no existe' USING ERRCODE = 'P0002';
  END IF;
  IF v_autor <> v_yo AND NOT privado.es_administrador() THEN
    RAISE EXCEPTION 'Solo quien lo escribió o un administrador puede retirar un comentario' USING ERRCODE = '42501';
  END IF;
  IF v_retirado IS NOT NULL THEN
    RETURN;
  END IF;
  UPDATE public."comentario" SET "retiradoPor" = v_yo, "retiradoEn" = now() WHERE "id" = p_id;
  PERFORM privado.registrar_evento('COMENTARIO_RETIRADO', CASE WHEN v_bien IS NOT NULL THEN 'bien' ELSE 'jornada' END, coalesce(v_bien, v_jornada),
    jsonb_build_object('comentarioId', p_id));
END;
$function$;

REVOKE ALL ON FUNCTION public.comentar(text, text, text, text), public.retirar_comentario(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.comentar(text, text, text, text), public.retirar_comentario(text) TO authenticated;
