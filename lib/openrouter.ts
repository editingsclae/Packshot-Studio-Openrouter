import { z } from 'zod';
import {
  formatProviderLabel,
  OFFLINE_FALLBACK_MODELS,
  type AspectRatio,
  type DiscoverySource,
  type ModelTier,
  type NormalizedImageModel,
  type PriceUnit,
} from './models';

const OPENROUTER_BASE = 'https://openrouter.ai/api/v1';
const CAPABILITY_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
const REQUEST_TIMEOUT_MS = 10_000; // 10s per OpenRouter request
const ENRICHMENT_BUDGET_MS = 20_000; // ~20s total enrichment budget

interface ParamSchema {
  type?: string;
  values?: string[];
  min?: number;
  max?: number;
}

const ParamSchemaValidator = z
  .object({
    type: z.string().optional(),
    values: z.array(z.string()).optional(),
    min: z.number().optional(),
    max: z.number().optional(),
  })
  .passthrough();

const Source1ModelSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().optional(),
    description: z.string().optional(),
    architecture: z
      .object({
        input_modalities: z.array(z.string()).optional(),
        output_modalities: z.array(z.string()).optional(),
      })
      .passthrough()
      .optional(),
    supported_parameters: z.record(z.string(), ParamSchemaValidator).optional(),
    supports_streaming: z.boolean().optional(),
  })
  .passthrough();

const EndpointPricingLineSchema = z
  .object({
    billable: z.string().optional(),
    unit: z.string().optional(),
    cost_usd: z.union([z.number(), z.string()]).optional(),
  })
  .passthrough();

const EndpointEntrySchema = z
  .object({
    supported_parameters: z.record(z.string(), ParamSchemaValidator).optional(),
    supports_streaming: z.boolean().optional(),
    pricing: z.array(EndpointPricingLineSchema).optional(),
  })
  .passthrough();

const EndpointsResponseSchema = z
  .object({
    id: z.string().optional(),
    endpoints: z.array(EndpointEntrySchema).optional(),
  })
  .passthrough();

const Source2ModelSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().optional(),
    description: z.string().optional(),
    expiration_date: z.string().nullable().optional(),
    architecture: z
      .object({
        input_modalities: z.array(z.string()).optional(),
        output_modalities: z.array(z.string()).optional(),
      })
      .passthrough()
      .optional(),
    pricing: z.record(z.string(), z.unknown()).optional(),
  })
  .passthrough();

type Source1Model = z.infer<typeof Source1ModelSchema>;
type Source2Model = z.infer<typeof Source2ModelSchema>;
type EndpointEntry = z.infer<typeof EndpointEntrySchema>;

interface CatalogCacheEntry {
  models: NormalizedImageModel[];
  updatedAt: number;
  failedCount: number;
}

let catalogCache: CatalogCacheEntry | null = null;
const modelParamsCache = new Map<
  string,
  { params: Record<string, ParamSchema>; expiresAt: number }
>();

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
      return 'Insufficient OpenRouter credits. Add credits on OpenRouter or switch to a Free model.';
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

function getAuthHeaderOptional(): HeadersInit {
  const headers: Record<string, string> = {
    'HTTP-Referer': process.env.APP_URL || 'http://localhost:3000',
    'X-Title': 'Packshot Studio',
  };
  if (process.env.OPENROUTER_API_KEY) {
    headers.Authorization = `Bearer ${process.env.OPENROUTER_API_KEY}`;
  }
  return headers;
}

