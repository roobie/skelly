import type { BlockEntity } from './blockEntities.ts';
import { compareCodeUnits } from './codeUnitOrder.ts';
import type { FurnitureDef } from './content.ts';
import { coreMessage } from './coreText.ts';
import type { Inventory } from './inventory.ts';
import { defOf, type Item } from './items.ts';
import { type EffectActor, modified, UNSKILLED } from './modifiers.ts';
import type { SoundId } from './soundEvents.ts';
import { fuelCovers, fuelRefusal } from './torch.ts';

export type PryPlan =
  | {
      ok: true;
      method: string;
      time: number;
      tool: Item;
      strikeInterval: number;
      strikeSound: SoundId;
      /** Canister fill the finished cut spends from `tool`. */
      fuel?: number;
    }
  | { ok: false; reason: string; toolNames: string[] };

export const pryPlan = (
  inventory: Inventory,
  entity: BlockEntity,
  options: { toolUid?: number | undefined; method?: string | undefined } = {},
  character?: EffectActor,
): PryPlan => {
  const { toolUid, method: methodId } = options;
  const furniture = inventory.entities.defOf(entity);
  const methods = Object.entries(furniture.door?.methods ?? {}).filter(
    ([id]) => methodId === undefined || id === methodId,
  );
  const meets = (type: string, method: (typeof methods)[number][1]) =>
    (defOf(inventory.registry, type).tool?.qualities[method.quality] ?? 0) >= method.level;
  const toolNames = [...inventory.registry.items.values()]
    .filter((definition) => methods.some(([, method]) => meets(definition.id, method)))
    .map((definition) => definition.name)
    .sort(compareCodeUnits);
  const { registry } = inventory;
  const refuse = (reason: string): PryPlan => ({ ok: false, reason, toolNames });
  if (!(furniture.door && entity.lock?.locked)) {
    return refuse(coreMessage(registry, 'noPadlock'));
  }
  if (entity.open) {
    return refuse(coreMessage(registry, 'doorOpen'));
  }
  if (!inventory.canReachEntity(entity)) {
    return refuse(coreMessage(registry, 'tooFar'));
  }
  if (methods.length === 0) {
    return refuse(coreMessage(registry, 'cantForce'));
  }
  const carried = inventory.carriedTools().filter((item) => toolUid === undefined || item.uid === toolUid);
  let dry: string | undefined;
  for (const [method, tuning] of methods) {
    const capable = carried.filter((item) => meets(item.type, tuning));
    const tool = capable.find((item) => fuelCovers(registry, item, tuning.fuel ?? 0));
    if (tool) {
      return planFor({ method, tuning, tool, character });
    }
    dry = capable.length > 0 ? fuelRefusal(registry, capable) : dry;
  }
  return refuse(dry ?? coreMessage(registry, 'nothingToForce'));
};

type Tuning = NonNullable<FurnitureDef['door']>['methods'][string];

const planFor = ({
  method,
  tuning,
  tool,
  character,
}: {
  method: string;
  tuning: Tuning;
  tool: Item;
  character?: EffectActor | undefined;
}): PryPlan => {
  const time = modified('door.forcingSimSeconds', tuning.timeSimSeconds, character ?? UNSKILLED, {
    skills: tuning.skills,
  });
  const strikeInterval = tuning.strikeIntervalSimSeconds * (time / tuning.timeSimSeconds);
  return {
    ok: true,
    method,
    time,
    strikeInterval,
    strikeSound: tuning.strikeSound,
    tool,
    ...(tuning.fuel === undefined ? {} : { fuel: tuning.fuel }),
  };
};
