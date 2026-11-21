import {
  analyzePackshotImage,
  deltaELab,
  rgbToLab,
  type PackshotCheckResult,
} from './packshot-check';

export type MarketplaceAlignPresetId =
  | 'amazon'
  | 'shopify'
  | 'tight'
  | 'studio-match';

export type AlignCanvasMode = 'square' | 'keep-aspect';
export type AlignBackdropMode = 'pure-white' | 'edge-sample';

export interface MarketplaceAlignPreset {
  id: MarketplaceAlignPresetId;
  label: string;
  shortLabel: string;
  description: string;
  targetFill: number;
  canvasMode: AlignCanvasMode;
  backdropMode: AlignBackdropMode;
}

export const MARKETPLACE_ALIGN_PRESETS: MarketplaceAlignPreset[] = [
  {
    id: 'amazon',
    label: 'Amazon Standard',
    shortLabel: 'Amazon 85%',
    description: 'Pure #FFFFFF canvas, centered product at 85% frame fill',
    targetFill: 0.85,
    canvasMode: 'square',
    backdropMode: 'pure-white',
  },
  {
    id: 'shopify',
    label: 'Shopify Balanced',
    shortLabel: 'Shopify 80%',
    description: 'Square 1:1 pure #FFFFFF with uniform 10% margin',
    targetFill: 0.8,
    canvasMode: 'square',
    backdropMode: 'pure-white',
  },
  {
    id: 'tight',
    label: 'Catalog Tight',
    shortLabel: 'Tight 90%',
    description: 'High-detail 90% frame fill on pure #FFFFFF',
    targetFill: 0.9,
    canvasMode: 'keep-aspect',
    backdropMode: 'pure-white',
  },
  {
    id: 'studio-match',
    label: 'Center & Match Backdrop',
    shortLabel: 'Center (Edge)',
    description: 'Centers subject while matching original studio backdrop',
    targetFill: 0.84,
    canvasMode: 'keep-aspect',
    backdropMode: 'edge-sample',
  },
];

export function getMarketplaceAlignPreset(
  id: MarketplaceAlignPresetId
): MarketplaceAlignPreset {
  return (
    MARKETPLACE_ALIGN_PRESETS.find((p) => p.id === id) ??
    MARKETPLACE_ALIGN_PRESETS[0]
  );
}

export const LIGHT_PRODUCT_SKIP_NOTE =
  'Background cleanup skipped to protect a light product';

export interface AutoCropOptions {
  targetFill: number; // 0.65 - 0.94
  canvasMode: AlignCanvasMode;
  backdropMode: AlignBackdropMode;
  flattenLightBackground?: boolean;
}

export interface AutoCropResult {
  dataUrl: string;
  mediaType: 'image/png';
  width: number;
  height: number;
  packshotCheck: PackshotCheckResult;
  detectedSubjectFound: boolean;
  sourceBox: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  appliedFillPercent: number;
  whiteningSkippedNote?: string;
}

export interface SampledBorderStats {
  hasAlphaBackdrop: boolean;
  bgR: number;
  bgG: number;
  bgB: number;
  bgLuminance: number;
  bgSpread: number;
  bgLab: [number, number, number];
  minBorderLum: number;
  maxBorderLum: number;
  p90DeltaE: number;
  deltaEThreshold: number;
  isLowSatLightBg: boolean;
}

export interface SubjectBoundsResult {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  detectedSubjectFound: boolean;
}

export interface WhiteningSafetyResult {
  aborted: boolean;
  maskPixelCount: number;
  changedPixelCount: number;
  changedRatio: number;
  note?: string;
}

export interface CropWhiteningInput {
  data: Uint8ClampedArray;
  width: number;
  height: number;
  fullFrameHeight: number;
  bgR: number;
  bgG: number;
  bgB: number;
  minBorderLum: number;
  maxBorderLum: number;
  p90DeltaE: number;
  deltaEThreshold: number;
  flattenLightBgToWhite: boolean;
  featherPx?: number;
  beforeSafetyCheck?: (data: Uint8ClampedArray, productMask: Uint8Array) => void;
}

export interface CropWhiteningOutput {
  whiteningApplied: boolean;
  whiteningSkippedForLightProduct: boolean;
  whiteningSkippedNote?: string;
  productMask: Uint8Array;
  borderBgMask: Uint8Array;
  interiorVoidMask: Uint8Array;
  contactShadowMask: Uint8Array;
  productBbox: {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
    found: boolean;
  };
  safety: WhiteningSafetyResult;
}

function median(values: number[]): number {
  if (values.length === 0) return 255;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () =>
      reject(new Error('Failed to load image for auto-crop alignment'));
    img.src = src;
  });
}

