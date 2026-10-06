import type { BlockEntity } from './blockEntities.ts';
import type { Inventory } from './inventory.ts';
import { defOf, type Item } from './items.ts';

export type PryPlan =
  | { ok: true; time: number; tool: Item; strikeInterval: number }
  | { ok: false; reason: string; toolNames: string[] };

const toolNamesForQuality = (inventory: Inventory, quality: number): string[] =>
  [...inventory.registry.items.values()]
    .filter((definition) => (definition.tool?.qualities.prying ?? 0) >= quality)
    .map((definition) => definition.name)
    .sort((a, b) => a.localeCompare(b));

export const pryPlan = (inventory: Inventory, entity: BlockEntity, toolUid?: number): PryPlan => {
  const furniture = inventory.entities.defOf(entity);
  const prying = furniture.door?.prying;
  const toolNames = prying ? toolNamesForQuality(inventory, prying.quality) : [];
  const refuse = (reason: string): PryPlan => ({ ok: false, reason, toolNames });
  if (!(furniture.door && entity.lock?.locked)) {
    return refuse("There's no locked padlock to pry");
  }
  if (entity.open) {
    return refuse('Close the door first');
  }
  if (!inventory.canReachEntity(entity)) {
    return refuse('Too far away');
  }
  if (!prying) {
    return refuse("This door's lock can't be pried");
  }
  const carried = [...inventory.items()]
    .filter(({ path }) => path.startsWith('inventory.hands.') || path.startsWith('inventory.worn.'))
    .map(({ item }) => item);
  const candidates = carried.filter(
    (item) => (defOf(inventory.registry, item.type).tool?.qualities.prying ?? 0) >= prying.quality,
  );
  const tool =
    toolUid === undefined
      ? candidates.sort((a, b) =>
          defOf(inventory.registry, a.type).name.localeCompare(defOf(inventory.registry, b.type).name),
        )[0]
      : carried.find((item) => item.uid === toolUid);
  if (!tool || (defOf(inventory.registry, tool.type).tool?.qualities.prying ?? 0) < prying.quality) {
    return refuse(`Need a tool with prying quality ${prying.quality}`);
  }
  return { ok: true, time: prying.time, strikeInterval: prying.strikeInterval, tool };
};
