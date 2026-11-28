#!/usr/bin/env node
/** `tg-idp` provisioning CLI entry point for Node.js, Deno, and Bun. */
import { runCli } from '../cli/run-cli.ts';
import { getProcessContext } from '../runtime/runtime-adapter.ts';

const processContext = getProcessContext();
const exitCode = await runCli({
  commandLineArguments: processContext.commandLineArguments,
  environment: processContext.environment,
  output: {
    writeCredential: (credential) => processContext.writeStdout(`${credential}\n`),
    writeNotice: (notice) => processContext.writeStderr(`${notice}\n`),
  },
});
processContext.exit(exitCode);
