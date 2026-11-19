export type AspectRatio = '1:1' | '4:5' | '3:4' | '16:9' | '9:16';

export const ASPECT_RATIOS: {
  value: AspectRatio;
  label: string;
  hint: string;
}[] = [
  { value: '1:1', label: '1:1', hint: 'Marketplace square' },
  { value: '4:5', label: '4:5', hint: 'Feed & PDP portrait' },
  { value: '3:4', label: '3:4', hint: 'Editorial card' },
  { value: '16:9', label: '16:9', hint: 'Banner & hero' },
  { value: '9:16', label: '9:16', hint: 'Story & mobile' },
];

export type ModelTier = 'free' | 'paid';
export type PriceUnit = 'image' | 'megapixel' | 'token' | null;
export type DiscoverySource = 'live' | 'cache' | 'offline';

export interface NormalizedImageModel {
  id: string;
  name: string;
  provider: string;
  providerLabel: string;
  description: string;
  tier: ModelTier;
  priceUsd: number | null;
  priceUnit: PriceUnit;
  priceUnverified?: boolean;
  supportsReference: boolean;
  requiresReference: boolean;
  maxReferences: number;
  supportedParams: string[];
  nMax: number;
  supportsStreaming: boolean;
  supportsSvg: boolean;
  supportedAspectRatios?: string[];
  supportedResolutions?: string[];
  supportedQualities?: string[];
  supportedBackgrounds?: string[];
  supportedOutputFormats?: string[];
  badge?: string;
}

export const DEFAULT_FREE_MODEL_ID = 'recraft/recraft-v4.1-flash-v2:free';

export const RECOMMENDED_PRODUCT_MODEL_IDS: readonly string[] = [
  'recraft/recraft-v4.1-utility',
  'google/gemini-nano-banana-2.1',
  'openai/gpt-image-2',
  'bytedance-seed/seedream-5-0-pro',
  'black-forest-labs/flux-3-image',
];

export function isRecommendedProductModel(modelId: string): boolean {
  return RECOMMENDED_PRODUCT_MODEL_IDS.includes(modelId);
}

export interface ModelCostSummary {
  count: number;
  averageActualCost: number;
  lastActualCost: number;
  maxActualCost: number;
}

export interface BatchEstimateResult {
  label: string;
  perImageNote: string | null;
  exactTotalUsd: number | null;
  isUsageOrUnknown: boolean;
  needsFirstRunConfirm: boolean;
}

const PROVIDER_DISPLAY_MAP: Record<string, string> = {
  openai: 'OpenAI',
  google: 'Google',
  'black-forest-labs': 'Black Forest Labs',
  'bytedance-seed': 'ByteDance Seed',
  bytedance: 'ByteDance Seed',
  qwen: 'Qwen',
  krea: 'Krea',
  sourceful: 'Sourceful',
  recraft: 'Recraft',
  microsoft: 'Microsoft AI',
  minimax: 'MiniMax',
  tencent: 'Tencent',
  'x-ai': 'xAI',
  meta: 'Meta',
  'meta-llama': 'Meta',
};

const PROVIDER_ORDER = [
  'OpenAI',
  'Google',
  'Black Forest Labs',
  'ByteDance Seed',
  'Qwen',
  'Krea',
  'Sourceful',
  'Recraft',
  'Microsoft AI',
  'MiniMax',
  'Tencent',
  'xAI',
  'Meta',
];

export function formatProviderLabel(prefix: string): string {
  const lower = prefix.toLowerCase();
  if (PROVIDER_DISPLAY_MAP[lower]) {
    return PROVIDER_DISPLAY_MAP[lower];
  }
  return prefix
    .split(/[-_]/g)
    .map((part) => (part ? part[0].toUpperCase() + part.slice(1) : ''))
    .join(' ');
}

/**
 * Hardcoded fallback list used ONLY when OpenRouter /api/v1/images/models fails
 * completely and no stale cache exists.
 */
