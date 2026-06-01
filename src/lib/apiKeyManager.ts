/**
 * API Key Manager
 * Handles rotation of encrypted Gemini API keys with fallback support
 * Similar to the image OCR reconciliation system
 */

import { getGeminiApiKey } from './encryptedCredentials';

// 10 encrypted API keys (base64 reversed)
const ENCRYPTED_API_KEYS = [
  'wATVGlTRKFVeYdnWlRXe1V2dlNFbvJmMpF3dqlWeBh2Q5NVY6lUQ',
  '3R3VChXV1RGeKBjNVpldxRFSPFFOZ1kUTlEMPV1bSlHR5NVY6lUQ',
  'VlkWtEHa2dVdz8meM5kQGdWUVpkayRVb6dXZJ9GRGNkQ5NVY6lUQ',
  'nBzYq91S19kRD90UuhmMnJFe5EFUaxUUt1kS5MESWJGR5NVY6lUQ',
  '3FmWSl1QNVFO6RFVLNVY0NXOrJVNwITUGBDRyVjd4RFR5NVY6lUQ',
  'nRXZV9kc2ZEO1okN4ImQTdzYw4WWkhjTjlnbXpWRwczQ5NVY6lUQ',
  'NNTRRd0bIlHehpkNPpXWwhlbBdEePd3UwVzbZlVNUF2Q5NVY6lUQ',
  'NxGahJVMxUGdQVGTZ9kW2lDcxdTYPVFbzlTQEdFTtJ0Q5NVY6lUQ',
  'zZ1M5YGNkxkeNRlcVFlQlNjRZZnN2UTLutWahBjMRBFR5NVY6lUQ',
  'ZZFV4MXaZd3SxFXdzZnSadmeKN0S3ZnaUN2YzM2TXxkQ5NVY6lUQ'
];

// Decode an encrypted key
function decodeKey(encrypted: string): string {
  return atob(encrypted.split('').reverse().join(''));
}

// Get all available API keys from encrypted storage or fallback to encrypted keys
export async function getApiKeys(): Promise<string[]> {
  let apiKeys: string[] = [];

  // First, try to get key from encrypted credentials storage
  try {
    const encryptedKey = await getGeminiApiKey();
    if (encryptedKey) {
      apiKeys = encryptedKey
        .split(',')
        .map((k: string) => k.trim())
        .filter((k: string) => k.length > 0);
    }
  } catch (error) {
    console.warn('Failed to decrypt Gemini API key, using hardcoded fallback keys:', error);
  }

  // If no encrypted key, fall back to hardcoded encrypted keys
  if (apiKeys.length === 0) {
    apiKeys = ENCRYPTED_API_KEYS.map(decodeKey);
  }

  // Shuffle to distribute load
  return apiKeys.sort(() => Math.random() - 0.5);
}

// Get a single key (for legacy compatibility)
export async function getApiKey(): Promise<string> {
  const keys = await getApiKeys();
  return keys.length > 0 ? keys[0] : '';
}

// Get all available fallback models based on network conditions
export function getFallbackModels(imageCount: number = 1): string[] {
  const connection = (navigator as unknown as { connection?: { effectiveType: string } }).connection;
  const effectiveType = connection?.effectiveType ?? '4g';
  const isVerySlowNetwork = effectiveType === 'slow-2g' || effectiveType === '2g';
  const isSlowNetwork = effectiveType === '3g';

  let primaryModel: string;
  let fallbacks: string[] = [];

  if (isVerySlowNetwork) {
    primaryModel = imageCount >= 2 ? 'gemini-2.5-flash-lite' : 'gemini-3.1-flash-lite-exp';
    fallbacks = ['gemini-2.5-flash-lite', 'gemini-2.0-flash', 'gemini-2.5-flash'];
  } else if (isSlowNetwork) {
    if (imageCount >= 3) {
      primaryModel = 'gemini-2.5-flash';
    } else if (imageCount === 2) {
      primaryModel = 'gemini-2.5-flash-lite';
    } else {
      primaryModel = 'gemini-2.0-flash';
    }
    fallbacks = ['gemini-2.5-flash-lite', 'gemini-2.5-flash', 'gemini-2.0-flash'];
  } else {
    // Fast network: maximize accuracy, escalate with task complexity
    if (imageCount >= 5) {
      primaryModel = 'gemini-3.0-pro-exp';
    } else if (imageCount >= 3) {
      primaryModel = 'gemini-2.5-pro';
    } else if (imageCount === 2) {
      primaryModel = 'gemini-3.0-flash-exp';
    } else {
      primaryModel = 'gemini-2.5-flash';
    }
    fallbacks = ['gemini-2.5-pro', 'gemini-3.0-flash-exp', 'gemini-2.5-flash', 'gemini-2.0-flash'];
  }

  // Build unique queue starting with primary model
  const modelQueue: string[] = [primaryModel];
  for (const m of fallbacks) {
    if (!modelQueue.includes(m)) {
      modelQueue.push(m);
    }
  }

  return modelQueue;
}

// Export encrypted keys for reference (not for direct use)
export { ENCRYPTED_API_KEYS };
