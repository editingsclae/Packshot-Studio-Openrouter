import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  authorizeSpend,
  ENHANCE_ESTIMATE_USD,
  isEnhancerModelAllowed,
  recordSpend,
} from '@/lib/budget';
import { enhancePromptWithUsage } from '@/lib/openrouter';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const EnhanceSchema = z.object({
  prompt: z
    .string()
    .trim()
    .min(10, 'Prompt is too short.')
    .max(2000, 'Prompt exceeds 2000 characters.'),
});

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const limit = checkRateLimit(ip, { maxRequests: 30, windowMs: 60_000 });
  if (!limit.allowed) {
    return NextResponse.json(
      { error: 'Rate limit exceeded. Try again shortly.' },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSec) } }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON request body.' }, { status: 400 });
  }

  const parsed = EnhanceSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || 'Invalid prompt input.' },
      { status: 400 }
    );
  }

  const enhancerModel =
    process.env.OPENROUTER_ENHANCER_MODEL?.trim() || 'openai/gpt-4o-mini';
  if (!isEnhancerModelAllowed(enhancerModel)) {
    return NextResponse.json(
      { error: `Enhancer model "${enhancerModel}" is not allowed on this server.` },
      { status: 403 }
    );
  }

  const authz = await authorizeSpend(ENHANCE_ESTIMATE_USD);
  if (!authz.allowed) {
    return NextResponse.json({ error: authz.error }, { status: authz.status });
  }

  const deterministicPrompt = parsed.data.prompt;
  const enhanced = await enhancePromptWithUsage(deterministicPrompt, enhancerModel);

  if (!enhanced) {
    return NextResponse.json({
      prompt: deterministicPrompt,
      enhanced: false,
    });
  }

  await recordSpend(enhanced.cost ?? ENHANCE_ESTIMATE_USD);

  return NextResponse.json({
    prompt: enhanced.prompt,
    enhanced: true,
  });
}
