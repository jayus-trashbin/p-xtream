import { gcm } from '@noble/ciphers/aes';
import { randomBytes } from '@noble/ciphers/webcrypto';
import { bytesToHex, hexToBytes } from '@noble/ciphers/utils';

/**
 * Derives a 32-byte AES key from CRYPTO_SECRET.
 * Uses the first 64 hex chars (= 32 bytes) of the secret.
 */
function getKey(): Uint8Array {
  const secret = process.env.CRYPTO_SECRET;
  if (!secret || secret.length < 64) {
    throw new Error('[P-Stream] CRYPTO_SECRET must be at least 64 hex chars (32 bytes) for token encryption');
  }
  return hexToBytes(secret.slice(0, 64));
}

/**
 * Encrypts a plaintext string using AES-256-GCM.
 * Returns a compact string: `hex(nonce):hex(ciphertext+tag)`
 */
export function encryptToken(plaintext: string): string {
  const key = getKey();
  const nonce = randomBytes(12); // 96-bit nonce for GCM
  const cipher = gcm(key, nonce);
  const encoded = new TextEncoder().encode(plaintext);
  const ciphertext = cipher.encrypt(encoded);
  return `${bytesToHex(nonce)}:${bytesToHex(ciphertext)}`;
}

/**
 * Decrypts a token previously encrypted by `encryptToken`.
 * Throws if the format is invalid or decryption fails.
 */
export function decryptToken(stored: string): string {
  const parts = stored.split(':');
  if (parts.length !== 2) throw new Error('Invalid encrypted token format');

  const [nonceHex, ciphertextHex] = parts as [string, string];
  const key = getKey();
  const nonce = hexToBytes(nonceHex);
  const ciphertext = hexToBytes(ciphertextHex);
  const cipher = gcm(key, nonce);
  const decoded = cipher.decrypt(ciphertext);
  return new TextDecoder().decode(decoded);
}
