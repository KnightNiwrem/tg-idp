import type { BotId } from '../domain/bot-id.ts';
import type { ManagementCredential } from '../domain/credentials.ts';
import type { KeyId } from '../domain/public-key.ts';
import type { RegistrationCode } from '../domain/registration.ts';
import type { CreatedRegistration, RegistrationStatusView } from '../idp/registrations.ts';
import type { ServiceKeyJwks } from '../idp/service-keys.ts';
import { notImplemented } from '../not-implemented.ts';

/** Service key as returned by `POST /v1/bots/:botId/keys`. */
export interface RegisteredServiceKey {
  readonly botId: BotId;
  readonly kid: KeyId;
  readonly audiences: readonly string[];
  readonly createdAt: number;
}

/** HTTP client for the IdP API. Management calls sign a fresh short-lived JWT per request. */
export interface IdpClient {
  createRegistration(botId: BotId, encodedPublicKey: string): Promise<CreatedRegistration>;
  getRegistration(code: RegistrationCode): Promise<RegistrationStatusView>;
  registerServiceKey(
    credential: ManagementCredential,
    input: {
      readonly encodedPublicKey: string;
      readonly audiences: readonly string[];
      readonly replaceAll: boolean;
    },
  ): Promise<RegisteredServiceKey>;
  revokeServiceKey(credential: ManagementCredential, kid: KeyId): Promise<readonly KeyId[]>;
  revokeAllServiceKeys(credential: ManagementCredential): Promise<readonly KeyId[]>;
  revokeManagementKey(credential: ManagementCredential): Promise<void>;
  getServiceKeyJwks(botId: BotId): Promise<ServiceKeyJwks>;
  /** Calls `GET /v1/auth/verify` with a service JWT. */
  verifyServiceToken(serviceJwt: string): Promise<RegisteredServiceKey>;
}

/** Creates an {@link IdpClient} using `fetch` against `idpBaseUrl`. */
export function createIdpClient(idpBaseUrl: URL): IdpClient {
  return notImplemented('createIdpClient', idpBaseUrl);
}
