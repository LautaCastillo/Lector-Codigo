-- Fase 3 del plan v3, primera parte: lecturas del catálogo que la app hacía contra el backend.
-- Búsqueda, ficha y escaneo se resuelven con consultas directas bajo RLS; estas dos necesitan una función.

-- Ubicaciones físicas del catálogo con su cantidad de bienes (para elegir dónde hacer un lote).
-- SECURITY INVOKER: se aplica la política de lectura de `bien` (solo cuentas activas).
CREATE OR REPLACE FUNCTION public.ubicaciones_catalogo()
RETURNS TABLE (nombre text, cantidad bigint)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = ''
AS $$
  SELECT b."ubicacionFisica", count(*)
  FROM public."bien" b
  WHERE b."ubicacionFisica" IS NOT NULL
  GROUP BY b."ubicacionFisica"
  ORDER BY b."ubicacionFisica"
$$;

-- Línea de tiempo de un bien (más reciente primero). Lee `cambio_fila`, que solo ve el administrador,
-- por eso es SECURITY DEFINER; devuelve únicamente lo que muestra la ficha: quién, cuándo y qué cambió.
CREATE OR REPLACE FUNCTION public.historial_bien(p_bien_id text)
RETURNS TABLE (id text, operacion text, en timestamptz, actor text, antes jsonb, despues jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  IF NOT privado.es_activa() THEN
    RAISE EXCEPTION 'La cuenta no está activa' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT c."id", c."operacion", c."en", coalesce(u."nombre", u."cuenta"), c."antes", c."despues"
  FROM public."cambio_fila" c
  LEFT JOIN public."usuario" u ON u."id" = c."actorUsuarioId"
  WHERE c."tabla" = 'bien' AND c."filaId" = p_bien_id
  ORDER BY c."en" DESC
  LIMIT 50;
END;
$$;

REVOKE ALL ON FUNCTION public.ubicaciones_catalogo(), public.historial_bien(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ubicaciones_catalogo(), public.historial_bien(text) TO authenticated;
