-- Supabase rechaza para las cuentas de la app cualquier DELETE sin WHERE (extensión pg_safeupdate). La función de importación
-- vaciaba su tabla temporal de trabajo con un DELETE sin condición ("DELETE requires a WHERE clause"): se le agrega `WHERE true`.
-- Se reescribe a partir de la definición actual para no repetir toda la función.
DO $$
DECLARE
  definicion text;
BEGIN
  SELECT pg_get_functiondef('public.importar_catalogo(jsonb, text, text[])'::regprocedure) INTO definicion;
  definicion := replace(definicion, 'DELETE FROM pg_temp.filas_catalogo;', 'DELETE FROM pg_temp.filas_catalogo WHERE true;');
  EXECUTE definicion;
END;
$$;
