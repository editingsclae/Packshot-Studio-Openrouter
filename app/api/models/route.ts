import { NextRequest, NextResponse } from 'next/server';
import { isImageModelAllowed } from '@/lib/budget';
import { discoverNormalizedModels } from '@/lib/openrouter';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';
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

  const bypassCache =
    req.nextUrl.searchParams.get('refresh') === '1' ||
    req.nextUrl.searchParams.get('bypassCache') === '1';

  const result = await discoverNormalizedModels({ bypassCache });
  const annotatedModels = result.models.map((m) => ({
    ...m,
    allowed: isImageModelAllowed(m.id),
  }));

  return NextResponse.json(
    {
      models: annotatedModels,
      source: result.source,
      updatedAt: result.updatedAt,
      ...(result.error ? { error: result.error } : {}),
      failedCount: result.failedCount,
      hasApiKey: Boolean(process.env.OPENROUTER_API_KEY),
      enhancerModel: process.env.OPENROUTER_ENHANCER_MODEL || 'openai/gpt-4o-mini',
    },
    {
      headers: {
        'Cache-Control': 'no-store',
      },
    }
  );
}
