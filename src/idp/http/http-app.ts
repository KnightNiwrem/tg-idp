import { type Context, Hono } from 'hono';
import type { IdpDependencies } from '../idp-dependencies.ts';

/** Body returned by routes that exist in the API surface but are not implemented yet. */
const NOT_IMPLEMENTED_BODY = { error: 'not_implemented' } as const;

function respondNotImplemented(context: Context): Response {
  return context.json(NOT_IMPLEMENTED_BODY, 501);
}

/**
 * Builds the IdP HTTP API as a web-standard fetch handler (`app.fetch`), usable unchanged on every
 * supported runtime.
 *
 * Every response except JWKS carries `Cache-Control: no-store`; errors are `{ "error": "<code>" }`.
 * The API never accepts, logs, or stores Telegram bot tokens.
 */
export function createIdpHttpApp(dependencies: IdpDependencies): Hono {
  void dependencies;
  const app = new Hono();

  /** Unauthenticated: create a pending management-key registration. */
  app.post('/v1/registrations', respondNotImplemented);
  /** Unauthenticated: poll a registration's status. */
  app.get('/v1/registrations/:code', respondNotImplemented);

  /** Management auth: register a service key or update its audiences. */
  app.post('/v1/bots/:botId/keys', respondNotImplemented);
  /** Management auth: revoke all service keys. */
  app.delete('/v1/bots/:botId/keys', respondNotImplemented);
  /** Management auth: revoke one service key. */
  app.delete('/v1/bots/:botId/keys/:kid', respondNotImplemented);
  /** Management auth: revoke the active management key. */
  app.delete('/v1/bots/:botId/management-key', respondNotImplemented);

  /** Public: JWK Set of the bot's service keys (`Cache-Control: public, max-age=…`). */
  app.get('/v1/bots/:botId/jwks', respondNotImplemented);
  /** Diagnostic: verify a service JWT against the bot's registered service keys. */
  app.get('/v1/auth/verify', respondNotImplemented);
  /** Liveness and database reachability. */
  app.get('/health', respondNotImplemented);

  return app;
}
