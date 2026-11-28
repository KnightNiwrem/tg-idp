import { describe, test } from 'vitest';

describe('validateBotJwtClaims', () => {
  test.todo('accepts claims within the timing policy');
  test.todo('rejects missing sub, aud, iat, exp, or jti with missing_claim');
  test.todo('rejects an array aud with malformed_token');
  test.todo('rejects exp <= iat');
  test.todo('rejects iat beyond now + clock skew with token_not_yet_valid');
  test.todo('rejects exp at or before now - clock skew with token_expired');
  test.todo('rejects exp - iat above the maximum lifetime with token_lifetime_too_long');
  test.todo('rejects jti that is empty, longer than 128 characters, or not printable ASCII');
});