export function sampleBorderBackdrop(
  data: Uint8ClampedArray,
  w: number,
  h: number
): SampledBorderStats {
  const borderMargin = Math.max(4, Math.round(Math.min(w, h) * 0.03));
  const cornerSize = Math.max(8, Math.round(Math.min(w, h) * 0.06));
  const borderR: number[] = [];
  const borderG: number[] = [];
  const borderB: number[] = [];
  const borderLums: number[] = [];
  let borderTotal = 0;
  let borderTransparent = 0;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const isEdgeStrip =
        x < borderMargin ||
        x >= w - borderMargin ||
        y < borderMargin ||
        y >= h - borderMargin;
      const isCorner =
        (x < cornerSize || x >= w - cornerSize) &&
        (y < cornerSize || y >= h - cornerSize);
      if (!isEdgeStrip && !isCorner) continue;

      const idx = (y * w + x) * 4;
      const a = data[idx + 3];
      borderTotal++;
      if (a < 235) {
        borderTransparent++;
      } else {
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];
        borderR.push(r);
        borderG.push(g);
        borderB.push(b);
        borderLums.push(0.299 * r + 0.587 * g + 0.114 * b);
      }
    }
  }

  const hasAlphaBackdrop =
    borderTotal > 0 && borderTransparent / borderTotal > 0.2;

  const bgR = borderR.length > 0 ? median(borderR) : 255;
  const bgG = borderG.length > 0 ? median(borderG) : 255;
  const bgB = borderB.length > 0 ? median(borderB) : 255;
  const bgLuminance = 0.299 * bgR + 0.587 * bgG + 0.114 * bgB;
  const bgSpread = Math.max(bgR, bgG, bgB) - Math.min(bgR, bgG, bgB);
  const bgLab = rgbToLab(bgR, bgG, bgB);

  borderLums.sort((a, b) => a - b);
  const minBorderLum =
    borderLums.length > 0
      ? borderLums[Math.floor(borderLums.length * 0.05)]
      : bgLuminance;
  const maxBorderLum =
    borderLums.length > 0
      ? borderLums[Math.min(borderLums.length - 1, Math.floor(borderLums.length * 0.95))]
      : bgLuminance;

  const isLowSatLightBg =
    !hasAlphaBackdrop && bgLuminance >= 200 && bgSpread <= 28;

  const borderDeltaEs: number[] = [];
  for (let i = 0; i < borderR.length; i++) {
    borderDeltaEs.push(
      deltaELab(rgbToLab(borderR[i], borderG[i], borderB[i]), bgLab)
    );
  }
  borderDeltaEs.sort((a, b) => a - b);
  const p90DeltaE =
    borderDeltaEs.length > 0
      ? borderDeltaEs[Math.floor(borderDeltaEs.length * 0.9)]
      : 0;
  const deltaEThreshold = clamp(Math.max(12, p90DeltaE + 3), 12, 18);

  return {
    hasAlphaBackdrop,
    bgR,
    bgG,
    bgB,
    bgLuminance,
    bgSpread,
    bgLab,
    minBorderLum,
    maxBorderLum,
    p90DeltaE,
    deltaEThreshold,
    isLowSatLightBg,
  };
}

