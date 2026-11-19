import type { AspectRatio } from './models';

export type ProductCategoryId =
  | 'apparel'
  | 'footwear'
  | 'jewelry'
  | 'watches-accessories'
  | 'beauty-skincare'
  | 'electronics'
  | 'home-furniture'
  | 'food-beverage'
  | 'bags-accessories'
  | 'bottles-packaging'
  | 'toys';

export interface ProductCategorySpec {
  id: ProductCategoryId;
  label: string;
  realismModule: string;
  lifestyleSetting: string;
  flatLayProps: string;
  heroBackdropNote: string;
}

export const PRODUCT_CATEGORIES: ProductCategorySpec[] = [
  {
    id: 'apparel',
    label: 'Apparel',
    realismModule:
      'Visible woven textile grain, natural garment drape and subtle tension folds, crisp flatlock and overlock seam stitching, true matte cloth light absorption.',
    lifestyleSetting:
      'draped neatly in a sunlit minimalist concrete and oak dressing studio with soft architectural shadows',
    flatLayProps:
      'folded linen cloth edge and a brushed brass tailor measuring tape subtly resting at frame margin',
    heroBackdropNote: 'soft warm stone or cool slate seamless paper backdrop',
  },
  {
    id: 'footwear',
    label: 'Footwear',
    realismModule:
      'Accurate double-row stitching, crisp welt and outsole tread geometry, structured toe box and heel counter silhouette, realistic suede nap or full-grain leather creases.',
    lifestyleSetting:
      'resting on a weathered architectural travertine step in crisp morning daylight',
    flatLayProps:
      'clean raw canvas texture with subtle tonal shadow separation',
    heroBackdropNote: 'matte architectural charcoal or neutral bone seamless cyclorama',
  },
  {
    id: 'jewelry',
    label: 'Jewelry',
    realismModule:
      'Crisp specular highlights along faceted edges, controlled mirror reflections on precious metal surfaces, sharp prong and bezel micro-detail, dark gradient backdrop tone when not on white.',
    lifestyleSetting:
      'displayed on a honed dark slate pedestal beside soft natural shadow play',
    flatLayProps:
      'raw silk ribbon edge and unpolished travertine stone slab corner',
    heroBackdropNote: 'deep obsidian-to-charcoal radial dark gradient studio backdrop',
  },
  {
    id: 'watches-accessories',
    label: 'Watches & Accessories',
    realismModule:
      'Crisp dial and applied indices, correct proportioned hands, anti-reflective sapphire glass with controlled reflections, visible brushed vs polished metal contrast, accurate strap texture and stitching.',
    lifestyleSetting:
      'resting on a honed dark slate architectural valet ledge bathed in crisp directional window daylight',
    flatLayProps:
      'charcoal wool watch roll edge and brushed steel buckle detail resting cleanly at frame margin',
    heroBackdropNote: 'deep graphite-to-charcoal seamless radial gradient studio backdrop',
  },
  {
    id: 'beauty-skincare',
    label: 'Beauty & Skincare',
    realismModule:
      'Accurate frosted glass or matte polymer diffusion, crisp pump/dropper collar tolerances, realistic translucent serum meniscus, clean soft cosmetic fill reflections.',
    lifestyleSetting:
      'positioned on a pale honed limestone vanity counter beside soft filtered morning window light',
    flatLayProps:
      'smooth river stone and clean ceramic dish accent placed sparingly at the perimeter',
    heroBackdropNote: 'soft alabaster or muted sage seamless studio backdrop',
  },
  {
    id: 'electronics',
    label: 'Electronics',
    realismModule:
      'Precision CNC-chamfered aluminum bevels, uniform bead-blasted anodization texture, crisp port tolerances, blank unlit glass display with controlled softbox reflection.',
    lifestyleSetting:
      'resting on a clean matte walnut desk surface beside subtle architectural daylight',
    flatLayProps:
      'minimal braided cable neatly coiled in the far corner on matte anodized surface',
    heroBackdropNote: 'deep graphite seamless studio cyclorama with crisp edge rim highlight',
  },
  {
    id: 'home-furniture',
    label: 'Home & Furniture',
    realismModule:
      'Accurate architectural proportions, authentic open-pore wood grain or bouclé upholstery weave, clean joinery seams, grounded contact shadow on floor plane.',
    lifestyleSetting:
      'placed in a bright minimalist Nordic interior with plaster walls and natural oak flooring',
    flatLayProps:
      'architectural material swatch tile and linen texture corner',
    heroBackdropNote: 'warm plaster-gray architectural seamless sweep',
  },
  {
    id: 'food-beverage',
    label: 'Food & Beverage',
    realismModule:
      'Fresh organic surface texture, natural condensation micro-droplets or appetizing moisture sheen, authentic crumb/peel/foam structure, clean appetizing directional key light.',
    lifestyleSetting:
      'served on a matte stoneware surface beside morning cafe window light',
    flatLayProps:
      'fresh culinary garnish sprigs and unbleached linen napkin corner',
    heroBackdropNote: 'rich warm parchment or deep espresso matte studio backdrop',
  },
  {
    id: 'bags-accessories',
    label: 'Bags & Accessories',
    realismModule:
      'Supple pebbled leather or heavy waxed canvas weave, crisp edge paint and saddle stitching, solid brushed metal buckles and zippers, natural structured volume.',
    lifestyleSetting:
      'resting on a brushed concrete bench bathed in soft late-afternoon window light',
    flatLayProps:
      'monochrome leather key fob and understated sunglasses temple edge',
    heroBackdropNote: 'warm taupe or slate gray seamless paper backdrop',
  },
  {
    id: 'bottles-packaging',
    label: 'Bottles & Packaging',
    realismModule:
      'Clean rim lighting defining glass or rigid carton silhouette, physically accurate liquid refraction and meniscus, razor-sharp label typography and crisp die-cut box edges.',
    lifestyleSetting:
      'standing on a dark terrazzo bar surface with soft diffused afternoon daylight',
    flatLayProps:
      'clean botanical leaf shadow and textured cotton paper edge',
    heroBackdropNote: 'clean neutral charcoal or soft mineral-tinted seamless backdrop',
  },
  {
    id: 'toys',
    label: 'Toys',
    realismModule:
      'Tactile matte ABS polymer or smooth beechwood grain, crisp injection-mold parting tolerances, clean satin paint edges, cheerful even studio illumination.',
    lifestyleSetting:
      'standing on a sunlit birch wood play table in a tidy Scandinavian room',
    flatLayProps:
      'two simple geometric wooden blocks arranged cleanly at the frame corner',
    heroBackdropNote: 'clean warm ivory or pastel slate seamless backdrop',
  },
];

