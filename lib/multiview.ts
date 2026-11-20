import type { MultiViewConsistencyResult, MultiViewId } from './db';
import type { AspectRatio } from './models';
import { analyzePackshotImage, type PackshotCheckResult } from './packshot-check';
import { getShotPreset, type ShotPresetId } from './presets';

export interface MultiViewSpec {
  id: MultiViewId;
  label: string;
  shortLabel: string;
  slug: string;
  /** Clockwise azimuth around the product from Front (0°), or null for non-horizontal views */
  angleDeg: number | null;
  cameraOrbitDesc: string;
  isTurnable: boolean;
}

export const ALL_MULTIVIEW_SPECS: MultiViewSpec[] = [
  {
    id: 'front',
    label: 'Front',
    shortLabel: 'Front',
    slug: 'front',
    angleDeg: 0,
    cameraOrbitDesc:
      'the direct straight-on front view, eye-level, 85mm lens, matching distance and scale on the upright stationary product',
    isTurnable: true,
  },
  {
    id: 'front-right-34',
    label: '3/4 front-right',
    shortLabel: '3/4 Front-R',
    slug: '3-4-front-right',
    angleDeg: 45,
    cameraOrbitDesc:
      'camera orbited 45 degrees right of front view, eye-level, 85mm lens, matching distance and scale on the upright stationary product',
    isTurnable: true,
  },
  {
    id: 'right',
    label: 'Right side',
    shortLabel: 'Right',
    slug: 'right',
    angleDeg: 90,
    cameraOrbitDesc:
      'camera orbited 90 degrees right of front view, eye-level, 85mm lens, matching distance and scale on the upright stationary product',
    isTurnable: true,
  },
  {
    id: 'back-right-34',
    label: '3/4 back-right',
    shortLabel: '3/4 Back-R',
    slug: '3-4-back-right',
    angleDeg: 135,
    cameraOrbitDesc:
      'camera orbited 135 degrees right of front view, eye-level, 85mm lens, matching distance and scale on the upright stationary product',
    isTurnable: true,
  },
  {
    id: 'back',
    label: 'Back',
    shortLabel: 'Back',
    slug: 'back',
    angleDeg: 180,
    cameraOrbitDesc:
      'camera orbited 180 degrees to rear view, eye-level, 85mm lens, matching distance and scale on the upright stationary product',
    isTurnable: true,
  },
  {
    id: 'back-left-34',
    label: '3/4 back-left',
    shortLabel: '3/4 Back-L',
    slug: '3-4-back-left',
    angleDeg: 225,
    cameraOrbitDesc:
      'camera orbited 135 degrees left of front view, eye-level, 85mm lens, matching distance and scale on the upright stationary product',
    isTurnable: true,
  },
  {
    id: 'left',
    label: 'Left side',
    shortLabel: 'Left',
    slug: 'left',
    angleDeg: 270,
    cameraOrbitDesc:
      'camera orbited 90 degrees left of front view, eye-level, 85mm lens, matching distance and scale on the upright stationary product',
    isTurnable: true,
  },
  {
    id: 'front-left-34',
    label: '3/4 front-left',
    shortLabel: '3/4 Front-L',
    slug: '3-4-front-left',
    angleDeg: 315,
    cameraOrbitDesc:
      'camera orbited 45 degrees left of front view, eye-level, 85mm lens, matching distance and scale on the upright stationary product',
    isTurnable: true,
  },
  {
    id: 'top',
    label: 'Top-down',
    shortLabel: 'Top',
    slug: 'top',
    angleDeg: null,
    cameraOrbitDesc:
      'camera orbited 90 degrees overhead looking straight down at the top, 85mm lens, matching distance and scale',
    isTurnable: false,
  },
  {
    id: 'bottom',
    label: 'Bottom',
    shortLabel: 'Bottom',
    slug: 'bottom',
    angleDeg: null,
    cameraOrbitDesc:
      'camera orbited underneath showing the bottom base of the same product, 85mm lens, matching distance and scale',
    isTurnable: false,
  },
  {
    id: 'detail',
    label: 'Detail close-up',
    shortLabel: 'Detail',
    slug: 'detail',
    angleDeg: null,
    cameraOrbitDesc:
      'tight close-up macro detail highlighting surface texture, stitching, hardware or label finish of the same product',
    isTurnable: false,
  },
];

