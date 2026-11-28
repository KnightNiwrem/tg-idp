import { describe, test } from 'vitest';

describe('generateRegistrationCode', () => {
  test.todo('encodes at least 128 bits as unpadded base64url');
  test.todo('produces distinct codes on successive calls');
});

describe('effectiveRegistrationStatus', () => {
  test.todo('reports a pending registration as expired once now >= expiresAt');
  test.todo('reports confirmed and cancelled registrations unchanged after expiry');
});
