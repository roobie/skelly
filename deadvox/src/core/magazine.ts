// A detachable box magazine (SLICE-3.md, 3.2): an item whose model carries gungen's fitted round column.
// Its cartridges are item state in feed order: index 0 is the top round, the next one fed or stripped.
import type { Registry } from './content.ts';

export interface MagazineSpec {
  readonly calibre: string;
  readonly capacity: number;
}

/** The magazine's calibre and capacity, from its exported model; undefined when the type is not a magazine. */
export const magazineSpec = (registry: Registry, type: string): MagazineSpec | undefined => {
  const def = registry.items.get(type);
  const model = def?.model === undefined ? undefined : registry.models.get(def.model);
  if (model?.capacity === undefined || model.calibre === undefined || def?.firearm) {
    return undefined;
  }
  return { calibre: model.calibre, capacity: model.capacity };
};

/** The calibre a magazine-fed firearm takes: every firearm but the pump feeds from a magazine slot. */
export const magazineWellCalibre = (registry: Registry, type: string): string | undefined => {
  const def = registry.items.get(type);
  if (!def?.firearm || def.firearm.pump) {
    return undefined;
  }
  return def.model === undefined ? undefined : registry.models.get(def.model)?.calibre;
};

/** Whether a magazine of this type fits the firearm's magazine slot: same calibre. */
export const magazineFits = (registry: Registry, firearmType: string, magazineType: string): boolean => {
  const calibre = magazineWellCalibre(registry, firearmType);
  return calibre !== undefined && magazineSpec(registry, magazineType)?.calibre === calibre;
};

/** Why `slots` can't be fitted to this item, or undefined when they can. */
export const slotsReason = (
  registry: Registry,
  type: string,
  slots: { readonly magazine?: { readonly type: string } | undefined } | undefined,
): string | undefined => {
  if (magazineWellCalibre(registry, type) === undefined) {
    return slots === undefined ? undefined : 'Only a magazine-fed firearm has slots';
  }
  if (slots === undefined) {
    return 'A magazine-fed firearm needs its slots';
  }
  return slots.magazine === undefined || magazineFits(registry, type, slots.magazine.type)
    ? undefined
    : 'The fitted magazine does not fit this firearm';
};

/** Why `cartridges` can't be this magazine's contents, or undefined when they can. */
export const magazineContentsReason = (
  registry: Registry,
  type: string,
  cartridges: readonly string[] | undefined,
): string | undefined => {
  const spec = magazineSpec(registry, type);
  if (!spec) {
    return cartridges === undefined ? undefined : 'Only a magazine holds cartridges';
  }
  if (cartridges === undefined) {
    return 'A magazine needs its cartridge list';
  }
  if (cartridges.length > spec.capacity) {
    return 'Magazine holds more than its capacity';
  }
  return cartridges.every((round) => registry.items.get(round)?.ammo?.calibre === spec.calibre)
    ? undefined
    : 'Magazine holds a cartridge of another calibre';
};
