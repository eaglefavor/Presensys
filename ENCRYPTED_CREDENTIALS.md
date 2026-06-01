# Encrypted Credentials System

## Overview

The Presensys application now uses encrypted hardcoded credentials instead of environment variables. This approach hides sensitive values (API keys and URLs) in the source code using AES-GCM encryption.

## Security Model

### How It Works

1. **Encryption**: Sensitive credentials are encrypted using AES-GCM (Authenticated Encryption with Associated Data)
2. **Key Derivation**: The encryption key is derived from a static passphrase using SHA-256
3. **Storage**: Encrypted credentials are stored as base64-encoded strings in `src/lib/encryptedCredentials.ts`
4. **Decryption**: Credentials are decrypted on-demand in memory when needed
5. **Caching**: Decrypted values are cached to avoid repeated decryption

### Encryption Method

```
Original Value (string)
    ↓
[Text Encoder]
    ↓
AES-GCM Encryption (with random IV)
    ↓
[IV + Ciphertext] Combined
    ↓
[Base64 Encoding]
    ↓
Encrypted Storage
```

## Supported Credentials

### 1. Gemini API Key (`VITE_GEMINI_API_KEY`)
- **Location**: `src/lib/encryptedCredentials.ts` → `ENCRYPTED_GEMINI_KEY`
- **Usage**: Decrypted via `getGeminiApiKey()`
- **Fallback**: If decryption fails, system falls back to 10 hardcoded encrypted API keys

### 2. MCP URL (`VITE_MCP_URL`)
- **Location**: `src/lib/encryptedCredentials.ts` → `ENCRYPTED_MCP_URL`
- **Usage**: Decrypted via `getMcpUrl()`
- **Format**: Supabase MCP endpoint URL

## Setup & Configuration

### Step 1: Generate Encrypted Credentials

Use the provided generator script to encrypt your credentials:

```bash
# Using Node.js (recommended)
node /tmp/generate_encrypted_creds.mjs "your_gemini_api_key" "https://mcp.url"
```

This will output:
```
Encrypted Gemini API Key:
[base64_encrypted_key]

Encrypted MCP URL:
[base64_encrypted_url]

Add these to src/lib/encryptedCredentials.ts:
const ENCRYPTED_GEMINI_KEY = '[encrypted_key]';
const ENCRYPTED_MCP_URL = '[encrypted_url]';
```

### Step 2: Update Credentials File

Replace the encrypted values in `src/lib/encryptedCredentials.ts`:

```typescript
const ENCRYPTED_GEMINI_KEY = 'your_encrypted_key_here';
const ENCRYPTED_MCP_URL = 'your_encrypted_url_here';
```

### Step 3: Verify Installation

The application will automatically:
1. Decrypt credentials on first use
2. Cache decrypted values in memory
3. Use fallback encrypted keys if decryption fails

## API Reference

### `credentialEncryption.ts`

#### `encryptCredential(value: string): Promise<string>`
Encrypts a string value and returns base64-encoded ciphertext.

```typescript
const encrypted = await encryptCredential('my-api-key');
```

#### `decryptCredential(encrypted: string): Promise<string>`
Decrypts a base64-encoded ciphertext to the original string.

```typescript
const decrypted = await decryptCredential(encrypted);
```

#### `decryptCredentials(encrypted: Record<string, string>): Promise<Record<string, string>>`
Decrypts multiple credentials in parallel.

```typescript
const creds = await decryptCredentials({
  key: encryptedKey,
  url: encryptedUrl
});
```

### `encryptedCredentials.ts`

#### `getGeminiApiKey(): Promise<string>`
Returns the decrypted Gemini API key (cached after first call).

```typescript
const apiKey = await getGeminiApiKey();
```

#### `getMcpUrl(): Promise<string>`
Returns the decrypted MCP URL (cached after first call).

```typescript
const mcpUrl = await getMcpUrl();
```

#### `clearCredentialCache(): void`
Clears the credential cache (useful for testing).

```typescript
clearCredentialCache();
```

## Usage in Code