function getHeadersRequired(): HeadersInit {
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

/**
 * Performs a GET request to OpenRouter with cache: "no-store",
 * 10s AbortController timeout, and one retry on failure.
 */
async function fetchOpenRouterWithRetry(url: string): Promise<Response> {
  let lastError: unknown = null;

  for (let attempt = 0; attempt < 2; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const res = await fetch(url, {
        method: 'GET',
        headers: getAuthHeaderOptional(),
        cache: 'no-store',
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (res.ok) {
        return res;
      }

      const bodySnippet = await res.text().catch(() => '');
      console.error(
        `[openrouter] GET ${url} failed (attempt ${attempt + 1}, status=${res.status}): ${bodySnippet.slice(0, 200)}`
      );
      lastError = new Error(`HTTP ${res.status}`);

      // Retry once on 429 or 5xx
      if ((res.status === 429 || res.status >= 500) && attempt === 0) {
        await new Promise((r) => setTimeout(r, 350));
        continue;
      }
      throw lastError;
    } catch (err) {
      clearTimeout(timer);
      const message = err instanceof Error ? err.message : String(err);
      console.error(
        `[openrouter] GET ${url} error (attempt ${attempt + 1}): ${message}`
      );
      lastError = err;
      if (attempt === 0) {
        await new Promise((r) => setTimeout(r, 350));
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error('OpenRouter request failed');
}

/**
 * Concurrency-capped worker pool (max 6) with shared ~20s budget.
 */
async function enrichEndpointsWithBudget(
  models: Source1Model[]
): Promise<Map<string, { ok: boolean; endpoints: EndpointEntry[] }>> {
  const results = new Map<string, { ok: boolean; endpoints: EndpointEntry[] }>();
  const deadline = Date.now() + ENRICHMENT_BUDGET_MS;
  let cursor = 0;

  async function worker() {
    while (true) {
      if (Date.now() >= deadline) break;
      const idx = cursor++;
      if (idx >= models.length) break;

      const model = models[idx];
      const url = `${OPENROUTER_BASE}/images/models/${model.id}/endpoints`;
      try {
        const res = await fetchOpenRouterWithRetry(url);
        const rawJson = (await res.json()) as unknown;
        const parsed = EndpointsResponseSchema.safeParse(rawJson);
        if (!parsed.success) {
          console.error(
            `[openrouter] Invalid endpoints schema for ${model.id}: ${parsed.error.message}`
          );
          results.set(model.id, { ok: false, endpoints: [] });
        } else {
          results.set(model.id, {
            ok: true,
            endpoints: parsed.data.endpoints ?? [],
          });
        }
      } catch {
        results.set(model.id, { ok: false, endpoints: [] });
      }
    }
  }

  const concurrency = Math.min(6, Math.max(1, models.length));
  await Promise.all(Array.from({ length: concurrency }, () => worker()));

  for (const model of models) {
    if (!results.has(model.id)) {
      results.set(model.id, { ok: false, endpoints: [] });
    }
  }

  return results;
}

function parseNumericCost(val: unknown): number | null {
  if (typeof val === 'number' && Number.isFinite(val)) return val;
  if (typeof val === 'string' && val.trim() !== '') {
    const n = Number(val);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function normalizePriceUnit(unit: unknown): PriceUnit {
  if (typeof unit !== 'string') return null;
  const lower = unit.toLowerCase();
  if (lower.includes('megapixel') || lower === 'mp') return 'megapixel';
  if (lower.includes('token')) return 'token';
  if (lower.includes('image')) return 'image';
  return null;
}

function formatExpirationBadge(expirationDate?: string | null): string | undefined {
  if (!expirationDate) return undefined;
  const parsed = new Date(`${expirationDate}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return undefined;
  const formatted = parsed.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
  return `Free tier ends ${formatted}`;
}

function mergeParamObjects(
  base: Record<string, ParamSchema> | undefined,
  endpoints: EndpointEntry[]
): Record<string, ParamSchema> {
  const merged: Record<string, ParamSchema> = { ...(base ?? {}) };
  for (const ep of endpoints) {
    if (!ep.supported_parameters) continue;
    for (const [key, schema] of Object.entries(ep.supported_parameters)) {
      const prev = merged[key];
      if (!prev) {
        merged[key] = schema;
      } else {
        const values =
          prev.values || schema.values
            ? Array.from(new Set([...(prev.values ?? []), ...(schema.values ?? [])]))
            : undefined;
        merged[key] = {
          ...prev,
          ...schema,
          ...(values ? { values } : {}),
        };
      }
    }
  }
  return merged;
}

function buildNormalizedModel(opts: {
  id: string;
  name: string;
  description: string;
  outputModalities: string[];
  paramMap: Record<string, ParamSchema>;
  supportsStreaming: boolean;
  endpointsOk: boolean;
  endpoints: EndpointEntry[];
  source2Pricing?: Record<string, unknown>;
  expirationDate?: string | null;
}): NormalizedImageModel {
  const { id, name, description, outputModalities, paramMap, supportsStreaming, endpointsOk, endpoints, source2Pricing, expirationDate } = opts;

  const provider = id.includes('/') ? id.split('/')[0] : 'openrouter';
  const providerLabel = formatProviderLabel(provider);
  const supportedParams = Object.keys(paramMap);

  const inputRefs = paramMap.input_references;
  const maxReferences =
    inputRefs && typeof inputRefs.max === 'number' ? inputRefs.max : 0;
  const minReferences =
    inputRefs && typeof inputRefs.min === 'number' ? inputRefs.min : 0;
  const supportsReference = Boolean(inputRefs && maxReferences >= 1);
  const requiresReference = Boolean(inputRefs && minReferences >= 1);

  const nMax =
    paramMap.n && typeof paramMap.n.max === 'number' ? paramMap.n.max : 1;

  const rawAspects = paramMap.aspect_ratio?.values;
  const supportedAspectRatios = rawAspects
    ? rawAspects.filter((v) => v !== 'auto')
    : undefined;
  const supportedResolutions = paramMap.resolution?.values;
  const supportedQualities = paramMap.quality?.values;
  const supportedBackgrounds = paramMap.background?.values;
  const supportedOutputFormats = paramMap.output_format?.values;

  const supportsSvg = Boolean(
    supportedOutputFormats?.some((f) => f.toLowerCase() === 'svg') ||
      outputModalities.some((m) => m.toLowerCase().includes('svg'))
  );

  // Extract pricing from endpoints[]
  const allCosts: number[] = [];
  let lowestOutputImageCost: number | null = null;
  let resolvedUnit: PriceUnit = null;

  for (const ep of endpoints) {
    for (const line of ep.pricing ?? []) {
      const cost = parseNumericCost(line.cost_usd);
      if (cost !== null) {
        allCosts.push(cost);
      }
      if ((line.billable || '').toLowerCase() === 'output_image' && cost !== null) {
        if (lowestOutputImageCost === null || cost < lowestOutputImageCost) {
          lowestOutputImageCost = cost;
          resolvedUnit = normalizePriceUnit(line.unit) ?? 'image';
        }
      }
    }
  }

  // Fallback to source2 pricing only if endpoints had none and source2Pricing has numbers
  if (allCosts.length === 0 && source2Pricing) {
    for (const [k, v] of Object.entries(source2Pricing)) {
      const c = parseNumericCost(v);
      if (c !== null) {
        allCosts.push(c);
        if (k === 'image_output' || k === 'output_image') {
          lowestOutputImageCost = c;
          resolvedUnit = 'image';
        }
      }
    }
  }

  const isFreeId = id.endsWith(':free');
  const everyCostZero = allCosts.length > 0 && allCosts.every((c) => c === 0);
  const tier: ModelTier = isFreeId || everyCostZero ? 'free' : 'paid';

  let priceUsd: number | null = null;
  let priceUnit: PriceUnit = null;
  let priceUnverified = false;

  if (tier === 'free') {
    priceUsd = 0;
    priceUnit = 'image';
  } else if (!endpointsOk) {
    priceUsd = null;
    priceUnit = null;
    priceUnverified = true;
  } else if (lowestOutputImageCost !== null) {
    priceUsd = lowestOutputImageCost;
    priceUnit = resolvedUnit;
  } else {
    priceUsd = null;
    priceUnit = null;
    priceUnverified = endpoints.length === 0;
  }

  modelParamsCache.set(id, {
    params: paramMap,
    expiresAt: Date.now() + CAPABILITY_CACHE_TTL_MS,
  });

  const badge =
    id === 'recraft/recraft-v4.1-flash-v2:free'
      ? formatExpirationBadge(expirationDate) ?? 'Free tier ends Nov 28, 2026'
      : isFreeId
        ? formatExpirationBadge(expirationDate)
        : undefined;

  return {
    id,
    name,
    provider,
    providerLabel,
    description,
    tier,
    priceUsd,
    priceUnit,
    priceUnverified,
    supportsReference,
    requiresReference,
    maxReferences,
    supportedParams,
    nMax,
    supportsStreaming,
    supportsSvg,
    supportedAspectRatios:
      supportedAspectRatios && supportedAspectRatios.length > 0
        ? supportedAspectRatios
        : undefined,
    supportedResolutions,
    supportedQualities,
    supportedBackgrounds,
    supportedOutputFormats,
    badge,
  };
}

export interface DiscoveryResult {
  models: NormalizedImageModel[];
  source: DiscoverySource;
  updatedAt: number;
  error?: string;
  failedCount: number;
}

/**
 * Discovers image models from:
 * - Source 1 (required): GET /api/v1/images/models + per-model /endpoints (max 6 concurrency, ~20s budget)
 * - Source 2 (best effort): GET /api/v1/models?output_modalities=image (for :free variants & metadata)
 * Serves 1h cache unless bypassCache=true; falls back to stale cache or OFFLINE_FALLBACK_MODELS.
 */
export async function discoverNormalizedModels(options?: {
  bypassCache?: boolean;
}): Promise<DiscoveryResult> {
  const bypassCache = Boolean(options?.bypassCache);

  if (
    !bypassCache &&
    catalogCache &&
    Date.now() - catalogCache.updatedAt < CAPABILITY_CACHE_TTL_MS
  ) {
    return {
      models: catalogCache.models,
      source: 'cache',
      updatedAt: catalogCache.updatedAt,
      failedCount: catalogCache.failedCount,
    };
  }

  try {
    // Source 1 (required) & Source 2 (best effort) in parallel
    const [source1Res, source2Res] = await Promise.allSettled([
      fetchOpenRouterWithRetry(`${OPENROUTER_BASE}/images/models`),
      fetchOpenRouterWithRetry(`${OPENROUTER_BASE}/models?output_modalities=image`),
    ]);

    if (source1Res.status !== 'fulfilled') {
      throw source1Res.reason instanceof Error
        ? source1Res.reason
        : new Error('Failed to fetch /api/v1/images/models');
    }

    const s1Json = (await source1Res.value.json()) as { data?: unknown[] };
    const s1RawArray = Array.isArray(s1Json?.data) ? s1Json.data : null;
    if (!s1RawArray) {
      throw new Error('Unexpected response shape from /api/v1/images/models');
    }

    const source1Models: Source1Model[] = [];
    for (const item of s1RawArray) {
      const parsed = Source1ModelSchema.safeParse(item);
      if (!parsed.success) {
        console.error(
          `[openrouter] Skipping invalid Source 1 model entry: ${parsed.error.message}`
        );
        continue;
      }
      const outs = parsed.data.architecture?.output_modalities ?? ['image'];
      if (!outs.includes('image')) continue;
      source1Models.push(parsed.data);
    }

    if (source1Models.length === 0) {
      throw new Error('OpenRouter /api/v1/images/models returned zero valid image models');
    }

    // Source 2 (best effort): parse defensively, never fail discovery if unexpected
    const source2Map = new Map<string, Source2Model>();
    if (source2Res.status === 'fulfilled') {
      try {
        const s2Json = (await source2Res.value.json()) as { data?: unknown[] };
        if (Array.isArray(s2Json?.data)) {
          for (const item of s2Json.data) {
            const parsed = Source2ModelSchema.safeParse(item);
            if (!parsed.success) continue;
            const outs = parsed.data.architecture?.output_modalities ?? [];
            if (!outs.includes('image')) continue;
            source2Map.set(parsed.data.id, parsed.data);
          }
        }
      } catch (err) {
        console.error(
          `[openrouter] Ignoring unexpected Source 2 payload: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }

    // Enrich Source 1 models with /endpoints (concurrency capped at 6, ~20s budget)
    const endpointMap = await enrichEndpointsWithBudget(source1Models);

    const normalizedModels: NormalizedImageModel[] = [];
    const seenIds = new Set<string>();
    const source1ById = new Map<string, Source1Model>();
    let failedCount = 0;

    for (const raw of source1Models) {
      source1ById.set(raw.id, raw);
    }

    for (const raw of source1Models) {
      try {
        const epEntry = endpointMap.get(raw.id) ?? { ok: false, endpoints: [] };
        if (!epEntry.ok) failedCount++;

        const s2Match = source2Map.get(raw.id);
        const paramMap = mergeParamObjects(
          raw.supported_parameters,
          epEntry.endpoints
        );
        const supportsStreaming = Boolean(
          raw.supports_streaming || epEntry.endpoints.some((e) => e.supports_streaming)
        );

        const model = buildNormalizedModel({
          id: raw.id,
          name: raw.name || s2Match?.name || raw.id,
          description: raw.description || s2Match?.description || '',
          outputModalities: raw.architecture?.output_modalities ?? ['image'],
          paramMap,
          supportsStreaming,
          endpointsOk: epEntry.ok,
          endpoints: epEntry.endpoints,
          source2Pricing: s2Match?.pricing,
          expirationDate: s2Match?.expiration_date,
        });

        normalizedModels.push(model);
        seenIds.add(raw.id);
      } catch (err) {
        failedCount++;
        console.error(
          `[openrouter] Failed normalizing Source 1 model ${raw.id}: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }

    // Merge extra models from Source 2 (especially ":free" variants)
    for (const [id, s2] of source2Map.entries()) {
      if (seenIds.has(id)) continue;
      try {
        const baseId = id.includes(':') ? id.split(':')[0] : id;
        const baseSource1 = source1ById.get(baseId);
        if (!id.endsWith(':free') && !baseSource1) continue;
        const baseEp = endpointMap.get(baseId);

        const paramMap = baseSource1
          ? mergeParamObjects(
              baseSource1.supported_parameters,
              baseEp?.endpoints ?? []
            )
          : {};

        const model = buildNormalizedModel({
          id,
          name: s2.name || id,
          description: s2.description || baseSource1?.description || '',
          outputModalities: s2.architecture?.output_modalities ?? ['image'],
          paramMap,
          supportsStreaming: Boolean(baseSource1?.supports_streaming),
          endpointsOk: true,
          endpoints: [],
          source2Pricing: s2.pricing,
          expirationDate: s2.expiration_date,
        });

        normalizedModels.push(model);
        seenIds.add(id);
      } catch (err) {
        failedCount++;
        console.error(
          `[openrouter] Failed normalizing Source 2 model ${id}: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }

    const updatedAt = Date.now();
    catalogCache = {
      models: normalizedModels,
      updatedAt,
      failedCount,
    };

    return {
      models: normalizedModels,
      source: 'live',
      updatedAt,
      failedCount,
    };
  } catch (err) {
    const shortError =
      err instanceof Error ? err.message : 'OpenRouter unreachable';
    console.error(`[openrouter] Model discovery failed: ${shortError}`);

    if (catalogCache && catalogCache.models.length > 0) {
      return {
        models: catalogCache.models,
        source: 'cache',
        updatedAt: catalogCache.updatedAt,
        error: shortError,
        failedCount: catalogCache.failedCount,
      };
    }

    return {
      models: OFFLINE_FALLBACK_MODELS,
      source: 'offline',
      updatedAt: Date.now(),
      error: shortError,
      failedCount: 0,
    };
  }
}

export async function getModelParamMap(
  modelId: string
): Promise<Record<string, ParamSchema> | null> {
  const cached = modelParamsCache.get(modelId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.params;
  }

  await discoverNormalizedModels();
  return modelParamsCache.get(modelId)?.params ?? null;
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

export interface GenerateSingleImageParams {
  model: string;
  prompt: string;
  aspectRatio?: AspectRatio;
  resolution?: string;
  quality?: string;
  background?: string;
  seed?: number;
  outputFormat?: 'png' | 'webp' | 'jpeg' | 'svg';
  inputReferences?: string[];
  rgbColors?: string[];
  backgroundRgbColor?: string;
}

export interface GeneratedImageResult {
  b64_json: string;
  media_type: string;
  cost: number | null;
  seed?: number;
  durationMs: number;
  degraded: string[];
}

function buildImagePayload(
  params: GenerateSingleImageParams,
  paramMap: Record<string, ParamSchema> | null,
  options: { includeOptional: boolean; includeImageConfig: boolean }
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model: params.model,
    prompt: params.prompt,
  };

  // If supported_parameters is explicitly empty (e.g. meta/muse-image), send ONLY model + prompt
  if (paramMap && Object.keys(paramMap).length === 0) {
    return body;
  }

  const supports = (param: string) =>
    paramMap === null || Object.prototype.hasOwnProperty.call(paramMap, param);

  if (options.includeOptional) {
    if (params.aspectRatio && supports('aspect_ratio')) {
      body.aspect_ratio = params.aspectRatio;
    }
    if (params.resolution && params.resolution !== 'auto' && supports('resolution')) {
      body.resolution = params.resolution;
    }
    if (params.quality && params.quality !== 'auto' && supports('quality')) {
      body.quality = params.quality;
    }
    if (params.background && params.background !== 'auto' && supports('background')) {
      body.background = params.background;
    }
    if (typeof params.seed === 'number' && supports('seed')) {
      body.seed = params.seed;
    }
    if (params.outputFormat && supports('output_format')) {
      body.output_format = params.outputFormat;
    }
    if (supports('n')) {
      body.n = 1;
    }
  }

  if (
    params.inputReferences &&
    params.inputReferences.length > 0 &&
    supports('input_references')
  ) {
    const modelMaxRefs = paramMap?.input_references?.max ?? params.inputReferences.length;
    const maxRefs = Math.min(4, Math.max(1, modelMaxRefs));
    body.input_references = params.inputReferences.slice(0, maxRefs);
  }

  if (options.includeImageConfig && params.model.startsWith('recraft/')) {
    const rgbTuples = (params.rgbColors ?? [])
      .map(hexToRgbTuple)
      .filter((t): t is [number, number, number] => t !== null)
      .slice(0, 5);
    const bgTuple = params.backgroundRgbColor
      ? hexToRgbTuple(params.backgroundRgbColor)
      : null;

    const imageConfig: Record<string, unknown> = {};
    if (rgbTuples.length > 0) {
      imageConfig.rgb_colors = rgbTuples;
    }
    if (bgTuple) {
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

    if ((response.status === 429 || response.status >= 500) && attempt < maxRetries) {
      const backoffMs = 700 * Math.pow(2, attempt);
      await sleep(backoffMs);
      continue;
    }

    return response;
  }

  return lastResponse!;
}

const TRACKED_OPTIONAL_KEYS = [
  'aspect_ratio',
  'resolution',
  'quality',
  'background',
  'output_format',
  'seed',
  'image_config',
] as const;

/**
 * Generates a single image via OpenRouter POST /api/v1/images.
 */
export async function generateSingleImage(
  params: GenerateSingleImageParams
): Promise<GeneratedImageResult> {
  const startedAt = Date.now();
  const headers = getHeadersRequired();
  const paramMap = await getModelParamMap(params.model);

  const initialBody = buildImagePayload(params, paramMap, {
    includeOptional: true,
    includeImageConfig: true,
  });
  let body = initialBody;

  let response = await postImagesWithRetry(headers, body);

  if (response.status === 400 && body.image_config) {
    body = buildImagePayload(params, paramMap, {
      includeOptional: true,
      includeImageConfig: false,
    });
    response = await postImagesWithRetry(headers, body);
  }

  if (response.status === 400) {
    body = buildImagePayload(params, paramMap, {
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
    console.error(
      `[openrouter] POST /images failed for ${params.model} (status=${response.status}): ${rawMessage}`
    );
    throw new OpenRouterApiError(response.status, rawMessage);
  }

  const degraded: string[] = [];
  for (const key of TRACKED_OPTIONAL_KEYS) {
    if (
      Object.prototype.hasOwnProperty.call(initialBody, key) &&
      !Object.prototype.hasOwnProperty.call(body, key)
    ) {
      degraded.push(key);
    }
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
    degraded,
  };
}

export interface EnhancePromptResult {
  prompt: string;
  cost: number | null;
}

/**
 * Enhances a deterministic prompt via OpenRouter Chat Completions and returns text + reported cost.
 */
export async function enhancePromptWithUsage(
  deterministicPrompt: string,
  modelOverride?: string
): Promise<EnhancePromptResult | null> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return null;

  const enhancerModel =
    modelOverride || process.env.OPENROUTER_ENHANCER_MODEL || 'openai/gpt-4o-mini';

  const systemPrompt = [
    'You are an expert commercial product photography director.',
    'Rewrite the provided deterministic product photography prompt into richer, natural, tactile photographic language following the exact same structure:',
    '1) subject (one sentence, product first) > 2) materials, finish, colors > 3) composition > 4) camera and lens language > 5) lighting > 6) background > 7) realism cues > 8) constraints.',
    'STRICT RULES:',
    '- Preserve EVERY factual product detail, material, finish, and natural color description without adding hex codes.',
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
      usage?: { cost?: number };
    };
    const content = json?.choices?.[0]?.message?.content?.trim();
    if (!content || content.length < 20) return null;

    const words = content.split(/\s+/);
    if (words.length > 135) {
      return null;
    }

    const reportedCost =
      typeof json?.usage?.cost === 'number' && Number.isFinite(json.usage.cost)
        ? json.usage.cost
        : null;

    return {
      prompt: content,
      cost: reportedCost,
    };
  } catch {
    return null;
  }
}

/**
 * Enhances a deterministic prompt via OpenRouter Chat Completions.
 */
export async function enhancePromptWithAI(deterministicPrompt: string): Promise<string | null> {
  const result = await enhancePromptWithUsage(deterministicPrompt);
  return result?.prompt ?? null;
}
