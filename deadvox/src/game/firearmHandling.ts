// Item-owned chamber/cycle facts. Existing simulation/handling schedulers advance them;
// presentation only observes ejection and the current cycle. No timers or second job queue.

import { type AimBasis, type AimFrame, aimBasis, NEUTRAL_AIM } from '../core/aim.ts';
import { dominantSide } from '../core/character.ts';
import type { ModelDef, Registry } from '../core/content.ts';
import type { Vec3 } from '../core/coords.ts';
import { actionCycleSeconds, ejectSeconds } from '../core/firearmAction.ts';
import type { FirearmCycleState, FirearmState, PendingCase } from '../core/firearmState.ts';
import {
  type FirearmsCombatTuning,
  type FirearmsSkillShotKind,
  type FirearmsSkillZeroHandling,
  firearmStanceEffects,
  firearmsSkillEffects,
  skillZeroHandlingForFirearm,
} from '../core/firearmsSkill.ts';
import type { HandlingQueue, Job } from '../core/handling.ts';
import { heldEjectionPose, heldFirearmTransform } from '../core/heldPose.ts';
import type { Inventory } from '../core/inventory.ts';
import { defOf, type Item } from '../core/items.ts';
import { magazineFits, magazineSpec, magazineWellCalibre } from '../core/magazine.ts';
import { PLAYER_VIEW_FOV_DEGREES } from '../core/opticWindow.ts';
import { dropTarget, stowTarget } from '../core/options.ts';
import { coneDirection, type PelletShot, pelletShotFromBasis, projectileShot } from '../core/pellets.ts';
import { Rng } from '../core/random.ts';
import type { SoundEventId } from '../core/soundEvents.ts';
import { MAGAZINE_LOAD_ACTION } from './magazineHandling.ts';

/** Gameplay estimates for transient ballistics, not claimed as measured export data. */
const CASE_SPEED = 3.5;
const CASE_FLIGHT_SECONDS = 0.48;
const COCK_ACTION = 'firearm.cock';
const LOAD_ACTION = 'firearm.load';
const MAGAZINE_ACTION = 'firearm.magazine';
const TRAINING_ACTIONS: ReadonlySet<string> = new Set([
  COCK_ACTION,
  LOAD_ACTION,
  MAGAZINE_ACTION,
  MAGAZINE_LOAD_ACTION,
]);
export const isFirearmTrainingAction = (job: Job): boolean =>
  job.kind === 'action' && TRAINING_ACTIONS.has(job.jobType);
/** Single-shell handling estimate, not an exported mechanical phase. */
export const SHELL_LOAD_SECONDS = 0.9;
/**
 * Gameplay handling estimates for the two halves of a magazine change at skill 0, which the firearms skill's reload
 * factor shortens. Grounded in timed rifle reloads (Crate Club, "How Long Does It Take to Reload an Assault Rifle?",
 * https://crateclub.com/blogs/loadout/how-long-does-it-take-to-reload-an-assault-rifle): an average shooter changes
 * an AR magazine in 3–5 s and an AK one in 4–6 s, a proficient one an AR magazine in about 2 s, all dropping the old
 * magazine. A change here stows it, which is slower, so skill 0 sits at the slow end. Taking a magazine out and
 * stowing it is one half, drawing one and seating it the other: a removal or an insert into an empty gun takes only
 * its half (DESIGN.md, "Combat and noise", rifles).
 */
const MAGAZINE_REMOVE_SIM_SECONDS = 3;
const MAGAZINE_INSERT_SIM_SECONDS = 3;

/** The share of a magazine job spent taking the fitted one out, so presentation can play remove, then insert. */
const magazineRemoveShare = (removing: boolean, inserting: boolean): number => {
  if (!removing) {
    return 0;
  }
  return inserting ? MAGAZINE_REMOVE_SIM_SECONDS / (MAGAZINE_REMOVE_SIM_SECONDS + MAGAZINE_INSERT_SIM_SECONDS) : 1;
};

const unit = (vector: Vec3): Vec3 => {
  const length = Math.hypot(...vector);
  if (!(length > 0 && Number.isFinite(length))) {
    throw new Error('Invalid firearm pose direction');
  }
  return vector.map((value) => value / length) as Vec3;
};

