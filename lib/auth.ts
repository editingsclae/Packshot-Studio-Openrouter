export const AUTH_COOKIE_NAME = 'packshot_auth';
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

const encoder = new TextEncoder();

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function fromBase64Url(value: string): Uint8Array | null {
  try {
    const padded = value.replace(/-/g, '+').replace(/_/g, '/');
    const padLen = (4 - (padded.length % 4)) % 4;
    const binary = atob(padded + '='.repeat(padLen));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  } catch {
    return null;
  }
}

function constantTimeEqualBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a[i] ^ b[i];
  }
  return diff === 0;
}

async function importHmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(`packshot-studio-session-v1:${secret}`),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
}

export async function verifyPasswordConstantTime(
  candidate: string,
  expected: string
): Promise<boolean> {
  const [candHash, expHash] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(candidate)),
    crypto.subtle.digest('SHA-256', encoder.encode(expected)),
  ]);
  return constantTimeEqualBytes(
    new Uint8Array(candHash),
    new Uint8Array(expHash)
  );
}

export function getSessionSecret(fallbackPassword?: string): string {
  const dedicated = process.env.APP_SESSION_SECRET?.trim();
  if (dedicated) {
    return dedicated;
  }
  return fallbackPassword ?? process.env.APP_PASSWORD ?? '';
}

export async function signSessionToken(
  appPassword?: string,
  ttlSeconds: number = SESSION_TTL_SECONDS
): Promise<string> {
  const secret = getSessionSecret(appPassword);
  if (!secret) {
    throw new Error('Cannot sign session token without APP_SESSION_SECRET or APP_PASSWORD.');
  }
  const expiresAt = Math.floor(Date.now() / 1000) + ttlSeconds;
  const payload = `v1.${expiresAt}`;
  const key = await importHmacKey(secret);
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    encoder.encode(payload)
  );
  return `${payload}.${toBase64Url(new Uint8Array(signature))}`;
}

export async function verifySessionToken(
  token: string | undefined | null,
  appPassword?: string
): Promise<boolean> {
  const secret = getSessionSecret(appPassword);
  if (!token || !secret) return false;
  const parts = token.split('.');
  if (parts.length !== 3) return false;

  const [version, expiresRaw, sigRaw] = parts;
  if (version !== 'v1') return false;

  const expiresAt = Number(expiresRaw);
  if (!Number.isFinite(expiresAt) || expiresAt <= Math.floor(Date.now() / 1000)) {
    return false;
  }

  const providedSig = fromBase64Url(sigRaw);
  if (!providedSig) return false;

  const key = await importHmacKey(secret);
  const expectedSig = new Uint8Array(
    await crypto.subtle.sign('HMAC', key, encoder.encode(`${version}.${expiresRaw}`))
  );

  return constantTimeEqualBytes(providedSig, expectedSig);
}

