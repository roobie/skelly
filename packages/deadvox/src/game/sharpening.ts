import type { BlockEntity } from '../core/blockEntities.ts';
import { claimed } from '../core/capabilities.ts';
import { type Character, SKILL_LEVEL_MIN, skillEffectLevel } from '../core/character.ts';
import type { RecipeDef } from '../core/content.ts';
import { craftWorkDuration } from '../core/crafting.ts';
import type { HandlingQueue, JobParams } from '../core/handling.ts';
import type { HandSide, Inventory } from '../core/inventory.ts';
import { defOf, type Item } from '../core/items.ts';
import type { ReachSnapshot } from '../core/reach.ts';
import { craftingActivityTier } from '../core/skillTraining.ts';
import { gameSecondsToMinutes } from '../core/time.ts';

export const sharpeningMethods = (inventory: Inventory, blade: Item): RecipeDef[] =>
  [...inventory.registry.recipes.values()].filter(
    (recipe) => recipe.activation === 'sharpen' && recipe.result.item === blade.type,
  );

const heldTool = (inventory: Inventory, blade: Item, method: RecipeDef): Item | undefined => {
  const at = inventory.locate(blade);
  if (at?.kind !== 'hand') {
    return undefined;
  }
  const tool = inventory.hands[at.side === 'right' ? 'left' : 'right'];
  return tool &&
    tool.condition > 0 &&
    Object.entries(method.qualities).every(
      ([quality, level]) => (defOf(inventory.registry, tool.type).tool?.qualities[quality] ?? 0) >= level,
    )
    ? tool
    : undefined;
};

export const sharpeningTargetForHand = (inventory: Inventory, hand: HandSide): Item | undefined => {
  const own = inventory.hands[hand];
  const other = inventory.hands[hand === 'right' ? 'left' : 'right'];
  return [own, other].find(
    (blade) =>
      blade &&
      sharpeningMethods(inventory, blade).some((method) => !method.workstation && heldTool(inventory, blade, method)),
  );
};

export class Sharpening {
  private readonly inventory: Inventory;
  private readonly queue: HandlingQueue;
  private readonly character: Character;
  private readonly reach: () => ReachSnapshot;
  private readonly clockRatio: number;

  constructor(
    inventory: Inventory,
    queue: HandlingQueue,
    context: {
      character: Character;
      reach: () => ReachSnapshot;
      clockRatio: number;
    },
  ) {
    const { character, reach, clockRatio } = context;
    this.inventory = inventory;
    this.queue = queue;
    this.character = character;
    this.reach = reach;
    this.clockRatio = clockRatio;
    queue.registerAction('item.sharpen', (params) => this.complete(params));
  }

  wheelMethod(blade: Item, station: BlockEntity | undefined): RecipeDef | undefined {
    if (!station) {
      return undefined;
    }
    const found = this.reach().workstations.find((entry) => entry.entity === station);
    return (
      found &&
      sharpeningMethods(this.inventory, blade).find(
        (method) =>
          method.workstation === found.id &&
          Object.entries(method.qualities).every(([quality, level]) => (found.qualities[quality] ?? 0) >= level),
      )
    );
  }

  activate(hand: HandSide, station?: BlockEntity): string | undefined {
    const blade = station ? this.inventory.hands[hand] : sharpeningTargetForHand(this.inventory, hand);
    if (!blade) {
      return 'I need a blade and a sharpening tool in my hands';
    }
    const method = station
      ? this.wheelMethod(blade, station)
      : sharpeningMethods(this.inventory, blade).find(
          (entry) => !entry.workstation && heldTool(this.inventory, blade, entry),
        );
    if (!method) {
      return 'I cannot sharpen this here';
    }
    if (blade.condition >= 1) {
      return 'My blade is already sharp';
    }
    if (this.queue.busy) {
      return 'My hands are busy';
    }
    if (!this.character.knownRecipes.has(method.id)) {
      return 'I do not know how to sharpen this';
    }
    if (
      Object.entries(method.skills).some(
        ([skill, level]) => skillEffectLevel(this.character.skills[skill] ?? SKILL_LEVEL_MIN) < level,
      )
    ) {
      return 'I lack the skill to sharpen this';
    }
    const bonus = station && this.reach().workstations.find((entry) => entry.entity === station)?.workFactorBonus;
    const repair = method.repair!;
    const amount = Math.min(
      1,
      repair.amount + repair.perSkill * skillEffectLevel(this.character.skills[repair.skill] ?? SKILL_LEVEL_MIN),
    );
    this.queue.enqueueAction(
      'item.sharpen',
      `Sharpen ${this.inventory.name(blade)}`,
      craftWorkDuration(method, this.character, bonus || 0) / this.clockRatio,
      {
        uid: blade.uid,
        recipe: method.id,
        toolUid: station ? null : heldTool(this.inventory, blade, method)!.uid,
        stationUid: station?.uid ?? null,
        amount,
      },
    );
    return undefined;
  }

  private complete(params: JobParams): string | undefined {
    const blade = typeof params.uid === 'number' ? this.inventory.itemByUid(params.uid) : undefined;
    const method = typeof params.recipe === 'string' ? this.inventory.registry.recipes.get(params.recipe) : undefined;
    if (
      !blade ||
      this.inventory.locate(blade)?.kind !== 'hand' ||
      method?.activation !== 'sharpen' ||
      method.result.item !== blade.type
    ) {
      return 'I am no longer holding that blade';
    }
    if (method.workstation) {
      const station = this.reach().workstations.find((entry) => entry.entity.uid === params.stationUid)?.entity;
      if (!station || this.wheelMethod(blade, station) !== method) {
        return 'I can no longer reach the sharpening wheel';
      }
    } else if (heldTool(this.inventory, blade, method)?.uid !== params.toolUid) {
      return 'I no longer have the sharpening tool in my other hand';
    }
    if (typeof params.amount !== 'number') {
      return 'I cannot sharpen this';
    }
    blade.condition = Math.min(1, blade.condition + params.amount);
    this.inventory.version += 1;
    const offset = claimed(this.inventory.registry.skills, 'crafting')!.training!.craftingTierOffset!;
    for (const [skill, level] of Object.entries(method.skills)) {
      this.character.awardPractice(
        skill,
        gameSecondsToMinutes(method.timeGameMinutes),
        craftingActivityTier(level, offset),
      );
    }
    return undefined;
  }
}
