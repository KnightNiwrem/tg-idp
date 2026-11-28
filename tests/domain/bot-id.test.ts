import { describe, test } from 'vitest';

describe('parseBotId', () => {
  test.todo('accepts positive safe integers');
  test.todo('rejects zero, negatives, fractions, NaN, and values above MAX_SAFE_INTEGER');
  test.todo('rejects non-number values such as numeric strings');
});

describe('parseBotIdFromDecimalString', () => {
  test.todo('accepts canonical positive decimal strings');
  test.todo('rejects signs, leading zeros, whitespace, exponents, and path characters');
  test.todo('rejects values above MAX_SAFE_INTEGER');
});
