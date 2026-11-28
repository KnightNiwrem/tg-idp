import { describe, test } from 'vitest';

describe('libSQL IdpRepository', () => {
  describe('confirmRegistration', () => {
    test.todo('confirms a pending registration and installs the management key');
    test.todo('cancels the bot’s other pending registrations');
    test.todo('replaces an existing management key');
    test.todo('leaves the registration pending when the sender bot differs');
    test.todo('ignores unknown, expired, and already resolved codes');
  });

  describe('upsertServiceKey', () => {
    test.todo('creates a new key below the cap');
    test.todo('returns key_limit_reached for a new kid at the cap without evicting keys');
    test.todo('updates audiences of an existing kid and preserves createdAt');
    test.todo('returns kid_collision for an existing kid with a different public key');
    test.todo('replaces all keys atomically when replaceAllExisting is set');
  });

  describe('recordManagementTokenUse', () => {
    test.todo('returns false for a replayed (botId, jti)');
    test.todo('scopes jti uniqueness per bot');
  });

  test.todo('deleteServiceKey and deleteAllServiceKeys return revoked kids, empty when none');
  test.todo('purgeExpiredRecords removes only records past retention');
});
