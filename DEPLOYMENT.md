# Deployment Guide

## 🔐 Security First

**NEVER commit:**
- Cloudflare KV namespace IDs
- API keys (GROQ, Gemini, Open-Meteo)
- Auth tokens or secrets
- Personal access tokens

All sensitive data goes through `wrangler secret put` or `.env` (gitignored).

---

## 1️⃣ Prerequisites

```bash
# Install Wrangler CLI
npm install -g wrangler@latest

# Authenticate with Cloudflare
wrangler login
```

---

## 2️⃣ Set Up Environment Variables

### Copy the template
```bash
cp .env.example .env.local
```

### Edit `.env.local` (or use wrangler commands)
```bash
# Get your KV namespace ID from Cloudflare Dashboard
# Settings → Workers → KV → Copy ID

# Then update wrangler.jsonc:
# Replace "YOUR_KV_NAMESPACE_ID_HERE" with your actual ID
```

---

## 3️⃣ Add Secrets (via Wrangler)

These are stored **securely** in Cloudflare, never in your code:

```bash
# Refresh endpoint secret (for cache invalidation)
wrangler secret put REFRESH_SECRET

# AI description generation (optional)
wrangler secret put GROQ_KEY

# Alternative AI provider (optional)
wrangler secret put GEMINI_API_KEY
```

---

## 4️⃣ Upload KV Data

```bash
# Generate KV bulk upload from SQLite database
node build_kv_from_db.js

# Upload to Cloudflare KV (remote)
npx wrangler kv bulk put kv_bulk_upload.json --namespace-id=YOUR_KV_ID --remote
```

---

## 5️⃣ Deploy Worker

```bash
# Deploy to Cloudflare
wrangler deploy

# Test live endpoint
curl https://your-worker-domain.workers.dev/area/apremont
```

---

## 6️⃣ Verify Deployment

✅ Check that:
- Worker is deployed (green checkmark in Dashboard)
- KV namespace is bound correctly
- `/area/{slug}` endpoint returns data
- `/refresh?secret=YOUR_SECRET` works (cache clear)

---

## 🚀 CI/CD (Optional)

Add GitHub Actions for automatic deployment on push:

```yaml
# .github/workflows/deploy.yml
name: Deploy to Cloudflare Workers

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm ci
      - run: npm run deploy
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
          REFRESH_SECRET: ${{ secrets.REFRESH_SECRET }}
```

---

## 🛠️ Local Development

```bash
# Run Worker locally (with hot reload)
wrangler dev

# Test on http://localhost:8787
curl http://localhost:8787/area/apremont?h=180
```

---

## 📊 Monitoring

Check Worker Analytics in Cloudflare Dashboard:
- Request count & latency
- Cache hit rate
- Error rates
- KV read/write operations

---

## ⚠️ Common Issues

| Issue | Solution |
|-------|----------|
| `401 Unauthorized` | Check `CLOUDFLARE_API_TOKEN` in secrets |
| `KV namespace not found` | Verify ID in `wrangler.jsonc` matches Dashboard |
| `Cache miss on /refresh` | Ensure `REFRESH_SECRET` env var is set |
| `CORS errors` | Add `Access-Control-Allow-Origin: *` headers in worker |

---

## 📞 Support

- **Cloudflare Docs**: https://developers.cloudflare.com/workers/
- **Wrangler CLI**: https://developers.cloudflare.com/workers/wrangler/
- **Issues**: Open a GitHub issue with deployment logs
