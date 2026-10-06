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
