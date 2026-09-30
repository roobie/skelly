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
    ...Object.entries(palette.materials ?? {}).map(([k, c]): [string, SrgbColor] => [`material ${k}`, c]),
    ...Object.entries(palette.roleShades ?? {}).map(([k, c]): [string, SrgbColor] => [`shade ${k}`, c]),
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

const FAMILY_HEX: Record<string, number> = {
  receiver: 0x8d_93_9c,
  'bolt-carrier': 0x6d_73_7c,
  lower: 0x6f_75_7e,
  barrel: 0x5d_63_6b,
  'tube-magazine': 0x4d_53_5b,
  forend: 0x8a_6a_52,
  handguard: 0x74_80_5f,
  grip: 0x7d_60_4c,
  magazine: 0x56_62_76,
  stock: 0x8a_6a_52,
  sight: 0x3f_46_50,
  frame: 0x4b_4a_45,
  slide: 0x86_8d_97,
  cylinder: 0x4a_55_66,
  'front-sight': 0x36_3d_47,
  'rail-front-sight': 0x36_3d_47,
  'gas-block': 0x2f_32_38,
  'gas-cylinder': 0x54_5a_63,
};
const SPECIAL_HEX: Record<string, number> = { floorplate: 0x35_42_58, 'butt-pad': 0x2f_32_38, 'cap-lug': 0x5d_63_6b };

const ROLE_SLOTS: Record<string, string> = {
  receiver: 'metal',
  'ak-receiver': 'metal',
  'bolt-carrier': 'metal',
  lower: 'metal',
  barrel: 'metal',
  'ak-rear-sight': 'metal',
  'tube-magazine': 'metal',
  forend: 'furniture',
  handguard: 'furniture',
  grip: 'furniture',
  magazine: 'metal',
  stock: 'furniture',
  sight: 'metal',
  frame: 'metal',
  slide: 'metal',
  cylinder: 'metal',
  'front-sight': 'metal',
  'rail-front-sight': 'metal',
  'gas-block': 'metal',
  'gas-cylinder': 'metal',
};
const SHADE: Record<string, number> = {
  receiver: 1,
  'ak-receiver': 0.93,
  'bolt-carrier': 0.78,
  lower: 0.83,
  barrel: 0.67,
  'tube-magazine': 0.72,
  forend: 0.95,
  handguard: 0.9,
  grip: 0.82,
  magazine: 0.48,
  stock: 1,
  sight: 0.62,
  frame: 0.78,
  slide: 1,
  cylinder: 0.8,
  'front-sight': 0.6,
  'rail-front-sight': 0.62,
  'gas-block': 0.55,
  'gas-cylinder': 0.7,
  'ak-rear-sight': 0.65,
};
const roles = Object.keys(ROLE_SLOTS);
const ROLE_MATERIALS = Object.fromEntries(
  roles.map((role) => {
    const slot = ROLE_SLOTS[role];
    if (slot === 'furniture') {
      return [role, 'polymer-black'];
    }
    if (slot === 'accent') {
      return [role, 'rubber-black'];
    }
    return [role, 'steel-parkerized'];
  }),
) as Record<string, string>;
const ROLE_SHADES = Object.fromEntries(
  roles.map((role) => [role, [SHADE[role]!, SHADE[role]!, SHADE[role]!]]),
) as Record<string, SrgbColor>;
const MATERIAL_HEX: Record<string, number> = {
  'wood-walnut': 0x75_43_24,
  'wood-birch': 0xc1_9a_65,
  'polymer-black': 0x24_29_2b,
  'polymer-od-green': 0x4b_58_36,
  'polymer-fde': 0xb1_91_62,
  'steel-blued': 0x3e_49_59,
  'steel-parkerized': 0x4b_4f_4c,
  'steel-stainless': 0xb4_b8_b8,
  'alu-anodized-black': 0x27_2c_31,
  'rubber-black': 0x18_1a_1b,
};
const finish = (furniture: string, metal: string, accent = 'rubber-black') => ({ furniture, metal, accent });
const FINISHES: Record<string, Readonly<Record<string, string>>> = {
  ak: finish('wood-walnut', 'steel-blued'),
  'pump-shotgun': finish('wood-walnut', 'steel-blued'),
  ar: finish('polymer-black', 'alu-anodized-black'),
  'ar-free-float': finish('polymer-black', 'alu-anodized-black'),
  awm: finish('polymer-od-green', 'steel-parkerized'),
  smg: finish('polymer-black', 'steel-blued'),
  pistol: finish('polymer-black', 'steel-blued'),
  revolver: finish('wood-walnut', 'steel-stainless'),
  'battle-rifle': finish('wood-walnut', 'steel-parkerized'),
  'bolt-rifle': finish('wood-walnut', 'steel-parkerized'),
  'bolt-rifle-box': finish('wood-walnut', 'steel-parkerized'),
  'bolt-rifle-thumbhole': finish('wood-walnut', 'steel-parkerized'),
  bullpup: finish('polymer-black', 'steel-parkerized'),
  barrett: { metal: 'steel-parkerized', furniture: 'steel-parkerized', accent: 'steel-parkerized' },
};