export const OFFLINE_FALLBACK_MODELS: NormalizedImageModel[] = [
  {
    id: 'recraft/recraft-v4.1-flash-v2:free',
    name: 'Recraft v4.1 Flash v2 (Free)',
    provider: 'recraft',
    providerLabel: 'Recraft',
    description: 'Fast text-to-image drafts and marketplace packshots at zero cost.',
    tier: 'free',
    priceUsd: 0,
    priceUnit: 'image',
    supportsReference: false,
    requiresReference: false,
    maxReferences: 0,
    supportedParams: ['aspect_ratio', 'n'],
    nMax: 6,
    supportsStreaming: false,
    supportsSvg: false,
    supportedAspectRatios: ['1:1', '4:5', '3:4', '16:9', '9:16'],
    badge: 'Free tier ends Nov 28, 2026',
  },
  {
    id: 'recraft/recraft-v4.1-flash',
    name: 'Recraft v4.1 Flash',
    provider: 'recraft',
    providerLabel: 'Recraft',
    description: 'Fast commercial text-to-image without free-tier rate limits.',
    tier: 'paid',
    priceUsd: 0.007,
    priceUnit: 'image',
    supportsReference: false,
    requiresReference: false,
    maxReferences: 0,
    supportedParams: ['aspect_ratio', 'n'],
    nMax: 6,
    supportsStreaming: false,
    supportsSvg: false,
    supportedAspectRatios: ['1:1', '4:5', '3:4', '16:9', '9:16'],
  },
  {
    id: 'recraft/recraft-v4.1-utility',
    name: 'Recraft v4.1 Utility',
    provider: 'recraft',
    providerLabel: 'Recraft',
    description: 'Accepts 1 reference image. Flat lighting, front-facing, controlled product scenes.',
    tier: 'paid',
    priceUsd: 0.035,
    priceUnit: 'image',
    supportsReference: true,
    requiresReference: false,
    maxReferences: 1,
    supportedParams: ['aspect_ratio', 'n', 'input_references'],
    nMax: 6,
    supportsStreaming: false,
    supportsSvg: false,
    supportedAspectRatios: ['1:1', '4:5', '3:4', '16:9', '9:16'],
  },
  {
    id: 'recraft/recraft-v4.1',
    name: 'Recraft v4.1',
    provider: 'recraft',
    providerLabel: 'Recraft',
    description: 'Aesthetic rendering suited for studio hero and lifestyle shots.',
    tier: 'paid',
    priceUsd: 0.035,
    priceUnit: 'image',
    supportsReference: false,
    requiresReference: false,
    maxReferences: 0,
    supportedParams: ['aspect_ratio', 'n'],
    nMax: 6,
    supportsStreaming: false,
    supportsSvg: false,
    supportedAspectRatios: ['1:1', '4:5', '3:4', '16:9', '9:16'],
  },
  {
    id: 'recraft/recraft-v4.1-utility-pro',
    name: 'Recraft v4.1 Utility Pro',
    provider: 'recraft',
    providerLabel: 'Recraft',
    description: 'High-resolution ~2K utility model with single reference image support.',
    tier: 'paid',
    priceUsd: 0.21,
    priceUnit: 'image',
    supportsReference: true,
    requiresReference: false,
    maxReferences: 1,
    supportedParams: ['aspect_ratio', 'resolution', 'n', 'input_references'],
    nMax: 6,
    supportsStreaming: false,
    supportsSvg: false,
    supportedAspectRatios: ['1:1', '4:5', '3:4', '16:9', '9:16'],
  },
  {
    id: 'recraft/recraft-v4.1-pro',
    name: 'Recraft v4.1 Pro',
    provider: 'recraft',
    providerLabel: 'Recraft',
    description: 'Flagship ~2K aesthetic model for campaign hero and lifestyle compositions.',
    tier: 'paid',
    priceUsd: 0.21,
    priceUnit: 'image',
    supportsReference: false,
    requiresReference: false,
    maxReferences: 0,
    supportedParams: ['aspect_ratio', 'resolution', 'n'],
    nMax: 6,
    supportsStreaming: false,
    supportsSvg: false,
    supportedAspectRatios: ['1:1', '4:5', '3:4', '16:9', '9:16'],
  },
];

export function isUsageOrUnknownPriced(model: NormalizedImageModel): boolean {
  return model.tier === 'paid' && (model.priceUnit !== 'image' || model.priceUsd === null);
}

export function formatUsdCompact(amount: number): string {
  if (!Number.isFinite(amount) || amount <= 0) return '$0.00';
  if (amount >= 0.01) return `$${amount.toFixed(2)}`;
  if (amount >= 0.001) return `$${amount.toFixed(3)}`;
  return `$${amount.toFixed(4)}`;
}

