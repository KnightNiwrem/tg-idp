import { describe, test } from 'vitest';

describe('parseConfirmCommand', () => {
  test.todo('extracts the code from "/confirm <code>"');
  test.todo('accepts "/confirm@<authBotUsername> <code>" case-insensitively');
  test.todo('rejects commands addressed to a different bot username');
  test.todo('rejects other commands, missing codes, and extra arguments');
});
