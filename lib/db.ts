import { get, set } from 'idb-keyval';
import JSZip from 'jszip';
import {
  DEFAULT_FREE_MODEL_ID,
  type AspectRatio,
  type ModelTier,
} from './models';
import type { ProductBrief } from './prompt-engine';
import type { ShotPresetId } from './presets';
import type { PackshotCheckResult } from './packshot-check';

export type MultiViewId =
  | 'front'
  | 'front-right-34'
  | 'right'
  | 'back-right-34'
  | 'back'
  | 'back-left-34'
  | 'left'
  | 'front-left-34'
  | 'top'
  | 'bottom'
  | 'detail';

export interface MultiViewConsistencyResult {
  colorDriftScore: number;
  hasColorDrift: boolean;
  heightRatioDiffPct: number;
  hasSizeMismatch: boolean;
  anchorHeightPct: number;
  targetHeightPct: number;
}

export interface MultiViewSetMeta {
  setId: string;
  sourceImageId: string;
  sourceImageDataUrl: string;
  sourceViewId: MultiViewId;
  selectedViewIds: MultiViewId[];
  shotStyleId: ShotPresetId;
  hiddenSidesNotes?: Record<string, string>;
  hiddenSidesPhotos?: Record<string, string>;
  useSameSeed: boolean;
  sharedSeed?: number;
  consistencyBoost: boolean;
  extraReferenceViewIds?: MultiViewId[];
}

export interface GeneratedImageItem {
  id: string;
  dataUrl: string;
  originalDataUrl?: string;
  alignedLabel?: string;
  mediaType: string;
  seed?: number;
  cost: number | null;
  durationMs: number;
  packshotCheck?: PackshotCheckResult;
  degraded?: string[];
  favorite?: boolean;
  viewId?: MultiViewId;
  viewLabel?: string;
  isSourceView?: boolean;
  approved?: boolean;
  extraNote?: string;
  consistency?: MultiViewConsistencyResult;
}

export interface GenerationRecord {
  id: string;
  createdAt: number;
  brief: ProductBrief;
  shotId: ShotPresetId;
  modelId: string;
  modelTier?: ModelTier;
  aspectRatio: AspectRatio;
  prompt: string;
  enhanced: boolean;
  refineChips: string[];
  images: GeneratedImageItem[];
  totalCost: number;
  actualCost?: number | null;
  totalDurationMs: number;
  multiViewSet?: MultiViewSetMeta;
}

export interface StudioSettings {
  modelTier: ModelTier;
  defaultModel: string;
  defaultAspectRatio: AspectRatio;
  showPromptInspector: boolean;
  theme: 'dark' | 'light';
  sessionSpendLimitUsd: number | null;
}

export const DEFAULT_SETTINGS: StudioSettings = {
  modelTier: 'free',
  defaultModel: DEFAULT_FREE_MODEL_ID,
  defaultAspectRatio: '1:1',
  showPromptInspector: true,
  theme: 'dark',
  sessionSpendLimitUsd: null,
};

export interface ModelCostStats {
  modelId: string;
  count: number;
  averageActualCost: number;
  lastActualCost: number;
  maxActualCost: number;
  updatedAt: number;
}

export type ModelCostStatsMap = Record<string, ModelCostStats>;

export const USER_PRESET_CATEGORIES = [
  'Hero',
  'Macro',
  'Catalog',
  'Lifestyle',
  'Packaging',
] as const;

export function inferPresetCategory(shotId: ShotPresetId): string {
  switch (shotId) {
    case 'studio-hero':
      return 'Hero';
    case 'macro-detail':
      return 'Macro';
    case 'marketplace-packshot':
      return 'Catalog';
    case 'lifestyle-scene':
    case 'flat-lay':
      return 'Lifestyle';
    case 'packaging-mockup':
      return 'Packaging';
    default:
      return 'Catalog';
  }
}

export interface UserPreset {
  id: string;
  name: string;
  category: string;
  createdAt: number;
  updatedAt: number;
  promptText: string;
  promptEditedManually: boolean;
  shotId: ShotPresetId;
  refineChips: string[];
  enhanceEnabled: boolean;
  modelId: string;
  modelTier: ModelTier;
  aspectRatio: AspectRatio;
  resolution: string;
  quality: string;
  backgroundMode: 'auto' | 'opaque' | 'transparent';
  outputFormat: 'auto' | 'png' | 'webp' | 'jpeg' | 'svg';
  variations: number;
  customSeed: string;
}

