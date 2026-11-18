import { get, set } from 'idb-keyval';
import JSZip from 'jszip';
import { DEFAULT_MODEL_ID, type AspectRatio } from './models';
import type { ProductBrief } from './prompt-engine';
import type { ShotPresetId } from './presets';
import type { PackshotCheckResult } from './packshot-check';

export interface GeneratedImageItem {
  id: string;
  dataUrl: string;
  mediaType: string;
  seed?: number;
  cost: number | null;
  durationMs: number;
  packshotCheck?: PackshotCheckResult;
  favorite?: boolean;
}

export interface GenerationRecord {
  id: string;
  createdAt: number;
  brief: ProductBrief;
  shotId: ShotPresetId;
  modelId: string;
  aspectRatio: AspectRatio;
  prompt: string;
  enhanced: boolean;
  refineChips: string[];
  images: GeneratedImageItem[];
  totalCost: number;
  totalDurationMs: number;
}

export interface StudioSettings {
  defaultModel: string;
  defaultAspectRatio: AspectRatio;
  showPromptInspector: boolean;
  theme: 'dark' | 'light';
}

export const DEFAULT_SETTINGS: StudioSettings = {
  defaultModel: DEFAULT_MODEL_ID,
  defaultAspectRatio: '1:1',
  showPromptInspector: true,
  theme: 'dark',
};

const HISTORY_KEY = 'packshot-studio:history:v1';
const SETTINGS_KEY = 'packshot-studio:settings:v1';

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
    // Keep up to 100 latest generation batches in IndexedDB
    await set(HISTORY_KEY, records.slice(0, 100));
  } catch {
    // Ignore storage quota issues gracefully
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

/**
 * Converts a dataUrl to PNG, WebP, or JPEG via offscreen canvas and triggers file download.
 */
export async function downloadImageAs(
  dataUrl: string,
  filenameBase: string,
  format: 'png' | 'webp' | 'jpeg'
): Promise<void> {
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
  canvas.width = img.naturalWidth || img.width;
  canvas.height = img.naturalHeight || img.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas unavailable');

  if (format === 'jpeg') {
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  ctx.drawImage(img, 0, 0);

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
