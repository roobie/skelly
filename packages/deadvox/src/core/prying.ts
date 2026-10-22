import type { BlockEntity } from './blockEntities.ts';
import { SKILL_LEVEL_MAX, SKILL_LEVEL_MIN, skillEffectLevel, skillSaturation } from './character.ts';
import type { FurnitureDef, Registry } from './content.ts';
import { coreMessage } from './coreText.ts';
import type { Inventory } from './inventory.ts';
import { defOf, type Item } from './items.ts';
import { chargeOf } from './lights.ts';
import type { SoundId } from './soundEvents.ts';

export interface PryCharacter {
  readonly skills: Readonly<Record<string, number>>;
}

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

const durationForSkill = (
  time: number,
  fastestTime: number,
  skillLevel: number,
  curve: { floor: number; halfLifeLevels: number },
): number => {
  const effectLevel = skillEffectLevel(skillLevel);
  const slowEffect = skillSaturation(SKILL_LEVEL_MIN, curve);
  const fastEffect = skillSaturation(SKILL_LEVEL_MAX, curve);
  const effect = skillSaturation(effectLevel, curve);
  const progress = (slowEffect - effect) / (slowEffect - fastEffect);
  return time + (fastestTime - time) * progress;
};

export const pryPlan = (
  inventory: Inventory,
  entity: BlockEntity,
  options: { toolUid?: number | undefined; method?: string | undefined } = {},
  character?: PryCharacter,
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
    .sort((a, b) => a.localeCompare(b));
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
  const carried = [...inventory.items()]
    .filter(({ path }) => path.startsWith('inventory.hands.') || path.startsWith('inventory.worn.'))
    .map(({ item }) => item)
    .filter((item) => toolUid === undefined || item.uid === toolUid)
    .sort((a, b) => defOf(inventory.registry, a.type).name.localeCompare(defOf(inventory.registry, b.type).name));
  let fuelRefusal: string | undefined;
  for (const [method, tuning] of methods) {
    const capable = carried.filter((item) => meets(item.type, tuning));
    const tool = capable.find((item) => (chargeOf(inventory.registry, item) ?? 0) >= (tuning.fuel ?? 0));
    if (tool) {
      return planFor({ inventory, method, tuning, tool, character });
    }
    fuelRefusal = capable.length > 0 ? dryRefusal(registry, capable) : fuelRefusal;
  }
  return refuse(fuelRefusal ?? coreMessage(registry, 'nothingToForce'));
};

type Tuning = NonNullable<FurnitureDef['door']>['methods'][string];

/** Why tools that meet the method can't start it: they hold too little gas. */
const dryRefusal = (registry: Registry, capable: Item[]): string =>
  coreMessage(registry, capable.some((item) => item.slots?.canister) ? 'notEnoughGas' : 'noCartridge');

const planFor = ({
  inventory,
  method,
  tuning,
  tool,
  character,
}: {
  inventory: Inventory;
  method: string;
  tuning: Tuning;
  tool: Item;
  character?: PryCharacter | undefined;
}): PryPlan => {
  const skillLevel = character?.skills[tuning.skill] ?? SKILL_LEVEL_MIN;
  const curve = inventory.registry.skills.get(tuning.skill)?.curve;
  if (curve === undefined) {
    throw new Error(`Missing skill curve content for ${tuning.skill}`);
  }
  const time = durationForSkill(tuning.timeSimSeconds, tuning.fastestTimeSimSeconds, skillLevel, {
    floor: curve.saturationFloor,
    halfLifeLevels: curve.saturationHalfLifeLevels,
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
