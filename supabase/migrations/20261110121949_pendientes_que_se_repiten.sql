-- Pendientes que se repiten: el avance de una jornada indica, para cada bien esperado que todavía no se encontró, en cuántas jornadas
-- cerradas anteriores del mismo alcance (mismo tipo y mismo área o ubicación) tampoco se lo encontró, contando de la más reciente hacia
-- atrás hasta la primera en que sí se lo encontró. Se miran hasta 10 jornadas anteriores.
-- No cuenta como "faltó" una jornada en la que el bien estaba apartado (con situación al cerrarla: ver situacion_del_bien) ni una anterior
-- a su alta en el catálogo: en esos casos la racha se corta.
-- Cambian las columnas (se suma `vecesSinEncontrar`): hace falta DROP y CREATE, y volver a dar los permisos.

DROP FUNCTION public.avance_jornada(text);
CREATE FUNCTION public.avance_jornada(p_id text)
 RETURNS TABLE(tipo text, "relevamientoId" text, "bienId" text, "numeroInventario" text, descripcion text, "ubicacionFisica" text, "areaResponsable" text, "responsableUso" text, "estadoBien" text, encontrado boolean, resultado text, "ubicacionObservada" text, relevador text, "relevadoEn" timestamp without time zone, "fueraDeLugar" boolean, lecturas integer, "tambienVieron" text[], discrepancia boolean, "codigoProvisorio" text, resuelta boolean, "notaResolucion" text, situacion text, "motivoSituacion" text, "vecesSinEncontrar" integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_tipo text;
  v_alcance text;
  v_momento timestamp with time zone;
  v_creada timestamp with time zone;
BEGIN
  IF NOT privado.es_activa() THEN
    RAISE EXCEPTION 'La cuenta no está activa' USING ERRCODE = '42501';
  END IF;
  SELECT j."tipo", j."alcance", coalesce(j."cerradaEn"::timestamptz, now()), j."creadoEn"::timestamptz INTO v_tipo, v_alcance, v_momento, v_creada
  FROM public."jornada" j WHERE j."id" = p_id;
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
  ),
  previas AS (
    SELECT j2."id" AS jid, j2."cerradaEn"::timestamptz AS cierre, row_number() OVER (ORDER BY j2."cerradaEn" DESC, j2."id")::integer AS orden
    FROM public."jornada" j2
    WHERE j2."tipo" = v_tipo AND j2."alcance" = v_alcance AND j2."estado" = 'cerrada' AND j2."id" <> p_id AND j2."creadoEn"::timestamptz < v_creada
    ORDER BY j2."cerradaEn" DESC, j2."id"
    LIMIT 10
  ),
  rachas AS (
    SELECT e.bid,
           coalesce(
             (SELECT min(p.orden) FROM previas p
              WHERE EXISTS (SELECT 1 FROM public."relevamiento" r WHERE r."jornadaId" = p.jid AND r."bienId" = e.bid AND r."resultado" = 'encontrado' AND r."anuladoEn" IS NULL)
                 OR EXISTS (SELECT 1 FROM public."situacion_bien" s WHERE s."bienId" = e.bid AND s."declaradaEn" <= p.cierre AND (s."levantadaEn" IS NULL OR s."levantadaEn" > p.cierre))
                 OR NOT EXISTS (SELECT 1 FROM public."bien" b0 WHERE b0."id" = e.bid AND b0."creadoEn"::timestamptz <= p.cierre)),
             (SELECT count(*) FROM previas)::integer + 1
           ) - 1 AS racha
    FROM enalcance e
  )
  SELECT 'esperado'::text, pr.rid, b."id", b."numeroInventario", b."descripcion", b."ubicacionFisica", b."areaResponsable",
         b."responsableUso", b."estadoBien", (pr.rid IS NOT NULL), pr.res::text, pr.obs, coalesce(us."nombre", us."cuenta"), pr.cuando,
         (pr.rid IS NOT NULL AND pr.obs IS NOT NULL AND pr.obs IS DISTINCT FROM b."ubicacionFisica"),
         coalesce(rs.lecturas, 0), coalesce(t.quienes, ARRAY[]::text[]),
         (coalesce(rs.discrepancia, false) AND NOT coalesce(pr.elegida, false)), NULL::text,
         coalesce(pr.elegida, false), CASE WHEN coalesce(pr.elegida, false) THEN pr.nota END,
         sit.sit_s, sit.sit_m,
         CASE WHEN pr.rid IS NULL THEN coalesce(rc.racha, 0) ELSE 0 END
  FROM enalcance e
  JOIN public."bien" b ON b."id" = e.bid
  LEFT JOIN primeras pr ON pr.bid = b."id"
  LEFT JOIN public."usuario" us ON us."id" = pr.uid
  LEFT JOIN resumen rs ON rs.bid = b."id"
  LEFT JOIN tambien t ON t.bid = b."id"
  LEFT JOIN rachas rc ON rc.bid = b."id"
  LEFT JOIN LATERAL (
    SELECT s."situacion" AS sit_s, s."motivo" AS sit_m FROM public."situacion_bien" s
    WHERE s."bienId" = b."id" AND s."declaradaEn" <= v_momento AND (s."levantadaEn" IS NULL OR s."levantadaEn" > v_momento)
    ORDER BY s."declaradaEn" DESC LIMIT 1
  ) sit ON true
  UNION ALL
  SELECT 'extra'::text, r."id", b."id", b."numeroInventario", coalesce(b."descripcion", r."descripcion", 'Código ' || r."valorLeido"),
         b."ubicacionFisica", b."areaResponsable", b."responsableUso", b."estadoBien", (r."resultado" = 'encontrado'), r."resultado"::text,
         r."ubicacionObservada", coalesce(us."nombre", us."cuenta"), r."relevadoEnDispositivo", false,
         1, ARRAY[]::text[], false, r."codigoProvisorio", false, NULL::text, NULL::text, NULL::text, 0
  FROM public."relevamiento" r
  LEFT JOIN public."bien" b ON b."id" = r."bienId"
  LEFT JOIN public."usuario" us ON us."id" = r."usuarioId"
  WHERE r."jornadaId" = p_id AND r."anuladoEn" IS NULL AND (r."bienId" IS NULL OR r."bienId" NOT IN (SELECT e2.bid FROM enalcance e2));
END;
$function$;
REVOKE ALL ON FUNCTION public.avance_jornada(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.avance_jornada(text) TO authenticated;
