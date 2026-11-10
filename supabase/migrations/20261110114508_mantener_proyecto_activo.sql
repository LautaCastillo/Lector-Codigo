-- El plan gratuito de Supabase pausa los proyectos con poca actividad en 7 dias. Una tarea diaria genera esa actividad:
-- una consulta a una tabla propia y un pedido a la API REST del propio proyecto (los dos cuentan como uso real).
-- Hace falta el secreto de Vault `clave_publicable` (la clave publicable del proyecto, que es publica por diseño):
--   SELECT vault.create_secret('<clave publicable>', 'clave_publicable');
-- Sin el secreto, la tarea igual hace la consulta a la tabla.
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION privado.mantener_activo()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_clave text;
BEGIN
  PERFORM count(*) FROM public."bien";
  SELECT s.decrypted_secret INTO v_clave FROM vault.decrypted_secrets s WHERE s.name = 'clave_publicable';
  IF v_clave IS NOT NULL THEN
    PERFORM net.http_get(
      url := 'https://bwheydnvxsocuwopdaif.supabase.co/rest/v1/bien?select=id&limit=1',
      headers := jsonb_build_object('apikey', v_clave)
    );
  END IF;
END;
$function$;
REVOKE ALL ON FUNCTION privado.mantener_activo() FROM PUBLIC, anon, authenticated;

-- Todos los dias a las 09:00 UTC (06:00 en Argentina).
SELECT cron.schedule('mantener-activo', '0 9 * * *', $$SELECT privado.mantener_activo()$$);
