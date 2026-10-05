// Item-owned chamber/cycle facts. Existing simulation/handling schedulers advance them;
// presentation only observes ejection and the current cycle. No timers or second job queue.
import type { ModelDef, Registry } from '../core/content.ts';
import type { Vec3 } from '../core/coords.ts';
import { actionCycleSeconds, ejectSeconds } from '../core/firearmAction.ts';
import type { FirearmCycleState, FirearmState, PendingCase } from '../core/firearmState.ts';
import type { HandlingQueue } from '../core/handling.ts';
import { heldEjectionPose } from '../core/heldPose.ts';
import type { Inventory } from '../core/inventory.ts';
import { defOf, type Item } from '../core/items.ts';
import { dropTarget, type UseOption } from '../core/options.ts';
import { type PelletShot, pelletShot } from '../core/pellets.ts';
import { Rng } from '../core/random.ts';
import { pilesInRadius } from '../core/reach.ts';
import type { SoundEventId } from '../core/soundEvents.ts';

/** Gameplay estimates for transient ballistics, not claimed as measured export data. */
const CASE_SPEED = 3.5;
const CASE_FLIGHT_SECONDS = 0.48;
const COCK_ACTION = 'firearm.cock';
const LOAD_ACTION = 'firearm.load';
/** Single-shell handling estimate, not an exported mechanical phase. */
export const SHELL_LOAD_SECONDS = 0.9;

type Action = NonNullable<ModelDef['action']>;
export interface FirearmHandlingData {
  readonly model: ModelDef;
  readonly action: Action;
  readonly calibre: string;
  readonly caseModelId?: string;
  readonly rpm: number | undefined;
}

export const firearmModelForType = (type: string, registry: Registry): ModelDef | undefined => {
  const id = defOf(registry, type).model;
  return id === undefined ? undefined : registry.models.get(id);
};

const firearmModelFor = (item: Item, registry: Registry): ModelDef | undefined =>
  firearmModelForType(item.type, registry);

/** The same calibre comparison used by firearm loading, shared with debug range stock discovery. */
export const ammoMatchesCalibre = (type: string, calibre: string, registry: Registry): boolean =>
  registry.items.get(type)?.ammo?.calibre === calibre;

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
  readonly mode: 'fire' | 'hand' | 'load';
  readonly elapsed: number;
  readonly duration?: number;
  readonly roundType?: string;
}

export class FirearmMechanics {
  /** Numeric ownership references only. Chamber/cycle data lives on the inventory item. */
  private readonly active = new Set<number>();
  private readonly inventory: Inventory;
  private readonly queue: HandlingQueue;
  private readonly blockSize: number;
  private readonly pose: (uid: number) => FirearmPoseInput | undefined;
  private readonly onEjection: (effect: FirearmShotEffect) => void;
  private readonly onShot: (shot: PelletShot, time: number) => void;
  private readonly onSound: (event: SoundEventId, position: Vec3 | undefined, time: number) => void;

