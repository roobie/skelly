// Craft intents revalidate live ownership; views never execute a previously displayed plan.
import { type CraftCharacter, dominantSide } from './character.ts';
import { blockId, repairTargetName } from './content.ts';
import type { Vec3 } from './coords.ts';
import { coreLabel, coreMessage } from './coreText.ts';
import { type CraftPreference, type CraftResult, type CraftSources, planCraft, requirementStatus } from './crafting.ts';
import { cellRepairRefusal, cellTakeApartRefusal, entityRepairRefusal } from './craftWork.ts';
import {
  type PieceDisassemblyPlan,
  planDisassembly,
  planPieceDisassembly,
  type RecoveryOperation,
} from './disassembly.ts';
import type { HandlingQueue } from './handling.ts';
import type { Inventory, Plan } from './inventory.ts';
import { type ConditionBand, conditionBand, type Item, repairCeiling } from './items.ts';
import type { LiquidAmount, LiquidRecoveryChoices } from './liquids.ts';
import type { ReachSnapshot } from './reach.ts';
import { recipeSkillLevel } from './recipeSkills.ts';
import { type CellDisassemblyPlan, type RubbleClearWork, rubbleClearWork } from './rubble.ts';
import type { Simulation } from './sim.ts';

export type RecoveryChoices = LiquidRecoveryChoices & { recoveryOperation?: RecoveryOperation };

export interface RecoveryProjection {
  liquids: (LiquidAmount & { name: string })[];
  choices: RecoveryChoices;
  vessels: { liquid: string; uid: number; name: string }[];
  spills: LiquidAmount[];
  spillLabel?: string;
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
  /** The piece's condition band now and after this repair (`conditionBand`). */
  condition: { now: ConditionBand; after: ConditionBand } | undefined;
  requirements: ReturnType<typeof requirementStatus> | undefined;
  refusal: string | undefined;
}

