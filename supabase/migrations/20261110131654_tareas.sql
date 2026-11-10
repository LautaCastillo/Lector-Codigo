-- Planificar jornadas: un administrador asigna a una persona un área o una ubicación para relevar, con fecha y una nota. La persona ve sus
-- tareas ("Mis tareas"), las empieza (abre o se suma a la jornada de ese alcance) y las marca como hechas. Un administrador ve y cancela todas.
-- Las tareas no se borran: pasan a "hecha" o "cancelada" y queda quién y cuándo. Se escribe solo con funciones (con auditoría).
-- Cada cuenta ve sus tareas; los administradores ven todas.

CREATE TABLE public."tarea" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "tipo" text NOT NULL CHECK ("tipo" IN ('area', 'ubicacion')),
  "alcance" text NOT NULL CHECK (length("alcance") BETWEEN 1 AND 300),
  "asignadaA" text NOT NULL REFERENCES public."usuario" ("id") ON DELETE RESTRICT,
  "fechaPrevista" date NOT NULL,
  "nota" text CHECK ("nota" IS NULL OR length("nota") <= 300),
  "estado" text NOT NULL DEFAULT 'pendiente' CHECK ("estado" IN ('pendiente', 'hecha', 'cancelada')),
  "jornadaId" text REFERENCES public."jornada" ("id") ON DELETE RESTRICT,
  "creadaPor" text NOT NULL REFERENCES public."usuario" ("id") ON DELETE RESTRICT,
  "creadaEn" timestamp with time zone NOT NULL DEFAULT now(),
  "resueltaPor" text REFERENCES public."usuario" ("id") ON DELETE RESTRICT,
  "resueltaEn" timestamp with time zone,
  CHECK (("estado" = 'pendiente') = ("resueltaEn" IS NULL)),
  CHECK (("resueltaEn" IS NULL) = ("resueltaPor" IS NULL))
);
CREATE INDEX tarea_por_persona ON public."tarea" ("asignadaA", "estado", "fechaPrevista");
ALTER TABLE public."tarea" ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public."tarea" TO authenticated;
CREATE POLICY tarea_leer ON public."tarea" FOR SELECT TO authenticated
  USING ((SELECT privado.es_activa()) AND ("asignadaA" = (SELECT privado.usuario_actual()) OR (SELECT privado.es_administrador())));
CREATE TRIGGER tarea_auditar AFTER INSERT OR UPDATE OR DELETE ON public."tarea"
  FOR EACH ROW EXECUTE FUNCTION public.registrar_cambio_fila();
ALTER PUBLICATION supabase_realtime ADD TABLE public."tarea";

-- Asigna un área o una ubicación a una persona activa. Solo administradores. Devuelve el id de la tarea.
CREATE OR REPLACE FUNCTION public.asignar_tarea(p_tipo text, p_alcance text, p_usuario text, p_fecha date, p_nota text DEFAULT NULL)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_yo text := privado.usuario_actual();
  v_alcance text := btrim(coalesce(p_alcance, ''));
  v_nota text := nullif(left(btrim(coalesce(p_nota, '')), 300), '');
  v_id text;
BEGIN
  IF NOT (privado.es_activa() AND privado.es_administrador()) THEN
    RAISE EXCEPTION 'Solo un administrador puede asignar tareas' USING ERRCODE = '42501';
  END IF;
  IF p_tipo IS NULL OR p_tipo NOT IN ('area', 'ubicacion') THEN
    RAISE EXCEPTION 'El tipo debe ser area o ubicacion' USING ERRCODE = '22023';
  END IF;
  IF p_fecha IS NULL THEN
    RAISE EXCEPTION 'Indicá la fecha prevista' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public."bien" b
    WHERE (p_tipo = 'area' AND b."areaResponsable" = v_alcance) OR (p_tipo = 'ubicacion' AND b."ubicacionFisica" = v_alcance)
  ) THEN
    RAISE EXCEPTION 'No hay bienes en esa área o ubicación' USING ERRCODE = 'P0002';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public."usuario" u WHERE u."id" = p_usuario AND u."estado" = 'activa') THEN
    RAISE EXCEPTION 'La persona no existe o no tiene la cuenta activa' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public."tarea" ("tipo", "alcance", "asignadaA", "fechaPrevista", "nota", "creadaPor")
  VALUES (p_tipo, v_alcance, p_usuario, p_fecha, v_nota, v_yo)
  RETURNING "id" INTO v_id;
  PERFORM privado.registrar_evento('TAREA_ASIGNADA', 'tarea', v_id,
    jsonb_build_object('tipo', p_tipo, 'alcance', v_alcance, 'asignadaA', p_usuario, 'fechaPrevista', p_fecha));
  RETURN v_id;