export type ShotPresetId =
  | 'marketplace-packshot'
  | 'studio-hero'
  | 'lifestyle-scene'
  | 'flat-lay'
  | 'macro-detail'
  | 'packaging-mockup';

export interface ShotPresetSpec {
  id: ShotPresetId;
  name: string;
  shortDescription: string;
  defaultAspectRatio: AspectRatio;
  isWhiteBackground: boolean;
  composition: string;
  camera: string;
  lighting: string;
  background: string;
}

export const SHOT_PRESETS: ShotPresetSpec[] = [
  {
    id: 'marketplace-packshot',
    name: 'Marketplace Packshot',
    shortDescription: 'Pure white #FFFFFF seamless, 85% fill, soft contact shadow',
    defaultAspectRatio: '1:1',
    isWhiteBackground: true,
    composition:
      'Centered three-quarter front elevation view, level horizon, single isolated product filling approximately 85 percent of the frame with generous uniform margins',
    camera: '85mm commercial studio lens at f/11, eye-level perspective, razor-sharp front-to-back focus',
    lighting:
      'Soft, ultra-even diffused dual-softbox commercial studio lighting with controlled specular wrap and a subtle natural ground contact shadow directly beneath the base',
    background: 'Pure seamless solid white (#FFFFFF) cyclorama studio background, zero vignette, zero horizon line',
  },
  {
    id: 'studio-hero',
    name: 'Studio Hero',
    shortDescription: 'Colored seamless, softbox key, rim light & soft reflections',
    defaultAspectRatio: '4:5',
    isWhiteBackground: false,
    composition:
      'Hero three-quarter low-eye-level angle, centered slightly grounded in lower two-thirds, sculptural silhouette commanding the frame',
    camera: '90mm medium-format studio lens at f/5.6, crisp subject isolation',
    lighting:
      'Large diffused overhead softbox key light, subtle directional rim light separating edges from backdrop, soft grounded reflections on the surface plane',
    background: 'Seamless matte studio paper backdrop with smooth tonal continuity',
  },
  {
    id: 'lifestyle-scene',
    name: 'Lifestyle Scene',
    shortDescription: 'Realistic category environment, natural window light, shallow DOF',
    defaultAspectRatio: '16:9',
    isWhiteBackground: false,
    composition:
      'Rule-of-thirds editorial placement in a real-world environment tailored to the product category, unobstructed hero silhouette',
    camera: '50mm prime lens at f/2.8, natural shallow depth of field softly blurring background architecture',
    lighting: 'Directional natural side window daylight with soft ambient room bounce and authentic soft shadows',
    background: 'Authentic lived-in architectural setting matching the product category, softly out of focus',
  },
  {
    id: 'flat-lay',
    name: 'Flat Lay',
    shortDescription: '90° top-down overhead composition, minimal styled props, even daylight',
    defaultAspectRatio: '1:1',
    isWhiteBackground: false,
    composition:
      'Strict 90-degree top-down overhead flat lay composition, primary product anchored as focal point with minimal balanced negative space',
    camera: '50mm macro flat-field lens at f/8, zero keystone distortion, orthogonal overhead alignment',
    lighting: 'Large overhead diffused natural daylight scrim producing soft uniform illumination and gentle edge shadows',
    background: 'Clean matte architectural surface with restrained, curated minimal props',
  },
  {
    id: 'macro-detail',
    name: 'Macro Detail',
    shortDescription: '100mm macro close-up highlighting material weave, grain & finish',
    defaultAspectRatio: '4:5',
    isWhiteBackground: false,
    composition:
      'Tight macro detail framing focusing on tactile surface craftsmanship, material transitions, seams, or hardware edges',
    camera: '100mm f/2.8 macro lens at f/5.6, ultra-crisp micro-contrast in focal plane with gentle optical falloff',
    lighting: 'Raking directional studio side light revealing surface micro-relief, weave, brushed grain, and finish depth',
    background: 'Softly diffused neutral tonal background melting smoothly out of focus',
  },
  {
    id: 'packaging-mockup',
    name: 'Packaging Mockup',
    shortDescription: 'Box/bag/label on neutral surface, sharp edges, straight-on',
    defaultAspectRatio: '3:4',
    isWhiteBackground: false,
    composition:
      'Straight-on orthographic front elevation on a flat neutral plinth, sharp die-cut box edges and unwarped front label plane',
    camera: '105mm commercial tilt-shift lens at f/11, zero perspective distortion, parallel vertical edges',
    lighting: 'Crisp studio strip-box lighting sculpting box corners and embossed paper edges with a clean grounded shadow',
    background: 'Neutral matte architectural stone or seamless plaster surface',
  },
];

