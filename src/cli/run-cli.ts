import { notImplemented } from '../not-implemented.ts';
import type { CliOutput } from './cli-output.ts';

/** Subcommands of the `tg-idp` provisioning CLI. */
export const CLI_COMMAND_NAMES = [
  'login',
  'logout',
  'init',
  'rotate',
  'update',
  'revoke',
  'keys',
] as const;

export type CliCommandName = (typeof CLI_COMMAND_NAMES)[number];

/**
 * Environment variables mirrored by flags: `BOT_TOKEN` (`--bot-token`), `TG_IDP_URL`
 * (`--idp-url`), `TG_IDP_AUTH_BOT` (`--auth-bot`), `TG_IDP_MGMT_CREDENTIAL` (`--mgmt-credential`).
 */
export const CLI_ENVIRONMENT_VARIABLES = {
  botToken: 'BOT_TOKEN',
  idpUrl: 'TG_IDP_URL',
  authBot: 'TG_IDP_AUTH_BOT',
  managementCredential: 'TG_IDP_MGMT_CREDENTIAL',
} as const;

/**
 * Parses arguments and runs one CLI command.
 *
 * @param commandLineArguments Arguments after the executable and script, e.g. `['init', '--aud', 'session']`.
 * @returns The process exit code.
 */
export function runCli(input: {
  readonly commandLineArguments: readonly string[];
  readonly environment: Readonly<Record<string, string | undefined>>;
  readonly output: CliOutput;
}): Promise<number> {
  return notImplemented('runCli', input);
}