export const SOURCE_VIEW_OPTIONS: MultiViewId[] = [
  'front',
  'back',
  'left',
  'right',
  'front-left-34',
  'front-right-34',
  'top',
];

export interface MultiViewPresetSpec {
  id: 'standard-4' | 'marketplace-6' | 'turntable-8';
  label: string;
  views: MultiViewId[];
}

export const MULTIVIEW_PRESETS: MultiViewPresetSpec[] = [
  {
    id: 'standard-4',
    label: 'Standard 4',
    views: ['front', 'back', 'left', 'right'],
  },
  {
    id: 'marketplace-6',
    label: 'Marketplace 6',
    views: ['front', 'back', 'left', 'right', 'front-left-34', 'top'],
  },
  {
    id: 'turntable-8',
    label: 'Turntable 8',
    views: [
      'front',
      'front-right-34',
      'right',
      'back-right-34',
      'back',
      'back-left-34',
      'left',
      'front-left-34',
    ],
  },
];

const SPEC_MAP = new Map<MultiViewId, MultiViewSpec>(
  ALL_MULTIVIEW_SPECS.map((spec) => [spec.id, spec])
);

export function getMultiViewSpec(id: MultiViewId): MultiViewSpec {
  return SPEC_MAP.get(id) ?? ALL_MULTIVIEW_SPECS[0];
}

export function sortViewsCanonical(viewIds: MultiViewId[]): MultiViewId[] {
  const order = new Map(ALL_MULTIVIEW_SPECS.map((s, idx) => [s.id, idx]));
  return [...viewIds].sort(
    (a, b) => (order.get(a) ?? 99) - (order.get(b) ?? 99)
  );
}

