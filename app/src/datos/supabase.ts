import { createClient } from '@supabase/supabase-js';
import { AppState } from 'react-native';
import { almacenSeguro } from '../sesion/almacen-seguro';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const clave = process.env.EXPO_PUBLIC_SUPABASE_KEY;
if (!url || !clave) {
  throw new Error('Faltan EXPO_PUBLIC_SUPABASE_URL y EXPO_PUBLIC_SUPABASE_KEY en app/.env');
}

const LIMITE_PEDIDO_MS = 60000;

/** Sin límite, un pedido sin señal puede quedar colgado sin fallar nunca; así termina como un error de red y se reintenta. */
const fetchConLimite: typeof fetch = (entrada, opciones) => {
  const control = new AbortController();
  opciones?.signal?.addEventListener('abort', () => control.abort());
  const corte = setTimeout(() => control.abort(), LIMITE_PEDIDO_MS);
  return fetch(entrada, { ...opciones, signal: control.signal }).finally(() => clearTimeout(corte));
};

// La clave publicable es pública por diseño; el acceso real lo controlan las políticas RLS de la base.
export const supabase = createClient(url, clave, {
  auth: { storage: almacenSeguro, autoRefreshToken: true, persistSession: true, detectSessionInUrl: false },
  global: { fetch: fetchConLimite },
});

// Renovar el token solo con la app en primer plano.
AppState.addEventListener('change', (estado) => {
  if (estado === 'active') supabase.auth.startAutoRefresh();
  else supabase.auth.stopAutoRefresh();
});
