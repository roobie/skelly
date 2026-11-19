// Part service (`packages/deadvox/docs/holdout.md`, "Supplies and progression"): removing or fitting one housing
// slot's part is a timed job on the piece, gated by that slot's own tools and skills. Planning here is pure.
import type { BlockEntity } from './blockEntities.ts';
import type { CraftCharacter } from './character.ts';
import type { Registry } from './content.ts';
import { type CraftRequirements, toolSkillStatus } from './crafting.ts';
import { instanceName } from './holders.ts';
import { housingBlueprint, slotAccepts } from './housing.ts';
import type { Location } from './inventory.ts';
import type { Item, PartServiceOperation } from './items.ts';
import type { ReachSnapshot } from './reach.ts';
import type { PartBlueprintDef } from './schema.ts';

export type PartServiceRequest =
  | { slot: string; operation: 'remove' }
  | { slot: string; operation: 'fit'; itemUid: number };

export interface PartServicePlan {
  kind: 'partService';
  entity: BlockEntity;
  slot: string;
  operation: PartServiceOperation;
  /** The part type leaving the slot, or the spare's type going in. */
  part: string;
  /** A fit's spare, escrowed as the job's one component at Start. */
  spare?: Item;
  /** Game seconds, after content load. */
  timeGameMinutes: number;
}

export type ServiceSlot = PartBlueprintDef['slots'][number];

export const serviceSlot = (registry: Registry, furniture: string, slot: string): ServiceSlot | undefined =>
  housingBlueprint(registry, furniture)?.slots.find(({ id }) => id === slot);

export const serviceStatus = (
  slot: ServiceSlot,
  reach: ReachSnapshot,
  character: CraftCharacter,
): Pick<CraftRequirements, 'skills' | 'qualities'> => toolSkillStatus(slot.service, reach, character);

/** Every spare of a type in reach that fits the slot: highest condition, then lowest uid, so the order is stable. */
export const fittingSpares = (
  slot: ServiceSlot,
  type: string,
  reach: ReachSnapshot,
  free: (item: Item) => boolean,
): Item[] =>
  reach.entries
    .map(({ item }) => item)
    .filter((item) => item.type === type && !item.work && slotAccepts(slot, item) && free(item))
    .sort((a, b) => b.condition - a.condition || a.uid - b.uid);

/** Where a spare lies, as data a screen words; `in` names its immediate holder. */
export type SpareWhere = { kind: 'hand' } | { kind: 'worn' } | { kind: 'ground' } | { kind: 'in'; container: string };

/** Where a spare free to fit lies; undefined for a place no free spare can be, such as fitted or in work. */
export const spareWhere = (registry: Registry, location: Location): SpareWhere | undefined => {
  switch (location.kind) {
    case 'hand':
    case 'worn':
      return { kind: location.kind };
    case 'pile':
      return { kind: 'ground' };
    case 'pocket':
      return { kind: 'in', container: instanceName(registry, location.owner) };
    case 'furniture':
      return { kind: 'in', container: registry.furniture.get(location.entity.type)!.name };
    default:
      return undefined;
  }
};

export const planPartService = (
  entity: BlockEntity,
  slot: ServiceSlot,
  job: Pick<PartServicePlan, 'operation' | 'part' | 'spare'>,
): PartServicePlan => ({
  kind: 'partService',
  entity,
  slot: slot.id,
  operation: job.operation,
  part: job.part,
  ...(job.spare ? { spare: job.spare } : {}),
  timeGameMinutes: slot.service.timeGameMinutes,
});
