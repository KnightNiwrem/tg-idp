import { describe, expect, test } from 'vitest';
import { createIdpHttpApp } from '../../src/idp/http/http-app.ts';
import { createStubIdpDependencies } from '../support/stub-idp-dependencies.ts';

const OUTLINED_ROUTES = [
  ['POST', '/v1/registrations'],
  ['GET', '/v1/registrations/some-code'],
  ['POST', '/v1/bots/123/keys'],
  ['DELETE', '/v1/bots/123/keys'],
  ['DELETE', '/v1/bots/123/keys/a1b2c3d4e5f6g7h8'],
  ['DELETE', '/v1/bots/123/management-key'],
  ['GET', '/v1/bots/123/jwks'],
  ['GET', '/v1/auth/verify'],
  ['GET', '/health'],
] as const;

describe('createIdpHttpApp', () => {
  test.each(OUTLINED_ROUTES)(
    'routes %s %s to a not-yet-implemented handler',
    async (method, path) => {
      const app = createIdpHttpApp(createStubIdpDependencies());
      const response = await app.request(path, { method });
      expect(response.status).toBe(501);
      expect(await response.json()).toEqual({ error: 'not_implemented' });
    },
  );

  test('responds 404 to paths outside the API surface', async () => {
    const app = createIdpHttpApp(createStubIdpDependencies());
    const response = await app.request('/v1/unknown');
    expect(response.status).toBe(404);
  });
});

describe('POST /v1/registrations', () => {
  test.todo('returns 201 with code, kid, pending status, and expiresAt');
  test.todo('returns 400 invalid_bot_id for a non-positive or unsafe botId');
  test.todo('returns 400 invalid_public_key for an invalid or small-order key');
});

describe('GET /v1/registrations/:code', () => {
  test.todo('returns the registration status and managementKeyExpiresAt once confirmed');
  test.todo('reports expired for a pending registration past expiresAt');
  test.todo('returns 404 for an unknown code');
});

describe('management authentication', () => {
  test.todo('rejects a token whose aud is not "idp"');
  test.todo('rejects a lifetime above 60 seconds or timing outside the clock skew');
  test.todo('returns 401 unknown_key for a service key or superseded management key');
  test.todo('returns 401 invalid_signature for a bad signature');
  test.todo('returns 401 management_key_expired with zero clock skew');
  test.todo('returns 403 forbidden when sub differs from the path botId');
  test.todo('returns 401 token_replayed for a reused jti');
});

describe('POST /v1/bots/:botId/keys', () => {
  test.todo('returns 201 for a new key and 200 when updating audiences');
  test.todo('returns 400 invalid_audiences for empty lists, bad entries, or "idp"');
  test.todo('returns 409 key_limit_reached at the cap and 409 kid_collision for a different key');
  test.todo('replaces all keys when replaceAll is true');
});

describe('DELETE key endpoints', () => {
  test.todo('return revoked kids and are idempotent');
  test.todo('revoking all service keys leaves the management key active');
  test.todo('revoking the management key makes a retry return 401 unknown_key');
});

describe('GET /v1/bots/:botId/jwks', () => {
  test.todo('returns only service keys with tg_idp_aud, never the management key');
  test.todo('returns an empty key set rather than 404 for a bot without keys');
  test.todo('sets Cache-Control: public, max-age=60');
});

describe('GET /v1/auth/verify', () => {
  test.todo('returns botId, kid, and audiences for a valid service JWT');
  test.todo('returns 401 unknown_key for a token signed by a management key');
  test.todo('returns 401 invalid_audience for an audience the key does not allow');
});

describe('response headers', () => {
  test.todo('sets Cache-Control: no-store on every response except JWKS');
});

describe('GET /health', () => {
  test.todo('returns 200 { status: "ok" } when the database is reachable');
  test.todo('returns 503 when the database is unreachable');
});
