// Content-owned yields for taking apart a finished item; work progress stays with Inventory.
import type { CraftCharacter } from './character.ts';
import type { ItemDef } from './content.ts';
import type { Item } from './items.ts';
import { isEmpty } from './items.ts';
import type { ReachSnapshot } from './reach.ts';

export interface DisassemblyOutput {
  item: string;
  count: number;
}
export interface DisassemblyPlan {
  kind: 'disassembly';
  source: Item;
  outputs: DisassemblyOutput[];
  skillLevel: number;
  toolLevels: Record<string, number>;
  gather: number;
  duration: number;
}

/** Salvage has no authored work time; its fixed duration is in game seconds. */
export const SALVAGE_DURATION = 5 * 60;

const rounded = (value: number, mode: 'floor' | 'round' | 'ceil'): number => {
  switch (mode) {
    case 'floor':
      return Math.floor(value);
    case 'round':
      return Math.round(value);
    case 'ceil':
      return Math.ceil(value);
    default:
      throw new Error(`Unknown disassembly rounding mode: ${mode}`);
  }
};

export const sameDisassemblyOutputs = (
  left: readonly DisassemblyOutput[],
  right: readonly DisassemblyOutput[],
): boolean =>
  left.length === right.length &&
  left.every((output, index) => output.item === right[index]!.item && output.count === right[index]!.count);

export const validDisassemblyToolLevels = (definition: ItemDef, levels: Record<string, number>): boolean => {
  const qualities = new Set(
    definition.disassembly?.yields.flatMap(({ toolModifier }) => (toolModifier ? [toolModifier.quality] : [])) ?? [],
  );
  return (
    Object.keys(levels).length === qualities.size &&
    [...qualities].every(
      (quality) => Number.isSafeInteger(levels[quality]) && levels[quality]! >= 0 && levels[quality]! <= 5,
    )
  );
};

export const disassemblyOutputs = (
  definition: ItemDef,
  skillLevel: number,
  toolLevel: (quality: string) => number = () => 0,
): DisassemblyOutput[] => {
  const { disassembly } = definition;
  if (!disassembly) {
    return (definition.salvage ?? []).map(({ item, count }) => ({ item, count }));
  }
  return disassembly.yields.flatMap((yieldItem) => {
    const skillFraction = yieldItem.fractions[Math.min(skillLevel, yieldItem.fractions.length - 1)]!;
    const level = yieldItem.toolModifier ? toolLevel(yieldItem.toolModifier.quality) : 0;
    const toolBonus =
      level > 0 && yieldItem.toolModifier
        ? (yieldItem.toolModifier.bonusByLevel[Math.min(level - 1, yieldItem.toolModifier.bonusByLevel.length - 1)] ??
          0)
        : 0;
    const count = rounded(yieldItem.count * Math.min(1, skillFraction + toolBonus), yieldItem.rounding);
    return count > 0 ? [{ item: yieldItem.item, count }] : [];
  });
};

export const planDisassembly = (
  source: Item,
  reach: ReachSnapshot,
  character: CraftCharacter,
): DisassemblyPlan | undefined => {
  if (source.work || !isEmpty(source)) {
    return undefined;
  }
  const entry = reach.entries.find((candidate) => candidate.item === source);
  if (!entry) {
    return undefined;
  }
  const definition = reach.player.inventory.registry.items.get(source.type);
  if (!(definition?.disassembly || definition?.salvage)) {
    return undefined;
  }
  const skill = definition.disassembly?.skill;
  const skillLevel = skill ? (character.skills[skill] ?? 0) : 0;
  const qualityLevel = (quality: string) =>
    Math.max(
      0,
      ...reach.entries.map(({ item }) =>
        item.condition > 0 ? (reach.player.inventory.registry.items.get(item.type)?.tool?.qualities[quality] ?? 0) : 0,
      ),
    );
  const qualities = new Set(
    definition.disassembly?.yields.flatMap(({ toolModifier }) => (toolModifier ? [toolModifier.quality] : [])) ?? [],
  );
  const toolLevels = Object.fromEntries([...qualities].map((quality) => [quality, qualityLevel(quality)]));
  const work = (definition.disassembly?.time ?? SALVAGE_DURATION / 60) * 60;
  return {
    kind: 'disassembly',
    source,
    outputs: disassemblyOutputs(definition, skillLevel, (quality) => toolLevels[quality] ?? 0),
    skillLevel,
    toolLevels,
    gather: entry.handlingTime,
    duration: entry.handlingTime + work,
  };
};
