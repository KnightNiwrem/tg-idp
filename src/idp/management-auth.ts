import type { BotId } from '../domain/bot-id.ts';
import type { IdpErrorCode } from '../domain/error-codes.ts';
import type { KeyId } from '../domain/public-key.ts';
import { notImplemented } from '../not-implemented.ts';
import type { IdpDependencies } from './idp-dependencies.ts';

export type ManagementAuthentication =
  | { readonly authenticated: true; readonly botId: BotId; readonly kid: KeyId }
  | {
      readonly authenticated: false;
      readonly status: 401 | 403;
      readonly error: IdpErrorCode;
    };

/**
 * Authenticates a management request's bearer JWT for `pathBotId`, in order: claims and timing
 * (`aud === "idp"`), management-key lookup by `sub` and `kid`, signature, management-key expiry
 * (zero skew), `sub === pathBotId`, then atomic `(botId, jti)` replay recording.
 */
export function authenticateManagementRequest(
  dependencies: IdpDependencies,
  input: { readonly authorizationHeader: string | undefined; readonly pathBotId: BotId },
): Promise<ManagementAuthentication> {
  return notImplemented('authenticateManagementRequest', dependencies, input);
}
