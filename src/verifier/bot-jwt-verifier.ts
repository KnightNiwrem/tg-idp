/**
 * Reference verifier for downstream services.
 *
 * This module is self-contained so services can import or copy it: its only runtime dependency is
 * `jose`, and it must not import other `tg-idp` modules.
 */

/** Claims of a verified service JWT. */
export interface VerifiedBotToken {
  /** Telegram bot ID parsed from `sub`. */
  readonly botId: number;
  readonly kid: string;
  readonly jti: string;
  readonly issuedAt: number;
  readonly expiresAt: number;
}

/**
 * Optional replay protection. Called after the signature and claims are verified; resolve `false`
 * to reject a `jti` already seen for this bot. Entries need retaining until `expiresAt` + skew.
 */
export type ReplayCheck = (token: VerifiedBotToken) => Promise<boolean>;

export interface BotJwtVerifierOptions {
  /** IdP base URL; JWKS is fetched from `<idpBaseUrl>/v1/bots/:botId/jwks`. */
  readonly idpBaseUrl: URL;
  /** Audience this service accepts; must not be `idp`. */
  readonly expectedService: string;
  /** Default 300. */
  readonly maxTokenLifetimeSeconds?: number;
  /** Default 30. */
  readonly clockSkewSeconds?: number;
  /** Per-bot JWKS cache lifetime, ignoring HTTP `max-age`. Default 600. */
  readonly jwksCacheTtlSeconds?: number;
  /** Minimum interval between unknown-`kid` refetches per bot. Default 30. */
  readonly unknownKidRefetchCooldownSeconds?: number;
  /** Maximum number of bots kept in the LRU JWKS cache. */
  readonly maxCachedBots?: number;
  readonly replayCheck?: ReplayCheck;
  /** Injectable for tests; defaults to global `fetch`. */
  readonly fetch?: typeof fetch;
}

/** Why a token was rejected; mirrors the IdP's `GET /v1/auth/verify` error codes. */
export type BotJwtRejectionReason =
  | 'malformed_token'
  | 'missing_claim'
  | 'unknown_key'
  | 'invalid_signature'
  | 'token_expired'
  | 'token_not_yet_valid'
  | 'token_lifetime_too_long'
  | 'invalid_audience'
  | 'token_replayed'
  | 'jwks_unavailable';

/** Thrown when a token fails verification. */
export class BotJwtVerificationError extends Error {
  readonly reason: BotJwtRejectionReason;

  constructor(reason: BotJwtRejectionReason) {
    super(`Bot JWT verification failed: ${reason}`);
    this.reason = reason;
    this.name = 'BotJwtVerificationError';
  }
}

export interface BotJwtVerifier {
  /** Verifies a compact JWS; rejects with {@link BotJwtVerificationError}. */
  verify(compactJwt: string): Promise<VerifiedBotToken>;
}

/**
 * Creates a verifier that fetches the signing bot's JWKS, keeps only keys whose `tg_idp_aud`
 * allows `expectedService`, and verifies with `jose.createLocalJWKSet` and `jose.jwtVerify`.
 * `jose.createRemoteJWKSet` is not used because it cannot filter keys by the custom `tg_idp_aud`
 * member.
 */
export function createBotJwtVerifier(options: BotJwtVerifierOptions): BotJwtVerifier {
  void options;
  throw new Error('Not implemented: createBotJwtVerifier');
}
