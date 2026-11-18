import { NextRequest, NextResponse } from 'next/server';
import { MODEL_CATALOG } from '@/lib/models';
import { fetchAvailableImageModels, getSupportedParameters } from '@/lib/openrouter';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';

export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const ip = getClientIp(req);
  const limit = checkRateLimit(ip, { maxRequests: 60, windowMs: 60_000 });
  if (!limit.allowed) {
    return NextResponse.json(
      { error: 'Too many requests. Please wait a moment.' },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSec) } }
    );
  }

  const liveModels = await fetchAvailableImageModels();
  const liveMap = new Map(liveModels.map((m) => [m.id, m]));

  // Resolve cached supported_parameters for each curated catalog model in parallel
  const enriched = await Promise.all(
    MODEL_CATALOG.map(async (spec) => {
      const supportedParameters = await getSupportedParameters(spec.id);
      const liveMatch = liveMap.get(spec.id) || liveMap.get(spec.id.split(':')[0]);
      return {
        ...spec,
        supportedParameters,
        isAvailable: liveModels.length > 0 ? Boolean(liveMatch) : true,
      };
    })
  );

  return NextResponse.json({
    models: enriched,
    hasApiKey: Boolean(process.env.OPENROUTER_API_KEY),
    enhancerModel: process.env.OPENROUTER_ENHANCER_MODEL || 'openai/gpt-4o-mini',
  });
}
