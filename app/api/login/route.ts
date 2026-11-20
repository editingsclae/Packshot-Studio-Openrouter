import { NextRequest, NextResponse } from 'next/server';
import {
  AUTH_COOKIE_NAME,
  SESSION_TTL_SECONDS,
  signSessionToken,
  verifyPasswordConstantTime,
} from '@/lib/auth';
import {
  checkRateLimit,
  getClientIp,
  getRateLimitStatus,
} from '@/lib/rate-limit';

const LOGIN_RATE_LIMIT = {
  maxRequests: 5,
  windowMs: 10 * 60_000,
};
const GLOBAL_LOGIN_BACKSTOP = {
  maxRequests: 40,
  windowMs: 10 * 60_000,
  blockDurationMs: 5 * 60_000,
};
const GLOBAL_LOGIN_KEY = 'global:login';
const FAILED_LOGIN_DELAY_MS = 600;

function formatRetryWait(seconds: number): string {
  const safeSec = Math.max(1, Math.ceil(seconds));
  if (safeSec < 60) {
    return `${safeSec} second${safeSec === 1 ? '' : 's'}`;
  }
  const mins = Math.floor(safeSec / 60);
  const rem = safeSec % 60;
  if (rem === 0) {
    return `${mins} minute${mins === 1 ? '' : 's'}`;
  }
  return `${mins}m ${rem}s`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function sanitizeNextPath(raw: unknown): string {
  const val = typeof raw === 'string' ? raw.trim() : '/';
  if (!val) return '/';
  // Reject backslashes and ASCII control characters (including CR, LF, NUL, DEL)
  if (val.includes('\\') || /[\u0000-\u001f\u007f]/.test(val)) {
    return '/';
  }
  // Reject any colon before the first slash (e.g. javascript:, data:, http:)
  const firstSlash = val.indexOf('/');
  const firstColon = val.indexOf(':');
  if (firstColon !== -1 && (firstSlash === -1 || firstColon < firstSlash)) {
    return '/';
  }
  if (!val.startsWith('/') || val.startsWith('//') || val.startsWith('/login')) {
    return '/';
  }
  return val;
}

export async function POST(req: NextRequest) {
  let body: { password?: unknown; next?: unknown } = {};
  try {
    body = (await req.json()) as { password?: unknown; next?: unknown };
  } catch {
    return NextResponse.json(
      { error: 'Invalid login request payload.' },
      { status: 400 }
    );
  }

  const password = typeof body.password === 'string' ? body.password : '';
  const nextPath = sanitizeNextPath(body.next);
  const expected = process.env.APP_PASSWORD;

  if (!expected) {
    if (process.env.NODE_ENV === 'production') {
      return NextResponse.json(
        { error: 'Server misconfigured: APP_PASSWORD is not set.' },
        { status: 503 }
      );
    }
    return NextResponse.json({ ok: true, redirectTo: nextPath });
  }

  const globalPreCheck = getRateLimitStatus(GLOBAL_LOGIN_KEY, GLOBAL_LOGIN_BACKSTOP);
  if (!globalPreCheck.allowed) {
    return NextResponse.json(
      {
        error: `Sign-in is temporarily disabled due to too many failed attempts. Please try again in ${formatRetryWait(globalPreCheck.retryAfterSec)}.`,
      },
      { status: 429 }
    );
  }

  const ip = getClientIp(req);
  const rateKey = `login:${ip}`;

  const preCheck = getRateLimitStatus(rateKey, LOGIN_RATE_LIMIT);
  if (!preCheck.allowed) {
    return NextResponse.json(
      {
        error: `Too many failed sign-in attempts. Please try again in ${formatRetryWait(preCheck.retryAfterSec)}.`,
      },
      { status: 429 }
    );
  }

  const valid =
    password.length > 0 && (await verifyPasswordConstantTime(password, expected));
  if (!valid) {
    const afterGlobalFail = checkRateLimit(GLOBAL_LOGIN_KEY, GLOBAL_LOGIN_BACKSTOP);
    const afterFail = checkRateLimit(rateKey, LOGIN_RATE_LIMIT);
    await sleep(FAILED_LOGIN_DELAY_MS);
    if (!afterGlobalFail.allowed) {
      return NextResponse.json(
        {
          error: `Sign-in is temporarily disabled due to too many failed attempts. Please try again in ${formatRetryWait(afterGlobalFail.retryAfterSec)}.`,
        },
        { status: 429 }
      );
    }
    if (!afterFail.allowed) {
      return NextResponse.json(
        {
          error: `Too many failed sign-in attempts. Please try again in ${formatRetryWait(afterFail.retryAfterSec)}.`,
        },
        { status: 429 }
      );
    }
    return NextResponse.json(
      { error: 'Invalid credentials. Please try again.' },
      { status: 401 }
    );
  }

  const token = await signSessionToken(expected);
  const forwardedProto = req.headers.get('x-forwarded-proto');
  const originHeader = req.headers.get('origin');
  const hostHeader =
    req.headers.get('x-forwarded-host') || req.headers.get('host') || '';
  const isLocalhost = /^(localhost|127\.0\.0\.1)(:\d+)?$/i.test(hostHeader);
  const isHttps =
    forwardedProto === 'https' ||
    (originHeader?.startsWith('https://') ?? false) ||
    req.nextUrl.protocol === 'https:' ||
    (!isLocalhost && (process.env.APP_URL?.startsWith('https://') ?? false));

  const res = NextResponse.json({ ok: true, redirectTo: nextPath });
  res.cookies.set(AUTH_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: isHttps ? 'none' : 'lax',
    secure: isHttps,
    path: '/',
    maxAge: SESSION_TTL_SECONDS,
  });

  return res;
}