function stripHexFromPrompt(input: string): string {
  return input
    .replace(/\(#?[0-9a-fA-F]{6}\)/g, '')
    .replace(/#[0-9a-fA-F]{3,8}\b/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

export interface BuildMultiViewPromptOptions {
  shotStyleId: ShotPresetId;
  hiddenSideNote?: string;
  correctionNote?: string;
}

/**
 * Builds a concise (<= 700 chars) multi-view generation prompt describing the view
 * as a camera orbit around a fixed, upright, stationary product.
 */
export function buildMultiViewPrompt(
  viewId: MultiViewId,
  options: BuildMultiViewPromptOptions
): string {
  const spec = getMultiViewSpec(viewId);
  const preset = getShotPreset(options.shotStyleId);

  const coreHead =
    `Using the provided product photo(s), show the exact same product photographed from ${spec.cameraOrbitDesc}. ` +
    `Keep the product's exact shape, proportions, colors, materials, finish, hardware, logos and label text identical to the reference. ` +
    `Do not redesign, restyle or add parts. Anything not visible in the reference should continue the existing design language simply and neutrally, with no new logos, text or features.`;

  const hiddenClean = stripHexFromPrompt(options.hiddenSideNote || '');
  const correctionClean = stripHexFromPrompt(options.correctionNote || '');

  const userNotes: string[] = [];
  if (hiddenClean) {
    const trimmed = hiddenClean.slice(0, 80).replace(/[.]+$/, '');
    userNotes.push(`Side detail: ${trimmed}.`);
  }
  if (correctionClean) {
    const trimmed = correctionClean.slice(0, 80).replace(/[.]+$/, '');
    userNotes.push(`Correction: ${trimmed}.`);
  }

  const rawBg = stripHexFromPrompt(preset.background).replace(/\.+$/, '');
  const rawLight = stripHexFromPrompt(preset.lighting).replace(/\.+$/, '');
  const rawComp = stripHexFromPrompt(preset.composition).replace(/\.+$/, '');
  const styleFull = `${rawBg}. ${rawLight}. ${rawComp}.`;
  const tail = 'Single product, no people, no watermark, no extra text.';

  const baseOnly = [coreHead, ...userNotes, tail]
    .join(' ')
    .replace(/\s{2,}/g, ' ')
    .trim();

  const styleBudget = Math.max(0, 700 - baseOnly.length - 1);
  if (styleBudget >= 24) {
    const clippedStyle =
      styleFull.length <= styleBudget
        ? styleFull
        : `${styleFull.slice(0, styleBudget - 1).trim().replace(/[.,;:\s]+$/, '')}.`;
    return [coreHead, ...userNotes, clippedStyle, tail]
      .join(' ')
      .replace(/\s{2,}/g, ' ')
      .trim();
  }

  return baseOnly.slice(0, 700).trim();
}

/**
 * Picks one 3/4 view first for Consistency Boost Wave 1.
 */
export function pickWaveOneView(viewsToGenerate: MultiViewId[]): MultiViewId | null {
  if (viewsToGenerate.length === 0) return null;
  const preferredOrder: MultiViewId[] = [
    'front-left-34',
    'front-right-34',
    'back-left-34',
    'back-right-34',
    'left',
    'right',
  ];
  for (const candidate of preferredOrder) {
    if (viewsToGenerate.includes(candidate)) {
      return candidate;
    }
  }
  return viewsToGenerate[0];
}

function circularAngleDistance(a: number, b: number): number {
  const diff = Math.abs(a - b) % 360;
  return Math.min(diff, 360 - diff);
}

/**
 * Selects up to `limit` nearest completed views by circular orbit angle.
 */
export function pickNearestCompletedViews(
  targetViewId: MultiViewId,
  completed: Array<{ viewId: MultiViewId; dataUrl: string }>,
  limit = 2
): string[] {
  if (completed.length === 0 || limit <= 0) return [];
  const targetAngle = getMultiViewSpec(targetViewId).angleDeg;

  const scored = completed
    .filter((c) => c.viewId !== targetViewId)
    .map((c) => {
      const candAngle = getMultiViewSpec(c.viewId).angleDeg;
      let dist = 180;
      if (targetAngle !== null && candAngle !== null) {
        dist = circularAngleDistance(targetAngle, candAngle);
      } else if (targetAngle === null && candAngle !== null) {
        // Non-horizontal views benefit most from 3/4 views
        dist = candAngle % 90 === 45 ? 30 : 90;
      } else if (targetAngle !== null && candAngle === null) {
        dist = 135;
      }
      return { dataUrl: c.dataUrl, dist };
    })
    .sort((a, b) => a.dist - b.dist);

  return scored.slice(0, limit).map((s) => s.dataUrl);
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to decode image'));
    img.src = src;
  });
}

export async function detectNearestAspectRatio(
  dataUrl: string,
  fallback: AspectRatio = '1:1'
): Promise<AspectRatio> {
  try {
    const img = await loadImage(dataUrl);
    const w = img.naturalWidth || img.width;
    const h = img.naturalHeight || img.height;
    if (!w || !h) return fallback;
    const ratio = w / h;
    const candidates: Array<{ value: AspectRatio; numeric: number }> = [
      { value: '1:1', numeric: 1 },
      { value: '4:5', numeric: 0.8 },
      { value: '3:4', numeric: 0.75 },
      { value: '16:9', numeric: 16 / 9 },
      { value: '9:16', numeric: 9 / 16 },
    ];
    let best = candidates[0];
    let bestDiff = Math.abs(ratio - best.numeric);
    for (const c of candidates.slice(1)) {
      const diff = Math.abs(ratio - c.numeric);
      if (diff < bestDiff) {
        best = c;
        bestDiff = diff;
      }
    }
    return best.value;
  } catch {
    return fallback;
  }
}

async function encodeJpegWithCap(
  dataUrl: string,
  maxDim: number,
  quality: number
): Promise<string> {
  const img = await loadImage(dataUrl);
  const w = Math.max(1, img.naturalWidth || img.width);
  const h = Math.max(1, img.naturalHeight || img.height);
  const scale = Math.min(1, maxDim / Math.max(w, h));
  const outW = Math.max(1, Math.round(w * scale));
  const outH = Math.max(1, Math.round(h * scale));

  const canvas = document.createElement('canvas');
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext('2d');
  if (!ctx) return dataUrl;

  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, outW, outH);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, outW, outH);

  return canvas.toDataURL('image/jpeg', quality);
}

