import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import ts from 'typescript';

const rootDir = path.resolve(import.meta.dirname, '..');
const nodeRequire = createRequire(import.meta.url);
const moduleCache = new Map();

function loadTsModule(relPath) {
  const fullPath = path.resolve(rootDir, relPath);
  if (moduleCache.has(fullPath)) {
    return moduleCache.get(fullPath);
  }

  const source = fs.readFileSync(fullPath, 'utf8');
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
  });

  const mod = { exports: {} };
  moduleCache.set(fullPath, mod.exports);

  const localRequire = (specifier) => {
    if (specifier.startsWith('.')) {
      const resolvedBase = path.resolve(path.dirname(fullPath), specifier);
      const candidates = [
        resolvedBase,
        `${resolvedBase}.ts`,
        `${resolvedBase}.tsx`,
        path.join(resolvedBase, 'index.ts'),
      ];
      for (const candidate of candidates) {
        if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
          return loadTsModule(path.relative(rootDir, candidate));
        }
      }
    }
    return nodeRequire(specifier);
  };

  const wrapped = `(function(exports, require, module, __filename, __dirname) {\n${transpiled.outputText}\n})`;
  const compiled = vm.runInThisContext(wrapped, { filename: fullPath });
  compiled(mod.exports, localRequire, mod, fullPath, path.dirname(fullPath));
  moduleCache.set(fullPath, mod.exports);
  return mod.exports;
}

const { analyzePackshotBuffer } = loadTsModule('lib/packshot-check.ts');
const {
  LIGHT_PRODUCT_SKIP_NOTE,
  findSubjectBoundsFromBuffer,
  processCropWhitening,
  sampleBorderBackdrop,
} = loadTsModule('lib/packshot-crop.ts');

function createSolidBuffer(w, h, r, g, b, a = 255) {
  const buf = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    const idx = i * 4;
    buf[idx] = r;
    buf[idx + 1] = g;
    buf[idx + 2] = b;
    buf[idx + 3] = a;
  }
  return buf;
}

function fillRect(buf, w, x0, y0, x1, y1, r, g, b, a = 255) {
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const idx = (y * w + x) * 4;
      buf[idx] = r;
      buf[idx + 1] = g;
      buf[idx + 2] = b;
      buf[idx + 3] = a;
    }
  }
}

function getPixel(buf, w, x, y) {
  const idx = (y * w + x) * 4;
  return [buf[idx], buf[idx + 1], buf[idx + 2], buf[idx + 3]];
}

function assertPixelsUnchanged(before, after, w, coords, label) {
  for (const [x, y] of coords) {
    const pBefore = getPixel(before, w, x, y);
    const pAfter = getPixel(after, w, x, y);
    assert.deepStrictEqual(
      pAfter,
      pBefore,
      `${label} pixel (${x},${y}) changed from [${pBefore}] to [${pAfter}]`
    );
  }
}

function collectRectCoords(x0, y0, x1, y1, excludeFn = null) {
  const coords = [];
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if (excludeFn && excludeFn(x, y)) continue;
      coords.push([x, y]);
    }
  }
  return coords;
}

// ---------------------------------------------------------------------------
// Case 1: White mug on #F4F4F4 (protect body, shading, >=3% body interior; whiten <3% handle hole + border)
// ---------------------------------------------------------------------------
{
  const w = 120;
  const h = 120;
  const data = createSolidBuffer(w, h, 0xf4, 0xf4, 0xf4);

  // Mug body (51x79 => bbox w~74, h=79 => area ~5846; 3% threshold ~ 175px)
  fillRect(data, w, 22, 20, 72, 98, 255, 255, 255);
  // Ceramic interior shading & dark rim highlight
  fillRect(data, w, 26, 23, 68, 30, 0xd8, 0xd8, 0xd8);
  fillRect(data, w, 28, 31, 66, 38, 0xc8, 0xc8, 0xc8);
  // Subtle large (>=3%) interior highlight patch matching #F4F4F4 inside mug body: 20x18 = 360px (> 175px)
  fillRect(data, w, 36, 52, 55, 69, 0xf4, 0xf4, 0xf4);

  // Mug handle outer loop (x: 73..95, y: 36..78)
  fillRect(data, w, 73, 36, 95, 78, 255, 255, 255);
  fillRect(data, w, 73, 39, 92, 41, 0xe8, 0xe8, 0xe8);
  // Enclosed handle hole (<3% of product bbox: 8x16 = 128px < 175px) filled with #F4F4F4
  fillRect(data, w, 79, 48, 86, 63, 0xf4, 0xf4, 0xf4);

  const before = new Uint8ClampedArray(data);
  const stats = sampleBorderBackdrop(data, w, h);
  const bounds = findSubjectBoundsFromBuffer(data, w, h, stats);
  assert.strictEqual(bounds.detectedSubjectFound, true, 'White mug subject should be detected');

  const out = processCropWhitening({
    data,
    width: w,
    height: h,
    fullFrameHeight: h,
    bgR: stats.bgR,
    bgG: stats.bgG,
    bgB: stats.bgB,
    minBorderLum: stats.minBorderLum,
    maxBorderLum: stats.maxBorderLum,
    p90DeltaE: stats.p90DeltaE,
    deltaEThreshold: stats.deltaEThreshold,
    flattenLightBgToWhite: true,
  });

  assert.strictEqual(out.whiteningApplied, true);
  assert.strictEqual(out.whiteningSkippedForLightProduct, false);

  const bodyCoords = collectRectCoords(22, 20, 72, 98);
  const handleLoopCoords = collectRectCoords(
    73,
    36,
    95,
    78,
    (x, y) => x >= 79 && x <= 86 && y >= 48 && y <= 63
  );

  assertPixelsUnchanged(before, data, w, bodyCoords, 'White mug body');
  assertPixelsUnchanged(before, data, w, handleLoopCoords, 'White mug handle');

  // Verify small enclosed handle hole (<3%) became #FFFFFF
  for (let y = 48; y <= 63; y++) {
    for (let x = 79; x <= 86; x++) {
      assert.deepStrictEqual(
        getPixel(data, w, x, y),
        [255, 255, 255, 255],
        `Handle hole pixel (${x},${y}) should be whitened to #FFFFFF`
      );
    }
  }

  // Verify outer border became #FFFFFF
  assert.deepStrictEqual(getPixel(data, w, 0, 0), [255, 255, 255, 255]);
  assert.deepStrictEqual(getPixel(data, w, 119, 119), [255, 255, 255, 255]);
  const check = analyzePackshotBuffer(data, w, h);
  assert.strictEqual(check.borderPureWhitePass, true, 'White mug border should pass pure white check');
}