const HISTORY_KEY = 'packshot-studio:history:v1';
const SETTINGS_KEY = 'packshot-studio:settings:v1';
const MODEL_COST_STATS_KEY = 'packshot-studio:model-cost-stats:v1';
const USER_PRESETS_KEY = 'packshot-studio:user-presets:v1';

export async function loadHistory(): Promise<GenerationRecord[]> {
  try {
    const records = await get<GenerationRecord[]>(HISTORY_KEY);
    return Array.isArray(records) ? records : [];
  } catch {
    return [];
  }
}

export async function saveHistory(records: GenerationRecord[]): Promise<void> {
  try {
    await set(HISTORY_KEY, records.slice(0, 100));
  } catch {
    // Ignore storage quota issues gracefully
  }
}

export async function loadUserPresets(): Promise<UserPreset[]> {
  try {
    const presets = await get<UserPreset[]>(USER_PRESETS_KEY);
    if (!Array.isArray(presets)) return [];
    return presets.map((p) => ({
      ...p,
      category:
        typeof p.category === 'string' && p.category.trim().length > 0
          ? p.category.trim()
          : inferPresetCategory(p.shotId),
    }));
  } catch {
    return [];
  }
}

export async function saveUserPresets(presets: UserPreset[]): Promise<void> {
  try {
    await set(USER_PRESETS_KEY, presets.slice(0, 50));
  } catch {
    // Ignore storage issues gracefully
  }
}

