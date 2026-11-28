/**
 * Reference verifier for downstream services. Self-contained so it can be copied: its only
 * runtime dependency is `jose`.
 */

export interface VerifierOptions {
  idpBaseUrl: URL;
  /** Audience this service accepts; never `idp`. */
  expectedService: string;
}

export interface VerifiedBotToken {
  botId: number;
  kid: string;
  jti: string;
}

/** Verifies a service JWT against the bot's JWKS, filtered by `tg_idp_aud`. */
export function verifyBotToken(
  _token: string,
  _options: VerifierOptions,
): Promise<VerifiedBotToken> {
  return Promise.reject(new Error('verifyBotToken is not implemented yet'));
}