const cameraVectorInWorld = (vector: Vec3, yaw: number, pitch: number): Vec3 => {
  const { right, up, forward } = aimBasis(yaw, pitch, NEUTRAL_AIM);
  return [
    right[0] * vector[0] + up[0] * vector[1] - forward[0] * vector[2],
    right[1] * vector[0] + up[1] * vector[1] - forward[1] * vector[2],
    right[2] * vector[0] + up[2] * vector[1] - forward[2] * vector[2],
  ];
};

const basisAlong = (forward: Vec3, up: Vec3): AimBasis => {
  const right = unit([
    forward[1] * up[2] - forward[2] * up[1],
    forward[2] * up[0] - forward[0] * up[2],
    forward[0] * up[1] - forward[1] * up[0],
  ]);
  const correctedUp = unit([
    right[1] * forward[2] - right[2] * forward[1],
    right[2] * forward[0] - right[0] * forward[2],
    right[0] * forward[1] - right[1] * forward[0],
  ]);
  return { forward, right, up: correctedUp };
};

type Action = NonNullable<ModelDef['action']>;
export interface FirearmHandlingData {
  readonly model: ModelDef;
  readonly action: Action;
  readonly calibre: string;
  readonly caseModelId?: string;
  readonly roundsPerSimSecond: number | undefined;
  readonly recoilKickRadians?: number;
  readonly dispersionRadians?: number;
}

const hasTraceProperties = (
  data: FirearmHandlingData,
): data is FirearmHandlingData & { recoilKickRadians: number; dispersionRadians: number } =>
  data.recoilKickRadians !== undefined && data.dispersionRadians !== undefined;

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
  return mode === 'fire' && !(model.action.fire && model.action.roundsPerSimMinute)
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
    roundsPerSimSecond: action.roundsPerSimMinute,
    ...(caseModelId ? { caseModelId } : {}),
    ...(defOf(registry, item.type).firearm
      ? {
          recoilKickRadians: defOf(registry, item.type).firearm!.recoilKickRadians,
          dispersionRadians: defOf(registry, item.type).firearm!.dispersionRadians,
        }
      : {}),
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

export interface FirearmTrajectory {
  readonly eye: Vec3;
  readonly muzzle: Vec3;
  readonly directions: readonly Vec3[];
}

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
export interface FirearmShotInput extends FirearmPoseInput {
  readonly aimFrame: AimFrame;
  readonly aimingDownSights?: boolean;
  readonly ready: boolean;
  readonly sprinting: boolean;
  readonly item: Item;
  readonly seed: number;
  readonly simTime: number;
}
interface ShotCommit {
  readonly input: FirearmShotInput;
  readonly item: Item;
  readonly data: ReturnType<typeof firearmHandlingFor> & { recoilKickRadians: number; dispersionRadians: number };
  readonly emission: Omit<PendingCase, 'seed'>;
  readonly muzzle: Vec3;
  readonly shotBasis: AimBasis;
  readonly shotKey: string;
  readonly seed: number;
}
export interface FirearmCycleFrame {
  readonly uid: number;
  readonly mode: 'fire' | 'hand' | 'load' | 'magazine';
  readonly elapsed: number;
  readonly duration?: number;
  readonly roundType?: string;
  /** A magazine job: the share of it spent taking the fitted magazine out, and the model of the one going in. */
  readonly magazine?: { readonly removeShare: number; readonly incoming?: string };
}

export class FirearmMechanics {
  /** Numeric ownership references only. Chamber/cycle data lives on the inventory item. */
  private readonly active = new Set<number>();
  private readonly raising = new Set<number>();
  private readonly inventory: Inventory;
  private readonly queue: HandlingQueue;
  private readonly blockSize: number;
  private readonly pose: (uid: number) => FirearmPoseInput | undefined;
  private readonly onEjection: (effect: FirearmShotEffect) => void;
  /** Simulation: resolves the shot's hits. It runs before `onTrajectory`, which is presentation only. */
  private readonly onShot: (shot: PelletShot, time: number, firearm: Item) => void;
  private readonly onTrajectory: (trajectory: FirearmTrajectory, time: number) => void;
  private readonly onSound: (event: SoundEventId, position: Vec3 | undefined, time: number) => void;
  private readonly onCommittedShot: (
    seed: number,
    recoilKickRadians: number,
    shotKind: FirearmsSkillShotKind,
    firearmUid: number,
  ) => void;
  private readonly firearmsSkillLevel: () => number;
  private readonly firearmsSkillZeroHandling: () => FirearmsSkillZeroHandling;
  private readonly firearmsCombatTuning: FirearmsCombatTuning | undefined;
  private readonly firearmsSkillZeroOverrides = new Map<string, FirearmsSkillZeroHandling>();
  private readonly previousShotAt = new Map<number, number>();

