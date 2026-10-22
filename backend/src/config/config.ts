import { parsearSimbologias, type Simbologia } from '@patrimonio/shared';

export interface Config {
  port: number;
  apiKey?: string;
  /** URL del proyecto Supabase. Si se define, la API exige Authorization: Bearer; si no, rige x-relevador. */
  supabaseUrl?: string;
  simbologiasHabilitadas: Simbologia[];
}

export function cargarConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return {
    port: Number(env.PORT ?? 3000),
    apiKey: env.API_KEY?.trim() || undefined,
    supabaseUrl: env.SUPABASE_URL?.trim().replace(/\/+$/, '') || undefined,
    simbologiasHabilitadas: parsearSimbologias(env.SIMBOLOGIAS_HABILITADAS),
  };
}
