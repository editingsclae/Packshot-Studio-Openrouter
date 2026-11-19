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

export function formatModelPrice(model: NormalizedImageModel): string {
  if (model.tier === 'free') {
    return 'Free';
  }
  if (model.priceUsd === null) {
    return 'Price unknown';
  }
  if (model.priceUnit !== 'image') {
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
  variations: number
): { label: string; exactTotalUsd: number | null } {
  if (model.tier === 'free') {
    return { label: 'Free', exactTotalUsd: 0 };
  }
  if (model.priceUsd === null) {
    return { label: 'Price unknown', exactTotalUsd: null };
  }
  if (model.priceUnit !== 'image') {
    return { label: 'usage-based', exactTotalUsd: null };
  }
  const total = model.priceUsd * variations;
  return {
    label: `~$${total.toFixed(3)}`,
    exactTotalUsd: total,
  };
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

export function getCheapestPaidModel(
  models: NormalizedImageModel[]
): NormalizedImageModel | null {
  const paid = sortModelsByPriceAsc(models.filter((m) => m.tier === 'paid'));
  return paid[0] ?? null;
}

export function findModelById(
  models: NormalizedImageModel[],
  id: string
): NormalizedImageModel | undefined {
  return models.find((m) => m.id === id);
}
