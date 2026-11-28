import { type Context, Hono } from 'hono';

const notImplemented = (c: Context) => c.json({ error: 'not_implemented' }, 501);

/**
 * IdP HTTP API. The default export is a web-standard fetch handler, served directly by Bun,
 * `deno serve`, and Cloudflare Workers.
 */
const app = new Hono();

app.post('/v1/registrations', notImplemented);
app.get('/v1/registrations/:code', notImplemented);
app.post('/v1/bots/:botId/keys', notImplemented);
app.delete('/v1/bots/:botId/keys', notImplemented);
app.delete('/v1/bots/:botId/keys/:kid', notImplemented);
app.delete('/v1/bots/:botId/management-key', notImplemented);
app.get('/v1/bots/:botId/jwks', notImplemented);
app.get('/v1/auth/verify', notImplemented);
app.get('/health', notImplemented);

export default app;
