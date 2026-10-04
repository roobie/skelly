// Item-owned chamber/cycle facts. Existing simulation/handling schedulers advance them;
// presentation only observes ejection and the current cycle. No timers or second job queue.
import type { ModelDef, Registry } from '../core/content.ts';
import type { Vec3 } from '../core/coords.ts';
import { actionCycleSeconds, ejectSeconds } from '../core/firearmAction.ts';
import type { FirearmState, PendingCase } from '../core/firearmState.ts';
import type { HandlingQueue } from '../core/handling.ts';
import { heldEjectionPose } from '../core/heldPose.ts';
import type { Inventory } from '../core/inventory.ts';
import { defOf, type Item } from '../core/items.ts';
import type { UseOption } from '../core/options.ts';
import { Rng } from '../core/random.ts';
import { pilesInRadius } from '../core/reach.ts';

/** Gameplay estimates for transient ballistics, not claimed as measured export data. */
const CASE_SPEED = 3.5;
const CASE_FLIGHT_SECONDS = 0.48;
const COCK_ACTION = 'firearm.cock';

type Action = NonNullable<ModelDef['action']>;
export interface FirearmHandlingData {
  readonly model: ModelDef;
  readonly action: Action;
  readonly calibre: string;
  readonly caseModelId?: string;
  readonly rpm: number | undefined;
}

const firearmModelFor = (item: Item, registry: Registry): ModelDef | undefined => {
  const id = defOf(registry, item.type).model;
  return id === undefined ? undefined : registry.models.get(id);
};

const exportedActionReason = (item: Item, registry: Registry, mode: 'fire' | 'hand'): string | undefined => {
  const model = firearmModelFor(item, registry);
  if (!(model?.calibre && model.action?.hand && model.grip && model.anchors?.ejection)) {
    return 'No exported action data for this gun';
  }
  return mode === 'fire' && !(model.action.fire && model.action.rpm)
    ? 'No exported automatic action data for this gun'
    : undefined;
};

export const firearmHandlingFor = (item: Item, registry: Registry): FirearmHandlingData => {
  const reason = exportedActionReason(item, registry, 'hand');
  if (reason) {
    throw new Error(reason);
  }
  const model = firearmModelFor(item, registry)!;
  const action = model.action!;
  const [caseModelId] = [...registry.models.values()]
    .filter((candidate) => candidate.calibre === model.calibre && candidate.id.startsWith('case_'))
    .map((candidate) => candidate.id)
    .sort();
  return {
    model,
    action,
    calibre: model.calibre!,
    rpm: action.rpm,
    ...(caseModelId ? { caseModelId } : {}),
  };
};

const calibreSlug = (calibre: string): string =>
  [...calibre]
    .map((character) => {
      switch (character) {
        case '.':
          return '_d_';
        case '-':
          return '_h_';
        case '_':
          return '_u_';
        default:
          return character;
      }
    })
    .join('');
export const spentCaseItemId = (calibre: string): string => `spent_case_${calibreSlug(calibre)}`;

export interface FirearmShotEffect {
  readonly origin: Vec3;
  readonly direction: Vec3;
  readonly speed: number;
  readonly seed: number;
  readonly caseModelId?: string;
}

export interface FirearmPoseInput {
  /** Feet and eye in simulation blocks. */
  readonly feet: Vec3;
  readonly eye: Vec3;
  readonly yaw: number;
  readonly pitch: number;
  readonly blockSize: number;
}
export interface DebugFirearmShotInput extends FirearmPoseInput {
  readonly debugMode: boolean;
  readonly item: Item;
  readonly seed: number;
  readonly simTime: number;
}
export interface FirearmCycleFrame {
  readonly uid: number;
  readonly mode: 'fire' | 'hand';
  readonly elapsed: number;
}

export class FirearmMechanics {
  /** Numeric ownership references only. Chamber/cycle data lives on the inventory item. */
  private readonly active = new Set<number>();
  private readonly inventory: Inventory;
  private readonly queue: HandlingQueue;
  private readonly blockSize: number;
  private readonly pose: (uid: number) => FirearmPoseInput | undefined;
  private readonly onEjection: (effect: FirearmShotEffect) => void;

