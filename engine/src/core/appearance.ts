import type { AppearanceContext, Palette, SrgbColor } from './design.ts';

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
}

export const srgbToHex = (color: SrgbColor): number =>
  (Math.round(color[0] * 255) << 16) | (Math.round(color[1] * 255) << 8) | Math.round(color[2] * 255);

const own = <T>(table: Readonly<Record<string, T>> | undefined, key: string): T | undefined =>
  table && Object.hasOwn(table, key) ? table[key] : undefined;

export const solidColor = (palette: Palette, family: string, solidId: string, material?: string): SrgbColor =>
  (material ? own(palette.materials, material) : undefined) ??
  own(palette.specialColors, solidId) ??
  own(palette.familyColors, family) ??
  palette.fallbackColor;

/** One domain-agnostic appearance policy shared by the viewer and exporters. */
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
    (slot && context.variant ? own(own(palette.archetypeFinishes, context.variant) ?? {}, slot) : undefined) ??
    own(palette.roleMaterials, role);
  const legacySpecial = own(palette.specialColors, solidId);
  const base =
    (material ? own(palette.materials, material) : undefined) ??
    legacySpecial ??
    own(palette.familyColors, role) ??
    palette.fallbackColor;
  const shade: SrgbColor = own(palette.roleShades, role) ?? [1, 1, 1];
  return {
    ...(material === undefined ? {} : { material }),
    ...(slot === undefined ? {} : { slot }),
    color: [base[0] * shade[0], base[1] * shade[1], base[2] * shade[2]],
  };
};
