import {
  DEFAULT_FREE_MODEL_ID,
  RECOMMENDED_PRODUCT_MODEL_IDS,
  type NormalizedImageModel,
} from './models';

export interface BudgetStore {
  getDailySpendUsd(dateKey: string): Promise<number>;
  addDailySpendUsd(dateKey: string, amountUsd: number): Promise<number>;
}

const DAILY_SPEND_TTL_SECONDS = 48 * 60 * 60; // 48 hours

class InMemoryBudgetStore implements BudgetStore {
  private readonly totals = new Map<string, number>();

  async getDailySpendUsd(dateKey: string): Promise<number> {
    return this.totals.get(dateKey) ?? 0;
  }

  async addDailySpendUsd(dateKey: string, amountUsd: number): Promise<number> {
    if (!Number.isFinite(amountUsd) || amountUsd <= 0) {
      return this.getDailySpendUsd(dateKey);
    }
    const next = (this.totals.get(dateKey) ?? 0) + amountUsd;
    this.totals.set(dateKey, next);

    // Keep map bounded to recent dates
    if (this.totals.size > 14) {
      const oldestKey = this.totals.keys().next().value;
      if (oldestKey && oldestKey !== dateKey) {
        this.totals.delete(oldestKey);
      }
    }
    return next;
  }
}

class UpstashRedisBudgetStore implements BudgetStore {
  private readonly baseUrl: string;
  private readonly token: string;

  constructor(baseUrl: string, token: string) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.token = token;
  }

  private keyFor(dateKey: string): string {
    return `packshot:daily-spend:${dateKey}`;
  }

  async getDailySpendUsd(dateKey: string): Promise<number> {
    const key = encodeURIComponent(this.keyFor(dateKey));
    const res = await fetch(`${this.baseUrl}/get/${key}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${this.token}`,
      },
      cache: 'no-store',
    });
    if (!res.ok) {
      throw new Error(`Upstash Redis GET failed (${res.status})`);
    }
    const data = (await res.json()) as { result?: string | number | null };
    const parsed = Number(data?.result ?? 0);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  async addDailySpendUsd(dateKey: string, amountUsd: number): Promise<number> {
    if (!Number.isFinite(amountUsd) || amountUsd <= 0) {
      return this.getDailySpendUsd(dateKey);
    }
    const key = this.keyFor(dateKey);
    const res = await fetch(`${this.baseUrl}/pipeline`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify([
        ['INCRBYFLOAT', key, amountUsd.toFixed(6)],
        ['EXPIRE', key, DAILY_SPEND_TTL_SECONDS],
      ]),
      cache: 'no-store',
    });
    if (!res.ok) {
      throw new Error(`Upstash Redis pipeline failed (${res.status})`);
    }
    const data = (await res.json()) as Array<{ result?: string | number | null }>;
    const parsed = Number(data?.[0]?.result ?? 0);
    return Number.isFinite(parsed) ? parsed : 0;
  }
}

const memoryStore = new InMemoryBudgetStore();
let cachedUpstash: { url: string; token: string; store: UpstashRedisBudgetStore } | null = null;

export function getBudgetStore(): BudgetStore {
  const url = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim() || '';

  if (url) {
    if (
      !cachedUpstash ||
      cachedUpstash.url !== url ||
      cachedUpstash.token !== token
    ) {
      cachedUpstash = {
        url,
        token,
        store: new UpstashRedisBudgetStore(url, token),
      };
    }
    return cachedUpstash.store;
  }

  return memoryStore;
}

