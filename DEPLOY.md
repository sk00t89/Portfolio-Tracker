# Deployment checklist

## 1. Install dependencies locally

After pulling the latest changes:

```bash
npm install
npm run build
```

This updates `package-lock.json` with the PWA dependency and verifies that the production build succeeds.

## 2. Supabase Edge Function

The public market-data backend now lives in:

```text
supabase/functions/market-api/index.ts
```

Deploy it with the Supabase CLI:

```bash
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase functions deploy market-api
```

The function is configured to require a valid Supabase JWT.

## 3. Supabase secrets

Add the server-only API keys:

```bash
supabase secrets set EODHD_API_KEY=YOUR_KEY
supabase secrets set COINGECKO_API_KEY=YOUR_KEY
```

These keys must never be placed in a Vite `VITE_*` variable because those variables are visible in the browser.

## 4. Frontend environment variables

For local testing against Supabase, add this to `.env.local`:

```text
VITE_MARKET_API_URL=https://YOUR_PROJECT.supabase.co/functions/v1/market-api
```

Keep the existing Supabase frontend variables:

```text
VITE_SUPABASE_URL=...
VITE_SUPABASE_PUBLISHABLE_KEY=...
```

Restart Vite after changing environment variables.

## 5. Test before Vercel

Sign in and verify:

- Dashboard loads.
- Holdings load from Supabase.
- Nordnet and Avanza enrichment works.
- Current prices update.
- Crypto prices load.
- Lysa fund prices load.
- Currency conversion works.

When `VITE_MARKET_API_URL` is absent, the frontend falls back to `http://localhost:3001`, so the old Express server can still be used during local development.

## 6. Vercel

Import the GitHub repository into Vercel.

Framework preset:

```text
Vite
```

Build command:

```text
npm run build
```

Output directory:

```text
dist
```

Add these Vercel environment variables:

```text
VITE_SUPABASE_URL
VITE_SUPABASE_PUBLISHABLE_KEY
VITE_MARKET_API_URL
```

Set `VITE_MARKET_API_URL` to:

```text
https://YOUR_PROJECT.supabase.co/functions/v1/market-api
```

Do not add EODHD or CoinGecko secret keys to Vercel.

## 7. Supabase Auth URLs

After Vercel creates the public domain, add it in Supabase Auth URL configuration.

Set the production Site URL to the Vercel domain and add appropriate redirect URLs, for example:

```text
https://YOUR_APP.vercel.app/**
```

Keep your local development redirect URL as well.

Google OAuth must also allow the production Supabase/Auth flow you already configured.

## 8. PWA / mobile install

The app now includes:

- PWA manifest.
- Service worker with automatic updates.
- Standalone display mode.
- Mobile layout improvements.
- Install prompt on compatible Android browsers.
- iPhone instructions for "Add to Home Screen".

PWA installation requires HTTPS, which Vercel provides automatically.

The current app icon is an SVG placeholder. Before a public launch, adding polished 192x192 and 512x512 PNG icons plus an Apple touch icon is recommended.
