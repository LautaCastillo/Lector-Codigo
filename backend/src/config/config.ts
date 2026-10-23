import { parsearSimbologias, type Simbologia } from '@patrimonio/shared';

export interface Config {
  port: number;
  /** URL del proyecto Supabase. Es el modo normal: la API exige Authorization: Bearer con un token válido. */
  supabaseUrl?: string;
  /** Modo de desarrollo y pruebas: identidad por cabecera x-relevador. Nunca en producción. */
  authProvisoria: boolean;
  simbologiasHabilitadas: Simbologia[];
}

/**
 * La autenticación falla cerrada: sin SUPABASE_URL el backend no arranca, salvo que se pida
 * expresamente AUTH_PROVISORIA=true (y no estemos en producción). Así, un olvido de configuración
 * no deja la API abierta a cualquiera que escriba un nombre en una cabecera.
 */
export function cargarConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const supabaseUrl = env.SUPABASE_URL?.trim().replace(/\/+$/, '') || undefined;
  const authProvisoria = !supabaseUrl && env.AUTH_PROVISORIA === 'true';
  if (!supabaseUrl && !authProvisoria) {
    throw new Error(
      'Falta SUPABASE_URL: sin ella la API quedaría sin autenticación. ' +
        'Solo para desarrollo o pruebas se puede usar AUTH_PROVISORIA=true.',
    );
  }
  if (authProvisoria && env.NODE_ENV === 'production') {
    throw new Error('AUTH_PROVISORIA=true no está permitido con NODE_ENV=production.');
  }
  return {
    port: Number(env.PORT ?? 3000),
    supabaseUrl,
    authProvisoria,
    simbologiasHabilitadas: parsearSimbologias(env.SIMBOLOGIAS_HABILITADAS),
  };
}
