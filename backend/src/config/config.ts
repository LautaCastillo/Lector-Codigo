import { parsearSimbologias, type Simbologia } from '@patrimonio/shared';

export interface Config {
  port: number;
  apiKey?: string;
  simbologiasHabilitadas: Simbologia[];
}

export function cargarConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return {
    port: Number(env.PORT ?? 3000),
    apiKey: env.API_KEY?.trim() || undefined,
    simbologiasHabilitadas: parsearSimbologias(env.SIMBOLOGIAS_HABILITADAS),
  };
}
