// Craft intents revalidate live ownership; views never execute a previously displayed plan.
import type { CraftCharacter } from './character.ts';
import { type CraftPreference, type CraftResult, planCraft } from './crafting.ts';
import { planDisassembly } from './disassembly.ts';
import type { HandlingQueue } from './handling.ts';
import type { Inventory, Plan } from './inventory.ts';
import type { Item } from './items.ts';
import type { ReachSnapshot } from './reach.ts';
import type { Simulation } from './sim.ts';

export type WorkOperation = 'continue' | 'apart' | 'disassemble';
export interface WorkOption {
  operation: WorkOperation;
  label: string;
  plan: Plan;
  /** Game seconds for a long action; ordinary plan time remains handling seconds. */
  duration?: number;
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
    if (this.sim.actions.rest) {
      return undefined;
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
    const recipe = this.inventory.registry.recipes.get(recipeId)!;
    if (recipe.kind !== 'repair') {
      return this.sim.actions.beginCraft(result.plan);
    }
    const target = this.repairTarget(recipe.result.item);
    if (!target) {
      return 'No damaged repair target in reach';
    }
    const repair = recipe.repair!;
    const skill = this.character.skills[repair.skill] ?? 0;
    const amount = Math.min(1, repair.amount + repair.perSkill * skill);
    return this.sim.actions.beginCraft(result.plan, { targetUid: target.uid, amount });
  }
  private repairTarget(type: string): Item | undefined {
    return this.reach()
      .entries.map(({ item }) => item)
      .filter((item) => item.type === type && item.count === 1 && item.condition < 1)
      .sort((a, b) => a.condition - b.condition || a.uid - b.uid)[0];
  }
  private reachable(uid: number): string | undefined {
    const item = this.inventory.itemByUid(uid);
    if (!item?.work) {
      return 'The work item is missing';
    }
    return this.reach().entries.some((entry) => entry.item === item) ? undefined : 'The work item is out of reach';
  }
  private disassemblyOption(item: Item): WorkOption[] {
    const definition = this.inventory.registry.items.get(item.type)!;
    if (!(definition.disassembly || definition.salvage)) {
      return [];
    }
    const snapshot = this.reach();
    const reachable = snapshot.entries.some((entry) => entry.item === item);
    const reason = reachable ? this.startReason() : 'The item is out of reach';
    const plan = planDisassembly(item, snapshot, this.character);
    let result: Plan;
    if (reason) {
      result = { ok: false, reason };
    } else if (plan) {
      result = { ok: true, time: 0 };
    } else {
      result = { ok: false, reason: 'The item cannot be taken apart' };
    }
    return [
      {
        operation: 'disassemble',
        label: 'Take apart',
        ...(!reason && plan ? { duration: plan.duration } : {}),
        plan: result,
      },
    ];
  }
  private existingWorkOptions(uid: number, item: Item): WorkOption[] {
    const { work } = item;
    if (!work) {
      return [];
    }
    const { job } = this.sim.actions;
    const reason =
      this.reachable(uid) ??
      (this.queue.busy ? 'Finish handling first' : undefined) ??
      (job?.jobType === 'craft' && !job.stopped && job.workUid !== uid ? 'Another craft is active' : undefined) ??
      (job?.jobType === 'craft' && !job.stopped ? 'Already working' : undefined) ??
      this.sim.actions.craft?.validate(uid);
    const name =
      work.kind === 'craft'
        ? this.inventory.registry.items
            .get(this.inventory.registry.recipes.get(work.recipe)!.result.item)!
            .name.toLowerCase()
        : this.inventory.registry.items.get(work.source)!.name.toLowerCase();
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
  options(uid: number): WorkOption[] {
    const item = this.inventory.itemByUid(uid);
    if (!item) {
      return [];
    }
    return item.work ? this.existingWorkOptions(uid, item) : this.disassemblyOption(item);
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
    if (operation === 'apart') {
      return this.sim.actions.cancelCraft(uid);
    }
    const item = this.inventory.itemByUid(uid);
    const reason = item ? this.startReason() : 'The item is missing';
    if (reason) {
      return reason;
    }
    const plan = item && planDisassembly(item, this.reach(), this.character);
    return plan ? this.sim.actions.beginCraft(plan) : 'The item cannot be taken apart';
  }
}
