import { notImplemented } from '../not-implemented.ts';
import type { UnixEpochSeconds } from './time.ts';

/** JWS algorithm used by every bot-signed JWT (fully specified, RFC 9864). */
export const BOT_JWT_ALGORITHM = 'Ed25519';

/** Protected header of a bot-signed JWT. */
export interface BotJwtHeader {
  readonly alg: typeof BOT_JWT_ALGORITHM;
  readonly kid: string;
}

/** Claims every bot-signed JWT must carry. */
export interface BotJwtClaims {
  /** The bot ID as a decimal string. */
  readonly sub: string;
  /** A single audience string; `idp` for management tokens. */
  readonly aud: string;
  readonly iat: UnixEpochSeconds;
  readonly exp: UnixEpochSeconds;
  /** 1–128 printable ASCII characters. */
  readonly jti: string;
}

/** Timing rules applied to `iat` and `exp`. */
export interface BotJwtTimingPolicy {
  readonly clockSkewSeconds: number;
  readonly maxLifetimeSeconds: number;
}

/** Reasons a JWT can fail claim validation, matching the HTTP API error codes. */
export type BotJwtClaimsRejection =
  | 'malformed_token'
  | 'missing_claim'
  | 'token_expired'
  | 'token_not_yet_valid'
  | 'token_lifetime_too_long';

export type BotJwtClaimsValidation =
  | { readonly valid: true; readonly claims: BotJwtClaims }
  | { readonly valid: false; readonly rejection: BotJwtClaimsRejection };

/**
 * Validates untrusted, signature-unverified claims: presence and types of `sub`, `aud`, `iat`,
 * `exp`, `jti`; `exp > iat`; `iat <= now + skew`; `exp > now - skew`; `exp - iat <= maxLifetime`.
 */
export function validateBotJwtClaims(
  untrustedClaims: unknown,
  now: UnixEpochSeconds,
  timingPolicy: BotJwtTimingPolicy,
): BotJwtClaimsValidation {
  return notImplemented('validateBotJwtClaims', untrustedClaims, now, timingPolicy);
}
