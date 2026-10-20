import type { BlockEntity } from './blockEntities.ts';
import { SKILL_LEVEL_MAX, SKILL_LEVEL_MIN, skillEffectLevel, skillSaturation } from './character.ts';
import type { Inventory } from './inventory.ts';
import { defOf, type Item } from './items.ts';
import type { SoundId } from './soundEvents.ts';

export interface PryCharacter {
  readonly skills: Readonly<Record<string, number>>;
}

export type PryPlan =
  | { ok: true; method: string; time: number; tool: Item; strikeInterval: number; strikeSound: SoundId }
  | { ok: false; reason: string; toolNames: string[] };

const durationForSkill = (time: number, fastestTime: number, skillLevel: number): number => {
  const effectLevel = skillEffectLevel(skillLevel);
  const slowEffect = skillSaturation(SKILL_LEVEL_MIN, 0.42, 4);
  const fastEffect = skillSaturation(SKILL_LEVEL_MAX, 0.42, 4);
  const effect = skillSaturation(effectLevel, 0.42, 4);
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
  const refuse = (reason: string): PryPlan => ({ ok: false, reason, toolNames });
  if (!(furniture.door && entity.lock?.locked)) {
    return refuse("There's no locked padlock to force");
  }
  if (entity.open) {
    return refuse('Close the door first');
  }
  if (!inventory.canReachEntity(entity)) {
    return refuse('Too far away');
  }
  if (methods.length === 0) {
    return refuse("I can't force this lock");
  }
  const carried = [...inventory.items()]
    .filter(({ path }) => path.startsWith('inventory.hands.') || path.startsWith('inventory.worn.'))
    .map(({ item }) => item)
    .filter((item) => toolUid === undefined || item.uid === toolUid)
    .sort((a, b) => defOf(inventory.registry, a.type).name.localeCompare(defOf(inventory.registry, b.type).name));
  for (const [method, tuning] of methods) {
    const tool = carried.find((item) => meets(item.type, tuning));
    if (!tool) {
      continue;
    }
    const skillLevel = character?.skills[tuning.skill] ?? SKILL_LEVEL_MIN;
    const time = durationForSkill(tuning.timeSimSeconds, tuning.fastestTimeSimSeconds, skillLevel);
    const strikeInterval = tuning.strikeIntervalSimSeconds * (time / tuning.timeSimSeconds);
    return { ok: true, method, time, strikeInterval, strikeSound: tuning.strikeSound, tool };
  }
  return refuse(
    `Need a tool with ${methods.map(([, method]) => `${method.quality} quality ${method.level}`).join(' or ')}`,
  );
};
