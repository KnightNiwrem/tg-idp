import { describe, test } from 'vitest';

describe('classifyTelegramSendFailure', () => {
  test.todo('maps USER_BOT_TO_BOT_DISABLED to bot_to_bot_disabled');
  test.todo('maps "chat not found" to auth_bot_not_found');
  test.todo('maps the 403 self-send error to self_send');
  test.todo('falls back to unrecognized for other errors');
});

describe('TelegramClient', () => {
  test.todo('sends /confirm to @username without parse_mode');
  test.todo('never sends the bot token anywhere except the Telegram Bot API');
});
