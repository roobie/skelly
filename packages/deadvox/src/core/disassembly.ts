// Content-owned yields for taking apart a finished item; work progress stays with Inventory.
import { type CraftCharacter, SKILL_LEVEL_MIN, skillEffectLevel } from './character.ts';
import type { ItemDef, Registry } from './content.ts';
import { gatherGameSeconds, indexCraftReach } from './crafting.ts';
import type { Item } from './items.ts';
import { isEmpty } from './items.ts';
import { supplyShare } from './lights.ts';
import type { LiquidAmount, LiquidRecoveryChoices } from './liquids.ts';
import type { ReachSnapshot } from './reach.ts';

export type RecoveryOperation = 'salvage' | 'disassembly';
export type RecoveryTarget =
  | { kind: 'definition'; definition: ItemDef }
  | { kind: 'item'; source: Item; reach: ReachSnapshot };

type RecoveryOutcome =
  | { operation: 'salvage'; outputs: NonNullable<ItemDef['salvage']>; timeGameMinutes: number }
  | { operation: 'disassembly'; capability: NonNullable<ItemDef['disassembly']> };

export type RecoverySelection =
  | { status: 'unsupported'; target: RecoveryTarget; operation: RecoveryOperation }
  | {
      status: 'refused';
      target: RecoveryTarget;
      operation: RecoveryOperation;
      reason: 'work' | 'contents' | 'unreachable';
    }
  | { status: 'ready'; target: RecoveryTarget; outcome: RecoveryOutcome };

const recoveryTargetRefusal = (
  target: RecoveryTarget,
): Extract<RecoverySelection, { status: 'refused' }>['reason'] | undefined => {
  if (target.kind === 'definition') {
    return undefined;
  }
  if (target.source.work) {
    return 'work';
  }
  if (!isEmpty(target.source)) {
    return 'contents';
  }
  if (!target.reach.entries.some(({ item }) => item === target.source)) {
    return 'unreachable';
  }
  return undefined;
};

/** Selects authored capabilities only; it neither generates parts nor chooses a recovery quality policy. */
export const selectRecoveryOperation = (target: RecoveryTarget, operation: RecoveryOperation): RecoverySelection => {
  const definition =
    target.kind === 'definition'
      ? target.definition
      : target.reach.player.inventory.registry.items.get(target.source.type);
  const unsupported = { status: 'unsupported', target, operation } as const;
  if (!definition) {
    return unsupported;
  }
  let outcome: RecoveryOutcome;
  if (operation === 'salvage') {
    if (!definition.salvage) {
      return unsupported;
    }
    if (definition.salvageTimeGameMinutes === undefined) {
      throw new Error(`Item "${definition.id}" has no salvage work time`);
    }
    outcome = {
      operation,
      outputs: definition.salvage,
      timeGameMinutes: definition.salvageTimeGameMinutes,
    };
  } else {
    if (!definition.disassembly) {
      return unsupported;
    }
    outcome = { operation, capability: definition.disassembly };
  }
  const reason = recoveryTargetRefusal(target);
  if (reason) {
    return { status: 'refused', target, operation, reason };
  }
  return { status: 'ready', target, outcome };
};

export interface DisassemblyOutput {
  item: string;
  count: number;
}
export interface DisassemblyPlan extends LiquidRecoveryChoices {
  kind: 'disassembly';
  operation: RecoveryOperation;
  liquids: LiquidAmount[];
  source: Item;
  outputs: DisassemblyOutput[];
  skillLevel: number;
  toolLevels: Record<string, number>;
  gather: number;
  duration: number;
}

const defaultOperation = (definition: ItemDef): RecoveryOperation =>
  definition.disassembly ? 'disassembly' : 'salvage';

export const disassemblyWorkTime = (definition: ItemDef, operation = defaultOperation(definition)): number => {
  const time =
    operation === 'disassembly' ? definition.disassembly?.timeGameMinutes : definition.salvageTimeGameMinutes;
  if (time === undefined) {
    throw new Error(`Item "${definition.id}" has no disassembly work time`);
  }
  return time;
};

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

const recoveryFraction = (definition: ItemDef, operation: RecoveryOperation) =>
  operation === 'disassembly' ? definition.disassembly?.liquidRecovery : definition.salvageLiquidRecovery;

const recoveryQualities = (definition: ItemDef, operation: RecoveryOperation): Set<string> => {
  const rows = operation === 'disassembly' ? [...(definition.disassembly?.yields ?? [])] : [];
  const liquid = recoveryFraction(definition, operation);
  return new Set(
    [...rows, ...(liquid ? [liquid] : [])].flatMap(({ toolModifier }) => (toolModifier ? [toolModifier.quality] : [])),
  );
};

