-- Fase 5 del plan v3, primer paso: explorar el catálogo por área, por responsable y por ubicación física.
-- Listados con su cantidad de bienes, calculados en vivo a partir de `bien`: no hay tablas aparte, así que un archivo
-- de otra área recién importado aparece al instante. SECURITY INVOKER: se aplica la política de lectura de `bien`
-- (solo cuentas activas).

CREATE OR REPLACE FUNCTION public.areas_catalogo()
RETURNS TABLE (nombre text, cantidad bigint, ubicaciones bigint, responsables bigint)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = ''
AS $$
  SELECT b."areaResponsable", count(*), count(DISTINCT b."ubicacionFisica"), count(DISTINCT b."responsableUso")
  FROM public."bien" b
  WHERE b."areaResponsable" IS NOT NULL
  GROUP BY b."areaResponsable"
  ORDER BY b."areaResponsable"
$$;

CREATE OR REPLACE FUNCTION public.responsables_catalogo()
RETURNS TABLE (nombre text, cantidad bigint, areas bigint)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = ''
AS $$
  SELECT b."responsableUso", count(*), count(DISTINCT b."areaResponsable")
  FROM public."bien" b
  WHERE b."responsableUso" IS NOT NULL
  GROUP BY b."responsableUso"
  ORDER BY b."responsableUso"
$$;

REVOKE ALL ON FUNCTION public.areas_catalogo(), public.responsables_catalogo() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.areas_catalogo(), public.responsables_catalogo() TO authenticated;