  constructor(
    inventory: Inventory,
    queue: HandlingQueue,
    {
      blockSize,
      pose,
      onEjection,
    }: {
      blockSize: number;
      pose: (uid: number) => FirearmPoseInput | undefined;
      onEjection: (effect: FirearmShotEffect) => void;
    },
  ) {
    this.inventory = inventory;
    this.queue = queue;
    this.blockSize = blockSize;
    this.pose = pose;
    this.onEjection = onEjection;
    for (const item of inventory.items()) {
      if (item.firearm?.cycle) {
        this.active.add(item.uid);
      }
    }
    queue.registerAction(COCK_ACTION, (params): string | undefined => {
      const item = typeof params.uid === 'number' ? inventory.itemByUid(params.uid) : undefined;
      if (!(item && this.held(item.uid)) || item.firearm?.cycle?.mode !== 'hand') {
        return 'Firearm is no longer held';
      }
      this.advanceCycle(item, actionCycleSeconds(firearmHandlingFor(item, inventory.registry).action, 'hand'));
      return undefined;
    });
  }

  private held(uid: number): boolean {
    return this.inventory.hands.right?.uid === uid || this.inventory.hands.left?.uid === uid;
  }
  /** Firing is handling too; an automatic cycle cannot be cancelled by clearing manual jobs. */
  get busy(): boolean {
    return Object.values(this.inventory.hands).some((item) => item?.firearm?.cycle !== undefined);
  }

  /** Read-only admission; neither model admission nor inspection requires mechanics. */
  fireReason(uid: number): string | undefined {
    const item = this.inventory.itemByUid(uid);
    if (!item) {
      return 'Firearm is no longer carried';
    }
    const reason = exportedActionReason(item, this.inventory.registry, 'fire');
    if (reason) {
      return reason;
    }
    // Automatic motion will feed before the next cadence deadline. fire() rejects overlapping cycles;
    // only an idle empty chamber is a persistent refusal that should stop that cadence.
    if (!item.firearm || item.firearm.cycle || item.firearm.chamber === 'round') {
      return;
    }
    return item.firearm.chamber === 'empty' ? 'Chamber is empty' : 'Chamber contains a spent case';
  }

  fire(input: DebugFirearmShotInput): boolean {
    if (!(input.debugMode && this.held(input.item.uid)) || this.queue.busy) {
      return false;
    }
    // Advancing to the exact deadline also handles a coarse input sample containing several shots.
    this.advanceTo(input.simTime);
    const item = this.inventory.itemByUid(input.item.uid)!;
    if (!defOf(this.inventory.registry, item.type).firearm || item.firearm?.cycle) {
      return false;
    }
    if (this.fireReason(item.uid)) {
      return false;
    }
    const data = firearmHandlingFor(item, this.inventory.registry);
    const emission = this.emission(item, data, input);
    const shotKey = `${item.uid}:${input.simTime}:${input.feet.join(',')}`;
    const seed = Math.floor(Rng.stream(input.seed, `firearm-case:${shotKey}`).next() * 4_294_967_296) >>> 0;
    item.firearm = {
      chamber: 'case',
      pendingCase: { ...emission, seed },
      cycle: { mode: 'fire', startedAt: input.simTime, elapsed: 0, ejected: false, feedRound: true },
    };
    this.active.add(item.uid);
    return true;
  }

  /** Read-only admission policy, also used by the inventory's Use affordance. */
  cockReason(uid: number): string | undefined {
    const item = this.inventory.itemByUid(uid);
    if (!(item && this.held(uid))) {
      return 'Hold the firearm before cocking it';
    }
    return this.queue.busy || item.firearm?.cycle
      ? 'Already handling something'
      : exportedActionReason(item, this.inventory.registry, 'hand');
  }

  useOption(item: Item): UseOption {
    const reason = this.cockReason(item.uid);
    return {
      kind: 'use',
      label: `Cock ${this.inventory.name(item)}`,
      plan: reason
        ? { ok: false, reason }
        : { ok: true, time: actionCycleSeconds(firearmHandlingFor(item, this.inventory.registry).action, 'hand') },
    };
  }

  cock(uid: number, time: number): string | undefined {
    const reason = this.cockReason(uid);
    if (reason) {
      return reason;
    }
    const item = this.inventory.itemByUid(uid)!;
    const data = firearmHandlingFor(item, this.inventory.registry);
    const state: FirearmState = item.firearm ?? { chamber: 'round' };
    state.cycle = { mode: 'hand', startedAt: time, elapsed: 0, ejected: false, feedRound: true };
    item.firearm = state;
    this.active.add(uid);
    this.queue.enqueueAction(
      COCK_ACTION,
      `Cock ${defOf(this.inventory.registry, item.type).name}`,
      data.action.hand.durationSeconds,
      { uid },
    );
    return undefined;
  }

