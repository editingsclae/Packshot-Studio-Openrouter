import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { findModelById, OFFLINE_FALLBACK_MODELS } from '@/lib/models';
import {
  discoverNormalizedModels,
  enhancePromptWithAI,
  generateSingleImage,
  OpenRouterApiError,
} from '@/lib/openrouter';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

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
  inputReferences: z.array(z.string().max(12_000_000)).max(10).optional(),
  inputReference: z
    .string()
    .max(12_000_000, 'Reference image payload is too large.')
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

  const { models } = await discoverNormalizedModels();
  const modelSpec =
    findModelById(models, input.model) ??
    findModelById(OFFLINE_FALLBACK_MODELS, input.model);

  let promptUsed = input.prompt;
  let wasEnhanced = false;
  if (input.enhance && !input.promptEditedManually) {
    const enhanced = await enhancePromptWithAI(input.prompt);
    if (enhanced) {
      promptUsed = enhanced;
      wasEnhanced = true;
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
      ? incomingRefs.slice(0, Math.max(1, modelSpec.maxReferences))
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
  const fallbackUnit =
    modelSpec?.priceUnit === 'image' && typeof modelSpec.priceUsd === 'number'
      ? modelSpec.priceUsd
      : 0;
  const totalCost = hasReportedCost
    ? reportedTotal
    : images.length * fallbackUnit;

  return NextResponse.json({
    promptUsed,
    enhanced: wasEnhanced,
    modelTier: modelSpec?.tier ?? (input.model.endsWith(':free') ? 'free' : 'paid'),
    actualCost: hasReportedCost ? reportedTotal : null,
    totalCost,
    totalDurationMs: Date.now() - startedAt,
    images,
    errors,
  });
}
