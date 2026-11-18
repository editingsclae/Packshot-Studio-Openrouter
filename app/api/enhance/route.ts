import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { enhancePromptWithAI } from '@/lib/openrouter';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';

export const maxDuration = 60;

const EnhanceSchema = z.object({
  prompt: z.string().trim().min(10, 'Prompt is too short.').max(2000, 'Prompt exceeds 2000 characters.'),
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

  const deterministicPrompt = parsed.data.prompt;
  const enhanced = await enhancePromptWithAI(deterministicPrompt);

  if (!enhanced) {
    return NextResponse.json({
      prompt: deterministicPrompt,
      enhanced: false,
    });
  }

  return NextResponse.json({
    prompt: enhanced,
    enhanced: true,
  });
}