END;
$function$;

-- Empieza una tarea: abre la jornada de su alcance (o se suma a la que ya está abierta) y la vincula a la tarea. Solo quien la tiene
-- asignada. Devuelve el id de la jornada. Repetirlo devuelve la misma jornada mientras la tarea siga pendiente.
CREATE OR REPLACE FUNCTION public.iniciar_tarea(p_id text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_yo text := privado.usuario_actual();
  v_tarea public."tarea"%ROWTYPE;
  v_jornada text;
BEGIN
  IF NOT privado.es_activa() THEN
    RAISE EXCEPTION 'La cuenta no está activa' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_tarea FROM public."tarea" t WHERE t."id" = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'La tarea no existe' USING ERRCODE = 'P0002';
  END IF;
  IF v_tarea."asignadaA" <> v_yo THEN
    RAISE EXCEPTION 'La tarea es de otra persona' USING ERRCODE = '42501';
  END IF;
  IF v_tarea."estado" <> 'pendiente' THEN
    RAISE EXCEPTION 'La tarea ya no está pendiente' USING ERRCODE = '22023';
  END IF;
  v_jornada := public.crear_jornada(v_tarea."tipo", v_tarea."alcance", NULL);
  IF v_tarea."jornadaId" IS DISTINCT FROM v_jornada THEN
    UPDATE public."tarea" SET "jornadaId" = v_jornada WHERE "id" = p_id;
    PERFORM privado.registrar_evento('TAREA_INICIADA', 'tarea', p_id, jsonb_build_object('jornadaId', v_jornada));
  END IF;
  RETURN v_jornada;
END;
$function$;

-- La persona (o un administrador) marca la tarea como hecha. Repetirlo no hace nada; una tarea cancelada no se puede marcar.
CREATE OR REPLACE FUNCTION public.terminar_tarea(p_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_yo text := privado.usuario_actual();
  v_asignada text;
  v_estado text;
BEGIN
  IF NOT privado.es_activa() THEN
    RAISE EXCEPTION 'La cuenta no está activa' USING ERRCODE = '42501';
  END IF;
  SELECT t."asignadaA", t."estado" INTO v_asignada, v_estado FROM public."tarea" t WHERE t."id" = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'La tarea no existe' USING ERRCODE = 'P0002';
  END IF;
  IF v_asignada <> v_yo AND NOT privado.es_administrador() THEN
    RAISE EXCEPTION 'Solo la persona asignada o un administrador puede terminar la tarea' USING ERRCODE = '42501';
  END IF;
  IF v_estado = 'hecha' THEN
    RETURN;
  END IF;
  IF v_estado <> 'pendiente' THEN
    RAISE EXCEPTION 'La tarea está cancelada' USING ERRCODE = '22023';
  END IF;
  UPDATE public."tarea" SET "estado" = 'hecha', "resueltaEn" = now(), "resueltaPor" = v_yo WHERE "id" = p_id;
  PERFORM privado.registrar_evento('TAREA_TERMINADA', 'tarea', p_id, '{}'::jsonb);
END;
$function$;

-- Un administrador cancela una tarea pendiente. Repetirlo no hace nada; una tarea hecha no se puede cancelar.
CREATE OR REPLACE FUNCTION public.cancelar_tarea(p_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_yo text := privado.usuario_actual();
  v_estado text;
BEGIN
  IF NOT (privado.es_activa() AND privado.es_administrador()) THEN
    RAISE EXCEPTION 'Solo un administrador puede cancelar tareas' USING ERRCODE = '42501';
  END IF;
  SELECT t."estado" INTO v_estado FROM public."tarea" t WHERE t."id" = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'La tarea no existe' USING ERRCODE = 'P0002';
  END IF;
  IF v_estado = 'cancelada' THEN
    RETURN;
  END IF;
  IF v_estado <> 'pendiente' THEN
    RAISE EXCEPTION 'La tarea ya está hecha' USING ERRCODE = '22023';
  END IF;
  UPDATE public."tarea" SET "estado" = 'cancelada', "resueltaEn" = now(), "resueltaPor" = v_yo WHERE "id" = p_id;
  PERFORM privado.registrar_evento('TAREA_CANCELADA', 'tarea', p_id, '{}'::jsonb);
END;
$function$;

REVOKE ALL ON FUNCTION public.asignar_tarea(text, text, text, date, text), public.iniciar_tarea(text), public.terminar_tarea(text), public.cancelar_tarea(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.asignar_tarea(text, text, text, date, text), public.iniciar_tarea(text), public.terminar_tarea(text), public.cancelar_tarea(text) TO authenticated;