export function formatModelPrice(
  model: NormalizedImageModel,
  costStats?: ModelCostSummary | null
): string {
  if (model.tier === 'free') {
    return 'Free';
  }
  if (model.priceUnit !== 'image' || model.priceUsd === null) {
    if (costStats && costStats.count > 0) {
      return `~${formatUsdCompact(costStats.averageActualCost)} avg`;
    }
    if (model.priceUsd === null) {
      return 'Price unknown';
    }
    return 'usage-based';
  }
  const formatted =
    model.priceUsd >= 0.01
      ? `$${model.priceUsd.toFixed(3).replace(/0$/, '')}`
      : `$${model.priceUsd.toFixed(4).replace(/0+$/, '')}`;
  return `${formatted} / image`;
}

export function formatBatchEstimate(
  model: NormalizedImageModel,
  variations: number,
  costStats?: ModelCostSummary | null
): BatchEstimateResult {
  if (model.tier === 'free') {
    return {
      label: 'Free',
      perImageNote: null,
      exactTotalUsd: 0,
      isUsageOrUnknown: false,
      needsFirstRunConfirm: false,
    };
  }

  if (model.priceUnit !== 'image' || model.priceUsd === null) {
    if (costStats && costStats.count > 0) {
      const perImage = costStats.averageActualCost;
      const total = perImage * variations;
      const runWord = costStats.count === 1 ? 'run' : 'runs';
      return {
        label: `~${formatUsdCompact(total)}`,
        perImageNote: `~${formatUsdCompact(perImage)} / image (avg of ${costStats.count} ${runWord})`,
        exactTotalUsd: total,
        isUsageOrUnknown: true,
        needsFirstRunConfirm: false,
      };
    }

    return {
      label: 'Cost unknown until first run',
      perImageNote: null,
      exactTotalUsd: null,
      isUsageOrUnknown: true,
      needsFirstRunConfirm: true,
    };
  }

  const total = model.priceUsd * variations;
  return {
    label: `~$${total.toFixed(3)}`,
    perImageNote: null,
    exactTotalUsd: total,
    isUsageOrUnknown: false,
    needsFirstRunConfirm: false,
  };
}

export function getDefaultQualityForModel(
  model?: NormalizedImageModel | null
): string {
  if (!model || !model.supportedParams.includes('quality')) {
    return 'auto';
  }
  const opts = model.supportedQualities;
  if (!opts || opts.length === 0) {
    return 'medium';
  }
  const mediumMatch = opts.find((q) => q.toLowerCase() === 'medium');
  if (mediumMatch) {
    return mediumMatch;
  }
  const nonHigh = opts.find((q) => q.toLowerCase() !== 'high');
  return nonHigh ?? 'auto';
}

export function sortModelsByPriceAsc(models: NormalizedImageModel[]): NormalizedImageModel[] {
  return [...models].sort((a, b) => {
    const pa = a.priceUsd ?? Number.POSITIVE_INFINITY;
    const pb = b.priceUsd ?? Number.POSITIVE_INFINITY;
    if (pa !== pb) return pa - pb;
    return a.name.localeCompare(b.name);
  });
}

export function groupModelsByProvider(
  models: NormalizedImageModel[]
): { providerLabel: string; models: NormalizedImageModel[] }[] {
  const map = new Map<string, NormalizedImageModel[]>();
  for (const m of models) {
    const label = m.providerLabel || formatProviderLabel(m.provider);
    const list = map.get(label) ?? [];
    list.push(m);
    map.set(label, list);
  }

  return Array.from(map.entries())
    .map(([providerLabel, list]) => ({
      providerLabel,
      models: sortModelsByPriceAsc(list),
    }))
    .sort((a, b) => {
      const idxA = PROVIDER_ORDER.indexOf(a.providerLabel);
      const idxB = PROVIDER_ORDER.indexOf(b.providerLabel);
      if (idxA !== -1 && idxB !== -1) return idxA - idxB;
      if (idxA !== -1) return -1;
      if (idxB !== -1) return 1;
      return a.providerLabel.localeCompare(b.providerLabel);
    });
}

/**
 * Picks the cheapest paid model with an exact per-image price first,
 * falling back to any paid model only if no exact per-image model exists.
 */
