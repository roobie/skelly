// Item-owned chamber/cycle facts. Existing simulation/handling schedulers advance them;
// presentation only observes ejection and the current cycle. No timers or second job queue.

import { type ActionText, actionText, fillText } from '../core/actionText.ts';
import type { AimBasis, AimFrame } from '../core/aim.ts';
import { dominantSide } from '../core/character.ts';
import type { ModelDef, Registry } from '../core/content.ts';
import { CORE_CONTENT_IDS } from '../core/contentIds.ts';
import { CHUNK, type Vec3 } from '../core/coords.ts';
import { actionCycleSeconds, actionOpenSeconds, actionPhaseSeconds, ejectSeconds } from '../core/firearmAction.ts';
import { firearmAttachmentResponse, muzzleLoad, wearFirearmAttachments } from '../core/firearmAttachments.ts';
import type { FirearmCycleState, FirearmState, PendingCase } from '../core/firearmState.ts';
import {
  type FirearmStanceEffects,
  type FirearmsCombatTuning,
  type FirearmsSkillShotKind,
  type FirearmsSkillZeroHandling,
  firearmStanceEffects,
  firearmsSkillEffects,
  skillZeroHandlingForFirearm,
} from '../core/firearmsSkill.ts';
import type { HandlingQueue, Job } from '../core/handling.ts';
import { heldEjectionPose, heldGripOffset, modelToView } from '../core/heldPose.ts';
import { dropSpots, type Inventory } from '../core/inventory.ts';
import { defOf, type Item } from '../core/items.ts';
import { settleOnWorld } from '../core/itemThrow.ts';
import { magazineFits, magazineSpec, magazineWellCalibre } from '../core/magazine.ts';
import { PLAYER_VIEW_FOV_DEGREES } from '../core/opticWindow.ts';
import { type dropTarget, playerPockets, stowTarget } from '../core/options.ts';
import { coneDirection, type PelletShot, pelletShotFromBasis, projectileShot } from '../core/pellets.ts';
import { Rng } from '../core/random.ts';
import { raycast, type SolidAt } from '../core/raycast.ts';
import { revolverChamberPoint } from '../core/revolverPose.ts';
import { makeScale } from '../core/scale.ts';
import type { SoundId } from '../core/soundEvents.ts';
import { firearmBoreRay } from './firearmAim.ts';
import { MAGAZINE_LOAD_ACTION } from './magazineHandling.ts';
import { type RevolverFrame, RevolverHandling } from './revolverHandling.ts';

/** Gameplay estimates for transient ballistics, not claimed as measured export data. */
const CASE_SPEED = 3.5;
const CASE_FLIGHT_SECONDS = 0.48;
/** A landed case rests this far above its settled voxel surface, so it never z-fights the floor. */
export const CASE_LANDING_LIFT = 0.006;
const COCK_ACTION = 'firearm.cock';
const LOAD_ACTION = 'firearm.load';
const MAGAZINE_ACTION = 'firearm.magazine';
const STRIP_ACTION = 'firearm.strip';
const TRAINING_ACTIONS: ReadonlySet<string> = new Set([
  COCK_ACTION,
  LOAD_ACTION,
  MAGAZINE_ACTION,
  STRIP_ACTION,
  MAGAZINE_LOAD_ACTION,
]);
export const isFirearmTrainingAction = (job: Job): boolean =>
  job.kind === 'action' && (TRAINING_ACTIONS.has(job.jobType) || job.jobType.startsWith('revolver.'));
/**
 * A magazine change is two halves, each its own content time: taking the fitted magazine out and stowing it, then
 * drawing one and seating it. A removal or an insert into an empty gun takes only its half (`DESIGN.md`, "Combat and
 * noise", rifles). The skill's reload factor shortens both.
 */
const magazineTimes = (gun: Item, registry: Registry): { removeSimSeconds: number; insertSimSeconds: number } =>
  defOf(registry, gun.type).firearm!.handling.magazine!;

/** The share of a magazine job spent taking the fitted one out, so presentation can play remove, then insert. */
const magazineRemoveShare = (
  times: { removeSimSeconds: number; insertSimSeconds: number },
  removing: boolean,
  inserting: boolean,
): number => {
  if (!removing) {
    return 0;
  }
  return inserting ? times.removeSimSeconds / (times.removeSimSeconds + times.insertSimSeconds) : 1;
};

const unit = (vector: Vec3): Vec3 => {
  const length = Math.hypot(...vector);
  if (!(length > 0 && Number.isFinite(length))) {
    throw new Error('Invalid firearm pose direction');
  }
  return vector.map((value) => value / length) as Vec3;
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

type Action = NonNullable<NonNullable<ModelDef['gun']>['action']>;
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
  if (model?.gun?.revolver && model.gun.calibre && model.grip && model.anchors?.muzzle) {
    return undefined;
  }
  if (!(model?.gun?.calibre && model.gun.action?.hand && model.grip && model.anchors?.ejection)) {
    return 'No exported action data for this gun';
  }
  return mode === 'fire' && !(model.gun.action.fire && model.gun.action.roundsPerSimMinute)
    ? 'No exported automatic action data for this gun'
    : undefined;
};

