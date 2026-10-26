-- Fase 4 del plan v3 (ADR 0003): el catálogo se carga desde un archivo CSV o XLSX de SIU Diaguita, que un
-- administrador sube desde la app. Reemplaza al importador del backend (`npm run importar`).
-- El archivo se lee en el teléfono; acá solo llegan filas ya normalizadas, en tandas, a estas funciones.
-- Un bien nunca se borra: la carga crea los nuevos y actualiza los existentes (por número de inventario).

CREATE TABLE public."importacion_catalogo" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "usuarioId" text NOT NULL REFERENCES public."usuario" ("id") ON DELETE RESTRICT,
  "archivo" text NOT NULL,
  "hashSha256" text NOT NULL CHECK ("hashSha256" ~ '^[0-9a-f]{64}$'),
  "filas" integer NOT NULL CHECK ("filas" >= 0),
  "nuevos" integer NOT NULL CHECK ("nuevos" >= 0),
  "modificados" integer NOT NULL CHECK ("modificados" >= 0),
  "sinCambios" integer NOT NULL CHECK ("sinCambios" >= 0),
  "creadoEn" timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public."importacion_catalogo" ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public."importacion_catalogo" TO authenticated;
CREATE POLICY importacion_catalogo_leer ON public."importacion_catalogo" FOR SELECT TO authenticated
  USING ((SELECT privado.es_administrador()));

-- Los bienes se crean desde la base: necesitan su propio identificador y fecha de modificación.
ALTER TABLE public."bien" ALTER COLUMN "id" SET DEFAULT gen_random_uuid()::text;
ALTER TABLE public."bien" ALTER COLUMN "modificadoEn" SET DEFAULT now();

