import { describe, expect, it } from 'vitest';
import { cargarConfig } from './config.js';

describe('cargarConfig', () => {
  it('usa Supabase cuando está configurado', () => {
    const c = cargarConfig({ SUPABASE_URL: 'https://x.supabase.co/' });
    expect(c.supabaseUrl).toBe('https://x.supabase.co');
    expect(c.authProvisoria).toBe(false);
  });

  it('no arranca sin SUPABASE_URL ni pedido expreso de autenticación provisoria', () => {
    expect(() => cargarConfig({})).toThrow(/SUPABASE_URL/);
    expect(() => cargarConfig({ SUPABASE_URL: '  ' })).toThrow(/SUPABASE_URL/);
  });

  it('permite la autenticación provisoria solo si se pide y no es producción', () => {
    expect(cargarConfig({ AUTH_PROVISORIA: 'true' }).authProvisoria).toBe(true);
    expect(() => cargarConfig({ AUTH_PROVISORIA: 'true', NODE_ENV: 'production' })).toThrow(/production/);
  });

  it('con Supabase ignora AUTH_PROVISORIA', () => {
    const c = cargarConfig({ SUPABASE_URL: 'https://x.supabase.co', AUTH_PROVISORIA: 'true', NODE_ENV: 'production' });
    expect(c.authProvisoria).toBe(false);
  });
});
