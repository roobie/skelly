import type { AppearanceContext, MaterialAppearance, Palette, SrgbColor } from './exportTypes.ts';

export interface AppearanceOverrides {
  readonly partMaterial?: string;
  readonly partSlot?: string;
  readonly solidMaterial?: string;
  readonly solidSlot?: string;
}

export interface ResolvedAppearance {
  readonly material?: string;
  readonly slot?: string;
  readonly color: SrgbColor;
  readonly shade: SrgbColor;
  readonly finish: MaterialAppearance['finish'];
}

export const srgbToHex = (color: SrgbColor): number =>
  (Math.round(color[0] * 255) << 16) | (Math.round(color[1] * 255) << 8) | Math.round(color[2] * 255);

export const invalidPaletteFinish = (palette: Palette): string | undefined => {
  const finishes: [string, MaterialAppearance['finish']][] = [
    ['fallback', palette.fallbackFinish],
    ...Object.entries(palette.materials ?? {}).map(([id, material]): [string, MaterialAppearance['finish']] => [
      id,
      material.finish,
    ]),
  ];
  return finishes.find(
    ([, finish]) =>
      ![finish?.metallic, finish?.roughness].every((value) => Number.isFinite(value) && value >= 0 && value <= 1),
  )?.[0];
};

const own = <T>(table: Readonly<Record<string, T>> | undefined, key: string): T | undefined =>
  table && Object.hasOwn(table, key) ? table[key] : undefined;

const selectedMaterial = (palette: Palette, id: string | undefined): MaterialAppearance | undefined => {
  if (id === undefined) {
    return undefined;
  }
  const material = own(palette.materials, id);
  if (!material) {
    throw new Error(`Unknown palette material ${id}`);
  }
  return material;
};

export const solidColor = (palette: Palette, family: string, solidId: string, material?: string): SrgbColor =>
  selectedMaterial(palette, material)?.colour ??
  own(palette.specialColors, solidId) ??
  own(palette.familyColors, family) ??
  palette.fallbackColor;

export const resolveAppearance = (
  palette: Palette,
  role: string,
  solidId: string,
  options: { readonly context?: AppearanceContext; readonly overrides?: AppearanceOverrides } = {},
): ResolvedAppearance => {
  const context = options.context ?? {};
  const overrides = options.overrides ?? {};
  const slot = overrides.solidSlot ?? overrides.partSlot ?? own(palette.roleSlots, role);
  const material =
    overrides.solidMaterial ??
    overrides.partMaterial ??
    (slot ? own(context.finish, slot) : undefined) ??
    (slot && context.appearanceProfile
      ? own(own(palette.profileFinishes, context.appearanceProfile) ?? {}, slot)
      : undefined) ??
    own(palette.roleMaterials, role);
  const selected = selectedMaterial(palette, material);
  const base =
    selected?.colour ?? own(palette.specialColors, solidId) ?? own(palette.familyColors, role) ?? palette.fallbackColor;
  const shade: SrgbColor = own(palette.roleShades, role) ?? [1, 1, 1];
  return {
    ...(material === undefined ? {} : { material }),
    ...(slot === undefined ? {} : { slot }),
    color: [base[0] * shade[0], base[1] * shade[1], base[2] * shade[2]],
    shade,
    finish: selected?.finish ?? palette.fallbackFinish,
  };
};
