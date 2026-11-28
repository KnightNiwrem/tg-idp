import type { BotId } from '../domain/bot-id.ts';
import type { IdpErrorCode } from '../domain/error-codes.ts';
import type { Ed25519PublicKey, KeyId } from '../domain/public-key.ts';
import { notImplemented } from '../not-implemented.ts';
import type { UpsertServiceKeyOutcome } from '../storage/idp-repository.ts';
import type { IdpDependencies } from './idp-dependencies.ts';

/** Public JWK of a service key as served from `/v1/bots/:botId/jwks`. */
export interface ServiceKeyJwk {
  readonly kty: 'OKP';
  readonly crv: 'Ed25519';
  readonly alg: 'Ed25519';
  readonly use: 'sig';
  readonly kid: KeyId;
  readonly x: string;
  /** Private JWK extension member carrying the key's allowed audiences. */
  readonly tg_idp_aud: readonly string[];
}

export interface ServiceKeyJwks {
  readonly keys: readonly ServiceKeyJwk[];
}

/** Registers a service key or overwrites an existing key's audiences (preserving `createdAt`). */
export function registerServiceKey(
  dependencies: IdpDependencies,
  input: {
    readonly botId: BotId;
    readonly publicKey: Ed25519PublicKey;
    readonly audiences: readonly string[];
    readonly replaceAllExisting: boolean;
  },
): Promise<UpsertServiceKeyOutcome> {
  return notImplemented('registerServiceKey', dependencies, input);
}

/** Builds the JWK Set of a bot's active service keys; never includes the management key. */
export function getServiceKeyJwks(
  dependencies: IdpDependencies,
  botId: BotId,
): Promise<ServiceKeyJwks> {
  return notImplemented('getServiceKeyJwks', dependencies, botId);
}

export type ServiceTokenVerification =
  | {
      readonly verified: true;
      readonly botId: BotId;
      readonly kid: KeyId;
      readonly audiences: readonly string[];
    }
  | { readonly verified: false; readonly error: IdpErrorCode };

/**
 * Verifies a service JWT end to end against the bot's registered service keys, for the diagnostic
 * `GET /v1/auth/verify` endpoint. Management keys are treated as unknown.
 */
export function verifyServiceToken(
  dependencies: IdpDependencies,
  authorizationHeader: string | undefined,
): Promise<ServiceTokenVerification> {
  return notImplemented('verifyServiceToken', dependencies, authorizationHeader);
}
