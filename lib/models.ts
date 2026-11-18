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

export interface ModelSpec {
  id: string;
  name: string;
  shortName: string;
  supportsReference: boolean;
  price: number;
  priceLabel: string;
  maxResolution: string;
  latencyHint: string;
  badge?: string;
  note: string;
  isDefault?: boolean;
  supportedParameters?: string[];
  isAvailable?: boolean;
}

export const DEFAULT_MODEL_ID = 'recraft/recraft-v4.1-flash-v2:free';

export const MODEL_CATALOG: ModelSpec[] = [
  {
    id: 'recraft/recraft-v4.1-flash-v2:free',
    name: 'Recraft v4.1 Flash v2 (Free)',
    shortName: 'v4.1 Flash Free',
    supportsReference: false,
    price: 0,
    priceLabel: 'Free',
    maxResolution: '1024px',
    latencyHint: '~1.5s',
    badge: 'Free tier ends Nov 28, 2026',
    note: 'Fast text-to-image drafts and marketplace packshots at zero cost.',
    isDefault: true,
  },
  {
    id: 'recraft/recraft-v4.1-flash',
    name: 'Recraft v4.1 Flash',
    shortName: 'v4.1 Flash',
    supportsReference: false,
    price: 0.007,
    priceLabel: '$0.007 / img',
    maxResolution: '1024px',
    latencyHint: '~1.5s',
    note: 'Text-to-image only. Higher throughput without free-tier rate limits.',
  },
  {
    id: 'recraft/recraft-v4.1-utility',
    name: 'Recraft v4.1 Utility',
    shortName: 'v4.1 Utility',
    supportsReference: true,
    price: 0.035,
    priceLabel: '$0.035 / img',
    maxResolution: '1024px',
    latencyHint: '~3s',
    note: 'Accepts 1 reference image via input_references. Flat lighting, front-facing, controlled scenes.',
  },
  {
    id: 'recraft/recraft-v4.1-utility-pro',
    name: 'Recraft v4.1 Utility Pro',
    shortName: 'v4.1 Utility Pro',
    supportsReference: true,
    price: 0.21,
    priceLabel: '$0.21 / img',
    maxResolution: '~2K',
    latencyHint: '~5s',
    note: 'Accepts 1 reference image at ~2K resolution with controlled packshot precision.',
  },
  {
    id: 'recraft/recraft-v4.1',
    name: 'Recraft v4.1',
    shortName: 'v4.1',
    supportsReference: false,
    price: 0.035,
    priceLabel: '$0.035 / img',
    maxResolution: '1024px',
    latencyHint: '~3.5s',
    note: 'More aesthetic rendering, better suited for studio hero and lifestyle shots.',
  },
  {
    id: 'recraft/recraft-v4.1-pro',
    name: 'Recraft v4.1 Pro',
    shortName: 'v4.1 Pro',
    supportsReference: false,
    price: 0.21,
    priceLabel: '$0.21 / img',
    maxResolution: '~2K',
    latencyHint: '~6s',
    note: 'Flagship ~2K aesthetic model for campaign hero and lifestyle compositions.',
  },
];

export function getModelSpec(modelId: string): ModelSpec {
  return (
    MODEL_CATALOG.find((m) => m.id === modelId) ??
    MODEL_CATALOG.find((m) => m.isDefault) ??
    MODEL_CATALOG[0]
  );
}
