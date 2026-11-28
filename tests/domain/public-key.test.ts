import { describe, test } from 'vitest';

describe('decodeEd25519PublicKey', () => {
  test.todo('decodes an unpadded base64url 32-byte key');
  test.todo('rejects padded or standard-alphabet base64');
  test.todo('rejects keys that are not exactly 32 bytes');
  test.todo('rejects small-order points');
});

describe('deriveKeyId', () => {
  test.todo('returns the first 16 characters of base64url(SHA-256(raw key))');
  test.todo('is deterministic for the same key');
});