export const validDisassemblyToolLevels = (
  definition: ItemDef,
  levels: Record<string, number>,
  operation = defaultOperation(definition),
): boolean => {
  const qualities = recoveryQualities(definition, operation);
  return (
    Object.keys(levels).length === qualities.size &&
    [...qualities].every(
      (quality) => Number.isSafeInteger(levels[quality]) && levels[quality]! >= 0 && levels[quality]! <= 5,
    )
  );
};

const recoveryMultiplier = (
  row: NonNullable<NonNullable<ItemDef['disassembly']>['liquidRecovery']>,
  skillLevel: number,
  toolLevel: (quality: string) => number,
): number => {
  const effectLevel = skillEffectLevel(skillLevel);
  const fraction = row.fractions[Math.min(effectLevel, row.fractions.length - 1)]!;
  const level = row.toolModifier ? toolLevel(row.toolModifier.quality) : 0;
  const bonus =
    level > 0 && row.toolModifier
      ? row.toolModifier.bonusByLevel[Math.min(level - 1, row.toolModifier.bonusByLevel.length - 1)]!
      : 0;
  return Math.min(1, fraction + bonus);
};

export const disassemblyLiquidOutputs = (
  registry: Registry,
  source: Item,
  skillLevel: number,
  {
    toolLevel = () => 0,
    operation = defaultOperation(registry.items.get(source.type)!),
  }: {
    toolLevel?: (quality: string) => number;
    operation?: RecoveryOperation;
  } = {},
): LiquidAmount[] => {
  const definition = registry.items.get(source.type)!;
  const row = recoveryFraction(definition, operation);
  if (!source.craftedLiquids) {
    return [];
  }
  if (!row) {
    throw new Error(`Item "${source.type}" has recorded liquid but no ${operation} liquid recovery`);
  }
  const supply = definition.light?.burnTimeGameHours === undefined ? undefined : supplyShare(registry, source);
  const burnShare = supply?.kind === 'share' ? supply.share : 1;
  const multiplier = recoveryMultiplier(row, skillLevel, toolLevel);
  return source.craftedLiquids.flatMap(({ liquid, volumeMicrolitres }) => {
    const volume = rounded(volumeMicrolitres * burnShare * multiplier, row.rounding);
    return volume > 0 ? [{ liquid, volumeMicrolitres: volume }] : [];
  });
};

export const disassemblyOutputs = (
  definition: ItemDef,
  skillLevel: number,
  toolLevel: (quality: string) => number = () => 0,
  operation = defaultOperation(definition),
): DisassemblyOutput[] => {
  const { disassembly } = definition;
  if (operation === 'salvage') {
    return (definition.salvage ?? []).map(({ item, count }) => ({ item, count }));
  }
  if (!disassembly) {
    return [];
  }
  return disassembly.yields.flatMap((yieldItem) => {
    const count = rounded(yieldItem.count * recoveryMultiplier(yieldItem, skillLevel, toolLevel), yieldItem.rounding);
    return count > 0 ? [{ item: yieldItem.item, count }] : [];
  });
};

export const planDisassembly = (
  source: Item,
  reach: ReachSnapshot,
  character: CraftCharacter,
  choices: LiquidRecoveryChoices & { operation?: RecoveryOperation } = {},
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
  const operation = choices.operation ?? defaultOperation(definition);
  if (selectRecoveryOperation({ kind: 'item', source, reach }, operation).status !== 'ready') {
    return undefined;
  }
  const skill = operation === 'disassembly' ? definition.disassembly?.skill : definition.salvageLiquidRecovery?.skill;
  const skillLevel = skill ? (character.skills[skill] ?? SKILL_LEVEL_MIN) : SKILL_LEVEL_MIN;
  const reachIndex = indexCraftReach(reach);
  const qualityLevel = (quality: string) =>
    Math.max(0, ...(reachIndex.qualities.get(quality) ?? []).map(({ level }) => level));
  const qualities = recoveryQualities(definition, operation);
  const toolLevels = Object.fromEntries([...qualities].map((quality) => [quality, qualityLevel(quality)]));
  const work = disassemblyWorkTime(definition, operation);
  const gather = gatherGameSeconds(entry.handlingTime, reach.player.clock.ratio);
  return {
    kind: 'disassembly',
    source,
    operation,
    liquids: disassemblyLiquidOutputs(reach.player.inventory.registry, source, skillLevel, {
      toolLevel: (quality) => toolLevels[quality] ?? 0,
      operation,
    }),
    receivers: (choices.receivers ?? []).map((receiver) => ({ ...receiver })),
    spillApproval: (choices.spillApproval ?? []).map((approval) => ({ ...approval })),
    outputs: disassemblyOutputs(definition, skillLevel, (quality) => toolLevels[quality] ?? 0, operation),
    skillLevel,
    toolLevels,
    gather,
    duration: gather + work,
  };
};
