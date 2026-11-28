import { describe, test } from 'vitest';

describe('Auth Bot', () => {
  test.todo('confirms a registration from a private message sent by the registering bot');
  test.todo('ignores messages from users, groups, and edited_message updates');
  test.todo('never sends a reply');
  test.todo('drops messages beyond the per-bot rate limit');
  test.todo('ignores a redelivered /confirm for an already consumed code');
});

describe('Auth Bot webhook handler', () => {
  test.todo('rejects a missing or mismatched secret token before dispatch');
  test.todo('returns 2xx for handled, ignored, and rate-limited updates');
});
