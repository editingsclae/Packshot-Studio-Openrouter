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

/**
 * Client-side auto-crop and object-centering engine.
 * Detects the product bounding box relative to sampled border color (Delta-E ~12),
 * flattens low-saturation light backgrounds (luminance >= 200) to #FFFFFF while keeping
 * soft contact shadows, and centers + scales to exact marketplace targets.
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

  const borderMargin = Math.max(4, Math.round(Math.min(aw, ah) * 0.03));
  const cornerSize = Math.max(8, Math.round(Math.min(aw, ah) * 0.06));
  const borderR: number[] = [];
  const borderG: number[] = [];
  const borderB: number[] = [];
  let borderTotal = 0;
  let borderTransparent = 0;

  for (let y = 0; y < ah; y++) {
    for (let x = 0; x < aw; x++) {
      const isEdgeStrip =
        x < borderMargin ||
        x >= aw - borderMargin ||
        y < borderMargin ||
        y >= ah - borderMargin;
      const isCorner =
        (x < cornerSize || x >= aw - cornerSize) &&
        (y < cornerSize || y >= ah - cornerSize);
      if (!isEdgeStrip && !isCorner) continue;

      const idx = (y * aw + x) * 4;
      const a = data[idx + 3];
      borderTotal++;
      if (a < 235) {
        borderTransparent++;
      } else {
        borderR.push(data[idx]);
        borderG.push(data[idx + 1]);
        borderB.push(data[idx + 2]);
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

  const isLowSatLightBg =
    !hasAlphaBackdrop && bgLuminance >= 200 && bgSpread <= 28;
  const flattenLightBgToWhite =
    isLowSatLightBg &&
    (options.backdropMode === 'pure-white' ||
      Boolean(options.flattenLightBackground));

  // Estimate subtle gradient / compression noise on the border in Lab Delta-E
  const borderDeltaEs: number[] = [];
  for (let i = 0; i < borderR.length; i++) {
    borderDeltaEs.push(deltaELab(rgbToLab(borderR[i], borderG[i], borderB[i]), bgLab));
  }
  borderDeltaEs.sort((a, b) => a - b);
  const p90DeltaE =
    borderDeltaEs.length > 0
      ? borderDeltaEs[Math.floor(borderDeltaEs.length * 0.9)]
      : 4;
  const deltaEThreshold = clamp(Math.max(12, p90DeltaE + 3), 12, 18);

  // Build row/col occupancy counts using Delta-E from sampled background
  const rowCounts = new Int32Array(ah);
  const colCounts = new Int32Array(aw);

  for (let y = 0; y < ah; y++) {
    for (let x = 0; x < aw; x++) {
      const idx = (y * aw + x) * 4;
      const a = data[idx + 3];
      let isForeground = false;
      if (hasAlphaBackdrop) {
        isForeground = a >= 24;
      } else if (a >= 24) {
        const pxLab = rgbToLab(data[idx], data[idx + 1], data[idx + 2]);
        if (deltaELab(pxLab, bgLab) > deltaEThreshold) {
          isForeground = true;
        }
      }

      if (isForeground) {
        rowCounts[y]++;
        colCounts[x]++;
      }
    }
  }

  const minRowHits = Math.max(2, Math.floor(aw * 0.005));
  const minColHits = Math.max(2, Math.floor(ah * 0.005));

  let minX = aw;
  let maxX = -1;
  let minY = ah;
  let maxY = -1;

  for (let x = 0; x < aw; x++) {
    if (colCounts[x] >= minColHits) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
    }
  }
  for (let y = 0; y < ah; y++) {
    if (rowCounts[y] >= minRowHits) {
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }

  // Fallback to single-pixel hits if product is super thin
  if (maxX < minX || maxY < minY) {
    minX = aw;
    maxX = -1;
    minY = ah;
    maxY = -1;
    for (let x = 0; x < aw; x++) {
      if (colCounts[x] >= 1) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
      }
    }
    for (let y = 0; y < ah; y++) {
      if (rowCounts[y] >= 1) {
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  const detectedSubjectFound =
    maxX > minX &&
    maxY > minY &&
    (maxX - minX + 1) * (maxY - minY + 1) > aw * ah * 0.015;

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

  // 3. Extract cropped region onto scratch canvas, whiten connected low-sat light background
  //    to #FFFFFF while keeping soft contact shadow beneath the product intact.
  const cropCanvas = document.createElement('canvas');
  cropCanvas.width = srcW;
  cropCanvas.height = srcH;
  const cctx = cropCanvas.getContext('2d', { willReadFrequently: true });
  if (!cctx) {
    throw new Error('Scratch canvas context unavailable');
  }
  cctx.clearRect(0, 0, srcW, srcH);
  cctx.drawImage(img, srcX, srcY, srcW, srcH, 0, 0, srcW, srcH);

  if (!hasAlphaBackdrop) {
    const cropImg = cctx.getImageData(0, 0, srcW, srcH);
    const cd = cropImg.data;
    const featherPx = clamp(Math.round(Math.min(srcW, srcH) * 0.02), 3, 14);

    if (flattenLightBgToWhite) {
      // Flood-fill from the crop perimeter across low-saturation light background pixels
      // so interior white highlights on white products are untouched while background becomes #FFFFFF.
      const totalPx = srcW * srcH;
      const visited = new Uint8Array(totalPx);
      const isBgSeed = new Uint8Array(totalPx);
      const queue = new Int32Array(totalPx);
      let qHead = 0;
      let qTail = 0;

      const isBackgroundPixel = (offset: number): boolean => {
        const r = cd[offset];
        const g = cd[offset + 1];
        const b = cd[offset + 2];
        const spread = Math.max(r, g, b) - Math.min(r, g, b);
        const lum = 0.299 * r + 0.587 * g + 0.114 * b;
        if (lum < 192 || spread > 30) return false;
        const pxDelta = deltaELab(rgbToLab(r, g, b), bgLab);
        return pxDelta <= Math.max(deltaEThreshold, 13);
      };

      const tryEnqueue = (x: number, y: number) => {
        const p = y * srcW + x;
        if (visited[p]) return;
        visited[p] = 1;
        if (isBackgroundPixel(p * 4)) {
          isBgSeed[p] = 1;
          queue[qTail++] = p;
        }
      };

      for (let x = 0; x < srcW; x++) {
        tryEnqueue(x, 0);
        tryEnqueue(x, srcH - 1);
      }
      for (let y = 1; y < srcH - 1; y++) {
        tryEnqueue(0, y);
        tryEnqueue(srcW - 1, y);
      }

      while (qHead < qTail) {
        const p = queue[qHead++];
        const x = p % srcW;
        const y = (p - x) / srcW;
        if (x > 0) tryEnqueue(x - 1, y);
        if (x < srcW - 1) tryEnqueue(x + 1, y);
        if (y > 0) tryEnqueue(x, y - 1);
        if (y < srcH - 1) tryEnqueue(x, y + 1);
      }

      // Flatten connected background AND smoothly feather low-saturation contact shadow transitions into #FFFFFF
      for (let y = 0; y < srcH; y++) {
        const edgeDistY = Math.min(y, srcH - 1 - y);
        for (let x = 0; x < srcW; x++) {
          const edgeDistX = Math.min(x, srcW - 1 - x);
          const edgeDist = Math.min(edgeDistX, edgeDistY);
          const p = y * srcW + x;
          const idx = p * 4;
          const r = cd[idx];
          const g = cd[idx + 1];
          const b = cd[idx + 2];

          if (isBgSeed[p]) {
            cd[idx] = 255;
            cd[idx + 1] = 255;
            cd[idx + 2] = 255;
            cd[idx + 3] = 0;
            continue;
          }

          const spread = Math.max(r, g, b) - Math.min(r, g, b);
          const lum = 0.299 * r + 0.587 * g + 0.114 * b;
          const pxDelta = deltaELab(rgbToLab(r, g, b), bgLab);

          // Closed interior background voids (e.g. inside handles) matching border color tightly
          if (
            pxDelta <= 8 &&
            spread <= 20 &&
            lum >= 198 &&
            Math.abs(lum - bgLuminance) <= 10
          ) {
            cd[idx] = 255;
            cd[idx + 1] = 255;
            cd[idx + 2] = 255;
            cd[idx + 3] = 0;
            continue;
          }

          // Preserve soft contact shadow while normalizing neutral shadow tail smoothly toward #FFFFFF
          if (
            y >= srcH * 0.55 &&
            spread <= 22 &&
            lum > bgLuminance - 60 &&
            lum < bgLuminance + 8 &&
            bgLuminance < 252
          ) {
            // Remap neutral shadow luminance linearly from [bgLum-60..bgLum] -> [lum..255]
            const denom = Math.max(12, bgLuminance - 4);
            const normalized = clamp(lum / denom, 0, 1);
            const targetShadowLum = lum + (255 - bgLuminance) * Math.pow(normalized, 1.3);
            const deltaLum = Math.max(0, targetShadowLum - lum);
            cd[idx] = Math.min(255, Math.round(r + deltaLum));
            cd[idx + 1] = Math.min(255, Math.round(g + deltaLum));
            cd[idx + 2] = Math.min(255, Math.round(b + deltaLum));
          } else if (edgeDist < featherPx && pxDelta <= deltaEThreshold + 6) {
            const t = edgeDist / featherPx;
            cd[idx + 3] = Math.round(cd[idx + 3] * t);
          }
        }
      }
    } else {
      for (let y = 0; y < srcH; y++) {
        const edgeDistY = Math.min(y, srcH - 1 - y);
        for (let x = 0; x < srcW; x++) {
          const edgeDistX = Math.min(x, srcW - 1 - x);
          const edgeDist = Math.min(edgeDistX, edgeDistY);
          const idx = (y * srcW + x) * 4;
          const pxDelta = deltaELab(rgbToLab(cd[idx], cd[idx + 1], cd[idx + 2]), bgLab);

          if (edgeDist < featherPx && pxDelta <= deltaEThreshold + 4) {
            const t = edgeDist / featherPx;
            cd[idx + 3] = Math.round(cd[idx + 3] * t);
          }
        }
      }
    }

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

  const useWhiteCanvas =
    options.backdropMode === 'pure-white' || flattenLightBgToWhite;
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