  constructor(
    inventory: Inventory,
    queue: HandlingQueue,
    {
      blockSize,
      pose,
      onEjection,
      onShot = () => undefined,
      onTrajectory = () => undefined,
      onSound = () => undefined,
      onCommittedShot = () => undefined,
      firearmsSkillLevel = () => 0,
      firearmsSkillZeroHandling,
    }: {
      blockSize: number;
      pose: (uid: number) => FirearmPoseInput | undefined;
      onEjection: (effect: FirearmShotEffect) => void;
      onShot?: (shot: PelletShot, time: number, firearm: Item) => void;
      onTrajectory?: (trajectory: FirearmTrajectory, time: number) => void;
      onSound?: (event: SoundEventId, position: Vec3 | undefined, time: number) => void;
      onCommittedShot?: (
        seed: number,
        recoilKickRadians: number,
        shotKind: FirearmsSkillShotKind,
        firearmUid: number,
      ) => void;
      firearmsSkillLevel?: () => number;
      firearmsSkillZeroHandling?: () => FirearmsSkillZeroHandling;
    },
  ) {
    this.inventory = inventory;
    this.queue = queue;
    this.blockSize = blockSize;
    this.pose = pose;
    this.onEjection = onEjection;
    this.onShot = onShot;
    this.onTrajectory = onTrajectory;
    this.onSound = onSound;
    this.onCommittedShot = onCommittedShot;
    this.firearmsSkillLevel = firearmsSkillLevel;
    this.firearmsCombatTuning = inventory.registry.skills.get('firearms_combat')?.combat?.firearms;
    this.firearmsSkillZeroHandling =
      firearmsSkillZeroHandling ??
      (() => {
        const tuning = this.firearmsCombatTuning;
        if (!tuning) {
          throw new Error('Missing firearms-combat skill-zero handling tuning');
        }
        return tuning.skillZeroHandling;
      });
    for (const { item } of inventory.items()) {
      if (item.firearm?.cycle || item.firearm?.landing) {
        this.active.add(item.uid);
      }
      if (item.firearm?.readying) {
        this.raising.add(item.uid);
      }
    }
    queue.registerAction(COCK_ACTION, (params): string | undefined => {
      const item = typeof params.uid === 'number' ? inventory.itemByUid(params.uid) : undefined;
      if (!(item && this.held(item.uid)) || item.firearm?.cycle?.mode !== 'hand') {
        return 'Firearm is no longer held';
      }
      return this.advanceCycle(
        item,
        item.firearm.cycle.duration ?? actionCycleSeconds(firearmHandlingFor(item, inventory.registry).action, 'hand'),
      );
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
    queue.registerAction(MAGAZINE_ACTION, (params) => this.completeMagazineChange(params.uid, params.magazineUid));
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
    const state = item.firearm;
    if (state?.cycle || state?.chamber === 'round') {
      return;
    }
    return state?.chamber === 'case' ? 'Chamber contains a spent case' : 'Chamber is empty';
  }

  advanceReadiness(dt: number, uid: number | undefined, held: boolean): void {
    if (!Number.isFinite(dt) || dt < 0) {
      throw new Error('Invalid firearm ready step');
    }
    for (const raisingUid of this.raising) {
      if (raisingUid === uid && held && this.held(raisingUid)) {
        continue;
      }
      const item = this.inventory.itemByUid(raisingUid);
      if (item?.firearm) {
        item.firearm.readying = undefined;
      }
      this.raising.delete(raisingUid);
    }
    if (!(held && uid !== undefined && this.held(uid))) {
      return;
    }
    const item = this.inventory.itemByUid(uid);
    if (!(item && defOf(this.inventory.registry, item.type).firearm)) {
      return;
    }
    let state = item.firearm;
    if (!state) {
      state = { chamber: 'empty' };
      item.firearm = state;
    }
    let progress = state.readying;
    if (!progress) {
      progress = {
        elapsed: 0,
        duration: firearmStanceEffects(this.firearmsSkillLevel(), this.requiredFirearmsCombatTuning()).raiseDuration,
      };
      state.readying = progress;
      this.raising.add(uid);
    }
    progress.elapsed = Math.min(progress.duration, progress.elapsed + dt);
  }

  private requiredFirearmsCombatTuning(): FirearmsCombatTuning {
    const tuning = this.firearmsCombatTuning;
    if (!tuning) {
      throw new Error('Missing firearms-combat stance tuning');
    }
    return { ...tuning, skillZeroHandling: this.firearmsSkillZeroHandling() };
  }

  skillZeroHandlingFor(uid: number): FirearmsSkillZeroHandling {
    const item = this.inventory.itemByUid(uid);
    if (!item) {
      return this.firearmsSkillZeroHandling();
    }
    const override = this.firearmsSkillZeroOverrides.get(item.type);
    const { firearm } = defOf(this.inventory.registry, item.type);
    return structuredClone(
      override ?? skillZeroHandlingForFirearm(firearm?.skillZeroHandling, this.firearmsSkillZeroHandling()),
    );
  }

  setSkillZeroHandlingFor(uid: number, value: FirearmsSkillZeroHandling): boolean {
    const item = this.inventory.itemByUid(uid);
    if (!(item && defOf(this.inventory.registry, item.type).firearm)) {
      return false;
    }
    this.firearmsSkillZeroOverrides.set(item.type, structuredClone(value));
    return true;
  }

  hasSkillZeroHandlingOverrides(): boolean {
    return this.firearmsSkillZeroOverrides.size > 0;
  }

  /** The next shot is a follow-up only inside the same weapon's short, content-cadence burst window. */
  handlingShotKind(uid: number, time: number): FirearmsSkillShotKind {
    const item = this.inventory.itemByUid(uid);
    if (!item) {
      return 'singleShot';
    }
    const { roundsPerSimSecond } = firearmHandlingFor(item, this.inventory.registry);
    const previous = this.previousShotAt.get(uid);
    return roundsPerSimSecond !== undefined &&
      previous !== undefined &&
      time >= previous &&
      time - previous <= 1.5 / roundsPerSimSecond + 1e-9
      ? 'automaticFollowup'
      : 'singleShot';
  }

  isReady(uid: number): boolean {
    const readying = this.inventory.itemByUid(uid)?.firearm?.readying;
    return readying !== undefined && readying.elapsed >= readying.duration;
  }

  readyProgress(uid: number): number {
    const readying = this.inventory.itemByUid(uid)?.firearm?.readying;
    return readying ? Math.max(0, Math.min(1, readying.elapsed / readying.duration)) : 0;
  }

  fire(input: FirearmShotInput): boolean {
    const pump = this.isPump(input.item);
    if (!input.ready || input.sprinting || !this.held(input.item.uid) || this.queue.busy) {
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
    if (!hasTraceProperties(data)) {
      return false;
    }
    const emission = this.emission(item, data, input);
    const side = this.inventory.hands.right?.uid === item.uid ? 'right' : 'left';
    const heldPose = heldFirearmTransform({
      model: data.model,
      side,
      leadingSide: dominantSide(this.inventory.character),
      twoHanded: Boolean(defOf(this.inventory.registry, item.type).twoHanded),
      progress: 1,
      aimingDownSights: input.aimingDownSights ?? false,
      aimFrame: input.aimFrame,
      loweredPitchRadians: this.requiredFirearmsCombatTuning().loweredPitchRadians,
      adsApertureFill: this.requiredFirearmsCombatTuning().adsApertureFill,
      verticalFovDegrees: PLAYER_VIEW_FOV_DEGREES,
    });
    const eyeMetres = input.eye.map((value) => value * this.blockSize) as Vec3;
    const rootMetres = eyeMetres.map(
      (value, index) => value + cameraVectorInWorld(heldPose.rootOffset, input.yaw, input.pitch)[index]!,
    ) as Vec3;
    const muzzleMetres = rootMetres.map(
      (value, index) => value + cameraVectorInWorld(heldPose.muzzleOffset, input.yaw, input.pitch)[index]!,
    ) as Vec3;
    const muzzle = muzzleMetres.map((value) => value / this.blockSize) as Vec3;
    const muzzleDirection = unit(cameraVectorInWorld(heldPose.muzzleDirection, input.yaw, input.pitch));
    const muzzleUp = unit(cameraVectorInWorld(heldPose.muzzleUp, input.yaw, input.pitch));
    const shotBasis = basisAlong(muzzleDirection, muzzleUp);
    const shotKey = `${item.uid}:${input.simTime}:${input.feet.join(',')}`;
    const seed = Math.floor(Rng.stream(input.seed, `firearm-case:${shotKey}`).next() * 4_294_967_296) >>> 0;
    const commit = { input, item, data, emission, muzzle, shotBasis, shotKey, seed };
    return pump ? this.commitPumpShot(commit) : this.commitBallisticShot(commit);
  }

  private commitPumpShot({ input, item, data, emission, muzzle, shotBasis, shotKey, seed }: ShotCommit): boolean {
    const roundType = item.firearm?.roundType;
    const ammo = roundType && defOf(this.inventory.registry, roundType).ammo;
    if (!(roundType && ammo && ammoMatchesCalibre(roundType, data.calibre, this.inventory.registry))) {
      return false;
    }
    const state = item.firearm!;
    const shotKind = this.handlingShotKind(item.uid, input.simTime);
    state.chamber = 'case';
    state.roundType = undefined;
    state.pendingCase = { ...emission, seed };
    const pellets = pelletShotFromBasis({ ammo, origin: muzzle, basis: shotBasis, seed: input.seed, key: shotKey });
    this.onShot(pellets, input.simTime, item);
    this.onTrajectory({ eye: input.eye, muzzle, directions: pellets.directions }, input.simTime);
    this.onCommittedShot(seed, data.recoilKickRadians, shotKind, item.uid);
    this.previousShotAt.set(item.uid, input.simTime);
    return true;
  }

  private commitBallisticShot({ input, item, data, emission, muzzle, shotBasis, shotKey, seed }: ShotCommit): boolean {
    const roundType = item.firearm?.roundType;
    const ammo = roundType && defOf(this.inventory.registry, roundType).ammo;
    if (!(roundType && ammo && ammoMatchesCalibre(roundType, data.calibre, this.inventory.registry))) {
      return false;
    }
    const shotKind = this.handlingShotKind(item.uid, input.simTime);
    item.firearm = {
      chamber: 'case',
      ...(item.firearm?.readying === undefined ? {} : { readying: item.firearm.readying }),
      pendingCase: { ...emission, seed },
      cycle: {
        mode: 'fire',
        startedAt: input.simTime,
        elapsed: 0,
        duration: actionCycleSeconds(data.action, 'fire'),
        ejected: false,
      },
    };
    this.active.add(item.uid);
    const direction = coneDirection(
      shotBasis,
      data.dispersionRadians,
      Rng.stream(input.seed, `firearm-dispersion:${shotKey}`),
    );
    this.onShot(projectileShot(ammo, muzzle, [direction]), input.simTime, item);
    this.onTrajectory({ eye: input.eye, muzzle, directions: [direction] }, input.simTime);
    this.onCommittedShot(seed, data.recoilKickRadians, shotKind, item.uid);
    this.previousShotAt.set(item.uid, input.simTime);
    return true;
  }

  /** Read-only admission policy for manual cocking. */
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
      return undefined; // An empty chamber has no item to eject.
    }
    const pose = this.pose(uid);
    const emission = pose ? this.emission(item, data, pose) : state?.pendingCase;
    if (!emission) {
      return 'No held ejection pose';
    }
    const drop = this.ejectionDrop(type, emission);
    return drop.plan.ok ? undefined : drop.plan.reason;
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

  private heldMagazineFed(): Item | undefined {
    return Object.values(this.inventory.hands).find(
      (item) => item && magazineWellCalibre(this.inventory.registry, item.type) !== undefined,
    );
  }

  reloadableUid(): number | undefined {
    return (this.heldPump() ?? this.heldMagazineFed())?.uid;
  }

  /** A magazine change takes one press; a pump loads one shell per press-and-hold step. */
  reloadsInOneAction(uid: number): boolean {
    return this.heldMagazineFed()?.uid === uid;
  }

  /** Whether a rack would still take something out of the gun: a round or case in the chamber, or tube rounds. */
  stillLoaded(uid: number): boolean {
    const state = this.inventory.itemByUid(uid)?.firearm;
    return state !== undefined && (state.chamber !== 'empty' || (state.tube?.length ?? 0) > 0);
  }

  /** Loose carried cartridges only; ascending UID makes the source order save-stable. */
  loadNext(uid: number, time: number): string | undefined {
    const rifle = this.heldMagazineFed();
    if (rifle?.uid === uid) {
      return this.changeMagazine(rifle, time);
    }
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
      SHELL_LOAD_SECONDS *
        firearmsSkillEffects(this.firearmsSkillLevel(), this.requiredFirearmsCombatTuning()).reloadDuration,
      { uid: gun.uid, ammoUid: ammo.uid },
    );
    this.onSound('shotgun_insert', undefined, time);
    return undefined;
  }

  /**
   * Swaps in the fullest carried magazine that fits (lowest UID on a tie, so the choice is save-stable), whatever
   * the fitted one holds (CONTROLS.md, "Reload, rack, remove").
   */
  private changeMagazine(gun: Item, time: number): string | undefined {
    if (this.queue.busy || gun.firearm?.cycle) {
      return 'Already handling something';
    }
    const replacement = this.fullestMagazine(gun);
    if (!replacement) {
      return 'No magazine for this firearm is carried';
    }
    this.enqueueMagazineAction(gun, gun.slots?.magazine ? 'Change magazine' : 'Insert magazine', time, replacement);
    return undefined;
  }

  /** Takes the fitted magazine out to a pocket or the ground: tap, then hold R (CONTROLS.md, "Reload, rack, remove"). */
  removeMagazine(uid: number, time: number): string | undefined {
    const gun = this.heldMagazineFed();
    if (gun?.uid !== uid) {
      return 'This firearm has no magazine to remove';
    }
    if (this.queue.busy || gun.firearm?.cycle) {
      return 'Already handling something';
    }
    if (!gun.slots?.magazine) {
      return 'No magazine is fitted';
    }
    this.enqueueMagazineAction(gun, 'Remove magazine', time);
    return undefined;
  }

  /** A change names its replacement; a removal names none. Each half it does takes its own time. */
  private enqueueMagazineAction(gun: Item, label: string, time: number, replacement?: Item): void {
    const seconds =
      (gun.slots?.magazine ? MAGAZINE_REMOVE_SIM_SECONDS : 0) + (replacement ? MAGAZINE_INSERT_SIM_SECONDS : 0);
    this.queue.enqueueAction(
      MAGAZINE_ACTION,
      label,
      seconds * firearmsSkillEffects(this.firearmsSkillLevel(), this.requiredFirearmsCombatTuning()).reloadDuration,
      replacement ? { uid: gun.uid, magazineUid: replacement.uid } : { uid: gun.uid },
    );
    this.onSound('magazine_change', undefined, time);
  }

  private fullestMagazine(gun: Item): Item | undefined {
    const rounds = (magazine: Item): number => magazine.cartridges?.length ?? 0;
    const [best] = [...this.inventory.items()]
      .map(({ item }) => item)
      .filter((item) => this.carried(item) && magazineFits(this.inventory.registry, gun.type, item.type))
      .sort((a, b) => rounds(b) - rounds(a) || a.uid - b.uid);
    return best;
  }

  /** Detaches the replacement, stows the fitted magazine, then fits the replacement; any failure undoes all. */
  private completeMagazineChange(uid: unknown, magazineUid: unknown): string | undefined {
    const gun = typeof uid === 'number' ? this.inventory.itemByUid(uid) : undefined;
    if (!(gun?.slots && this.held(gun.uid))) {
      return 'Firearm is no longer held';
    }
    if (magazineUid === undefined) {
      return this.completeMagazineRemoval(gun);
    }
    const replacement = this.carriedFitting(gun, magazineUid);
    if (!replacement) {
      return 'The magazine is no longer carried';
    }
    const back = this.inventory.targetForLocation(this.inventory.locate(replacement)!);
    if (!this.inventory.consume(replacement, replacement.count)) {
      return 'The magazine is no longer carried';
    }
    const removed = this.inventory.fitSlot(gun, 'magazine', replacement);
    if (removed && !this.stow(gun, removed)) {
      this.inventory.fitSlot(gun, 'magazine', removed);
      if (!(this.inventory.add(replacement, back) || this.stow(gun, replacement))) {
        throw new Error('Undoing a magazine change lost the replacement magazine');
      }
      return 'No room for the removed magazine';
    }
    return undefined;
  }

  /** Stows the fitted magazine; with nowhere to put it, it stays fitted. */
  private completeMagazineRemoval(gun: Item): string | undefined {
    const removed = this.inventory.fitSlot(gun, 'magazine', undefined);
    if (!removed) {
      return 'No magazine is fitted';
    }
    if (!this.stow(gun, removed)) {
      this.inventory.fitSlot(gun, 'magazine', removed);
      return 'No room for the removed magazine';
    }
    return undefined;
  }

  private carriedFitting(gun: Item, uid: unknown): Item | undefined {
    const magazine = typeof uid === 'number' ? this.inventory.itemByUid(uid) : undefined;
    return magazine && this.carried(magazine) && magazineFits(this.inventory.registry, gun.type, magazine.type)
      ? magazine
      : undefined;
  }

  /** Puts an item leaving the held gun into a pocket, or onto the ground at the player's feet. */
  private stow(gun: Item, item: Item): boolean {
    const feet = this.pose(gun.uid)?.feet;
    const target = feet && stowTarget(this.inventory, item, feet);
    return Boolean(target && this.inventory.add(item, target));
  }

  describe(item: Item): string[] {
    if (magazineWellCalibre(this.inventory.registry, item.type) !== undefined) {
      const magazine = item.slots?.magazine;
      const spec = magazine && magazineSpec(this.inventory.registry, magazine.type);
      return [
        `Chamber: ${this.chamberWords(item)}`,
        `Magazine: ${spec ? `${magazine.cartridges!.length}/${spec.capacity}` : 'none'}`,
      ];
    }
    if (!this.isPump(item)) {
      return [];
    }
    const state = item.firearm!;
    return [
      `Chamber: ${{ round: '00 buck shell', case: 'fired hull — rack before firing', empty: 'empty' }[state.chamber]}`,
      `Tube: ${state.tube!.length}/${firearmHandlingFor(item, this.inventory.registry).model.tube!.capacity} shells`,
    ];
  }

  private chamberWords(item: Item): string {
    const state = item.firearm;
    if (state?.chamber === 'round') {
      return defOf(this.inventory.registry, state.roundType!).name;
    }
    return state?.chamber === 'case' ? 'spent case — charge before firing' : 'empty';
  }

  cock(uid: number, time: number): string | undefined {
    const reason = this.cockReason(uid);
    if (reason) {
      return reason;
    }
    const item = this.inventory.itemByUid(uid)!;
    const data = firearmHandlingFor(item, this.inventory.registry);
    const pump = this.isPump(item);
    const state: FirearmState = item.firearm ?? { chamber: 'empty' };
    const duration =
      actionCycleSeconds(data.action, 'hand') *
      firearmsSkillEffects(this.firearmsSkillLevel(), this.requiredFirearmsCombatTuning()).rackDuration;
    state.cycle = { mode: 'hand', startedAt: time, elapsed: 0, duration, ejected: false };
    item.firearm = state;
    this.active.add(uid);
    this.queue.enqueueAction(
      COCK_ACTION,
      `${pump ? 'Rack' : 'Charge'} ${defOf(this.inventory.registry, item.type).name}`,
      duration,
      { uid },
    );
    this.onSound(pump ? 'shotgun_rack_back' : 'rifle_charge', undefined, time);
    return undefined;
  }

  pauseTo(time: number): void {
    for (const uid of this.active) {
      const item = this.inventory.itemByUid(uid);
      const cycle = item?.firearm?.cycle;
      if (cycle && cycle.mode !== 'hand') {
        item!.firearm!.cycle = { ...cycle, startedAt: time - cycle.elapsed };
      }
    }
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

  /** A queued magazine job's motion: the fitted magazine still holds its slot until the job completes. */
  private magazineMotion(gun: Item, magazineUid: unknown): NonNullable<FirearmCycleFrame['magazine']> {
    const incoming = typeof magazineUid === 'number' ? this.inventory.itemByUid(magazineUid) : undefined;
    const model = incoming && defOf(this.inventory.registry, incoming.type).model;
    return {
      removeShare: magazineRemoveShare(gun.slots?.magazine !== undefined, incoming !== undefined),
      ...(model ? { incoming: model } : {}),
    };
  }

  frames(): readonly FirearmCycleFrame[] {
    return [
      ...new Set(Object.values(this.inventory.hands).flatMap((item) => (item ? [item.uid] : []))),
    ].flatMap<FirearmCycleFrame>((uid) => {
      const item = this.inventory.itemByUid(uid);
      const cycle = item?.firearm?.cycle;
      if (item && cycle) {
        return [
          {
            uid,
            mode: cycle.mode,
            elapsed: cycle.elapsed,
            duration:
              cycle.duration ??
              actionCycleSeconds(firearmHandlingFor(item, this.inventory.registry).action, cycle.mode),
          },
        ];
      }
      return item ? this.jobFrame(item) : [];
    });
  }

  /** A magazine job or a shell load queued first on the held `gun`, played from the job's own clock. */
  private jobFrame(gun: Item): FirearmCycleFrame[] {
    const [job] = this.queue.jobs;
    if (!(job?.kind === 'action' && job.params.uid === gun.uid)) {
      return [];
    }
    const clock = { uid: gun.uid, elapsed: job.elapsed, duration: job.duration };
    if (job.jobType === MAGAZINE_ACTION) {
      return [{ ...clock, mode: 'magazine', magazine: this.magazineMotion(gun, job.params.magazineUid) }];
    }
    const ammo =
      job.jobType === LOAD_ACTION && typeof job.params.ammoUid === 'number'
        ? this.inventory.itemByUid(job.params.ammoUid)
        : undefined;
    return ammo ? [{ ...clock, mode: 'load', roundType: ammo.type }] : [];
  }

  private advanceCycle(item: Item, elapsed: number): string | undefined {
    const state = item.firearm!;
    const { cycle } = state;
    if (!cycle) {
      return;
    }
    const data = firearmHandlingFor(item, this.inventory.registry);
    const duration = cycle.duration ?? actionCycleSeconds(data.action, cycle.mode);
    const timeScale = duration / actionCycleSeconds(data.action, cycle.mode);
    cycle.elapsed = Math.max(cycle.elapsed, elapsed);
    this.rackForwardCue(item, data, cycle, timeScale);
    if (!cycle.ejected && cycle.elapsed + 1e-9 >= ejectSeconds(data.action, cycle.mode) * timeScale) {
      const reason = this.ejectChamber(item, state, data);
      if (reason) {
        return reason; // Revalidate before clearing ammo; a changed drop cannot lose it.
      }
      cycle.ejected = true;
    }
    if (cycle.elapsed + 1e-9 >= duration) {
      this.feed(item, state);
      state.cycle = undefined;
      this.retire(item);
    }
    return undefined;
  }

  private rackForwardCue(item: Item, data: FirearmHandlingData, cycle: FirearmCycleState, timeScale: number): void {
    const returnAt = (data.action.hand.rearwardSimSeconds + data.action.hand.dwellSimSeconds) * timeScale;
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

  /** The action closes on the next round: the pump's tube, else the fitted magazine's top round. */
  private feed(item: Item, state: FirearmState): void {
    const source = this.isPump(item) ? state.tube : item.slots?.magazine?.cartridges;
    state.roundType = source?.shift();
    state.chamber = state.roundType ? 'round' : 'empty';
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

  /**
   * Metadata-only placement probe: never allocate a UID during read-only rack admission. An ejected item lands in
   * the pile of the block it falls on, so cases are saved per block (DESIGN.md, "Spent cases per block").
   */
  private ejectionDrop(type: string, emission: Omit<PendingCase, 'seed'>): ReturnType<typeof dropTarget> {
    return dropTarget(this.inventory, { uid: 0, type, count: 1, condition: 1 }, this.landing(emission));
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
    const drop = this.ejectionDrop(type, emission);
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
