-- Fase 3 del plan v3, segunda parte: relevamientos, fotos de hallazgos, vínculo de hallazgos, eventos de
-- auditoría y exportación, sin backend. Los relevamientos y las constancias de exportación se insertan
-- directo bajo RLS; lo que modifica filas ajenas pasa por funciones que verifican el rol.

-- 1. Foto del hallazgo: el archivo vive en Storage (bucket privado) y la fila guarda su ubicación -------
ALTER TABLE public."relevamiento"
  ADD COLUMN IF NOT EXISTS "fotoPath" text,
  ADD COLUMN IF NOT EXISTS "fotoHash" text,
  ADD COLUMN IF NOT EXISTS "fotoTamano" integer;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('hallazgos', 'hallazgos', false, 1000000, ARRAY['image/jpeg'])
ON CONFLICT (id) DO NOTHING;

-- Cada persona sube a su carpeta (`<id de usuario>/<idCliente>.jpg`). No se modifica ni se borra.
CREATE POLICY hallazgos_subir ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'hallazgos' AND (SELECT privado.es_activa())
    AND (storage.foldername(name))[1] = (SELECT privado.usuario_actual()));
CREATE POLICY hallazgos_ver ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'hallazgos' AND (SELECT privado.es_activa())
    AND ((storage.foldername(name))[1] = (SELECT privado.usuario_actual()) OR (SELECT privado.es_administrador())));

