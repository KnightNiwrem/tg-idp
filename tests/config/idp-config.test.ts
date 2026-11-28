import { describe, expect, test } from 'vitest';
import { DEFAULT_IDP_LIMITS } from '../../src/config/idp-config.ts';

describe('DEFAULT_IDP_LIMITS', () => {
  test('matches the outlined defaults', () => {
    expect(DEFAULT_IDP_LIMITS).toEqual({
      serviceKeyCap: 10,
      managementKeyTtlSeconds: 1800,
      pendingRegistrationTtlSeconds: 300,
      finishedRegistrationRetentionSeconds: 86_400,
      serviceJwtMaxLifetimeSeconds: 300,
      managementJwtMaxLifetimeSeconds: 60,
      jwtClockSkewSeconds: 30,
      authBotMessagesPerMinutePerBot: 10,
      jwksCacheMaxAgeSeconds: 60,
    });
  });

  test('is frozen', () => {
    expect(Object.isFrozen(DEFAULT_IDP_LIMITS)).toBe(true);
  });
});

describe('loadIdpConfig', () => {
  test.todo('applies default limits when limit variables are unset');
  test.todo('rejects a missing database URL or Auth Bot token');
  test.todo('rejects non-integer or non-positive limit values');
  test.todo('selects webhook mode only when a webhook secret token is configured');
});
