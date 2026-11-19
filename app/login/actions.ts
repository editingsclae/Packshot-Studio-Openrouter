'use server';

import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import {
  AUTH_COOKIE_NAME,
  SESSION_TTL_SECONDS,
  signSessionToken,
  verifyPasswordConstantTime,
} from '@/lib/auth';

export interface LoginActionState {
  error?: string;
}

function sanitizeNextPath(raw: FormDataEntryValue | null): string {
  const val = typeof raw === 'string' ? raw.trim() : '/';
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

  if (!password) {
    return { error: 'Enter the studio password.' };
  }

  const valid = await verifyPasswordConstantTime(password, expected);
  if (!valid) {
    return { error: 'Invalid password. Please try again.' };
  }

  const token = await signSessionToken(expected);
  const reqHeaders = await headers();
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
