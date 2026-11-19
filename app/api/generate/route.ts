import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { findModelById, OFFLINE_FALLBACK_MODELS } from '@/lib/models';
import {
  authorizeSpend,
  ENHANCE_ESTIMATE_USD,
  estimateImageRequestCostUsd,
  isEnhancerModelAllowed,
  isImageModelAllowed,
  recordSpend,
} from '@/lib/budget';
import {
  discoverNormalizedModels,
  enhancePromptWithUsage,
  generateSingleImage,
  OpenRouterApiError,
} from '@/lib/openrouter';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const MAX_REFERENCE_BYTES = 4 * 1024 * 1024; // 4 MB max per reference payload

const GenerateSchema = z.object({
  prompt: z
    .string()
    .trim()
    .min(10, 'Prompt must be at least 10 characters.')
    .max(2000, 'Prompt cannot exceed 2000 characters.'),
  model: z.string().trim().min(3).max(160),
  aspectRatio: z.enum(['1:1', '4:5', '3:4', '16:9', '9:16']).default('1:1'),
  resolution: z.string().trim().max(40).optional(),
  quality: z.string().trim().max(40).optional(),
  background: z.enum(['auto', 'opaque', 'transparent']).optional(),
  variations: z.number().int().min(1).max(4).default(1),
  enhance: z.boolean().default(false),
  promptEditedManually: z.boolean().default(false),
  rgbColors: z
    .array(z.string().regex(/^#[0-9a-fA-F]{6}$/))
    .max(5)
    .optional(),
  backgroundRgbColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional(),
  inputReferences: z
    .array(
      z
        .string()
        .max(MAX_REFERENCE_BYTES, 'Each reference image must be under 4 MB.')
    )
    .max(4, 'Maximum of 4 reference images allowed.')
    .optional(),
  inputReference: z
    .string()
    .max(MAX_REFERENCE_BYTES, 'Reference image payload must be under 4 MB.')
    .optional(),
  outputFormat: z.enum(['png', 'webp', 'jpeg', 'svg']).optional(),
  baseSeed: z.number().int().min(1).max(2_147_483_647).optional(),
});

export async function POST(req: NextRequest) {
  const startedAt = Date.now();
  const ip = getClientIp(req);
  const limit = checkRateLimit(ip, { maxRequests: 20, windowMs: 60_000 });
  if (!limit.allowed) {
    return NextResponse.json(
      {
        error: `Rate limit reached. Please wait ${limit.retryAfterSec}s before generating again.`,
      },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSec) } }
    );
  }

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON request body.' }, { status: 400 });
  }

  const parsed = GenerateSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || 'Validation failed.' },
      { status: 400 }
    );
  }

  const input = parsed.data;

  if (!process.env.OPENROUTER_API_KEY) {
    return NextResponse.json(
      {
        error:
          'OPENROUTER_API_KEY is not configured on the server. Add it to .env.local and restart the dev server.',
      },
      { status: 401 }
    );
  }

  if (!isImageModelAllowed(input.model)) {
    return NextResponse.json(
      {
        error: `Model "${input.model}" is not enabled on this server (ALLOWED_MODELS allowlist).`,
      },
      { status: 403 }
    );
  }

  const { models } = await discoverNormalizedModels();
  const modelSpec =
    findModelById(models, input.model) ??
    findModelById(OFFLINE_FALLBACK_MODELS, input.model);

  // Reject resolution/quality values unsupported by this model's supported_parameters
  if (input.resolution && input.resolution !== 'auto') {
    if (!modelSpec || !modelSpec.supportedParams.includes('resolution')) {
      return NextResponse.json(
        {
          error: `Parameter "resolution" is not supported by model "${input.model}".`,
        },
        { status: 400 }
      );
    }
    if (
      modelSpec.supportedResolutions &&
      modelSpec.supportedResolutions.length > 0 &&
      !modelSpec.supportedResolutions.includes(input.resolution)
    ) {
      return NextResponse.json(
        {
          error: `Resolution "${input.resolution}" is not supported by "${input.model}". Allowed: ${modelSpec.supportedResolutions.join(', ')}.`,
        },
        { status: 400 }
      );
    }
  }

  if (input.quality && input.quality !== 'auto') {
    if (!modelSpec || !modelSpec.supportedParams.includes('quality')) {
      return NextResponse.json(
        {
          error: `Parameter "quality" is not supported by model "${input.model}".`,
        },
        { status: 400 }
      );
    }
    if (
      modelSpec.supportedQualities &&
      modelSpec.supportedQualities.length > 0 &&
      !modelSpec.supportedQualities.includes(input.quality)
    ) {
      return NextResponse.json(
        {
          error: `Quality "${input.quality}" is not supported by "${input.model}". Allowed: ${modelSpec.supportedQualities.join(', ')}.`,
        },
        { status: 400 }
      );
    }
  }

  const shouldEnhance = Boolean(input.enhance && !input.promptEditedManually);
  const enhancerModel =
    process.env.OPENROUTER_ENHANCER_MODEL?.trim() || 'openai/gpt-4o-mini';
  if (shouldEnhance && !isEnhancerModelAllowed(enhancerModel)) {
    return NextResponse.json(
      {
        error: `Enhancer model "${enhancerModel}" is not allowed on this server.`,
      },
      { status: 403 }
    );
  }

  const estimatedRequestUsd = estimateImageRequestCostUsd({
    modelId: input.model,
    modelSpec,
    variations: input.variations,
    includeEnhance: shouldEnhance,
  });

  const authz = await authorizeSpend(estimatedRequestUsd);
  if (!authz.allowed) {
    return NextResponse.json({ error: authz.error }, { status: authz.status });
  }

  let promptUsed = input.prompt;
  let wasEnhanced = false;
  let enhanceSpendUsd = 0;
  if (shouldEnhance) {
    const enhanced = await enhancePromptWithUsage(input.prompt, enhancerModel);
    if (enhanced) {
      promptUsed = enhanced.prompt;
      wasEnhanced = true;
      enhanceSpendUsd = enhanced.cost ?? ENHANCE_ESTIMATE_USD;
    }
  }

  const incomingRefs =
    input.inputReferences && input.inputReferences.length > 0
      ? input.inputReferences
      : input.inputReference
        ? [input.inputReference]
        : [];

  const safeReferences =
    modelSpec?.supportsReference && incomingRefs.length > 0
      ? incomingRefs.slice(0, Math.min(4, Math.max(1, modelSpec.maxReferences)))
      : undefined;

  const baseSeed =
    input.baseSeed ?? Math.floor(100_000 + Math.random() * 899_999_000);

  const tasks = Array.from({ length: input.variations }, (_, index) => {
    const seed = (baseSeed + index * 7919) % 2_147_483_647;
    return generateSingleImage({
      model: input.model,
      prompt: promptUsed,
      aspectRatio: input.aspectRatio,
      resolution: input.resolution,
      quality: input.quality,
      background: input.background,
      seed,
      outputFormat: input.outputFormat,
      inputReferences: safeReferences,
      rgbColors: input.rgbColors,
      backgroundRgbColor: input.backgroundRgbColor,
    });
  });

  const settled = await Promise.allSettled(tasks);

  const images: Array<{
    index: number;
    dataUrl: string;
    mediaType: string;
    seed?: number;
    cost: number | null;
    durationMs: number;
    degraded: string[];
  }> = [];

  const errors: Array<{
    index: number;
    status: number;
    message: string;
    isModelUnavailable: boolean;
  }> = [];

  settled.forEach((outcome, index) => {
    if (outcome.status === 'fulfilled') {
      const r = outcome.value;
      images.push({
        index,
        dataUrl: `data:${r.media_type};base64,${r.b64_json}`,
        mediaType: r.media_type,
        seed: r.seed,
        cost: r.cost,
        durationMs: r.durationMs,
        degraded: r.degraded,
      });
    } else {
      const err = outcome.reason;
      if (err instanceof OpenRouterApiError) {
        errors.push({
          index,
          status: err.status,
          message: err.friendlyMessage,
          isModelUnavailable: err.isModelUnavailable,
        });
      } else {
        errors.push({
          index,
          status: 502,
          message: 'Generation failed on provider side and was not billed.',
          isModelUnavailable: false,
        });
      }
    }
  });

  if (images.length === 0) {
    if (enhanceSpendUsd > 0) {
      await recordSpend(enhanceSpendUsd);
    }
    const primary = errors[0] ?? {
      status: 502,
      message: 'Generation failed. Please try again.',
      isModelUnavailable: false,
    };
    return NextResponse.json(
      {
        error: primary.message,
        isModelUnavailable: primary.isModelUnavailable,
        errors,
      },
      { status: primary.status }
    );
  }

  const hasReportedCost = images.some((img) => typeof img.cost === 'number');
  const reportedTotal = images.reduce(
    (sum, img) => sum + (typeof img.cost === 'number' ? img.cost : 0),
    0
  );
  const isPaidModel =
    (modelSpec?.tier ?? (input.model.endsWith(':free') ? 'free' : 'paid')) === 'paid';
  const fallbackUnit =
    modelSpec?.priceUnit === 'image' && typeof modelSpec.priceUsd === 'number'
      ? modelSpec.priceUsd
      : isPaidModel
        ? 0.05
        : 0;
  const totalCost = hasReportedCost
    ? reportedTotal
    : images.length * fallbackUnit;

  await recordSpend(totalCost + enhanceSpendUsd);

  return NextResponse.json({
    promptUsed,
    enhanced: wasEnhanced,
    modelTier: modelSpec?.tier ?? (input.model.endsWith(':free') ? 'free' : 'paid'),
    actualCost: hasReportedCost ? reportedTotal : null,
    totalCost,
    totalDurationMs: Date.now() - startedAt,
    degraded: Array.from(new Set(images.flatMap((img) => img.degraded))),
    images,
    errors,
  });
}
