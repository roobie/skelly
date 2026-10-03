// Craft intents revalidate live ownership; views never execute a previously displayed plan.
import type { CraftCharacter } from './character.ts';
import { type CraftPreference, type CraftResult, planCraft } from './crafting.ts';
import type { HandlingQueue } from './handling.ts';
import type { Inventory, Plan } from './inventory.ts';
import type { ReachSnapshot } from './reach.ts';
import type { Simulation } from './sim.ts';

export type WorkOperation = 'continue' | 'apart';
export interface WorkOption {
  operation: WorkOperation;
  label: string;
  plan: Plan;
}

export class CraftCommands {
  private readonly inventory: Inventory;
  private readonly character: CraftCharacter;
  private readonly sim: Simulation;
  private readonly queue: HandlingQueue;
  private readonly reach: () => ReachSnapshot;
  constructor({
    inventory,
    character,
    sim,
    queue,
    reach,
  }: {
    inventory: Inventory;
    character: CraftCharacter;
    sim: Simulation;
    queue: HandlingQueue;
    reach: () => ReachSnapshot;
  }) {
    this.inventory = inventory;
    this.character = character;
    this.sim = sim;
    this.queue = queue;
    this.reach = reach;
  }
  get currentUid(): number | undefined {
    const { job } = this.sim.actions;
    if (job?.jobType === 'craft') {
      return job.workUid;
    }
    const { right } = this.inventory.hands;
    return right?.work ? right.uid : undefined;
  }
  startReason(): string | undefined {
    if (this.inventory.hands.right || this.inventory.hands.left) {
      return 'Hands full — empty both hands';
    }
    if (this.queue.busy) {
      return 'Finish handling first';
    }
    if (this.sim.actions.job?.jobType === 'craft') {
      return 'Finish or take apart the other craft';
    }
    return undefined;
  }
  preview(recipeId: string, prefer?: CraftPreference): CraftResult | undefined {
    const recipe = this.inventory.registry.recipes.get(recipeId);
    return recipe && planCraft(recipe, this.reach(), this.character, prefer);
  }
  start(recipeId: string, prefer?: CraftPreference): string | undefined {
    const reason = this.startReason();
    if (reason) {
      return reason;
    }
    const result = this.preview(recipeId, prefer);
    if (!result) {
      return 'Unknown recipe';
    }
    if ('missing' in result) {
      return result.missing.reason;
    }
    const item = this.inventory.beginWork(result.plan);
    if (!item) {
      return 'The materials or hands changed';
    }
    return this.sim.actions.startCraft(item.uid);
  }
  private reachable(uid: number): string | undefined {
    const item = this.inventory.itemByUid(uid);
    if (!item?.work) {
      return 'The work item is missing';
    }
    return this.reach().entries.some((entry) => entry.item === item) ? undefined : 'The work item is out of reach';
  }
  options(uid: number): WorkOption[] {
    const item = this.inventory.itemByUid(uid);
    if (!item?.work) {
      return [];
    }
    const { job } = this.sim.actions;
    const reason =
      this.reachable(uid) ??
      (this.queue.busy ? 'Finish handling first' : undefined) ??
      (job?.jobType === 'craft' && job.workUid !== uid ? 'Another craft is active' : undefined) ??
      (job?.jobType === 'craft' && !job.stopped ? 'Already working' : undefined) ??
      this.sim.actions.craft?.validate(uid);
    const recipe = this.inventory.registry.recipes.get(item.work.recipe)!;
    const name = this.inventory.registry.items.get(recipe.result.item)!.name.toLowerCase();
    const apart = this.reachable(uid);
    return [
      {
        operation: 'continue',
        label: `Continue: ${name}`,
        plan: reason ? { ok: false, reason } : { ok: true, time: 0 },
      },
      { operation: 'apart', label: 'Take apart', plan: apart ? { ok: false, reason: apart } : { ok: true, time: 0 } },
    ];
  }
  act(uid: number, operation: WorkOperation): string | undefined {
    const option = this.options(uid).find((candidate) => candidate.operation === operation);
    if (!option) {
      return 'The work item is missing';
    }
    if (!option.plan.ok) {
      return option.plan.reason;
    }
    if (operation === 'continue') {
      return this.sim.actions.startCraft(uid);
    }
    const { job } = this.sim.actions;
    if (job?.jobType === 'craft' && job.workUid === uid) {
      this.sim.actions.cancel();
      return this.inventory.itemByUid(uid)?.work ? this.sim.compression.interruption : undefined;
    }
    // A stopped item can exist without an active descriptor. Inventory is still its sole owner.
    try {
      this.inventory.releaseWork(this.inventory.itemByUid(uid)!, false, this.reach().feet);
    } catch (error) {
      return error instanceof Error ? error.message : 'Cannot return the inputs';
    }
    return undefined;
  }
}
