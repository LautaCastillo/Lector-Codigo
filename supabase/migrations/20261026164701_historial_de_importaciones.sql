-- Historial de importaciones del catálogo, visible para todas las cuentas activas: qué archivos se cargaron, cuándo, quién
-- los cargó, cuántos bienes entraron y de qué áreas eran. La tabla sigue leyéndose solo con permiso de administrador;
-- el resto lo ve a través de la función, que devuelve únicamente lo necesario.

ALTER TABLE public."importacion_catalogo" ADD COLUMN IF NOT EXISTS "areas" text[];

-- La constancia ahora guarda también las áreas que trae el archivo.
DROP FUNCTION IF EXISTS public.registrar_importacion_catalogo(text, text, integer, integer, integer, integer);

CREATE OR REPLACE FUNCTION public.registrar_importacion_catalogo(
  p_archivo text, p_hash text, p_filas integer, p_nuevos integer, p_modificados integer, p_sin_cambios integer,
  p_areas text[] DEFAULT NULL
) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_id text := gen_random_uuid()::text;
  v_areas text[] := (SELECT array_agg(left(a, 200)) FROM (SELECT a FROM unnest(p_areas) AS a LIMIT 50) t);
BEGIN
  IF NOT privado.es_administrador() THEN
    RAISE EXCEPTION 'Solo un administrador puede importar el catálogo' USING ERRCODE = '42501';
  END IF;
  INSERT INTO public."importacion_catalogo" ("id", "usuarioId", "archivo", "hashSha256", "filas", "nuevos", "modificados", "sinCambios", "areas")
  VALUES (v_id, privado.usuario_actual(), left(btrim(p_archivo), 200), p_hash, p_filas, p_nuevos, p_modificados, p_sin_cambios, v_areas);
  PERFORM privado.registrar_evento('CATALOGO_IMPORTADO', 'importacion_catalogo', v_id,
    jsonb_build_object('archivo', left(btrim(p_archivo), 200), 'hashSha256', p_hash, 'filas', p_filas,
                       'nuevos', p_nuevos, 'modificados', p_modificados, 'sinCambios', p_sin_cambios, 'areas', v_areas));
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.historial_importaciones(p_limite integer DEFAULT 100)
RETURNS TABLE (
  "id" text, "archivo" text, "hashSha256" text, "filas" integer, "nuevos" integer, "modificados" integer,
  "sinCambios" integer, "areas" text[], "creadoEn" timestamptz, "usuario" text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  IF NOT privado.es_activa() THEN
    RAISE EXCEPTION 'La cuenta no está activa' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT i."id", i."archivo", i."hashSha256", i."filas", i."nuevos", i."modificados", i."sinCambios", i."areas", i."creadoEn",
         coalesce(u."nombre", u."cuenta")
  FROM public."importacion_catalogo" i
  JOIN public."usuario" u ON u."id" = i."usuarioId"
  ORDER BY i."creadoEn" DESC
  LIMIT least(greatest(coalesce(p_limite, 100), 1), 500);
END;
$$;

REVOKE ALL ON FUNCTION public.registrar_importacion_catalogo(text, text, integer, integer, integer, integer, text[]),
  public.historial_importaciones(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_importacion_catalogo(text, text, integer, integer, integer, integer, text[]),
  public.historial_importaciones(integer) TO authenticated;
