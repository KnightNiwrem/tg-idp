import { notImplemented } from '../not-implemented.ts';

/**
 * Thin adapter over runtime-specific APIs. All `Bun.*`, `Deno.*`, and Node-only built-in usage
 * belongs here, behind detection of the current runtime; the rest of the code uses web-standard
 * APIs only. Cloudflare Workers needs no adapter for serving because it consumes the fetch handler
 * directly (see `entrypoints/worker.ts`).
 */

/** Runtimes that can host the long-running server and the CLI. */
export type ProcessRuntime = 'node' | 'deno' | 'bun';

/** Detects the current process runtime. */
export function detectProcessRuntime(): ProcessRuntime {
  return notImplemented('detectProcessRuntime');
}

/** Web-standard request handler, such as `Hono#fetch`. */
export type FetchHandler = (request: Request) => Response | Promise<Response>;

/** Serves `handler` over HTTP with `Bun.serve`, `Deno.serve`, or Node's `http` module. */
export function serveFetchHandler(
  handler: FetchHandler,
  options: { readonly hostname: string; readonly port: number },
): Promise<void> {
  return notImplemented('serveFetchHandler', handler, options);
}

/** Process-level facilities the CLI and server entry points need. */
export interface ProcessContext {
  readonly commandLineArguments: readonly string[];
  readonly environment: Readonly<Record<string, string | undefined>>;
  writeStdout(text: string): void;
  writeStderr(text: string): void;
  exit(exitCode: number): never;
}

/** Returns the {@link ProcessContext} of the current runtime. */
export function getProcessContext(): ProcessContext {
  return notImplemented('getProcessContext');
}
