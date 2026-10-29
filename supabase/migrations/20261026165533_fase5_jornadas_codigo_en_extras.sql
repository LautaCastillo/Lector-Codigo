-- En "Otros" de una jornada, un código que no está en el catálogo se muestra como "Código <número leído>" (antes quedaba sin texto).
DO $$
DECLARE
  definicion text;
BEGIN
  SELECT pg_get_functiondef('public.avance_jornada(text)'::regprocedure) INTO definicion;
  definicion := replace(definicion, 'coalesce(b."descripcion", r."descripcion")', 'coalesce(b."descripcion", r."descripcion", ''Código '' || r."valorLeido")');
  EXECUTE definicion;
END;
$$;
