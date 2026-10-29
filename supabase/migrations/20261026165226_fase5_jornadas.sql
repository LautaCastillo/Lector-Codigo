-- Fase 5 del plan v3 (ADR 0004): jornadas de relevamiento compartidas.
-- Una jornada es un relevamiento de un área o de una ubicación física en el que pueden participar varias personas a la vez.
-- Lo esperado se calcula en vivo del catálogo; cada lectura es un `relevamiento` con su `jornadaId`; el avance lo comparten todos.
-- Cualquier cuenta activa puede crear una jornada, sumarse a una abierta y relevar en ella (decisión del plan, a confirmar).

CREATE TABLE public."jornada" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "tipo" text NOT NULL CHECK ("tipo" IN ('area', 'ubicacion')),
  "alcance" text NOT NULL CHECK (length("alcance") BETWEEN 1 AND 300),
  "nombre" text CHECK ("nombre" IS NULL OR length("nombre") <= 120),
  "estado" text NOT NULL DEFAULT 'abierta' CHECK ("estado" IN ('abierta', 'cerrada')),
  "creadaPor" text NOT NULL REFERENCES public."usuario" ("id") ON DELETE RESTRICT,
  "creadoEn" timestamptz NOT NULL DEFAULT now(),
  "cerradaEn" timestamptz,
  "cerradaPor" text REFERENCES public."usuario" ("id") ON DELETE RESTRICT
);
CREATE INDEX "jornada_estado_idx" ON public."jornada" ("estado", "creadoEn");
ALTER TABLE public."jornada" ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public."jornada" TO authenticated;
CREATE POLICY jornada_leer ON public."jornada" FOR SELECT TO authenticated USING ((SELECT privado.es_activa()));

ALTER TABLE public."relevamiento" ADD COLUMN IF NOT EXISTS "jornadaId" text REFERENCES public."jornada" ("id") ON DELETE RESTRICT;
CREATE INDEX IF NOT EXISTS "relevamiento_jornadaId_idx" ON public."relevamiento" ("jornadaId");

-- Para que el equipo se vea entre sí (y el tiempo real le llegue a todos), las cuentas activas leen todos los relevamientos.
-- Escribir sigue siendo solo lo propio, y en una jornada solo mientras está abierta.
DROP POLICY relevamiento_leer ON public."relevamiento";
CREATE POLICY relevamiento_leer ON public."relevamiento" FOR SELECT TO authenticated USING ((SELECT privado.es_activa()));
DROP POLICY relevamiento_insertar ON public."relevamiento";
CREATE POLICY relevamiento_insertar ON public."relevamiento" FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT privado.es_activa()) AND "usuarioId" = (SELECT privado.usuario_actual())
    AND ("jornadaId" IS NULL OR EXISTS (SELECT 1 FROM public."jornada" j WHERE j."id" = "jornadaId" AND j."estado" = 'abierta'))
  );

-- Crea una jornada, o devuelve la que ya está abierta para ese mismo alcance (así dos personas que la abren a la vez se suman).
CREATE OR REPLACE FUNCTION public.crear_jornada(p_tipo text, p_alcance text, p_nombre text DEFAULT NULL)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_alcance text := btrim(coalesce(p_alcance, ''));
  v_id text;
BEGIN
  IF NOT privado.es_activa() THEN
    RAISE EXCEPTION 'La cuenta no está activa' USING ERRCODE = '42501';
  END IF;
  IF p_tipo NOT IN ('area', 'ubicacion') OR v_alcance = '' OR length(v_alcance) > 300 THEN
    RAISE EXCEPTION 'La jornada necesita un tipo (área o ubicación) y un alcance válidos' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public."bien" b
    WHERE (p_tipo = 'area' AND b."areaResponsable" = v_alcance) OR (p_tipo = 'ubicacion' AND b."ubicacionFisica" = v_alcance)
  ) THEN
    RAISE EXCEPTION 'No hay bienes en esa área o ubicación del catálogo' USING ERRCODE = '22023';
  END IF;
  SELECT j."id" INTO v_id FROM public."jornada" j
  WHERE j."tipo" = p_tipo AND j."alcance" = v_alcance AND j."estado" = 'abierta' ORDER BY j."creadoEn" LIMIT 1;
  IF v_id IS NOT NULL THEN
    RETURN v_id;
  END IF;
  INSERT INTO public."jornada" ("tipo", "alcance", "nombre", "creadaPor")
  VALUES (p_tipo, v_alcance, nullif(left(btrim(coalesce(p_nombre, '')), 120), ''), privado.usuario_actual())
  RETURNING "id" INTO v_id;
  PERFORM privado.registrar_evento('JORNADA_CREADA', 'jornada', v_id, jsonb_build_object('tipo', p_tipo, 'alcance', v_alcance));
  RETURN v_id;
