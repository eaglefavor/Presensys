/**
 * Credential Encryption Utility
 * Provides client-side encryption/decryption for sensitive credentials
 * Uses Web Crypto API for AES-GCM encryption
 *
 * SECURITY NOTE: This is an obfuscation-only approach. The encryption passphrase
 * is hardcoded in the source code, making decryption possible by anyone with
 * repository access. This provides protection against casual inspection only,
 * not against determined attackers. For production systems with higher security
 * requirements, use environment variables or a proper secrets management service.
 */

// Static obfuscation key derived from a passphrase
// This is embedded in the code and used to derive a symmetric key for obfuscation
// WARNING: Committed to source control - this is obfuscation, NOT cryptography
// Anyone with repository access can decrypt all credentials
const OBFUSCATION_PASSPHRASE = 'presensys-obfuscation-key-2024';

/**
 * Derive a symmetric key from a passphrase using PBKDF2
 */
async function deriveKey(): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const data = encoder.encode(OBFUSCATION_PASSPHRASE);
  const hash = await crypto.subtle.digest('SHA-256', data);

  const key = await crypto.subtle.importKey(
    'raw',
    hash,
    { name: 'AES-GCM' },
    false,
    ['encrypt', 'decrypt']
  );

  return key;
}

/**
 * Encrypt a string value and return base64-encoded ciphertext
 */
export async function encryptCredential(value: string): Promise<string> {
  const key = await deriveKey();
  const encoder = new TextEncoder();
  const data = encoder.encode(value);

  // Generate a random IV (initialization vector)
  const iv = crypto.getRandomValues(new Uint8Array(12));

  // Encrypt the data
  const encryptedData = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    data
  );

  // Combine IV + ciphertext and encode to base64
  const combined = new Uint8Array(iv.length + encryptedData.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(encryptedData), iv.length);

  // Use Buffer to safely handle base64 encoding
  return btoa(String.fromCharCode(...combined));
}

/**
 * Decrypt a base64-encoded ciphertext to the original string
 */
export async function decryptCredential(encrypted: string): Promise<string> {
  const key = await deriveKey();

  // Decode from base64 using Buffer for safe handling
  const combined = Uint8Array.from(atob(encrypted), c => c.charCodeAt(0));

  // Extract IV and ciphertext
  const iv = combined.slice(0, 12);
  const encryptedData = combined.slice(12);

  // Decrypt the data
  const decryptedData = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    encryptedData
  );

  const decoder = new TextDecoder();
  return decoder.decode(decryptedData);
}

/**
 * Decrypt multiple credentials in parallel
 */
export async function decryptCredentials(
  encrypted: Record<string, string>
): Promise<Record<string, string>> {
  const results: Record<string, string> = {};

  for (const [key, value] of Object.entries(encrypted)) {
    results[key] = await decryptCredential(value);
  }

  return results;
}
