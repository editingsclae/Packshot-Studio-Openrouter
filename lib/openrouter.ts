import { MODEL_CATALOG, type AspectRatio } from './models';

const OPENROUTER_BASE = 'https://openrouter.ai/api/v1';
const CAPABILITY_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

const endpointCache = new Map<string, CacheEntry<string[]>>();
let modelsListCache: CacheEntry<OpenRouterImageModelInfo[]> | null = null;

export interface OpenRouterImageModelInfo {
  id: string;
  name?: string;
  supported_parameters?: string[];
  pricing?: Record<string, string | number>;
}

export class OpenRouterApiError extends Error {
  status: number;
  friendlyMessage: string;
  isModelUnavailable: boolean;

  constructor(status: number, rawMessage: string) {
    const friendlyMessage = mapFriendlyError(status, rawMessage);
    super(friendlyMessage);
    this.name = 'OpenRouterApiError';
    this.status = status;
    this.friendlyMessage = friendlyMessage;
    this.isModelUnavailable = status === 404 || status === 410;
  }
}

export function mapFriendlyError(status: number, rawMessage?: string): string {
  switch (status) {
    case 401:
      return 'Invalid or missing OpenRouter API key. Verify OPENROUTER_API_KEY in .env.local.';
    case 402:
      return 'Insufficient OpenRouter credits. Add credits on OpenRouter or switch to the free Recraft model.';
    case 404:
    case 410:
      return 'This model endpoint is unavailable or retired (404/410). Please pick another model.';
    case 429:
      return 'Free models are rate limited — try again shortly, or switch to a paid model.';
    case 502:
      return 'Generation failed on the provider side and was not billed. Please retry or adjust your prompt.';
    default:
      if (status >= 500) {
        return `OpenRouter service error (${status}). Please try again in a moment.`;
      }
      return rawMessage || `Request failed with status ${status}.`;
  }
}

function getHeaders(): HeadersInit {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new OpenRouterApiError(401, 'OPENROUTER_API_KEY is not configured');
  }
  return {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
    'HTTP-Referer': process.env.APP_URL || 'http://localhost:3000',
    'X-Title': 'Packshot Studio',
  };
}

export function hexToRgbTuple(hex: string): [number, number, number] | null {
  const cleaned = hex.trim().replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(cleaned)) return null;
  return [
    parseInt(cleaned.slice(0, 2), 16),
    parseInt(cleaned.slice(2, 4), 16),
    parseInt(cleaned.slice(4, 6), 16),
  ];
}

/**
 * Discovery: GET /api/v1/images/models (cached 1h)
 */
export async function fetchAvailableImageModels(): Promise<OpenRouterImageModelInfo[]> {
  if (modelsListCache && modelsListCache.expiresAt > Date.now()) {
    return modelsListCache.value;
  }

  try {
    const res = await fetch(`${OPENROUTER_BASE}/images/models`, {
      method: 'GET',
      headers: process.env.OPENROUTER_API_KEY
        ? { Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}` }
        : undefined,
      cache: 'no-store',
    });

    if (!res.ok) {
      return [];
    }

    const json = (await res.json()) as { data?: OpenRouterImageModelInfo[] };
    const list = Array.isArray(json.data) ? json.data : [];
    modelsListCache = {
      value: list,
      expiresAt: Date.now() + CAPABILITY_CACHE_TTL_MS,
    };
    return list;
  } catch {
    return [];
  }
}

/**
 * Discovery: GET /api/v1/images/models/{id}/endpoints (cached 1h)
 * Returns union of supported_parameters across endpoints for this model.
 */
export async function getSupportedParameters(modelId: string): Promise<string[]> {
  const cached = endpointCache.get(modelId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  // Strip :free / variant tag if endpoint lookup requires base slug fallback
  const candidates = [modelId];
  if (modelId.includes(':')) {
    candidates.push(modelId.split(':')[0]);
  }

  for (const candidate of candidates) {
    try {
      const res = await fetch(`${OPENROUTER_BASE}/images/models/${candidate}/endpoints`, {
        method: 'GET',
        headers: process.env.OPENROUTER_API_KEY
          ? { Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}` }
          : undefined,
        cache: 'no-store',
      });

      if (!res.ok) continue;

      const json = (await res.json()) as {
        data?: {
          endpoints?: Array<{ supported_parameters?: string[] }>;
        };
      };

      const endpoints = json?.data?.endpoints ?? [];
      const paramSet = new Set<string>();
      for (const ep of endpoints) {
        for (const p of ep.supported_parameters ?? []) {
          paramSet.add(p);
        }
      }

      if (paramSet.size > 0) {
        const result = Array.from(paramSet);
        endpointCache.set(modelId, {
          value: result,
          expiresAt: Date.now() + CAPABILITY_CACHE_TTL_MS,
        });
        return result;
      }
    } catch {
      // Continue to next candidate or fallback
    }
  }

  // Check if /images/models already returned supported_parameters for this model
  const models = await fetchAvailableImageModels();
  const match = models.find((m) => m.id === modelId || m.id === modelId.split(':')[0]);
  if (match?.supported_parameters && match.supported_parameters.length > 0) {
    endpointCache.set(modelId, {
      value: match.supported_parameters,
      expiresAt: Date.now() + CAPABILITY_CACHE_TTL_MS,
    });
    return match.supported_parameters;
  }

  // Safe default baseline for Recraft v4.1 family if discovery didn't return parameters
  const localSpec = MODEL_CATALOG.find((m) => m.id === modelId);
  const fallback = [
    'prompt',
    'aspect_ratio',
    'seed',
    'output_format',
    'n',
    ...(localSpec?.supportsReference ? ['input_references'] : []),
  ];
  endpointCache.set(modelId, {
    value: fallback,
    expiresAt: Date.now() + CAPABILITY_CACHE_TTL_MS,
  });
  return fallback;
}

