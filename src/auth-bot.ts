import { Bot } from 'grammy';

/**
 * Creates the Telegram Auth Bot. It will accept `/confirm <code>` only from bots in private chats,
 * rate limit per bot, and never reply. No handlers are registered yet.
 */
export function createAuthBot(token: string): Bot {
  return new Bot(token);
}