// ---------------------------------------------------------------------------
// Case 2: Silver watch on #EDEDED
// ---------------------------------------------------------------------------
{
  const w = 120;
  const h = 120;
  const data = createSolidBuffer(w, h, 0xed, 0xed, 0xed);

  // Silver bracelet straps (#DCDFE3) + bright center links (#E0E2E5)
  fillRect(data, w, 42, 12, 77, 107, 0xdc, 0xdf, 0xe3);
  fillRect(data, w, 53, 16, 66, 28, 0xe0, 0xe2, 0xe5);
  fillRect(data, w, 53, 91, 66, 103, 0xe0, 0xe2, 0xe5);

  // Watch bezel (#8E9298), brushed steel inner bezel (#DCDFE3), specular highlight (#FFFFFF), dark dial (#1C1E22)
  fillRect(data, w, 28, 32, 91, 87, 0x8e, 0x92, 0x98);
  fillRect(data, w, 32, 36, 87, 83, 0xdc, 0xdf, 0xe3);
  fillRect(data, w, 32, 36, 39, 43, 0xff, 0xff, 0xff);
  fillRect(data, w, 38, 42, 81, 77, 0x1c, 0x1e, 0x22);
  // Subtle light silver dial markers (<3%)
  fillRect(data, w, 58, 46, 61, 52, 0xe6, 0xe8, 0xeb);

  const before = new Uint8ClampedArray(data);
  const stats = sampleBorderBackdrop(data, w, h);
  const out = processCropWhitening({
    data,
    width: w,
    height: h,
    fullFrameHeight: h,
    bgR: stats.bgR,
    bgG: stats.bgG,
    bgB: stats.bgB,
    minBorderLum: stats.minBorderLum,
    maxBorderLum: stats.maxBorderLum,
    p90DeltaE: stats.p90DeltaE,
    deltaEThreshold: stats.deltaEThreshold,
    flattenLightBgToWhite: true,
  });

  assert.strictEqual(out.whiteningApplied, true);
  assert.strictEqual(out.whiteningSkippedForLightProduct, false);

  const strapCoords = collectRectCoords(42, 12, 77, 107);
  const caseCoords = collectRectCoords(28, 32, 91, 87);
  assertPixelsUnchanged(before, data, w, strapCoords, 'Silver watch strap');
  assertPixelsUnchanged(before, data, w, caseCoords, 'Silver watch case');

  assert.deepStrictEqual(getPixel(data, w, 2, 2), [255, 255, 255, 255]);
  assert.deepStrictEqual(getPixel(data, w, 115, 115), [255, 255, 255, 255]);
  const check = analyzePackshotBuffer(data, w, h);
  assert.strictEqual(check.borderPureWhitePass, true, 'Silver watch border should pass pure white check');
}

