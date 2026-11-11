-- Comparar dos jornadas del mismo área o ubicación: qué cambió de una a otra. Para cada bien esperado dice si
--   'aparecio'        no se lo encontró en la primera y sí en la segunda,
--   'desaparecio'     se lo encontró en la primera y no en la segunda,
--   'cambio_lugar'    se lo encontró en las dos pero en otra ubicación (solo si en ambas se indicó una),
--   'igual'           se lo encontró en las dos, en el mismo lugar,
--   'falto_en_ambas'  no se lo encontró en ninguna.
-- Se apoya en `avance_jornada`, así que cuenta lo mismo que la pantalla de la jornada (lecturas vigentes, lectura elegida, situación del bien).
-- Cualquier cuenta activa puede comparar: es la misma información que ya ve en cada jornada.

CREATE OR REPLACE FUNCTION public.comparar_jornadas(p_antes text, p_despues text)
 RETURNS TABLE("bienId" text, "numeroInventario" text, descripcion text, "ubicacionFisica" text, cambio text, "ubicacionAntes" text, "ubicacionDespues" text, "relevadorAntes" text, "relevadorDespues" text, "situacionDespues" text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_tipo_antes text;
  v_alcance_antes text;
  v_tipo_despues text;
  v_alcance_despues text;
BEGIN
  IF NOT privado.es_activa() THEN
    RAISE EXCEPTION 'La cuenta no está activa' USING ERRCODE = '42501';
  END IF;
  IF p_antes IS NULL OR p_despues IS NULL OR p_antes = p_despues THEN
    RAISE EXCEPTION 'Elegí dos jornadas distintas' USING ERRCODE = '22023';
  END IF;
  SELECT j."tipo", j."alcance" INTO v_tipo_antes, v_alcance_antes FROM public."jornada" j WHERE j."id" = p_antes;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'La jornada no existe' USING ERRCODE = 'P0002';
  END IF;
  SELECT j."tipo", j."alcance" INTO v_tipo_despues, v_alcance_despues FROM public."jornada" j WHERE j."id" = p_despues;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'La jornada no existe' USING ERRCODE = 'P0002';
  END IF;
  IF v_tipo_antes <> v_tipo_despues OR v_alcance_antes <> v_alcance_despues THEN
    RAISE EXCEPTION 'Las jornadas tienen que ser del mismo área o de la misma ubicación' USING ERRCODE = '22023';
  END IF;
  RETURN QUERY
  SELECT a."bienId", a."numeroInventario", a."descripcion", a."ubicacionFisica",
         CASE
           WHEN a."encontrado" AND d."encontrado" AND a."ubicacionObservada" IS NOT NULL AND d."ubicacionObservada" IS NOT NULL
                AND a."ubicacionObservada" <> d."ubicacionObservada" THEN 'cambio_lugar'
           WHEN a."encontrado" AND d."encontrado" THEN 'igual'
           WHEN d."encontrado" THEN 'aparecio'
           WHEN a."encontrado" THEN 'desaparecio'
           ELSE 'falto_en_ambas'
         END,
         a."ubicacionObservada", d."ubicacionObservada", a."relevador", d."relevador", d."situacion"
  FROM public.avance_jornada(p_antes) a
  JOIN public.avance_jornada(p_despues) d ON d."bienId" = a."bienId" AND d."tipo" = 'esperado'
  WHERE a."tipo" = 'esperado'
  ORDER BY a."numeroInventario";
END;
$function$;

REVOKE ALL ON FUNCTION public.comparar_jornadas(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.comparar_jornadas(text, text) TO authenticated;
