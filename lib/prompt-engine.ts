import {
  getCategorySpec,
  getShotPreset,
  REFINE_CHIPS,
  type ProductCategoryId,
  type ShotPresetId,
} from './presets';

export interface ProductBrief {
  name: string;
  category: ProductCategoryId;
  materialFinish: string;
  colors: string[]; // up to 5 hex colors (used for rgb_colors param; prompt gets color names only)
  useBackgroundColor: boolean;
  backgroundColor: string;
  keyFeatures: string;
  detailsToLock?: string;
  onProductTexts: string[]; // up to 2 short strings
}

export interface PromptBuildOptions {
  refineChipIds?: string[];
  allowPeople?: boolean;
}

export interface SampleBriefPreset {
  id: string;
  label: string;
  brief: ProductBrief;
  shotId: ShotPresetId;
}

export function getDetailsToLockPlaceholder(category: ProductCategoryId): string {
  switch (category) {
    case 'watches-accessories':
      return 'e.g. dial color, strap color and material, case finish, hand accents';
    case 'apparel':
      return 'e.g. collar cut, fabric weave, stitch thread color, button finish';
    case 'footwear':
      return 'e.g. upper panel colors, midsole profile, lace hardware, outsole lug color';
    case 'jewelry':
      return 'e.g. precious metal tone, stone cut & tint, prong count, clasp finish';
    case 'beauty-skincare':
      return 'e.g. bottle glass tint, pump/collar finish, label placement, serum color';
    case 'electronics':
      return 'e.g. chassis finish, bezel chamfer, port alignment, dial/button accents';
    case 'home-furniture':
      return 'e.g. wood species tone, upholstery weave, handle/knob material, silhouette';
    case 'food-beverage':
      return 'e.g. glaze color, garnish placement, vessel texture, liquid clarity';
    case 'bags-accessories':
      return 'e.g. leather grain, hardware plating, stitch color, strap buckle style';
    case 'bottles-packaging':
      return 'e.g. carton fold edges, cap foil color, label layout, bottle glass tone';
    case 'toys':
      return 'e.g. painted color zones, seam placement, matte polymer finish, proportions';
    default:
      return 'e.g. exact finish zones, hardware tone, secondary color placement';
  }
}

export function createEmptyBrief(
  category: ProductCategoryId = 'home-furniture'
): ProductBrief {
  return {
    name: '',
    category,
    materialFinish: '',
    colors: [],
    useBackgroundColor: false,
    backgroundColor: '#FFFFFF',
    keyFeatures: '',
    detailsToLock: '',
    onProductTexts: [],
  };
}

export const DEFAULT_BRIEF: ProductBrief = {
  name: 'Matte Black Stainless Steel Pour-Over Kettle',
  category: 'home-furniture',
  materialFinish:
    'matte black powder-coated stainless steel body with oiled walnut wood handle and lid knob',
  colors: ['#1C1C1E', '#7A5438'],
  useBackgroundColor: false,
  backgroundColor: '#FFFFFF',
  keyFeatures:
    'precision gooseneck spout, balanced ergonomic walnut handle, minimalist cylindrical body',
  detailsToLock:
    'matte black steel body, oiled walnut wood handle and lid knob, gooseneck spout curve',
  onProductTexts: [],
};

export const SAMPLE_BRIEFS: SampleBriefPreset[] = [
  {
    id: 'kettle',
    label: 'Gooseneck Kettle',
    shotId: 'marketplace-packshot',
    brief: DEFAULT_BRIEF,
  },
  {
    id: 'serum',
    label: 'Vitamin C Serum',
    shotId: 'studio-hero',
    brief: {
      name: 'Amber Glass Facial Serum Dropper Bottle',
      category: 'beauty-skincare',
      materialFinish:
        'uv-protective amber apothecary glass with matte black rubber dropper bulb, brushed brass collar, and warm alabaster paper label',
      colors: ['#9B4F1B', '#18181B', '#C5A059'],
      useBackgroundColor: true,
      backgroundColor: '#EAE6DF',
      keyFeatures:
        '30ml cylindrical glass bottle, glass pipette visible inside, minimal wraparound matte paper label',
      detailsToLock:
        'amber glass bottle tint, brushed brass collar, matte black rubber bulb, crisp centered label',
      onProductTexts: ['SOLIS 15%'],
    },
  },
  {
    id: 'sneaker',
    label: 'Runner Sneaker',
    shotId: 'marketplace-packshot',
    brief: {
      name: 'Low-Top Technical Trail Running Sneaker',
      category: 'footwear',
      materialFinish:
        'light warm gray engineered ripstop mesh upper, forest green matte suede overlays, burnt orange heel accent, sculpted off-white EVA midsole',
      colors: ['#E5E2DC', '#2E3A34', '#D96B27'],
      useBackgroundColor: false,
      backgroundColor: '#FFFFFF',
      keyFeatures:
        'lugged trail rubber outsole, cord-lock speed lacing, reinforced heel pull tab',
      detailsToLock:
        'light warm gray mesh upper, forest green suede overlays, burnt orange heel tab, lugged outsole',
      onProductTexts: [],
    },
  },
  {
    id: 'watch',
    label: 'Titanium Watch',
    shotId: 'macro-detail',
    brief: {
      name: 'Brushed Grade-5 Titanium Field Chronograph',
      category: 'watches-accessories',
      materialFinish:
        'satin-brushed titanium gray case with chamfered bezel, obsidian black matte dial, anti-reflective sapphire glass, obsidian black cordura strap, burnt orange chrono hand',
      colors: ['#8A8D91', '#14171A', '#D4622A'],
      useBackgroundColor: false,
      backgroundColor: '#121316',
      keyFeatures:
        'recessed twin sub-dials, knurled screw-down crown, crisp luminous baton indices',
      detailsToLock:
        'obsidian black dial, burnt orange chronograph hand, satin-brushed titanium case finish, black cordura strap and stitching',
      onProductTexts: ['AUTOMATIC'],
    },
  },
];

