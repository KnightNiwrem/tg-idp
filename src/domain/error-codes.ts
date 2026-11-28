/** Error codes returned by the HTTP API in `{ "error": "<code>" }` bodies. */
export const IDP_ERROR_CODES = [
  'invalid_bot_id',
  'invalid_public_key',
  'invalid_audiences',
  'not_found',
  'malformed_token',
  'missing_claim',
  'unknown_key',
  'invalid_signature',
  'token_expired',
  'token_not_yet_valid',
  'token_lifetime_too_long',
  'invalid_audience',
  'management_key_expired',
  'token_replayed',
  'forbidden',
  'key_limit_reached',
  'kid_collision',
] as const;

export type IdpErrorCode = (typeof IDP_ERROR_CODES)[number];

/** JSON body of every HTTP API error response. */
export interface IdpErrorBody {
  readonly error: IdpErrorCode;
}
