// Edge Function `admin-cuentas`: operaciones de administración de cuentas que necesitan la clave secreta de
// Supabase (crear el usuario en Auth y restablecer su contraseña). La autorización se decide acá y otra vez en
// la base (las funciones `alta_cuenta` y `marcar_clave_temporal` verifican que quien llama sea administrador).
//
// POST { accion: 'crear', usuario, nombre, rol }  -> { id, cuenta, claveTemporal }
// POST { accion: 'restablecer', usuarioId }       -> { claveTemporal }
//
// Se despliega con verify_jwt desactivado porque valida el token por su cuenta con Supabase Auth.
// Nunca se escribe la contraseña en los registros.
import { createClient } from 'npm:@supabase/supabase-js@2';

const DOMINIO_INTERNO = 'patrimonio.local';
const ROLES = ['administrador', 'relevador'];
// Sin caracteres que se confunden al leer o dictar (I, O, l, 0, 1).
const ALFABETO = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';

/** Contraseña temporal aleatoria, sin sesgo (descarta los bytes que no reparten parejo entre los caracteres). */
function claveTemporal(largo = 12): string {
  const limite = 256 - (256 % ALFABETO.length);
  let salida = '';
  while (salida.length < largo) {
    for (const byte of crypto.getRandomValues(new Uint8Array(largo * 2))) {
      if (byte < limite && salida.length < largo) salida += ALFABETO[byte % ALFABETO.length];
    }
  }
  return salida;
}

function responder(estado: number, cuerpo: unknown): Response {
  return new Response(JSON.stringify(cuerpo), {
    status: estado,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}

/** Nombre de usuario (sin arroba) o correo completo -> correo de la cuenta. */
function aCorreo(entrada: string): string | null {
  const limpio = entrada.trim().toLowerCase();
  if (limpio.includes('@')) return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(limpio) && limpio.length <= 120 ? limpio : null;
  return /^[a-z0-9._-]{3,30}$/.test(limpio) ? `${limpio}@${DOMINIO_INTERNO}` : null;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return responder(405, { error: 'Método no permitido' });

  const url = Deno.env.get('SUPABASE_URL');
  const claveAnonima = Deno.env.get('SUPABASE_ANON_KEY');
  const claveSecreta = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !claveAnonima || !claveSecreta) return responder(500, { error: 'La función no está configurada' });

  const autorizacion = req.headers.get('authorization') ?? '';
  const token = autorizacion.startsWith('Bearer ') ? autorizacion.slice(7).trim() : '';
  if (!token) return responder(401, { error: 'Falta iniciar sesión' });

  const opciones = { auth: { persistSession: false, autoRefreshToken: false } };
  const admin = createClient(url, claveSecreta, opciones);
  const comoUsuario = createClient(url, claveAnonima, { ...opciones, global: { headers: { Authorization: `Bearer ${token}` } } });

  const { data: sesion, error: errorSesion } = await admin.auth.getUser(token);
  if (errorSesion || !sesion.user) return responder(401, { error: 'La sesión no es válida' });
  const yo = sesion.user;

  const { data: cuentaPropia } = await admin.from('usuario').select('rol, estado').eq('authId', yo.id).maybeSingle();
  if (!cuentaPropia || cuentaPropia.rol !== 'administrador' || cuentaPropia.estado !== 'activa') {
    return responder(403, { error: 'Solo un administrador activo puede hacer esto' });
  }

  let cuerpo: Record<string, unknown>;
  try {
    cuerpo = await req.json();
  } catch {
    return responder(400, { error: 'El cuerpo debe ser JSON' });
  }

  if (cuerpo.accion === 'crear') {
    const correo = aCorreo(String(cuerpo.usuario ?? ''));
    const nombre = String(cuerpo.nombre ?? '').trim();
    const rol = String(cuerpo.rol ?? '');
    if (!correo) return responder(400, { error: 'El usuario debe tener entre 3 y 30 letras, números, puntos o guiones, o ser un correo válido' });
    if (nombre.length < 3 || nombre.length > 100) return responder(400, { error: 'El nombre debe tener entre 3 y 100 caracteres' });
    if (!ROLES.includes(rol)) return responder(400, { error: 'El rol no es válido' });

    const clave = claveTemporal();
    const { data: creado, error: errorAlta } = await admin.auth.admin.createUser({
      email: correo,
      password: clave,
      email_confirm: true,
      user_metadata: { nombre },
    });
    if (errorAlta || !creado.user) {
      const repetido = /already|registered|exists/i.test(errorAlta?.message ?? '');
      return responder(repetido ? 409 : 500, { error: repetido ? 'Ya existe una cuenta con ese usuario' : 'No se pudo crear la cuenta' });
    }

    const { data: id, error: errorFila } = await comoUsuario.rpc('alta_cuenta', {
      p_auth_id: creado.user.id,
      p_cuenta: correo,
      p_nombre: nombre,
      p_rol: rol,
    });
    if (errorFila) {
      // Sin la fila en `usuario` la cuenta no serviría: se deshace el alta en Auth.
      await admin.auth.admin.deleteUser(creado.user.id);
      const repetido = errorFila.code === '23505';
      return responder(repetido ? 409 : 500, { error: repetido ? 'Ya existe una cuenta con ese usuario' : 'No se pudo crear la cuenta' });
    }
    return responder(200, { id, cuenta: correo, claveTemporal: clave });
  }

  if (cuerpo.accion === 'restablecer') {
    const usuarioId = String(cuerpo.usuarioId ?? '');
    if (!usuarioId) return responder(400, { error: 'Falta la cuenta' });
    const { data: objetivo } = await admin.from('usuario').select('authId, estado').eq('id', usuarioId).maybeSingle();
    if (!objetivo || !objetivo.authId || objetivo.estado === 'baja') return responder(404, { error: 'La cuenta no existe o está dada de baja' });
    if (objetivo.authId === yo.id) return responder(403, { error: 'No podés restablecer tu propia contraseña desde acá' });

    // Primero la base: valida el rol, marca la cuenta y deja el evento de auditoría.
    const { error: errorMarca } = await comoUsuario.rpc('marcar_clave_temporal', { p_usuario_id: usuarioId });
    if (errorMarca) return responder(errorMarca.code === '42501' ? 403 : 500, { error: 'No se pudo restablecer la contraseña' });

    const clave = claveTemporal();
    const { error: errorClave } = await admin.auth.admin.updateUserById(objetivo.authId, { password: clave });
    if (errorClave) return responder(500, { error: 'No se pudo restablecer la contraseña' });
    return responder(200, { claveTemporal: clave });
  }

  return responder(400, { error: 'La acción no es válida' });
});