const NAMED_STUDIO_COLORS: ReadonlyArray<
  readonly [name: string, rgb: readonly [number, number, number]]
> = [
  ['pure white', [255, 255, 255]],
  ['off-white', [246, 245, 240]],
  ['warm alabaster', [234, 230, 223]],
  ['light warm gray', [229, 226, 220]],
  ['cream ivory', [244, 236, 216]],
  ['sandstone beige', [214, 198, 174]],
  ['brushed silver', [192, 195, 200]],
  ['titanium gray', [138, 141, 145]],
  ['medium slate gray', [106, 112, 118]],
  ['charcoal gray', [54, 57, 62]],
  ['matte black', [28, 28, 30]],
  ['obsidian black', [20, 23, 26]],
  ['jet black', [12, 13, 16]],
  ['walnut brown', [122, 84, 56]],
  ['espresso brown', [74, 48, 34]],
  ['amber brown', [155, 79, 27]],
  ['cognac tan', [182, 114, 62]],
  ['brushed brass', [197, 160, 89]],
  ['champagne gold', [218, 188, 124]],
  ['burnt orange', [215, 102, 40]],
  ['terracotta', [198, 92, 58]],
  ['crimson red', [184, 34, 38]],
  ['burgundy', [118, 28, 44]],
  ['dusty rose', [194, 126, 134]],
  ['ochre yellow', [214, 168, 46]],
  ['olive green', [92, 104, 64]],
  ['forest green', [46, 58, 52]],
  ['sage green', [140, 158, 138]],
  ['emerald green', [24, 118, 82]],
  ['deep teal', [24, 116, 122]],
  ['slate blue', [88, 114, 142]],
  ['navy blue', [28, 44, 76]],
  ['cobalt blue', [40, 96, 214]],
  ['deep indigo', [54, 48, 126]],
  ['plum purple', [104, 48, 92]],
];

/**
 * Converts a #RRGGBB hex string into a natural color name via nearest perceptual RGB lookup
 * (no hex codes returned in prompt text).
 */
export function describeHexColor(hex: string): string {
  const cleaned = hex.trim().replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(cleaned)) {
    return hex.replace(/#[0-9a-fA-F]{3,8}/g, '').trim() || 'neutral tone';
  }

  const r = parseInt(cleaned.slice(0, 2), 16);
  const g = parseInt(cleaned.slice(2, 4), 16);
  const b = parseInt(cleaned.slice(4, 6), 16);

  let bestName = 'neutral gray';
  let bestDist = Number.POSITIVE_INFINITY;

  for (const [name, [cr, cg, cb]] of NAMED_STUDIO_COLORS) {
    const rMean = (r + cr) / 2;
    const dr = r - cr;
    const dg = g - cg;
    const db = b - cb;
    const dist =
      (2 + rMean / 256) * dr * dr +
      4 * dg * dg +
      (2 + (255 - rMean) / 256) * db * db;
    if (dist < bestDist) {
      bestDist = dist;
      bestName = name;
    }
  }

  return bestName;
}

/**
 * Deterministic Realism Engine prompt builder.
 * Enforces exact anatomy order:
 * 1. Subject (one sentence, product first)
 * 2. Exact details to lock (if provided)
 * 3. Materials, finish, natural color names (no hex codes)
 * 4. Composition
 * 5. Camera and lens language
 * 6. Lighting
 * 7. Background
 * 8. Realism cues (including Category Realism Module)
 * 9. Constraints (short declarative sentences)
 */
