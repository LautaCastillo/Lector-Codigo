import { Test } from '@nestjs/testing';
import request from 'supertest';
import { describe, it } from 'vitest';
import { HealthController } from '../src/health/health.controller.js';

describe('Health (e2e)', () => {
  it('GET /health responde ok', async () => {
    const mod = await Test.createTestingModule({ controllers: [HealthController] }).compile();
    const app = mod.createNestApplication();
    await app.init();
    await request(app.getHttpServer()).get('/health').expect(200).expect({ estado: 'ok' });
    await app.close();
  });
});