export function findSubjectBoundsFromBuffer(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  stats: SampledBorderStats
): SubjectBoundsResult {
  const rowCounts = new Int32Array(h);
  const colCounts = new Int32Array(w);
  const lumCeiling = Math.min(
    255,
    Math.max(stats.bgLuminance + 3, stats.maxBorderLum + 3)
  );

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * 4;
      const a = data[idx + 3];
      let isForeground = false;
      if (stats.hasAlphaBackdrop) {
        isForeground = a >= 24;
      } else if (a >= 24) {
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];
        const lum = 0.299 * r + 0.587 * g + 0.114 * b;
        const pxLab = rgbToLab(r, g, b);
        if (
          deltaELab(pxLab, stats.bgLab) > stats.deltaEThreshold ||
          lum > lumCeiling
        ) {
          isForeground = true;
        }
      }

      if (isForeground) {
        rowCounts[y]++;
        colCounts[x]++;
      }
    }
  }

  const minRowHits = Math.max(2, Math.floor(w * 0.005));
  const minColHits = Math.max(2, Math.floor(h * 0.005));

  let minX = w;
  let maxX = -1;
  let minY = h;
  let maxY = -1;

  for (let x = 0; x < w; x++) {
    if (colCounts[x] >= minColHits) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
    }
  }
  for (let y = 0; y < h; y++) {
    if (rowCounts[y] >= minRowHits) {
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }

  if (maxX < minX || maxY < minY) {
    minX = w;
    maxX = -1;
    minY = h;
    maxY = -1;
    for (let x = 0; x < w; x++) {
      if (colCounts[x] >= 1) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
      }
    }
    for (let y = 0; y < h; y++) {
      if (rowCounts[y] >= 1) {
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  const detectedSubjectFound =
    maxX > minX &&
    maxY > minY &&
    (maxX - minX + 1) * (maxY - minY + 1) > w * h * 0.015;

  return { minX, maxX, minY, maxY, detectedSubjectFound };
}

export function evaluateWhiteningSafety(
  beforeData: Uint8ClampedArray,
  afterData: Uint8ClampedArray,
  productMask: Uint8Array
): WhiteningSafetyResult {
  let maskPixelCount = 0;
  let changedPixelCount = 0;

  for (let p = 0; p < productMask.length; p++) {
    if (!productMask[p]) continue;
    maskPixelCount++;
    const idx = p * 4;

    const aBefore = beforeData[idx + 3] / 255;
    const rB = beforeData[idx] * aBefore + 255 * (1 - aBefore);
    const gB = beforeData[idx + 1] * aBefore + 255 * (1 - aBefore);
    const bB = beforeData[idx + 2] * aBefore + 255 * (1 - aBefore);
    const lumBefore = 0.299 * rB + 0.587 * gB + 0.114 * bB;

    const aAfter = afterData[idx + 3] / 255;
    const rA = afterData[idx] * aAfter + 255 * (1 - aAfter);
    const gA = afterData[idx + 1] * aAfter + 255 * (1 - aAfter);
    const bA = afterData[idx + 2] * aAfter + 255 * (1 - aAfter);
    const lumAfter = 0.299 * rA + 0.587 * gA + 0.114 * bA;

    if (Math.abs(lumAfter - lumBefore) >= 12) {
      changedPixelCount++;
    }
  }

  const changedRatio =
    maskPixelCount > 0 ? changedPixelCount / maskPixelCount : 0;
  const aborted = changedRatio > 0.02;

  return {
    aborted,
    maskPixelCount,
    changedPixelCount,
    changedRatio,
    note: aborted ? LIGHT_PRODUCT_SKIP_NOTE : undefined,
  };
}

/**
 * Pure canvas-free whitening pass safe for white/silver/light products:
 * 1) Border flood fill + protected productMask & productBbox first.
 * 2) Enclosed interior void whitening ONLY for regions surrounded by product pixels
 *    with area < 3% of productBbox and tightly matching the backdrop.
 * 3) Contact shadow normalization ONLY within 6% of frame height below product bottom,
 *    horizontally within productBbox +/- 8%, and connected to the flood-filled background.
 * 4) Safety check: if > 2% of productMask pixels change luminance by >= 12, abort whitening,
 *    restore the original crop bytes, and return LIGHT_PRODUCT_SKIP_NOTE.
 */
export function processCropWhitening(
  input: CropWhiteningInput
): CropWhiteningOutput {
  const {
    data,
    width,
    height,
    fullFrameHeight,
    bgR,
    bgG,
    bgB,
    minBorderLum,
    maxBorderLum,
    p90DeltaE,
    deltaEThreshold,
    flattenLightBgToWhite,
    beforeSafetyCheck,
  } = input;

  const totalPx = width * height;
  const borderBgMask = new Uint8Array(totalPx);
  const productMask = new Uint8Array(totalPx);
  const interiorVoidMask = new Uint8Array(totalPx);
  const contactShadowMask = new Uint8Array(totalPx);

  const bgLab = rgbToLab(bgR, bgG, bgB);
  const bgLuminance = 0.299 * bgR + 0.587 * bgG + 0.114 * bgB;
  const featherPx =
    input.featherPx ?? clamp(Math.round(Math.min(width, height) * 0.02), 3, 14);

  if (!flattenLightBgToWhite) {
    for (let y = 0; y < height; y++) {
      const edgeDistY = Math.min(y, height - 1 - y);
      for (let x = 0; x < width; x++) {
        const edgeDistX = Math.min(x, width - 1 - x);
        const edgeDist = Math.min(edgeDistX, edgeDistY);
        if (edgeDist >= featherPx) continue;
        const idx = (y * width + x) * 4;
        const pxDelta = deltaELab(
          rgbToLab(data[idx], data[idx + 1], data[idx + 2]),
          bgLab
        );
        if (pxDelta <= deltaEThreshold + 4) {
          const t = edgeDist / featherPx;
          data[idx + 3] = Math.round(data[idx + 3] * t);
        }
      }
    }

    return {
      whiteningApplied: false,
      whiteningSkippedForLightProduct: false,
      productMask,
      borderBgMask,
      interiorVoidMask,
      contactShadowMask,
      productBbox: { minX: 0, maxX: -1, minY: 0, maxY: -1, found: false },
      safety: {
        aborted: false,
        maskPixelCount: 0,
        changedPixelCount: 0,
        changedRatio: 0,
      },
    };
  }

  const beforeData = new Uint8ClampedArray(data);
  const lumCeiling = Math.min(
    255,
    Math.max(bgLuminance + 3, maxBorderLum + 3)
  );
  const lumFloor = Math.max(
    192,
    minBorderLum - Math.max(6, Math.round(p90DeltaE * 4))
  );
  const floodDeltaLimit = clamp(
    Math.max(4.2, p90DeltaE + 2.5),
    4.2,
    Math.max(deltaEThreshold, 13)
  );

  // Step 1a: Flood fill connected backdrop from all 4 crop borders
  const visited = new Uint8Array(totalPx);
  const queue = new Int32Array(totalPx);
  let qHead = 0;
  let qTail = 0;

  const isBorderBgPixel = (offset: number): boolean => {
    const a = data[offset + 3];
    if (a < 235) return true;
    const r = data[offset];
    const g = data[offset + 1];
    const b = data[offset + 2];
    const spread = Math.max(r, g, b) - Math.min(r, g, b);
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    if (lum < lumFloor || lum > lumCeiling || spread > 30) return false;
    const pxDelta = deltaELab(rgbToLab(r, g, b), bgLab);
    return pxDelta <= floodDeltaLimit;
  };

  const tryEnqueueBorder = (x: number, y: number) => {
    const p = y * width + x;
    if (visited[p]) return;
    visited[p] = 1;
    if (isBorderBgPixel(p * 4)) {
      borderBgMask[p] = 1;
      queue[qTail++] = p;
    }
  };

  for (let x = 0; x < width; x++) {
    tryEnqueueBorder(x, 0);
    tryEnqueueBorder(x, height - 1);
  }
  for (let y = 1; y < height - 1; y++) {
    tryEnqueueBorder(0, y);
    tryEnqueueBorder(width - 1, y);
  }

  while (qHead < qTail) {
    const p = queue[qHead++];
    const x = p % width;
    const y = (p - x) / width;
    if (x > 0) tryEnqueueBorder(x - 1, y);
    if (x < width - 1) tryEnqueueBorder(x + 1, y);
    if (y > 0) tryEnqueueBorder(x, y - 1);
    if (y < height - 1) tryEnqueueBorder(x, y + 1);
  }

  const tightlyMatchesBackdrop = (offset: number): boolean => {
    const a = data[offset + 3];
    if (a < 235) return true;
    const r = data[offset];
    const g = data[offset + 1];
    const b = data[offset + 2];
    const spread = Math.max(r, g, b) - Math.min(r, g, b);
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    const maxDiff = Math.max(
      Math.abs(r - bgR),
      Math.abs(g - bgG),
      Math.abs(b - bgB)
    );
    if (spread > 12 || maxDiff > 5 || lum > lumCeiling || lum < lumFloor) {
      return false;
    }
    const pxDelta = deltaELab(rgbToLab(r, g, b), bgLab);
    return pxDelta <= 3.5;
  };

  // Step 1b: Compute core product bounds (excluding soft neutral bottom shadow skirt)
  const coreProductMask = new Uint8Array(totalPx);
  let coreMinX = width;
  let coreMaxX = -1;
  let coreMinY = height;
  let coreMaxY = -1;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const p = y * width + x;
      if (borderBgMask[p]) continue;
      const idx = p * 4;
      if (data[idx + 3] < 24) continue;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      const spread = Math.max(r, g, b) - Math.min(r, g, b);
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      const pxDelta = deltaELab(rgbToLab(r, g, b), bgLab);
      if (pxDelta > deltaEThreshold || lum > lumCeiling || spread > 12) {
        coreProductMask[p] = 1;
        if (x < coreMinX) coreMinX = x;
        if (x > coreMaxX) coreMaxX = x;
        if (y < coreMinY) coreMinY = y;
        if (y > coreMaxY) coreMaxY = y;
      }
    }
  }
  const hasCoreBox = coreMaxX >= coreMinX && coreMaxY >= coreMinY;

  // Step 1c: Build protected productMask & initial productBbox
  let prodMinX = width;
  let prodMaxX = -1;
  let prodMinY = height;
  let prodMaxY = -1;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const p = y * width + x;
      if (borderBgMask[p]) continue;
      const idx = p * 4;
      if (data[idx + 3] < 24) continue;

      if (coreProductMask[p]) {
        productMask[p] = 1;
      } else if (!tightlyMatchesBackdrop(idx)) {
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];
        const spread = Math.max(r, g, b) - Math.min(r, g, b);
        const lum = 0.299 * r + 0.587 * g + 0.114 * b;
        const pxDelta = deltaELab(rgbToLab(r, g, b), bgLab);
        const isBelowShadowSkirt =
          hasCoreBox &&
          y > coreMaxY &&
          spread <= 4 &&
          pxDelta <= deltaEThreshold &&
          lum < bgLuminance;
        if (!isBelowShadowSkirt) {
          productMask[p] = 1;
        }
      }

      if (productMask[p]) {
        if (x < prodMinX) prodMinX = x;
        if (x > prodMaxX) prodMaxX = x;
        if (y < prodMinY) prodMinY = y;
        if (y > prodMaxY) prodMaxY = y;
      }
    }
  }

  let hasProductBbox = prodMaxX >= prodMinX && prodMaxY >= prodMinY;
  const prodBboxW = hasProductBbox ? prodMaxX - prodMinX + 1 : 0;
  const prodBboxH = hasProductBbox ? prodMaxY - prodMinY + 1 : 0;
  const prodBboxArea = prodBboxW * prodBboxH;

  // Step 2: Interior void whitening (< 3% of productBbox, fully enclosed by productMask)
  const compVisited = new Uint8Array(totalPx);
  const compQueue = new Int32Array(totalPx);

  for (let start = 0; start < totalPx; start++) {
    if (borderBgMask[start] || productMask[start] || compVisited[start]) {
      continue;
    }

    let cHead = 0;
    let cTail = 0;
    compVisited[start] = 1;
    compQueue[cTail++] = start;

    let touchesCropBorder = false;
    let touchesBorderBg = false;
    let allTightlyMatchBackdrop = true;

    while (cHead < cTail) {
      const p = compQueue[cHead++];
      const x = p % width;
      const y = (p - x) / width;

      if (x === 0 || x === width - 1 || y === 0 || y === height - 1) {
        touchesCropBorder = true;
      }
      if (!tightlyMatchesBackdrop(p * 4)) {
        allTightlyMatchBackdrop = false;
      }

      const neighbors = [
        x > 0 ? p - 1 : -1,
        x < width - 1 ? p + 1 : -1,
        y > 0 ? p - width : -1,
        y < height - 1 ? p + width : -1,
      ];

      for (let i = 0; i < 4; i++) {
        const nb = neighbors[i];
        if (nb < 0) continue;
        if (borderBgMask[nb]) {
          touchesBorderBg = true;
        } else if (!productMask[nb]) {
          if (!compVisited[nb]) {
            compVisited[nb] = 1;
            compQueue[cTail++] = nb;
          }
        }
      }
    }

    const enclosedByProduct =
      hasProductBbox && !touchesCropBorder && !touchesBorderBg;

    if (
      enclosedByProduct &&
      allTightlyMatchBackdrop &&
      cTail < prodBboxArea * 0.03
    ) {
      for (let i = 0; i < cTail; i++) {
        interiorVoidMask[compQueue[i]] = 1;
      }
    } else if (enclosedByProduct) {
      // Large (>= 3%) or non-backdrop region inside product body -> protect in productMask
      for (let i = 0; i < cTail; i++) {
        const p = compQueue[i];
        productMask[p] = 1;
        const x = p % width;
        const y = (p - x) / width;
        if (x < prodMinX) prodMinX = x;
        if (x > prodMaxX) prodMaxX = x;
        if (y < prodMinY) prodMinY = y;
        if (y > prodMaxY) prodMaxY = y;
      }
      hasProductBbox = prodMaxX >= prodMinX && prodMaxY >= prodMinY;
    }
  }

  // Step 3: Contact shadow normalization strictly below productBbox
  if (hasProductBbox && bgLuminance < 252) {
    const shadowMinY = prodMaxY + 1;
    const shadowMaxY = Math.min(
      height - 1,
      prodMaxY + Math.ceil(fullFrameHeight * 0.06)
    );
    const horizPad = Math.round(prodBboxW * 0.08);
    const shadowMinX = Math.max(0, prodMinX - horizPad);
    const shadowMaxX = Math.min(width - 1, prodMaxX + horizPad);

    if (shadowMinY <= shadowMaxY && shadowMinX <= shadowMaxX) {
      const isShadowCandidate = (p: number): boolean => {
        if (productMask[p] || borderBgMask[p] || interiorVoidMask[p]) {
          return false;
        }
        const x = p % width;
        const y = (p - x) / width;
        if (
          y < shadowMinY ||
          y > shadowMaxY ||
          x < shadowMinX ||
          x > shadowMaxX
        ) {
          return false;
        }
        const idx = p * 4;
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];
        const spread = Math.max(r, g, b) - Math.min(r, g, b);
        const lum = 0.299 * r + 0.587 * g + 0.114 * b;
        return spread <= 22 && lum > bgLuminance - 60 && lum < bgLuminance + 8;
      };

      const sQueue = new Int32Array(totalPx);
      let sHead = 0;
      let sTail = 0;

      for (let y = shadowMinY; y <= shadowMaxY; y++) {
        for (let x = shadowMinX; x <= shadowMaxX; x++) {
          const p = y * width + x;
          if (!isShadowCandidate(p)) continue;
          const touchesBg =
            (x > 0 && borderBgMask[p - 1]) ||
            (x < width - 1 && borderBgMask[p + 1]) ||
            (y > 0 && borderBgMask[p - width]) ||
            (y < height - 1 && borderBgMask[p + width]);
          if (touchesBg) {
            contactShadowMask[p] = 1;
            sQueue[sTail++] = p;
          }
        }
      }

      while (sHead < sTail) {
        const p = sQueue[sHead++];
        const x = p % width;
        const y = (p - x) / width;
        const neighbors = [
          x > shadowMinX ? p - 1 : -1,
          x < shadowMaxX ? p + 1 : -1,
          y > shadowMinY ? p - width : -1,
          y < shadowMaxY ? p + width : -1,
        ];
        for (let i = 0; i < 4; i++) {
          const nb = neighbors[i];
          if (nb >= 0 && !contactShadowMask[nb] && isShadowCandidate(nb)) {
            contactShadowMask[nb] = 1;
            sQueue[sTail++] = nb;
          }
        }
      }
    }
  }

  // Apply whitening to borderBgMask, interiorVoidMask, and contactShadowMask only
  // (never touching productMask pixels)
  for (let p = 0; p < totalPx; p++) {
    if (productMask[p]) continue;
    const idx = p * 4;
    if (borderBgMask[p] || interiorVoidMask[p]) {
      data[idx] = 255;
      data[idx + 1] = 255;
      data[idx + 2] = 255;
      data[idx + 3] = 255;
    } else if (contactShadowMask[p]) {
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      const denom = Math.max(12, bgLuminance - 4);
      const normalized = clamp(lum / denom, 0, 1);
      const targetShadowLum =
        lum + (255 - bgLuminance) * Math.pow(normalized, 1.3);
      const deltaLum = Math.max(0, targetShadowLum - lum);
      data[idx] = Math.min(255, Math.round(r + deltaLum));
      data[idx + 1] = Math.min(255, Math.round(g + deltaLum));
      data[idx + 2] = Math.min(255, Math.round(b + deltaLum));
      data[idx + 3] = 255;
    }
  }

  beforeSafetyCheck?.(data, productMask);

  // Step 4: Safety check against protected productMask
  const safety = evaluateWhiteningSafety(beforeData, data, productMask);
  if (safety.aborted) {
    data.set(beforeData);
    return {
      whiteningApplied: false,
      whiteningSkippedForLightProduct: true,
      whiteningSkippedNote: LIGHT_PRODUCT_SKIP_NOTE,
      productMask,
      borderBgMask,
      interiorVoidMask,
      contactShadowMask,
      productBbox: {
        minX: prodMinX,
        maxX: prodMaxX,
        minY: prodMinY,
        maxY: prodMaxY,
        found: hasProductBbox,
      },
      safety,
    };
  }

  return {
    whiteningApplied: true,
    whiteningSkippedForLightProduct: false,
    productMask,
    borderBgMask,
    interiorVoidMask,
    contactShadowMask,
    productBbox: {
      minX: prodMinX,
      maxX: prodMaxX,
      minY: prodMinY,
      maxY: prodMaxY,
      found: hasProductBbox,
    },
    safety,
  };
}

