import { notImplemented } from '../not-implemented.ts';

/** Audience reserved for management JWTs addressed to the IdP itself. */
export const MANAGEMENT_AUDIENCE = 'idp';

/** Service-key audience entry that matches every downstream service audience except `idp`. */
export const WILDCARD_AUDIENCE = '*';

/** Pattern every service-key audience entry must match. */
export const SERVICE_AUDIENCE_PATTERN = /^([A-Za-z0-9._-]+|\*)$/;

/**
 * Validates an untrusted service-key audience list: a non-empty array of strings matching
 * {@link SERVICE_AUDIENCE_PATTERN}, excluding {@link MANAGEMENT_AUDIENCE}.
 *
 * @returns The validated audiences, or `undefined` when the list is invalid (`invalid_audiences`).
 */
export function parseServiceAudiences(untrustedAudiences: unknown): readonly string[] | undefined {
  return notImplemented('parseServiceAudiences', untrustedAudiences);
}

/**
 * Whether a service key with `allowedAudiences` may authenticate to `requestedAudience`: the
 * requested audience is not `idp` and the list contains it or `*`.
 */
export function isServiceAudienceAllowed(
  allowedAudiences: readonly string[],
  requestedAudience: string,
): boolean {
  return notImplemented('isServiceAudienceAllowed', allowedAudiences, requestedAudience);
}
