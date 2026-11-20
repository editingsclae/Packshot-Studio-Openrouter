'use server';

import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import {
  AUTH_COOKIE_NAME,
  SESSION_TTL_SECONDS,
  signSessionToken,
  verifyPasswordConstantTime,
} from '@/lib/auth';
import {
  checkRateLimit,
  getClientIpFromHeaders,
  getRateLimitStatus,
} from '@/lib/rate-limit';

export interface LoginActionState {
  error?: string;
}

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

function sanitizeNextPath(raw: FormDataEntryValue | null): string {
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

export async function loginAction(
  _prevState: LoginActionState,
  formData: FormData
): Promise<LoginActionState> {
  const password = String(formData.get('password') ?? '');
  const nextPath = sanitizeNextPath(formData.get('next'));
  const expected = process.env.APP_PASSWORD;

  if (!expected) {
    if (process.env.NODE_ENV === 'production') {
      return {
        error: 'Server misconfigured: APP_PASSWORD is not set.',
      };
    }
    redirect(nextPath);
  }

  const globalPreCheck = getRateLimitStatus(GLOBAL_LOGIN_KEY, GLOBAL_LOGIN_BACKSTOP);
  if (!globalPreCheck.allowed) {
    return {
      error: `Sign-in is temporarily disabled due to too many failed attempts. Please try again in ${formatRetryWait(globalPreCheck.retryAfterSec)}.`,
    };
  }

  const reqHeaders = await headers();
  const ip = getClientIpFromHeaders(reqHeaders);
  const rateKey = `login:${ip}`;

  const preCheck = getRateLimitStatus(rateKey, LOGIN_RATE_LIMIT);
  if (!preCheck.allowed) {
    return {
      error: `Too many failed sign-in attempts. Please try again in ${formatRetryWait(preCheck.retryAfterSec)}.`,
    };
  }

  const valid =
    password.length > 0 && (await verifyPasswordConstantTime(password, expected));
  if (!valid) {
    const afterGlobalFail = checkRateLimit(GLOBAL_LOGIN_KEY, GLOBAL_LOGIN_BACKSTOP);
    const afterFail = checkRateLimit(rateKey, LOGIN_RATE_LIMIT);
    await sleep(FAILED_LOGIN_DELAY_MS);
    if (!afterGlobalFail.allowed) {
      return {
        error: `Sign-in is temporarily disabled due to too many failed attempts. Please try again in ${formatRetryWait(afterGlobalFail.retryAfterSec)}.`,
      };
    }
    if (!afterFail.allowed) {
      return {
        error: `Too many failed sign-in attempts. Please try again in ${formatRetryWait(afterFail.retryAfterSec)}.`,
      };
    }
    return { error: 'Invalid credentials. Please try again.' };
  }

  const token = await signSessionToken(expected);
  const forwardedProto = reqHeaders.get('x-forwarded-proto');
  const isHttps =
    forwardedProto === 'https' ||
    (process.env.APP_URL?.startsWith('https://') ?? false);

  const cookieStore = await cookies();
  cookieStore.set(AUTH_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: isHttps,
    path: '/',
    maxAge: SESSION_TTL_SECONDS,
  });

  redirect(nextPath);
}

