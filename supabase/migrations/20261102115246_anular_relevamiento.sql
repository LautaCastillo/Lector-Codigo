-- Deshacer una lectura: un relevamiento propio se anula, no se borra (la auditoría es append-only y la fila queda como constancia).
-- Las lecturas anuladas no cuentan en el avance de la jornada ni en las listas. Anula quien la registró o un administrador,
-- y solo mientras la jornada (si la tiene) sigue abierta.

ALTER TABLE public."relevamiento" ADD COLUMN IF NOT EXISTS "anuladoEn" timestamp without time zone;
ALTER TABLE public."relevamiento" ADD COLUMN IF NOT EXISTS "anuladoPor" text REFERENCES public."usuario" ("id") ON DELETE RESTRICT;

CREATE OR REPLACE FUNCTION public.anular_relevamiento(p_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_yo text := privado.usuario_actual();
  v_r public."relevamiento"%ROWTYPE;
BEGIN
  IF NOT privado.es_activa() THEN
    RAISE EXCEPTION 'La cuenta no está activa' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_r FROM public."relevamiento" WHERE "id" = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'El relevamiento no existe' USING ERRCODE = 'P0002';
  END IF;
  IF v_r."usuarioId" <> v_yo AND NOT privado.es_administrador() THEN
    RAISE EXCEPTION 'Solo podés deshacer tus propias lecturas' USING ERRCODE = '42501';
  END IF;
  IF v_r."anuladoEn" IS NOT NULL THEN
    RETURN; -- ya estaba anulado: repetir no hace nada
  END IF;
  IF v_r."jornadaId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public."jornada" j WHERE j."id" = v_r."jornadaId" AND j."estado" = 'abierta') THEN
    RAISE EXCEPTION 'La jornada está cerrada: ya no se pueden deshacer sus lecturas' USING ERRCODE = '22023';
  END IF;
  UPDATE public."relevamiento" SET "anuladoEn" = now(), "anuladoPor" = v_yo WHERE "id" = p_id;
  PERFORM privado.registrar_evento('RELEVAMIENTO_ANULADO', 'relevamiento', p_id,
    jsonb_build_object('resultado', v_r."resultado", 'jornadaId', v_r."jornadaId", 'bienId', v_r."bienId"));
END;
$$;

REVOKE ALL ON FUNCTION public.anular_relevamiento(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.anular_relevamiento(text) TO authenticated;

-- El conteo de la lista de jornadas ignora lo anulado.
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
       WHERE (j."tipo" = 'area' AND b."areaResponsable" = j."alcance") OR (j."tipo" = 'ubicacion' AND b."ubicacionFisica" = j."alcance")),
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

-- El avance de la jornada ignora lo anulado: si se anula la primera lectura de un bien, pasa a figurar la siguiente.
CREATE OR REPLACE FUNCTION public.avance_jornada(p_id text)
 RETURNS TABLE(tipo text, "relevamientoId" text, "bienId" text, "numeroInventario" text, descripcion text, "ubicacionFisica" text, "areaResponsable" text, "responsableUso" text, "estadoBien" text, encontrado boolean, resultado text, "ubicacionObservada" text, relevador text, "relevadoEn" timestamp without time zone, "fueraDeLugar" boolean, lecturas integer, "tambienVieron" text[], discrepancia boolean, "codigoProvisorio" text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  primeras AS (
    SELECT DISTINCT ON (r."bienId") r."id" AS rid, r."bienId" AS bid, r."usuarioId" AS uid, r."resultado" AS res,
           r."ubicacionObservada" AS obs, r."relevadoEnDispositivo" AS cuando
    FROM public."relevamiento" r
    WHERE r."jornadaId" = p_id AND r."resultado" = 'encontrado' AND r."bienId" IS NOT NULL AND r."anuladoEn" IS NULL
    ORDER BY r."bienId", r."sincronizadoEn", r."relevadoEnDispositivo", r."id"
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
         coalesce(rs.lecturas, 0), coalesce(t.quienes, ARRAY[]::text[]), coalesce(rs.discrepancia, false), NULL::text
  FROM enalcance e
  JOIN public."bien" b ON b."id" = e.bid
  LEFT JOIN primeras pr ON pr.bid = b."id"
  LEFT JOIN public."usuario" us ON us."id" = pr.uid
  LEFT JOIN resumen rs ON rs.bid = b."id"
  LEFT JOIN tambien t ON t.bid = b."id"
  UNION ALL
  SELECT 'extra'::text, r."id", b."id", b."numeroInventario", coalesce(b."descripcion", r."descripcion", 'Código ' || r."valorLeido"),
         b."ubicacionFisica", b."areaResponsable", b."responsableUso", b."estadoBien", (r."resultado" = 'encontrado'), r."resultado"::text,
         r."ubicacionObservada", coalesce(us."nombre", us."cuenta"), r."relevadoEnDispositivo", false,
         1, ARRAY[]::text[], false, r."codigoProvisorio"
  FROM public."relevamiento" r
  LEFT JOIN public."bien" b ON b."id" = r."bienId"
  LEFT JOIN public."usuario" us ON us."id" = r."usuarioId"
  WHERE r."jornadaId" = p_id AND r."anuladoEn" IS NULL AND (r."bienId" IS NULL OR r."bienId" NOT IN (SELECT e2.bid FROM enalcance e2));
END;
$function$;
