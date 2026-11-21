export type PackshotBackgroundStatus = 'pure-white' | 'off-white' | 'gray';

export interface PackshotCheckResult {
  borderPureWhitePass: boolean;
  borderWhitePercent: number;
  frameFillPass: boolean;
  frameFillPercent: number;
  overallPass: boolean;
  backgroundStatus?: PackshotBackgroundStatus;
  backgroundHex?: string;
  backgroundLuminance?: number;
  backgroundLabel?: string;
}

export function formatPackshotBackgroundLabel(check: PackshotCheckResult): string {
  if (check.backgroundLabel) {
    return check.backgroundLabel;
  }
  if (check.borderPureWhitePass) {
    return 'Background: pure white';
  }
  if (check.backgroundStatus === 'gray') {
    return 'Background: gray';
  }
  if (check.backgroundHex) {
    return `Background: off-white (${check.backgroundHex})`;
  }
  return 'Background: off-white';
}

function median(values: number[]): number {
  if (values.length === 0) return 255;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function toHexByte(n: number): string {
  return Math.max(0, Math.min(255, Math.round(n)))
    .toString(16)
    .padStart(2, '0')
    .toUpperCase();
}

function srgbChannelToLinear(c: number): number {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

function labF(t: number): number {
  return t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116;
}

export function rgbToLab(
  r: number,
  g: number,
  b: number
): [l: number, a: number, bVal: number] {
  const rl = srgbChannelToLinear(r);
  const gl = srgbChannelToLinear(g);
  const bl = srgbChannelToLinear(b);

  // sRGB D65 to XYZ
  const x = (rl * 0.4124564 + gl * 0.3575761 + bl * 0.1804375) / 0.95047;
  const y = (rl * 0.2126729 + gl * 0.7151522 + bl * 0.072175) / 1.0;
  const z = (rl * 0.0193339 + gl * 0.119192 + bl * 0.9503041) / 1.08883;

  const fx = labF(x);
  const fy = labF(y);
  const fz = labF(z);

  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

export function deltaELab(
  lab1: readonly [number, number, number],
  lab2: readonly [number, number, number]
): number {
  const dl = lab1[0] - lab2[0];
  const da = lab1[1] - lab2[1];
  const db = lab1[2] - lab2[2];
  return Math.sqrt(dl * dl + da * da + db * db);
}

const PACKSHOT_DELTA_E_THRESHOLD = 12;

/**
 * Pure buffer-based packshot analyzer (canvas-free for Node tests & browser reuse).
 * 1) Samples corners + edge border strips to compute median background RGB and pure-white percentage.
 * 2) Computes product bounding box by CIE76 Delta-E distance (~12) from sampled background.
 * 3) Verifies frame occupancy (80-90%) from the real bounding box max dimension.
 */
export function analyzePackshotBuffer(
  data: Uint8ClampedArray,
  w: number,
  h: number
): PackshotCheckResult {
  const borderMargin = Math.max(4, Math.round(Math.min(w, h) * 0.03));
  const cornerSize = Math.max(8, Math.round(Math.min(w, h) * 0.06));
  const borderR: number[] = [];
  const borderG: number[] = [];
  const borderB: number[] = [];
  let borderSamples = 0;
  let pureWhiteBorderSamples = 0;

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
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];

      borderSamples++;
      borderR.push(r);
      borderG.push(g);
      borderB.push(b);

      if (r >= 246 && g >= 246 && b >= 246) {
        pureWhiteBorderSamples++;
      }
    }
  }

  const bgR = median(borderR);
  const bgG = median(borderG);
  const bgB = median(borderB);
  const bgHex = `#${toHexByte(bgR)}${toHexByte(bgG)}${toHexByte(bgB)}`;
  const backgroundLuminance = Math.round(0.299 * bgR + 0.587 * bgG + 0.114 * bgB);

  const borderWhitePercent =
    borderSamples > 0 ? Math.round((pureWhiteBorderSamples / borderSamples) * 100) : 0;
  const borderPureWhitePass =
    borderWhitePercent >= 95 && bgR >= 246 && bgG >= 246 && bgB >= 246;

  let backgroundStatus: PackshotBackgroundStatus;
  let backgroundLabel: string;
  if (borderPureWhitePass) {
    backgroundStatus = 'pure-white';
    backgroundLabel = 'Background: pure white';
  } else if (backgroundLuminance >= 225) {
    backgroundStatus = 'off-white';
    backgroundLabel = `Background: off-white (${bgHex})`;
  } else {
    backgroundStatus = 'gray';
    backgroundLabel = 'Background: gray';
  }

  // Compute foreground bounding box by Delta-E color distance (~12) from sampled background
  const bgLab = rgbToLab(bgR, bgG, bgB);
  const rowCounts = new Int32Array(h);
  const colCounts = new Int32Array(w);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * 4;
      const pxLab = rgbToLab(data[idx], data[idx + 1], data[idx + 2]);
      if (deltaELab(pxLab, bgLab) > PACKSHOT_DELTA_E_THRESHOLD) {
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

  // Fallback to single-pixel hits for delicate thin subjects
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

  let frameFillPercent = 0;
  if (maxX >= minX && maxY >= minY) {
    const bboxW = (maxX - minX + 1) / w;
    const bboxH = (maxY - minY + 1) / h;
    frameFillPercent = Math.round(Math.max(bboxW, bboxH) * 100);
  }

  const frameFillPass = frameFillPercent >= 80 && frameFillPercent <= 90;

  return {
    borderPureWhitePass,
    borderWhitePercent,
    frameFillPass,
    frameFillPercent,
    overallPass: borderPureWhitePass && frameFillPass,
    backgroundStatus,
    backgroundHex: bgHex,
    backgroundLuminance,
    backgroundLabel,
  };
}

/**
 * Client-side canvas analyzer for white-background packshots.
 * 1) Samples corners + edge border strips to compute median background RGB and pure-white percentage.
 * 2) Computes product bounding box by CIE76 Delta-E distance (~12) from sampled background.
 * 3) Verifies frame occupancy (80-90%) from the real bounding box max dimension.
 */
export async function analyzePackshotImage(dataUrl: string): Promise<PackshotCheckResult> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';

    img.onload = () => {
      try {
        const maxDim = 360;
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        const w = Math.max(16, Math.round(img.width * scale));
        const h = Math.max(16, Math.round(img.height * scale));

        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) {
          reject(new Error('Canvas context unavailable'));
          return;
        }

        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);

        const { data } = ctx.getImageData(0, 0, w, h);
        resolve(analyzePackshotBuffer(data, w, h));
      } catch (err) {
        reject(err);
      }
    };

    img.onerror = () => reject(new Error('Failed to load image for packshot analysis'));
    img.src = dataUrl;
  });
}
