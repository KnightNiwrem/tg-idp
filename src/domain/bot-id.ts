import { notImplemented } from '../not-implemented.ts';

/**
 * Telegram bot user ID that has been validated as a positive safe integer.
 *
 * Telegram IDs use at most 52 significant bits, so they fit a JavaScript number exactly.
 */
export type BotId = number & { readonly __brand: 'BotId' };

/**
 * Validates an untrusted JSON number as a {@link BotId}.
 *
 * @returns The validated bot ID, or `undefined` when the value is not a positive safe integer.
 */
export function parseBotId(untrustedValue: unknown): BotId | undefined {
  return notImplemented('parseBotId', untrustedValue);
}

/**
 * Validates an untrusted decimal string (a JWT `sub` or URL path segment) as a {@link BotId}.
 *
 * Rejects signs, leading zeros, whitespace, and any non-digit characters before the value is used
 * to build URLs or queries.
 *
 * @returns The validated bot ID, or `undefined` when the string is not a canonical positive integer.
 */
export function parseBotIdFromDecimalString(untrustedDecimal: string): BotId | undefined {
  return notImplemented('parseBotIdFromDecimalString', untrustedDecimal);
}
