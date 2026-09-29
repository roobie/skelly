import type { Palette, SrgbColor } from '../core/design.ts';

/** Normalizes a 0xRRGGBB integer to an sRGB triple in [0,1]. */
export const hexToSrgb = (hex: number): SrgbColor => [
  ((hex >> 16) & 0xff) / 255,
  ((hex >> 8) & 0xff) / 255,
  (hex & 0xff) / 255,
];

/** Inverse of `hexToSrgb`, rounding each channel to the nearest 8-bit value. */
export const srgbToHex = (c: SrgbColor): number =>
  (Math.round(c[0] * 255) << 16) | (Math.round(c[1] * 255) << 8) | Math.round(c[2] * 255);

const validColor = (c: SrgbColor): boolean => c.length === 3 && c.every((x) => Number.isFinite(x) && x >= 0 && x <= 1);

/** Returns the palette, throwing if any channel is not finite or lies outside [0,1]. */
export const createPalette = (palette: Palette): Palette => {
  const entries: [string, SrgbColor][] = [
    ...Object.entries(palette.familyColors).map(([k, c]): [string, SrgbColor] => [`family ${k}`, c]),
    ...Object.entries(palette.specialColors).map(([k, c]): [string, SrgbColor] => [`special ${k}`, c]),
    ['fallback', palette.fallbackColor],
  ];
  for (const [key, color] of entries) {
    if (!validColor(color)) {
      throw new Error(`palette colour ${key} must have three finite channels in [0,1]`);
    }
  }
  return palette;
};

const fromHex = (table: Record<string, number>): Record<string, SrgbColor> =>
  Object.fromEntries(Object.entries(table).map(([k, hex]) => [k, hexToSrgb(hex)]));

/** Colours keyed by `PartDef.family` role. */
const FAMILY_HEX: Record<string, number> = {
  receiver: 0x8d_93_9c,
  lower: 0x6f_75_7e,
  barrel: 0x5d_63_6b,
  'tube-magazine': 0x4d_53_5b,
  forend: 0x8a_6a_52,
  handguard: 0x74_80_5f,
  grip: 0x7d_60_4c,
  magazine: 0x56_62_76,
  stock: 0x8a_6a_52,
  sight: 0x3f_46_50,
  // Roles that used to fall back to grey.
  // Pistol: warm parkerized frame under a lighter steel slide.
  frame: 0x4b_4a_45,
  slide: 0x86_8d_97,
  // Revolver: blued cylinder against the light receiver.
  cylinder: 0x4a_55_66,
  // Dark small metal parts, near the sight tone; the gas system steps from black block to mid-grey cylinder.
  'front-sight': 0x36_3d_47,
  'gas-block': 0x2f_32_38,
  'gas-cylinder': 0x54_5a_63,
};

/** Colours keyed by solid id; these win over the family colour. */
const SPECIAL_HEX: Record<string, number> = {
  floorplate: 0x35_42_58,
  'butt-pad': 0x2f_32_38,
  'cap-lug': 0x9a_a4_ae,
};

export const GUN_PALETTE: Palette = createPalette({
  familyColors: fromHex(FAMILY_HEX),
  specialColors: fromHex(SPECIAL_HEX),
  fallbackColor: hexToSrgb(0x88_88_88),
});

const own = (table: Readonly<Record<string, SrgbColor>>, key: string): SrgbColor | undefined =>
  Object.hasOwn(table, key) ? table[key] : undefined;

/** Colour of one solid: special colour by solid id, else family colour, else the palette fallback. */
export const solidColor = (palette: Palette, family: string, solidId: string): SrgbColor =>
  own(palette.specialColors, solidId) ?? own(palette.familyColors, family) ?? palette.fallbackColor;
