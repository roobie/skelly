// Craft intents revalidate live ownership; views never execute a previously displayed plan.
import { type CraftCharacter, dominantSide, SKILL_LEVEL_MIN, skillEffectLevel } from './character.ts';
import { coreLabel, coreMessage } from './coreText.ts';
import { type CraftPreference, type CraftResult, type CraftSources, planCraft, requirementStatus } from './crafting.ts';
import { entityRepairRefusal } from './craftWork.ts';
import { planDisassembly, type RecoveryOperation } from './disassembly.ts';
import type { HandlingQueue } from './handling.ts';
import type { Inventory, Plan } from './inventory.ts';
import { damageWord, type Item } from './items.ts';
import type { LiquidAmount, LiquidRecoveryChoices } from './liquids.ts';
import type { ReachSnapshot } from './reach.ts';
import type { Simulation } from './sim.ts';

export type RecoveryChoices = LiquidRecoveryChoices & { recoveryOperation?: RecoveryOperation };

export interface RecoveryProjection {
  liquids: (LiquidAmount & { name: string })[];
  choices: LiquidRecoveryChoices;
  vessels: { liquid: string; uid: number; name: string }[];
  spills: LiquidAmount[];
  refusal?: string;
}

const disassemblyChoices = ({ receivers = [], spillApproval = [], recoveryOperation }: RecoveryChoices) => ({
  receivers,
  spillApproval,
  ...(recoveryOperation ? { operation: recoveryOperation } : {}),
});

export type WorkOperation = 'continue' | 'apart' | 'disassemble';
export interface WorkOption {
  operation: WorkOperation;
  label: string;
  plan: Plan;
  /** Game seconds for a long action; ordinary plan time remains handling seconds. */
  duration?: number;
}