  advanceTo(time: number): void {
    for (const uid of this.active) {
      const item = this.inventory.itemByUid(uid);
      const cycle = item?.firearm?.cycle;
      if (!(item && cycle)) {
        this.active.delete(uid);
        continue;
      }
      if (cycle.mode === 'hand') {
        const job = this.queue.jobs.find(
          (entry) => entry.kind === 'action' && entry.jobType === COCK_ACTION && entry.params.uid === uid,
        );
        if (!(job && this.held(uid))) {
          // Cancelling a hand action leaves its chamber (including an unejected case) intact.
          item.firearm!.cycle = undefined;
          this.active.delete(uid);
          continue;
        }
        this.advanceCycle(item, job.elapsed);
      } else {
        this.advanceCycle(item, Math.max(cycle.elapsed, time - cycle.startedAt));
      }
    }
  }

  frames(): readonly FirearmCycleFrame[] {
    return [...new Set(Object.values(this.inventory.hands).flatMap((item) => (item ? [item.uid] : [])))].flatMap(
      (uid) => {
        const cycle = this.inventory.itemByUid(uid)?.firearm?.cycle;
        return cycle ? [{ uid, mode: cycle.mode, elapsed: cycle.elapsed }] : [];
      },
    );
  }

  private advanceCycle(item: Item, elapsed: number): void {
    const state = item.firearm!;
    const { cycle } = state;
    if (!cycle) {
      return;
    }
    const data = firearmHandlingFor(item, this.inventory.registry);
    cycle.elapsed = Math.max(cycle.elapsed, elapsed);
    if (!cycle.ejected && cycle.elapsed + 1e-9 >= ejectSeconds(data.action, cycle.mode)) {
      if (state.chamber === 'case') {
        this.ejectCase(item, state, data);
      } else if (state.chamber === 'round' && state.roundType !== undefined) {
        // Real loaded-round ejection is supplied by the ammunition feature, not silently discarded.
        throw new Error('Live cartridge ejection requires ammunition handling');
      } else {
        state.chamber = 'empty';
      }
      cycle.ejected = true;
    }
    if (cycle.elapsed + 1e-9 >= actionCycleSeconds(data.action, cycle.mode)) {
      if (cycle.feedRound) {
        state.chamber = 'round';
      }
      state.cycle = undefined;
      this.active.delete(item.uid);
    }
  }

  private emission(item: Item, data: FirearmHandlingData, pose: FirearmPoseInput): Omit<PendingCase, 'seed'> {
    let hold: 'both' | 'right' | 'left' = this.inventory.hands.right?.uid === item.uid ? 'right' : 'left';
    if (defOf(this.inventory.registry, item.type).twoHanded) {
      hold = 'both';
    }
    const eye: Vec3 = pose.eye.map((value) => value * pose.blockSize) as Vec3;
    return {
      ...heldEjectionPose({ model: data.model, hold, eye, yaw: pose.yaw, pitch: pose.pitch }),
      feet: [...pose.feet],
    };
  }

  private ejectCase(item: Item, state: FirearmState, data: FirearmHandlingData): void {
    const pending = state.pendingCase;
    if (!pending) {
      throw new Error('Fired chamber lost its pending case');
    }
    const pose = this.pose(item.uid);
    const emission = pose ? this.emission(item, data, pose) : pending;
    const { blockSize } = this;
    const distance = CASE_SPEED * CASE_FLIGHT_SECONDS;
    const landing: Vec3 = [
      Math.floor((emission.origin[0] + emission.direction[0] * distance) / blockSize),
      emission.feet[1],
      Math.floor((emission.origin[2] + emission.direction[2] * distance) / blockSize),
    ];
    const type = spentCaseItemId(data.calibre);
    const nearby = pilesInRadius(this.inventory, emission.feet, 20 / blockSize).find((pile) =>
      pile.items.some(({ item: existing }) => existing.type === type),
    );
    const pos = nearby?.pos ?? landing;
    if (!this.inventory.add(this.inventory.create(type), { kind: 'pile', pos })) {
      throw new Error(`Could not add ${type} to pile ${pos.join(',')}`);
    }
    state.chamber = 'empty';
    state.pendingCase = undefined;
    // Commit the transition before output: a drawing failure must never double its case.
    state.cycle!.ejected = true;
    this.onEjection({
      origin: emission.origin,
      direction: emission.direction,
      speed: CASE_SPEED,
      seed: pending.seed,
      ...(data.caseModelId ? { caseModelId: data.caseModelId } : {}),
    });
  }
}