export interface CellRepairProjection {
  targetCell: Vec3;
  targetName: string | undefined;
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
    if (recipe.repair?.entity !== undefined || recipe.repair?.block !== undefined) {
      return coreMessage(this.inventory.registry, 'noRepairTarget');
    }
    const target = this.repairTarget(recipe.result.item, repairCeiling(this.inventory.registry, recipe));
    if (!target) {
      return coreMessage(this.inventory.registry, 'noRepairTarget');
    }
    const repair = recipe.repair!;
    const skill = recipeSkillLevel(this.inventory.registry, this.character, repair.skill);
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
    const skill = repair ? recipeSkillLevel(registry, this.character, repair.skill) : 0;
    const amount = repair ? repair.amount + repair.perSkill * skill : 0;
    const ceiling = repairCeiling(registry, recipe);
    const targetRefusal = repair?.entity
      ? entityRepairRefusal(this.inventory, { uid: entityUid, entityType: repair.entity, amount, ceiling })
      : coreMessage(registry, 'noRepairTarget');
    return {
      targetUid: entityUid,
      targetName: entity ? registry.furniture.get(entity.type)!.name : undefined,
      condition:
        entity && repair?.entity === entity.type
          ? {
              now: conditionBand(registry, entities.conditionOf(entity)),
              after: conditionBand(registry, entities.conditionAfterRepair(entity, amount, ceiling)),
            }
          : undefined,
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
    const skill = recipeSkillLevel(this.inventory.registry, this.character, recipe.repair.skill);
    const amount = recipe.repair.amount + recipe.repair.perSkill * skill;
    return this.sim.actions.beginCraft(result.plan, { target: { kind: 'entity', uid: entityUid }, amount });
  }
  previewCellRepair(
    recipeId: string,
    cell: Vec3,
    prefer?: CraftPreference,
    sources?: CraftSources,
  ): CellRepairProjection {
    const { registry } = this.inventory;
    const recipe = registry.recipes.get(recipeId);
    const repair = recipe?.kind === 'repair' ? recipe.repair : undefined;
    const snapshot = this.reach();
    const result = repair?.block ? planCraft(recipe!, snapshot, this.character, { prefer, sources }) : undefined;
    const skill = repair ? recipeSkillLevel(registry, this.character, repair.skill) : 0;
    const state = repair?.block ? this.inventory.cellRepair?.state(cell) : undefined;
    const targetRefusal = repair?.block
      ? cellRepairRefusal(this.inventory, {
          cell,
          epoch: state?.epoch ?? 0,
          block: repair.block,
          amount: repair.amount + repair.perSkill * skill,
          ceiling: repairCeiling(registry, recipe),
        })
      : coreMessage(registry, 'noRepairTarget');
    return {
      targetCell: [...cell],
      targetName: state ? registry.blocks[blockId(registry, state.block)]!.name : undefined,
      requirements: repair?.block ? requirementStatus(recipe!, snapshot, this.character) : undefined,
      refusal:
        this.startReason() ?? targetRefusal ?? (result && 'missing' in result ? result.missing.reason : undefined),
    };
  }
  repairCell(recipeId: string, cell: Vec3, prefer?: CraftPreference, sources?: CraftSources): string | undefined {
    const reason = this.previewCellRepair(recipeId, cell, prefer, sources).refusal;
    if (reason) {
      return reason;
    }
    const recipe = this.inventory.registry.recipes.get(recipeId);
    const repair = recipe?.kind === 'repair' ? recipe.repair : undefined;
    if (!repair?.block) {
      return coreMessage(this.inventory.registry, 'noRepairTarget');
    }
    const state = this.inventory.cellRepair?.state(cell);
    if (!state) {
      return coreMessage(this.inventory.registry, 'repairTargetGone');
    }
    const result = this.preview(recipeId, prefer, sources);
    if (!result || 'missing' in result) {
      return result && 'missing' in result
        ? result.missing.reason
        : coreMessage(this.inventory.registry, 'noRepairTarget');
    }
    const skill = recipeSkillLevel(this.inventory.registry, this.character, repair.skill);
    const amount = repair.amount + repair.perSkill * skill;
    return this.sim.actions.beginCraft(result.plan, {
      target: { kind: 'cell', cell: [...cell], epoch: state.epoch },
      amount,
    });
  }
  /** The yield taking a piece apart gives now, with why it can't start; the work's admission owns the piece checks. */
  previewTakeApartEntity(entityUid: number): {
    plan: PieceDisassemblyPlan | undefined;
    refusal: string | undefined;
  } {
    const { registry } = this.inventory;
    const entity = this.inventory.entities.byUid(entityUid);
    if (!entity) {
      return { plan: undefined, refusal: coreMessage(registry, 'gone') };
    }
    const plan = planPieceDisassembly(entity, this.reach(), this.character);
    if (!plan) {
      return { plan: undefined, refusal: coreMessage(registry, 'cantTakeApart') };
    }
    const { craft } = this.sim.actions;
    return { plan, refusal: this.startReason() ?? (craft ? craft.admit(plan) : 'Missing craft action owner') };
  }
  takeApartEntity(entityUid: number): string | undefined {
    const { plan, refusal } = this.previewTakeApartEntity(entityUid);
    if (refusal || !plan) {
      return refusal;
    }
    return this.sim.actions.beginCraft(plan);
  }
  /** What clearing a rubble cell would give now, with why it can't start; a job's start pins the cell's episode. */
  previewTakeApartCell(cell: Vec3): {
    work: (RubbleClearWork & { block: string }) | undefined;
    refusal: string | undefined;
  } {
    const { registry, rubble } = this.inventory;
    const block = rubble?.standing(cell);
    const work = block ? rubbleClearWork(registry, block) : undefined;
    if (!(block && work)) {
      return { work: undefined, refusal: coreMessage(registry, 'rubbleGone') };
    }
    const { craft } = this.sim.actions;
    return {
      work: { block, ...work },
      refusal:
        this.startReason() ??
        cellTakeApartRefusal(this.inventory, { cell }) ??
        (craft ? undefined : 'Missing craft action owner'),
    };
  }
  takeApartCell(cell: Vec3): string | undefined {
    const { work, refusal } = this.previewTakeApartCell(cell);
    if (refusal || !work) {
      return refusal;
    }
    const pinned = this.inventory.rubble?.pin(cell);
    if (!pinned || pinned.block !== work.block) {
      return coreMessage(this.inventory.registry, 'rubbleGone');
    }
    const plan: CellDisassemblyPlan = {
      kind: 'cellDisassembly',
      cell: [...cell],
      block: work.block,
      epoch: pinned.epoch,
      outputs: work.outputs.map((output) => ({ ...output })),
      timeGameMinutes: work.timeGameMinutes,
    };
    return this.sim.actions.beginCraft(plan);
  }
  private repairTarget(type: string, ceiling: number): Item | undefined {
    return this.reach()
      .entries.map(({ item }) => item)
      .filter((item) => item.type === type && item.count === 1 && item.condition < ceiling)
      .sort((a, b) => a.condition - b.condition || a.uid - b.uid)[0];
  }
  private reachable(uid: number): string | undefined {
    const item = this.inventory.itemByUid(uid);
    const { registry } = this.inventory;
    if (!item?.work) {
      return coreMessage(registry, 'gone');
    }
    const at = this.inventory.locate(item);
    const reachable =
      at?.kind === 'pieceWork'
        ? this.inventory.canReachEntity(at.entity)
        : this.reach().entries.some((entry) => entry.item === item);
    return reachable ? undefined : coreMessage(registry, 'outOfReach');
  }
  private workName(work: NonNullable<Item['work']>): string {
    const { registry } = this.inventory;
    switch (work.kind) {
      case 'craft': {
        const recipe = registry.recipes.get(work.recipe)!;
        return repairTargetName(registry, recipe);
      }
      case 'disassembly':
        return registry.items.get(work.source)!.name;
      case 'pieceDisassembly':
        return registry.furniture.get(work.furniture)!.name;
      case 'cellDisassembly':
        return registry.blocks[registry.blockIds.get(work.block)!]!.name;
      default:
        throw new Error('Unknown work kind');
    }
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
    const name = this.workName(work).toLowerCase();
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
    if (!item || (item.work && item.work.kind !== 'disassembly')) {
      return undefined;
    }
    const work = item.work?.kind === 'disassembly' ? item.work : undefined;
    const snapshot = this.reach();
    const plan = work ?? planDisassembly(item, snapshot, this.character, disassemblyChoices(choices));
    if (!plan || plan.liquids.length === 0) {
      return undefined;
    }
    const selected: RecoveryChoices = {
      receivers: choices.receivers ?? work?.receivers ?? [],
      spillApproval: [],
      ...(choices.recoveryOperation ? { recoveryOperation: choices.recoveryOperation } : {}),
    };
    const receipt = this.inventory.planLiquidReceipts(plan.liquids, selected);
    const spills = 'spills' in receipt ? receipt.spills.filter(({ volumeMicrolitres }) => volumeMicrolitres > 0) : [];
    const refusal = this.inventory.liquidReceiptRefusal(receipt);
    const needsApproval = !receipt.ok && receipt.reason === 'spill-approval';
    return {
      liquids: plan.liquids.map((liquid) => ({
        ...liquid,
        name: this.inventory.registry.liquids.get(liquid.liquid)!.name,
      })),
      choices: { ...selected, spillApproval: spills },
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
      spills,
      ...(needsApproval && refusal ? { spillLabel: refusal } : {}),
      ...(!needsApproval && refusal ? { refusal } : {}),
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
