-- Fase 2 del plan v3: cuentas creadas y gestionadas por administradores (ADR 0002).
-- Funciones que la app llama como RPC. Cada una verifica el rol dentro de la base y escribe la auditoría.
-- Crear el usuario de Supabase Auth y restablecer contraseñas lo hacen las Edge Functions (necesitan la clave secreta).

ALTER TABLE public."usuario" ADD COLUMN IF NOT EXISTS "debeCambiarClave" boolean NOT NULL DEFAULT false;

-- Alta de la fila `usuario` para un usuario de Supabase Auth recién creado por la Edge Function `crear-cuenta`.
CREATE OR REPLACE FUNCTION public.alta_cuenta(p_auth_id uuid, p_cuenta text, p_nombre text, p_rol public."Rol")
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_admin text := privado.usuario_actual();
  v_id text := gen_random_uuid()::text;
  v_cuenta text := lower(btrim(p_cuenta));
BEGIN
  IF NOT privado.es_administrador() THEN
    RAISE EXCEPTION 'Solo un administrador puede crear cuentas' USING ERRCODE = '42501';
  END IF;
  IF length(btrim(coalesce(p_nombre, ''))) < 3 THEN
    RAISE EXCEPTION 'El nombre debe tener al menos 3 caracteres' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM auth.users a WHERE a.id = p_auth_id AND lower(a.email) = v_cuenta) THEN
    RAISE EXCEPTION 'No existe el usuario de autenticación de esa cuenta' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public."usuario" ("id", "cuenta", "nombre", "rol", "estado", "aprobadoPor", "aprobadoEn", "authId", "debeCambiarClave")
  VALUES (v_id, v_cuenta, btrim(p_nombre), p_rol, 'activa', v_admin, now(), p_auth_id, true);
  PERFORM privado.registrar_evento('CUENTA_CREADA', 'usuario', v_id, jsonb_build_object('cuenta', v_cuenta, 'rolNuevo', p_rol));
  RETURN v_id;
END;
$$;