export interface EntityRepairProjection {
  targetUid: number;
  targetName: string | undefined;
  damage: string | undefined;
  requirements: ReturnType<typeof requirementStatus> | undefined;
  refusal: string | undefined;
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
  preview(recipeId: string, prefer?: CraftPreference, sources?: CraftSources): CraftResult | undefined {
    const recipe = this.inventory.registry.recipes.get(recipeId);
    return recipe && !recipe.activation
      ? planCraft(recipe, this.reach(), this.character, { prefer, sources })
      : undefined;
  }
  start(recipeId: string, prefer?: CraftPreference, sources?: CraftSources): string | undefined {
    const reason = this.startReason();
    if (reason) {
      return reason;
    }
    const result = this.preview(recipeId, prefer, sources);
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
  previewEntityRepair(
    recipeId: string,
    entityUid: number,
    prefer?: CraftPreference,
    sources?: CraftSources,
  ): EntityRepairProjection {
    const { registry, entities } = this.inventory;
    const entity = entities.byUid(entityUid);
    const recipe = registry.recipes.get(recipeId);
    const repair = recipe?.kind === 'repair' ? recipe.repair : undefined;
    const snapshot = this.reach();
    const result = repair?.entity ? planCraft(recipe!, snapshot, this.character, { prefer, sources }) : undefined;
    const skill = repair ? skillEffectLevel(this.character.skills[repair.skill] ?? SKILL_LEVEL_MIN) : 0;
    const targetRefusal = repair?.entity
      ? entityRepairRefusal(this.inventory, entityUid, repair.entity, repair.amount + repair.perSkill * skill)
      : coreMessage(registry, 'noRepairTarget');
    return {
      targetUid: entityUid,
      targetName: entity ? registry.furniture.get(entity.type)!.name : undefined,
      damage: entity ? damageWord(registry, entities.conditionOf(entity)) : undefined,
      requirements: repair?.entity ? requirementStatus(recipe!, snapshot, this.character) : undefined,
      refusal:
        this.startReason() ?? targetRefusal ?? (result && 'missing' in result ? result.missing.reason : undefined),
    };
  }
  repairEntity(
    recipeId: string,
    entityUid: number,
    prefer?: CraftPreference,
    sources?: CraftSources,
  ): string | undefined {
    const reason = this.previewEntityRepair(recipeId, entityUid, prefer, sources).refusal;
    if (reason) {
      return reason;
    }
    const recipe = this.inventory.registry.recipes.get(recipeId);
    const entity = this.inventory.entities.byUid(entityUid);
    if (recipe?.kind !== 'repair' || !recipe.repair?.entity || !entity || entity.type !== recipe.repair.entity) {
      return coreMessage(this.inventory.registry, 'noRepairTarget');
    }
    const result = this.preview(recipeId, prefer, sources);
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
  private disassemblyOption(item: Item, choices: RecoveryChoices): WorkOption[] {
    const { registry } = this.inventory;
    const definition = registry.items.get(item.type)!;
    if (!(definition.disassembly || definition.salvage)) {
      return [];
    }
    const snapshot = this.reach();
    const reachable = snapshot.entries.some((entry) => entry.item === item);
    const reason = reachable ? this.startReason() : coreMessage(registry, 'outOfReach');
    const plan = planDisassembly(item, snapshot, this.character, disassemblyChoices(choices));
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
        ? (registry.recipes.get(work.recipe)!.repair?.entity
            ? registry.furniture.get(registry.recipes.get(work.recipe)!.repair!.entity!)!.name
            : registry.items.get(registry.recipes.get(work.recipe)!.result.item)!.name
          ).toLowerCase()
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
  recovery(uid: number, choices: RecoveryChoices = {}): RecoveryProjection | undefined {
    const item = this.inventory.itemByUid(uid);
    if (!item || item.work?.kind === 'craft') {
      return undefined;
    }
    const work = item.work?.kind === 'disassembly' ? item.work : undefined;
    const snapshot = this.reach();
    const plan = work ?? planDisassembly(item, snapshot, this.character, disassemblyChoices(choices));
    if (!plan || plan.liquids.length === 0) {
      return undefined;
    }
    const selected: LiquidRecoveryChoices = {
      receivers: choices.receivers ?? work?.receivers ?? [],
      spillApproval: choices.spillApproval ?? work?.spillApproval ?? [],
    };
    const receipt = this.inventory.planLiquidReceipts(plan.liquids, selected);
    const refusal = this.inventory.liquidReceiptRefusal(receipt);
    return {
      liquids: plan.liquids.map((liquid) => ({
        ...liquid,
        name: this.inventory.registry.liquids.get(liquid.liquid)!.name,
      })),
      choices: selected,
      vessels: plan.liquids.flatMap((amount) =>
        snapshot.entries.flatMap(({ item: vessel }) => {
          if (vessel.uid === item.uid) {
            return [];
          }
          const receive = this.inventory.planLiquidReceipts([amount], {
            receivers: [{ liquid: amount.liquid, uid: vessel.uid }],
            spillApproval: [amount],
          });
          return receive.ok ? [{ liquid: amount.liquid, uid: vessel.uid, name: this.inventory.name(vessel) }] : [];
        }),
      ),
      spills: 'spills' in receipt ? receipt.spills : [],
      ...(refusal ? { refusal } : {}),
    };
  }

  options(uid: number, choices: RecoveryChoices = {}): WorkOption[] {
    const item = this.inventory.itemByUid(uid);
    if (!item) {
      return [];
    }
    return item.work ? this.existingWorkOptions(uid, item) : this.disassemblyOption(item, choices);
  }
  act(uid: number, operation: WorkOperation, choices: RecoveryChoices = {}): string | undefined {
    const option = this.options(uid, choices).find((candidate) => candidate.operation === operation);
    if (!option) {
      return coreMessage(this.inventory.registry, 'gone');
    }
    if (!option.plan.ok) {
      return option.plan.reason;
    }
    if (operation === 'continue') {
      const work = this.inventory.itemByUid(uid)?.work;
      if (work?.kind === 'disassembly') {
        const reason = this.inventory.updateRecovery(uid, choices);
        if (reason) {
          return reason;
        }
      }
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
    const plan = item && planDisassembly(item, this.reach(), this.character, disassemblyChoices(choices));
    if (plan) {
      const refusal = this.inventory.liquidReceiptRefusal(this.inventory.planLiquidReceipts(plan.liquids, plan));
      return refusal ?? this.sim.actions.beginCraft(plan);
    }
    return coreMessage(this.inventory.registry, 'cantTakeApart');
  }
}
