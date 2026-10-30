-- Cuando dos personas leen el mismo bien en una jornada se conservan ambas lecturas (ADR 0004), pero el bien figura relevado por la
-- PRIMERA, según la hora del servidor (no la del teléfono, que puede estar mal puesta). Las demás se informan como "también lo vieron",
-- y si las lecturas no coinciden (otro resultado u otra ubicación) el bien se marca con una discrepancia para que alguien lo revise.

DROP FUNCTION public.avance_jornada(text);

CREATE FUNCTION public.avance_jornada(p_id text)
RETURNS TABLE (
  "tipo" text, "relevamientoId" text, "bienId" text, "numeroInventario" text, "descripcion" text, "ubicacionFisica" text,
  "areaResponsable" text, "responsableUso" text, "estadoBien" text, "encontrado" boolean, "resultado" text,
  "ubicacionObservada" text, "relevador" text, "relevadoEn" timestamp, "fueraDeLugar" boolean,
  "lecturas" integer, "tambienVieron" text[], "discrepancia" boolean
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_tipo text;
  v_alcance text;
BEGIN
  IF NOT privado.es_activa() THEN
    RAISE EXCEPTION 'La cuenta no está activa' USING ERRCODE = '42501';
  END IF;
  SELECT j."tipo", j."alcance" INTO v_tipo, v_alcance FROM public."jornada" j WHERE j."id" = p_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'La jornada no existe' USING ERRCODE = 'P0002';
  END IF;
  RETURN QUERY
  WITH enalcance AS (
    SELECT b."id" AS bid FROM public."bien" b
    WHERE (v_tipo = 'area' AND b."areaResponsable" = v_alcance) OR (v_tipo = 'ubicacion' AND b."ubicacionFisica" = v_alcance)
  ),
  -- La primera lectura "encontrado" de cada bien: hora de llegada al servidor; si empatan, la del teléfono y después el id.
  primeras AS (
    SELECT DISTINCT ON (r."bienId") r."id" AS rid, r."bienId" AS bid, r."usuarioId" AS uid, r."resultado" AS res,
           r."ubicacionObservada" AS obs, r."relevadoEnDispositivo" AS cuando
    FROM public."relevamiento" r
    WHERE r."jornadaId" = p_id AND r."resultado" = 'encontrado' AND r."bienId" IS NOT NULL
    ORDER BY r."bienId", r."sincronizadoEn", r."relevadoEnDispositivo", r."id"
  ),
  -- Resumen de todas las lecturas del bien en la jornada.
  resumen AS (
    SELECT r."bienId" AS bid,
           count(*) FILTER (WHERE r."resultado" = 'encontrado')::integer AS lecturas,
           (count(DISTINCT (r."resultado", coalesce(r."ubicacionObservada", ''))) > 1) AS discrepancia
    FROM public."relevamiento" r
    WHERE r."jornadaId" = p_id AND r."bienId" IS NOT NULL
    GROUP BY r."bienId"
  ),
  -- Las otras personas que también lo leyeron (sin repetir a quien lo relevó primero).
  tambien AS (
    SELECT r."bienId" AS bid, array_agg(DISTINCT coalesce(us."nombre", us."cuenta")) AS quienes
    FROM public."relevamiento" r
    JOIN public."usuario" us ON us."id" = r."usuarioId"
    JOIN primeras p ON p.bid = r."bienId" AND p.uid <> r."usuarioId"
    WHERE r."jornadaId" = p_id AND r."resultado" = 'encontrado'
    GROUP BY r."bienId"
  )
  SELECT 'esperado'::text, pr.rid, b."id", b."numeroInventario", b."descripcion", b."ubicacionFisica", b."areaResponsable",
         b."responsableUso", b."estadoBien", (pr.rid IS NOT NULL), pr.res::text, pr.obs, coalesce(us."nombre", us."cuenta"), pr.cuando,
         (pr.rid IS NOT NULL AND pr.obs IS NOT NULL AND pr.obs IS DISTINCT FROM b."ubicacionFisica"),
         coalesce(rs.lecturas, 0), coalesce(t.quienes, ARRAY[]::text[]), coalesce(rs.discrepancia, false)
  FROM enalcance e
  JOIN public."bien" b ON b."id" = e.bid
  LEFT JOIN primeras pr ON pr.bid = b."id"
  LEFT JOIN public."usuario" us ON us."id" = pr.uid
  LEFT JOIN resumen rs ON rs.bid = b."id"
  LEFT JOIN tambien t ON t.bid = b."id"
  UNION ALL
  SELECT 'extra'::text, r."id", b."id", b."numeroInventario", coalesce(b."descripcion", r."descripcion"), b."ubicacionFisica",
         b."areaResponsable", b."responsableUso", b."estadoBien", (r."resultado" = 'encontrado'), r."resultado"::text,
         r."ubicacionObservada", coalesce(us."nombre", us."cuenta"), r."relevadoEnDispositivo", false,
         1, ARRAY[]::text[], false
  FROM public."relevamiento" r
  LEFT JOIN public."bien" b ON b."id" = r."bienId"
  LEFT JOIN public."usuario" us ON us."id" = r."usuarioId"
  WHERE r."jornadaId" = p_id AND (r."bienId" IS NULL OR r."bienId" NOT IN (SELECT e2.bid FROM enalcance e2));
END;
$$;

REVOKE ALL ON FUNCTION public.avance_jornada(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.avance_jornada(text) TO authenticated;
