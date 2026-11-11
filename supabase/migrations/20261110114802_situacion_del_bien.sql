-- Situación administrativa de un bien: "en reparación", "para baja" o "prestado". Un bien en esa situación que no se encontró en una
-- jornada deja de contar como pendiente: la jornada lo muestra aparte y no lo cuenta entre lo esperado. Si igual se lo encuentra, cuenta
-- como cualquier otro. Solo un administrador declara o levanta una situación, siempre con motivo. Cada situación queda registrada con
-- quién y cuándo la declaró y la levantó (no se borra); hay una sola vigente por bien.
-- Las jornadas cerradas conservan sus números: se mira la situación que había al cerrarlas.

CREATE TABLE public."situacion_bien" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "bienId" text NOT NULL REFERENCES public."bien" ("id") ON DELETE RESTRICT,
  "situacion" text NOT NULL CHECK ("situacion" IN ('en_reparacion', 'para_baja', 'prestado')),
  "motivo" text NOT NULL CHECK (length("motivo") BETWEEN 3 AND 300),
  "declaradaPor" text NOT NULL REFERENCES public."usuario" ("id") ON DELETE RESTRICT,
  "declaradaEn" timestamp with time zone NOT NULL DEFAULT now(),
  "levantadaPor" text REFERENCES public."usuario" ("id") ON DELETE RESTRICT,
  "levantadaEn" timestamp with time zone,
  "motivoLevantada" text CHECK ("motivoLevantada" IS NULL OR length("motivoLevantada") <= 300),
  CHECK (("levantadaEn" IS NULL) = ("levantadaPor" IS NULL))
);
CREATE UNIQUE INDEX situacion_bien_una_vigente ON public."situacion_bien" ("bienId") WHERE "levantadaEn" IS NULL;
CREATE INDEX situacion_bien_por_bien ON public."situacion_bien" ("bienId", "declaradaEn");
ALTER TABLE public."situacion_bien" ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public."situacion_bien" TO authenticated;
CREATE POLICY situacion_bien_leer ON public."situacion_bien" FOR SELECT TO authenticated USING ((SELECT privado.es_activa()));
CREATE TRIGGER situacion_bien_auditar AFTER INSERT OR UPDATE OR DELETE ON public."situacion_bien"
  FOR EACH ROW EXECUTE FUNCTION public.registrar_cambio_fila();
ALTER PUBLICATION supabase_realtime ADD TABLE public."situacion_bien";