/**
 * Client-side auto-crop and object-centering engine.
 * Detects the product bounding box relative to sampled border color (Delta-E ~12),
 * flattens low-saturation light backgrounds (luminance >= 200) to #FFFFFF safely
 * with protected product masks, enclosed <3% handle-void whitening, bounded contact-shadow
 * normalization, and >2% luminance safety abort.
 */
export async function autoCropAndCenterImage(
  sourceDataUrl: string,
  options: AutoCropOptions
): Promise<AutoCropResult> {
  const img = await loadImageElement(sourceDataUrl);
  const fullW = Math.max(16, img.naturalWidth || img.width);
  const fullH = Math.max(16, img.naturalHeight || img.height);

  // 1. Downscaled detection pass (~480px max)
  const analysisMax = 480;
  const analysisScale = Math.min(1, analysisMax / Math.max(fullW, fullH));
  const aw = Math.max(24, Math.round(fullW * analysisScale));
  const ah = Math.max(24, Math.round(fullH * analysisScale));

  const analysisCanvas = document.createElement('canvas');
  analysisCanvas.width = aw;
  analysisCanvas.height = ah;
  const actx = analysisCanvas.getContext('2d', { willReadFrequently: true });
  if (!actx) {
    throw new Error('Canvas 2D context unavailable');
  }
  actx.clearRect(0, 0, aw, ah);
  actx.drawImage(img, 0, 0, aw, ah);
  const { data } = actx.getImageData(0, 0, aw, ah);

  const borderStats = sampleBorderBackdrop(data, aw, ah);
  const {
    hasAlphaBackdrop,
    bgR,
    bgG,
    bgB,
    minBorderLum,
    maxBorderLum,
    p90DeltaE,
    deltaEThreshold,
    isLowSatLightBg,
  } = borderStats;

  const flattenLightBgToWhite =
    isLowSatLightBg &&
    (options.backdropMode === 'pure-white' ||
      Boolean(options.flattenLightBackground));

  const { minX, maxX, minY, maxY, detectedSubjectFound } =
    findSubjectBoundsFromBuffer(data, aw, ah, borderStats);

  // Convert back to full-res box with 2px safety bleed
  const bleed = Math.max(2, Math.round(Math.max(fullW, fullH) * 0.004));
  const srcX = detectedSubjectFound
    ? clamp(Math.floor(minX / analysisScale) - bleed, 0, fullW - 2)
    : 0;
  const srcY = detectedSubjectFound
    ? clamp(Math.floor(minY / analysisScale) - bleed, 0, fullH - 2)
    : 0;
  const srcRight = detectedSubjectFound
    ? clamp(Math.ceil((maxX + 1) / analysisScale) + bleed, srcX + 2, fullW)
    : fullW;
  const srcBottom = detectedSubjectFound
    ? clamp(Math.ceil((maxY + 1) / analysisScale) + bleed, srcY + 2, fullH)
    : fullH;

  const srcW = Math.max(2, srcRight - srcX);
  const srcH = Math.max(2, srcBottom - srcY);

  // 2. Output canvas geometry
  const outW =
    options.canvasMode === 'square' ? Math.max(fullW, fullH) : fullW;
  const outH =
    options.canvasMode === 'square' ? Math.max(fullW, fullH) : fullH;

  const clampedFill = clamp(options.targetFill, 0.55, 0.94);
  const uniformScale = Math.min(
    (outW * clampedFill) / srcW,
    (outH * clampedFill) / srcH
  );

  const destW = Math.max(2, Math.round(srcW * uniformScale));
  const destH = Math.max(2, Math.round(srcH * uniformScale));
  const destX = Math.round((outW - destW) / 2);
  const destY = Math.round((outH - destH) / 2);

  // 3. Extract cropped region onto scratch canvas and run safe whitening
  const cropCanvas = document.createElement('canvas');
  cropCanvas.width = srcW;
  cropCanvas.height = srcH;
  const cctx = cropCanvas.getContext('2d', { willReadFrequently: true });
  if (!cctx) {
    throw new Error('Scratch canvas context unavailable');
  }
  cctx.clearRect(0, 0, srcW, srcH);
  cctx.drawImage(img, srcX, srcY, srcW, srcH, 0, 0, srcW, srcH);

  let whiteningOutput: CropWhiteningOutput | null = null;
  if (!hasAlphaBackdrop) {
    const cropImg = cctx.getImageData(0, 0, srcW, srcH);
    whiteningOutput = processCropWhitening({
      data: cropImg.data,
      width: srcW,
      height: srcH,
      fullFrameHeight: fullH,
      bgR,
      bgG,
      bgB,
      minBorderLum,
      maxBorderLum,
      p90DeltaE,
      deltaEThreshold,
      flattenLightBgToWhite,
    });
    cctx.putImageData(cropImg, 0, 0);
  }

  // 4. Composite onto centered marketplace-compliant canvas
  const outCanvas = document.createElement('canvas');
  outCanvas.width = outW;
  outCanvas.height = outH;
  const octx = outCanvas.getContext('2d');
  if (!octx) {
    throw new Error('Output canvas context unavailable');
  }

  const whiteningSkipped = Boolean(
    whiteningOutput?.whiteningSkippedForLightProduct
  );
  const useWhiteCanvas =
    !whiteningSkipped &&
    (options.backdropMode === 'pure-white' || flattenLightBgToWhite);
  octx.fillStyle = useWhiteCanvas
    ? '#FFFFFF'
    : `rgb(${bgR}, ${bgG}, ${bgB})`;
  octx.fillRect(0, 0, outW, outH);

  octx.imageSmoothingEnabled = true;
  octx.imageSmoothingQuality = 'high';
  octx.drawImage(cropCanvas, 0, 0, srcW, srcH, destX, destY, destW, destH);

  const outputDataUrl = outCanvas.toDataURL('image/png');
  const packshotCheck = await analyzePackshotImage(outputDataUrl);
  const appliedFillPercent = Math.round(
    Math.max(destW / outW, destH / outH) * 100
  );

  return {
    dataUrl: outputDataUrl,
    mediaType: 'image/png',
    width: outW,
    height: outH,
    packshotCheck,
    detectedSubjectFound,
    sourceBox: {
      x: srcX,
      y: srcY,
      width: srcW,
      height: srcH,
    },
    appliedFillPercent,
    whiteningSkippedNote: whiteningOutput?.whiteningSkippedNote,
  };
}