const COMBINED_PAYLOAD_BUDGET_BYTES = 3_600_000; // Strictly under 4 MB combined payload

/**
 * Re-compresses reference images to JPEG (quality 0.85, max 1536px) and ensures
 * the combined reference payload for a single /api/generate request stays under 4 MB.
 */
export async function prepareMultiViewReferences(
  rawRefs: string[],
  modelMaxRefs: number
): Promise<string[]> {
  const cap = Math.min(4, Math.max(1, modelMaxRefs));
  const sliced = rawRefs.filter(Boolean).slice(0, cap);
  if (sliced.length === 0) return [];

  let compressed = await Promise.all(
    sliced.map((ref) => encodeJpegWithCap(ref, 1536, 0.85))
  );

  const stepDowns: Array<{ maxDim: number; quality: number }> = [
    { maxDim: 1280, quality: 0.8 },
    { maxDim: 1024, quality: 0.74 },
    { maxDim: 896, quality: 0.68 },
    { maxDim: 768, quality: 0.62 },
  ];

  for (const step of stepDowns) {
    const totalLen = compressed.reduce((sum, item) => sum + item.length, 0);
    if (totalLen <= COMBINED_PAYLOAD_BUDGET_BYTES) break;
    compressed = await Promise.all(
      sliced.map((ref) => encodeJpegWithCap(ref, step.maxDim, step.quality))
    );
  }

  return compressed;
}

interface SubjectVisualStats {
  heightPct: number;
  palette: Array<{ r: number; g: number; b: number; weight: number }>;
}

function median(values: number[]): number {
  if (values.length === 0) return 255;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

async function extractSubjectStats(dataUrl: string): Promise<SubjectVisualStats> {
  const img = await loadImage(dataUrl);
  const maxDim = 220;
  const w0 = Math.max(16, img.naturalWidth || img.width);
  const h0 = Math.max(16, img.naturalHeight || img.height);
  const scale = Math.min(1, maxDim / Math.max(w0, h0));
  const w = Math.max(16, Math.round(w0 * scale));
  const h = Math.max(16, Math.round(h0 * scale));

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) {
    return { heightPct: 0.7, palette: [] };
  }
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);
  const { data } = ctx.getImageData(0, 0, w, h);

  const borderMargin = Math.max(2, Math.round(Math.min(w, h) * 0.03));
  const bgRList: number[] = [];
  const bgGList: number[] = [];
  const bgBList: number[] = [];

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (
        x < borderMargin ||
        x >= w - borderMargin ||
        y < borderMargin ||
        y >= h - borderMargin
      ) {
        const idx = (y * w + x) * 4;
        bgRList.push(data[idx]);
        bgGList.push(data[idx + 1]);
        bgBList.push(data[idx + 2]);
      }
    }
  }

  const bgR = median(bgRList);
  const bgG = median(bgGList);
  const bgB = median(bgBList);
  const isNearWhiteBg = 0.299 * bgR + 0.587 * bgG + 0.114 * bgB >= 235;

  let minY = h;
  let maxY = -1;
  const buckets = new Map<
    number,
    { count: number; sumR: number; sumG: number; sumB: number }
  >();
  let fgPixels = 0;

  for (let y = 0; y < h; y++) {
    let rowFg = 0;
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];

      // Ignore near-white pixels unconditionally for color comparison, plus backdrop match
      const isNearWhitePixel = r >= 238 && g >= 238 && b >= 238;
      const diffBg = Math.max(
        Math.abs(r - bgR),
        Math.abs(g - bgG),
        Math.abs(b - bgB)
      );
      const isForeground = isNearWhiteBg
        ? !isNearWhitePixel
        : diffBg > 24 && !isNearWhitePixel;

      if (isForeground) {
        rowFg++;
        fgPixels++;
        const qr = r >> 5;
        const qg = g >> 5;
        const qb = b >> 5;
        const key = (qr << 6) | (qg << 3) | qb;
        const existing = buckets.get(key);
        if (existing) {
          existing.count++;
          existing.sumR += r;
          existing.sumG += g;
          existing.sumB += b;
        } else {
          buckets.set(key, { count: 1, sumR: r, sumG: g, sumB: b });
        }
      }
    }
    if (rowFg >= 2) {
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }

  const heightPct = maxY >= minY ? (maxY - minY + 1) / h : 0.7;
  const topBuckets = Array.from(buckets.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, 4)
    .map((b) => ({
      r: b.sumR / b.count,
      g: b.sumG / b.count,
      b: b.sumB / b.count,
      weight: fgPixels > 0 ? b.count / fgPixels : 0.25,
    }));

  return { heightPct, palette: topBuckets };
}