export function getUtcDateKey(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export function getMaxRequestUsd(): number {
  const raw = process.env.MAX_REQUEST_USD?.trim();
  if (!raw) return 0.5;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0.5;
}

export function getMaxDailyUsd(): number {
  const raw = process.env.MAX_DAILY_USD?.trim();
  if (!raw) return 5.0;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 5.0;
}

export function getDefaultAllowedModels(): string[] {
  return [DEFAULT_FREE_MODEL_ID, ...RECOMMENDED_PRODUCT_MODEL_IDS];
}

export function getAllowedImageModels(): Set<string> | '*' {
  const raw = process.env.ALLOWED_MODELS?.trim();
  if (!raw) {
    return new Set(getDefaultAllowedModels());
  }
  if (raw === '*') return '*';
  const ids = raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (ids.length === 0) {
    return new Set(getDefaultAllowedModels());
  }
  return new Set(ids);
}

export function isImageModelAllowed(modelId: string): boolean {
  const allowed = getAllowedImageModels();
  if (allowed === '*') return true;
  return allowed.has(modelId);
}

export function isEnhancerModelAllowed(modelId: string): boolean {
  const raw = process.env.ALLOWED_ENHANCE_MODELS?.trim();
  if (!raw) {
    const configured =
      process.env.OPENROUTER_ENHANCER_MODEL?.trim() || 'openai/gpt-4o-mini';
    return modelId === configured || modelId === 'openai/gpt-4o-mini';
  }
  if (raw === '*') return true;
  const allowed = new Set(
    raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
  );
  return allowed.has(modelId);
}

const UNKNOWN_PAID_ESTIMATE_PER_IMAGE_USD = 0.05;
export const ENHANCE_ESTIMATE_USD = 0.001;

export function estimateImageRequestCostUsd(options: {
  modelId: string;
  modelSpec?: NormalizedImageModel;
  variations: number;
  includeEnhance?: boolean;
}): number {
  const { modelId, modelSpec, variations, includeEnhance } = options;
  const count = Math.max(1, variations);
  const enhanceCost = includeEnhance ? ENHANCE_ESTIMATE_USD : 0;

  if (modelSpec?.tier === 'free' || modelId.endsWith(':free')) {
    return enhanceCost;
  }

  const unitCost =
    modelSpec && typeof modelSpec.priceUsd === 'number' && Number.isFinite(modelSpec.priceUsd)
      ? Math.max(0, modelSpec.priceUsd)
      : UNKNOWN_PAID_ESTIMATE_PER_IMAGE_USD;

  return unitCost * count + enhanceCost;
}

export type SpendAuthorizationResult =
  | {
      allowed: true;
      currentDailyUsd: number;
      maxDailyUsd: number;
      maxRequestUsd: number;
    }
  | {
      allowed: false;
      status: 402;
      error: string;
    };

export async function authorizeSpend(
  estimatedCostUsd: number
): Promise<SpendAuthorizationResult> {
  const maxRequestUsd = getMaxRequestUsd();
  const maxDailyUsd = getMaxDailyUsd();

  if (estimatedCostUsd > maxRequestUsd) {
    return {
      allowed: false,
      status: 402,
      error: `Request estimated cost ($${estimatedCostUsd.toFixed(4)}) exceeds MAX_REQUEST_USD limit ($${maxRequestUsd.toFixed(2)}).`,
    };
  }

  const store = getBudgetStore();
  let currentDailyUsd = 0;
  try {
    currentDailyUsd = await store.getDailySpendUsd(getUtcDateKey());
  } catch (err) {
    console.error('[budget] Failed reading daily spend store:', err);
    return {
      allowed: false,
      status: 402,
      error: 'Daily spend budget store is temporarily unavailable. Refusing paid generation for safety.',
    };
  }

  if (estimatedCostUsd > 0 && currentDailyUsd + estimatedCostUsd > maxDailyUsd) {
    return {
      allowed: false,
      status: 402,
      error: `Daily spend limit reached ($${currentDailyUsd.toFixed(2)} used of $${maxDailyUsd.toFixed(2)} MAX_DAILY_USD).`,
    };
  }

  return {
    allowed: true,
    currentDailyUsd,
    maxDailyUsd,
    maxRequestUsd,
  };
}

export async function recordSpend(amountUsd: number): Promise<number> {
  if (!Number.isFinite(amountUsd) || amountUsd <= 0) {
    return 0;
  }
  const store = getBudgetStore();
  try {
    return await store.addDailySpendUsd(getUtcDateKey(), amountUsd);
  } catch (err) {
    console.error('[budget] Failed recording daily spend:', err);
    return 0;
  }
}
