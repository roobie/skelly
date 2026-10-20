import { MATERIALS } from '@skelly/thing-core/materials';
import {
  invalidPaletteFinish,
  type ResolvedAppearance,
  resolveAppearance as resolveCoreAppearance,
} from '@skelly/thing-export/appearance.ts';
import type { Palette, SrgbColor } from '@skelly/thing-export/exportTypes.ts';
import content from './appearance.json' with { type: 'json' };

export const hexToSrgb = (hex: number): SrgbColor => [
  ((hex >> 16) & 0xff) / 255,
  ((hex >> 8) & 0xff) / 255,
  (hex & 0xff) / 255,
];

const validColor = (c: SrgbColor): boolean => c.length === 3 && c.every((x) => Number.isFinite(x) && x >= 0 && x <= 1);

export const createPalette = (palette: Palette): Palette => {
  const entries: [string, SrgbColor][] = [
    ...Object.entries(palette.familyColors).map(([k, c]): [string, SrgbColor] => [`family ${k}`, c]),
    ...Object.entries(palette.specialColors).map(([k, c]): [string, SrgbColor] => [`special ${k}`, c]),
    ...Object.entries(palette.materials ?? {}).map(([k, c]): [string, SrgbColor] => [`material ${k}`, c.colour]),
    ...Object.entries(palette.roleShades ?? {}).map(([k, c]): [string, SrgbColor] => [`shade ${k}`, c]),
    ['fallback', palette.fallbackColor],
  ];
  for (const [key, color] of entries) {
    if (!validColor(color)) {
      throw new Error(`palette colour ${key} must have three finite channels in [0,1]`);
    }
  }
  const badFinish = invalidPaletteFinish(palette);
  if (badFinish !== undefined) {
    throw new Error(`palette finish ${badFinish} needs finite metallic and roughness values in [0,1]`);
  }
  for (const id of [
    ...Object.values(palette.roleMaterials ?? {}),
    ...Object.values(palette.profileFinishes ?? {}).flatMap(Object.values),
  ]) {
    if (!Object.hasOwn(palette.materials ?? {}, id)) {
      throw new Error(`palette references unknown material ${id}`);
    }
  }
  return palette;
};

const colour = (value: number[]): SrgbColor => {
  if (value.length !== 3) {
    throw new Error('Palette colour needs three channels');
  }
  return [value[0]!, value[1]!, value[2]!];
};
const colours = (table: Record<string, number[]>): Record<string, SrgbColor> =>
  Object.fromEntries(Object.entries(table).map(([id, value]) => [id, colour(value)]));

const contentPalette = (definition: typeof content.gun | typeof content.ammunition): Palette => {
  const { familyColors, specialColors, fallbackColor, fallbackFinishMaterial, ...policy } = definition;
  const fallback = MATERIALS[fallbackFinishMaterial];
  if (!fallback) {
    throw new Error(`Unknown fallback finish material ${fallbackFinishMaterial}`);
  }
  return createPalette({
    ...policy,
    familyColors: colours(familyColors),
    specialColors: colours(specialColors),
    fallbackColor: colour(fallbackColor),
    roleShades: 'roleShades' in definition ? colours(definition.roleShades) : {},
    materials: MATERIALS,
    fallbackFinish: fallback.finish,
  });
};

export const GUN_APPEARANCE = content;
export const GUN_FINISH_SLOTS = content.finishSlots;
export const GUN_PALETTE = contentPalette(content.gun);
export const AMMO_PALETTE = contentPalette(content.ammunition);
export type Appearance = ResolvedAppearance;

export const resolveAppearance = (
  palette: Palette,
  role: string,
  solidId: string,
  options: {
    readonly archetype?: string;
    readonly finish?: Readonly<Record<string, string>>;
    readonly material?: string;
    readonly slot?: string;
  } = {},
): Appearance =>
  resolveCoreAppearance(palette, role, solidId, {
    context: {
      ...(options.archetype === undefined ? {} : { appearanceProfile: options.archetype }),
      ...(options.finish === undefined ? {} : { finish: options.finish }),
    },
    overrides: {
      ...(options.material === undefined ? {} : { partMaterial: options.material }),
      ...(options.slot === undefined ? {} : { partSlot: options.slot }),
    },
  });