-- 2. Funciones --------------------------------------------------------------------------------------
-- Últimos relevamientos de un bien, de cualquier relevador (la ficha muestra cuándo se vio por última vez).
CREATE OR REPLACE FUNCTION public.relevamientos_de_bien(p_bien_id text, p_limite integer DEFAULT 5)
RETURNS TABLE (
  "id" text, "idCliente" text, "loteId" text, "resultado" text, "simbologia" text, "valorLeido" text,
  "ubicacionObservada" text, "observaciones" text, "estadoDetectado" text, "clase" text, "descripcion" text,
  "numeroSerie" text, "codigoProvisorio" text, "tieneFoto" boolean, "relevadoEnDispositivo" timestamp,
  "sincronizadoEn" timestamp, "relevador" text, "propio" boolean
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
         r."sincronizadoEn", coalesce(u."nombre", u."cuenta"), (r."usuarioId" = v_yo)
  FROM public."relevamiento" r
  JOIN public."usuario" u ON u."id" = r."usuarioId"
  WHERE r."bienId" = p_bien_id
  ORDER BY r."relevadoEnDispositivo" DESC
  LIMIT least(greatest(coalesce(p_limite, 5), 1), 50);
END;
$$;

-- Adjunta la foto (ya subida a Storage) a un hallazgo propio. Idempotente: si ya tiene foto, no hace nada.
CREATE OR REPLACE FUNCTION public.adjuntar_foto(p_id_cliente text, p_tamano integer, p_hash text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_yo text := privado.usuario_actual();
  v_id text;
  v_dueno text;
  v_resultado public."ResultadoRelevamiento";
  v_foto text;
  v_ruta text;
BEGIN
  IF NOT privado.es_activa() THEN
    RAISE EXCEPTION 'La cuenta no está activa' USING ERRCODE = '42501';
  END IF;
  SELECT r."id", r."usuarioId", r."resultado", r."fotoPath" INTO v_id, v_dueno, v_resultado, v_foto
  FROM public."relevamiento" r WHERE r."idCliente" = p_id_cliente;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Primero hay que registrar el hallazgo' USING ERRCODE = 'P0002';
  END IF;
  IF v_dueno <> v_yo THEN
    RAISE EXCEPTION 'Solo quien registró el hallazgo puede adjuntar la foto' USING ERRCODE = '42501';
  END IF;
  IF v_resultado <> 'hallazgo' THEN
    RAISE EXCEPTION 'Solo los hallazgos llevan foto' USING ERRCODE = '22023';
  END IF;
  IF v_foto IS NOT NULL THEN
    RETURN;
  END IF;
  IF p_tamano IS NULL OR p_tamano < 1 OR p_tamano > 1000000 OR p_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'Los datos de la foto no son válidos' USING ERRCODE = '22023';
  END IF;
  v_ruta := v_yo || '/' || p_id_cliente || '.jpg';
  IF NOT EXISTS (SELECT 1 FROM storage.objects o WHERE o.bucket_id = 'hallazgos' AND o.name = v_ruta) THEN
    RAISE EXCEPTION 'La foto todavía no se subió' USING ERRCODE = 'P0002';
  END IF;
  UPDATE public."relevamiento" SET "fotoPath" = v_ruta, "fotoHash" = p_hash, "fotoTamano" = p_tamano WHERE "id" = v_id;
  PERFORM privado.registrar_evento('FOTO_ADJUNTADA', 'relevamiento', v_id, jsonb_build_object('tamano', p_tamano, 'hashSha256', p_hash));
END;
$$;

-- Vincula un hallazgo con el bien del catálogo al que corresponde. Solo administradores; exige motivo.
CREATE OR REPLACE FUNCTION public.vincular_hallazgo(p_id text, p_bien_id text, p_motivo text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_motivo text := btrim(coalesce(p_motivo, ''));
  v_resultado public."ResultadoRelevamiento";
  v_bien_actual text;
  v_codigo text;
  v_numero text;
BEGIN
  IF NOT privado.es_administrador() THEN
    RAISE EXCEPTION 'Solo un administrador puede vincular hallazgos' USING ERRCODE = '42501';
  END IF;
  IF length(v_motivo) < 3 OR length(v_motivo) > 200 THEN
    RAISE EXCEPTION 'El motivo debe tener entre 3 y 200 caracteres' USING ERRCODE = '22023';
  END IF;
  SELECT r."resultado", r."bienId", r."codigoProvisorio" INTO v_resultado, v_bien_actual, v_codigo
  FROM public."relevamiento" r WHERE r."id" = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'El relevamiento no existe' USING ERRCODE = 'P0002';
  END IF;
  IF v_resultado <> 'hallazgo' THEN
    RAISE EXCEPTION 'Solo se vinculan hallazgos' USING ERRCODE = '22023';
  END IF;
  IF v_bien_actual IS NOT NULL THEN
    RAISE EXCEPTION 'Este hallazgo ya está vinculado a un bien' USING ERRCODE = '22023';
  END IF;
  SELECT b."numeroInventario" INTO v_numero FROM public."bien" b WHERE b."id" = p_bien_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'El bien no existe en el catálogo' USING ERRCODE = 'P0002';
  END IF;
  UPDATE public."relevamiento" SET "bienId" = p_bien_id WHERE "id" = p_id;
  PERFORM privado.registrar_evento('HALLAZGO_VINCULADO', 'relevamiento', p_id,
    jsonb_build_object('numeroInventario', v_numero, 'codigoProvisorio', v_codigo), v_motivo);
END;
$$;

-- La app llama a esta función al iniciar sesión: deja el último acceso y el evento de auditoría.
CREATE OR REPLACE FUNCTION public.registrar_inicio_sesion()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  IF NOT privado.es_activa() THEN
    RAISE EXCEPTION 'La cuenta no está activa' USING ERRCODE = '42501';
  END IF;
  UPDATE public."usuario" SET "ultimoAccesoEn" = now() WHERE "id" = privado.usuario_actual();
  PERFORM privado.registrar_evento('SESION_INICIADA', 'usuario', privado.usuario_actual());
END;
$$;

REVOKE ALL ON FUNCTION public.relevamientos_de_bien(text, integer), public.adjuntar_foto(text, integer, text),
  public.vincular_hallazgo(text, text, text), public.registrar_inicio_sesion() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.relevamientos_de_bien(text, integer), public.adjuntar_foto(text, integer, text),
  public.vincular_hallazgo(text, text, text), public.registrar_inicio_sesion() TO authenticated;

-- 3. Eventos de auditoría que antes escribía el backend ------------------------------------------------
-- Solo cuando quien escribe es una cuenta de la app (auth.uid()): el backend y los scripts siguen registrando lo suyo.
CREATE OR REPLACE FUNCTION privado.evento_relevamientos() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_n integer;
  v_ubicacion text;
  v_lote text;
BEGIN
  IF privado.usuario_actual() IS NULL THEN
    RETURN NULL;
  END IF;
  SELECT count(*), min("ubicacionObservada"), min("loteId") INTO v_n, v_ubicacion, v_lote FROM nuevos;
  IF v_n > 0 THEN
    PERFORM privado.registrar_evento('RELEVAMIENTO_REGISTRADO', 'relevamiento', NULL,
      jsonb_build_object('cantidad', v_n, 'ubicacion', v_ubicacion, 'loteId', v_lote));
  END IF;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION privado.evento_relevamientos() FROM PUBLIC;
CREATE TRIGGER relevamiento_evento AFTER INSERT ON public."relevamiento"
  REFERENCING NEW TABLE AS nuevos FOR EACH STATEMENT EXECUTE FUNCTION privado.evento_relevamientos();

CREATE OR REPLACE FUNCTION privado.evento_exportacion() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  IF privado.usuario_actual() IS NULL THEN
    RETURN NULL;
  END IF;
  PERFORM privado.registrar_evento('EXPORTACION_GENERADA', 'relevamiento', NEW."id",
    jsonb_build_object('formato', NEW."formato", 'filas', NEW."filas", 'hashSha256', NEW."hashSha256", 'filtros', NEW."filtros"));
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION privado.evento_exportacion() FROM PUBLIC;
CREATE TRIGGER exportacion_evento AFTER INSERT ON public."exportacion"
  FOR EACH ROW EXECUTE FUNCTION privado.evento_exportacion();
