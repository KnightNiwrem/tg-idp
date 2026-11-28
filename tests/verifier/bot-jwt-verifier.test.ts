import { describe, test } from 'vitest';

describe('createBotJwtVerifier', () => {
  test.todo('verifies a valid service JWT for the expected service');
  test.todo('rejects a non-numeric sub before building the JWKS URL');
  test.todo('rejects tokens signed by keys whose tg_idp_aud does not allow the service');
  test.todo('rejects alg other than Ed25519, array aud, and missing jti');
  test.todo('enforces exp > iat, clock skew, and the lifetime cap');
  test.todo('caches JWKS per bot for the TTL regardless of HTTP max-age');
  test.todo('refetches on an unknown kid at most once per cooldown per bot');
  test.todo('evicts the least recently used bot beyond the cache bound');
  test.todo('rejects a replayed token when a replay check is configured');
});
