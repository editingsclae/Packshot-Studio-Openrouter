# Packshot Studio

An AI ecommerce product photography studio built with Next.js (App Router), TypeScript, Tailwind CSS, and the OpenRouter Images API (`POST /api/v1/images`).

## Features

- **Realism Engine (`lib/prompt-engine.ts` & `lib/presets.ts`)**: Structured product brief form (10 categories, material & finish, up to 5 product colors + background color, key features, up to 2 exact on-product text strings) combined with 6 shot presets and automatic category realism modules.
- **Capability-Driven OpenRouter Client (`lib/openrouter.ts`)**:
  - Uses `POST https://openrouter.ai/api/v1/images` directly (never chat completions for image output).
  - Discovers and caches (`1h`) `supported_parameters` per model via `/api/v1/images/models` and `/api/v1/images/models/{id}/endpoints`.
  - Sends Recraft `rgb_colors` and `background_rgb_color` via `image_config` with automatic 400 fallback to prompt-text color fidelity.
  - Fires parallel single-image requests (`Promise.allSettled`) for 1–4 variations with distinct seeds and exponential backoff retries on `429` / `5xx`.
- **AI Prompt Enhancer (`app/api/enhance/route.ts`)**: Optional server-side rewrite using `OPENROUTER_ENHANCER_MODEL`, strictly preserving facts and exact quoted product text, with silent fallback to the deterministic prompt on failure.
- **Packshot Checker (`lib/packshot-check.ts`)**: Client-side HTML5 canvas inspection for white-background shots verifying pure white borders (`#FFFFFF`) and 80–90% frame occupancy, with one-click regeneration on failure.
- **Local Library (`lib/db.ts`)**: IndexedDB persistence via `idb-keyval` with search, filters, favorites, PNG/WebP/JPEG export, and one-click Remix.
- **Command Palette**: `Cmd/Ctrl + K` to jump between tabs, presets, samples, and theme; `Cmd/Ctrl + Enter` to generate.

## Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Configure environment variables in `.env.local` (see `.env.example`):

   ```bash
   OPENROUTER_API_KEY="sk-or-v1-your-key-here"
   OPENROUTER_ENHANCER_MODEL="openai/gpt-4o-mini"
   APP_URL="http://localhost:3000"
   ```

   `OPENROUTER_API_KEY` is read exclusively by Next.js server Route Handlers and is never sent to the browser.

3. Run the development server:

   ```bash
   npm run dev
   ```

4. Build for production:

   ```bash
   npm run build
   npm start
   ```

## Deployment

### Environment Variables

| Variable | Required | Default | Description |
| --- | --- | --- | --- |
| `OPENROUTER_API_KEY` | Yes | — | Server-side OpenRouter API key for `/api/generate` and `/api/enhance`. |
| `APP_PASSWORD` | Yes (prod) | — | Shared access-gate password for `/login`. Production refuses requests (`503`) if unset. |
| `APP_SESSION_SECRET` | Recommended | `APP_PASSWORD` | Dedicated HMAC key material for signing `httpOnly` session cookies (`lib/auth.ts`). Falls back to `APP_PASSWORD` if omitted. |
| `ALLOWED_MODELS` | No | Recommended + free Recraft | Comma-separated allowlist of OpenRouter image model IDs (`*` allows all discovered models). |
| `MAX_REQUEST_USD` | No | `0.50` | Maximum estimated USD allowed per generation or enhance request (`402` if exceeded). |
| `MAX_DAILY_USD` | No | `5` | Cumulative UTC daily spend cap in USD across requests (`402` if exceeded). |
| `ALLOW_HIGH_QUALITY` | No | `false` | When `false`, caps `quality` at `medium` server-side for models whose `priceUnit` is not `"image"`. |
| `UPSTASH_REDIS_REST_URL` | Required on Vercel for paid models | — | Upstash Redis REST endpoint for shared daily spend and per-model max observed cost tracking. |
| `UPSTASH_REDIS_REST_TOKEN` | Required with URL | — | Upstash Redis REST bearer token paired with `UPSTASH_REDIS_REST_URL`. |
| `TRUSTED_PROXY` | No | `false` | Set to `true` when running behind a trusted reverse proxy so rate limiting reads the last `X-Forwarded-For` entry (auto-trusted when `VERCEL` is set; otherwise rate limits share a `"direct"` bucket). |

### Reverse Proxy Configuration

When self-hosting behind nginx with `TRUSTED_PROXY=true`, configure nginx to overwrite or append the true client address:

```nginx
proxy_set_header X-Forwarded-For $remote_addr;
```

### Vercel Limits & Serverless Notes

- **Shared budget store (`503` guard):** When `VERCEL` is set without `UPSTASH_REDIS_REST_URL`, the server logs a startup warning and refuses paid model requests with HTTP `503` so daily spend limits cannot be bypassed across ephemeral serverless instances. Free `:free` models remain available.
- **Request & response body size (`4.5 MB` limit):** Vercel Serverless Functions enforce a hard `4.5 MB` request/response payload cap. The client compresses non-transparent references to JPEG under `3 MB` (max `4` references, `4 MB` Zod cap) and dispatches one `POST /api/generate` call per image (`variations: 1`, concurrency `4`), keeping responses small. When attaching multiple high-resolution references on Vercel, keep the combined JSON body under `4.5 MB`.
- **Execution duration:** `/api/generate` declares `export const maxDuration = 300` and `/api/enhance` declares `export const maxDuration = 60`. Vercel Hobby plans cap function execution shorter than `300s` (use Vercel Pro with Fluid Compute or choose faster models when running slow image endpoints).
