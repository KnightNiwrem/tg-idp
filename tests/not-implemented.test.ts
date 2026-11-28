import { describe, expect, test } from 'vitest';
import { NotImplementedError, notImplemented } from '../src/not-implemented.ts';

describe('notImplemented', () => {
  test('throws NotImplementedError naming the capability', () => {
    expect(() => notImplemented('example capability')).toThrowError(
      new NotImplementedError('example capability'),
    );
  });

  test('never includes stub inputs, which may be secrets, in the error', () => {
    const secretBotToken = '123456:SECRET';
    try {
      notImplemented('createTelegramClient', secretBotToken);
      expect.unreachable();
    } catch (error) {
      expect(String(error)).not.toContain(secretBotToken);
      expect(JSON.stringify(error)).not.toContain(secretBotToken);
    }
  });
});