export interface GenerateSingleImageParams {
  model: string;
  prompt: string;
  aspectRatio?: AspectRatio;
  seed?: number;
  outputFormat?: 'png' | 'webp' | 'jpeg';
  background?: 'transparent' | 'opaque';
  inputReference?: string;
  rgbColors?: string[];
  backgroundRgbColor?: string;
}

export interface GeneratedImageResult {
  b64_json: string;
  media_type: string;
  cost: number | null;
  seed?: number;
  durationMs: number;
}

function buildImagePayload(
  params: GenerateSingleImageParams,
  supportedParams: string[],
  options: { includeOptional: boolean; includeImageConfig: boolean }
): Record<string, unknown> {
  const supports = (param: string) =>
    supportedParams.length === 0 || supportedParams.includes(param);

  const body: Record<string, unknown> = {
    model: params.model,
    prompt: params.prompt,
  };

  if (options.includeOptional) {
    if (params.aspectRatio && supports('aspect_ratio')) {
      body.aspect_ratio = params.aspectRatio;
    }
    if (typeof params.seed === 'number' && supports('seed')) {
      body.seed = params.seed;
    }
    if (params.outputFormat && supports('output_format')) {
      body.output_format = params.outputFormat;
    }
    if (params.background && supports('background')) {
      body.background = params.background;
    }
    if (supports('n')) {
      body.n = 1;
    }
  }

  // Reference image (only sent if model supports it and provided)
  if (params.inputReference && supports('input_references')) {
    body.input_references = [params.inputReference];
  }

  // Brand colors isolated here: Recraft rgb_colors & background_rgb_color via image_config
  if (options.includeImageConfig) {
    const rgbTuples = (params.rgbColors ?? [])
      .map(hexToRgbTuple)
      .filter((t): t is [number, number, number] => t !== null)
      .slice(0, 5);
    const bgTuple = params.backgroundRgbColor
      ? hexToRgbTuple(params.backgroundRgbColor)
      : null;

    const imageConfig: Record<string, unknown> = {};
    if (
      rgbTuples.length > 0 &&
      (supports('image_config') || supports('rgb_colors') || supportedParams.length === 0)
    ) {
      imageConfig.rgb_colors = rgbTuples;
    }
    if (
      bgTuple &&
      (supports('image_config') || supports('background_rgb_color') || supportedParams.length === 0)
    ) {
      imageConfig.background_rgb_color = bgTuple;
    }

    if (Object.keys(imageConfig).length > 0) {
      body.image_config = imageConfig;
    }
  }

  return body;
}

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function postImagesWithRetry(
  headers: HeadersInit,
  body: Record<string, unknown>
): Promise<Response> {
  const maxRetries = 2;
  let lastResponse: Response | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const response = await fetch(`${OPENROUTER_BASE}/images`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      cache: 'no-store',
    });

    if (response.ok) {
      return response;
    }

    lastResponse = response;

    // Retry on 429 or 5xx with exponential backoff
    if ((response.status === 429 || response.status >= 500) && attempt < maxRetries) {
      const backoffMs = 700 * Math.pow(2, attempt);
      await sleep(backoffMs);
      continue;
    }

    return response;
  }

  return lastResponse!;
}

