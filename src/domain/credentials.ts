import { notImplemented } from '../not-implemented.ts';
import type { BotId } from './bot-id.ts';
import type { KeyId } from './public-key.ts';
import type { UnixEpochSeconds } from './time.ts';

/** Prefix of an encoded {@link ServiceCredential}. */
export const SERVICE_CREDENTIAL_PREFIX = 'botidp_v1_';

/** Prefix of an encoded {@link ManagementCredential}. */
export const MANAGEMENT_CREDENTIAL_PREFIX = 'botidp_mgmt_v1_';

/** Ed25519 private key in JWK form. */
export interface Ed25519PrivateJwk {
  readonly kty: 'OKP';
  readonly crv: 'Ed25519';
  /** Base64url public key. */
  readonly x: string;
  /** Base64url private key. */
  readonly d: string;
}

/** Long-lived credential a bot deploys to sign JWTs for downstream services. */
export interface ServiceCredential {
  readonly v: 1;
  readonly botId: BotId;
  readonly kid: KeyId;
  readonly privKey: Ed25519PrivateJwk;
}

/**
 * Short-lived credential for the IdP management endpoints.
 *
 * Deliberately not a subtype of {@link ServiceCredential}: the types carry the same signing fields,
 * but a management credential must never be usable where a service credential is expected.
 */
export interface ManagementCredential {
  readonly v: 1;
  readonly botId: BotId;
  readonly kid: KeyId;
  readonly privKey: Ed25519PrivateJwk;
  readonly expiresAt: UnixEpochSeconds;
}

/** Encodes a service credential as `botidp_v1_<base64url(JSON)>`. */
export function encodeServiceCredential(credential: ServiceCredential): string {
  return notImplemented('encodeServiceCredential', credential);
}

/** Decodes and validates an untrusted `botidp_v1_` credential string. */
export function decodeServiceCredential(encodedCredential: string): ServiceCredential | undefined {
  return notImplemented('decodeServiceCredential', encodedCredential);
}

/** Encodes a management credential as `botidp_mgmt_v1_<base64url(JSON)>`. */
export function encodeManagementCredential(credential: ManagementCredential): string {
  return notImplemented('encodeManagementCredential', credential);
}

/** Decodes and validates an untrusted `botidp_mgmt_v1_` credential string. */
export function decodeManagementCredential(
  encodedCredential: string,
): ManagementCredential | undefined {
  return notImplemented('decodeManagementCredential', encodedCredential);
}
