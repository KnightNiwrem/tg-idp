import type { ManagementCredential } from '../domain/credentials.ts';
import { notImplemented } from '../not-implemented.ts';
import type { IdpClient } from './idp-client.ts';
import type { TelegramClient } from './telegram-client.ts';

/**
 * Obtains a management credential: resolves the bot ID, generates an ephemeral Ed25519 keypair,
 * creates a registration, sends `/confirm <code>` through Telegram, and polls the registration with
 * exponential backoff until it leaves `pending`.
 *
 * @throws When the registration ends `cancelled` or `expired`, or a Telegram call fails.
 */
export function loginWithTelegram(input: {
  readonly telegramClient: TelegramClient;
  readonly idpClient: IdpClient;
  readonly authBotUsername: string;
}): Promise<ManagementCredential> {
  return notImplemented('loginWithTelegram', input);
}