/**
 * Generates a single image via OpenRouter POST /api/v1/images.
 * Handles capability filtering, brand color image_config isolation + 400 fallback,
 * optional-parameter 400 fallback, and exponential backoff on 429/5xx.
 */
export async function generateSingleImage(
  params: GenerateSingleImageParams
): Promise<GeneratedImageResult> {
  const startedAt = Date.now();
  const headers = getHeaders();
  const supportedParams = await getSupportedParameters(params.model);

  let body = buildImagePayload(params, supportedParams, {
    includeOptional: true,
    includeImageConfig: true,
  });

  let response = await postImagesWithRetry(headers, body);

  // If 400 with image_config (rgb_colors / background_rgb_color), retry without image_config
  if (response.status === 400 && body.image_config) {
    body = buildImagePayload(params, supportedParams, {
      includeOptional: true,
      includeImageConfig: false,
    });
    response = await postImagesWithRetry(headers, body);
  }

  // If still 400 because of an optional parameter (seed, output_format, aspect_ratio, background, n),
  // retry once with only core required fields (+ input_references if present).
  if (response.status === 400) {
    body = buildImagePayload(params, supportedParams, {
      includeOptional: false,
      includeImageConfig: false,
    });
    response = await postImagesWithRetry(headers, body);
  }

  if (!response.ok) {
    let rawMessage = '';
    try {
      const errJson = (await response.json()) as {
        error?: { message?: string };
        message?: string;
      };
      rawMessage = errJson?.error?.message || errJson?.message || '';
    } catch {
      rawMessage = await response.text().catch(() => '');
    }
    throw new OpenRouterApiError(response.status, rawMessage);
  }

  const data = (await response.json()) as {
    data?: Array<{ b64_json?: string; media_type?: string; url?: string }>;
    usage?: { cost?: number };
  };

  const first = data?.data?.[0];
  if (!first?.b64_json) {
    throw new OpenRouterApiError(502, 'OpenRouter returned empty image payload.');
  }

  return {
    b64_json: first.b64_json,
    media_type: first.media_type || 'image/png',
    cost: typeof data?.usage?.cost === 'number' ? data.usage.cost : null,
    seed: params.seed,
    durationMs: Date.now() - startedAt,
  };
}

/**
 * Enhances a deterministic prompt via OpenRouter Chat Completions.
 * Strictly preserves all facts and exact quoted text, <= 120 words.
 * On any failure, returns null so caller silently falls back to deterministic prompt.
 */
export async function enhancePromptWithAI(deterministicPrompt: string): Promise<string | null> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return null;

  const enhancerModel = process.env.OPENROUTER_ENHANCER_MODEL || 'openai/gpt-4o-mini';

  const systemPrompt = [
    'You are an expert commercial product photography director.',
    'Rewrite the provided deterministic product photography prompt into richer, natural, tactile photographic language following the exact same structure:',
    '1) subject (one sentence, product first) > 2) materials, finish, colors > 3) composition > 4) camera and lens language > 5) lighting > 6) background > 7) realism cues > 8) constraints.',
    'STRICT RULES:',
    '- Preserve EVERY factual product detail, material, finish, and color hex/tone.',
    '- NEVER invent brand names, logos, props, or extra text not present in the input.',
    '- Keep any quoted exact on-product text string character-for-character identical.',
    '- Keep all exclusion constraints ("Single product only. No people...", "No watermark...", etc.).',
    '- Maximum 120 words total.',
    '- Output ONLY the final prompt text with no markdown, labels, or surrounding quotes.',
  ].join('\n');

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);

    const res = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': process.env.APP_URL || 'http://localhost:3000',
        'X-Title': 'Packshot Studio',
      },
      body: JSON.stringify({
        model: enhancerModel,
        temperature: 0.4,
        max_tokens: 260,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: deterministicPrompt },
        ],
      }),
      signal: controller.signal,
      cache: 'no-store',
    });

    clearTimeout(timeout);
    if (!res.ok) return null;

    const json = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = json?.choices?.[0]?.message?.content?.trim();
    if (!content || content.length < 20) return null;

    // Enforce <= 120 words safety trim if needed, keeping clean sentence ending
    const words = content.split(/\s+/);
    if (words.length > 135) {
      return null;
    }

    return content;
  } catch {
    return null;
  }
}