const MAX_REFERENCE_DATA_URL_BYTES = 3 * 1024 * 1024; // 3 MB

function detectAlphaTransparency(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number
): boolean {
  const sampleMax = 512;
  const stepX = Math.max(1, Math.floor(width / sampleMax));
  const stepY = Math.max(1, Math.floor(height / sampleMax));
  const pixels = ctx.getImageData(0, 0, width, height).data;
  for (let y = 0; y < height; y += stepY) {
    const rowOffset = y * width * 4;
    for (let x = 0; x < width; x += stepX) {
      if (pixels[rowOffset + x * 4 + 3] < 250) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Downscales an image (or rasterizes SVG) so its longest dimension is at most maxDim (default 2048px).
 * Outputs JPEG (quality 0.9) unless source pixels contain alpha transparency, and keeps size under 3 MB.
 */
export async function downscaleImageToMaxDim(
  dataUrl: string,
  maxDim = 2048
): Promise<string> {
  const img = await loadImageElement(dataUrl);
  const w = Math.max(1, img.naturalWidth || img.width);
  const h = Math.max(1, img.naturalHeight || img.height);
  const isSvg = dataUrl.startsWith('data:image/svg');
  const isAlreadyJpeg =
    dataUrl.startsWith('data:image/jpeg') || dataUrl.startsWith('data:image/jpg');

  if (
    isAlreadyJpeg &&
    Math.max(w, h) <= maxDim &&
    dataUrl.length <= MAX_REFERENCE_DATA_URL_BYTES
  ) {
    return dataUrl;
  }

  let targetMax = maxDim;
  for (let pass = 0; pass < 4; pass++) {
    const scale = Math.min(1, targetMax / Math.max(w, h));
    const outW = Math.max(1, Math.round(w * scale));
    const outH = Math.max(1, Math.round(h * scale));

    const canvas = document.createElement('canvas');
    canvas.width = outW;
    canvas.height = outH;
    const ctx = canvas.getContext('2d', { willReadFrequently: !isSvg && !isAlreadyJpeg });
    if (!ctx) return dataUrl;

    ctx.clearRect(0, 0, outW, outH);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, outW, outH);

    const hasTransparency =
      !isSvg && !isAlreadyJpeg && detectAlphaTransparency(ctx, outW, outH);

    if (hasTransparency) {
      const pngUrl = canvas.toDataURL('image/png');
      if (pngUrl.length <= MAX_REFERENCE_DATA_URL_BYTES) {
        return pngUrl;
      }
      // If transparent PNG still exceeds 3 MB at smaller passes, composite on white JPEG as last resort
      if (pass < 3) {
        targetMax = Math.max(512, Math.round(targetMax * 0.72));
        continue;
      }
    }

    // Fill white under transparent/SVG before JPEG encoding
    const jpegCanvas = document.createElement('canvas');
    jpegCanvas.width = outW;
    jpegCanvas.height = outH;
    const jctx = jpegCanvas.getContext('2d');
    if (!jctx) return canvas.toDataURL('image/jpeg', 0.9);
    jctx.fillStyle = '#FFFFFF';
    jctx.fillRect(0, 0, outW, outH);
    jctx.drawImage(canvas, 0, 0);

    for (const quality of [0.9, 0.82, 0.74, 0.65]) {
      const jpegUrl = jpegCanvas.toDataURL('image/jpeg', quality);
      if (jpegUrl.length <= MAX_REFERENCE_DATA_URL_BYTES) {
        return jpegUrl;
      }
    }

    targetMax = Math.max(512, Math.round(targetMax * 0.72));
  }

  return dataUrl;
}

function toHexByte(n: number): string {
  return clamp(Math.round(n), 0, 255).toString(16).padStart(2, '0').toUpperCase();
}

/**
 * Extracts up to `maxColors` dominant non-background colors from a product image
 * using client-side canvas sampling. Border pixels determine backdrop color so
 * studio backgrounds (white, gray, colored sweeps) are excluded.
 */
export async function extractDominantColorsFromImage(
  dataUrl: string,
  maxColors = 4
): Promise<string[]> {
  const img = await loadImageElement(dataUrl);
  const w0 = Math.max(16, img.naturalWidth || img.width);
  const h0 = Math.max(16, img.naturalHeight || img.height);
  const scale = Math.min(1, 160 / Math.max(w0, h0));
  const w = Math.max(16, Math.round(w0 * scale));
  const h = Math.max(16, Math.round(h0 * scale));

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return [];

  ctx.clearRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);
  const { data } = ctx.getImageData(0, 0, w, h);

  const margin = Math.max(2, Math.round(Math.min(w, h) * 0.04));
  const bgR: number[] = [];
  const bgG: number[] = [];
  const bgB: number[] = [];
  let borderTotal = 0;
  let borderAlpha = 0;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (x < margin || x >= w - margin || y < margin || y >= h - margin) {
        const idx = (y * w + x) * 4;
        borderTotal++;
        if (data[idx + 3] < 220) {
          borderAlpha++;
        } else {
          bgR.push(data[idx]);
          bgG.push(data[idx + 1]);
          bgB.push(data[idx + 2]);
        }
      }
    }
  }

  const hasAlphaBg = borderTotal > 0 && borderAlpha / borderTotal > 0.2;
  const medR = bgR.length > 0 ? median(bgR) : 255;
  const medG = bgG.length > 0 ? median(bgG) : 255;
  const medB = bgB.length > 0 ? median(bgB) : 255;
  const isNearWhiteBg = 0.299 * medR + 0.587 * medG + 0.114 * medB >= 235;

  const buckets = new Map<
    number,
    { count: number; sumR: number; sumG: number; sumB: number }
  >();

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      const a = data[idx + 3];

      if (a < 180) continue;
      if (!hasAlphaBg) {
        const diffBg = Math.max(
          Math.abs(r - medR),
          Math.abs(g - medG),
          Math.abs(b - medB)
        );
        const isNearWhite = r >= 238 && g >= 238 && b >= 238;
        if (isNearWhiteBg && isNearWhite) continue;
        if (!isNearWhiteBg && diffBg <= 26) continue;
      }

      const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
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

  const sorted = Array.from(buckets.values()).sort((a, b) => b.count - a.count);
  const chosen: Array<{ r: number; g: number; b: number; hex: string }> = [];

  for (const bucket of sorted) {
    const r = bucket.sumR / bucket.count;
    const g = bucket.sumG / bucket.count;
    const b = bucket.sumB / bucket.count;
    const tooClose = chosen.some((c) => {
      const dist = Math.sqrt((r - c.r) ** 2 + (g - c.g) ** 2 + (b - c.b) ** 2);
      return dist < 44;
    });
    if (!tooClose) {
      chosen.push({
        r,
        g,
        b,
        hex: `#${toHexByte(r)}${toHexByte(g)}${toHexByte(b)}`,
      });
    }
    if (chosen.length >= maxColors) break;
  }

  return chosen.map((c) => c.hex);
}
