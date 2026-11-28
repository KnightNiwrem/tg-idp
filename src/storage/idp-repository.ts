import type { BotId } from '../domain/bot-id.ts';
import type { ManagementKey, ServiceKey } from '../domain/keys.ts';
import type { KeyId } from '../domain/public-key.ts';
import type { Registration, RegistrationCode } from '../domain/registration.ts';
import type { UnixEpochSeconds } from '../domain/time.ts';

/** Outcome of confirming a registration through the Auth Bot. */
export type ConfirmRegistrationOutcome =
  | { readonly kind: 'confirmed'; readonly managementKeyExpiresAt: UnixEpochSeconds }
  /** The code is unknown, expired, or no longer pending. */
  | { readonly kind: 'not_pending' }
  /** The sender is not the registration's bot; the registration stays pending. */
  | { readonly kind: 'bot_mismatch' };

/** Outcome of registering or re-registering a service key. */
export type UpsertServiceKeyOutcome =
  | { readonly kind: 'created'; readonly serviceKey: ServiceKey }
  | { readonly kind: 'updated'; readonly serviceKey: ServiceKey }
  | { readonly kind: 'key_limit_reached' }
  | { readonly kind: 'kid_collision' };

/**
 * Persistence for registrations, management keys, service keys, and used management-token IDs.
 *
 * Every multi-step state transition executes atomically in a single write transaction that takes
 * its write lock before its first read (`BEGIN IMMEDIATE`) and performs no external I/O.
 */
export interface IdpRepository {
  insertPendingRegistration(registration: Registration): Promise<void>;
  findRegistration(code: RegistrationCode): Promise<Registration | undefined>;

  /**
   * Confirms a pending registration for `senderBotId`: cancels the bot's other pending
   * registrations, replaces its management key, and marks the registration confirmed.
   */
  confirmRegistration(input: {
    readonly code: RegistrationCode;
    readonly senderBotId: BotId;
    readonly now: UnixEpochSeconds;
    readonly managementKeyExpiresAt: UnixEpochSeconds;
  }): Promise<ConfirmRegistrationOutcome>;

  findManagementKey(botId: BotId): Promise<ManagementKey | undefined>;
  /** @returns Whether a management key existed and was deleted. */
  deleteManagementKey(botId: BotId): Promise<boolean>;

  /**
   * Records a management token `(botId, jti)` until `retainUntil`.
   *
   * @returns `false` when the pair was already recorded (a replay).
   */
  recordManagementTokenUse(input: {
    readonly botId: BotId;
    readonly jti: string;
    readonly retainUntil: UnixEpochSeconds;
  }): Promise<boolean>;

  listServiceKeys(botId: BotId): Promise<readonly ServiceKey[]>;
  findServiceKey(botId: BotId, kid: KeyId): Promise<ServiceKey | undefined>;

  /**
   * Inserts or updates a service key, enforcing `serviceKeyCap` for new `kid`s. With
   * `replaceAllExisting`, first removes all of the bot's service keys in the same transaction.
   */
  upsertServiceKey(input: {
    readonly serviceKey: ServiceKey;
    readonly serviceKeyCap: number;
    readonly replaceAllExisting: boolean;
  }): Promise<UpsertServiceKeyOutcome>;

  /** @returns The revoked `kid`s; empty when nothing matched. */
  deleteServiceKey(botId: BotId, kid: KeyId): Promise<readonly KeyId[]>;
  /** @returns The revoked `kid`s; empty when the bot had no service keys. */
  deleteAllServiceKeys(botId: BotId): Promise<readonly KeyId[]>;

  /**
   * Purges resolved registrations older than their retention and used-token records past
   * `retainUntil`. Called opportunistically on writes rather than from background timers.
   */
  purgeExpiredRecords(
    now: UnixEpochSeconds,
    finishedRegistrationRetentionSeconds: number,
  ): Promise<void>;

  /** Whether the database is reachable, for `GET /health`. */
  isHealthy(): Promise<boolean>;
}