-- Activar, suspender o dar de baja. Suspender y dar de baja además cierran las sesiones abiertas.
CREATE OR REPLACE FUNCTION public.cambiar_estado_cuenta(p_usuario_id text, p_estado public."EstadoCuenta", p_motivo text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_admin text := privado.usuario_actual();
  v_actual public."EstadoCuenta";
  v_auth uuid;
  v_motivo text := nullif(btrim(coalesce(p_motivo, '')), '');
  v_accion text;
BEGIN
  IF NOT privado.es_administrador() THEN
    RAISE EXCEPTION 'Solo un administrador puede cambiar el estado de una cuenta' USING ERRCODE = '42501';
  END IF;
  IF p_usuario_id = v_admin THEN
    RAISE EXCEPTION 'Un administrador no puede cambiar su propia cuenta' USING ERRCODE = '42501';
  END IF;
  SELECT u."estado", u."authId" INTO v_actual, v_auth FROM public."usuario" u WHERE u."id" = p_usuario_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'La cuenta no existe' USING ERRCODE = 'P0002';
  END IF;
  IF v_actual = 'baja' THEN
    RAISE EXCEPTION 'Una cuenta dada de baja no se puede modificar' USING ERRCODE = '22023';
  END IF;
  IF p_estado = v_actual THEN
    RAISE EXCEPTION 'La cuenta ya está en ese estado' USING ERRCODE = '22023';
  END IF;
  IF p_estado = 'pendiente' THEN
    RAISE EXCEPTION 'Una cuenta no puede volver a pendiente' USING ERRCODE = '22023';
  END IF;
  IF (p_estado IN ('suspendida', 'baja', 'rechazada') AND v_motivo IS NULL)
     OR (v_motivo IS NOT NULL AND length(v_motivo) < 3) THEN
    RAISE EXCEPTION 'El motivo es obligatorio (al menos 3 caracteres)' USING ERRCODE = '22023';
  END IF;
  v_accion := CASE p_estado WHEN 'activa' THEN 'reactivar' WHEN 'suspendida' THEN 'suspender' WHEN 'baja' THEN 'baja' ELSE 'rechazar' END;

  UPDATE public."usuario"
  SET "estado" = p_estado,
      "motivoEstado" = v_motivo,
      "aprobadoPor" = CASE WHEN p_estado = 'activa' THEN v_admin ELSE "aprobadoPor" END,
      "aprobadoEn" = CASE WHEN p_estado = 'activa' THEN now() ELSE "aprobadoEn" END
  WHERE "id" = p_usuario_id;

  IF p_estado IN ('suspendida', 'baja') AND v_auth IS NOT NULL THEN
    DELETE FROM auth.sessions WHERE user_id = v_auth;
  END IF;
  PERFORM privado.registrar_evento('ESTADO_CUENTA_CAMBIADO', 'usuario', p_usuario_id,
    jsonb_build_object('accion', v_accion, 'estadoAnterior', v_actual, 'estadoNuevo', p_estado), v_motivo);
END;
$$;

CREATE OR REPLACE FUNCTION public.cambiar_rol_cuenta(p_usuario_id text, p_rol public."Rol", p_motivo text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_admin text := privado.usuario_actual();
  v_anterior public."Rol";
  v_estado public."EstadoCuenta";
  v_motivo text := nullif(btrim(coalesce(p_motivo, '')), '');
BEGIN
  IF NOT privado.es_administrador() THEN
    RAISE EXCEPTION 'Solo un administrador puede cambiar el rol de una cuenta' USING ERRCODE = '42501';
  END IF;
  IF p_usuario_id = v_admin THEN
    RAISE EXCEPTION 'Un administrador no puede cambiar su propia cuenta' USING ERRCODE = '42501';
  END IF;
  IF v_motivo IS NULL OR length(v_motivo) < 3 THEN
    RAISE EXCEPTION 'El motivo es obligatorio (al menos 3 caracteres)' USING ERRCODE = '22023';
  END IF;
  SELECT u."rol", u."estado" INTO v_anterior, v_estado FROM public."usuario" u WHERE u."id" = p_usuario_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'La cuenta no existe' USING ERRCODE = 'P0002';
  END IF;
  IF v_estado = 'baja' THEN
    RAISE EXCEPTION 'Una cuenta dada de baja no se puede modificar' USING ERRCODE = '22023';
  END IF;
  IF p_rol = v_anterior THEN
    RAISE EXCEPTION 'La cuenta ya tiene ese rol' USING ERRCODE = '22023';
  END IF;
  UPDATE public."usuario" SET "rol" = p_rol, "motivoEstado" = v_motivo WHERE "id" = p_usuario_id;
  PERFORM privado.registrar_evento('ROL_CAMBIADO', 'usuario', p_usuario_id,
    jsonb_build_object('rolAnterior', v_anterior, 'rolNuevo', p_rol), v_motivo);
END;
$$;

-- La persona terminó de cambiar su contraseña (en el primer ingreso o desde su perfil).
CREATE OR REPLACE FUNCTION public.marcar_clave_cambiada()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_id text := privado.usuario_actual();
BEGIN
  IF NOT privado.es_activa() THEN
    RAISE EXCEPTION 'La cuenta no está activa' USING ERRCODE = '42501';
  END IF;
  UPDATE public."usuario" SET "debeCambiarClave" = false WHERE "id" = v_id AND "debeCambiarClave";
  PERFORM privado.registrar_evento('CLAVE_CAMBIADA', 'usuario', v_id);
END;
$$;

-- El administrador restableció la contraseña de otra cuenta (la Edge Function `restablecer-clave` la cambia
-- en Supabase Auth): la persona deberá elegir una nueva al ingresar.
CREATE OR REPLACE FUNCTION public.marcar_clave_temporal(p_usuario_id text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  IF NOT privado.es_administrador() THEN
    RAISE EXCEPTION 'Solo un administrador puede restablecer contraseñas' USING ERRCODE = '42501';
  END IF;
  IF p_usuario_id = privado.usuario_actual() THEN
    RAISE EXCEPTION 'Un administrador no puede restablecer su propia contraseña' USING ERRCODE = '42501';
  END IF;
  UPDATE public."usuario" SET "debeCambiarClave" = true WHERE "id" = p_usuario_id AND "estado" <> 'baja';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'La cuenta no existe o está dada de baja' USING ERRCODE = 'P0002';
  END IF;
  PERFORM privado.registrar_evento('CLAVE_RESTABLECIDA', 'usuario', p_usuario_id);
END;
$$;

REVOKE ALL ON FUNCTION public.alta_cuenta(uuid, text, text, public."Rol"),
  public.cambiar_estado_cuenta(text, public."EstadoCuenta", text),
  public.cambiar_rol_cuenta(text, public."Rol", text),
  public.marcar_clave_cambiada(),
  public.marcar_clave_temporal(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.alta_cuenta(uuid, text, text, public."Rol"),
  public.cambiar_estado_cuenta(text, public."EstadoCuenta", text),
  public.cambiar_rol_cuenta(text, public."Rol", text),
  public.marcar_clave_cambiada(),
  public.marcar_clave_temporal(text) TO authenticated;