-- Cuenta (modo 'previsualizar') o aplica (modo 'aplicar') una tanda de filas del listado. Solo administradores.
-- Devuelve cuántas filas son bienes nuevos, cuáles cambiarían o cambiaron, y cuáles ya estaban igual.
CREATE OR REPLACE FUNCTION public.importar_catalogo(p_filas jsonb, p_modo text)
RETURNS TABLE ("nuevos" integer, "modificados" integer, "sinCambios" integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_total integer;
  v_nuevos integer;
  v_modificados integer;
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

  CREATE TEMP TABLE IF NOT EXISTS pg_temp.filas_catalogo (LIKE public."bien" EXCLUDING ALL) ON COMMIT DROP;
  DELETE FROM pg_temp.filas_catalogo;
  INSERT INTO pg_temp.filas_catalogo ("numeroInventario", "descripcion", "catalogo", "ubicacionFisica", "areaResponsable",
    "motivoAlta", "estadoBien", "valorUnitario", "fechaIncorporacion", "numeroSerie", "numeroAnterior", "expediente", "id", "modificadoEn")
  SELECT DISTINCT ON (x."numeroInventario") x."numeroInventario", x."descripcion", x."catalogo", x."ubicacionFisica",
         x."areaResponsable", x."motivoAlta", x."estadoBien", x."valorUnitario", x."fechaIncorporacion", x."numeroSerie",
         x."numeroAnterior", x."expediente", gen_random_uuid()::text, now()
  FROM jsonb_to_recordset(p_filas) AS x (
    "numeroInventario" text, "descripcion" text, "catalogo" text, "ubicacionFisica" text, "areaResponsable" text,
    "motivoAlta" text, "estadoBien" text, "valorUnitario" numeric, "fechaIncorporacion" date, "numeroSerie" text,
    "numeroAnterior" text, "expediente" text
  )
  ORDER BY x."numeroInventario";

  IF EXISTS (SELECT 1 FROM pg_temp.filas_catalogo f WHERE f."numeroInventario" IS NULL OR f."numeroInventario" !~ '^[0-9]{1,20}$') THEN
    RAISE EXCEPTION 'Hay filas sin un número de inventario válido' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_temp.filas_catalogo f WHERE greatest(
      length(coalesce(f."descripcion", '')), length(coalesce(f."catalogo", '')), length(coalesce(f."ubicacionFisica", '')),
      length(coalesce(f."areaResponsable", '')), length(coalesce(f."motivoAlta", '')), length(coalesce(f."estadoBien", '')),
      length(coalesce(f."numeroSerie", '')), length(coalesce(f."numeroAnterior", '')), length(coalesce(f."expediente", ''))) > 1000) THEN
    RAISE EXCEPTION 'Hay textos demasiado largos (más de 1000 caracteres)' USING ERRCODE = '22023';
  END IF;

  SELECT count(*) INTO v_total FROM pg_temp.filas_catalogo;
  SELECT count(*) INTO v_nuevos FROM pg_temp.filas_catalogo f
    WHERE NOT EXISTS (SELECT 1 FROM public."bien" b WHERE b."numeroInventario" = f."numeroInventario");
  SELECT count(*) INTO v_modificados FROM pg_temp.filas_catalogo f JOIN public."bien" b ON b."numeroInventario" = f."numeroInventario"
    WHERE (b."descripcion", b."catalogo", b."ubicacionFisica", b."areaResponsable", b."motivoAlta", b."estadoBien",
           b."valorUnitario", b."fechaIncorporacion", b."numeroSerie", b."numeroAnterior", b."expediente")
      IS DISTINCT FROM (f."descripcion", f."catalogo", f."ubicacionFisica", f."areaResponsable", f."motivoAlta", f."estadoBien",
           f."valorUnitario", f."fechaIncorporacion", f."numeroSerie", f."numeroAnterior", f."expediente");

  IF p_modo = 'aplicar' THEN
    INSERT INTO public."bien" AS b ("id", "numeroInventario", "descripcion", "catalogo", "ubicacionFisica", "areaResponsable",
      "motivoAlta", "estadoBien", "valorUnitario", "fechaIncorporacion", "numeroSerie", "numeroAnterior", "expediente", "modificadoEn")
    SELECT f."id", f."numeroInventario", f."descripcion", f."catalogo", f."ubicacionFisica", f."areaResponsable", f."motivoAlta",
           f."estadoBien", f."valorUnitario", f."fechaIncorporacion", f."numeroSerie", f."numeroAnterior", f."expediente", now()
    FROM pg_temp.filas_catalogo f
    ON CONFLICT ("numeroInventario") DO UPDATE SET
      "descripcion" = EXCLUDED."descripcion", "catalogo" = EXCLUDED."catalogo", "ubicacionFisica" = EXCLUDED."ubicacionFisica",
      "areaResponsable" = EXCLUDED."areaResponsable", "motivoAlta" = EXCLUDED."motivoAlta", "estadoBien" = EXCLUDED."estadoBien",
      "valorUnitario" = EXCLUDED."valorUnitario", "fechaIncorporacion" = EXCLUDED."fechaIncorporacion",
      "numeroSerie" = EXCLUDED."numeroSerie", "numeroAnterior" = EXCLUDED."numeroAnterior", "expediente" = EXCLUDED."expediente",
      "modificadoEn" = now()
    WHERE (b."descripcion", b."catalogo", b."ubicacionFisica", b."areaResponsable", b."motivoAlta", b."estadoBien",
           b."valorUnitario", b."fechaIncorporacion", b."numeroSerie", b."numeroAnterior", b."expediente")
      IS DISTINCT FROM (EXCLUDED."descripcion", EXCLUDED."catalogo", EXCLUDED."ubicacionFisica", EXCLUDED."areaResponsable",
           EXCLUDED."motivoAlta", EXCLUDED."estadoBien", EXCLUDED."valorUnitario", EXCLUDED."fechaIncorporacion",
           EXCLUDED."numeroSerie", EXCLUDED."numeroAnterior", EXCLUDED."expediente");
  END IF;

  RETURN QUERY SELECT v_nuevos, v_modificados, v_total - v_nuevos - v_modificados;
END;
$$;

-- Deja la constancia de una carga completa (archivo, huella y totales) y el evento de auditoría.
CREATE OR REPLACE FUNCTION public.registrar_importacion_catalogo(
  p_archivo text, p_hash text, p_filas integer, p_nuevos integer, p_modificados integer, p_sin_cambios integer
) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_id text := gen_random_uuid()::text;
BEGIN
  IF NOT privado.es_administrador() THEN
    RAISE EXCEPTION 'Solo un administrador puede importar el catálogo' USING ERRCODE = '42501';
  END IF;
  INSERT INTO public."importacion_catalogo" ("id", "usuarioId", "archivo", "hashSha256", "filas", "nuevos", "modificados", "sinCambios")
  VALUES (v_id, privado.usuario_actual(), left(btrim(p_archivo), 200), p_hash, p_filas, p_nuevos, p_modificados, p_sin_cambios);
  PERFORM privado.registrar_evento('CATALOGO_IMPORTADO', 'importacion_catalogo', v_id,
    jsonb_build_object('archivo', left(btrim(p_archivo), 200), 'hashSha256', p_hash, 'filas', p_filas,
                       'nuevos', p_nuevos, 'modificados', p_modificados, 'sinCambios', p_sin_cambios));
  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.importar_catalogo(jsonb, text), public.registrar_importacion_catalogo(text, text, integer, integer, integer, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.importar_catalogo(jsonb, text), public.registrar_importacion_catalogo(text, text, integer, integer, integer, integer)
  TO authenticated;
