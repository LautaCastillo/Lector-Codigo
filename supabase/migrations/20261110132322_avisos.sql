-- Avisos: una bandeja por persona con lo que le conviene saber, que la app muestra con una campana y en vivo mientras está abierta.
--   jornada_abierta   se abrió una jornada: les avisa a los administradores y a quien tiene una tarea pendiente de ese alcance.
--   jornada_cerrada   se cerró: les avisa a quien relevó en ella, a quien la abrió, a los administradores y a quien tiene una tarea pendiente.
--   discrepancia      dos lecturas de un mismo bien en una jornada no coinciden: les avisa a quien abrió la jornada y a los administradores.
--   tarea_asignada    le asignaron una tarea.
-- Nunca se avisa a quien hizo la acción ni a cuentas que no están activas. Un aviso no se repite (hay una "clave" por persona), y un fallo al
-- armar un aviso no frena la acción que lo originó (una lectura, por ejemplo, se guarda igual). Cada cuenta ve solo los suyos.
-- Esta tabla es la fuente de verdad: el día que se agreguen notificaciones push al teléfono, se envían a partir de ella.

CREATE TABLE public."aviso" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "usuarioId" text NOT NULL REFERENCES public."usuario" ("id") ON DELETE CASCADE,
  "tipo" text NOT NULL CHECK ("tipo" IN ('jornada_abierta', 'jornada_cerrada', 'discrepancia', 'tarea_asignada')),
  "titulo" text NOT NULL,
  "detalle" text,
  "jornadaId" text REFERENCES public."jornada" ("id") ON DELETE CASCADE,
  "bienId" text REFERENCES public."bien" ("id") ON DELETE CASCADE,
  "tareaId" text REFERENCES public."tarea" ("id") ON DELETE CASCADE,
  "clave" text NOT NULL,
  "creadoEn" timestamp with time zone NOT NULL DEFAULT now(),
  "leidoEn" timestamp with time zone,
  UNIQUE ("usuarioId", "clave")
);
CREATE INDEX aviso_por_persona ON public."aviso" ("usuarioId", "creadoEn" DESC);
ALTER TABLE public."aviso" ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public."aviso" TO authenticated;
CREATE POLICY aviso_leer ON public."aviso" FOR SELECT TO authenticated
  USING ((SELECT privado.es_activa()) AND "usuarioId" = (SELECT privado.usuario_actual()));
ALTER PUBLICATION supabase_realtime ADD TABLE public."aviso";

-- Crea un aviso; si ya existe uno con la misma clave para esa persona, no hace nada.
CREATE OR REPLACE FUNCTION privado.crear_aviso(p_usuario text, p_tipo text, p_titulo text, p_detalle text, p_clave text, p_jornada text DEFAULT NULL, p_bien text DEFAULT NULL, p_tarea text DEFAULT NULL)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO ''
AS $function$
  INSERT INTO public."aviso" ("usuarioId", "tipo", "titulo", "detalle", "clave", "jornadaId", "bienId", "tareaId")
  VALUES (p_usuario, p_tipo, p_titulo, p_detalle, p_clave, p_jornada, p_bien, p_tarea)
  ON CONFLICT ("usuarioId", "clave") DO NOTHING
$function$;
REVOKE ALL ON FUNCTION privado.crear_aviso(text, text, text, text, text, text, text, text) FROM PUBLIC, anon, authenticated;

-- Jornada abierta o cerrada.
CREATE OR REPLACE FUNCTION privado.avisar_jornada()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_quien text;
  r record;
BEGIN
  BEGIN
    IF TG_OP = 'INSERT' THEN
      SELECT coalesce(u."nombre", u."cuenta") INTO v_quien FROM public."usuario" u WHERE u."id" = NEW."creadaPor";
      FOR r IN
        SELECT u."id" FROM public."usuario" u
        WHERE u."estado" = 'activa' AND u."id" <> NEW."creadaPor"
          AND (u."rol" = 'administrador' OR EXISTS (
            SELECT 1 FROM public."tarea" t WHERE t."asignadaA" = u."id" AND t."estado" = 'pendiente' AND t."tipo" = NEW."tipo" AND t."alcance" = NEW."alcance"))
      LOOP
        PERFORM privado.crear_aviso(r."id", 'jornada_abierta', 'Se abrió una jornada', NEW."alcance" || ', la abrió ' || v_quien, 'jornada_abierta:' || NEW."id", NEW."id");
      END LOOP;
    ELSE
      SELECT coalesce(u."nombre", u."cuenta") INTO v_quien FROM public."usuario" u WHERE u."id" = NEW."cerradaPor";
      FOR r IN
        SELECT u."id" FROM public."usuario" u
        WHERE u."estado" = 'activa' AND u."id" IS DISTINCT FROM NEW."cerradaPor"
          AND (u."rol" = 'administrador' OR u."id" = NEW."creadaPor"
               OR EXISTS (SELECT 1 FROM public."relevamiento" rl WHERE rl."jornadaId" = NEW."id" AND rl."usuarioId" = u."id" AND rl."anuladoEn" IS NULL)
               OR EXISTS (SELECT 1 FROM public."tarea" t WHERE t."asignadaA" = u."id" AND t."estado" = 'pendiente' AND t."tipo" = NEW."tipo" AND t."alcance" = NEW."alcance"))
      LOOP
        PERFORM privado.crear_aviso(r."id", 'jornada_cerrada', 'Se cerró una jornada', NEW."alcance" || ', la cerró ' || coalesce(v_quien, 'alguien'), 'jornada_cerrada:' || NEW."id", NEW."id");
      END LOOP;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION privado.avisar_jornada() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER jornada_avisar_apertura AFTER INSERT ON public."jornada" FOR EACH ROW EXECUTE FUNCTION privado.avisar_jornada();
