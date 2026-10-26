-- Los reportes de SIU no traen todos las mismas columnas: el de un área, por ejemplo, no trae el estado ni el número
-- de serie, pero sí el responsable de uso. La importación ahora recibe qué columnas trae el archivo y solo toca esas:
-- lo que falta como columna se conserva tal como está en el catálogo. Suma además el responsable de uso.

DROP FUNCTION IF EXISTS public.importar_catalogo(jsonb, text);

CREATE OR REPLACE FUNCTION public.importar_catalogo(p_filas jsonb, p_modo text, p_columnas text[] DEFAULT NULL)
RETURNS TABLE ("nuevos" integer, "modificados" integer, "sinCambios" integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_total integer;
  v_nuevos integer;
  v_modificados integer;
  v_permitidas text[] := ARRAY['numeroInventario', 'descripcion', 'catalogo', 'ubicacionFisica', 'areaResponsable', 'motivoAlta',
    'estadoBien', 'valorUnitario', 'fechaIncorporacion', 'numeroSerie', 'numeroAnterior', 'expediente', 'responsableUso'];
  v_cols text[] := coalesce(p_columnas, v_permitidas);
BEGIN
  IF NOT privado.es_administrador() THEN
    RAISE EXCEPTION 'Solo un administrador puede importar el catálogo' USING ERRCODE = '42501';
  END IF;
  IF p_modo NOT IN ('previsualizar', 'aplicar') THEN
    RAISE EXCEPTION 'El modo debe ser previsualizar o aplicar' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(p_filas) <> 'array' OR jsonb_array_length(p_filas) > 1000 THEN
    RAISE EXCEPTION 'Se esperan hasta 1000 filas por tanda' USING ERRCODE = '22023';
  END IF;
  IF NOT (v_cols <@ v_permitidas) THEN
    RAISE EXCEPTION 'Hay columnas que no se pueden importar' USING ERRCODE = '22023';
  END IF;

  CREATE TEMP TABLE IF NOT EXISTS pg_temp.filas_catalogo (
    "numeroInventario" text, "descripcion" text, "catalogo" text, "ubicacionFisica" text, "areaResponsable" text,
    "motivoAlta" text, "estadoBien" text, "valorUnitario" numeric, "fechaIncorporacion" date, "numeroSerie" text,
    "numeroAnterior" text, "expediente" text, "responsableUso" text, "id" text
  ) ON COMMIT DROP;
  DELETE FROM pg_temp.filas_catalogo;
  INSERT INTO pg_temp.filas_catalogo ("numeroInventario", "descripcion", "catalogo", "ubicacionFisica", "areaResponsable",
    "motivoAlta", "estadoBien", "valorUnitario", "fechaIncorporacion", "numeroSerie", "numeroAnterior", "expediente", "responsableUso", "id")
  SELECT DISTINCT ON (x."numeroInventario") x."numeroInventario", x."descripcion", x."catalogo", x."ubicacionFisica",
         x."areaResponsable", x."motivoAlta", x."estadoBien", x."valorUnitario", x."fechaIncorporacion", x."numeroSerie",
         x."numeroAnterior", x."expediente", x."responsableUso", gen_random_uuid()::text
  FROM jsonb_to_recordset(p_filas) AS x (
    "numeroInventario" text, "descripcion" text, "catalogo" text, "ubicacionFisica" text, "areaResponsable" text,
    "motivoAlta" text, "estadoBien" text, "valorUnitario" numeric, "fechaIncorporacion" date, "numeroSerie" text,
    "numeroAnterior" text, "expediente" text, "responsableUso" text
  )
  ORDER BY x."numeroInventario";

  IF EXISTS (SELECT 1 FROM pg_temp.filas_catalogo f WHERE f."numeroInventario" IS NULL OR f."numeroInventario" !~ '^[0-9]{1,20}$') THEN
    RAISE EXCEPTION 'Hay filas sin un número de inventario válido' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_temp.filas_catalogo f WHERE greatest(
      length(coalesce(f."descripcion", '')), length(coalesce(f."catalogo", '')), length(coalesce(f."ubicacionFisica", '')),
      length(coalesce(f."areaResponsable", '')), length(coalesce(f."motivoAlta", '')), length(coalesce(f."estadoBien", '')),
      length(coalesce(f."numeroSerie", '')), length(coalesce(f."numeroAnterior", '')), length(coalesce(f."expediente", '')),
      length(coalesce(f."responsableUso", ''))) > 1000) THEN
    RAISE EXCEPTION 'Hay textos demasiado largos (más de 1000 caracteres)' USING ERRCODE = '22023';
  END IF;

  -- Para los bienes que ya existen, las columnas que el archivo no trae conservan su valor actual.
  UPDATE pg_temp.filas_catalogo f SET
    "descripcion" = CASE WHEN 'descripcion' = ANY (v_cols) THEN f."descripcion" ELSE b."descripcion" END,
    "catalogo" = CASE WHEN 'catalogo' = ANY (v_cols) THEN f."catalogo" ELSE b."catalogo" END,
    "ubicacionFisica" = CASE WHEN 'ubicacionFisica' = ANY (v_cols) THEN f."ubicacionFisica" ELSE b."ubicacionFisica" END,
    "areaResponsable" = CASE WHEN 'areaResponsable' = ANY (v_cols) THEN f."areaResponsable" ELSE b."areaResponsable" END,
    "motivoAlta" = CASE WHEN 'motivoAlta' = ANY (v_cols) THEN f."motivoAlta" ELSE b."motivoAlta" END,
    "estadoBien" = CASE WHEN 'estadoBien' = ANY (v_cols) THEN f."estadoBien" ELSE b."estadoBien" END,
    "valorUnitario" = CASE WHEN 'valorUnitario' = ANY (v_cols) THEN f."valorUnitario" ELSE b."valorUnitario" END,
    "fechaIncorporacion" = CASE WHEN 'fechaIncorporacion' = ANY (v_cols) THEN f."fechaIncorporacion" ELSE b."fechaIncorporacion" END,
    "numeroSerie" = CASE WHEN 'numeroSerie' = ANY (v_cols) THEN f."numeroSerie" ELSE b."numeroSerie" END,
    "numeroAnterior" = CASE WHEN 'numeroAnterior' = ANY (v_cols) THEN f."numeroAnterior" ELSE b."numeroAnterior" END,
    "expediente" = CASE WHEN 'expediente' = ANY (v_cols) THEN f."expediente" ELSE b."expediente" END,
    "responsableUso" = CASE WHEN 'responsableUso' = ANY (v_cols) THEN f."responsableUso" ELSE b."responsableUso" END
  FROM public."bien" b WHERE b."numeroInventario" = f."numeroInventario";

  SELECT count(*) INTO v_total FROM pg_temp.filas_catalogo;
  SELECT count(*) INTO v_nuevos FROM pg_temp.filas_catalogo f
    WHERE NOT EXISTS (SELECT 1 FROM public."bien" b WHERE b."numeroInventario" = f."numeroInventario");
  SELECT count(*) INTO v_modificados FROM pg_temp.filas_catalogo f JOIN public."bien" b ON b."numeroInventario" = f."numeroInventario"
    WHERE (b."descripcion", b."catalogo", b."ubicacionFisica", b."areaResponsable", b."motivoAlta", b."estadoBien",
           b."valorUnitario", b."fechaIncorporacion", b."numeroSerie", b."numeroAnterior", b."expediente", b."responsableUso")
      IS DISTINCT FROM (f."descripcion", f."catalogo", f."ubicacionFisica", f."areaResponsable", f."motivoAlta", f."estadoBien",
           f."valorUnitario", f."fechaIncorporacion", f."numeroSerie", f."numeroAnterior", f."expediente", f."responsableUso");

  IF p_modo = 'aplicar' THEN
    INSERT INTO public."bien" AS b ("id", "numeroInventario", "descripcion", "catalogo", "ubicacionFisica", "areaResponsable",
      "motivoAlta", "estadoBien", "valorUnitario", "fechaIncorporacion", "numeroSerie", "numeroAnterior", "expediente",
      "responsableUso", "modificadoEn")
    SELECT f."id", f."numeroInventario", f."descripcion", f."catalogo", f."ubicacionFisica", f."areaResponsable", f."motivoAlta",
           f."estadoBien", f."valorUnitario", f."fechaIncorporacion", f."numeroSerie", f."numeroAnterior", f."expediente",
           f."responsableUso", now()
    FROM pg_temp.filas_catalogo f
    ON CONFLICT ("numeroInventario") DO UPDATE SET
      "descripcion" = EXCLUDED."descripcion", "catalogo" = EXCLUDED."catalogo", "ubicacionFisica" = EXCLUDED."ubicacionFisica",
      "areaResponsable" = EXCLUDED."areaResponsable", "motivoAlta" = EXCLUDED."motivoAlta", "estadoBien" = EXCLUDED."estadoBien",
      "valorUnitario" = EXCLUDED."valorUnitario", "fechaIncorporacion" = EXCLUDED."fechaIncorporacion",
      "numeroSerie" = EXCLUDED."numeroSerie", "numeroAnterior" = EXCLUDED."numeroAnterior", "expediente" = EXCLUDED."expediente",
      "responsableUso" = EXCLUDED."responsableUso", "modificadoEn" = now()
    WHERE (b."descripcion", b."catalogo", b."ubicacionFisica", b."areaResponsable", b."motivoAlta", b."estadoBien",
           b."valorUnitario", b."fechaIncorporacion", b."numeroSerie", b."numeroAnterior", b."expediente", b."responsableUso")
      IS DISTINCT FROM (EXCLUDED."descripcion", EXCLUDED."catalogo", EXCLUDED."ubicacionFisica", EXCLUDED."areaResponsable",
           EXCLUDED."motivoAlta", EXCLUDED."estadoBien", EXCLUDED."valorUnitario", EXCLUDED."fechaIncorporacion",
           EXCLUDED."numeroSerie", EXCLUDED."numeroAnterior", EXCLUDED."expediente", EXCLUDED."responsableUso");
  END IF;

  RETURN QUERY SELECT v_nuevos, v_modificados, v_total - v_nuevos - v_modificados;
END;
$$;

REVOKE ALL ON FUNCTION public.importar_catalogo(jsonb, text, text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.importar_catalogo(jsonb, text, text[]) TO authenticated;