export function getCheapestPaidModel(
  models: NormalizedImageModel[],
  inputMode: 'text' | 'photo' = 'text'
): NormalizedImageModel | null {
  const eligiblePaid = models.filter(
    (m) => m.tier === 'paid' && (inputMode === 'photo' || !m.requiresReference)
  );
  const exactPerImage = sortModelsByPriceAsc(
    eligiblePaid.filter((m) => m.priceUnit === 'image' && m.priceUsd !== null)
  );
  if (exactPerImage[0]) return exactPerImage[0];

  const anyPaid = sortModelsByPriceAsc(eligiblePaid);
  if (anyPaid[0]) return anyPaid[0];

  const allPaid = sortModelsByPriceAsc(models.filter((m) => m.tier === 'paid'));
  return allPaid[0] ?? null;
}

/**
 * Default selection priority:
 * 1. Free Recraft model (when tier allows free)
 * 2. recraft/recraft-v4.1-utility
 * 3. Cheapest paid model with an exact per-image price
 */
export function pickPreferredDefaultModel(
  models: NormalizedImageModel[],
  options?: { tier?: ModelTier; inputMode?: 'text' | 'photo' }
): NormalizedImageModel | null {
  const tier = options?.tier;
  const inputMode = options?.inputMode ?? 'text';
  const eligible = models.filter(
    (m) => inputMode === 'photo' || !m.requiresReference
  );

  if (tier !== 'paid') {
    const freeRecraft =
      eligible.find(
        (m) => m.tier === 'free' && m.id === DEFAULT_FREE_MODEL_ID
      ) ??
      eligible.find((m) => m.tier === 'free' && m.provider === 'recraft');
    if (freeRecraft) return freeRecraft;

    if (tier === 'free') {
      const anyFree = eligible.find((m) => m.tier === 'free');
      if (anyFree) return anyFree;
    }
  }

  const utility = eligible.find(
    (m) => m.id === 'recraft/recraft-v4.1-utility'
  );
  if (utility) return utility;

  return getCheapestPaidModel(models, inputMode) ?? eligible[0] ?? models[0] ?? null;
}

/**
 * Picks a model when switching Free <-> Paid tiers:
 * - Paid: first matching model in RECOMMENDED_PRODUCT_MODEL_IDS, else cheapest with an exact per-image price.
 * - Free: free Recraft model first, else first available free model.
 */
export function pickTierSwitchModel(
  models: NormalizedImageModel[],
  tier: ModelTier,
  inputMode: 'text' | 'photo' = 'text'
): NormalizedImageModel | null {
  const eligible = models.filter(
    (m) => m.tier === tier && (inputMode === 'photo' || !m.requiresReference)
  );
  const pool =
    eligible.length > 0 ? eligible : models.filter((m) => m.tier === tier);
  if (pool.length === 0) return null;

  if (tier === 'paid') {
    for (const recId of RECOMMENDED_PRODUCT_MODEL_IDS) {
      const match = pool.find((m) => m.id === recId);
      if (match) return match;
    }
    const exactPerImage = sortModelsByPriceAsc(
      pool.filter((m) => m.priceUnit === 'image' && m.priceUsd !== null)
    );
    if (exactPerImage[0]) return exactPerImage[0];
    return sortModelsByPriceAsc(pool)[0] ?? null;
  }

  return (
    pool.find((m) => m.id === DEFAULT_FREE_MODEL_ID) ??
    pool.find((m) => m.provider === 'recraft') ??
    pool[0] ??
    null
  );
}

/**
 * Picks the cheapest recommended model that supports reference images (for "Use as reference").
 * Falls back to the cheapest reference-capable model overall if none of the recommended models support references.
 */
export function pickCheapestRecommendedReferenceModel(
  models: NormalizedImageModel[],
  preferredTier?: ModelTier
): NormalizedImageModel | null {
  const refCapable = models.filter((m) => m.supportsReference);
  if (refCapable.length === 0) return null;

  const recommendedRef = sortModelsByPriceAsc(
    refCapable.filter((m) => isRecommendedProductModel(m.id))
  );
  if (preferredTier === 'free') {
    const freeRec = recommendedRef.find((m) => m.tier === 'free');
    if (freeRec) return freeRec;
  }
  if (recommendedRef.length > 0) {
    return recommendedRef[0];
  }

  if (preferredTier === 'free') {
    const freeRef = sortModelsByPriceAsc(
      refCapable.filter((m) => m.tier === 'free')
    );
    if (freeRef[0]) return freeRef[0];
  }
  return sortModelsByPriceAsc(refCapable)[0] ?? null;
}

export function findModelById(
  models: NormalizedImageModel[],
  id: string
): NormalizedImageModel | undefined {
  return models.find((m) => m.id === id);
}
