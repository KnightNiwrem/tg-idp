import type { BotId } from './bot-id.ts';
import type { Ed25519PublicKey, KeyId } from './public-key.ts';
import type { UnixEpochSeconds } from './time.ts';

/** A bot's single management key; it authorizes the admin HTTP endpoints and is never published. */
export interface ManagementKey {
  readonly botId: BotId;
  readonly kid: KeyId;
  readonly publicKey: Ed25519PublicKey;
  readonly createdAt: UnixEpochSeconds;
  /** Expired rows are retained so callers receive `management_key_expired`, not `unknown_key`. */
  readonly expiresAt: UnixEpochSeconds;
}

/** Long-lived key a bot uses to authenticate to downstream services; published in JWKS. */
export interface ServiceKey {
  readonly botId: BotId;
  readonly kid: KeyId;
  readonly publicKey: Ed25519PublicKey;
  readonly audiences: readonly string[];
  readonly createdAt: UnixEpochSeconds;
}