export const firearmHandlingFor = (item: Item, registry: Registry): FirearmHandlingData => {
  const reason = exportedActionReason(item, registry, 'hand');
  if (reason) {
    throw new Error(reason);
  }
  const model = firearmModelFor(item, registry)!;
  const action = model.gun!.action!;
  const [caseModelId] = [...registry.models.values()]
    .filter((candidate) => candidate.gun?.calibre === model.gun?.calibre && candidate.id.startsWith('case_'))
    .map((candidate) => candidate.id)
    .sort();
  return {
    model,
    action,
    calibre: model.gun!.calibre!,
    roundsPerSimSecond: action?.roundsPerSimMinute,
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
  readonly origin: Vec3;
  readonly directions: readonly Vec3[];
}

export interface FirearmShotEffect {
  readonly origin: Vec3;
  readonly direction: Vec3;
  readonly speed: number;
  readonly verticalDrop?: true;
  readonly seed: number;
  readonly landingPosition: Vec3;
  readonly startedAtSimSeconds: number;
  readonly landingAt: number;
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
  readonly shotOrigin: Vec3;
  readonly shotBasis: AimBasis;
  readonly shotKey: string;
  readonly seed: number;
}
export interface FirearmCycleFrame {
  readonly uid: number;
  readonly mode: 'fire' | 'hand' | 'load' | 'magazine' | 'revolver';
  readonly revolver?: RevolverFrame;
  readonly elapsed: number;
  readonly duration?: number;
  readonly roundType?: string;
  readonly actionOpen?: boolean;
  /** A magazine job: the share of it spent taking the fitted magazine out, and the model of the one going in. */
  readonly magazine?: { readonly removeShare: number; readonly incoming?: string };
}

interface EjectedCasePlacement {
  readonly item: Item;
  readonly instanceIndex: number;
}

interface CaseLanding {
  readonly position: Vec3;
  readonly direction: Vec3;
  readonly speed: number;
  readonly verticalDrop: boolean;
}

export class FirearmMechanics {
  /** Numeric ownership references only. Chamber/cycle data lives on the inventory item. */
  private readonly active = new Set<number>();
  private observedAtSimSeconds = 0;
  private readonly raising = new Set<number>();
  private readonly inventory: Inventory;
  private readonly queue: HandlingQueue;
  private readonly blockSize: number;
  private readonly isSolid: SolidAt;
  private readonly pose: (uid: number) => FirearmPoseInput | undefined;
  private readonly onEjection: (effect: FirearmShotEffect) => void;
  private readonly onCaseLanded: (seed: number, item: Item, instanceIndex: number) => void;
  /** Simulation: resolves the shot's hits. It runs before `onTrajectory`, which is presentation only. */
  private readonly onShot: (shot: PelletShot, time: number, firearm: Item) => void;
  private readonly onTrajectory: (trajectory: FirearmTrajectory, time: number) => void;
  private readonly onSound: (event: SoundId, position: Vec3 | undefined, time: number) => void;
  private readonly onCommittedShot: (
    seed: number,
    recoilKickRadians: number,
    shotKind: FirearmsSkillShotKind,
    firearmUid: number,
  ) => void;
  private readonly firearmsSkillLevel: () => number;
  private readonly firearmsSkillZeroHandling: () => FirearmsSkillZeroHandling;
  private readonly handlingSlowdown: () => number;
  private readonly firearmsCombatTuning: FirearmsCombatTuning | undefined;
  private readonly firearmsSkillZeroOverrides = new Map<string, FirearmsSkillZeroHandling>();
  private readonly previousShotAt = new Map<number, number>();
  private readonly revolvers: RevolverHandling;
  private readonly text: ActionText;
  private committingPull = false;

  constructor(
    inventory: Inventory,
    queue: HandlingQueue,
    {
      blockSize,
      isSolid,
      pose,
      onEjection,
      onCaseLanded = () => undefined,
      onShot = () => undefined,
      onTrajectory = () => undefined,
      onSound = () => undefined,
      onCommittedShot = () => undefined,
      firearmsSkillLevel = () => 0,
      firearmsSkillZeroHandling,
      handlingSlowdown = () => 1,
    }: {
      blockSize: number;
      isSolid?: SolidAt;
      pose: (uid: number) => FirearmPoseInput | undefined;
      onEjection: (effect: FirearmShotEffect) => void;
      onCaseLanded?: (seed: number, item: Item, instanceIndex: number) => void;
      onShot?: (shot: PelletShot, time: number, firearm: Item) => void;
      onTrajectory?: (trajectory: FirearmTrajectory, time: number) => void;
      onSound?: (event: SoundId, position: Vec3 | undefined, time: number) => void;
      onCommittedShot?: (
        seed: number,
        recoilKickRadians: number,
        shotKind: FirearmsSkillShotKind,
        firearmUid: number,
      ) => void;
      firearmsSkillLevel?: () => number;
      firearmsSkillZeroHandling?: () => FirearmsSkillZeroHandling;
      /** What the body multiplies hand loading and racking times by (`DESIGN.md`, "Pain"). */
      handlingSlowdown?: () => number;
    },
  ) {
    this.inventory = inventory;
    this.queue = queue;
    this.text = actionText(inventory.registry);
    this.blockSize = blockSize;
    this.isSolid = isSolid ?? (() => false);
    this.pose = pose;
    this.onEjection = onEjection;
    this.onCaseLanded = onCaseLanded;
    this.onShot = onShot;
    this.onTrajectory = onTrajectory;
    this.onSound = onSound;
    this.onCommittedShot = onCommittedShot;
    this.firearmsSkillLevel = firearmsSkillLevel;
    this.handlingSlowdown = handlingSlowdown;
    this.firearmsCombatTuning = inventory.registry.skills.get(CORE_CONTENT_IDS.firearmsCombat)?.combat?.firearms;
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
      if (item.firearm?.cycle || item.firearm?.landings?.length) {
        this.active.add(item.uid);
      }
      if (item.firearm?.readying) {
        this.raising.add(item.uid);
      }
    }
    this.revolvers = new RevolverHandling(inventory, queue, {
      factor: () => this.handlingFactor('reloadDuration'),
      sound: (event, time) => this.onSound(event, undefined, time),
      eject: (gun, chamber, type, time) => this.ejectRevolver(gun, chamber, type, time),
      caseType: (gun) => spentCaseItemId(firearmHandlingFor(gun, inventory.registry).calibre),
    });
    queue.registerAction(COCK_ACTION, (params): string | undefined => {
      const item = typeof params.uid === 'number' ? inventory.itemByUid(params.uid) : undefined;
      if (!(item && this.held(item.uid)) || item.firearm?.cycle?.mode !== 'hand') {
        return this.text.common.notHeld;
      }
      return this.advanceCycle(
        item,
        item.firearm.cycle.duration ?? actionCycleSeconds(firearmHandlingFor(item, inventory.registry).action, 'hand'),
      );
    });
    queue.registerAction(LOAD_ACTION, (params): string | undefined => {
      const gun = typeof params.uid === 'number' ? inventory.itemByUid(params.uid) : undefined;
      const ammo = typeof params.ammoUid === 'number' ? inventory.itemByUid(params.ammoUid) : undefined;
      if (!(gun && this.held(gun.uid))) {
        return this.text.common.notHeld;
      }
      if (!ammo) {
        return this.text.loading.roundsNotCarried;
      }
      const reason = this.loadReason(ammo, true);
      if (reason) {
        return reason;
      }
      if (!inventory.consume(ammo, 1)) {
        return this.text.loading.roundsNotCarried;
      }
      gun.firearm!.tube!.push(ammo.type);
      return undefined;
    });
    queue.registerAction(MAGAZINE_ACTION, (params) => this.completeMagazineChange(params.uid, params.magazineUid));
    queue.registerAction(STRIP_ACTION, (params): string | undefined => {
      const gun = typeof params.uid === 'number' ? inventory.itemByUid(params.uid) : undefined;
      const type = gun?.firearm?.retainedRoundType ?? gun?.firearm?.tube?.[0];
      if (!(gun && type && this.held(gun.uid) && gun.firearm?.actionOpen)) {
        return this.text.loading.cantReachRound;
      }
      const round = inventory.create(type);
      const destination = playerPockets(inventory).find(
        ({ owner, pocket }) => inventory.planAdd(round, { kind: 'pocket', owner, pocket }).ok,
      );
      const placed =
        destination &&
        inventory.add(round, {
          kind: 'pocket',
          owner: destination.owner,
          pocket: destination.pocket,
        });
      if (!placed) {
        return this.text.loading.noRoomForRound;
      }
      if (gun.firearm.retainedRoundType) {
        gun.firearm.retainedRoundType = undefined;
      } else {
        gun.firearm.tube!.shift();
      }
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
    const { firearm } = this.text;
    const item = this.inventory.itemByUid(uid);
    if (!item) {
      return this.text.common.notHeld;
    }
    if (item.firearm?.cylinder) {
      return item.firearm.cylinder.open ? firearm.cylinderOpen : undefined;
    }
    const pump = this.isIntegral(item);
    const reason = exportedActionReason(item, this.inventory.registry, pump ? 'hand' : 'fire');
    if (reason) {
      return reason;
    }
    if (pump && !firearmHandlingFor(item, this.inventory.registry).model.gun?.internalMagazine) {
      return 'No exported internal magazine data for this gun';
    }
    // Automatic motion will feed before the next cadence deadline. fire() rejects overlapping cycles;
    // only an idle empty chamber is a persistent refusal that should stop that cadence.
    const state = item.firearm;
    if (state?.actionOpen) {
      return firearm.boltOpen;
    }
    if (state?.cycle || state?.chamber === 'round') {
      return;
    }
    return state?.chamber === 'case' ? firearm.chamberSpent : firearm.chamberEmpty;
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
        duration: this.stanceEffectsFor(uid).raiseDurationSimSeconds,
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

  skillZeroHandlingSettingFor(uid: number): FirearmsSkillZeroHandling {
    const item = this.inventory.itemByUid(uid);
    if (!item) {
      return this.firearmsSkillZeroHandling();
    }
    const override = this.firearmsSkillZeroOverrides.get(item.type);
    const { firearm } = defOf(this.inventory.registry, item.type);
    return override ?? skillZeroHandlingForFirearm(firearm?.skillZeroHandling, this.firearmsSkillZeroHandling());
  }

  skillZeroHandlingFor(uid: number): FirearmsSkillZeroHandling {
    const item = this.inventory.itemByUid(uid);
    if (!item) {
      return this.firearmsSkillZeroHandling();
    }
    const source = this.skillZeroHandlingSettingFor(uid);
    const response = firearmAttachmentResponse(this.inventory.registry, item);
    const loadScale = this.muzzleLoadScale(item);
    return {
      singleShot: {
        ...source.singleShot,
        variance: source.singleShot.variance * loadScale * response.swayScale,
        recoilRecoveryScale: (source.singleShot.recoilRecoveryScale * response.recoveryScale) / loadScale,
      },
      automaticFollowup: {
        ...source.automaticFollowup,
        variance: source.automaticFollowup.variance * loadScale * response.swayScale,
        recoilRecoveryScale: (source.automaticFollowup.recoilRecoveryScale * response.recoveryScale) / loadScale,
      },
    };
  }

  /** Attachment load slows raising and ready movement using the same per-firearm mass moment. */
  stanceEffectsFor(uid: number): FirearmStanceEffects {
    const item = this.inventory.itemByUid(uid);
    const stance = firearmStanceEffects(this.firearmsSkillLevel(), this.requiredFirearmsCombatTuning());
    if (!item) {
      return stance;
    }
    const loadScale = this.muzzleLoadScale(item);
    const response = firearmAttachmentResponse(this.inventory.registry, item);
    return {
      raiseDurationSimSeconds: stance.raiseDurationSimSeconds * loadScale * response.raiseScale,
      readyMovementFactor: (stance.readyMovementFactor * response.swingScale) / loadScale,
    };
  }

  recoilScaleFor(uid: number): number {
    const item = this.inventory.itemByUid(uid);
    return item ? firearmAttachmentResponse(this.inventory.registry, item).recoilScale : 1;
  }

  noiseFactorFor(item: Item): number {
    return firearmAttachmentResponse(this.inventory.registry, item).noiseFactor;
  }

  private muzzleLoadScale(item: Item): number {
    // One kg·m is the reference moment; missing exported mass leaves the existing handling unchanged.
    return 1 + (muzzleLoad(this.inventory.registry, item) ?? 0);
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

  private canPull(input: FirearmShotInput): boolean {
    return input.ready && !input.sprinting && this.held(input.item.uid) && (!this.queue.busy || this.committingPull);
  }

  fire(input: FirearmShotInput): boolean {
    const pump = this.isIntegral(input.item);
    if (!this.canPull(input)) {
      return false;
    }
    // Advancing to the exact deadline also handles a coarse input sample containing several shots.
    this.advanceTo(input.simTime);
    const item = this.inventory.itemByUid(input.item.uid)!;
    if (!defOf(this.inventory.registry, item.type).firearm || item.firearm?.cycle) {
      return false;
    }
    if (this.fireReason(item.uid)) {
      this.dryFire(item, input.simTime);
      return false;
    }
    const data = firearmHandlingFor(item, this.inventory.registry);
    const cylinder = item.firearm?.cylinder;
    if (cylinder && !this.committingPull) {
      const deferred = this.deferRevolverPull(input, item);
      if (deferred !== undefined) {
        return deferred;
      }
    }
    if (!hasTraceProperties(data)) {
      return false;
    }
    const emission = cylinder
      ? { origin: input.eye, direction: [0, -1, 0] as Vec3, feet: input.feet }
      : this.emission(item, data, input);
    const side = this.inventory.hands.right?.uid === item.uid ? 'right' : 'left';
    const tuning = this.requiredFirearmsCombatTuning();
    const bore = firearmBoreRay({
      model: data.model,
      eye: input.eye,
      yaw: input.yaw,
      pitch: input.pitch,
      blockSize: this.blockSize,
      side,
      leadingSide: dominantSide(this.inventory.character),
      twoHanded: Boolean(defOf(this.inventory.registry, item.type).twoHanded),
      aimFrame: input.aimFrame,
      aimingDownSights: input.aimingDownSights ?? false,
      loweredPitchRadians: tuning.loweredPitchRadians,
      adsApertureFill: tuning.adsApertureFill,
      verticalFovDegrees: PLAYER_VIEW_FOV_DEGREES,
      isSolid: this.isSolid,
    });
    const { origin: shotOrigin, muzzle, direction, up } = bore;
    const shotBasis = basisAlong(direction, up);
    const shotKey = `${item.uid}:${input.simTime}:${input.feet.join(',')}`;
    const seed = Math.floor(Rng.stream(input.seed, `firearm-case:${shotKey}`).next() * 4_294_967_296) >>> 0;
    const commit = { input, item, data, emission, muzzle, shotOrigin, shotBasis, shotKey, seed };
    if (cylinder) {
      return this.commitRevolverShot(commit);
    }
    return pump ? this.commitPumpShot(commit) : this.commitBallisticShot(commit);
  }

  /** The hammer or striker falls only on a closed action; the revolver clicks through its own cylinder rules. */
  private dryFire(item: Item, time: number): void {
    const state = item.firearm;
    if (state && !state.cylinder && !state.actionOpen && state.chamber !== 'round') {
      this.dropHammer(item, time);
    }
  }

  /** A down hammer stays silent until the action is worked, unless the gun's own trigger pull re-cocks it. */
  private dropHammer(item: Item, time: number): void {
    const firearm = defOf(this.inventory.registry, item.type).firearm!;
    const state = item.firearm!;
    if (state.hammerDown) {
      return;
    }
    if (firearm.dryFireSound !== undefined) {
      this.onSound(firearm.dryFireSound, undefined, time);
    }
    if (!firearm.triggerCocks) {
      state.hammerDown = true;
    }
  }

  private deferRevolverPull(input: FirearmShotInput, item: Item): boolean | undefined {
    const tuning = defOf(this.inventory.registry, item.type).firearm!.revolver!;
    const previous = this.previousShotAt.get(item.uid);
    if (previous !== undefined && input.simTime < previous + tuning.recoverySimSeconds) {
      return false;
    }
    if (item.firearm!.cylinder!.cocked) {
      return;
    }
    const strikeAt = input.simTime + tuning.doubleActionPullSimSeconds * this.handlingFactor('reloadDuration');
    this.revolvers.pull(item, input.simTime, () => {
      this.committingPull = true;
      try {
        const strikeInput = { ...input };
        strikeInput.simTime = strikeAt;
        this.fire(strikeInput);
      } finally {
        this.committingPull = false;
      }
    });
    return true;
  }

  private commitRevolverShot({ input, item, data, muzzle, shotOrigin, shotBasis, shotKey, seed }: ShotCommit): boolean {
    const cylinder = item.firearm!.cylinder!;
    const singleAction = cylinder.cocked;
    if (!singleAction) {
      cylinder.aligned = (cylinder.aligned + 1) % cylinder.chambers.length;
    }
    cylinder.cocked = false;
    this.previousShotAt.set(item.uid, input.simTime);
    const chamber = cylinder.chambers[cylinder.aligned]!;
    if (chamber.state !== 'round') {
      this.dropHammer(item, input.simTime);
      return false;
    }
    const ammo = defOf(this.inventory.registry, chamber.roundType).ammo!;
    cylinder.chambers[cylinder.aligned] = { state: 'case' };
    const spread = singleAction
      ? data.dispersionRadians
      : defOf(this.inventory.registry, item.type).firearm!.revolver!.doubleActionDispersionRadians;
    const direction = coneDirection(shotBasis, spread, Rng.stream(input.seed, `firearm-dispersion:${shotKey}`));
    this.onShot(projectileShot(ammo, shotOrigin, [direction]), input.simTime, item);
    this.onTrajectory({ eye: input.eye, muzzle, origin: shotOrigin, directions: [direction] }, input.simTime);
    this.onCommittedShot(seed, data.recoilKickRadians, 'singleShot', item.uid);
    return true;
  }

  private commitPumpShot({
    input,
    item,
    data,
    emission,
    muzzle,
    shotOrigin,
    shotBasis,
    shotKey,
    seed,
  }: ShotCommit): boolean {
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
    // A hand-worked action leaves the hammer where the shot dropped it.
    if (!defOf(this.inventory.registry, item.type).firearm!.triggerCocks) {
      state.hammerDown = true;
    }
    const pellets = this.isPump(item)
      ? pelletShotFromBasis({ ammo, origin: shotOrigin, basis: shotBasis, seed: input.seed, key: shotKey })
      : projectileShot(ammo, shotOrigin, [
          coneDirection(shotBasis, data.dispersionRadians, Rng.stream(input.seed, `firearm-dispersion:${shotKey}`)),
        ]);
    this.onShot(pellets, input.simTime, item);
    this.onTrajectory({ eye: input.eye, muzzle, origin: shotOrigin, directions: pellets.directions }, input.simTime);
    this.onCommittedShot(seed, data.recoilKickRadians, shotKind, item.uid);
    wearFirearmAttachments(this.inventory, item);
    this.previousShotAt.set(item.uid, input.simTime);
    return true;
  }

  private commitBallisticShot({
    input,
    item,
    data,
    emission,
    muzzle,
    shotOrigin,
    shotBasis,
    shotKey,
    seed,
  }: ShotCommit): boolean {
    const roundType = item.firearm?.roundType;
    const ammo = roundType && defOf(this.inventory.registry, roundType).ammo;
    if (!(roundType && ammo && ammoMatchesCalibre(roundType, data.calibre, this.inventory.registry))) {
      return false;
    }
    const shotKind = this.handlingShotKind(item.uid, input.simTime);
    item.firearm = {
      chamber: 'case',
      ...(item.firearm?.readying === undefined ? {} : { readying: item.firearm.readying }),
      ...(item.firearm?.landings === undefined ? {} : { landings: item.firearm.landings }),
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
    this.onShot(projectileShot(ammo, shotOrigin, [direction]), input.simTime, item);
    this.onTrajectory({ eye: input.eye, muzzle, origin: shotOrigin, directions: [direction] }, input.simTime);
    this.onCommittedShot(seed, data.recoilKickRadians, shotKind, item.uid);
    wearFirearmAttachments(this.inventory, item);
    this.previousShotAt.set(item.uid, input.simTime);
    return true;
  }

  /** Read-only admission policy for manual cocking. */
  cockReason(uid: number): string | undefined {
    const item = this.inventory.itemByUid(uid);
    if (!(item && this.held(uid))) {
      return this.text.common.notHeld;
    }
    if (this.queue.busy || item.firearm?.cycle) {
      return this.text.common.busy;
    }
    const reason = exportedActionReason(item, this.inventory.registry, 'hand');
    if (reason) {
      return reason;
    }
    const state = item.firearm;
    if (state?.cylinder) {
      return undefined;
    }
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
    // Case capacity must never jam a charge; the landing-time placement can spill or discard it.
    return undefined;
  }

  private isPump(item: Item): boolean {
    return defOf(this.inventory.registry, item.type).firearm?.pump === true;
  }

  private isBolt(item: Item): boolean {
    return defOf(this.inventory.registry, item.type).firearm?.bolt === true;
  }

  private isIntegral(item: Item): boolean {
    return this.isPump(item) || this.isBolt(item);
  }

  private heldPump(): Item | undefined {
    return Object.values(this.inventory.hands).find((item) => item && this.isIntegral(item));
  }

  unloadsByRacking(uid: number): boolean {
    const gun = this.inventory.itemByUid(uid);
    return gun !== undefined && this.isPump(gun);
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
    return (
      Object.values(this.inventory.hands).find((item) => item?.firearm?.cylinder) ??
      this.heldPump() ??
      this.heldMagazineFed()
    )?.uid;
  }

  /** A magazine change takes one press; integral magazines load one round per hold step. */
  reloadsInOneAction(uid: number): boolean {
    return this.heldMagazineFed()?.uid === uid;
  }

  /** Whether a rack would still take something out of the gun: a round or case in the chamber, or tube rounds. */
  stillLoaded(uid: number): boolean {
    const state = this.inventory.itemByUid(uid)?.firearm;
    return (
      state !== undefined &&
      (state.cylinder
        ? state.cylinder.chambers.some((chamber) => chamber.state !== 'empty')
        : state.chamber !== 'empty' || state.retainedRoundType !== undefined || (state.tube?.length ?? 0) > 0)
    );
  }

  /** Loose carried cartridges only; ascending UID makes the source order save-stable. */
  loadNext(uid: number, time: number): string | undefined {
    const revolver = this.inventory.itemByUid(uid);
    if (revolver?.firearm?.cylinder && this.held(uid)) {
      return this.revolvers.load(revolver, time);
    }
    const rifle = this.heldMagazineFed();
    if (rifle?.uid === uid) {
      return this.changeMagazine(rifle, time);
    }
    const gun = this.heldPump();
    if (gun?.uid !== uid) {
      return this.text.common.notHeld;
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
    if (
      !shell ||
      (gun.firearm?.tube?.length ?? 0) >=
        firearmHandlingFor(gun, this.inventory.registry).model.gun!.internalMagazine!.capacity
    ) {
      if (this.isBolt(gun) && gun.firearm?.actionOpen) {
        this.cock(gun.uid, time);
      }
      return shell ? this.text.loading.full : this.text.loading.noRounds;
    }
    return this.load(shell, time);
  }

  releaseLoad(uid: number, time: number): void {
    if (this.inventory.itemByUid(uid)?.firearm?.cylinder) {
      this.revolvers.release(uid, time);
    } else {
      this.cancelLoad(uid);
    }
  }

  cancelLoad(uid: number): void {
    this.revolvers.cancel(uid);
    const job = this.queue.jobs.find(
      (entry) => entry.kind === 'action' && entry.jobType === LOAD_ACTION && entry.params.uid === uid,
    );
    const gun = this.inventory.itemByUid(uid);
    if (job) {
      this.queue.cancelJob(job);
      if (gun && this.isBolt(gun) && gun.firearm?.cycle?.phase === 'open') {
        const opening = this.queue.jobs.find(
          (entry) => entry.kind === 'action' && entry.jobType === COCK_ACTION && entry.params.uid === uid,
        );
        if (opening) {
          this.queue.cancelJob(opening);
        }
        gun.firearm.cycle = undefined;
        this.retire(gun);
      }
    } else if (gun && this.isBolt(gun) && gun.firearm?.actionOpen && !gun.firearm.cycle) {
      this.cock(uid, this.observedAtSimSeconds);
    }
  }

  loadReason(ammo: Item, completing = false): string | undefined {
    const { common, loading } = this.text;
    const gun = this.heldPump();
    if (!gun) {
      return common.notHeld;
    }
    if (!(this.inventory.itemByUid(ammo.uid) === ammo && this.carried(ammo))) {
      return loading.roundsNotCarried;
    }
    if ((!completing && this.queue.busy) || gun.firearm?.cycle) {
      return common.busy;
    }
    const reason = exportedActionReason(gun, this.inventory.registry, 'hand');
    if (reason) {
      return reason;
    }
    const data = firearmHandlingFor(gun, this.inventory.registry);
    if (!(data.model.gun?.internalMagazine && data.model.anchors?.loading_port)) {
      return 'No exported loading port or internal magazine';
    }
    if (!ammoMatchesCalibre(ammo.type, data.calibre, this.inventory.registry)) {
      return loading.wrongRounds;
    }
    return (gun.firearm?.tube?.length ?? 0) >= data.model.gun.internalMagazine.capacity ? loading.full : undefined;
  }

  load(ammo: Item, time: number): string | undefined {
    const reason = this.loadReason(ammo);
    if (reason) {
      return reason;
    }
    const gun = this.heldPump()!;
    if (this.isBolt(gun) && !gun.firearm?.actionOpen) {
      this.startHandCycle(gun, time, 'open', true);
    }
    this.queue.enqueueAction(
      LOAD_ACTION,
      fillText(this.text.loading.loadRound, {
        count: (gun.firearm?.tube?.length ?? 0) + 1,
        capacity: firearmHandlingFor(gun, this.inventory.registry).model.gun!.internalMagazine!.capacity,
      }),
      defOf(this.inventory.registry, gun.type).firearm!.roundLoadSimSeconds! * this.handlingFactor('reloadDuration'),
      { uid: gun.uid, ammoUid: ammo.uid },
    );
    this.onSound('shotgun_insert', undefined, time);
    return undefined;
  }

  /**
   * Swaps in the fullest carried magazine that fits (lowest UID on a tie, so the choice is save-stable), whatever
   * the fitted one holds (`CONTROLS.md`, "Reload, rack, remove").
   */
  private changeMagazine(gun: Item, time: number): string | undefined {
    const { common, firearm } = this.text;
    if (this.queue.busy || gun.firearm?.cycle) {
      return common.busy;
    }
    const replacement = this.fullestMagazine(gun);
    if (!replacement) {
      return firearm.noMagazine;
    }
    this.enqueueMagazineAction(
      gun,
      gun.slots?.magazine ? firearm.changeMagazine : firearm.insertMagazine,
      time,
      replacement,
    );
    return undefined;
  }

  /** Takes the fitted magazine out to a pocket or the ground: tap, then hold R (`CONTROLS.md`, "Reload, rack, remove"). */
  removeMagazine(uid: number, time: number): string | undefined {
    const revolver = this.inventory.itemByUid(uid);
    if (revolver?.firearm?.cylinder && this.held(uid)) {
      return this.revolvers.dump(revolver, time);
    }
    const integral = this.heldPump();
    if (integral?.uid === uid && this.isBolt(integral)) {
      return this.stripBolt(integral, time);
    }
    const { common, firearm } = this.text;
    const gun = this.heldMagazineFed();
    if (gun?.uid !== uid) {
      return firearm.takesNoMagazine;
    }
    if (this.queue.busy || gun.firearm?.cycle) {
      return common.busy;
    }
    if (!gun.slots?.magazine) {
      return firearm.noMagazineFitted;
    }
    this.enqueueMagazineAction(gun, firearm.removeMagazine, time);
    return undefined;
  }

  private stripBolt(gun: Item, time: number): string | undefined {
    if (this.queue.busy || gun.firearm?.cycle) {
      return this.text.common.busy;
    }
    if (!gun.firearm?.actionOpen) {
      this.startHandCycle(gun, time, 'open');
    }
    const { retainedRoundType, tube } = gun.firearm!;
    for (const type of [...(retainedRoundType ? [retainedRoundType] : []), ...tube!]) {
      this.queue.enqueueAction(
        STRIP_ACTION,
        this.text.loading.removeRound,
        defOf(this.inventory.registry, type).ammo!.stripSimSeconds * this.handlingFactor('reloadDuration'),
        { uid: gun.uid },
      );
    }
    return undefined;
  }

  /** Skill's factor on a hand-handling time, lengthened by what the body does to the hands. */
  private handlingFactor(kind: 'reloadDuration' | 'rackDuration'): number {
    return (
      firearmsSkillEffects(this.firearmsSkillLevel(), this.requiredFirearmsCombatTuning())[kind] *
      this.handlingSlowdown()
    );
  }

  /** A change names its replacement; a removal names none. Each half it does takes its own time. */
  private enqueueMagazineAction(gun: Item, label: string, time: number, replacement?: Item): void {
    const times = magazineTimes(gun, this.inventory.registry);
    const seconds = (gun.slots?.magazine ? times.removeSimSeconds : 0) + (replacement ? times.insertSimSeconds : 0);
    this.queue.enqueueAction(
      MAGAZINE_ACTION,
      label,
      seconds * this.handlingFactor('reloadDuration'),
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
    const { firearm } = this.text;
    const gun = typeof uid === 'number' ? this.inventory.itemByUid(uid) : undefined;
    if (!(gun?.slots && this.held(gun.uid))) {
      return this.text.common.notHeld;
    }
    if (magazineUid === undefined) {
      return this.completeMagazineRemoval(gun);
    }
    const replacement = this.carriedFitting(gun, magazineUid);
    if (!replacement) {
      return firearm.magazineGone;
    }
    const back = this.inventory.targetForLocation(this.inventory.locate(replacement)!);
    if (!this.inventory.consume(replacement, replacement.count)) {
      return firearm.magazineGone;
    }
    const removed = this.inventory.fitSlot(gun, 'magazine', replacement);
    if (removed && !this.stow(gun, removed)) {
      this.inventory.fitSlot(gun, 'magazine', removed);
      if (!(this.inventory.add(replacement, back) || this.stow(gun, replacement))) {
        throw new Error('Undoing a magazine change lost the replacement magazine');
      }
      return firearm.noRoomForMagazine;
    }
    return undefined;
  }

  /** Stows the fitted magazine; with nowhere to put it, it stays fitted. */
  private completeMagazineRemoval(gun: Item): string | undefined {
    const removed = this.inventory.fitSlot(gun, 'magazine', undefined);
    if (!removed) {
      return this.text.firearm.noMagazineFitted;
    }
    if (!this.stow(gun, removed)) {
      this.inventory.fitSlot(gun, 'magazine', removed);
      return this.text.firearm.noRoomForMagazine;
    }
    return undefined;
  }

  private carriedFitting(gun: Item, uid: unknown): Item | undefined {
    const magazine = typeof uid === 'number' ? this.inventory.itemByUid(uid) : undefined;
    return magazine && this.carried(magazine) && magazineFits(this.inventory.registry, gun.type, magazine.type)
      ? magazine
      : undefined;
  }

  /** Puts an ejected item in its supported landing pile, with the bounded spill search as fallback. */
  private stow(gun: Item, item: Item): boolean {
    const feet = this.pose(gun.uid)?.feet;
    const target = feet && stowTarget(this.inventory, item, feet);
    return Boolean(target && this.inventory.add(item, target));
  }

  describe(item: Item): string[] {
    const text = this.text.firearm;
    const cylinder = item.firearm?.cylinder;
    if (cylinder) {
      const loaded = cylinder.chambers.filter((chamber) => chamber.state === 'round').length;
      return [
        fillText(cylinder.open ? text.openCylinderDetail : text.cylinderDetail, {
          loaded,
          chambers: cylinder.chambers.length,
        }),
      ];
    }
    if (magazineWellCalibre(this.inventory.registry, item.type) !== undefined) {
      const magazine = item.slots?.magazine;
      const spec = magazine && magazineSpec(this.inventory.registry, magazine.type);
      return [
        fillText(text.chamberDetail, { contents: this.chamberWords(item, text.spentCase) }),
        spec
          ? fillText(text.magazineDetail, { count: magazine.cartridges!.length, capacity: spec.capacity })
          : text.noMagazineDetail,
      ];
    }
    if (!this.isIntegral(item)) {
      return [];
    }
    const { capacity } = firearmHandlingFor(item, this.inventory.registry).model.gun!.internalMagazine!;
    if (this.isBolt(item)) {
      return [
        item.firearm?.actionOpen ? text.boltOpenDetail : text.boltClosedDetail,
        fillText(text.chamberDetail, { contents: this.chamberWords(item, text.spentCase) }),
        ...(item.firearm?.retainedRoundType
          ? [
              fillText(text.retainedRoundDetail, {
                round: defOf(this.inventory.registry, item.firearm.retainedRoundType).name,
              }),
            ]
          : []),
        fillText(text.magazineDetail, { count: item.firearm?.tube?.length ?? 0, capacity }),
      ];
    }
    return [
      fillText(text.chamberDetail, { contents: this.chamberWords(item, text.firedHull) }),
      fillText(text.tubeDetail, { count: item.firearm!.tube!.length, capacity }),
    ];
  }

  /** What the chamber holds; `spent` names a fired case in this kind of gun. */
  private chamberWords(item: Item, spent: string): string {
    const state = item.firearm;
    if (state?.chamber === 'round') {
      return defOf(this.inventory.registry, state.roundType!).name;
    }
    return state?.chamber === 'case' ? spent : this.text.firearm.emptyChamber;
  }

  cock(uid: number, time: number): string | undefined {
    const reason = this.cockReason(uid);
    if (reason) {
      return reason;
    }
    const item = this.inventory.itemByUid(uid)!;
    if (item.firearm?.cylinder) {
      item.firearm.hammerDown = undefined;
      return this.revolvers.cock(item, time);
    }
    this.startHandCycle(item, time, this.isBolt(item) && item.firearm?.actionOpen ? 'close' : undefined);
    return undefined;
  }

  private startHandCycle(item: Item, time: number, phase?: 'open' | 'close', preserveRound = false): void {
    const { uid } = item;
    const data = firearmHandlingFor(item, this.inventory.registry);
    const pump = this.isPump(item);
    const state: FirearmState = item.firearm ?? { chamber: 'empty' };
    state.hammerDown = undefined;
    const baseDuration = actionPhaseSeconds(data.action, 'hand', phase);
    const duration = baseDuration * this.handlingFactor('rackDuration');
    state.cycle = {
      mode: 'hand',
      startedAt: time,
      elapsed: 0,
      duration,
      ejected: phase === 'close',
      ...(phase ? { phase } : {}),
      ...(preserveRound ? { preserveRound } : {}),
    };
    item.firearm = state;
    this.active.add(uid);
    this.queue.enqueueAction(
      COCK_ACTION,
      fillText(pump ? this.text.firearm.rack : this.text.firearm.charge, {
        gun: defOf(this.inventory.registry, item.type).name,
      }),
      duration,
      { uid },
    );
    const firearm = defOf(this.inventory.registry, item.type).firearm!;
    const boltSound = phase === 'close' ? firearm.boltCloseSound : firearm.boltOpenSound;
    this.onSound(boltSound ?? (pump ? 'shotgun_rack_back' : 'rifle_charge'), undefined, time);
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
    this.observedAtSimSeconds = time;
    this.revolvers.advance();
    this.revolvers.cancelUnheld();
    for (const uid of this.active) {
      this.advanceItem(uid, time);
    }
  }

  private advanceItem(uid: number, time: number): void {
    const item = this.inventory.itemByUid(uid);
    if (item) {
      this.advanceLandings(item, time);
    }
    const cycle = item?.firearm?.cycle;
    if (!(item && cycle)) {
      if (!item?.firearm?.landings?.length) {
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

  private advanceLandings(item: Item, time: number): void {
    const landings = item.firearm?.landings;
    if (!landings) {
      return;
    }
    const pending: NonNullable<FirearmState['landings']> = [];
    for (const landing of landings) {
      if (time + 1e-9 < landing.at) {
        pending.push(landing);
        continue;
      }
      const placement = this.placeEjected(landing.type, landing.position);
      if (placement && typeof placement !== 'string') {
        this.onCaseLanded(landing.seed, placement.item, placement.instanceIndex);
      }
      const spentPumpCase =
        this.isPump(item) &&
        landing.type === spentCaseItemId(firearmHandlingFor(item, this.inventory.registry).calibre);
      if (spentPumpCase) {
        this.onSound('shotgun_hull_drop', landing.position, landing.at);
      }
    }
    item.firearm!.landings = pending.length > 0 ? pending : undefined;
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
    if (!item.firearm?.landings?.length) {
      this.active.delete(item.uid);
    }
  }

  /** A queued magazine job's motion: the fitted magazine still holds its slot until the job completes. */
  private magazineMotion(gun: Item, magazineUid: unknown): NonNullable<FirearmCycleFrame['magazine']> {
    const incoming = typeof magazineUid === 'number' ? this.inventory.itemByUid(magazineUid) : undefined;
    const model = incoming && defOf(this.inventory.registry, incoming.type).model;
    return {
      removeShare: magazineRemoveShare(
        magazineTimes(gun, this.inventory.registry),
        gun.slots?.magazine !== undefined,
        incoming !== undefined,
      ),
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
        return [this.actionFrame(item, cycle)];
      }
      if (item?.firearm?.actionOpen) {
        const job = this.jobFrame(item);
        if (job.length > 0) {
          return job;
        }
        return [this.actionFrame(item)];
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
    const clock = {
      uid: gun.uid,
      elapsed: job.elapsed,
      duration: job.duration,
      actionOpen: gun.firearm?.actionOpen ?? false,
    };
    if (job.jobType.startsWith('revolver.')) {
      return [
        {
          ...clock,
          mode: 'revolver',
          revolver: {
            step: job.jobType.slice('revolver.'.length) as RevolverFrame['step'],
            ...(typeof job.params.chamber === 'number' ? { chamber: job.params.chamber } : {}),
          },
          ...(typeof job.params.ammoUid === 'number' && this.inventory.itemByUid(job.params.ammoUid)
            ? { roundType: this.inventory.itemByUid(job.params.ammoUid)!.type }
            : {}),
        },
      ];
    }
    if (job.jobType === MAGAZINE_ACTION) {
      return [{ ...clock, mode: 'magazine', magazine: this.magazineMotion(gun, job.params.magazineUid) }];
    }
    const ammo =
      job.jobType === LOAD_ACTION && typeof job.params.ammoUid === 'number'
        ? this.inventory.itemByUid(job.params.ammoUid)
        : undefined;
    return ammo ? [{ ...clock, mode: 'load', roundType: ammo.type }] : [];
  }

  private actionFrame(item: Item, cycle?: FirearmCycleState): FirearmCycleFrame {
    const { action } = firearmHandlingFor(item, this.inventory.registry);
    const mode = cycle?.mode ?? 'hand';
    const full = actionCycleSeconds(action, mode);
    const base = actionPhaseSeconds(action, mode, cycle?.phase);
    const scale = (cycle?.duration ?? base) / base;
    const offset = !cycle || cycle.phase === 'close' ? actionOpenSeconds(action) * scale : 0;
    return {
      uid: item.uid,
      mode,
      elapsed: (cycle?.elapsed ?? 0) + offset,
      duration: full * scale,
    };
  }

  private advanceCycle(item: Item, elapsed: number): string | undefined {
    const state = item.firearm!;
    const { cycle } = state;
    if (!cycle) {
      return;
    }
    const data = firearmHandlingFor(item, this.inventory.registry);
    const duration = cycle.duration ?? actionCycleSeconds(data.action, cycle.mode);
    const base = actionPhaseSeconds(data.action, cycle.mode, cycle.phase);
    const timeScale = duration / base;
    cycle.elapsed = Math.max(cycle.elapsed, elapsed);
    this.returnStrokeCue(item, data, cycle, timeScale);
    if (!cycle.ejected && cycle.elapsed + 1e-9 >= ejectSeconds(data.action, cycle.mode) * timeScale) {
      const reason = this.ejectChamber(item, state, data);
      if (reason) {
        return reason; // Revalidate before clearing ammo; a changed drop cannot lose it.
      }
      cycle.ejected = true;
      if (this.isBolt(item)) {
        state.actionOpen = true;
      }
    }
    if (cycle.elapsed + 1e-9 >= duration) {
      if (cycle.phase !== 'open') {
        this.feed(item, state);
        if (this.isBolt(item)) {
          state.actionOpen = false;
        }
      }
      state.cycle = undefined;
      this.retire(item);
    }
    return undefined;
  }

  /** A full hand cycle's return stroke: the pump's slide forward, or a bolt's close after its open. */
  private returnStrokeCue(item: Item, data: FirearmHandlingData, cycle: FirearmCycleState, timeScale: number): void {
    const pump = this.isPump(item);
    const boltCloseSound =
      cycle.mode === 'hand' && cycle.phase === undefined
        ? defOf(this.inventory.registry, item.type).firearm!.boltCloseSound
        : undefined;
    const sound = pump ? 'shotgun_rack_forward' : boltCloseSound;
    if (sound === undefined || cycle.forwardSounded) {
      return;
    }
    const returnAt =
      (pump ? data.action.hand.rearwardSimSeconds + data.action.hand.dwellSimSeconds : actionOpenSeconds(data.action)) *
      timeScale;
    if (cycle.elapsed + 1e-9 >= returnAt) {
      cycle.forwardSounded = true;
      this.onSound(sound, undefined, cycle.startedAt + returnAt);
    }
  }

  private ejectChamber(item: Item, state: FirearmState, data: FirearmHandlingData): string | undefined {
    if (state.chamber === 'case') {
      return this.ejectCase(item, state, data);
    }
    if (state.chamber === 'round' && state.roundType !== undefined) {
      if (state.cycle?.preserveRound) {
        state.retainedRoundType = state.roundType;
        state.chamber = 'empty';
        state.roundType = undefined;
        return undefined;
      }
      return this.ejectLive(item, state, data);
    }
    state.chamber = 'empty';
    return undefined;
  }

  /** The action closes on the integral or fitted magazine's top round. */
  private feed(item: Item, state: FirearmState): void {
    const source = this.isIntegral(item) ? state.tube : item.slots?.magazine?.cartridges;
    state.roundType = state.retainedRoundType ?? source?.shift();
    state.retainedRoundType = undefined;
    state.chamber = state.roundType ? 'round' : 'empty';
  }

  private emission(item: Item, data: FirearmHandlingData, pose: FirearmPoseInput): Omit<PendingCase, 'seed'> {
    const side = this.inventory.hands.right?.uid === item.uid ? 'right' : 'left';
    const twoHanded = Boolean(defOf(this.inventory.registry, item.type).twoHanded);
    const eye: Vec3 = pose.eye.map((value) => value * pose.blockSize) as Vec3;
    const held = heldEjectionPose({ model: data.model, side, twoHanded, eye, yaw: pose.yaw, pitch: pose.pitch });
    const { origin: portOrigin } = held;
    let origin = portOrigin;
    const originBlocks: Vec3 = origin.map((value) => value / this.blockSize) as Vec3;
    if (this.isSolid(...(originBlocks.map(Math.floor) as Vec3))) {
      const eyeBlocks: Vec3 = [...pose.eye];
      const eyeCell: Vec3 = eyeBlocks.map(Math.floor) as Vec3;
      const towardPort = originBlocks.map((value, axis) => value - eyeBlocks[axis]!) as Vec3;
      const distance = Math.hypot(...towardPort);
      if (distance > 0 && !this.isSolid(...eyeCell)) {
        const direction = towardPort.map((value) => value / distance) as Vec3;
        const hit = raycast(eyeBlocks, direction, distance, this.isSolid);
        if (hit) {
          const lastFreeDistance = Math.max(0, hit.distance - 1e-6);
          origin = eye.map((value, axis) => value + direction[axis]! * lastFreeDistance * this.blockSize) as Vec3;
        }
      }
    }
    return { ...held, origin, feet: [...pose.feet] };
  }

  /**
   * At impact, place the case in its landing pile or the first supported spill spot with room. A metadata-only probe
   * avoids allocating an item UID until a destination is known (`DESIGN.md`, "Spent cases per block").
   */
  private ejectionDrop(type: string, landing: Vec3): ReturnType<typeof dropTarget> {
    const item = { uid: 0, type, count: 1, condition: 1 };
    let first: ReturnType<typeof dropTarget> | undefined;
    for (const pos of dropSpots(landing)) {
      if (this.isSolid(...pos) || !this.isSolid(pos[0], pos[1] - 1, pos[2])) {
        continue;
      }
      const target = { kind: 'pile', pos } as const;
      const candidate = { target, plan: this.inventory.planAdd(item, target) };
      first ??= candidate;
      if (candidate.plan.ok) {
        return candidate;
      }
    }
    return (
      first ?? {
        target: { kind: 'pile', pos: landing },
        plan: { ok: false, reason: 'No supported drop spot' },
      }
    );
  }

  private placeEjected(type: string, landing: Vec3 | undefined): EjectedCasePlacement | string | undefined {
    if (!landing) {
      // No supported outward landing: discard rather than create a floating pile.
      return undefined;
    }
    const drop = this.ejectionDrop(type, landing);
    if (!drop.plan.ok) {
      return drop.plan.reason;
    }
    const item = this.inventory.create(type);
    const placement = this.inventory.planAdd(item, drop.target);
    if (!placement.ok) {
      return placement.reason;
    }
    const landedItem = placement.merge ?? item;
    const instanceIndex = placement.merge?.count ?? 0;
    if (!this.inventory.add(item, drop.target)) {
      return 'Ejection placement changed';
    }
    return { item: landedItem, instanceIndex };
  }

  private ejectLive(item: Item, state: FirearmState, data: FirearmHandlingData): string | undefined {
    const pose = this.pose(item.uid);
    if (!pose) {
      return 'No held ejection pose';
    }
    const emission = this.emission(item, data, pose);
    const type = state.roundType!;
    const landing = this.landing(emission);
    state.chamber = 'empty';
    state.roundType = undefined;
    state.cycle!.ejected = true;
    if (!landing) {
      return undefined;
    }
    const seed = Math.floor(Rng.stream(item.uid, `live-shell:${state.cycle!.startedAt}`).next() * 4_294_967_296) >>> 0;
    const modelId = defOf(this.inventory.registry, type).model;
    const startedAt = this.ejectionAt(state, data);
    state.landings ??= [];
    state.landings.push({
      at: startedAt + CASE_FLIGHT_SECONDS,
      position: [...landing.position],
      type,
      seed,
    });
    this.onEjection({
      origin: emission.origin,
      direction: landing.direction,
      speed: landing.speed,
      ...(landing.verticalDrop ? { verticalDrop: true as const } : {}),
      seed,
      landingPosition: landing.position,
      startedAtSimSeconds: startedAt,
      landingAt: startedAt + CASE_FLIGHT_SECONDS,
      ...(modelId ? { caseModelId: modelId } : {}),
    });
    return undefined;
  }

  private landing(emission: Omit<PendingCase, 'seed'>): CaseLanding | undefined {
    const origin: Vec3 = emission.origin.map((axis) => axis / this.blockSize) as Vec3;
    const distanceBlocks = (CASE_SPEED * CASE_FLIGHT_SECONDS) / this.blockSize;
    const hit = raycast(origin, emission.direction, distanceBlocks, this.isSolid);
    const safeDistance = hit ? Math.max(0, hit.distance - 1e-6) : distanceBlocks;
    const endpoint: Vec3 = origin.map(
      (axis, index) => (axis + emission.direction[index]! * safeDistance) * this.blockSize,
    ) as Vec3;
    const minY = makeScale(this.blockSize).minCy * CHUNK;
    const landingPoint = hit ? emission.origin : endpoint;
    const position = settleOnWorld(landingPoint, this.blockSize, minY, this.isSolid);
    if (!position) {
      return undefined;
    }
    const dropHeight = emission.origin[1] - (position[1] * this.blockSize + CASE_LANDING_LIFT);
    const speed = hit ? Math.max(0, dropHeight / CASE_FLIGHT_SECONDS) : CASE_SPEED;
    return { position, direction: hit ? [0, -1, 0] : emission.direction, speed, verticalDrop: hit !== undefined };
  }

  private ejectRevolver(item: Item, chamber: number, type: string, time: number): void {
    const pose = this.pose(item.uid);
    if (!pose) {
      throw new Error('No held revolver pose');
    }
    const data = firearmHandlingFor(item, this.inventory.registry);
    const { model } = data;
    const cylinder = item.firearm!.cylinder!;
    const point = revolverChamberPoint(model.gun!.revolver!, chamber, cylinder.aligned, 1);
    const local = modelToView(model, point.map((value, index) => value - model.grip!.at[index]!) as Vec3);
    const side = this.inventory.hands.right?.uid === item.uid ? 'right' : 'left';
    const grip = heldGripOffset(side, false);
    const basis = basisAlong(
      [-Math.sin(pose.yaw) * Math.cos(pose.pitch), Math.sin(pose.pitch), -Math.cos(pose.yaw) * Math.cos(pose.pitch)],
      [0, 1, 0],
    );
    const offset = local.map((value, index) => value + grip[index]!) as Vec3;
    const origin = pose.eye.map(
      (value, index) =>
        value * this.blockSize +
        basis.right[index]! * offset[0] +
        basis.up[index]! * offset[1] -
        basis.forward[index]! * offset[2],
    ) as Vec3;
    const emission = { origin, direction: [0, -1, 0] as Vec3, feet: pose.feet };
    const landing = this.landing(emission);
    if (!landing) {
      return;
    }
    const seed = Math.floor(Rng.stream(item.uid, `cylinder:${time}:${chamber}`).next() * 4_294_967_296) >>> 0;
    item.firearm!.landings ??= [];
    item.firearm!.landings.push({ at: time + CASE_FLIGHT_SECONDS, position: landing.position, type, seed });
    this.active.add(item.uid);
    const modelId = defOf(this.inventory.registry, type).model ?? data.caseModelId;
    this.onEjection({
      origin,
      direction: [0, -1, 0],
      speed: landing.speed,
      verticalDrop: true,
      seed,
      landingPosition: landing.position,
      startedAtSimSeconds: time,
      landingAt: time + CASE_FLIGHT_SECONDS,
      ...(modelId ? { caseModelId: modelId } : {}),
    });
  }

  private ejectionAt(state: FirearmState, data: FirearmHandlingData): number {
    const cycle = state.cycle!;
    const duration = cycle.duration ?? actionCycleSeconds(data.action, cycle.mode);
    const base = cycle.phase === 'open' ? actionOpenSeconds(data.action) : actionCycleSeconds(data.action, cycle.mode);
    const timeScale = duration / base;
    return cycle.startedAt + ejectSeconds(data.action, cycle.mode) * timeScale;
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
    state.chamber = 'empty';
    state.pendingCase = undefined;
    // Commit the transition before output: a drawing failure must never double its case.
    state.cycle!.ejected = true;
    if (landing) {
      const startedAt = this.ejectionAt(state, data);
      state.landings ??= [];
      state.landings.push({
        at: startedAt + CASE_FLIGHT_SECONDS,
        position: [...landing.position],
        type,
        seed: pending.seed,
      });
      this.onEjection({
        origin: emission.origin,
        direction: landing.direction,
        speed: landing.speed,
        ...(landing.verticalDrop ? { verticalDrop: true as const } : {}),
        seed: pending.seed,
        landingPosition: landing.position,
        startedAtSimSeconds: startedAt,
        landingAt: startedAt + CASE_FLIGHT_SECONDS,
        ...(data.caseModelId ? { caseModelId: data.caseModelId } : {}),
      });
    }
    return undefined;
  }
}