// ---------------------------------------------------------------------------
// Case 3: Black product on #F0F0F0 with soft contact shadow
// ---------------------------------------------------------------------------
{
  const w = 140;
  const h = 140;
  const data = createSolidBuffer(w, h, 0xf0, 0xf0, 0xf0);

  // Black product body (#1C1C1E)
  fillRect(data, w, 35, 20, 104, 105, 0x1c, 0x1c, 0x1e);

  // Soft neutral contact shadow strictly beneath base (within 6% of 140 = ~9px below 105)
  fillRect(data, w, 33, 106, 106, 109, 0xd4, 0xd4, 0xd4);
  fillRect(data, w, 31, 110, 108, 113, 0xe4, 0xe4, 0xe4);

  // Neutral spot well outside 6% shadow zone & not connected to contact shadow
  fillRect(data, w, 118, 126, 122, 130, 0xd8, 0xd8, 0xd8);

  const before = new Uint8ClampedArray(data);
  const stats = sampleBorderBackdrop(data, w, h);
  const out = processCropWhitening({
    data,
    width: w,
    height: h,
    fullFrameHeight: h,
    bgR: stats.bgR,
    bgG: stats.bgG,
    bgB: stats.bgB,
    minBorderLum: stats.minBorderLum,
    maxBorderLum: stats.maxBorderLum,
    p90DeltaE: stats.p90DeltaE,
    deltaEThreshold: stats.deltaEThreshold,
    flattenLightBgToWhite: true,
  });

  assert.strictEqual(out.whiteningApplied, true);
  assert.strictEqual(out.whiteningSkippedForLightProduct, false);

  const productCoords = collectRectCoords(35, 20, 104, 105);
  assertPixelsUnchanged(before, data, w, productCoords, 'Black product body');

  // Verify contactShadowMask stayed within 6% below prodMaxY and +/-8% horizontally
  const maxAllowedShadowY = out.productBbox.maxY + Math.ceil(h * 0.06);
  const bboxW = out.productBbox.maxX - out.productBbox.minX + 1;
  const minAllowedShadowX = out.productBbox.minX - Math.round(bboxW * 0.08);
  const maxAllowedShadowX = out.productBbox.maxX + Math.round(bboxW * 0.08);

  let shadowMaskCount = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = y * w + x;
      if (!out.contactShadowMask[p]) continue;
      shadowMaskCount++;
      assert.ok(y > out.productBbox.maxY, 'Shadow mask must never be inside product bbox');
      assert.ok(y <= maxAllowedShadowY, `Shadow mask y=${y} exceeded 6% height zone (${maxAllowedShadowY})`);
      assert.ok(
        x >= minAllowedShadowX && x <= maxAllowedShadowX,
        `Shadow mask x=${x} exceeded +/-8% horizontal zone`
      );
    }
  }
  assert.ok(shadowMaskCount > 0, 'Soft contact shadow pixels below base should be normalized');

  // Outside spot (120, 128) must NOT be in contactShadowMask
  assert.strictEqual(out.contactShadowMask[128 * w + 120], 0);

  // Outer #F0F0F0 border became #FFFFFF
  assert.deepStrictEqual(getPixel(data, w, 3, 3), [255, 255, 255, 255]);
  assert.deepStrictEqual(getPixel(data, w, 136, 136), [255, 255, 255, 255]);
  const check = analyzePackshotBuffer(data, w, h);
  assert.strictEqual(check.borderPureWhitePass, true, 'Black product border should pass pure white check');
}

// ---------------------------------------------------------------------------
// Case 4: Safety abort (>2% of protected productMask pixels shifted by lum >= 12)
// ---------------------------------------------------------------------------
{
  const w = 100;
  const h = 100;
  const data = createSolidBuffer(w, h, 0xf4, 0xf4, 0xf4);
  fillRect(data, w, 25, 25, 74, 74, 255, 255, 255);
  const originalSnapshot = new Uint8ClampedArray(data);

  const stats = sampleBorderBackdrop(data, w, h);
  const out = processCropWhitening({
    data,
    width: w,
    height: h,
    fullFrameHeight: h,
    bgR: stats.bgR,
    bgG: stats.bgG,
    bgB: stats.bgB,
    minBorderLum: stats.minBorderLum,
    maxBorderLum: stats.maxBorderLum,
    p90DeltaE: stats.p90DeltaE,
    deltaEThreshold: stats.deltaEThreshold,
    flattenLightBgToWhite: true,
    // Simulate >2% protected mask corruption before the safety gate
    beforeSafetyCheck: (buf, mask) => {
      let seen = 0;
      for (let p = 0; p < mask.length; p++) {
        if (!mask[p]) continue;
        seen++;
        if (seen % 10 === 0) {
          const idx = p * 4;
          buf[idx] = Math.max(0, buf[idx] - 25);
          buf[idx + 1] = Math.max(0, buf[idx + 1] - 25);
          buf[idx + 2] = Math.max(0, buf[idx + 2] - 25);
        }
      }
    },
  });

  assert.strictEqual(out.whiteningApplied, false);
  assert.strictEqual(out.whiteningSkippedForLightProduct, true);
  assert.strictEqual(out.whiteningSkippedNote, LIGHT_PRODUCT_SKIP_NOTE);
  assert.strictEqual(
    Buffer.compare(Buffer.from(data), Buffer.from(originalSnapshot)),
    0,
    'Aborted whitening must restore original crop pixels completely'
  );
}

console.log('Packshot safe whitening check passed: 4 synthetic scenarios verified.');