/**
 * Client-side canvas consistency analyzer comparing a generated view against the anchor.
 * - Dominant foreground color distance (ignoring near-white background) -> Color drift
 * - Normalized product height difference > 8% -> Size mismatch
 */
export async function analyzeMultiViewConsistency(
  anchorDataUrl: string,
  targetDataUrl: string
): Promise<MultiViewConsistencyResult> {
  const [anchor, target] = await Promise.all([
    extractSubjectStats(anchorDataUrl),
    extractSubjectStats(targetDataUrl),
  ]);

  const baseH = Math.max(0.1, anchor.heightPct);
  const diffPctRaw = Math.abs(target.heightPct - anchor.heightPct) / baseH;
  const heightRatioDiffPct = Math.round(diffPctRaw * 100);
  const hasSizeMismatch = diffPctRaw > 0.08;

  let colorDriftScore = 0;
  if (anchor.palette.length > 0 && target.palette.length > 0) {
    let weightedDist = 0;
    let totalWeight = 0;
    for (const tc of target.palette) {
      let bestDist = Number.POSITIVE_INFINITY;
      for (const ac of anchor.palette) {
        const dr = tc.r - ac.r;
        const dg = tc.g - ac.g;
        const db = tc.b - ac.b;
        const dist = Math.sqrt(dr * dr + dg * dg + db * db);
        if (dist < bestDist) bestDist = dist;
      }
      weightedDist += bestDist * tc.weight;
      totalWeight += tc.weight;
    }
    // Max possible Euclidean RGB distance is ~441; normalize to 0..100
    const avgRgbDist = totalWeight > 0 ? weightedDist / totalWeight : 0;
    colorDriftScore = Math.round((avgRgbDist / 441) * 100);
  }

  return {
    colorDriftScore,
    hasColorDrift: colorDriftScore >= 16,
    heightRatioDiffPct,
    hasSizeMismatch,
    anchorHeightPct: Math.round(anchor.heightPct * 100),
    targetHeightPct: Math.round(target.heightPct * 100),
  };
}

