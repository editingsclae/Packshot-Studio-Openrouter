export interface PackshotCheckResult {
  borderPureWhitePass: boolean;
  borderWhitePercent: number;
  frameFillPass: boolean;
  frameFillPercent: number;
  overallPass: boolean;
}

/**
 * Client-side canvas analyzer for white-background packshots.
 * 1) Samples perimeter border pixels to verify pure white (#FFFFFF).
 * 2) Measures non-white pixel bounding box to verify 80-90% frame occupancy.
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

        const borderMargin = Math.max(3, Math.round(Math.min(w, h) * 0.02));
        let borderSamples = 0;
        let pureWhiteBorderSamples = 0;

        let minX = w;
        let maxX = -1;
        let minY = h;
        let maxY = -1;

        for (let y = 0; y < h; y++) {
          for (let x = 0; x < w; x++) {
            const idx = (y * w + x) * 4;
            const r = data[idx];
            const g = data[idx + 1];
            const b = data[idx + 2];

            const isBorder =
              x < borderMargin ||
              x >= w - borderMargin ||
              y < borderMargin ||
              y >= h - borderMargin;

            const isPureWhite = r >= 246 && g >= 246 && b >= 246;
            const isForeground = r < 242 || g < 242 || b < 242;

            if (isBorder) {
              borderSamples++;
              if (isPureWhite) {
                pureWhiteBorderSamples++;
              }
            }

            if (isForeground) {
              if (x < minX) minX = x;
              if (x > maxX) maxX = x;
              if (y < minY) minY = y;
              if (y > maxY) maxY = y;
            }
          }
        }

        const borderWhitePercent =
          borderSamples > 0 ? Math.round((pureWhiteBorderSamples / borderSamples) * 100) : 0;
        const borderPureWhitePass = borderWhitePercent >= 95;

        let frameFillPercent = 0;
        if (maxX >= minX && maxY >= minY) {
          const bboxW = (maxX - minX + 1) / w;
          const bboxH = (maxY - minY + 1) / h;
          frameFillPercent = Math.round(Math.max(bboxW, bboxH) * 100);
        }

        // Target 80-90% (allow slim tolerance 78-92% for realistic studio soft shadows)
        const frameFillPass = frameFillPercent >= 78 && frameFillPercent <= 92;

        resolve({
          borderPureWhitePass,
          borderWhitePercent,
          frameFillPass,
          frameFillPercent,
          overallPass: borderPureWhitePass && frameFillPass,
        });
      } catch (err) {
        reject(err);
      }
    };

    img.onerror = () => reject(new Error('Failed to load image for packshot analysis'));
    img.src = dataUrl;
  });
}
