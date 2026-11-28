import { describe, expect, test } from 'vitest';
import app from '../src/app.ts';

describe('HTTP API', () => {
  test('responds 501 on outlined routes until implemented', async () => {
    const response = await app.request('/health');
    expect(response.status).toBe(501);
  });

  test('responds 404 to unknown paths', async () => {
    const response = await app.request('/v1/unknown');
    expect(response.status).toBe(404);
  });

  test.todo('creates and confirms a registration');
  test.todo('authenticates management requests with management-key JWTs');
  test.todo('serves service keys as JWKS');
});
