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
  colors: string[]; // up to 5 hex colors
  useBackgroundColor: boolean;
  backgroundColor: string;
  keyFeatures: string;
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

export const DEFAULT_BRIEF: ProductBrief = {
  name: 'Matte Ceramic Pour-Over Kettle',
  category: 'home-furniture',
  materialFinish: 'matte powder-coated stainless steel body with oiled walnut handle and lid knob',
  colors: ['#1C1C1E', '#7A5438'],
  useBackgroundColor: false,
  backgroundColor: '#FFFFFF',
  keyFeatures: 'precision gooseneck spout, balanced ergonomic handle, minimalist cylindrical silhouette',
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
      materialFinish: 'uv-protective amber apothecary glass with matte black rubber bulb and brushed brass collar',
      colors: ['#9B4F1B', '#18181B', '#C5A059'],
      useBackgroundColor: true,
      backgroundColor: '#EAE6DF',
      keyFeatures: '30ml cylindrical bottle, glass pipette visible through amber glass, minimal matte cream paper label',
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
      materialFinish: 'breathable engineered ripstop mesh, matte suede overlays, sculpted EVA foam midsole',
      colors: ['#E5E2DC', '#2E3A34', '#D96B27'],
      useBackgroundColor: false,
      backgroundColor: '#FFFFFF',
      keyFeatures: 'lugged Vibram-style rubber outsole, cord-lock speed lacing, reinforced heel pull tab',
      onProductTexts: [],
    },
  },
  {
    id: 'watch',
    label: 'Titanium Watch',
    shotId: 'macro-detail',
    brief: {
      name: 'Brushed Grade-5 Titanium Field Chronograph',
      category: 'jewelry',
      materialFinish: 'satin-brushed titanium case with chamfered bezel, anti-reflective sapphire crystal, matte cordura strap',
      colors: ['#8A8D91', '#14171A', '#D4622A'],
      useBackgroundColor: false,
      backgroundColor: '#121316',
      keyFeatures: 'recessed sub-dials, knurled screw-down crown, crisp luminous baton indices',
      onProductTexts: ['AUTOMATIC'],
    },
  },
];

/**
 * Converts a #RRGGBB hex string into a descriptive natural color name + hex
 * so image models reliably render accurate product & background colors even
 * when rgb_colors image_config is unsupported.
 */
export function describeHexColor(hex: string): string {
  const cleaned = hex.trim().replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(cleaned)) {
    return hex;
  }

  const r = parseInt(cleaned.slice(0, 2), 16);
  const g = parseInt(cleaned.slice(2, 4), 16);
  const b = parseInt(cleaned.slice(4, 6), 16);

  const max = Math.max(r, g, b) / 255;
  const min = Math.min(r, g, b) / 255;
  const l = (max + min) / 2;
  const d = max - min;

  if (d < 0.08) {
    if (l > 0.96) return `pure white (#${cleaned.toUpperCase()})`;
    if (l > 0.82) return `off-white (#${cleaned.toUpperCase()})`;
    if (l > 0.62) return `light neutral gray (#${cleaned.toUpperCase()})`;
    if (l > 0.36) return `medium slate gray (#${cleaned.toUpperCase()})`;
    if (l > 0.14) return `charcoal (#${cleaned.toUpperCase()})`;
    return `deep matte black (#${cleaned.toUpperCase()})`;
  }

  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  if (max === rn) h = (gn - bn) / d + (gn < bn ? 6 : 0);
  else if (max === gn) h = (bn - rn) / d + 2;
  else h = (rn - gn) / d + 4;
  h *= 60;

  let hueName = 'neutral';
  if (h < 15 || h >= 345) hueName = 'crimson red';
  else if (h < 35) hueName = 'burnt orange';
  else if (h < 52) hueName = 'warm amber';
  else if (h < 70) hueName = 'ochre yellow';
  else if (h < 150) hueName = 'forest green';
  else if (h < 185) hueName = 'teal';
  else if (h < 235) hueName = 'cobalt blue';
  else if (h < 275) hueName = 'indigo';
  else if (h < 320) hueName = 'plum';
  else hueName = 'rose';

  const tone = l < 0.28 ? 'deep ' : l > 0.72 ? 'pale ' : s < 0.32 ? 'muted ' : '';
  return `${tone}${hueName} (#${cleaned.toUpperCase()})`;
}

/**
 * Deterministic Realism Engine prompt builder.
 * Enforces exact anatomy order:
 * 1. Subject (one sentence, product first)
 * 2. Materials, finish, colors
 * 3. Composition
 * 4. Camera and lens language
 * 5. Lighting
 * 6. Background
 * 7. Realism cues (including Category Realism Module)
 * 8. Constraints (short declarative sentences)
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

  // 1. Subject (one sentence, product first)
  const subjectSentence = features
    ? `Commercial product photograph of ${productName} featuring ${features}.`
    : `Commercial product photograph of ${productName}.`;

  // 2. Materials, finish, colors
  const colorList = brief.colors
    .filter((c) => /^#[0-9a-fA-F]{6}$/.test(c.trim()))
    .slice(0, 5)
    .map(describeHexColor);

  const materialParts: string[] = [];
  if (brief.materialFinish.trim()) {
    materialParts.push(`Crafted in ${brief.materialFinish.trim()}`);
  } else {
    materialParts.push(`Crafted in authentic commercial ${category.label.toLowerCase()} materials`);
  }
  if (colorList.length > 0) {
    materialParts.push(`with a colorway of ${colorList.join(', ')}`);
  }
  const materialsSentence = `${materialParts.join(' ')}.`;

  // 3. Composition
  const compositionSentence = `${shot.composition}.`;

  // 4. Camera & lens language
  const cameraSentence = `Shot on ${shot.camera}.`;

  // 5. Lighting
  const lightingSentence = `${shot.lighting}.`;

  // 6. Background
  let backgroundSentence = '';
  if (shot.id === 'marketplace-packshot') {
    backgroundSentence = `${shot.background}.`;
  } else if (brief.useBackgroundColor && /^#[0-9a-fA-F]{6}$/.test(brief.backgroundColor.trim())) {
    backgroundSentence = `Set against a clean ${describeHexColor(brief.backgroundColor)} seamless studio background.`;
  } else if (shot.id === 'lifestyle-scene') {
    backgroundSentence = `Product is ${category.lifestyleSetting}.`;
  } else if (shot.id === 'flat-lay') {
    backgroundSentence = `${shot.background}, paired with ${category.flatLayProps}.`;
  } else if (shot.id === 'studio-hero') {
    backgroundSentence = `${shot.background}, specifically a ${category.heroBackdropNote}.`;
  } else {
    backgroundSentence = `${shot.background}.`;
  }

  // 7. Realism cues + Category Realism Module + Refine Chips
  const refineInstructions = (options.refineChipIds ?? [])
    .map((id) => REFINE_CHIPS.find((c) => c.id === id)?.instruction)
    .filter((x): x is string => Boolean(x));

  const realismSentence = [
    category.realismModule,
    'True-to-life proportions, natural material texture, believable specular reflections and contact shadows, and subtle real-world surface micro-imperfections.',
    ...refineInstructions,
  ].join(' ');

  // 8. Constraints (short declarative sentences)
  const validTexts = brief.onProductTexts
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 2);

  const textConstraint =
    validTexts.length > 0
      ? validTexts.map((t) => `On-product text reads exactly "${t}", the only text in the scene.`).join(' ')
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
    materialsSentence,
    compositionSentence,
    cameraSentence,
    lightingSentence,
    backgroundSentence,
    realismSentence,
    constraints,
  ].join(' ');
}
