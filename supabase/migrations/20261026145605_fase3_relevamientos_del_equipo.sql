-- Relevamientos visibles para todo el equipo (plan v3, decisión D7): cuando varias personas relevan, cada una
-- tiene que poder ver lo que registraron las demás. Escribir sigue siendo solo lo propio.
-- La tabla `relevamiento` mantiene su política (cada cuenta ve lo suyo; el administrador, todo): el equipo lo
-- ve a través de esta función, que devuelve solo lo necesario y el nombre de quien relevó.

CREATE OR REPLACE FUNCTION public.relevamientos_visibles(
  p_id text DEFAULT NULL, p_solo_mios boolean DEFAULT false, p_limite integer DEFAULT 300
)
RETURNS TABLE (
  "id" text, "idCliente" text, "loteId" text, "resultado" text, "simbologia" text, "valorLeido" text,
  "ubicacionObservada" text, "observaciones" text, "estadoDetectado" text, "clase" text, "descripcion" text,
  "numeroSerie" text, "codigoProvisorio" text, "tieneFoto" boolean, "relevadoEnDispositivo" timestamp,
  "sincronizadoEn" timestamp, "relevador" text, "propio" boolean,
  "bienId" text, "numeroInventario" text, "bienDescripcion" text, "estadoCodigo" text, "estadoBien" text,
  "ubicacionFisica" text, "areaResponsable" text, "catalogo" text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_yo text := privado.usuario_actual();
BEGIN
  IF NOT privado.es_activa() THEN
    RAISE EXCEPTION 'La cuenta no está activa' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT r."id", r."idCliente", r."loteId", r."resultado"::text, r."simbologia"::text, r."valorLeido",
         r."ubicacionObservada", r."observaciones", r."estadoDetectado", r."clase"::text, r."descripcion",
         r."numeroSerie", r."codigoProvisorio", (r."fotoPath" IS NOT NULL), r."relevadoEnDispositivo",
         r."sincronizadoEn", coalesce(u."nombre", u."cuenta"), (r."usuarioId" = v_yo),
         b."id", b."numeroInventario", b."descripcion", b."estadoCodigo"::text, b."estadoBien",
         b."ubicacionFisica", b."areaResponsable", b."catalogo"
  FROM public."relevamiento" r
  JOIN public."usuario" u ON u."id" = r."usuarioId"
  LEFT JOIN public."bien" b ON b."id" = r."bienId"
  WHERE (p_id IS NULL OR r."id" = p_id)
    AND (NOT p_solo_mios OR r."usuarioId" = v_yo)
  ORDER BY r."relevadoEnDispositivo" DESC
  LIMIT least(greatest(coalesce(p_limite, 300), 1), 1000);
END;
$$;

REVOKE ALL ON FUNCTION public.relevamientos_visibles(text, boolean, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.relevamientos_visibles(text, boolean, integer) TO authenticated;

-- Las fotos de los hallazgos las puede ver cualquier cuenta activa (antes, solo su dueño y los administradores).
DROP POLICY IF EXISTS hallazgos_ver ON storage.objects;
CREATE POLICY hallazgos_ver ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'hallazgos' AND (SELECT privado.es_activa()));