export async function loadSettings(): Promise<StudioSettings> {
  try {
    const stored = await get<Partial<StudioSettings>>(SETTINGS_KEY);
    if (!stored) return DEFAULT_SETTINGS;
    return { ...DEFAULT_SETTINGS, ...stored };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export async function saveSettings(settings: StudioSettings): Promise<void> {
  try {
    await set(SETTINGS_KEY, settings);
  } catch {
    // Ignore storage issues gracefully
  }
}

export async function loadModelCostStats(): Promise<ModelCostStatsMap> {
  try {
    const stored = await get<ModelCostStatsMap>(MODEL_COST_STATS_KEY);
    return stored && typeof stored === 'object' && !Array.isArray(stored)
      ? stored
      : {};
  } catch {
    return {};
  }
}

export async function saveModelCostStats(stats: ModelCostStatsMap): Promise<void> {
  try {
    await set(MODEL_COST_STATS_KEY, stats);
  } catch {
    // Ignore storage issues gracefully
  }
}

export function recordModelCostSample(
  prev: ModelCostStatsMap,
  modelId: string,
  perImageActualCost: number
): ModelCostStatsMap {
  if (!Number.isFinite(perImageActualCost) || perImageActualCost < 0) {
    return prev;
  }
  const existing = prev[modelId];
  const nextCount = (existing?.count ?? 0) + 1;
  const prevTotal = existing ? existing.averageActualCost * existing.count : 0;
  const nextAverage = (prevTotal + perImageActualCost) / nextCount;
  const nextMax = existing
    ? Math.max(existing.maxActualCost, perImageActualCost)
    : perImageActualCost;

  return {
    ...prev,
    [modelId]: {
      modelId,
      count: nextCount,
      averageActualCost: nextAverage,
      lastActualCost: perImageActualCost,
      maxActualCost: nextMax,
      updatedAt: Date.now(),
    },
  };
}

export function seedModelCostStatsFromHistory(
  existing: ModelCostStatsMap,
  history: GenerationRecord[]
): ModelCostStatsMap {
  if (history.length === 0) return existing;
  let merged = { ...existing };
  // Process oldest-to-newest so lastActualCost reflects the most recent run
  const chronological = [...history].sort((a, b) => a.createdAt - b.createdAt);
  const modelsPresentInStore = new Set(Object.keys(existing));

  for (const rec of chronological) {
    if (modelsPresentInStore.has(rec.modelId)) continue;
    if (typeof rec.actualCost !== 'number' || !Number.isFinite(rec.actualCost)) {
      continue;
    }
    const imageCount = Math.max(1, rec.images.length);
    const perImage = rec.actualCost / imageCount;
    merged = recordModelCostSample(merged, rec.modelId, perImage);
  }
  return merged;
}

export function getRecordSpendUsd(record: GenerationRecord): number {
  if (typeof record.actualCost === 'number' && Number.isFinite(record.actualCost)) {
    return record.actualCost;
  }
  const perImageSum = record.images.reduce(
    (sum, img) => sum + (typeof img.cost === 'number' && Number.isFinite(img.cost) ? img.cost : 0),
    0
  );
  if (perImageSum > 0) return perImageSum;
  return typeof record.totalCost === 'number' && Number.isFinite(record.totalCost)
    ? record.totalCost
    : 0;
}

export function isSvgMedia(mediaType?: string, dataUrl?: string): boolean {
  if (mediaType && mediaType.toLowerCase().includes('svg')) return true;
  if (dataUrl && dataUrl.toLowerCase().startsWith('data:image/svg+xml')) return true;
  return false;
}

/**
 * Downloads a dataUrl directly as SVG or converts via offscreen canvas to PNG/WebP/JPEG.
 */
export async function downloadImageAs(
  dataUrl: string,
  filenameBase: string,
  format: 'png' | 'webp' | 'jpeg' | 'svg'
): Promise<void> {
  if (format === 'svg') {
    const res = await fetch(dataUrl);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${filenameBase}.svg`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    return;
  }

  const mime =
    format === 'png' ? 'image/png' : format === 'webp' ? 'image/webp' : 'image/jpeg';

  const img = new Image();
  img.crossOrigin = 'anonymous';
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('Failed to decode image'));
    img.src = dataUrl;
  });

  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth || img.width || 1024;
  canvas.height = img.naturalHeight || img.height || 1024;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas unavailable');

  if (format === 'jpeg') {
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, mime, format === 'png' ? undefined : 0.94)
  );
  if (!blob) throw new Error('Export encoding failed');

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${filenameBase}.${format === 'jpeg' ? 'jpg' : format}`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function extensionFromDataUrl(dataUrl: string, mediaType?: string): string {
  const mimeMatch = dataUrl.match(/^data:([^;]+);/i);
  const mime = (mimeMatch?.[1] || mediaType || 'image/png').toLowerCase();
  if (mime.includes('svg')) return 'svg';
  if (mime.includes('webp')) return 'webp';
  if (mime.includes('jpeg') || mime.includes('jpg')) return 'jpg';
  return 'png';
}

export interface ZipExportEntry {
  dataUrl: string;
  filenameBase: string;
  mediaType?: string;
}

/**
 * Archives selected generated images into a single ZIP file and triggers download.
 */
export async function downloadSelectedAsZip(
  entries: ZipExportEntry[],
  archiveName?: string
): Promise<number> {
  if (entries.length === 0) return 0;

  const zip = new JSZip();
  const usedNames = new Set<string>();

  await Promise.all(
    entries.map(async (entry, idx) => {
      const ext = extensionFromDataUrl(entry.dataUrl, entry.mediaType);
      const base = entry.filenameBase || `packshot-${idx + 1}`;
      let candidate = `${base}.${ext}`;
      let suffix = 2;
      while (usedNames.has(candidate)) {
        candidate = `${base}-${suffix}.${ext}`;
        suffix++;
      }
      usedNames.add(candidate);

      const commaIdx = entry.dataUrl.indexOf(',');
      if (entry.dataUrl.startsWith('data:') && commaIdx !== -1) {
        const meta = entry.dataUrl.slice(0, commaIdx);
        const body = entry.dataUrl.slice(commaIdx + 1);
        if (meta.includes(';base64')) {
          zip.file(candidate, body, { base64: true });
          return;
        }
      }

      const res = await fetch(entry.dataUrl);
      const blob = await res.blob();
      zip.file(candidate, blob);
    })
  );

  const zipBlob = await zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });

  const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
  const finalName = archiveName || `packshot-studio-${stamp}.zip`;
  const url = URL.createObjectURL(zipBlob);
  const a = document.createElement('a');
  a.href = url;
  a.download = finalName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);

  return entries.length;
}