END;
$$;

-- Cierra una jornada: quien la creó o un administrador. Después no se puede relevar en ella.
CREATE OR REPLACE FUNCTION public.cerrar_jornada(p_id text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_creadora text;
  v_estado text;
  v_tipo text;
  v_alcance text;
  v_esperados integer;
  v_encontrados integer;
BEGIN
  IF NOT privado.es_activa() THEN
    RAISE EXCEPTION 'La cuenta no está activa' USING ERRCODE = '42501';
  END IF;
  SELECT j."creadaPor", j."estado", j."tipo", j."alcance" INTO v_creadora, v_estado, v_tipo, v_alcance
  FROM public."jornada" j WHERE j."id" = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'La jornada no existe' USING ERRCODE = 'P0002';
  END IF;
  IF v_creadora <> privado.usuario_actual() AND NOT privado.es_administrador() THEN
    RAISE EXCEPTION 'Solo quien creó la jornada o un administrador puede cerrarla' USING ERRCODE = '42501';
  END IF;
  IF v_estado = 'cerrada' THEN
    RAISE EXCEPTION 'La jornada ya está cerrada' USING ERRCODE = '22023';
  END IF;
  SELECT count(*) INTO v_esperados FROM public."bien" b
  WHERE (v_tipo = 'area' AND b."areaResponsable" = v_alcance) OR (v_tipo = 'ubicacion' AND b."ubicacionFisica" = v_alcance);
  SELECT count(DISTINCT r."bienId") INTO v_encontrados FROM public."relevamiento" r JOIN public."bien" b ON b."id" = r."bienId"
  WHERE r."jornadaId" = p_id AND r."resultado" = 'encontrado'
    AND ((v_tipo = 'area' AND b."areaResponsable" = v_alcance) OR (v_tipo = 'ubicacion' AND b."ubicacionFisica" = v_alcance));
  UPDATE public."jornada" SET "estado" = 'cerrada', "cerradaEn" = now(), "cerradaPor" = privado.usuario_actual() WHERE "id" = p_id;
  PERFORM privado.registrar_evento('JORNADA_CERRADA', 'jornada', p_id,
    jsonb_build_object('tipo', v_tipo, 'alcance', v_alcance, 'esperados', v_esperados, 'encontrados', v_encontrados));
END;
$$;

-- Jornadas con su avance (encontrados sobre esperados). `p_id` trae una sola; `p_estado` filtra por abierta o cerrada.
CREATE OR REPLACE FUNCTION public.listar_jornadas(p_estado text DEFAULT NULL, p_id text DEFAULT NULL)
RETURNS TABLE (
  "id" text, "tipo" text, "alcance" text, "nombre" text, "estado" text, "creadaPor" text, "creadoEn" timestamptz,
  "cerradaEn" timestamptz, "esperados" integer, "encontrados" integer, "propia" boolean
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  IF NOT privado.es_activa() THEN
    RAISE EXCEPTION 'La cuenta no está activa' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT j."id", j."tipo", j."alcance", j."nombre", j."estado", coalesce(u."nombre", u."cuenta"), j."creadoEn", j."cerradaEn",
    (SELECT count(*)::integer FROM public."bien" b
       WHERE (j."tipo" = 'area' AND b."areaResponsable" = j."alcance") OR (j."tipo" = 'ubicacion' AND b."ubicacionFisica" = j."alcance")),
    (SELECT count(DISTINCT r."bienId")::integer FROM public."relevamiento" r JOIN public."bien" b ON b."id" = r."bienId"
       WHERE r."jornadaId" = j."id" AND r."resultado" = 'encontrado'
         AND ((j."tipo" = 'area' AND b."areaResponsable" = j."alcance") OR (j."tipo" = 'ubicacion' AND b."ubicacionFisica" = j."alcance"))),
    (j."creadaPor" = privado.usuario_actual())
  FROM public."jornada" j JOIN public."usuario" u ON u."id" = j."creadaPor"
  WHERE (p_estado IS NULL OR j."estado" = p_estado) AND (p_id IS NULL OR j."id" = p_id)
  ORDER BY j."creadoEn" DESC
  LIMIT 200;
END;
$$;

-- Lo esperado de la jornada (los bienes del área o la ubicación) con quién lo relevó y dónde, más lo que apareció que no era
-- de ese alcance ("extra"): bienes de otra área, códigos fuera del catálogo y hallazgos.
CREATE OR REPLACE FUNCTION public.avance_jornada(p_id text)
RETURNS TABLE (
  "tipo" text, "relevamientoId" text, "bienId" text, "numeroInventario" text, "descripcion" text, "ubicacionFisica" text,
  "areaResponsable" text, "responsableUso" text, "estadoBien" text, "encontrado" boolean, "resultado" text,
  "ubicacionObservada" text, "relevador" text, "relevadoEn" timestamp, "fueraDeLugar" boolean
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_tipo text;
  v_alcance text;
BEGIN
  IF NOT privado.es_activa() THEN
    RAISE EXCEPTION 'La cuenta no está activa' USING ERRCODE = '42501';
  END IF;
  SELECT j."tipo", j."alcance" INTO v_tipo, v_alcance FROM public."jornada" j WHERE j."id" = p_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'La jornada no existe' USING ERRCODE = 'P0002';
  END IF;
  RETURN QUERY
  WITH enalcance AS (
    SELECT b."id" AS bid FROM public."bien" b
    WHERE (v_tipo = 'area' AND b."areaResponsable" = v_alcance) OR (v_tipo = 'ubicacion' AND b."ubicacionFisica" = v_alcance)
  ),
  ultimas AS (
    SELECT DISTINCT ON (r."bienId") r."id" AS rid, r."bienId" AS bid, r."usuarioId" AS uid, r."resultado" AS res,
           r."ubicacionObservada" AS obs, r."relevadoEnDispositivo" AS cuando
    FROM public."relevamiento" r
    WHERE r."jornadaId" = p_id AND r."resultado" = 'encontrado' AND r."bienId" IS NOT NULL
    ORDER BY r."bienId", r."relevadoEnDispositivo" DESC
  )
  SELECT 'esperado'::text, ul.rid, b."id", b."numeroInventario", b."descripcion", b."ubicacionFisica", b."areaResponsable",
         b."responsableUso", b."estadoBien", (ul.rid IS NOT NULL), ul.res::text, ul.obs, coalesce(us."nombre", us."cuenta"), ul.cuando,
         (ul.rid IS NOT NULL AND ul.obs IS NOT NULL AND ul.obs IS DISTINCT FROM b."ubicacionFisica")
  FROM enalcance e
  JOIN public."bien" b ON b."id" = e.bid
  LEFT JOIN ultimas ul ON ul.bid = b."id"
  LEFT JOIN public."usuario" us ON us."id" = ul.uid
  UNION ALL
  SELECT 'extra'::text, r."id", b."id", b."numeroInventario", coalesce(b."descripcion", r."descripcion"), b."ubicacionFisica",
         b."areaResponsable", b."responsableUso", b."estadoBien", (r."resultado" = 'encontrado'), r."resultado"::text,
         r."ubicacionObservada", coalesce(us."nombre", us."cuenta"), r."relevadoEnDispositivo", false
  FROM public."relevamiento" r
  LEFT JOIN public."bien" b ON b."id" = r."bienId"
  LEFT JOIN public."usuario" us ON us."id" = r."usuarioId"
  WHERE r."jornadaId" = p_id AND (r."bienId" IS NULL OR r."bienId" NOT IN (SELECT e2.bid FROM enalcance e2));
END;
$$;

REVOKE ALL ON FUNCTION public.crear_jornada(text, text, text), public.cerrar_jornada(text),
  public.listar_jornadas(text, text), public.avance_jornada(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crear_jornada(text, text, text), public.cerrar_jornada(text),
  public.listar_jornadas(text, text), public.avance_jornada(text) TO authenticated;

-- Tiempo real: la app se suscribe a los cambios de estas tablas (bajo RLS: solo los reciben cuentas activas).
ALTER PUBLICATION supabase_realtime ADD TABLE public."relevamiento", public."jornada";
