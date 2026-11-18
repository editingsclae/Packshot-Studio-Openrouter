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
