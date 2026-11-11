-- Lo anulado (ver anular_relevamiento) tampoco aparece en "Mis relevamientos", "Del equipo", el historial de un bien ni cuenta al cerrar una jornada.

CREATE OR REPLACE FUNCTION public.relevamientos_de_bien(p_bien_id text, p_limite integer DEFAULT 5)
 RETURNS TABLE(id text, "idCliente" text, "loteId" text, resultado text, simbologia text, "valorLeido" text, "ubicacionObservada" text, observaciones text, "estadoDetectado" text, clase text, descripcion text, "numeroSerie" text, "codigoProvisorio" text, "tieneFoto" boolean, "relevadoEnDispositivo" timestamp without time zone, "sincronizadoEn" timestamp without time zone, relevador text, propio boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  WHERE r."bienId" = p_bien_id AND r."anuladoEn" IS NULL
  ORDER BY r."relevadoEnDispositivo" DESC
  LIMIT least(greatest(coalesce(p_limite, 5), 1), 50);
END;
$function$;

CREATE OR REPLACE FUNCTION public.relevamientos_visibles(p_id text DEFAULT NULL::text, p_solo_mios boolean DEFAULT false, p_limite integer DEFAULT 300)
 RETURNS TABLE(id text, "idCliente" text, "loteId" text, resultado text, simbologia text, "valorLeido" text, "ubicacionObservada" text, observaciones text, "estadoDetectado" text, clase text, descripcion text, "numeroSerie" text, "codigoProvisorio" text, "tieneFoto" boolean, "relevadoEnDispositivo" timestamp without time zone, "sincronizadoEn" timestamp without time zone, relevador text, propio boolean, "bienId" text, "numeroInventario" text, "bienDescripcion" text, "estadoCodigo" text, "estadoBien" text, "ubicacionFisica" text, "areaResponsable" text, catalogo text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
    AND r."anuladoEn" IS NULL
  ORDER BY r."relevadoEnDispositivo" DESC
  LIMIT least(greatest(coalesce(p_limite, 300), 1), 1000);
END;
$function$;

CREATE OR REPLACE FUNCTION public.cerrar_jornada(p_id text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  WHERE r."jornadaId" = p_id AND r."resultado" = 'encontrado' AND r."anuladoEn" IS NULL
    AND ((v_tipo = 'area' AND b."areaResponsable" = v_alcance) OR (v_tipo = 'ubicacion' AND b."ubicacionFisica" = v_alcance));
  UPDATE public."jornada" SET "estado" = 'cerrada', "cerradaEn" = now(), "cerradaPor" = privado.usuario_actual() WHERE "id" = p_id;
  PERFORM privado.registrar_evento('JORNADA_CERRADA', 'jornada', p_id,
    jsonb_build_object('tipo', v_tipo, 'alcance', v_alcance, 'esperados', v_esperados, 'encontrados', v_encontrados));
END;
$function$;
