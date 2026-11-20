import type { NextRequest } from 'next/server';

interface RateBucket {
  timestamps: number[];
  windowMs: number;
  blockedUntil?: number;
}

export interface RateLimitOptions {
  maxRequests: number;
  windowMs: number;
  blockDurationMs?: number;
}

const MAX_RATE_LIMIT_BUCKETS = 5_000;
const buckets = new Map<string, RateBucket>();

function isProxyTrusted(): boolean {
  return (
    process.env.TRUSTED_PROXY?.trim().toLowerCase() === 'true' ||
    Boolean(process.env.VERCEL)
  );
}

export function getClientIpFromHeaders(headers: Pick<Headers, 'get'>): string {
  if (!isProxyTrusted()) {
    return 'direct';
  }
  const forwarded = headers.get('x-forwarded-for');
  if (forwarded) {
    const entries = forwarded
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean);
    if (entries.length > 0) {
      return entries[entries.length - 1];
    }
  }
  return headers.get('x-real-ip')?.trim() || 'direct';
}

export function getClientIp(req: NextRequest): string {
  return getClientIpFromHeaders(req.headers);
}

function pruneBuckets(now: number, reserveForKey?: string): void {
  for (const [k, bucket] of buckets.entries()) {
    const cutoff = now - bucket.windowMs;
    bucket.timestamps = bucket.timestamps.filter((ts) => ts > cutoff);
    const blockExpired = !bucket.blockedUntil || bucket.blockedUntil <= now;
    if (bucket.blockedUntil && bucket.blockedUntil <= now) {
      bucket.blockedUntil = undefined;
    }
    if (bucket.timestamps.length === 0 && blockExpired) {
      buckets.delete(k);
    }
  }

  while (
    buckets.size >= MAX_RATE_LIMIT_BUCKETS &&
    (!reserveForKey || !buckets.has(reserveForKey))
  ) {
    const oldestKey = buckets.keys().next().value;
    if (oldestKey === undefined) break;
    buckets.delete(oldestKey);
  }
}

export function getRateLimitStatus(
  key: string,
  options: RateLimitOptions = { maxRequests: 24, windowMs: 60_000 }
): { allowed: boolean; retryAfterSec: number } {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket) {
    return { allowed: true, retryAfterSec: 0 };
  }

  if (bucket.blockedUntil !== undefined) {
    if (bucket.blockedUntil > now) {
      const retryAfterSec = Math.max(
        1,
        Math.ceil((bucket.blockedUntil - now) / 1000)
      );
      return { allowed: false, retryAfterSec };
    }
    // Lockout expired — reset bucket so logins can resume cleanly
    buckets.delete(key);
    return { allowed: true, retryAfterSec: 0 };
  }

  const cutoff = now - options.windowMs;
  bucket.timestamps = bucket.timestamps.filter((ts) => ts > cutoff);
  if (bucket.timestamps.length === 0) {
    buckets.delete(key);
    return { allowed: true, retryAfterSec: 0 };
  }

  if (bucket.timestamps.length >= options.maxRequests) {
    const oldest = bucket.timestamps[0] ?? now;
    const retryAfterSec = Math.max(
      1,
      Math.ceil((oldest + options.windowMs - now) / 1000)
    );
    return { allowed: false, retryAfterSec };
  }

  return { allowed: true, retryAfterSec: 0 };
}

export function checkRateLimit(
  ip: string,
  options: RateLimitOptions = { maxRequests: 24, windowMs: 60_000 }
): { allowed: boolean; retryAfterSec: number } {
  const now = Date.now();
  pruneBuckets(now, ip);

  const existing = buckets.get(ip);
  if (existing?.blockedUntil !== undefined) {
    if (existing.blockedUntil > now) {
      const retryAfterSec = Math.max(
        1,
        Math.ceil((existing.blockedUntil - now) / 1000)
      );
      return { allowed: false, retryAfterSec };
    }
    existing.blockedUntil = undefined;
    existing.timestamps = [];
  }

  const cutoff = now - options.windowMs;
  const bucket: RateBucket = existing ?? {
    timestamps: [],
    windowMs: options.windowMs,
  };
  bucket.windowMs = options.windowMs;
  bucket.timestamps = bucket.timestamps.filter((ts) => ts > cutoff);

  if (bucket.timestamps.length >= options.maxRequests) {
    if (options.blockDurationMs && options.blockDurationMs > 0) {
      bucket.blockedUntil = now + options.blockDurationMs;
      bucket.timestamps = [];
      buckets.delete(ip);
      buckets.set(ip, bucket);
      return {
        allowed: false,
        retryAfterSec: Math.max(1, Math.ceil(options.blockDurationMs / 1000)),
      };
    }

    const oldest = bucket.timestamps[0] ?? now;
    const retryAfterSec = Math.max(
      1,
      Math.ceil((oldest + options.windowMs - now) / 1000)
    );
    buckets.delete(ip);
    buckets.set(ip, bucket);
    return { allowed: false, retryAfterSec };
  }

  bucket.timestamps.push(now);
  // Refresh insertion order for LRU eviction if needed
  buckets.delete(ip);
  buckets.set(ip, bucket);
  return { allowed: true, retryAfterSec: 0 };
}


