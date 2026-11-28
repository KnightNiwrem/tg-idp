import { describe, test } from 'vitest';

describe('service credentials', () => {
  test.todo('round-trips through encodeServiceCredential and decodeServiceCredential');
  test.todo('rejects strings without the botidp_v1_ prefix, including management credentials');
  test.todo('rejects malformed base64url, JSON, or private JWK fields');
});

describe('management credentials', () => {
  test.todo('round-trips through encodeManagementCredential and decodeManagementCredential');
  test.todo('rejects strings without the botidp_mgmt_v1_ prefix');
  test.todo('rejects a missing or non-integer expiresAt');
});