-- Declara (o cambia) la situación de un bien. Si ya tenía una distinta, esa se levanta y queda en el historial.
CREATE OR REPLACE FUNCTION public.declarar_situacion(p_bien_id text, p_situacion text, p_motivo text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_yo text := privado.usuario_actual();
  v_motivo text := btrim(coalesce(p_motivo, ''));
  v_vigente public."situacion_bien"%ROWTYPE;
BEGIN
  IF NOT privado.es_activa() OR NOT privado.es_administrador() THEN
    RAISE EXCEPTION 'Solo un administrador puede declarar la situación de un bien' USING ERRCODE = '42501';
  END IF;
  IF p_situacion IS NULL OR p_situacion NOT IN ('en_reparacion', 'para_baja', 'prestado') THEN
    RAISE EXCEPTION 'Situación inválida' USING ERRCODE = '22023';
  END IF;
  IF length(v_motivo) < 3 OR length(v_motivo) > 300 THEN
    RAISE EXCEPTION 'El motivo debe tener entre 3 y 300 caracteres' USING ERRCODE = '22023';
  END IF;
  PERFORM 1 FROM public."bien" b WHERE b."id" = p_bien_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'El bien no existe' USING ERRCODE = 'P0002';
  END IF;
  SELECT * INTO v_vigente FROM public."situacion_bien" s WHERE s."bienId" = p_bien_id AND s."levantadaEn" IS NULL;
  IF FOUND THEN
    IF v_vigente."situacion" = p_situacion AND v_vigente."motivo" = v_motivo THEN
      RETURN;
    END IF;
    UPDATE public."situacion_bien" SET "levantadaPor" = v_yo, "levantadaEn" = now(), "motivoLevantada" = 'Cambió la situación' WHERE "id" = v_vigente."id";
  END IF;
  INSERT INTO public."situacion_bien" ("bienId", "situacion", "motivo", "declaradaPor") VALUES (p_bien_id, p_situacion, v_motivo, v_yo);
  PERFORM privado.registrar_evento('SITUACION_DECLARADA', 'bien', p_bien_id, jsonb_build_object('situacion', p_situacion, 'motivo', v_motivo));
END;
$function$;

-- Levanta la situación vigente de un bien (volvió, se repuso o se decidió no darlo de baja). Si no tenía, no hace nada.
CREATE OR REPLACE FUNCTION public.levantar_situacion(p_bien_id text, p_motivo text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_yo text := privado.usuario_actual();
  v_motivo text := nullif(left(btrim(coalesce(p_motivo, '')), 300), '');
  v_id text;
  v_situacion text;
BEGIN
  IF NOT privado.es_activa() OR NOT privado.es_administrador() THEN
    RAISE EXCEPTION 'Solo un administrador puede levantar la situación de un bien' USING ERRCODE = '42501';
  END IF;
  SELECT s."id", s."situacion" INTO v_id, v_situacion FROM public."situacion_bien" s WHERE s."bienId" = p_bien_id AND s."levantadaEn" IS NULL FOR UPDATE;
  IF NOT FOUND THEN
    RETURN;
  END IF;
  UPDATE public."situacion_bien" SET "levantadaPor" = v_yo, "levantadaEn" = now(), "motivoLevantada" = v_motivo WHERE "id" = v_id;
  PERFORM privado.registrar_evento('SITUACION_LEVANTADA', 'bien', p_bien_id, jsonb_build_object('situacion', v_situacion, 'motivo', v_motivo));
END;
$function$;

REVOKE ALL ON FUNCTION public.declarar_situacion(text, text, text), public.levantar_situacion(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.declarar_situacion(text, text, text), public.levantar_situacion(text, text) TO authenticated;

-- Las jornadas no cuentan como esperado un bien con situación vigente que no se encontró (se mira la situación que había al cerrarla).
CREATE OR REPLACE FUNCTION public.listar_jornadas(p_estado text DEFAULT NULL::text, p_id text DEFAULT NULL::text)
 RETURNS TABLE(id text, tipo text, alcance text, nombre text, estado text, "creadaPor" text, "creadoEn" timestamp with time zone, "cerradaEn" timestamp with time zone, esperados integer, encontrados integer, propia boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF NOT privado.es_activa() THEN
    RAISE EXCEPTION 'La cuenta no está activa' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT j."id", j."tipo", j."alcance", j."nombre", j."estado", coalesce(u."nombre", u."cuenta"), j."creadoEn", j."cerradaEn",
    (SELECT count(*)::integer FROM public."bien" b
       WHERE ((j."tipo" = 'area' AND b."areaResponsable" = j."alcance") OR (j."tipo" = 'ubicacion' AND b."ubicacionFisica" = j."alcance"))
         AND (NOT EXISTS (SELECT 1 FROM public."situacion_bien" s
                          WHERE s."bienId" = b."id" AND s."declaradaEn" <= coalesce(j."cerradaEn", now()) AND (s."levantadaEn" IS NULL OR s."levantadaEn" > coalesce(j."cerradaEn", now())))
              OR EXISTS (SELECT 1 FROM public."relevamiento" r
                         WHERE r."jornadaId" = j."id" AND r."bienId" = b."id" AND r."resultado" = 'encontrado' AND r."anuladoEn" IS NULL))),
    (SELECT count(DISTINCT r."bienId")::integer FROM public."relevamiento" r JOIN public."bien" b ON b."id" = r."bienId"
       WHERE r."jornadaId" = j."id" AND r."resultado" = 'encontrado' AND r."anuladoEn" IS NULL
         AND ((j."tipo" = 'area' AND b."areaResponsable" = j."alcance") OR (j."tipo" = 'ubicacion' AND b."ubicacionFisica" = j."alcance"))),
    (j."creadaPor" = privado.usuario_actual())
  FROM public."jornada" j JOIN public."usuario" u ON u."id" = j."creadaPor"
  WHERE (p_estado IS NULL OR j."estado" = p_estado) AND (p_id IS NULL OR j."id" = p_id)
  ORDER BY j."creadoEn" DESC
  LIMIT 200;
END;
$function$;

-- Al cerrar, el evento registra cuántos bienes quedaron apartados (con situación y sin encontrar) y no cuentan entre los esperados.
CREATE OR REPLACE FUNCTION public.cerrar_jornada(p_id text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_creadora text;
  v_estado text;
  v_tipo text;
  v_alcance text;
  v_esperados integer;
  v_apartados integer;
  v_encontrados integer;
BEGIN
  IF NOT privado.es_activa() THEN
    RAISE EXCEPTION 'La cuenta no está activa' USING ERRCODE = '42501';
  END IF;
  SELECT j."creadaPor", j."estado", j."tipo", j."alcance" INTO v_creadora, v_estado, v_tipo, v_alcance
  FROM public."jornada" j WHERE j."id" = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'La jornada no existe' USING ERRCODE = 'P0002';
  END IF;
  IF v_creadora <> privado.usuario_actual() AND NOT privado.es_administrador() THEN
    RAISE EXCEPTION 'Solo quien creó la jornada o un administrador puede cerrarla' USING ERRCODE = '42501';
  END IF;
  IF v_estado = 'cerrada' THEN
    RAISE EXCEPTION 'La jornada ya está cerrada' USING ERRCODE = '22023';
  END IF;
  SELECT count(*) FILTER (WHERE NOT apartado OR hallado), count(*) FILTER (WHERE apartado AND NOT hallado)
  INTO v_esperados, v_apartados
  FROM (
    SELECT EXISTS (SELECT 1 FROM public."situacion_bien" s WHERE s."bienId" = b."id" AND s."levantadaEn" IS NULL) AS apartado,
           EXISTS (SELECT 1 FROM public."relevamiento" r WHERE r."jornadaId" = p_id AND r."bienId" = b."id" AND r."resultado" = 'encontrado' AND r."anuladoEn" IS NULL) AS hallado
    FROM public."bien" b
    WHERE (v_tipo = 'area' AND b."areaResponsable" = v_alcance) OR (v_tipo = 'ubicacion' AND b."ubicacionFisica" = v_alcance)
  ) x;
  SELECT count(DISTINCT r."bienId") INTO v_encontrados FROM public."relevamiento" r JOIN public."bien" b ON b."id" = r."bienId"
  WHERE r."jornadaId" = p_id AND r."resultado" = 'encontrado' AND r."anuladoEn" IS NULL
    AND ((v_tipo = 'area' AND b."areaResponsable" = v_alcance) OR (v_tipo = 'ubicacion' AND b."ubicacionFisica" = v_alcance));
  UPDATE public."jornada" SET "estado" = 'cerrada', "cerradaEn" = now(), "cerradaPor" = privado.usuario_actual() WHERE "id" = p_id;
  PERFORM privado.registrar_evento('JORNADA_CERRADA', 'jornada', p_id,
    jsonb_build_object('tipo', v_tipo, 'alcance', v_alcance, 'esperados', v_esperados, 'apartados', v_apartados, 'encontrados', v_encontrados));
END;
$function$;

-- El avance suma `situacion` y `motivoSituacion` (la que había al cerrar la jornada, o la vigente si sigue abierta).
-- Cambian las columnas: hace falta DROP y CREATE, y volver a dar los permisos.
DROP FUNCTION public.avance_jornada(text);
CREATE FUNCTION public.avance_jornada(p_id text)
 RETURNS TABLE(tipo text, "relevamientoId" text, "bienId" text, "numeroInventario" text, descripcion text, "ubicacionFisica" text, "areaResponsable" text, "responsableUso" text, "estadoBien" text, encontrado boolean, resultado text, "ubicacionObservada" text, relevador text, "relevadoEn" timestamp without time zone, "fueraDeLugar" boolean, lecturas integer, "tambienVieron" text[], discrepancia boolean, "codigoProvisorio" text, resuelta boolean, "notaResolucion" text, situacion text, "motivoSituacion" text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_tipo text;
  v_alcance text;
  v_momento timestamp with time zone;
BEGIN
  IF NOT privado.es_activa() THEN
    RAISE EXCEPTION 'La cuenta no está activa' USING ERRCODE = '42501';
  END IF;
  SELECT j."tipo", j."alcance", coalesce(j."cerradaEn"::timestamptz, now()) INTO v_tipo, v_alcance, v_momento FROM public."jornada" j WHERE j."id" = p_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'La jornada no existe' USING ERRCODE = 'P0002';
  END IF;
  RETURN QUERY
  WITH enalcance AS (
    SELECT b."id" AS bid FROM public."bien" b
    WHERE (v_tipo = 'area' AND b."areaResponsable" = v_alcance) OR (v_tipo = 'ubicacion' AND b."ubicacionFisica" = v_alcance)
  ),
  primeras AS (
    SELECT DISTINCT ON (r."bienId") r."id" AS rid, r."bienId" AS bid, r."usuarioId" AS uid, r."resultado" AS res,
           r."ubicacionObservada" AS obs, r."relevadoEnDispositivo" AS cuando,
           (r."id" = rd."relevamientoId") AS elegida, rd."nota" AS nota
    FROM public."relevamiento" r
    LEFT JOIN public."resolucion_discrepancia" rd ON rd."jornadaId" = r."jornadaId" AND rd."bienId" = r."bienId"
    WHERE r."jornadaId" = p_id AND r."resultado" = 'encontrado' AND r."bienId" IS NOT NULL AND r."anuladoEn" IS NULL
    ORDER BY r."bienId", coalesce(r."id" = rd."relevamientoId", false) DESC, r."sincronizadoEn", r."relevadoEnDispositivo", r."id"
  ),
  resumen AS (
    SELECT r."bienId" AS bid,
           count(*) FILTER (WHERE r."resultado" = 'encontrado')::integer AS lecturas,
           (count(DISTINCT (r."resultado", coalesce(r."ubicacionObservada", ''))) > 1) AS discrepancia
    FROM public."relevamiento" r
    WHERE r."jornadaId" = p_id AND r."bienId" IS NOT NULL AND r."anuladoEn" IS NULL
    GROUP BY r."bienId"
  ),
  tambien AS (
    SELECT r."bienId" AS bid, array_agg(DISTINCT coalesce(us."nombre", us."cuenta")) AS quienes
    FROM public."relevamiento" r
    JOIN public."usuario" us ON us."id" = r."usuarioId"
    JOIN primeras p ON p.bid = r."bienId" AND p.uid <> r."usuarioId"
    WHERE r."jornadaId" = p_id AND r."resultado" = 'encontrado' AND r."anuladoEn" IS NULL
    GROUP BY r."bienId"
  )
  SELECT 'esperado'::text, pr.rid, b."id", b."numeroInventario", b."descripcion", b."ubicacionFisica", b."areaResponsable",
         b."responsableUso", b."estadoBien", (pr.rid IS NOT NULL), pr.res::text, pr.obs, coalesce(us."nombre", us."cuenta"), pr.cuando,
         (pr.rid IS NOT NULL AND pr.obs IS NOT NULL AND pr.obs IS DISTINCT FROM b."ubicacionFisica"),
         coalesce(rs.lecturas, 0), coalesce(t.quienes, ARRAY[]::text[]),
         (coalesce(rs.discrepancia, false) AND NOT coalesce(pr.elegida, false)), NULL::text,
         coalesce(pr.elegida, false), CASE WHEN coalesce(pr.elegida, false) THEN pr.nota END,
         sit.sit_s, sit.sit_m
  FROM enalcance e
  JOIN public."bien" b ON b."id" = e.bid
  LEFT JOIN primeras pr ON pr.bid = b."id"
  LEFT JOIN public."usuario" us ON us."id" = pr.uid
  LEFT JOIN resumen rs ON rs.bid = b."id"
  LEFT JOIN tambien t ON t.bid = b."id"
  LEFT JOIN LATERAL (
    SELECT s."situacion" AS sit_s, s."motivo" AS sit_m FROM public."situacion_bien" s
    WHERE s."bienId" = b."id" AND s."declaradaEn" <= v_momento AND (s."levantadaEn" IS NULL OR s."levantadaEn" > v_momento)
    ORDER BY s."declaradaEn" DESC LIMIT 1
  ) sit ON true
  UNION ALL
  SELECT 'extra'::text, r."id", b."id", b."numeroInventario", coalesce(b."descripcion", r."descripcion", 'Código ' || r."valorLeido"),
         b."ubicacionFisica", b."areaResponsable", b."responsableUso", b."estadoBien", (r."resultado" = 'encontrado'), r."resultado"::text,
         r."ubicacionObservada", coalesce(us."nombre", us."cuenta"), r."relevadoEnDispositivo", false,
         1, ARRAY[]::text[], false, r."codigoProvisorio", false, NULL::text, NULL::text, NULL::text
  FROM public."relevamiento" r
  LEFT JOIN public."bien" b ON b."id" = r."bienId"
  LEFT JOIN public."usuario" us ON us."id" = r."usuarioId"
  WHERE r."jornadaId" = p_id AND r."anuladoEn" IS NULL AND (r."bienId" IS NULL OR r."bienId" NOT IN (SELECT e2.bid FROM enalcance e2));
END;
$function$;
REVOKE ALL ON FUNCTION public.avance_jornada(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.avance_jornada(text) TO authenticated;