function detectSubjectBounds(
  data: Uint8ClampedArray,
  w: number,
  h: number
): {
  srcX: number;
  srcY: number;
  srcW: number;
  srcH: number;
  bgR: number;
  bgG: number;
  bgB: number;
  hasAlpha: boolean;
} {
  const margin = Math.max(3, Math.round(Math.min(w, h) * 0.025));
  const br: number[] = [];
  const bg: number[] = [];
  const bb: number[] = [];
  let borderTotal = 0;
  let borderAlpha = 0;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (x < margin || x >= w - margin || y < margin || y >= h - margin) {
        const idx = (y * w + x) * 4;
        borderTotal++;
        if (data[idx + 3] < 235) borderAlpha++;
        else {
          br.push(data[idx]);
          bg.push(data[idx + 1]);
          bb.push(data[idx + 2]);
        }
      }
    }
  }

  const hasAlpha = borderTotal > 0 && borderAlpha / borderTotal > 0.2;
  const bgR = br.length > 0 ? median(br) : 255;
  const bgG = bg.length > 0 ? median(bg) : 255;
  const bgB = bb.length > 0 ? median(bb) : 255;
  const isNearWhite = 0.299 * bgR + 0.587 * bgG + 0.114 * bgB >= 236;

  let minX = w;
  let maxX = -1;
  let minY = h;
  let maxY = -1;

  for (let y = 0; y < h; y++) {
    let rowHits = 0;
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      const a = data[idx + 3];

      const fg = hasAlpha
        ? a >= 24
        : a >= 24 &&
          (Math.max(Math.abs(r - bgR), Math.abs(g - bgG), Math.abs(b - bgB)) > 22 ||
            (isNearWhite && (r < 236 || g < 236 || b < 236)));
      if (fg) {
        rowHits++;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
      }
    }
    if (rowHits >= 2) {
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }

  if (maxX <= minX || maxY <= minY) {
    return {
      srcX: 0,
      srcY: 0,
      srcW: w,
      srcH: h,
      bgR,
      bgG,
      bgB,
      hasAlpha,
    };
  }

  const pad = 2;
  const sx = Math.max(0, minX - pad);
  const sy = Math.max(0, minY - pad);
  const sr = Math.min(w, maxX + 1 + pad);
  const sb = Math.min(h, maxY + 1 + pad);
  return {
    srcX: sx,
    srcY: sy,
    srcW: Math.max(2, sr - sx),
    srcH: Math.max(2, sb - sy),
    bgR,
    bgG,
    bgB,
    hasAlpha,
  };
}

export interface AlignedViewOutput {
  id: string;
  dataUrl: string;
  packshotCheck: PackshotCheckResult;
  consistency?: MultiViewConsistencyResult;
}

export async function compressHiddenSidePhoto(dataUrl: string): Promise<string> {
  return encodeJpegWithCap(dataUrl, 1536, 0.85);
}

function getSharedCanvasDimensions(aspectRatio?: AspectRatio): {
  width: number;
  height: number;
} {
  switch (aspectRatio) {
    case '4:5':
      return { width: 896, height: 1120 };
    case '3:4':
      return { width: 864, height: 1152 };
    case '16:9':
      return { width: 1280, height: 720 };
    case '9:16':
      return { width: 720, height: 1280 };
    case '1:1':
    default:
      return { width: 1024, height: 1024 };
  }
}

async function renderAlignedFrame(
  dataUrl: string,
  outW: number,
  outH: number,
  targetHeightFill: number,
  isWhiteBackground: boolean
): Promise<string> {
  const img = await loadImage(dataUrl);
  const w = Math.max(16, img.naturalWidth || img.width);
  const h = Math.max(16, img.naturalHeight || img.height);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return dataUrl;

  ctx.drawImage(img, 0, 0, w, h);
  const bounds = detectSubjectBounds(ctx.getImageData(0, 0, w, h).data, w, h);

  const out = document.createElement('canvas');
  out.width = outW;
  out.height = outH;
  const octx = out.getContext('2d');
  if (!octx) return dataUrl;

  octx.fillStyle = isWhiteBackground
    ? '#FFFFFF'
    : `rgb(${bounds.bgR}, ${bounds.bgG}, ${bounds.bgB})`;
  octx.fillRect(0, 0, outW, outH);

  const scaleByH = (outH * targetHeightFill) / bounds.srcH;
  const maxScaleW = (outW * 0.88) / bounds.srcW;
  const scale = Math.min(scaleByH, maxScaleW);
  const destW = Math.round(bounds.srcW * scale);
  const destH = Math.round(bounds.srcH * scale);
  const destX = Math.round((outW - destW) / 2);
  const destY = Math.round((outH - destH) / 2);

  octx.imageSmoothingEnabled = true;
  octx.imageSmoothingQuality = 'high';
  octx.drawImage(
    img,
    bounds.srcX,
    bounds.srcY,
    bounds.srcW,
    bounds.srcH,
    destX,
    destY,
    destW,
    destH
  );

  return out.toDataURL('image/png');
}

/**
 * Aligns all views onto a shared canvas dimension with uniform product height
 * matching the anchor's product height (clamped between 68% and 84% canvas fill).
 */
