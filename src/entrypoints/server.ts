/**
 * Long-running IdP server for Node.js, Deno, and Bun: loads configuration, opens the libSQL
 * database, and serves the HTTP API plus the Auth Bot (webhook or long polling).
 */
import { loadIdpConfig } from '../config/idp-config.ts';
import { notImplemented } from '../not-implemented.ts';
import { getProcessContext } from '../runtime/runtime-adapter.ts';

const idpConfig = loadIdpConfig(getProcessContext().environment);
notImplemented('server startup', idpConfig);