CREATE TRIGGER jornada_avisar_cierre AFTER UPDATE OF "estado" ON public."jornada" FOR EACH ROW
  WHEN (OLD."estado" IS DISTINCT FROM NEW."estado" AND NEW."estado" = 'cerrada') EXECUTE FUNCTION privado.avisar_jornada();

-- Una lectura que no coincide con otra del mismo bien en la misma jornada (otro resultado u otra ubicación).
CREATE OR REPLACE FUNCTION privado.avisar_discrepancia()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_creadora text;
  v_alcance text;
  v_bien text;
  r record;
BEGIN
  BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM public."relevamiento" o
      WHERE o."jornadaId" = NEW."jornadaId" AND o."bienId" = NEW."bienId" AND o."id" <> NEW."id" AND o."anuladoEn" IS NULL
        AND (o."resultado", coalesce(o."ubicacionObservada", '')) IS DISTINCT FROM (NEW."resultado", coalesce(NEW."ubicacionObservada", ''))
    ) THEN
      RETURN NEW;
    END IF;
    SELECT j."creadaPor", j."alcance" INTO v_creadora, v_alcance FROM public."jornada" j WHERE j."id" = NEW."jornadaId";
    SELECT b."numeroInventario" || coalesce(' · ' || b."descripcion", '') INTO v_bien FROM public."bien" b WHERE b."id" = NEW."bienId";
    FOR r IN
      SELECT u."id" FROM public."usuario" u
      WHERE u."estado" = 'activa' AND u."id" <> NEW."usuarioId" AND (u."rol" = 'administrador' OR u."id" = v_creadora)
    LOOP
      PERFORM privado.crear_aviso(r."id", 'discrepancia', 'Hay una discrepancia por revisar', coalesce(v_bien, 'Un bien') || ' (' || v_alcance || ')',
                                  'discrepancia:' || NEW."jornadaId" || ':' || NEW."bienId", NEW."jornadaId", NEW."bienId");
    END LOOP;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION privado.avisar_discrepancia() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER relevamiento_avisar_discrepancia AFTER INSERT ON public."relevamiento" FOR EACH ROW
  WHEN (NEW."jornadaId" IS NOT NULL AND NEW."bienId" IS NOT NULL) EXECUTE FUNCTION privado.avisar_discrepancia();

-- Una tarea nueva.
CREATE OR REPLACE FUNCTION privado.avisar_tarea()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  BEGIN
    IF NEW."asignadaA" <> NEW."creadaPor" THEN
      PERFORM privado.crear_aviso(NEW."asignadaA", 'tarea_asignada', 'Te asignaron una tarea',
                                  NEW."alcance" || ', para el ' || to_char(NEW."fechaPrevista", 'DD/MM/YYYY'), 'tarea:' || NEW."id", NULL, NULL, NEW."id");
    END IF;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION privado.avisar_tarea() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER tarea_avisar AFTER INSERT ON public."tarea" FOR EACH ROW EXECUTE FUNCTION privado.avisar_tarea();

-- Marca como leídos los avisos propios indicados (o todos, si no se indica ninguno). Devuelve cuántos marcó. No toca los de otras cuentas.
CREATE OR REPLACE FUNCTION public.marcar_avisos_leidos(p_ids text[] DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_n integer;
BEGIN
  IF NOT privado.es_activa() THEN
    RAISE EXCEPTION 'La cuenta no está activa' USING ERRCODE = '42501';
  END IF;
  UPDATE public."aviso" a SET "leidoEn" = now()
  WHERE a."usuarioId" = privado.usuario_actual() AND a."leidoEn" IS NULL AND (p_ids IS NULL OR a."id" = ANY (p_ids));
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$function$;
REVOKE ALL ON FUNCTION public.marcar_avisos_leidos(text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.marcar_avisos_leidos(text[]) TO authenticated;