export const GUN_PALETTE: Palette = createPalette({
  familyColors: fromHex(FAMILY_HEX),
  specialColors: fromHex(SPECIAL_HEX),
  fallbackColor: hexToSrgb(0x88_88_88),
  materials: fromHex(MATERIAL_HEX),
  roleSlots: ROLE_SLOTS,
  roleMaterials: ROLE_MATERIALS,
  roleShades: ROLE_SHADES,
  specialMaterials: { floorplate: 'steel-blued', 'butt-pad': 'rubber-black', 'cap-lug': 'steel-blued' },
  archetypeFinishes: FINISHES,
});

const own = <T>(table: Readonly<Record<string, T>> | undefined, key: string): T | undefined =>
  table && Object.hasOwn(table, key) ? table[key] : undefined;

export interface Appearance {
  readonly material: string;
  readonly slot: string;
  readonly color: SrgbColor;
}
const defaultMaterial = (slot: string): string => {
  if (slot === 'furniture') {
    return 'polymer-black';
  }
  if (slot === 'accent') {
    return 'rubber-black';
  }
  return 'steel-parkerized';
};
/** Resolves special, part-owned, archetype-finish, then role-default appearance and applies the role shade. */
export const resolveAppearance = (
  palette: Palette,
  role: string,
  solidId: string,
  options: {
    readonly archetype?: string;
    readonly finish?: Readonly<Record<string, string>>;
    readonly material?: string | undefined;
    readonly slot?: string | undefined;
  } = {},
): Appearance => {
  const slot = options.slot ?? own(palette.roleSlots, role) ?? 'metal';
  const legacySpecial = own(palette.specialColors, solidId);
  const material =
    own(palette.specialMaterials, solidId) ??
    (legacySpecial ? `special-${solidId}` : undefined) ??
    options.material ??
    own(options.finish ?? {}, slot) ??
    own(own(palette.archetypeFinishes, options.archetype ?? ''), slot) ??
    own(palette.roleMaterials, role) ??
    defaultMaterial(slot);
  const base =
    legacySpecial ?? own(palette.materials, material) ?? own(palette.familyColors, role) ?? palette.fallbackColor;
  const shade = own(palette.roleShades, role) ?? [1, 1, 1];
  const color: SrgbColor = [base[0] * shade[0], base[1] * shade[1], base[2] * shade[2]];
  return { material, slot, color };
};

/** Legacy role-only colour, available for geometry inspection. */
export const solidColor = (palette: Palette, family: string, solidId: string): SrgbColor =>
  own(palette.specialColors, solidId) ?? own(palette.familyColors, family) ?? palette.fallbackColor;