  constructor(
    inventory: Inventory,
    queue: HandlingQueue,
    {
      blockSize,
      pose,
      onEjection,
      onShot = () => undefined,
      onSound = () => undefined,
    }: {
      blockSize: number;
      pose: (uid: number) => FirearmPoseInput | undefined;
      onEjection: (effect: FirearmShotEffect) => void;
      onShot?: (shot: PelletShot, time: number) => void;
      onSound?: (event: SoundEventId, position: Vec3 | undefined, time: number) => void;
    },
  ) {
    this.inventory = inventory;
    this.queue = queue;
    this.blockSize = blockSize;
    this.pose = pose;
    this.onEjection = onEjection;
    this.onShot = onShot;
    this.onSound = onSound;
    for (const { item } of inventory.items()) {
      if (item.firearm?.cycle || item.firearm?.landing) {
        this.active.add(item.uid);
      }
    }
    queue.registerAction(COCK_ACTION, (params): string | undefined => {
      const item = typeof params.uid === 'number' ? inventory.itemByUid(params.uid) : undefined;
      if (!(item && this.held(item.uid)) || item.firearm?.cycle?.mode !== 'hand') {
        return 'Firearm is no longer held';
      }
      return this.advanceCycle(item, actionCycleSeconds(firearmHandlingFor(item, inventory.registry).action, 'hand'));
    });
    queue.registerAction(LOAD_ACTION, (params): string | undefined => {
      const gun = typeof params.uid === 'number' ? inventory.itemByUid(params.uid) : undefined;
      const ammo = typeof params.ammoUid === 'number' ? inventory.itemByUid(params.ammoUid) : undefined;
      if (!(gun && ammo && this.held(gun.uid))) {
        return 'Shotgun or shell is no longer held/carried';
      }
      const reason = this.loadReason(ammo, true);
      if (reason) {
        return reason;
      }
      if (!inventory.consume(ammo, 1)) {
        return 'Shell is no longer carried';
      }
      gun.firearm!.tube!.push(ammo.type);
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
    const pump = this.isPump(item);
    const reason = exportedActionReason(item, this.inventory.registry, pump ? 'hand' : 'fire');
    if (reason) {
      return reason;
    }
    if (pump && !firearmHandlingFor(item, this.inventory.registry).model.tube) {
      return 'No exported tube data for this gun';
    }
    // Automatic motion will feed before the next cadence deadline. fire() rejects overlapping cycles;
    // only an idle empty chamber is a persistent refusal that should stop that cadence.
    if (!item.firearm || item.firearm.cycle || item.firearm.chamber === 'round') {
      return;
    }
    return item.firearm.chamber === 'empty' ? 'Chamber is empty' : 'Chamber contains a spent case';
  }

  fire(input: DebugFirearmShotInput): boolean {
    const pump = this.isPump(input.item);
    if (!((input.debugMode || pump) && this.held(input.item.uid)) || this.queue.busy) {
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
    if (pump) {
      const roundType = item.firearm?.roundType;
      const ammo = roundType && defOf(this.inventory.registry, roundType).ammo;
      if (!(roundType && ammo && ammoMatchesCalibre(roundType, data.calibre, this.inventory.registry))) {
        return false;
      }
      const state = item.firearm!;
      state.chamber = 'case';
      state.roundType = undefined;
      state.pendingCase = { ...emission, seed };
      this.onShot(
        pelletShot({ ammo, origin: input.eye, yaw: input.yaw, pitch: input.pitch, seed: input.seed, key: shotKey }),
        input.simTime,
      );
    } else {
      item.firearm = {
        chamber: 'case',
        pendingCase: { ...emission, seed },
        cycle: { mode: 'fire', startedAt: input.simTime, elapsed: 0, ejected: false, feedRound: true },
      };
      this.active.add(item.uid);
    }
    return true;
  }

  /** Read-only admission policy, also used by the inventory's Use affordance. */
  cockReason(uid: number): string | undefined {
    const item = this.inventory.itemByUid(uid);
    if (!(item && this.held(uid))) {
      return 'Hold the firearm before cocking it';
    }
    if (this.queue.busy || item.firearm?.cycle) {
      return 'Already handling something';
    }
    const reason = exportedActionReason(item, this.inventory.registry, 'hand');
    if (reason) {
      return reason;
    }
    const state = item.firearm;
    const data = firearmHandlingFor(item, this.inventory.registry);
    const type = state?.chamber === 'case' ? spentCaseItemId(data.calibre) : state?.roundType;
    if (!type) {
      return undefined; // Empty or virtual debug chamber has no live item to eject.
    }
    const pose = this.pose(uid);
    const emission = pose ? this.emission(item, data, pose) : state?.pendingCase;
    if (!emission) {
      return 'No held ejection pose';
    }
    const drop = this.ejectionDrop(type, emission, state?.chamber === 'case');
    return drop.plan.ok ? undefined : drop.plan.reason;
  }

  supportsUse(item: Item): boolean {
    const def = defOf(this.inventory.registry, item.type);
    return Boolean(def.firearm);
  }

  useOption(item: Item): UseOption {
    const reason = this.supportsUse(item) ? this.cockReason(item.uid) : 'No inventory Use action for this item';
    return {
      kind: 'use',
      label: `${this.isPump(item) ? 'Rack' : 'Cock'} ${this.inventory.name(item)}`,
      plan: reason
        ? { ok: false, reason }
        : { ok: true, time: actionCycleSeconds(firearmHandlingFor(item, this.inventory.registry).action, 'hand') },
    };
  }

  private isPump(item: Item): boolean {
    return defOf(this.inventory.registry, item.type).firearm?.pump === true;
  }

  private heldPump(): Item | undefined {
    return Object.values(this.inventory.hands).find((item) => item && this.isPump(item));
  }

  private carried(item: Item): boolean {
    let location = this.inventory.locate(item);
    while (location?.kind === 'pocket') {
      location = this.inventory.locate(location.owner);
    }
    return location?.kind === 'hand' || location?.kind === 'worn';
  }

  reloadableUid(): number | undefined {
    return this.heldPump()?.uid;
  }

  /** Loose carried cartridges only; ascending UID makes the source order save-stable. */
  loadNext(uid: number, time: number): string | undefined {
    const gun = this.heldPump();
    if (gun?.uid !== uid) {
      return 'Pump shotgun is no longer held';
    }
    const reason = exportedActionReason(gun, this.inventory.registry, 'hand');
    if (reason) {
      return reason;
    }
    const { calibre } = firearmHandlingFor(gun, this.inventory.registry);
    const [shell] = [...this.inventory.items()]
      .map(({ item }) => item)
      .filter((item) => this.carried(item) && ammoMatchesCalibre(item.type, calibre, this.inventory.registry))
      .sort((a, b) => a.uid - b.uid);
    return shell ? this.load(shell, time) : 'No loose compatible shells are carried';
  }

  cancelLoad(uid: number): void {
    const job = this.queue.jobs.find(
      (entry) => entry.kind === 'action' && entry.jobType === LOAD_ACTION && entry.params.uid === uid,
    );
    if (job) {
      this.queue.cancelJob(job);
    }
  }

  loadReason(ammo: Item, completing = false): string | undefined {
    const gun = this.heldPump();
    if (!gun) {
      return 'Hold a pump shotgun first';
    }
    if (!(this.inventory.itemByUid(ammo.uid) === ammo && this.carried(ammo))) {
      return 'Carry the shells first';
    }
    if ((!completing && this.queue.busy) || gun.firearm?.cycle) {
      return 'Already handling something';
    }
    const reason = exportedActionReason(gun, this.inventory.registry, 'hand');
    if (reason) {
      return reason;
    }
    const data = firearmHandlingFor(gun, this.inventory.registry);
    if (!(data.model.tube && data.model.anchors?.loading_port)) {
      return 'No exported loading port/tube';
    }
    if (!ammoMatchesCalibre(ammo.type, data.calibre, this.inventory.registry)) {
      return 'Wrong ammunition';
    }
    return (gun.firearm?.tube?.length ?? 0) >= data.model.tube.capacity ? 'Tube is full' : undefined;
  }

  load(ammo: Item, time: number): string | undefined {
    const reason = this.loadReason(ammo);
    if (reason) {
      return reason;
    }
    const gun = this.heldPump()!;
    this.queue.enqueueAction(
      LOAD_ACTION,
      `Load shell ${(gun.firearm?.tube?.length ?? 0) + 1}/${firearmHandlingFor(gun, this.inventory.registry).model.tube!.capacity}`,
      SHELL_LOAD_SECONDS,
      { uid: gun.uid, ammoUid: ammo.uid },
    );
    this.onSound('shotgun_insert', undefined, time);
    return undefined;
  }

  use(item: Item, time: number): string | undefined {
    return this.supportsUse(item) ? this.cock(item.uid, time) : 'No inventory Use action for this item';
  }

  describe(item: Item): string[] {
    if (!this.isPump(item)) {
      return [];
    }
    const state = item.firearm!;
    return [
      `Chamber: ${{ round: '00 buck shell', case: 'fired hull — rack before firing', empty: 'empty' }[state.chamber]}`,
      `Tube: ${state.tube!.length}/${firearmHandlingFor(item, this.inventory.registry).model.tube!.capacity} shells`,
    ];
  }

  cock(uid: number, time: number): string | undefined {
    const reason = this.cockReason(uid);
    if (reason) {
      return reason;
    }
    const item = this.inventory.itemByUid(uid)!;
    const data = firearmHandlingFor(item, this.inventory.registry);
    const pump = this.isPump(item);
    const state: FirearmState = item.firearm ?? { chamber: 'round' };
    state.cycle = { mode: 'hand', startedAt: time, elapsed: 0, ejected: false, feedRound: !pump };
    item.firearm = state;
    this.active.add(uid);
    this.queue.enqueueAction(
      COCK_ACTION,
      `${pump ? 'Rack' : 'Cock'} ${defOf(this.inventory.registry, item.type).name}`,
      data.action.hand.durationSeconds,
      { uid },
    );
    if (pump) {
      this.onSound('shotgun_rack_back', undefined, time);
    }
    return undefined;
  }

  advanceTo(time: number): void {
    for (const uid of this.active) {
      this.advanceItem(uid, time);
    }
  }

  private advanceItem(uid: number, time: number): void {
    const item = this.inventory.itemByUid(uid);
    const landing = item?.firearm?.landing;
    if (landing && time + 1e-9 >= landing.at) {
      item!.firearm!.landing = undefined;
      this.onSound('shotgun_hull_drop', landing.position, landing.at);
    }
    const cycle = item?.firearm?.cycle;
    if (!(item && cycle)) {
      if (!item?.firearm?.landing) {
        this.active.delete(uid);
      }
      return;
    }
    if (cycle.mode === 'hand') {
      this.advanceHand(item);
    } else {
      this.advanceCycle(item, Math.max(cycle.elapsed, time - cycle.startedAt));
    }
  }

  private advanceHand(item: Item): void {
    const job = this.queue.jobs.find(
      (entry) => entry.kind === 'action' && entry.jobType === COCK_ACTION && entry.params.uid === item.uid,
    );
    if (!(job && this.held(item.uid))) {
      // Cancelling motion keeps chamber, tube and any already committed landing cue intact.
      item.firearm!.cycle = undefined;
      this.retire(item);
      return;
    }
    this.advanceCycle(item, job.elapsed);
  }

  private retire(item: Item): void {
    if (!item.firearm?.landing) {
      this.active.delete(item.uid);
    }
  }

  frames(): readonly FirearmCycleFrame[] {
    return [
      ...new Set(Object.values(this.inventory.hands).flatMap((item) => (item ? [item.uid] : []))),
    ].flatMap<FirearmCycleFrame>((uid) => {
      const cycle = this.inventory.itemByUid(uid)?.firearm?.cycle;
      if (cycle) {
        return [{ uid, mode: cycle.mode, elapsed: cycle.elapsed }];
      }
      const [job] = this.queue.jobs;
      const ammo =
        job?.kind === 'action' &&
        job.jobType === LOAD_ACTION &&
        job.params.uid === uid &&
        typeof job.params.ammoUid === 'number'
          ? this.inventory.itemByUid(job.params.ammoUid)
          : undefined;
      return ammo && job
        ? [{ uid, mode: 'load', elapsed: job.elapsed, duration: job.duration, roundType: ammo.type }]
        : [];
    });
  }

  private advanceCycle(item: Item, elapsed: number): string | undefined {
    const state = item.firearm!;
    const { cycle } = state;
    if (!cycle) {
      return;
    }
    const data = firearmHandlingFor(item, this.inventory.registry);
    cycle.elapsed = Math.max(cycle.elapsed, elapsed);
    this.rackForwardCue(item, data, cycle);
    if (!cycle.ejected && cycle.elapsed + 1e-9 >= ejectSeconds(data.action, cycle.mode)) {
      const reason = this.ejectChamber(item, state, data);
      if (reason) {
        return reason; // Revalidate before clearing ammo; a changed drop cannot lose it.
      }
      cycle.ejected = true;
    }
    if (cycle.elapsed + 1e-9 >= actionCycleSeconds(data.action, cycle.mode)) {
      this.feed(item, state, cycle);
      state.cycle = undefined;
      this.retire(item);
    }
    return undefined;
  }

  private rackForwardCue(item: Item, data: FirearmHandlingData, cycle: FirearmCycleState): void {
    const returnAt = data.action.hand.rearwardSeconds + data.action.hand.dwellSeconds;
    if (this.isPump(item) && !cycle.forwardSounded && cycle.elapsed + 1e-9 >= returnAt) {
      cycle.forwardSounded = true;
      this.onSound('shotgun_rack_forward', undefined, cycle.startedAt + returnAt);
    }
  }

  private ejectChamber(item: Item, state: FirearmState, data: FirearmHandlingData): string | undefined {
    if (state.chamber === 'case') {
      return this.ejectCase(item, state, data);
    }
    if (state.chamber === 'round' && state.roundType !== undefined) {
      return this.ejectLive(item, state, data);
    }
    state.chamber = 'empty';
    return undefined;
  }

  private feed(item: Item, state: FirearmState, cycle: FirearmCycleState): void {
    if (this.isPump(item)) {
      state.roundType = state.tube!.shift();
      state.chamber = state.roundType ? 'round' : 'empty';
    } else if (cycle.feedRound) {
      state.chamber = 'round';
    }
  }

  private emission(item: Item, data: FirearmHandlingData, pose: FirearmPoseInput): Omit<PendingCase, 'seed'> {
    const side = this.inventory.hands.right?.uid === item.uid ? 'right' : 'left';
    const twoHanded = Boolean(defOf(this.inventory.registry, item.type).twoHanded);
    const eye: Vec3 = pose.eye.map((value) => value * pose.blockSize) as Vec3;
    return {
      ...heldEjectionPose({ model: data.model, side, twoHanded, eye, yaw: pose.yaw, pitch: pose.pitch }),
      feet: [...pose.feet],
    };
  }

  /** Metadata-only placement probe: never allocate a UID during read-only rack admission. */
  private ejectionDrop(
    type: string,
    emission: Omit<PendingCase, 'seed'>,
    counter = false,
  ): ReturnType<typeof dropTarget> {
    const probe: Item = { uid: 0, type, count: 1, condition: 1 };
    const landing = this.landing(emission);
    const nearby = counter
      ? pilesInRadius(this.inventory, emission.feet, 20 / this.blockSize).find(
          (pile) =>
            pile.items.some(({ item }) => item.type === type) &&
            this.inventory.planAdd(probe, { kind: 'pile', pos: pile.pos }).ok,
        )
      : undefined;
    return dropTarget(this.inventory, probe, nearby?.pos ?? landing);
  }

  private ejectLive(item: Item, state: FirearmState, data: FirearmHandlingData): string | undefined {
    const pose = this.pose(item.uid);
    if (!pose) {
      return 'No held ejection pose';
    }
    const emission = this.emission(item, data, pose);
    const type = state.roundType!;
    const drop = this.ejectionDrop(type, emission);
    if (!drop.plan.ok) {
      return drop.plan.reason;
    }
    if (!this.inventory.add(this.inventory.create(type), drop.target)) {
      return 'Ejection placement changed';
    }
    state.chamber = 'empty';
    state.roundType = undefined;
    state.cycle!.ejected = true;
    const seed = Math.floor(Rng.stream(item.uid, `live-shell:${state.cycle!.startedAt}`).next() * 4_294_967_296) >>> 0;
    const modelId = defOf(this.inventory.registry, type).model;
    this.onEjection({
      origin: emission.origin,
      direction: emission.direction,
      speed: CASE_SPEED,
      seed,
      ...(modelId ? { caseModelId: modelId } : {}),
    });
    return undefined;
  }

  private landing(emission: Omit<PendingCase, 'seed'>): Vec3 {
    const distance = CASE_SPEED * CASE_FLIGHT_SECONDS;
    return [
      Math.floor((emission.origin[0] + emission.direction[0] * distance) / this.blockSize),
      emission.feet[1],
      Math.floor((emission.origin[2] + emission.direction[2] * distance) / this.blockSize),
    ];
  }

  private ejectCase(item: Item, state: FirearmState, data: FirearmHandlingData): string | undefined {
    const pending = state.pendingCase;
    if (!pending) {
      throw new Error('Fired chamber lost its pending case');
    }
    const pose = this.pose(item.uid);
    const emission = pose ? this.emission(item, data, pose) : pending;
    const landing = this.landing(emission);
    const type = spentCaseItemId(data.calibre);
    const drop = this.ejectionDrop(type, emission, true);
    if (!drop.plan.ok) {
      return drop.plan.reason;
    }
    if (!this.inventory.add(this.inventory.create(type), drop.target)) {
      return 'Ejection placement changed';
    }
    state.chamber = 'empty';
    state.pendingCase = undefined;
    // Commit the transition before output: a drawing failure must never double its case.
    state.cycle!.ejected = true;
    if (this.isPump(item)) {
      state.landing = {
        at: state.cycle!.startedAt + ejectSeconds(data.action, 'hand') + CASE_FLIGHT_SECONDS,
        position: [...landing],
      };
    }
    this.onEjection({
      origin: emission.origin,
      direction: emission.direction,
      speed: CASE_SPEED,
      seed: pending.seed,
      ...(data.caseModelId ? { caseModelId: data.caseModelId } : {}),
    });
    return undefined;
  }
}
