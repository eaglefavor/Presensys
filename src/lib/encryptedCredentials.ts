/**
 * Encrypted Credentials Storage
 * Stores encrypted sensitive credentials as hardcoded values
 * These are decrypted on-demand using the credentialEncryption module
 *
 * SECURITY WARNING: The encrypted values and the obfuscation key are both
 * committed to the source code. This provides obfuscation only - anyone with
 * repository access can decrypt all credentials. These are PLACEHOLDER values.
 * For production systems, consider using environment variables or a secrets
 * management service.
 */

import { decryptCredential } from './credentialEncryption';

// PLACEHOLDER encrypted credentials (replace with your own encrypted values)
// To generate encrypted credentials, use the generator script or encryptCredential() function
// IMPORTANT: Replace these with your actual encrypted credentials before deployment
// These sample values decrypt to "placeholder_api_key" and "https://placeholder.url"
const ENCRYPTED_GEMINI_KEY = 'OX3WvQLUgcQ7SWLm32hrnijOFHn4+0zAD8iLv7yMF3mrKRArGhxdFdSSDlg6HISc5i2yKTTOrys=';
const ENCRYPTED_MCP_URL = 'gXVVv8463ZVyKBr6nmVTzUFMrH2T0Zw1eB3HpN2fBAxrcd9PkFdGXq8qfh11cq2wiuhDbejsmSVLrg5ah/7mxEICspd6qovybQQNY0FE+xusDGto8fcMWJA=';

// Cache for decrypted credentials
let cachedGeminiKey: string | null = null;
let cachedMcpUrl: string | null = null;

/**
 * Get the decrypted Gemini API Key
 * Caches the result after first decryption
 */
export async function getGeminiApiKey(): Promise<string> {
  if (cachedGeminiKey) {
    return cachedGeminiKey;
  }

  // Check for placeholder values
  if (ENCRYPTED_GEMINI_KEY.startsWith('PLACEHOLDER_')) {
    const error = new Error(
      'Encrypted Gemini API key is not configured. Please replace PLACEHOLDER_ENCRYPTED_KEY_VALUE ' +
      'in src/lib/encryptedCredentials.ts with your actual encrypted API key. ' +
      'Use the generator script to encrypt your credentials.'
    );
    console.error(error.message);
    throw error;
  }

  try {
    cachedGeminiKey = await decryptCredential(ENCRYPTED_GEMINI_KEY);
    return cachedGeminiKey;
  } catch (error) {
    console.error('Failed to decrypt Gemini API key:', error);
    return '';
  }
}

/**
 * Get the decrypted MCP URL
 * Caches the result after first decryption
 */
export async function getMcpUrl(): Promise<string> {
  if (cachedMcpUrl) {
    return cachedMcpUrl;
  }

  // Check for placeholder values
  if (ENCRYPTED_MCP_URL.startsWith('PLACEHOLDER_')) {
    const error = new Error(
      'Encrypted MCP URL is not configured. Please replace PLACEHOLDER_ENCRYPTED_URL_VALUE ' +
      'in src/lib/encryptedCredentials.ts with your actual encrypted MCP URL. ' +
      'Use the generator script to encrypt your credentials.'
    );
    console.error(error.message);
    throw error;
  }

  try {
    cachedMcpUrl = await decryptCredential(ENCRYPTED_MCP_URL);
    return cachedMcpUrl;
  } catch (error) {
    console.error('Failed to decrypt MCP URL:', error);
    return '';
  }
}

/**
 * Clear credential cache (useful for testing or switching credentials)
 */
export function clearCredentialCache(): void {
  cachedGeminiKey = null;
  cachedMcpUrl = null;
}

// Export for reference only
export { ENCRYPTED_GEMINI_KEY, ENCRYPTED_MCP_URL };
