-- Panel del administrador: una vista de conjunto del relevamiento. Solo lectura y solo para administradores (cada función lo comprueba).
--   panel_resumen:               cifras generales (bienes, relevados, apartados, jornadas, lecturas de la semana, cuentas, hallazgos sin vincular).
--   panel_por_area:              avance por área: bienes relevados alguna vez, sin relevar, apartados y el resultado de la última jornada cerrada.
--   panel_sin_relevar:           los bienes que nunca se encontraron (con su situación, si la tienen), de un área o de todas.
--   panel_lecturas_por_persona:  lecturas, hallazgos y lecturas deshechas de cada cuenta en los últimos N días, y su última actividad.
-- "Relevado" quiere decir que alguna vez hubo una lectura "encontrado" vigente (no anulada). "Apartado" es un bien con situación
-- vigente (reparación, baja o préstamo) que nunca se encontró; "sin relevar" es el resto de los que nunca se encontraron.

CREATE OR REPLACE FUNCTION public.panel_resumen()
 RETURNS TABLE(bienes integer, relevados integer, apartados integer, "jornadasAbiertas" integer, "jornadasCerradas" integer, "lecturas7Dias" integer, "cuentasActivas" integer, "hallazgosSinVincular" integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF NOT (privado.es_activa() AND privado.es_administrador()) THEN
    RAISE EXCEPTION 'Solo un administrador puede ver el panel' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  WITH est AS (
    SELECT b."id" AS bid,
           EXISTS (SELECT 1 FROM public."relevamiento" r WHERE r."bienId" = b."id" AND r."resultado" = 'encontrado' AND r."anuladoEn" IS NULL) AS rel,
           EXISTS (SELECT 1 FROM public."situacion_bien" s WHERE s."bienId" = b."id" AND s."levantadaEn" IS NULL) AS apt
    FROM public."bien" b
  )
  SELECT count(*)::integer, (count(*) FILTER (WHERE e.rel))::integer, (count(*) FILTER (WHERE e.apt AND NOT e.rel))::integer,
         (SELECT count(*)::integer FROM public."jornada" j WHERE j."estado" = 'abierta'),
         (SELECT count(*)::integer FROM public."jornada" j WHERE j."estado" = 'cerrada'),
         (SELECT count(*)::integer FROM public."relevamiento" r WHERE r."resultado" = 'encontrado' AND r."anuladoEn" IS NULL AND r."relevadoEnDispositivo" >= now() - interval '7 days'),
         (SELECT count(*)::integer FROM public."usuario" u WHERE u."estado" = 'activa'),
         (SELECT count(*)::integer FROM public."relevamiento" r WHERE r."resultado" = 'hallazgo' AND r."bienId" IS NULL AND r."anuladoEn" IS NULL)
  FROM est e;
END;
$function$;

CREATE OR REPLACE FUNCTION public.panel_por_area()
 RETURNS TABLE(area text, bienes integer, relevados integer, "sinRelevar" integer, apartados integer, "ultimaJornadaId" text, "ultimaCerradaEn" timestamp with time zone, "ultimaEsperados" integer, "ultimaEncontrados" integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF NOT (privado.es_activa() AND privado.es_administrador()) THEN
    RAISE EXCEPTION 'Solo un administrador puede ver el panel' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  WITH est AS (
    SELECT b."areaResponsable" AS ar,
           EXISTS (SELECT 1 FROM public."relevamiento" r WHERE r."bienId" = b."id" AND r."resultado" = 'encontrado' AND r."anuladoEn" IS NULL) AS rel,
           EXISTS (SELECT 1 FROM public."situacion_bien" s WHERE s."bienId" = b."id" AND s."levantadaEn" IS NULL) AS apt
    FROM public."bien" b
    WHERE b."areaResponsable" IS NOT NULL
  ),
  ult AS (
    SELECT DISTINCT ON (l."alcance") l."alcance" AS ar, l."id" AS jid, l."cerradaEn" AS cierre, l."esperados" AS esp, l."encontrados" AS enc
    FROM public.listar_jornadas('cerrada', NULL) l
    WHERE l."tipo" = 'area'
    ORDER BY l."alcance", l."cerradaEn" DESC
  )
  SELECT e.ar, count(*)::integer, (count(*) FILTER (WHERE e.rel))::integer, (count(*) FILTER (WHERE NOT e.rel AND NOT e.apt))::integer,
         (count(*) FILTER (WHERE e.apt AND NOT e.rel))::integer, u.jid, u.cierre, u.esp, u.enc
  FROM est e
  LEFT JOIN ult u ON u.ar = e.ar
  GROUP BY e.ar, u.jid, u.cierre, u.esp, u.enc
  ORDER BY e.ar;
END;
$function$;

CREATE OR REPLACE FUNCTION public.panel_sin_relevar(p_area text DEFAULT NULL, p_limite integer DEFAULT 200)
 RETURNS TABLE("bienId" text, "numeroInventario" text, descripcion text, "ubicacionFisica" text, "areaResponsable" text, situacion text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF NOT (privado.es_activa() AND privado.es_administrador()) THEN
    RAISE EXCEPTION 'Solo un administrador puede ver el panel' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT b."id", b."numeroInventario", b."descripcion", b."ubicacionFisica", b."areaResponsable",
         (SELECT s."situacion" FROM public."situacion_bien" s WHERE s."bienId" = b."id" AND s."levantadaEn" IS NULL LIMIT 1)
  FROM public."bien" b
  WHERE (p_area IS NULL OR b."areaResponsable" = p_area)
    AND NOT EXISTS (SELECT 1 FROM public."relevamiento" r WHERE r."bienId" = b."id" AND r."resultado" = 'encontrado' AND r."anuladoEn" IS NULL)
  ORDER BY b."areaResponsable", b."numeroInventario"
  LIMIT least(greatest(coalesce(p_limite, 200), 1), 500);
END;
$function$;

CREATE OR REPLACE FUNCTION public.panel_lecturas_por_persona(p_dias integer DEFAULT 30)
 RETURNS TABLE("usuarioId" text, cuenta text, nombre text, rol text, estado text, lecturas integer, hallazgos integer, deshechas integer, "ultimaActividad" timestamp without time zone, "jornadasAbiertas" integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_desde timestamp without time zone := (now() - make_interval(days => least(greatest(coalesce(p_dias, 30), 1), 3650)))::timestamp without time zone;
BEGIN
  IF NOT (privado.es_activa() AND privado.es_administrador()) THEN
    RAISE EXCEPTION 'Solo un administrador puede ver el panel' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT x.uid, x.cta, x.nom, x.rl, x.est, x.n_lec, x.n_hal, x.n_des, x.ult, x.n_jor
  FROM (
    SELECT u."id" AS uid, u."cuenta" AS cta, u."nombre" AS nom, u."rol"::text AS rl, u."estado"::text AS est,
           (count(r."id") FILTER (WHERE r."resultado" = 'encontrado' AND r."anuladoEn" IS NULL))::integer AS n_lec,
           (count(r."id") FILTER (WHERE r."resultado" = 'hallazgo' AND r."anuladoEn" IS NULL))::integer AS n_hal,
           (count(r."id") FILTER (WHERE r."anuladoEn" IS NOT NULL))::integer AS n_des,
           (SELECT max(r2."relevadoEnDispositivo") FROM public."relevamiento" r2 WHERE r2."usuarioId" = u."id") AS ult,
           (SELECT count(*)::integer FROM public."jornada" j WHERE j."creadaPor" = u."id" AND j."estado" = 'abierta') AS n_jor
    FROM public."usuario" u
    LEFT JOIN public."relevamiento" r ON r."usuarioId" = u."id" AND r."relevadoEnDispositivo" >= v_desde
    GROUP BY u."id"
  ) x
  ORDER BY x.n_lec DESC, x.n_hal DESC, x.cta;
END;
$function$;

REVOKE ALL ON FUNCTION public.panel_resumen(), public.panel_por_area(), public.panel_sin_relevar(text, integer), public.panel_lecturas_por_persona(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.panel_resumen(), public.panel_por_area(), public.panel_sin_relevar(text, integer), public.panel_lecturas_por_persona(integer) TO authenticated;