export interface RefineChipSpec {
  id: string;
  label: string;
  instruction: string;
}

export const REFINE_CHIPS: RefineChipSpec[] = [
  {
    id: 'softer-shadow',
    label: 'softer shadow',
    instruction: 'Use wider diffused fill to produce a much softer, feathered contact shadow.',
  },
  {
    id: 'warmer-light',
    label: 'warmer light',
    instruction: 'Shift illumination toward warm 3800K golden studio daylight tones.',
  },
  {
    id: 'more-contrast',
    label: 'more contrast',
    instruction: 'Increase directional key-to-fill contrast for deeper dimensional sculpting.',
  },
  {
    id: 'cleaner-background',
    label: 'cleaner background',
    instruction: 'Keep the background completely spotless, uniform, and free of dust or banding.',
  },
  {
    id: 'more-texture-detail',
    label: 'more texture detail',
    instruction: 'Accentuate tactile surface grain, stitching, and micro-material crispness.',
  },
];

export function getCategorySpec(id: ProductCategoryId): ProductCategorySpec {
  return PRODUCT_CATEGORIES.find((c) => c.id === id) ?? PRODUCT_CATEGORIES[0];
}

export function getShotPreset(id: ShotPresetId): ShotPresetSpec {
  return SHOT_PRESETS.find((s) => s.id === id) ?? SHOT_PRESETS[0];
}
