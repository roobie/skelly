import { claimed } from './capabilities.ts';
import type { ItemDef, Registry } from './content.ts';
import { defOf, type Item } from './items.ts';
import type { PlayerStance } from './playerStance.ts';
import type { WearSlot } from './schema.ts';

export type FigureModelEntry = NonNullable<ItemDef['figureModels']>[number];

type Worn = Readonly<Partial<Record<WearSlot, Item>>>;

/** The fit a worn torso item asks of the pieces drawn over it (`figureFit`). */
export const wornFigureFit = (registry: Registry, worn: Worn): string | undefined => {
  const slot = claimed(registry.wearSlots, 'underLayerFit')?.id;
  const item = slot !== undefined && Object.hasOwn(worn, slot) ? worn[slot] : undefined;
  return item && defOf(registry, item.type).wearable?.figureFit;
};

/** The figure models a worn item and the items in its slots draw, each with the model the torso's fit picks. */
export const wornFigureEntries = (
  registry: Registry,
  item: Item,
  fit: string | undefined,
): { owner: Item; entry: FigureModelEntry }[] =>
  [item, ...Object.values(item.slots ?? {}).filter((child): child is Item => child !== undefined)].flatMap((owner) =>
    (defOf(registry, owner.type).figureModels ?? []).map((authored) => {
      const model = fit && authored.overTorso ? authored.overTorso[fit]! : authored.model;
      return { owner, entry: model === authored.model ? authored : { ...authored, model } };
    }),
  );

/**
 * How far the worn soles stand the figure above the ground: the largest `soleLift` among the worn models. A prone
 * figure lies on the ground rather than standing on its soles, so it takes none.
 */
export const wornSoleLiftMetres = (registry: Registry, worn: Worn, stance: PlayerStance): number => {
  if (stance === 'prone') {
    return 0;
  }
  const fit = wornFigureFit(registry, worn);
  return Math.max(
    0,
    ...Object.values(worn).flatMap((item) =>
      item
        ? wornFigureEntries(registry, item, fit).map(({ entry }) => registry.models.get(entry.model)?.soleLift ?? 0)
        : [],
    ),
  );
};
