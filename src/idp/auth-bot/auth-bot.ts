import type { Bot } from 'grammy';
import type { AuthBotUpdateMode } from '../../config/idp-config.ts';
import { notImplemented } from '../../not-implemented.ts';
import type { IdpDependencies } from '../idp-dependencies.ts';

/**
 * Creates the Telegram Auth Bot.
 *
 * It handles only `message` updates in private chats from bots (`from.is_bot === true`), applies
 * the per-bot rate limit, processes `/confirm <code>`, and never sends a reply, which prevents
 * bot-to-bot reply loops.
 */
export function createAuthBot(dependencies: IdpDependencies, authBotToken: string): Bot {
  return notImplemented('createAuthBot', dependencies, authBotToken);
}

/**
 * Builds the fetch handler that receives Telegram webhook updates. It rejects requests whose
 * `X-Telegram-Bot-Api-Secret-Token` does not match (constant-time comparison) before dispatch and
 * returns `2xx` for every authenticated update, whether handled, ignored, or rate limited.
 */
export function createAuthBotWebhookHandler(
  authBot: Bot,
  updateMode: Extract<AuthBotUpdateMode, { kind: 'webhook' }>,
): (request: Request) => Promise<Response> {
  return notImplemented('createAuthBotWebhookHandler', authBot, updateMode);
}
