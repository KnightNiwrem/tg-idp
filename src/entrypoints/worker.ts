/**
 * Cloudflare Workers entry point: serves the HTTP API and the Auth Bot webhook from one fetch
 * handler, using `@libsql/client/web` for storage.
 */
import { notImplemented } from '../not-implemented.ts';

export default {
  fetch(request: Request, environment: unknown): Promise<Response> {
    return notImplemented('worker fetch handler', request, environment);
  },
};