export function buildPrompt(
  brief: ProductBrief,
  shotId: ShotPresetId,
  options: PromptBuildOptions = {}
): string {
  const category = getCategorySpec(brief.category);
  const shot = getShotPreset(shotId);

  const productName = brief.name.trim() || 'Commercial ecommerce product';
  const features = brief.keyFeatures.trim();
  const lockedDetails = (brief.detailsToLock ?? '').trim();

  // 1. Subject (one sentence, product first)
  const subjectSentence = features
    ? `Commercial product photograph of ${productName} featuring ${features}.`
    : `Commercial product photograph of ${productName}.`;

  // 2. Exact details to lock (placed right after subject)
  const exactDetailsSentence = lockedDetails
    ? `Exact details: ${lockedDetails}.`
    : '';

  // 3. Materials, finish, natural color names (no hex codes in prompt text)
  const colorList = Array.from(
    new Set(
      brief.colors
        .filter((c) => /^#[0-9a-fA-F]{6}$/.test(c.trim()))
        .slice(0, 5)
        .map(describeHexColor)
    )
  );

  const materialParts: string[] = [];
  if (brief.materialFinish.trim()) {
    materialParts.push(`Crafted in ${brief.materialFinish.trim()}`);
  } else {
    materialParts.push(
      `Crafted in authentic commercial ${category.label.toLowerCase()} materials`
    );
  }
  if (colorList.length > 0) {
    materialParts.push(`with a colorway of ${colorList.join(', ')}`);
  }
  const materialsSentence = `${materialParts.join(' ')}.`;

  // 4. Composition
  const compositionSentence = `${shot.composition}.`;

  // 5. Camera & lens language
  const cameraSentence = `Shot on ${shot.camera}.`;

  // 6. Lighting
  const lightingSentence = `${shot.lighting}.`;

  // 7. Background (natural color names only, no #HEX)
  const cleanShotBackground = shot.background.replace(/\s*\(#?[0-9a-fA-F]{6}\)/g, '');
  let backgroundSentence = '';
  if (shot.id === 'marketplace-packshot') {
    backgroundSentence = `${cleanShotBackground}.`;
  } else if (
    brief.useBackgroundColor &&
    /^#[0-9a-fA-F]{6}$/.test(brief.backgroundColor.trim())
  ) {
    backgroundSentence = `Set against a clean ${describeHexColor(brief.backgroundColor)} seamless studio background.`;
  } else if (shot.id === 'lifestyle-scene') {
    backgroundSentence = `Product is ${category.lifestyleSetting}.`;
  } else if (shot.id === 'flat-lay') {
    backgroundSentence = `${cleanShotBackground}, paired with ${category.flatLayProps}.`;
  } else if (shot.id === 'studio-hero') {
    backgroundSentence = `${cleanShotBackground}, specifically a ${category.heroBackdropNote}.`;
  } else {
    backgroundSentence = `${cleanShotBackground}.`;
  }

  // 8. Realism cues + Category Realism Module + Refine Chips
  const refineInstructions = (options.refineChipIds ?? [])
    .map((id) => REFINE_CHIPS.find((c) => c.id === id)?.instruction)
    .filter((x): x is string => Boolean(x));

  const realismSentence = [
    category.realismModule,
    'True-to-life proportions, natural material texture, believable specular reflections and contact shadows, and subtle real-world surface micro-imperfections.',
    ...refineInstructions,
  ].join(' ');

  // 9. Constraints (short declarative sentences)
  const validTexts = brief.onProductTexts
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 2);

  const textConstraint =
    validTexts.length > 0
      ? validTexts
          .map((t) => `On-product text reads exactly "${t}", the only text in the scene.`)
          .join(' ')
      : 'No text, typography, or printed words in the scene.';

  const constraints = [
    'Single product only.',
    options.allowPeople ? '' : 'No people or hands in frame.',
    'No watermark.',
    'No extra logos or floating badges.',
    textConstraint,
  ]
    .filter(Boolean)
    .join(' ');

  return [
    subjectSentence,
    exactDetailsSentence,
    materialsSentence,
    compositionSentence,
    cameraSentence,
    lightingSentence,
    backgroundSentence,
    realismSentence,
    constraints,
  ]
    .filter(Boolean)
    .join(' ');
}

/**
 * Reference-preserving prompt used for multi-shot Shot Sets in Photo mode so
 * all generated presets maintain exact product consistency from the reference photo.
 */
export function buildPreservationPrompt(
  brief: ProductBrief,
  shotId: ShotPresetId,
  options: PromptBuildOptions = {}
): string {
  const basePrompt = buildPrompt(brief, shotId, options);
  return `${basePrompt} Preserve the exact product geometry, colorway, materials, proportions, and markings from the reference image without altering product design.`;
}
