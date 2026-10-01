// Palette data for the anti-materiel families, spread into gun/palette.ts's tables so those tables
// each gain one line. Pure data: no imports, so the palette can import it from anywhere.

/** Role-only geometry-check colours, keyed by `PartDef.family`. The recoil stock reuses the `stock` role. */
export const ANTI_MATERIEL_FAMILY_COLORS: Readonly<Record<string, number>> = {
  'muzzle-brake': 0x3b_41_49,
  'barrel-shroud': 0x7a_80_88,
  bipod: 0x4a_4f_55,
  'carry-handle': 0x5a_60_68,
  monopod: 0x4a_4f_55,
};

/** Material slot per role and per registry key (`recoil-stock` is a registry key; its role is `stock`). */
export const ANTI_MATERIEL_ROLE_SLOTS: Readonly<Record<string, string>> = {
  'muzzle-brake': 'metal',
  'barrel-shroud': 'metal',
  bipod: 'metal',
  'carry-handle': 'metal',
  monopod: 'metal',
  'recoil-stock': 'furniture',
};

export const ANTI_MATERIEL_SHADES: Readonly<Record<string, number>> = {
  'muzzle-brake': 0.55,
  'barrel-shroud': 0.9,
  bipod: 0.7,
  'carry-handle': 0.75,
  monopod: 0.7,
  'recoil-stock': 1,
};

/** Dark parkerized metal, tan furniture, black rubber pad and perforations. */
export const ANTI_MATERIEL_FINISH: Readonly<Record<string, string>> = {
  metal: 'steel-parkerized',
  furniture: 'polymer-fde',
  accent: 'rubber-black',
};
