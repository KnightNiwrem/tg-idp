import type { Client } from '@libsql/client';
import { notImplemented } from '../../not-implemented.ts';
import type { IdpRepository } from '../idp-repository.ts';

/**
 * Creates or upgrades the IdP schema (registrations, management keys, service keys, used
 * management tokens). Bot IDs are stored as 64-bit integers.
 */
export function migrateIdpSchema(client: Client): Promise<void> {
  return notImplemented('migrateIdpSchema', client);
}

/**
 * {@link IdpRepository} backed by libSQL. Accepts a client from `@libsql/client` (local files and
 * remote Turso) or `@libsql/client/web` (Cloudflare Workers and other edge runtimes); the caller
 * chooses the import that matches its runtime.
 */
export function createLibsqlIdpRepository(client: Client): IdpRepository {
  return notImplemented('createLibsqlIdpRepository', client);
}
