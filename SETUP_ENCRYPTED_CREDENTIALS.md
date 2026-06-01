# Setup Guide: Encrypted Credentials

This guide walks you through setting up encrypted credentials for Presensys.

## Quick Start

### 1. Generate Encrypted Credentials

First, obtain your credentials:
- **Gemini API Key**: Get from [Google AI Studio](https://aistudio.google.com/app/apikey)
- **MCP URL**: Format: `https://mcp.supabase.com/mcp?project_ref=YOUR_PROJECT_REF`

Then, use the encryption script:

```bash
# Using Node.js
node -e "
import crypto from 'crypto';

const OBFUSCATION_PASSPHRASE = 'presensys-obfuscation-key-2024';

async function deriveKey() {
  const encoder = new TextEncoder();
  const data = encoder.encode(OBFUSCATION_PASSPHRASE);
  const hash = await crypto.subtle.digest('SHA-256', data);
  
  const key = await crypto.subtle.importKey(
    'raw', hash, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']
  );
  return key;
}

async function encrypt(value) {
  const key = await deriveKey();
  const encoder = new TextEncoder();
  const data = encoder.encode(value);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encryptedData = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv }, key, data
  );
  const combined = new Uint8Array(iv.length + encryptedData.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(encryptedData), iv.length);
  return Buffer.from(combined).toString('base64');
}

async function main() {
  const geminiKey = process.argv[2];
  const mcpUrl = process.argv[3];
  
  console.log('Encrypted Gemini API Key:');
  console.log(await encrypt(geminiKey));
  console.log('');
  console.log('Encrypted MCP URL:');
  console.log(await encrypt(mcpUrl));
}

main();
" YOUR_GEMINI_API_KEY "https://mcp.supabase.com/mcp?project_ref=..."
```

### 2. Update Credentials File

Edit `src/lib/encryptedCredentials.ts`:

```typescript
const ENCRYPTED_GEMINI_KEY = 'YOUR_ENCRYPTED_KEY_HERE';
const ENCRYPTED_MCP_URL = 'YOUR_ENCRYPTED_URL_HERE';
```

Replace the `PLACEHOLDER_*` values with your encrypted credentials.

### 3. Verify Setup

Run the application and check for errors:

```bash
npm run dev
```

If you see errors about placeholder credentials, go back to step 2.

## Using in Development

The encrypted credentials will be automatically decrypted when needed:

```typescript
import { getGeminiApiKey, getMcpUrl } from './lib/encryptedCredentials';

const apiKey = await getGeminiApiKey();    // Decrypted from ENCRYPTED_GEMINI_KEY
const mcpUrl = await getMcpUrl();          // Decrypted from ENCRYPTED_MCP_URL
```

## Important Notes

⚠️ **Security Warning**: 
- The encryption passphrase is hardcoded in the source code
- This provides **obfuscation only**, not cryptographic security
- Anyone with repository access can decrypt the credentials
- For production systems, consider using environment variables or a secrets management service

## Fallback Behavior

If credential decryption fails, the system will:
1. Use 10 hardcoded encrypted Gemini API keys from `apiKeyManager.ts`
2. Rotate through available models and API keys
3. Log warnings but continue operating

## Environment Variables (Legacy)

For backward compatibility, you can still use environment variables:

```bash
VITE_GEMINI_API_KEY=your_key
VITE_MCP_URL=https://mcp.url
```

If set, environment variables take precedence over encrypted credentials.

## Troubleshooting

### "Encrypted Gemini API key is not configured"
- Replace `PLACEHOLDER_ENCRYPTED_KEY_VALUE` in `src/lib/encryptedCredentials.ts`
- Run the encryption script to generate the encrypted value

### "Failed to decrypt Gemini API key"
- Verify the encrypted value is valid base64
- Check the obfuscation passphrase hasn't changed
- Ensure the encrypted data hasn't been corrupted

### Using the Fallback Keys
- The system has 10 fallback encrypted Gemini API keys
- These will be used if decryption fails
- Check console logs to see which keys are being attempted

## References

- [ENCRYPTED_CREDENTIALS.md](./ENCRYPTED_CREDENTIALS.md) - Complete technical documentation
- [Web Crypto API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Crypto_API)
- [Gemini API](https://ai.google.dev)
- [Supabase MCP](https://supabase.com/docs/guides/database/mcp)
