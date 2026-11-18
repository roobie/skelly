// Part service (`packages/deadvox/docs/holdout.md`, "Supplies and progression"): removing or fitting one housing
// slot's part is a timed job on the piece, gated by that slot's own tools and skills. Planning here is pure.
import type { BlockEntity } from './blockEntities.ts';
import type { CraftCharacter } from './character.ts';
import type { Registry } from './content.ts';
import { type CraftRequirements, toolSkillStatus } from './crafting.ts';
import { housingBlueprint, slotAccepts } from './housing.ts';
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

/** The best spare of a type in reach: highest condition, then lowest uid, so every reader picks the same one. */
export const bestSpare = (
  slot: ServiceSlot,
  type: string,
  reach: ReachSnapshot,
  free: (item: Item) => boolean,
): Item | undefined =>
  reach.entries
    .map(({ item }) => item)
    .filter((item) => item.type === type && !item.work && slotAccepts(slot, item) && free(item))
    .sort((a, b) => b.condition - a.condition || a.uid - b.uid)[0];

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
