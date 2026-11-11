-- Dividir una jornada por sectores: en una jornada de un área, cada persona puede tomar una o más ubicaciones del área para que dos personas
-- no recorran lo mismo. Solo organiza: no impide leer fuera del propio sector. Un sector lo tiene una sola persona a la vez; se libera
-- cuando ella (o quien abrió la jornada, o un administrador) lo suelta. Lo liberado queda en el historial.
-- Todas las cuentas activas ven quién tiene cada sector; se escribe solo con funciones (con auditoría).

CREATE TABLE public."sector_jornada" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "jornadaId" text NOT NULL REFERENCES public."jornada" ("id") ON DELETE RESTRICT,
  "ubicacion" text NOT NULL CHECK (length("ubicacion") BETWEEN 1 AND 300),
  "usuarioId" text NOT NULL REFERENCES public."usuario" ("id") ON DELETE RESTRICT,
  "tomadoEn" timestamp with time zone NOT NULL DEFAULT now(),
  "liberadoPor" text REFERENCES public."usuario" ("id") ON DELETE RESTRICT,
  "liberadoEn" timestamp with time zone,
  CHECK (("liberadoEn" IS NULL) = ("liberadoPor" IS NULL))
);
CREATE UNIQUE INDEX sector_jornada_un_dueno ON public."sector_jornada" ("jornadaId", "ubicacion") WHERE "liberadoEn" IS NULL;
CREATE INDEX sector_jornada_por_jornada ON public."sector_jornada" ("jornadaId", "tomadoEn");
ALTER TABLE public."sector_jornada" ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public."sector_jornada" TO authenticated;
CREATE POLICY sector_jornada_leer ON public."sector_jornada" FOR SELECT TO authenticated USING ((SELECT privado.es_activa()));
CREATE TRIGGER sector_jornada_auditar AFTER INSERT OR UPDATE OR DELETE ON public."sector_jornada"
  FOR EACH ROW EXECUTE FUNCTION public.registrar_cambio_fila();
ALTER PUBLICATION supabase_realtime ADD TABLE public."sector_jornada";

-- Toma una ubicación del área de la jornada. Tomar el que ya es propio no hace nada; si lo tiene otra persona, falla (23505) y dice quién.
CREATE OR REPLACE FUNCTION public.tomar_sector(p_jornada text, p_ubicacion text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_yo text := privado.usuario_actual();
  v_ubicacion text := btrim(coalesce(p_ubicacion, ''));
  v_tipo text;
  v_alcance text;
  v_estado text;
  v_dueno text;
  v_nombre text;
BEGIN
  IF NOT privado.es_activa() THEN
    RAISE EXCEPTION 'La cuenta no está activa' USING ERRCODE = '42501';
  END IF;
  SELECT j."tipo", j."alcance", j."estado" INTO v_tipo, v_alcance, v_estado FROM public."jornada" j WHERE j."id" = p_jornada FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'La jornada no existe' USING ERRCODE = 'P0002';
  END IF;
  IF v_tipo <> 'area' THEN
    RAISE EXCEPTION 'Solo las jornadas de un área se dividen en sectores' USING ERRCODE = '22023';
  END IF;
  IF v_estado <> 'abierta' THEN
    RAISE EXCEPTION 'La jornada está cerrada' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public."bien" b WHERE b."areaResponsable" = v_alcance AND b."ubicacionFisica" = v_ubicacion) THEN
    RAISE EXCEPTION 'Esa ubicación no es del área de la jornada' USING ERRCODE = 'P0002';
  END IF;
  SELECT s."usuarioId" INTO v_dueno FROM public."sector_jornada" s WHERE s."jornadaId" = p_jornada AND s."ubicacion" = v_ubicacion AND s."liberadoEn" IS NULL;
  IF FOUND THEN
    IF v_dueno = v_yo THEN
      RETURN;
    END IF;
    SELECT coalesce(u."nombre", u."cuenta") INTO v_nombre FROM public."usuario" u WHERE u."id" = v_dueno;
    RAISE EXCEPTION 'Ese sector ya lo tiene %', v_nombre USING ERRCODE = '23505';
  END IF;
  INSERT INTO public."sector_jornada" ("jornadaId", "ubicacion", "usuarioId") VALUES (p_jornada, v_ubicacion, v_yo);
  PERFORM privado.registrar_evento('SECTOR_TOMADO', 'jornada', p_jornada, jsonb_build_object('ubicacion', v_ubicacion));
END;
$function$;

-- Suelta un sector. Puede hacerlo quien lo tiene, quien abrió la jornada o un administrador. Si nadie lo tiene, no hace nada.
CREATE OR REPLACE FUNCTION public.soltar_sector(p_jornada text, p_ubicacion text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_yo text := privado.usuario_actual();
  v_ubicacion text := btrim(coalesce(p_ubicacion, ''));
  v_id text;
  v_dueno text;
  v_creadora text;
BEGIN
  IF NOT privado.es_activa() THEN
    RAISE EXCEPTION 'La cuenta no está activa' USING ERRCODE = '42501';
  END IF;
  SELECT j."creadaPor" INTO v_creadora FROM public."jornada" j WHERE j."id" = p_jornada;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'La jornada no existe' USING ERRCODE = 'P0002';
  END IF;
  SELECT s."id", s."usuarioId" INTO v_id, v_dueno
  FROM public."sector_jornada" s WHERE s."jornadaId" = p_jornada AND s."ubicacion" = v_ubicacion AND s."liberadoEn" IS NULL FOR UPDATE;
  IF NOT FOUND THEN
    RETURN;
  END IF;
  IF v_dueno <> v_yo AND v_creadora <> v_yo AND NOT privado.es_administrador() THEN
    RAISE EXCEPTION 'Solo quien lo tiene, quien abrió la jornada o un administrador puede soltar el sector' USING ERRCODE = '42501';
  END IF;
  UPDATE public."sector_jornada" SET "liberadoPor" = v_yo, "liberadoEn" = now() WHERE "id" = v_id;
  PERFORM privado.registrar_evento('SECTOR_LIBERADO', 'jornada', p_jornada, jsonb_build_object('ubicacion', v_ubicacion, 'teniaLaPersona', v_dueno));
END;
$function$;

REVOKE ALL ON FUNCTION public.tomar_sector(text, text), public.soltar_sector(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tomar_sector(text, text), public.soltar_sector(text, text) TO authenticated;
