import type { RegistrationCode } from '../../domain/registration.ts';
import { notImplemented } from '../../not-implemented.ts';

/**
 * Extracts the registration code from `/confirm <code>` or `/confirm@<authBotUsername> <code>`.
 *
 * @param authBotUsername The Auth Bot's username without `@`, compared case-insensitively.
 * @returns The code, or `undefined` for any other text.
 */
export function parseConfirmCommand(
  messageText: string,
  authBotUsername: string,
): RegistrationCode | undefined {
  return notImplemented('parseConfirmCommand', messageText, authBotUsername);
}
