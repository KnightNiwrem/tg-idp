import { notImplemented } from '../not-implemented.ts';

/** Limits and durations governing keys, registrations, and JWT validation on the IdP. */
export interface IdpLimits {
  /** Active service keys per bot. The management-key cap is fixed at one and not configurable. */
  readonly serviceKeyCap: number;
  readonly managementKeyTtlSeconds: number;
  readonly pendingRegistrationTtlSeconds: number;
  readonly finishedRegistrationRetentionSeconds: number;
  readonly serviceJwtMaxLifetimeSeconds: number;
  readonly managementJwtMaxLifetimeSeconds: number;
  readonly jwtClockSkewSeconds: number;
  readonly authBotMessagesPerMinutePerBot: number;
  readonly jwksCacheMaxAgeSeconds: number;
}

/** Defaults from the outline's "Defaults and Limits" table. */
export const DEFAULT_IDP_LIMITS: IdpLimits = Object.freeze({
  serviceKeyCap: 10,
  managementKeyTtlSeconds: 30 * 60,
  pendingRegistrationTtlSeconds: 5 * 60,
  finishedRegistrationRetentionSeconds: 24 * 60 * 60,
  serviceJwtMaxLifetimeSeconds: 300,
  managementJwtMaxLifetimeSeconds: 60,
  jwtClockSkewSeconds: 30,
  authBotMessagesPerMinutePerBot: 10,
  jwksCacheMaxAgeSeconds: 60,
});

/** How the Auth Bot receives Telegram updates. */
export type AuthBotUpdateMode =
  | { readonly kind: 'webhook'; readonly webhookSecretToken: string }
  | { readonly kind: 'long-polling' };

/** Complete runtime configuration of the IdP service. */
export interface IdpConfig {
  readonly limits: IdpLimits;
  readonly database: { readonly url: string; readonly authToken?: string };
  readonly authBot: { readonly token: string; readonly updateMode: AuthBotUpdateMode };
}

/**
 * Builds and validates {@link IdpConfig} from untrusted environment variables, applying
 * {@link DEFAULT_IDP_LIMITS} for unset limits.
 *
 * @throws When a required variable is missing or a value is malformed.
 */
export function loadIdpConfig(
  environment: Readonly<Record<string, string | undefined>>,
): IdpConfig {
  return notImplemented('loadIdpConfig', environment);
}
