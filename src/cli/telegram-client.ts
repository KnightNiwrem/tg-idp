import type { BotId } from '../domain/bot-id.ts';
import type { RegistrationCode } from '../domain/registration.ts';
import { notImplemented } from '../not-implemented.ts';

/**
 * Minimal Bot API client the CLI runs on the owner's machine. The bot token is sent only to
 * Telegram, never to the IdP.
 */
export interface TelegramClient {
  /** Resolves the calling bot's ID with `getMe`. */
  getOwnBotId(): Promise<BotId>;
  /**
   * Sends `/confirm <code>` (without `parse_mode`) to the Auth Bot, addressed by `@username`
   * because numeric IDs fail until a username has been resolved.
   */
  sendConfirmCommand(authBotUsername: string, code: RegistrationCode): Promise<void>;
}

/** Known Bot API failure causes mapped to actionable messages; the raw description is kept. */
export type TelegramSendFailureCause =
  | 'bot_to_bot_disabled'
  | 'auth_bot_not_found'
  | 'self_send'
  | 'unrecognized';

/** Error raised for a failed Bot API call. */
export class TelegramRequestError extends Error {
  readonly failureCause: TelegramSendFailureCause;
  /** Telegram's raw error description, preserved for diagnosis. */
  readonly telegramDescription: string;

  constructor(failureCause: TelegramSendFailureCause, telegramDescription: string) {
    super(`Telegram request failed (${failureCause}): ${telegramDescription}`);
    this.failureCause = failureCause;
    this.telegramDescription = telegramDescription;
    this.name = 'TelegramRequestError';
  }
}

/** Classifies a Bot API error description, e.g. `USER_BOT_TO_BOT_DISABLED` or `chat not found`. */
export function classifyTelegramSendFailure(
  errorCode: number,
  description: string,
): TelegramSendFailureCause {
  return notImplemented('classifyTelegramSendFailure', errorCode, description);
}

/** Creates a {@link TelegramClient} using `fetch` against the Bot API. */
export function createTelegramClient(botToken: string): TelegramClient {
  return notImplemented('createTelegramClient', botToken);
}