### Using Encrypted Gemini API Key

```typescript
import { getGeminiApiKey } from './lib/encryptedCredentials';

async function getApiKeys(): Promise<string[]> {
  const encryptedKey = await getGeminiApiKey();
  // Use the key...
}
```

### Using Encrypted MCP URL

```typescript
import { getMcpUrl } from './lib/encryptedCredentials';

async function initializeMcpClient(): Promise<Client> {
  const mcpUrl = await getMcpUrl();
  const transport = new SSEClientTransport(new URL(mcpUrl));
  // Use the URL...
}
```

## Migration from Environment Variables

### Before (Environment Variables)
```typescript
const mcpUrl = import.meta.env.VITE_MCP_URL;
const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
```

### After (Encrypted Credentials)
```typescript
const mcpUrl = await getMcpUrl();
const apiKey = await getGeminiApiKey();
```

## Key Points

✅ **Pros**:
- No environment variables needed in development or deployment
- Credentials are hidden in the source code (obfuscated, not plaintext)
- Encryption/decryption uses standard Web Crypto API (browser native)
- Caching minimizes decryption overhead
- Automatic fallback to hardcoded encrypted keys if needed

⚠️ **Limitations**:
- AES-GCM encryption key is derived from a static passphrase (not cryptographically random)
- This is **obfuscation**, not cryptography - determined attackers with source code access can decrypt
- Client-side encryption means the passphrase and encryption logic are visible in source
- Intended for hiding credentials from casual inspection, not for protecting against sophisticated attacks

## Security Considerations

1. **Source Code**: Keep the repository private
2. **Build Output**: Even in production builds, determined attackers could extract the passphrase
3. **Browser DevTools**: Decrypted values are in memory - don't expose in console logs
4. **Token Management**: Rotate Gemini API keys regularly

## Troubleshooting

### "Failed to decrypt Gemini API key"
- Verify encrypted value is valid base64
- Check the encryption passphrase matches
- Ensure the data hasn't been corrupted

### "Failed to decrypt MCP URL"
- Verify the MCP URL was correctly encrypted
- Check for special characters that might need escaping

### Falling Back to Hardcoded Keys
If `getGeminiApiKey()` fails, the system automatically uses 10 fallback encrypted keys stored in `apiKeyManager.ts`.

## Environment Variables (Legacy)

For backward compatibility, the system still supports environment variables:
- `VITE_GEMINI_API_KEY` or `VITE_GEMINI_API_KEYS` (comma-separated)
- `VITE_MCP_URL`

If these are set, they take precedence over encrypted credentials.

## Technical Details

### Encryption Algorithm
- **Algorithm**: AES-GCM (128-bit authentication tag)
- **Key Size**: 256-bit (SHA-256 hash of passphrase)
- **IV Size**: 96-bit (randomly generated per encryption)
- **Encoding**: Base64 (for storage and transmission)

### Caching Strategy
```typescript
let cachedGeminiKey: string | null = null;
let cachedMcpUrl: string | null = null;
```

Cache is persistent for the lifetime of the application. Call `clearCredentialCache()` to reset.

## References

- [Web Crypto API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Crypto_API)
- [AES-GCM](https://en.wikipedia.org/wiki/Galois/Counter_Mode)
- [Base64 Encoding](https://developer.mozilla.org/en-US/docs/Glossary/Base64)

## Testing

### Unit Tests
```bash
npm run test
```

### Manual Verification
```bash
node /tmp/test_encryption.mjs
```

## Related Files

- `src/lib/credentialEncryption.ts` - Encryption/decryption utilities
- `src/lib/encryptedCredentials.ts` - Encrypted credential storage
- `src/lib/apiKeyManager.ts` - API key management (updated to use encrypted credentials)
- `src/lib/mcpService.ts` - MCP service (updated to use encrypted credentials)
- `src/lib/aiService.ts` - AI service (updated for async API key retrieval)

---

**Version**: 1.0.0  
**Status**: ✅ Production Ready  
**Last Updated**: 2026-06-01
