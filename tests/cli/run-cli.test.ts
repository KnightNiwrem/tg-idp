import { describe, test } from 'vitest';

describe('tg-idp CLI', () => {
  test.todo('login writes a botidp_mgmt_v1_ credential to stdout and notices to stderr');
  test.todo('logout treats unknown_key and management_key_expired as already logged out');
  test.todo('init logs in and out around the command when given BOT_TOKEN and --auth-bot');
  test.todo('init verifies the new key via /v1/auth/verify, using a diagnostic audience for "*"');
  test.todo('rotate rejects --replace-all and reminds the owner to revoke the old kid');
  test.todo('update re-registers the existing public key with new audiences');
  test.todo('revoke prints revoked kids for --kid and --all');
  test.todo('keys lists kids and audiences using --bot-id, BOT_TOKEN, or --mgmt-credential');
  test.todo('reports an expired or superseded management session on 401 management errors');
  test.todo('flags take precedence over their environment variables');
});
