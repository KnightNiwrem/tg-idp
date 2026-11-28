import type { BotId } from '../domain/bot-id.ts';
import type { Ed25519PublicKey, KeyId } from '../domain/public-key.ts';
import type { RegistrationCode, RegistrationStatus } from '../domain/registration.ts';
import type { UnixEpochSeconds } from '../domain/time.ts';
import { notImplemented } from '../not-implemented.ts';
import type { ConfirmRegistrationOutcome } from '../storage/idp-repository.ts';
import type { IdpDependencies } from './idp-dependencies.ts';

/** Response of `POST /v1/registrations`. */
export interface CreatedRegistration {
  readonly code: RegistrationCode;
  readonly kid: KeyId;
  readonly status: 'pending';
  readonly expiresAt: UnixEpochSeconds;
}

/** Response of `GET /v1/registrations/:code`. */
export interface RegistrationStatusView {
  readonly status: RegistrationStatus;
  readonly botId: BotId;
  readonly kid: KeyId;
  readonly expiresAt: UnixEpochSeconds;
  readonly managementKeyExpiresAt?: UnixEpochSeconds;
}

/**
 * Creates a pending management-key registration. There is deliberately no per-bot pending cap,
 * since capping this unauthenticated endpoint would let anyone block a bot from registering.
 */
export function createPendingRegistration(
  dependencies: IdpDependencies,
  input: { readonly botId: BotId; readonly publicKey: Ed25519PublicKey },
): Promise<CreatedRegistration> {
  return notImplemented('createPendingRegistration', dependencies, input);
}

/** Looks up a registration, reporting `expired` for a pending one past its expiry. */
export function getRegistrationStatus(
  dependencies: IdpDependencies,
  code: RegistrationCode,
): Promise<RegistrationStatusView | undefined> {
  return notImplemented('getRegistrationStatus', dependencies, code);
}

/** Applies a `/confirm <code>` sent by `senderBotId` through the Auth Bot. */
export function confirmRegistrationFromBot(
  dependencies: IdpDependencies,
  input: { readonly code: RegistrationCode; readonly senderBotId: BotId },
): Promise<ConfirmRegistrationOutcome> {
  return notImplemented('confirmRegistrationFromBot', dependencies, input);
}
