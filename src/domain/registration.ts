import { notImplemented } from '../not-implemented.ts';
import type { BotId } from './bot-id.ts';
import type { Ed25519PublicKey, KeyId } from './public-key.ts';
import type { UnixEpochSeconds } from './time.ts';

/** Lifecycle state of a management-key registration. */
export type RegistrationStatus = 'pending' | 'confirmed' | 'cancelled' | 'expired';

/** Single-use code (≥128 bits from a CSPRNG, base64url) that a bot confirms via Telegram. */
export type RegistrationCode = string & { readonly __brand: 'RegistrationCode' };

/** Pending or resolved request to install a management key for a bot. */
export interface Registration {
  readonly code: RegistrationCode;
  readonly botId: BotId;
  readonly kid: KeyId;
  readonly publicKey: Ed25519PublicKey;
  readonly status: RegistrationStatus;
  readonly createdAt: UnixEpochSeconds;
  readonly expiresAt: UnixEpochSeconds;
  /** Set once the registration is confirmed. */
  readonly managementKeyExpiresAt?: UnixEpochSeconds;
}

/** Generates a new registration code with at least 128 bits of CSPRNG entropy. */
export function generateRegistrationCode(): RegistrationCode {
  return notImplemented('generateRegistrationCode');
}

/**
 * Status reported to callers: a stored `pending` registration is reported as `expired` once
 * `now >= expiresAt`.
 */
export function effectiveRegistrationStatus(
  registration: Registration,
  now: UnixEpochSeconds,
): RegistrationStatus {
  return notImplemented('effectiveRegistrationStatus', registration, now);
}
