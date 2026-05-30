# Environment Configuration for Presensys AI-Command Line

## Setup Instructions

### 1. Create .env.local file

Create a `.env.local` file in the project root directory:

```bash
cd /path/to/Presensys
touch .env.local
```

### 2. Add Gemini API Key

Get your Gemini API key from: https://aistudio.google.com/app/apikey

Then add it to `.env.local`:

```env
# Gemini API Configuration
VITE_GEMINI_API_KEY=your_gemini_api_key_here
```

⚠️ **Important Note:** Since this is a Vite-based React application, the `VITE_*` prefix means the API key is embedded into the client bundle at build time. Never use sensitive keys in production without a server-side proxy.

After adding the environment variable:

```bash
npm run dev
```

## Environment Variables Reference

| Variable | Type | Required | Description |
|----------|------|----------|-------------|
| `VITE_GEMINI_API_KEY` | string | Yes | Gemini API key for AI command execution |

## Security Notes

⚠️ **Important:**
- Never commit `.env.local` to version control
- The `.env.local` file is listed in `.gitignore`
- Keep your API keys secure and private
- Rotate keys regularly if exposed

## Testing Configuration

To test if your configuration is correct:

1. Open the app in your browser
2. Click the lightning bolt (⚡) button in the header
3. Type a simple command: "Hello, what can you do?"
4. If you see a response, the configuration is correct

If you see an error message about the API key not being configured:
- Check that `.env.local` exists in the project root
- Verify the API key is correct
- Ensure the dev server was restarted after adding the key
- Check browser console for detailed error messages (F12 or Ctrl+Shift+I)

## API Key Management

### Getting a Gemini API Key

1. Go to https://aistudio.google.com/app/apikey
2. Click "Create API key"
3. Copy the generated key
4. Paste it into `.env.local`

### Rate Limits

Gemini API has the following limits:
- **Free tier:** 60 requests per minute
- **Paid tier:** Higher limits based on usage

Monitor your usage at: https://console.cloud.google.com/

### Cost Estimation

Presensys typically uses:
- ~500-2000 tokens per command
- Gemini 1.5 Flash: $0.075 per million tokens (input)

Example costs:
- 100 commands per day: ~$0.01/day
- 3000 commands per month: ~$0.30/month

## Troubleshooting

### "No Gemini API key configured"

**Cause:** The environment variable is not set correctly.

**Solution:**
1. Check that `.env.local` exists in the project root
2. Verify the file contains: `VITE_GEMINI_API_KEY=your_key`
3. Restart the development server with `npm run dev`
4. Clear browser cache (Ctrl+F5 or Cmd+Shift+R)

### "Invalid API key"

**Cause:** The API key is expired or incorrect.

**Solution:**
1. Generate a new key at https://aistudio.google.com/app/apikey
2. Update `.env.local` with the new key
3. Restart the development server

### Commands timing out

**Cause:** Network issues or API quota exceeded.

**Solution:**
1. Check your internet connection
2. Visit https://console.cloud.google.com/ to check quota
3. Try using a shorter, simpler command
4. Wait a moment and try again

## Production Deployment

For production deployment on Vercel:

1. Go to your Vercel project settings
2. Navigate to "Environment Variables"
3. Add a new variable:
   - Name: `VITE_GEMINI_API_KEY`
   - Value: Your Gemini API key
   - Environments: Production (or all)

4. Redeploy your application

⚠️ **Critical Security Warning:** `VITE_*` prefixed environment variables are embedded into the client bundle at build time and are visible in the shipped JavaScript. This means the API key will be exposed to users who inspect the client bundle.

**For production use, consider implementing one of these alternatives:**
- Use a server-side proxy/API route that handles Gemini API calls on your backend
- Set up a secure API gateway that validates requests before forwarding to Gemini
- Use API key restrictions to limit usage by domain and rate limit

Direct client-side API key exposure is acceptable for development and low-risk applications, but not recommended for production systems handling sensitive operations.

## Best Practices

1. **Use a dedicated API key** for development
2. **Rotate keys regularly** (at least monthly)
3. **Monitor usage** through Google Cloud Console
4. **Set up billing alerts** to avoid unexpected charges
5. **Use environment-specific keys** for dev/staging/production
6. **Never share your API key** through version control or public channels

## Additional Resources

- **Gemini API Documentation:** https://ai.google.dev/docs
- **Vercel Environment Variables:** https://vercel.com/docs/projects/environment-variables
- **Google Cloud Console:** https://console.cloud.google.com/
- **API Quotas & Usage:** https://aistudio.google.com/app/account

---

**Last Updated:** 2026-05-27
