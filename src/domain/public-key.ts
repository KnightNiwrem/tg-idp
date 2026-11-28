import { notImplemented } from '../not-implemented.ts';

/** Raw 32-byte Ed25519 public key that has been checked to not be a small-order point. */
export type Ed25519PublicKey = Uint8Array & { readonly __brand: 'Ed25519PublicKey' };

/**
 * Deterministic key ID: the first {@link KEY_ID_LENGTH_CHARS} characters of
 * `base64url(SHA-256(rawPublicKeyBytes))`.
 *
 * The CLI and the IdP derive the same value independently.
 */
export type KeyId = string & { readonly __brand: 'KeyId' };

/** Number of base64url characters of the SHA-256 digest kept in a {@link KeyId}. */
export const KEY_ID_LENGTH_CHARS = 16;

/** Length in bytes of a raw Ed25519 public key. */
export const ED25519_PUBLIC_KEY_LENGTH_BYTES = 32;

/**
 * Decodes an unpadded base64url public key and validates it as a non-small-order 32-byte Ed25519
 * point.
 *
 * @returns The decoded key, or `undefined` when the input is not a valid public key.
 */
export function decodeEd25519PublicKey(encodedPublicKey: string): Ed25519PublicKey | undefined {
  return notImplemented('decodeEd25519PublicKey', encodedPublicKey);
}

/** Encodes a raw public key as unpadded base64url. */
export function encodeEd25519PublicKey(publicKey: Ed25519PublicKey): string {
  return notImplemented('encodeEd25519PublicKey', publicKey);
}

/** Derives the deterministic {@link KeyId} of a public key using Web Crypto SHA-256. */
export function deriveKeyId(publicKey: Ed25519PublicKey): Promise<KeyId> {
  return notImplemented('deriveKeyId', publicKey);
}
