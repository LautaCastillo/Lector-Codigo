-- Los estados del bien que figuran en el catálogo, con su cantidad de bienes, para poder filtrar la búsqueda por estado.
-- Igual que `areas_catalogo`: corre con los permisos de quien llama, así que la política de lectura de `bien` decide qué ve cada cuenta.

CREATE OR REPLACE FUNCTION public.estados_catalogo()
RETURNS TABLE (nombre text, cantidad bigint)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = ''
AS $$
  SELECT b."estadoBien", count(*)
  FROM public."bien" b
  WHERE b."estadoBien" IS NOT NULL AND btrim(b."estadoBien") <> ''
  GROUP BY b."estadoBien"
  ORDER BY count(*) DESC, b."estadoBien"
$$;

REVOKE ALL ON FUNCTION public.estados_catalogo() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.estados_catalogo() TO authenticated;
