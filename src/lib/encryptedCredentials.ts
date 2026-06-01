/**
 * Encrypted Credentials Storage
 * Stores encrypted sensitive credentials as hardcoded values
 * These are decrypted on-demand using the credentialEncryption module
 */

import { decryptCredential } from './credentialEncryption';

// Encrypted credentials (replace with your own encrypted values)
// To generate encrypted credentials, use the generator script or encryptCredential() function
const ENCRYPTED_GEMINI_KEY = 'JCf3ovOBtJ2+ai0Qh1afgkiZ5U3LUL8BiuYlqKIDngvCXTUCENpnKdsqhxBnX/M7Fvxjaw==';
const ENCRYPTED_MCP_URL = '8E5L5pe6W+KHxvEJkZNUE0hB2bdrd7eA/BSH/Tm7MKvrSaFBEAHBp/IHZuuqLM+m5lZGbgZhOzvASfggUg/XPQu71IlnEvOcVrJEGAjkcPY/n1C8Z+iPA68=';

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
  
  try {
    cachedGeminiKey = await decryptCredential(ENCRYPTED_GEMINI_KEY);
    return cachedGeminiKey;
  } catch (error) {
    console.error('Failed to decrypt Gemini API key:', error);
    throw new Error('Failed to decrypt Gemini API key');
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
  
  try {
    cachedMcpUrl = await decryptCredential(ENCRYPTED_MCP_URL);
    return cachedMcpUrl;
  } catch (error) {
    console.error('Failed to decrypt MCP URL:', error);
    throw new Error('Failed to decrypt MCP URL');
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