export async function alignMultiViewSet(
  anchorDataUrl: string,
  items: Array<{ id: string; dataUrl: string; isSource?: boolean }>,
  options: { isWhiteBackground: boolean; aspectRatio?: AspectRatio }
): Promise<AlignedViewOutput[]> {
  const anchorStats = await extractSubjectStats(anchorDataUrl);
  const targetHeightFill = Math.min(0.84, Math.max(0.68, anchorStats.heightPct || 0.78));
  const { width: outW, height: outH } = getSharedCanvasDimensions(
    options.aspectRatio
  );

  const alignedAnchorUrl = await renderAlignedFrame(
    anchorDataUrl,
    outW,
    outH,
    targetHeightFill,
    options.isWhiteBackground
  );

  const results: AlignedViewOutput[] = [];
  for (const item of items) {
    const dataUrl = await renderAlignedFrame(
      item.dataUrl,
      outW,
      outH,
      targetHeightFill,
      options.isWhiteBackground
    );
    const packshotCheck = await analyzePackshotImage(dataUrl);
    const consistency = item.isSource
      ? undefined
      : await analyzeMultiViewConsistency(alignedAnchorUrl, dataUrl);

    results.push({
      id: item.id,
      dataUrl,
      packshotCheck,
      consistency,
    });
  }

  return results;
}

/**
 * Renders a pure #FFFFFF PNG contact sheet grid with optional view labels and triggers download.
 */
export async function downloadMultiViewContactSheet(
  views: Array<{ label: string; isSource?: boolean; dataUrl: string }>,
  options: { productName: string; showLabels: boolean }
): Promise<void> {
  if (views.length === 0) return;

  const cols =
    views.length <= 2 ? views.length : views.length <= 4 ? 2 : views.length <= 6 ? 3 : 4;
  const rows = Math.ceil(views.length / cols);

  const padding = 48;
  const gap = 24;
  const headerH = options.showLabels ? 64 : 24;
  const cellW = 480;
  const cellImgH = 480;
  const labelH = options.showLabels ? 44 : 0;
  const cellH = cellImgH + labelH;

  const canvasW = padding * 2 + cols * cellW + (cols - 1) * gap;
  const canvasH = padding * 2 + headerH + rows * cellH + (rows - 1) * gap;

  const canvas = document.createElement('canvas');
  canvas.width = canvasW;
  canvas.height = canvasH;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas unavailable');

  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, canvasW, canvasH);

  if (options.showLabels) {
    ctx.fillStyle = '#111111';
    ctx.font = '600 26px system-ui, -apple-system, sans-serif';
    ctx.textBaseline = 'top';
    ctx.fillText(
      `${options.productName || 'Product'} — Multi-view set (${views.length} views)`,
      padding,
      padding
    );
  }

  const loaded = await Promise.all(
    views.map(async (v) => ({ ...v, img: await loadImage(v.dataUrl) }))
  );

  loaded.forEach((entry, idx) => {
    const col = idx % cols;
    const row = Math.floor(idx / cols);
    const x = padding + col * (cellW + gap);
    const y = padding + headerH + row * (cellH + gap);

    ctx.strokeStyle = '#E5E7EB';
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, cellW, cellImgH);

    const iw = entry.img.naturalWidth || entry.img.width || 1;
    const ih = entry.img.naturalHeight || entry.img.height || 1;
    const scale = Math.min((cellW - 24) / iw, (cellImgH - 24) / ih);
    const dw = iw * scale;
    const dh = ih * scale;
    ctx.drawImage(
      entry.img,
      x + (cellW - dw) / 2,
      y + (cellImgH - dh) / 2,
      dw,
      dh
    );

    if (options.showLabels) {
      ctx.fillStyle = '#111111';
      ctx.font = '500 18px ui-monospace, SFMono-Regular, Menlo, monospace';
      ctx.textBaseline = 'middle';
      const labelText = entry.isSource ? `${entry.label} (Source)` : entry.label;
      ctx.fillText(labelText, x + 6, y + cellImgH + labelH / 2);
    }
  });

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/png')
  );
  if (!blob) throw new Error('Contact sheet export failed');

  const safeSlug =
    options.productName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '') || 'product';
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${safeSlug}_contact-sheet.png`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
