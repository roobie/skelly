// Craft intents revalidate live ownership; views never execute a previously displayed plan.
import { type CraftCharacter, dominantSide, SKILL_LEVEL_MIN, skillEffectLevel } from './character.ts';
import { coreLabel, coreMessage } from './coreText.ts';
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
    if (job?.jobType === 'craft' && !job.stopped) {
      return job.workUid;
    }
    if (this.sim.actions.rest) {
      return undefined;
    }
    // A held work item is the one a continue means, even when another item's stopped job is the last one.
    const held = this.inventory.hands[dominantSide(this.inventory.character)];
    if (held?.work) {
      return held.uid;
    }
    return job?.jobType === 'craft' ? job.workUid : undefined;
  }
  startReason(): string | undefined {
    if (this.inventory.hands.right || this.inventory.hands.left) {
      return coreMessage(this.inventory.registry, 'handsFull');
    }
    if (this.queue.busy) {
      return coreMessage(this.inventory.registry, 'handsBusy');
    }
    return undefined;
  }
  preview(recipeId: string, prefer?: CraftPreference): CraftResult | undefined {
    const recipe = this.inventory.registry.recipes.get(recipeId);
    return recipe && !recipe.activation ? planCraft(recipe, this.reach(), this.character, prefer) : undefined;
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
    if (recipe.repair?.entity !== undefined) {
      return coreMessage(this.inventory.registry, 'noRepairTarget');
    }
    const target = this.repairTarget(recipe.result.item);
    if (!target) {
      return coreMessage(this.inventory.registry, 'noRepairTarget');
    }
    const repair = recipe.repair!;
    const skill = skillEffectLevel(this.character.skills[repair.skill] ?? SKILL_LEVEL_MIN);
    const amount = Math.min(1, repair.amount + repair.perSkill * skill);
    return this.sim.actions.beginCraft(result.plan, { target: { kind: 'item', uid: target.uid }, amount });
  }
  repairEntity(recipeId: string, entityUid: number, prefer?: CraftPreference): string | undefined {
    const reason = this.startReason();
    if (reason) {
      return reason;
    }
    const recipe = this.inventory.registry.recipes.get(recipeId);
    const entity = this.inventory.entities.byUid(entityUid);
    if (recipe?.kind !== 'repair' || !recipe.repair?.entity || !entity || entity.type !== recipe.repair.entity) {
      return coreMessage(this.inventory.registry, 'noRepairTarget');
    }
    const result = this.preview(recipeId, prefer);
    if (!result || 'missing' in result) {
      return result && 'missing' in result
        ? result.missing.reason
        : coreMessage(this.inventory.registry, 'noRepairTarget');
    }
    const skill = skillEffectLevel(this.character.skills[recipe.repair.skill] ?? SKILL_LEVEL_MIN);
    const amount = recipe.repair.amount + recipe.repair.perSkill * skill;
    return this.sim.actions.beginCraft(result.plan, { target: { kind: 'entity', uid: entityUid }, amount });
  }
  private repairTarget(type: string): Item | undefined {
    return this.reach()
      .entries.map(({ item }) => item)
      .filter((item) => item.type === type && item.count === 1 && item.condition < 1)
      .sort((a, b) => a.condition - b.condition || a.uid - b.uid)[0];
  }
  private reachable(uid: number): string | undefined {
    const item = this.inventory.itemByUid(uid);
    const { registry } = this.inventory;
    if (!item?.work) {
      return coreMessage(registry, 'gone');
    }
    return this.reach().entries.some((entry) => entry.item === item) ? undefined : coreMessage(registry, 'outOfReach');
  }
  private disassemblyOption(item: Item): WorkOption[] {
    const { registry } = this.inventory;
    const definition = registry.items.get(item.type)!;
    if (!(definition.disassembly || definition.salvage)) {
      return [];
    }
    const snapshot = this.reach();
    const reachable = snapshot.entries.some((entry) => entry.item === item);
    const reason = reachable ? this.startReason() : coreMessage(registry, 'outOfReach');
    const plan = planDisassembly(item, snapshot, this.character);
    let result: Plan;
    if (reason) {
      result = { ok: false, reason };
    } else if (plan) {
      result = { ok: true, time: 0 };
    } else {
      result = { ok: false, reason: coreMessage(registry, 'cantTakeApart') };
    }
    return [
      {
        operation: 'disassemble',
        label: coreLabel(registry, 'takeApart'),
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
    const { registry } = this.inventory;
    const { job } = this.sim.actions;
    const crafting = job?.jobType === 'craft' && !job.stopped;
    const reason =
      this.reachable(uid) ??
      (this.queue.busy ? coreMessage(registry, 'handsBusy') : undefined) ??
      (crafting && job.workUid !== uid ? coreMessage(registry, 'otherCraft') : undefined) ??
      (crafting ? coreMessage(registry, 'alreadyWorking') : undefined) ??
      this.sim.actions.craft?.validate(uid);
    const name =
      work.kind === 'craft'
        ? registry.items.get(registry.recipes.get(work.recipe)!.result.item)!.name.toLowerCase()
        : registry.items.get(work.source)!.name.toLowerCase();
    const apart = this.reachable(uid);
    return [
      {
        operation: 'continue',
        label: coreLabel(registry, 'continueWork', { item: name }),
        plan: reason ? { ok: false, reason } : { ok: true, time: 0 },
      },
      {
        operation: 'apart',
        label: coreLabel(registry, 'takeApart'),
        plan: apart ? { ok: false, reason: apart } : { ok: true, time: 0 },
      },
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
      return coreMessage(this.inventory.registry, 'gone');
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
    const reason = item ? this.startReason() : coreMessage(this.inventory.registry, 'gone');
    if (reason) {
      return reason;
    }
    const plan = item && planDisassembly(item, this.reach(), this.character);
    return plan ? this.sim.actions.beginCraft(plan) : coreMessage(this.inventory.registry, 'cantTakeApart');
  }
}
