-- Cola de discrepancias: cuando dos personas leen el mismo bien en una jornada y las lecturas no coinciden (por ejemplo, otra ubicación),
-- quien abrió la jornada o un administrador elige cuál lectura vale y deja una nota. Todo queda registrado; las lecturas no se tocan.
-- La elección vive en su propia tabla: `relevamiento` no admite modificaciones.

CREATE TABLE public."resolucion_discrepancia" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "jornadaId" text NOT NULL REFERENCES public."jornada" ("id") ON DELETE RESTRICT,
  "bienId" text NOT NULL REFERENCES public."bien" ("id") ON DELETE RESTRICT,
  "relevamientoId" text NOT NULL REFERENCES public."relevamiento" ("id") ON DELETE RESTRICT,
  "nota" text CHECK ("nota" IS NULL OR length("nota") <= 300),
  "resueltaPor" text NOT NULL REFERENCES public."usuario" ("id") ON DELETE RESTRICT,
  "resueltaEn" timestamp without time zone NOT NULL DEFAULT now(),
  UNIQUE ("jornadaId", "bienId")
);
ALTER TABLE public."resolucion_discrepancia" ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public."resolucion_discrepancia" TO authenticated;
CREATE POLICY resolucion_discrepancia_leer ON public."resolucion_discrepancia" FOR SELECT TO authenticated USING ((SELECT privado.es_activa()));
CREATE TRIGGER resolucion_discrepancia_auditar AFTER INSERT OR UPDATE OR DELETE ON public."resolucion_discrepancia"
  FOR EACH ROW EXECUTE FUNCTION public.registrar_cambio_fila();
ALTER PUBLICATION supabase_realtime ADD TABLE public."resolucion_discrepancia";

-- Las lecturas de un bien dentro de una jornada, de la primera a la última, para elegir cuál vale.
CREATE OR REPLACE FUNCTION public.lecturas_de_bien_en_jornada(p_jornada text, p_bien_id text)
RETURNS TABLE("relevamientoId" text, relevador text, "relevadoEn" timestamp without time zone, resultado text, "ubicacionObservada" text, observaciones text, elegida boolean)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  IF NOT privado.es_activa() THEN
    RAISE EXCEPTION 'La cuenta no está activa' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT r."id", coalesce(u."nombre", u."cuenta"), r."relevadoEnDispositivo", r."resultado"::text, r."ubicacionObservada", r."observaciones",
         coalesce(r."id" = rd."relevamientoId", false)
  FROM public."relevamiento" r
  JOIN public."usuario" u ON u."id" = r."usuarioId"
  LEFT JOIN public."resolucion_discrepancia" rd ON rd."jornadaId" = r."jornadaId" AND rd."bienId" = r."bienId"
  WHERE r."jornadaId" = p_jornada AND r."bienId" = p_bien_id AND r."anuladoEn" IS NULL
  ORDER BY r."sincronizadoEn", r."relevadoEnDispositivo", r."id";
END;
$function$;

-- Elegir la lectura que vale. Puede hacerlo quien abrió la jornada o un administrador, mientras esté abierta. Se puede cambiar la elección.
CREATE OR REPLACE FUNCTION public.resolver_discrepancia(p_jornada text, p_bien_id text, p_relevamiento text, p_nota text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_yo text := privado.usuario_actual();
  v_creadora text;
  v_estado text;
  v_nota text := nullif(left(btrim(coalesce(p_nota, '')), 300), '');
BEGIN
  IF NOT privado.es_activa() THEN
    RAISE EXCEPTION 'La cuenta no está activa' USING ERRCODE = '42501';
  END IF;
  SELECT j."creadaPor", j."estado" INTO v_creadora, v_estado FROM public."jornada" j WHERE j."id" = p_jornada FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'La jornada no existe' USING ERRCODE = 'P0002';
  END IF;
  IF v_creadora <> v_yo AND NOT privado.es_administrador() THEN
    RAISE EXCEPTION 'Solo quien abrió la jornada o un administrador puede resolver discrepancias' USING ERRCODE = '42501';
  END IF;
  IF v_estado <> 'abierta' THEN
    RAISE EXCEPTION 'La jornada está cerrada' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public."relevamiento" r
    WHERE r."id" = p_relevamiento AND r."jornadaId" = p_jornada AND r."bienId" = p_bien_id AND r."resultado" = 'encontrado' AND r."anuladoEn" IS NULL
  ) THEN
    RAISE EXCEPTION 'Esa lectura no corresponde a este bien en esta jornada' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public."resolucion_discrepancia" ("jornadaId", "bienId", "relevamientoId", "nota", "resueltaPor")
  VALUES (p_jornada, p_bien_id, p_relevamiento, v_nota, v_yo)
  ON CONFLICT ("jornadaId", "bienId") DO UPDATE
    SET "relevamientoId" = EXCLUDED."relevamientoId", "nota" = EXCLUDED."nota", "resueltaPor" = EXCLUDED."resueltaPor", "resueltaEn" = now();
  PERFORM privado.registrar_evento('DISCREPANCIA_RESUELTA', 'jornada', p_jornada,
    jsonb_build_object('bienId', p_bien_id, 'relevamientoId', p_relevamiento, 'nota', v_nota));
END;
$function$;

REVOKE ALL ON FUNCTION public.lecturas_de_bien_en_jornada(text, text), public.resolver_discrepancia(text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.lecturas_de_bien_en_jornada(text, text), public.resolver_discrepancia(text, text, text, text) TO authenticated;

-- El avance muestra la lectura elegida (si la hay y sigue vigente), y una discrepancia resuelta deja de marcarse como pendiente de revisar.
-- Cambian las columnas (se suman `resuelta` y `notaResolucion`): hace falta DROP y CREATE, y volver a dar los permisos.
DROP FUNCTION public.avance_jornada(text);
CREATE FUNCTION public.avance_jornada(p_id text)
 RETURNS TABLE(tipo text, "relevamientoId" text, "bienId" text, "numeroInventario" text, descripcion text, "ubicacionFisica" text, "areaResponsable" text, "responsableUso" text, "estadoBien" text, encontrado boolean, resultado text, "ubicacionObservada" text, relevador text, "relevadoEn" timestamp without time zone, "fueraDeLugar" boolean, lecturas integer, "tambienVieron" text[], discrepancia boolean, "codigoProvisorio" text, resuelta boolean, "notaResolucion" text)
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
         coalesce(pr.elegida, false), CASE WHEN coalesce(pr.elegida, false) THEN pr.nota END
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
         1, ARRAY[]::text[], false, r."codigoProvisorio", false, NULL::text
  FROM public."relevamiento" r
  LEFT JOIN public."bien" b ON b."id" = r."bienId"
  LEFT JOIN public."usuario" us ON us."id" = r."usuarioId"
  WHERE r."jornadaId" = p_id AND r."anuladoEn" IS NULL AND (r."bienId" IS NULL OR r."bienId" NOT IN (SELECT e2.bid FROM enalcance e2));
END;
$function$;
REVOKE ALL ON FUNCTION public.avance_jornada(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.avance_jornada(text) TO authenticated;
