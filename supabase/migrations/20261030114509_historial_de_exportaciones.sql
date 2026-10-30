-- Historial de exportaciones, visible para cualquier cuenta activa (igual que el de importaciones). Cada exportación ya deja
-- constancia en `exportacion` (quién, cuándo, filtros, filas y huella SHA-256), pero la política de lectura solo mostraba lo propio.
-- Esta función muestra todas, sin cambiar esa política: no se expone el contenido exportado, solo la constancia.

CREATE OR REPLACE FUNCTION public.historial_exportaciones(p_limite integer DEFAULT 100)
RETURNS TABLE (
  "id" text, "formato" text, "filtros" jsonb, "filas" integer, "hashSha256" text, "creadoEn" timestamp, "usuario" text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  IF NOT privado.es_activa() THEN
    RAISE EXCEPTION 'La cuenta no está activa' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT x."id", x."formato", x."filtros", x."filas", x."hashSha256", x."creadoEn", coalesce(u."nombre", u."cuenta")
  FROM public."exportacion" x
  JOIN public."usuario" u ON u."id" = x."usuarioId"
  ORDER BY x."creadoEn" DESC
  LIMIT least(greatest(coalesce(p_limite, 100), 1), 500);
END;
$$;

REVOKE ALL ON FUNCTION public.historial_exportaciones(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.historial_exportaciones(integer) TO authenticated;
