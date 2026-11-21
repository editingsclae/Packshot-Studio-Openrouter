import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import ts from 'typescript';

const rootDir = path.resolve(import.meta.dirname, '..');
const require = createRequire(import.meta.url);

function loadTsModule(relPath, mocks = {}) {
  const fullPath = path.join(rootDir, relPath);
  const source = fs.readFileSync(fullPath, 'utf8');
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
  });

  const mod = { exports: {} };
  const localRequire = (specifier) => {
    if (specifier in mocks) return mocks[specifier];
    if (specifier.startsWith('./') || specifier.startsWith('../')) {
      const resolvedBase = path.resolve(path.dirname(fullPath), specifier);
      const tsCandidate = `${resolvedBase}.ts`;
      if (fs.existsSync(tsCandidate)) {
        return loadTsModule(path.relative(rootDir, tsCandidate), mocks);
      }
    }
    return require(specifier);
  };

  // Evaluate inside CommonJS module wrapper
  const wrapped = `(function(exports, require, module, __filename, __dirname) {\n${transpiled.outputText}\n})`;
  const compiled = vm.runInThisContext(wrapped, { filename: fullPath });
  compiled(mod.exports, localRequire, mod, fullPath, path.dirname(fullPath));
  return mod.exports;
}

const presetsMod = loadTsModule('lib/presets.ts');
const multiviewMod = loadTsModule('lib/multiview.ts', {
  './packshot-check': { analyzePackshotImage: async () => ({}) },
});

const { SHOT_PRESETS } = presetsMod;
const { ALL_MULTIVIEW_SPECS, buildMultiViewPrompt } = multiviewMod;

const fixedSourceWords = new Set(
  [
    'Using the provided photo(s), show this exact product photographed',
    'Keep shape, proportions, colors, materials, finish, hardware, logos and text identical; do not redesign or add parts.',
    'Unseen areas continue the design simply and neutrally with no new logos or text.',
    'Single product, no people, no watermark, no extra text.',
  ]
    .join(' ')
    .toLowerCase()
    .replace(/[^a-z0-9%]+/g, ' ')
    .trim()
    .split(/\s+/)
);

let checkedCount = 0;

for (const view of ALL_MULTIVIEW_SPECS) {
  for (const shot of SHOT_PRESETS) {
    const prompt = buildMultiViewPrompt(view.id, {
      shotStyleId: shot.id,
    });

    assert.ok(
      prompt.length <= 1100,
      `[${view.id} x ${shot.id}] Exceeded 1100 chars: ${prompt.length}`
    );
    assert.ok(
      prompt.endsWith('.'),
      `[${view.id} x ${shot.id}] Prompt must end with a period: ${prompt}`
    );
    assert.ok(
      !/photographed from camera/i.test(prompt),
      `[${view.id} x ${shot.id}] Grammar check failed: ${prompt}`
    );
    assert.ok(
      !/#[0-9a-fA-F]{3,8}\b/.test(prompt),
      `[${view.id} x ${shot.id}] Unexpected hex code in prompt: ${prompt}`
    );

    const lastWord = prompt
      .slice(0, -1)
      .trim()
      .split(/\s+/)
      .pop()
      ?.toLowerCase()
      .replace(/[^a-z0-9%]+/g, '');

    const sourceCorpus = `${view.cameraOrbitDesc} ${shot.background} ${shot.composition} ${shot.lighting}`
      .replace(/\b(\d+)\s+percent\b/gi, '$1%')
      .toLowerCase()
      .replace(/[^a-z0-9%]+/g, ' ')
      .split(/\s+/);

    assert.ok(
      lastWord && (fixedSourceWords.has(lastWord) || sourceCorpus.includes(lastWord)),
      `[${view.id} x ${shot.id}] Last word "${lastWord}" not found intact in source text`
    );

    if (shot.id === 'marketplace-packshot') {
      const lower = prompt.toLowerCase();
      assert.ok(
        lower.includes('white'),
        `[${view.id} x ${shot.id}] Expected "white" in Marketplace Packshot prompt`
      );
      assert.ok(
        lower.includes('85%'),
        `[${view.id} x ${shot.id}] Expected "85%" in Marketplace Packshot prompt`
      );
      assert.ok(
        lower.includes('shadow'),
        `[${view.id} x ${shot.id}] Expected "shadow" in Marketplace Packshot prompt`
      );
    }

    checkedCount++;
  }
}

// Verify whole-sentence dropping order (background -> composition -> lighting) when user notes consume space
const constrainedPrompt = buildMultiViewPrompt('back-right-34', {
  shotStyleId: 'marketplace-packshot',
  hiddenSideNote:
    'Brushed stainless steel caseback engraved with serial digits and water resistance stamp around the perimeter ring plus crisp brushed bevel',
  correctionNote:
    'Ensure the circular crown sits cleanly on the right edge with balanced metallic reflections and zero geometric distortion anywhere',
});

assert.ok(
  constrainedPrompt.length <= 1100,
  `Constrained prompt exceeded 1100 chars: ${constrainedPrompt.length}`
);
assert.ok(constrainedPrompt.endsWith('.'), 'Constrained prompt must end with a period');
assert.ok(
  constrainedPrompt.toLowerCase().includes('white'),
  'Constrained Marketplace prompt must preserve background ("white") first'
);
assert.ok(
  constrainedPrompt.toLowerCase().includes('85%'),
  'Constrained Marketplace prompt must preserve composition ("85%") second'
);
assert.ok(
  !constrainedPrompt.toLowerCase().includes('crisp soft studio wrap lighting'),
  'Constrained prompt must drop the full trailing lighting sentence cleanly without partial fragment'
);

// Verify exact on-product text placement and exact casing preservation
const exactTextPrompt = buildMultiViewPrompt('front-left-34', {
  shotStyleId: 'marketplace-packshot',
  onProductTexts: ['solis 15% SERUM'],
});
assert.ok(
  exactTextPrompt.length <= 1100,
  `Exact text prompt exceeded 1100 chars: ${exactTextPrompt.length}`
);
assert.ok(
  exactTextPrompt.includes(
    'The text sits fully inside the label area with generous margins on all sides, is never cropped or cut off by the label edges, and keeps this exact capitalization: "solis 15% SERUM".'
  ),
  'Exact text prompt must include label margin and exact capitalization instruction'
);

console.log(
  `Multi-view prompt check passed: ${checkedCount} view x shot style combinations (+ constrained overflow & exact text tests).`
);

