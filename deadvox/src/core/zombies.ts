import type { ZombieDef } from './content.ts';
import type { Vec3 } from './coords.ts';
import { type EntityId, type EntityStore, MapEntityStore } from './entities.ts';
import { advanceShamblerFootsteps, initialShamblerFootstepClock, type ShamblerFootstepClock } from './footsteps.ts';
import { type Body, type PhysicsParams, separateBodies, separateBodyPair, stepBody } from './physics.ts';
import { Rng, type RngState } from './random.ts';
import { countSolidRuns, raycast, type SolidAt } from './raycast.ts';
import { freezeSnapshot } from './snapshotData.ts';
import type { SoundEventId } from './soundEvents.ts';
import {
  ZOMBIE_REGION_NAMES,
  type ZombieRegion,
  type ZombieRegions,
  zombieRegionHitDistance,
} from './zombieRegions.ts';

export type PlayerMovement = 'walking' | 'jogging' | 'sprinting' | 'still';
export type ZombieMode = 'idle' | 'stroll' | 'search' | 'chase' | 'investigate' | 'return';

export const FISTS_MELEE = { damage: 8, reach: 0.7, cooldown: 0.8, stamina: 4 } as const;
/** At most these three nearest moving shamblers emit footsteps in a simulation tick. */
export const SHAMBLER_FOOTSTEP_VOICE_CAP = 3;

export interface Zombie {
  type: ZombieDef;
  body: Body;
  facing: Vec3;
  home: Vec3;
  mode: ZombieMode;
  investigationTier?: 'near' | 'far' | undefined;
  /** Per-body behavior stream; draws never perturb another body. */
  behaviorRng: Rng;
  /** Separate seeded stream keeps ambient sound timing from changing movement decisions. */
  soundRng: Rng;
  /** Separate seeded stream (same reasoning as soundRng) keeps dismemberment rolls, which only ever
   * happen on a player's melee hit — an external event, not part of the per-tick AI loop — from shifting
   * the sequence of subsequent behaviorRng-driven decisions. */
  dismemberRng: Rng;
  idleSoundTimer: number;
  lastVocalNoiseId?: number | undefined;
  modeTimer: number;
  searchAnchor?: Vec3 | undefined;
  searchTimer: number;
  searchStrolling: boolean;
  searchHeading: Vec3;
  strollHeading: Vec3;
  horizontalSpeed: number;
  bodyLookTarget: number;
  headYaw: number;
  headYawTarget: number;
  lookTimer: number;
  swayValue: number;
  swayStart: number;
  swayTarget: number;
  swayElapsed: number;
  swayDuration: number;
  lurchValue: number;
  lurchStart: number;
  lurchTarget: number;
  lurchElapsed: number;
  lurchDuration: number;
  stumbleFactor: number;
  stumbleElapsed: number;
  stumbleDuration: number;
  /** Previous fixed-step pose used only by rendering interpolation. */
  renderPrevious: { pos: Vec3; facing: Vec3; headYaw: number; gaitPhase: number };
  regions: ZombieRegions;
  lastPerceived?: Vec3 | undefined;
  attackWait: number;
  /** Seconds left in the current attack's telegraph windup; 0 = not winding up. Set to
   * type.attack.windup when an attack starts (alongside attackWait), counts down to exactly 0, then the
   * hit resolves (hurtPlayer or a miss) if the target is still in reach/LOS. */
  attackWindup: number;
  /** Unwrapped gait phase; advances by π for each travelled stepLength metres. */
  gaitPhase: number;
  /** Surface footfall cadence advances only with grounded travel. */
  footstepClock: ShamblerFootstepClock;
  /** Elapsed wandering time, independent of the distance-driven gait. */
  wanderClock: number;
  /** Part names (mobgen/src/mob/dismember.ts's SEVERABLE_PARTS, e.g. "upperArm.L", "head") severed so
   * far — cumulative, never un-severed. A renderer derives what to hide via mobgen's severedBoneSet, not
   * stored pre-expanded here (severing upperArm.L already implies forearm.L/hand.L without listing them). */
  severed: string[];
}

export type ZombieState = Omit<
  Zombie,
  'type' | 'behaviorRng' | 'soundRng' | 'dismemberRng' | 'renderPrevious' | 'footstepClock' | 'lastVocalNoiseId'
> & {
  type: string;
  behaviorRng: RngState;
  soundRng: RngState;
  dismemberRng: RngState;
  lastVocalNoiseId: number | null;
};

export interface ZombieSystemState {
  playerAttackWait: number;
  nextEntityId: number;
  zombies: { id: number; zombie: ZombieState }[];
}

export interface VocalNoise {
  id: number;
  pos: Vec3;
  radiusMetres: number;
  expiresAt: number;
}

export interface PlayerSense {
  pos: Vec3;
  /** When present, the solid player box used for hard movement collisions. */
  body?: Body | undefined;
  /** Direction the player faces, in the x/z plane. */
  facing: Vec3;
  movement: PlayerMovement;
  lit: boolean;
  lightSeenFrom: number;
  vocalNoise?: VocalNoise | undefined;
}

export interface ZombieSystemOptions {
  store?: EntityStore<Zombie>;
  seed?: number;
  isSolid: SolidAt;
  blockSize: number;
  physics: PhysicsParams;
  /** Take-off speed in metres per second, like `PLAYER.jump`; the system divides by `blockSize` itself. */
  jumpSpeed: number;
  player: () => PlayerSense;
  hour: () => number;
  hurtPlayer: (amount: number) => void;
  /** The id is what a renderer keys its corpse on; the zombie is already out of the store. */
  onDeath?: (id: EntityId, zombie: Zombie) => void;
  /** A region other than the head ran out of health: the game leaves the severed part behind (an item). */
  onSevered?: (zombie: Zombie, region: Exclude<ZombieRegion, 'head'>) => void;
  /** Sound-source position is in block coordinates. */
  onSound?: (event: SoundEventId, position: Vec3) => void;
  /** Called for actual ground-travel footfalls of the nearest three moving shamblers. */
  onFootstep?: (position: Vec3, id: EntityId, mode: ZombieMode) => void;
  /** Called once for every part severed (src/core/zombies.ts's swing — the melee hit path), *after*
   * `zombie.severed` already includes `part`, so a renderer reading zombie.severed at this point sees the
   * new cut too. Fires before onDeath on a killing blow that also severs the head. */
  onSever?: (id: EntityId, zombie: Zombie, part: string) => void;
}

const horizontalDistance = (a: Vec3, b: Vec3): number => Math.hypot(a[0] - b[0], a[2] - b[2]);
const unit = (v: Vec3): Vec3 => {
  const n = Math.hypot(...v);
  return n > 0 ? [v[0] / n, v[1] / n, v[2] / n] : [0, 0, 0];
};
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const copy = (v: Vec3): Vec3 => [v[0], v[1], v[2]];
const angleOf = (v: Vec3): number => Math.atan2(v[0], v[2]);
const headingAt = (angle: number): Vec3 => [Math.sin(angle), 0, Math.cos(angle)];
const wrapAngle = (angle: number): number => Math.atan2(Math.sin(angle), Math.cos(angle));
const approach = (current: number, target: number, amount: number): number =>
  current < target ? Math.min(target, current + amount) : Math.max(target, current - amount);
const smooth01 = (value: number): number => value * value * (3 - 2 * value);
const lerp = (from: number, to: number, amount: number): number => from + (to - from) * amount;
const approachAngle = (current: number, target: number, amount: number): number =>
  current + Math.sign(wrapAngle(target - current)) * Math.min(Math.abs(wrapAngle(target - current)), amount);
const turnToward = (current: Vec3, target: Vec3, radians: number): Vec3 =>
  headingAt(approachAngle(angleOf(current), angleOf(target), radians));
const inRange = (rng: Rng, range: { min: number; max: number }): number => rng.range(range.min, range.max);

interface AttackReachProbe {
  zombiePos: Vec3;
  playerPos: Vec3;
  type: ZombieDef;
  blockSize: number;
  isSolid: SolidAt;
}

/** Shared by both attack start (telegraph) and attack resolve (after the windup elapses): horizontal
 * reach, a vertical band matching a standing player, and clear chest-to-chest line of sight. Used
 * identically at both times so "still in reach" at resolve means exactly what "in reach" meant at start. */
const withinAttackReach = ({ zombiePos, playerPos, type, blockSize, isSolid }: AttackReachProbe): boolean => {
  if (horizontalDistance(playerPos, zombiePos) * blockSize > type.attack.reach) {
    return false;
  }
  if (Math.abs(playerPos[1] - zombiePos[1]) * blockSize >= 1.7) {
    return false;
  }
  const chestOffset = 1 / blockSize;
  const zombieChest: Vec3 = [zombiePos[0], zombiePos[1] + chestOffset, zombiePos[2]];
  const playerChest: Vec3 = [playerPos[0], playerPos[1] + chestOffset, playerPos[2]];
  const toPlayer = sub(playerChest, zombieChest);
  const chestDistance = Math.hypot(...toPlayer);
  return chestDistance > 0 && raycast(zombieChest, unit(toPlayer), chestDistance, isSolid) === undefined;
};

// ---- dismemberment: which part a hit can sever, and the gameplay effect of already-severed parts ----
// Mirrors mobgen/src/mob/dismember.ts's SEVERABLE_PARTS (arms only here — the head has its own
// headOnKillChance roll in swing(), not picked randomly among these).

const ARM_PARTS = ['hand.L', 'hand.R', 'forearm.L', 'forearm.R', 'upperArm.L', 'upperArm.R'] as const;
/** A part already severed further up the same arm makes a part below it moot to sever again (upperArm.L
 * severed already implies forearm.L/hand.L are gone too — see mobgen's severedBoneSet). */
const CONTAINING_PARTS: Readonly<Record<(typeof ARM_PARTS)[number], readonly string[]>> = {
  'hand.L': ['forearm.L', 'upperArm.L'],
  'hand.R': ['forearm.R', 'upperArm.R'],
  'forearm.L': ['upperArm.L'],
  'forearm.R': ['upperArm.R'],
  'upperArm.L': [],
  'upperArm.R': [],
};

type ArmRegion = 'leftArm' | 'rightArm';
/** The mobgen part a destroyed arm region cuts at (the figure's own left is -X, mobgen's ".L"). */
const ARM_REGION_PART: Readonly<Record<ArmRegion, (typeof ARM_PARTS)[number]>> = {
  leftArm: 'upperArm.L',
  rightArm: 'upperArm.R',
};

/** Arm parts still worth severing: not already severed, and not already implied by a containing part
 * severed further up the same arm (see CONTAINING_PARTS). Empty once both arms are fully gone. */
const availableArmParts = (severed: readonly string[]): (typeof ARM_PARTS)[number][] =>
  ARM_PARTS.filter((part) => !(severed.includes(part) || CONTAINING_PARTS[part].some((c) => severed.includes(c))));

/** True once a side's arm is gone at the forearm or above (a hand-only loss still lets it attack — it's
 * grabbing with the other hand or the stump itself). */
const armGoneAtForearmOrAbove = (severed: readonly string[], side: 'L' | 'R'): boolean =>
  severed.includes(`forearm.${side}`) || severed.includes(`upperArm.${side}`);

/** Gameplay effect, first slice: with both arms gone at the forearm or above, there's nothing left to grab
 * or claw with — the zombie can still chase, but never starts a new attack (see the windup start check in
 * tick()). Already-started windups aren't cancelled retroactively; this only gates a *new* one. */
const canStillAttack = (severed: readonly string[]): boolean =>
  !(armGoneAtForearmOrAbove(severed, 'L') && armGoneAtForearmOrAbove(severed, 'R'));

interface JumpObstacleProbe {
  body: Body;
  direction: Vec3;
  isSolid: SolidAt;
  physics: PhysicsParams;
  jumpSpeed: number;
  blockSize: number;
}

const canJumpObstacle = ({ body, direction, isSolid, physics, jumpSpeed, blockSize }: JumpObstacleProbe): boolean => {
  const maxJumpMetres = (jumpSpeed * jumpSpeed) / (2 * physics.gravity * blockSize);
  const probeX = Math.floor(body.pos[0] + (direction[0] * 0.65) / blockSize);
  const probeZ = Math.floor(body.pos[2] + (direction[2] * 0.65) / blockSize);
  const footCell = Math.floor(body.pos[1] + 0.01);
  const maxTop = Math.floor(body.pos[1] + maxJumpMetres / blockSize);
  let top = footCell;
  while (top <= maxTop && isSolid(probeX, top, probeZ)) {
    top += 1;
  }
  if (top === footCell) {
    return false;
  }
  const riseMetres = (top - body.pos[1]) * blockSize;
  if (riseMetres <= physics.stepHeight * blockSize || riseMetres > maxJumpMetres) {
    return false;
  }
  for (let y = top; y < Math.ceil(top + body.height); y++) {
    if (isSolid(probeX, y, probeZ)) {
      return false;
    }
  }
  return true;
};

/** Daylight follows the sky's 06:30 dawn and 19:30 dusk keys. */
export const isDaylight = (hour: number): boolean => hour >= 6.5 && hour < 19.5;

/** The seam for later voxel light: currently daylight or the player's own lit flashlight. */
export const isLit = (_isSolid: SolidAt, _position: Vec3, hour: number, flashlightLit: boolean): boolean =>
  isDaylight(hour) || flashlightLit;

export interface PerceptionInput {
  zombie: ZombieDef;
  from: Vec3;
  facing: Vec3;
  player: PlayerSense;
  hour: number;
  blockSize: number;
  isSolid: SolidAt;
}

export type HearingTier = 'near' | 'far';
export interface HearingInput {
  zombie: ZombieDef;
  from: Vec3;
  player: PlayerSense;
  blockSize: number;
  isSolid: SolidAt;
  rng: Rng;
}
export interface HeardNoise {
  tier: HearingTier;
  target: Vec3;
}

const hearingRange = (zombie: ZombieDef, movement: PlayerMovement): number => {
  if (movement === 'sprinting') {
    return zombie.hearingRange.sprint * zombie.hearing;
  }
  if (movement === 'jogging') {
    return zombie.hearingRange.jog * zombie.hearing;
  }
  if (movement === 'walking') {
    return zombie.hearingRange.walk * zombie.hearing;
  }
  return 0;
};

const hearingTier = ({
  zombie,
  from,
  player,
  blockSize,
  isSolid,
}: Omit<HearingInput, 'rng'>): HearingTier | undefined => {
  const range = hearingRange(zombie, player.movement);
  if (range <= 0) {
    return undefined;
  }
  const distance = Math.hypot(...sub(player.pos, from)) * blockSize;
  const earOffset = 1.3 / blockSize;
  const origin: Vec3 = [from[0], from[1] + earOffset, from[2]];
  const source: Vec3 = [player.pos[0], player.pos[1] + earOffset, player.pos[2]];
  const crossings = countSolidRuns(origin, source, isSolid);
  const apparentDistance = distance + crossings * zombie.hearingModel.wallRunCostMetres;
  if (apparentDistance <= range) {
    return 'near';
  }
  if (apparentDistance <= range * zombie.hearingModel.farMultiplier) {
    return 'far';
  }
  return undefined;
};

const farBearingTarget = ({
  zombie,
  from,
  source,
  blockSize,
  rng,
}: {
  zombie: ZombieDef;
  from: Vec3;
  source: Vec3;
  blockSize: number;
  rng: Rng;
}): Vec3 => {
  const angle = Math.atan2(source[0] - from[0], source[2] - from[2]);
  const error = rng.range(-zombie.hearingModel.bearingErrorRadians, zombie.hearingModel.bearingErrorRadians);
  const bearing = headingAt(angle + error);
  const distance = zombie.hearingModel.investigationDistanceMetres / blockSize;
  return [from[0] + bearing[0] * distance, from[1], from[2] + bearing[2] * distance];
};

/** Returns an exact near-noise position or a seeded, uncertain far bearing. */
export const hearPlayer = (input: HearingInput): HeardNoise | undefined => {
  const tier = hearingTier(input);
  if (!tier) {
    return undefined;
  }
  return {
    tier,
    target: tier === 'near' ? copy(input.player.pos) : farBearingTarget({ ...input, source: input.player.pos }),
  };
};

export interface VocalNoiseInput {
  zombie: ZombieDef;
  from: Vec3;
  noise: VocalNoise;
  time: number;
  blockSize: number;
  isSolid: SolidAt;
  rng: Rng;
}

/** Applies the same solid-run wall cost and two-tier bearing model to a player sound. */
export const hearVocalNoise = ({
  zombie,
  from,
  noise,
  time,
  blockSize,
  isSolid,
  rng,
}: VocalNoiseInput): HeardNoise | undefined => {
  if (time > noise.expiresAt) {
    return undefined;
  }
  const distance = Math.hypot(...sub(noise.pos, from)) * blockSize;
  const earOffset = 1.3 / blockSize;
  const origin: Vec3 = [from[0], from[1] + earOffset, from[2]];
  const source: Vec3 = [noise.pos[0], noise.pos[1] + earOffset, noise.pos[2]];
  const crossings = countSolidRuns(origin, source, isSolid);
  const apparentDistance = distance + crossings * zombie.hearingModel.wallRunCostMetres;
  const hearingRadius = noise.radiusMetres * zombie.hearing;
  if (apparentDistance <= hearingRadius) {
    return { tier: 'near', target: copy(noise.pos) };
  }
  if (apparentDistance <= hearingRadius * zombie.hearingModel.farMultiplier) {
    return {
      tier: 'far',
      target: farBearingTarget({ zombie, from, source: noise.pos, blockSize, rng }),
    };
  }
  return undefined;
};

const seesPlayer = ({ zombie, from, facing, player, hour, blockSize, isSolid }: PerceptionInput): boolean => {
  const delta = sub(player.pos, from);
  const metres = Math.hypot(...delta) * blockSize;
  const dir = unit(delta);
  const look = unit(facing);
  const dot = Math.max(-1, Math.min(1, look[0] * dir[0] + look[2] * dir[2]));
  const inCone = dot >= Math.cos((zombie.sightCone * Math.PI) / 180);
  if (!inCone || metres <= 0) {
    return false;
  }
  const rayOrigin: Vec3 = [from[0], from[1] + 1.3 / blockSize, from[2]];
  const rayTarget: Vec3 = [player.pos[0], player.pos[1] + 1.3 / blockSize, player.pos[2]];
  const toTarget = sub(rayTarget, rayOrigin);
  const rayDistance = Math.hypot(...toTarget);
  const clear = raycast(rayOrigin, unit(toTarget), rayDistance, isSolid) === undefined;
  const lit = isLit(isSolid, player.pos, hour, player.lit);
  let sightRange = isDaylight(hour) ? zombie.sight : zombie.nightSight;
  if (lit && player.lit) {
    sightRange = player.lightSeenFrom;
  }
  return clear && metres <= sightRange;
};

/** Returns true for sight or either audible tier, using metres for distances and angles. */
export const perceivePlayer = (input: PerceptionInput): boolean =>
  seesPlayer(input) || hearingTier(input) !== undefined;

export class ZombieSystem {
  readonly store: EntityStore<Zombie>;
  private readonly options: ZombieSystemOptions;
  private playerAttackWait = 0;

  constructor(options: ZombieSystemOptions) {
    this.options = options;
    this.store = options.store ?? new MapEntityStore<Zombie>();
  }

  snapshotState(): Readonly<ZombieSystemState> {
    return freezeSnapshot({
      playerAttackWait: this.playerAttackWait,
      nextEntityId: this.store.nextId,
      zombies: [...this.store.entries()].map(([id, zombie]) => {
        const {
          type,
          behaviorRng,
          soundRng,
          dismemberRng,
          renderPrevious: _renderPrevious,
          footstepClock: _footstepClock,
          searchAnchor,
          lastPerceived,
          investigationTier,
          ...state
        } = zombie;
        return {
          id,
          zombie: {
            ...state,
            regions: { ...zombie.regions },
            type: type.id,
            behaviorRng: [...behaviorRng.state()] as RngState,
            soundRng: [...soundRng.state()] as RngState,
            dismemberRng: [...dismemberRng.state()] as RngState,
            lastVocalNoiseId: zombie.lastVocalNoiseId ?? null,
            ...(investigationTier === undefined ? {} : { investigationTier }),
            body: { ...zombie.body, pos: [...zombie.body.pos], vel: [...zombie.body.vel] },
            facing: [...zombie.facing],
            home: [...zombie.home],
            ...(searchAnchor === undefined ? {} : { searchAnchor: [...searchAnchor] }),
            searchHeading: [...zombie.searchHeading],
            strollHeading: [...zombie.strollHeading],
            ...(lastPerceived === undefined ? {} : { lastPerceived: [...lastPerceived] }),
            severed: [...zombie.severed],
          },
        };
      }),
    });
  }

  restoreState(state: ZombieSystemState, resolveType: (id: string) => ZombieDef | undefined): void {
    if (this.store.size > 0) {
      throw new Error('Zombie state restores only into an empty entity store');
    }
    const entries = state.zombies.map(({ id, zombie }) => {
      if (
        !Number.isSafeInteger(id) ||
        id < 1 ||
        !Array.isArray(zombie.behaviorRng) ||
        zombie.behaviorRng.length !== 4 ||
        zombie.behaviorRng.some((word) => !Number.isSafeInteger(word)) ||
        !Array.isArray(zombie.soundRng) ||
        zombie.soundRng.length !== 4 ||
        zombie.soundRng.some((word) => !Number.isSafeInteger(word)) ||
        !Array.isArray(zombie.dismemberRng) ||
        zombie.dismemberRng.length !== 4 ||
        zombie.dismemberRng.some((word) => !Number.isSafeInteger(word)) ||
        !Number.isFinite(zombie.idleSoundTimer) ||
        zombie.idleSoundTimer < 0 ||
        (zombie.lastVocalNoiseId !== null &&
          (!Number.isSafeInteger(zombie.lastVocalNoiseId) || zombie.lastVocalNoiseId < 0)) ||
        !Array.isArray(zombie.severed) ||
        zombie.severed.some((part) => typeof part !== 'string')
      ) {
        throw new Error(`Invalid zombie state for entity ${id}`);
      }
      const type = resolveType(zombie.type);
      if (!type) {
        throw new Error(`Missing zombie type ${zombie.type}`);
      }
      if (
        !zombie.regions ||
        ZOMBIE_REGION_NAMES.some(
          (region) =>
            !Number.isFinite(zombie.regions[region]) ||
            zombie.regions[region] < (region === 'head' ? Number.MIN_VALUE : 0) ||
            zombie.regions[region] > type.regions[region],
        )
      ) {
        throw new Error(`Invalid zombie regions for entity ${id}`);
      }
      const { type: _type, behaviorRng, soundRng, dismemberRng, lastVocalNoiseId, ...fields } = zombie;
      const restored: Zombie = {
        ...fields,
        type,
        regions: { ...zombie.regions },
        behaviorRng: new Rng(behaviorRng),
        soundRng: new Rng(soundRng),
        dismemberRng: new Rng(dismemberRng),
        lastVocalNoiseId: lastVocalNoiseId ?? undefined,
        footstepClock: initialShamblerFootstepClock(type.stepLength),
        body: { ...zombie.body, pos: [...zombie.body.pos], vel: [...zombie.body.vel] },
        facing: [...zombie.facing],
        home: [...zombie.home],
        ...(zombie.searchAnchor === undefined ? {} : { searchAnchor: [...zombie.searchAnchor] }),
        searchHeading: [...zombie.searchHeading],
        strollHeading: [...zombie.strollHeading],
        ...(zombie.lastPerceived === undefined ? {} : { lastPerceived: [...zombie.lastPerceived] }),
        renderPrevious: {
          pos: [...zombie.body.pos],
          facing: [...zombie.facing],
          headYaw: zombie.headYaw,
          gaitPhase: zombie.gaitPhase,
        },
        severed: [...zombie.severed],
      };
      return [id, restored] as const;
    });
    if (!Number.isFinite(state.playerAttackWait) || state.playerAttackWait < 0) {
      throw new Error('Invalid player attack cooldown');
    }
    this.store.restore(entries, state.nextEntityId);
    this.playerAttackWait = state.playerAttackWait;
  }

  private tickLookAround(zombie: Zombie, dt: number): void {
    const { type, behaviorRng: rng } = zombie;
    zombie.lookTimer -= dt;
    if (zombie.lookTimer <= 0) {
      zombie.bodyLookTarget =
        angleOf(zombie.facing) +
        rng.range(-type.wander.bodyLookArcDegrees, type.wander.bodyLookArcDegrees) * 0.5 * (Math.PI / 180);
      zombie.headYawTarget =
        rng.range(-type.wander.headLookArcDegrees, type.wander.headLookArcDegrees) * 0.5 * (Math.PI / 180);
      zombie.lookTimer = inRange(rng, type.wander.lookIntervalSeconds);
    }
    zombie.facing = turnToward(
      zombie.facing,
      headingAt(zombie.bodyLookTarget),
      (type.wander.bodyTurnDegreesPerSecond * Math.PI * dt) / 180,
    );
    zombie.headYaw = approachAngle(
      zombie.headYaw,
      zombie.headYawTarget,
      (type.wander.headTurnDegreesPerSecond * Math.PI * dt) / 180,
    );
  }

  private beginIdle(zombie: Zombie): void {
    zombie.mode = 'idle';
    zombie.investigationTier = undefined;
    zombie.searchAnchor = undefined;
    zombie.searchTimer = 0;
    zombie.searchStrolling = false;
    zombie.modeTimer = inRange(zombie.behaviorRng, zombie.type.wander.idleSeconds);
    zombie.lookTimer = 0;
    zombie.bodyLookTarget = angleOf(zombie.facing);
    zombie.headYawTarget = 0;
    zombie.horizontalSpeed = 0;
    zombie.body.vel[0] = 0;
    zombie.body.vel[2] = 0;
  }

  private beginStroll(zombie: Zombie): void {
    const { type, body, home, behaviorRng } = zombie;
    const duration = inRange(behaviorRng, type.wander.strollSeconds);
    let heading = headingAt(behaviorRng.range(-Math.PI, Math.PI));
    const endpoint: Vec3 = [
      body.pos[0] + (heading[0] * type.speed.wander * duration) / this.options.blockSize,
      body.pos[1],
      body.pos[2] + (heading[2] * type.speed.wander * duration) / this.options.blockSize,
    ];
    if (horizontalDistance(endpoint, home) * this.options.blockSize > type.wander.leashMetres) {
      heading = unit([home[0] - body.pos[0], 0, home[2] - body.pos[2]]);
    }
    if (Math.hypot(...heading) === 0) {
      heading = headingAt(behaviorRng.range(-Math.PI, Math.PI));
    }
    zombie.mode = 'stroll';
    zombie.investigationTier = undefined;
    zombie.searchAnchor = undefined;
    zombie.searchTimer = 0;
    zombie.searchStrolling = false;
    zombie.modeTimer = duration;
    zombie.strollHeading = heading;
    zombie.bodyLookTarget = angleOf(heading);
    zombie.headYawTarget = 0;
  }

  private beginSearch(zombie: Zombie): void {
    const { type, behaviorRng: rng } = zombie;
    zombie.mode = 'search';
    zombie.investigationTier = undefined;
    zombie.searchAnchor = copy(zombie.lastPerceived ?? zombie.body.pos);
    zombie.searchTimer = inRange(rng, type.hearingModel.searchSeconds);
    zombie.searchStrolling = false;
    zombie.searchHeading = copy(zombie.facing);
    zombie.modeTimer = inRange(rng, type.wander.idleSeconds);
    zombie.lookTimer = 0;
    zombie.bodyLookTarget = angleOf(zombie.facing);
    zombie.headYawTarget = 0;
    zombie.horizontalSpeed = 0;
    zombie.body.vel[0] = 0;
    zombie.body.vel[2] = 0;
  }

  private beginSearchStroll(zombie: Zombie): void {
    const { type, body, searchAnchor, behaviorRng: rng } = zombie;
    if (!searchAnchor) {
      return;
    }
    const duration = Math.min(inRange(rng, type.hearingModel.searchStrollSeconds), zombie.searchTimer);
    let heading = headingAt(rng.range(-Math.PI, Math.PI));
    const endpoint: Vec3 = [
      body.pos[0] + (heading[0] * type.speed.wander * duration) / this.options.blockSize,
      body.pos[1],
      body.pos[2] + (heading[2] * type.speed.wander * duration) / this.options.blockSize,
    ];
    if (horizontalDistance(endpoint, searchAnchor) * this.options.blockSize > type.hearingModel.searchRadiusMetres) {
      heading = unit([searchAnchor[0] - body.pos[0], 0, searchAnchor[2] - body.pos[2]]);
    }
    if (Math.hypot(...heading) === 0) {
      heading = headingAt(rng.range(-Math.PI, Math.PI));
    }
    zombie.searchStrolling = true;
    zombie.searchHeading = heading;
    zombie.modeTimer = duration;
    zombie.bodyLookTarget = angleOf(heading);
    zombie.headYawTarget = 0;
  }

  private stepChaseMotion(zombie: Zombie, dt: number): { sway: number; speedFactor: number } {
    const { chaseMotion } = zombie.type;
    const rng = zombie.behaviorRng;
    if (zombie.swayDuration === 0 || zombie.swayElapsed >= zombie.swayDuration) {
      zombie.swayStart = zombie.swayValue;
      zombie.swayTarget = rng.range(-chaseMotion.swayDegrees, chaseMotion.swayDegrees);
      zombie.swayDuration = inRange(rng, chaseMotion.swayIntervalSeconds);
      zombie.swayElapsed = 0;
    } else {
      zombie.swayElapsed = Math.min(zombie.swayDuration, zombie.swayElapsed + dt);
    }
    zombie.swayValue = lerp(zombie.swayStart, zombie.swayTarget, smooth01(zombie.swayElapsed / zombie.swayDuration));

    if (zombie.lurchDuration === 0 || zombie.lurchElapsed >= zombie.lurchDuration) {
      zombie.lurchStart = zombie.lurchValue;
      zombie.lurchTarget = inRange(rng, chaseMotion.speedMultiplier);
      zombie.lurchDuration = chaseMotion.lurchSeconds;
      zombie.lurchElapsed = 0;
    } else {
      zombie.lurchElapsed = Math.min(zombie.lurchDuration, zombie.lurchElapsed + dt);
    }
    zombie.lurchValue = lerp(
      zombie.lurchStart,
      zombie.lurchTarget,
      smooth01(zombie.lurchElapsed / zombie.lurchDuration),
    );

    if (zombie.stumbleDuration === 0 && rng.chance(chaseMotion.stumbleChancePerSecond * dt)) {
      zombie.stumbleDuration = inRange(rng, chaseMotion.stumbleDurationSeconds);
      zombie.stumbleElapsed = 0;
    }
    if (zombie.stumbleDuration > 0) {
      zombie.stumbleElapsed = Math.min(zombie.stumbleDuration, zombie.stumbleElapsed + dt);
      const entering = smooth01(Math.min(1, zombie.stumbleElapsed / chaseMotion.stumbleEaseSeconds));
      const leaving = smooth01(
        Math.min(1, (zombie.stumbleDuration - zombie.stumbleElapsed) / chaseMotion.stumbleEaseSeconds),
      );
      const depth = Math.min(entering, leaving);
      zombie.stumbleFactor = 1 - depth * (1 - chaseMotion.stumbleSpeedFraction);
      if (zombie.stumbleElapsed >= zombie.stumbleDuration) {
        zombie.stumbleDuration = 0;
        zombie.stumbleElapsed = 0;
        zombie.stumbleFactor = 1;
      }
    }
    return {
      sway: zombie.swayValue * (Math.PI / 180),
      speedFactor: zombie.lurchValue * zombie.stumbleFactor,
    };
  }

  add(type: ZombieDef, position: Vec3, facing: Vec3 = [0, 0, -1]): EntityId {
    const direction = unit(facing);
    const zombie: Zombie = {
      type,
      body: {
        pos: copy(position),
        vel: [0, 0, 0],
        halfWidth: 0.28 / this.options.blockSize,
        height: 1.7 / this.options.blockSize,
        onGround: false,
      },
      facing: direction,
      home: copy(position),
      mode: 'idle',
      investigationTier: undefined,
      behaviorRng: Rng.stream(this.options.seed ?? 0, `zombie:${this.store.size + 1}`),
      soundRng: Rng.stream(this.options.seed ?? 0, `zombie-sound:${this.store.size + 1}`),
      dismemberRng: Rng.stream(this.options.seed ?? 0, `zombie-dismember:${this.store.size + 1}`),
      idleSoundTimer: 8,
      modeTimer: 0,
      searchAnchor: undefined,
      searchTimer: 0,
      searchStrolling: false,
      searchHeading: copy(direction),
      strollHeading: copy(direction),
      horizontalSpeed: 0,
      bodyLookTarget: angleOf(direction),
      headYaw: 0,
      headYawTarget: 0,
      lookTimer: 0,
      swayValue: 0,
      swayStart: 0,
      swayTarget: 0,
      swayElapsed: 0,
      swayDuration: 0,
      lurchValue: 1,
      lurchStart: 1,
      lurchTarget: 1,
      lurchElapsed: 0,
      lurchDuration: 0,
      stumbleFactor: 1,
      stumbleElapsed: 0,
      stumbleDuration: 0,
      renderPrevious: { pos: copy(position), facing: copy(direction), headYaw: 0, gaitPhase: 0 },
      regions: { ...type.regions },
      attackWait: 0,
      attackWindup: 0,
      gaitPhase: 0,
      footstepClock: initialShamblerFootstepClock(type.stepLength),
      wanderClock: 0,
      severed: [],
    };
    const id = this.store.add(zombie);
    // EntityStore ids are stable within the world's entity lifetime.
    zombie.behaviorRng = Rng.stream(this.options.seed ?? 0, `zombie:${id}`);
    zombie.soundRng = Rng.stream(this.options.seed ?? 0, `zombie-sound:${id}`);
    zombie.dismemberRng = Rng.stream(this.options.seed ?? 0, `zombie-dismember:${id}`);
    zombie.idleSoundTimer = 8 + zombie.soundRng.range(0, 12);
    this.beginIdle(zombie);
    return id;
  }

  /** Advances every zombie at a fixed caller-supplied simulation dt. */
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: per-entity AI update is one cohesive ordered simulation pass.
  tick(dt: number, time = 0): void {
    if (dt <= 0) {
      return;
    }
    const player = this.options.player();
    const hour = this.options.hour();
    const { blockSize, isSolid } = this.options;
    const entries = [...this.store.entries()];
    const groundedAtTickStart = new Map<Zombie, boolean>();
    for (const [, zombie] of entries) {
      groundedAtTickStart.set(zombie, zombie.body.onGround);
      zombie.renderPrevious = {
        pos: copy(zombie.body.pos),
        facing: copy(zombie.facing),
        headYaw: zombie.headYaw,
        gaitPhase: zombie.gaitPhase,
      };
      zombie.attackWait = Math.max(0, zombie.attackWait - dt);
      // attackWindup is decremented further below, alongside the reach/LOS check it gates — see
      // withinAttackReach and its two call sites (attack start and attack resolve).
      const { pos } = zombie.body;
      const { type, behaviorRng: rng } = zombie;
      const perception = { zombie: type, from: pos, facing: zombie.facing, player, hour, blockSize, isSolid };
      const sees = seesPlayer(perception);
      const hearingInput = { zombie: type, from: pos, player, blockSize, isSolid };
      let vocal: HeardNoise | undefined;
      if (player.vocalNoise && zombie.lastVocalNoiseId !== player.vocalNoise.id) {
        zombie.lastVocalNoiseId = player.vocalNoise.id;
        vocal = hearVocalNoise({
          zombie: type,
          from: pos,
          noise: player.vocalNoise,
          time,
          blockSize,
          isSolid,
          rng,
        });
      }
      const tier = sees ? undefined : (vocal?.tier ?? hearingTier(hearingInput));
      const wasAware = zombie.mode === 'chase' || zombie.mode === 'investigate';
      if ((sees || tier) && !wasAware) {
        this.options.onSound?.('shambler_alert', copy(pos));
      }
      if (sees) {
        zombie.mode = 'chase';
        zombie.investigationTier = undefined;
        zombie.searchAnchor = undefined;
        zombie.searchTimer = 0;
        zombie.searchStrolling = false;
        zombie.lastPerceived = copy(player.pos);
      } else if (tier === 'near') {
        zombie.mode = 'investigate';
        zombie.investigationTier = 'near';
        zombie.searchAnchor = undefined;
        zombie.searchTimer = 0;
        zombie.searchStrolling = false;
        zombie.lastPerceived = copy(vocal?.tier === 'near' ? vocal.target : player.pos);
      } else if (tier === 'far' && (zombie.mode === 'idle' || zombie.mode === 'stroll' || zombie.mode === 'search')) {
        zombie.mode = 'investigate';
        zombie.investigationTier = 'far';
        zombie.searchAnchor = undefined;
        zombie.searchTimer = 0;
        zombie.searchStrolling = false;
        zombie.lastPerceived =
          vocal?.tier === 'far' ? vocal.target : farBearingTarget({ ...hearingInput, source: player.pos, rng });
      } else if (zombie.mode === 'chase') {
        zombie.mode = 'investigate';
        zombie.investigationTier = 'near';
      }

      if (
        zombie.mode === 'investigate' &&
        horizontalDistance(zombie.lastPerceived ?? zombie.home, pos) * blockSize <= 1
      ) {
        this.beginSearch(zombie);
      }

      let target: Vec3 = zombie.home;
      let direction: Vec3 = [0, 0, 0];
      let aimDirection: Vec3 | undefined;
      let desiredSpeed = 0;
      let returnArrived = false;
      const stroll = zombie.mode === 'stroll';
      if (zombie.mode === 'idle' || zombie.mode === 'stroll') {
        zombie.idleSoundTimer -= dt;
        if (zombie.idleSoundTimer <= 0) {
          this.options.onSound?.('shambler_idle', copy(pos));
          zombie.idleSoundTimer = 8 + zombie.soundRng.range(0, 12);
        }
      }
      if (zombie.mode === 'idle') {
        zombie.modeTimer -= dt;
        this.tickLookAround(zombie, dt);
        if (zombie.modeTimer <= 0) {
          this.beginStroll(zombie);
        }
      } else if (zombie.mode === 'stroll') {
        zombie.modeTimer -= dt;
        direction = zombie.strollHeading;
        desiredSpeed = zombie.modeTimer > 0 ? type.speed.wander : 0;
        zombie.facing = turnToward(
          zombie.facing,
          direction,
          (type.wander.bodyTurnDegreesPerSecond * Math.PI * dt) / 180,
        );
        direction = zombie.facing;
        zombie.headYaw = approachAngle(zombie.headYaw, 0, (type.wander.headTurnDegreesPerSecond * Math.PI * dt) / 180);
      } else if (zombie.mode === 'search') {
        zombie.searchTimer -= dt;
        if (zombie.searchTimer <= 0) {
          zombie.mode = 'return';
          zombie.searchAnchor = undefined;
          zombie.searchStrolling = false;
          target = zombie.home;
          direction = unit([target[0] - pos[0], 0, target[2] - pos[2]]);
          zombie.facing = turnToward(
            zombie.facing,
            direction,
            (type.wander.bodyTurnDegreesPerSecond * Math.PI * dt) / 180,
          );
          direction = zombie.facing;
          desiredSpeed = type.speed.wander;
        } else if (zombie.searchStrolling) {
          zombie.modeTimer -= dt;
          if (zombie.modeTimer <= 0) {
            zombie.searchStrolling = false;
            zombie.modeTimer = inRange(rng, type.wander.idleSeconds);
            this.tickLookAround(zombie, dt);
          } else {
            direction = zombie.searchHeading;
            desiredSpeed = type.speed.wander;
            zombie.facing = turnToward(
              zombie.facing,
              direction,
              (type.wander.bodyTurnDegreesPerSecond * Math.PI * dt) / 180,
            );
            direction = zombie.facing;
            zombie.headYaw = approachAngle(
              zombie.headYaw,
              0,
              (type.wander.headTurnDegreesPerSecond * Math.PI * dt) / 180,
            );
          }
        } else {
          zombie.modeTimer -= dt;
          this.tickLookAround(zombie, dt);
          if (zombie.modeTimer <= 0) {
            this.beginSearchStroll(zombie);
          }
        }
      } else {
        if (zombie.mode === 'chase') {
          target = player.pos;
        } else if (zombie.mode === 'investigate') {
          target = zombie.lastPerceived ?? zombie.home;
        }
        const metresToTarget = horizontalDistance(target, pos) * blockSize;
        returnArrived = zombie.mode === 'return' && metresToTarget < 0.4;
        direction = unit([target[0] - pos[0], 0, target[2] - pos[2]]);
        const moving = returnArrived || metresToTarget > (zombie.mode === 'chase' ? type.attack.reach * 0.9 : 0.25);
        if (moving) {
          if (zombie.mode === 'chase' || zombie.mode === 'investigate') {
            aimDirection = direction;
            const motion = this.stepChaseMotion(zombie, dt);
            direction = headingAt(angleOf(direction) + motion.sway);
            desiredSpeed = type.speed.chase * motion.speedFactor;
          } else if (!returnArrived) {
            desiredSpeed = type.speed.wander;
          }
          zombie.facing = turnToward(
            zombie.facing,
            direction,
            (type.wander.bodyTurnDegreesPerSecond * Math.PI * dt) / 180,
          );
          direction = zombie.facing;
        } else {
          direction = [0, 0, 0];
        }
        zombie.headYaw = approachAngle(zombie.headYaw, 0, (type.wander.headTurnDegreesPerSecond * Math.PI * dt) / 180);
      }

      // A stroll remains a stroll while it gently brakes at the end of its interval.
      if (zombie.regions.leftLeg <= 0 && zombie.regions.rightLeg <= 0) {
        // Without either leg the shambler stays in place; head and arm attacks still work.
        desiredSpeed = 0;
        direction = [0, 0, 0];
        aimDirection = undefined;
        zombie.horizontalSpeed = 0;
      }
      const acceleration =
        zombie.stumbleFactor < 1 && zombie.horizontalSpeed > desiredSpeed
          ? type.chaseMotion.stumbleDeceleration
          : type.wander.movementAcceleration;
      zombie.horizontalSpeed = approach(zombie.horizontalSpeed, desiredSpeed, acceleration * dt);
      if (zombie.mode === 'search' && zombie.searchStrolling && zombie.searchAnchor) {
        const radius = horizontalDistance(pos, zombie.searchAnchor) * blockSize;
        const away = unit([pos[0] - zombie.searchAnchor[0], 0, pos[2] - zombie.searchAnchor[2]]);
        const outward = zombie.facing[0] * away[0] + zombie.facing[2] * away[2];
        if (outward > 0) {
          const remaining = Math.max(0, type.hearingModel.searchRadiusMetres - radius);
          zombie.horizontalSpeed = Math.min(zombie.horizontalSpeed, remaining / (dt * outward));
        }
      }
      zombie.body.vel[0] = (direction[0] * zombie.horizontalSpeed) / blockSize;
      zombie.body.vel[2] = (direction[2] * zombie.horizontalSpeed) / blockSize;
      if (
        zombie.horizontalSpeed > 0.01 &&
        zombie.body.onGround &&
        canJumpObstacle({
          body: zombie.body,
          direction,
          isSolid,
          physics: this.options.physics,
          jumpSpeed: this.options.jumpSpeed,
          blockSize,
        })
      ) {
        zombie.body.vel[1] = this.options.jumpSpeed / blockSize;
      }
      const beforeStep = copy(pos);
      const obstacles = player.body ? [player.body] : [];
      stepBody(zombie.body, dt, isSolid, { ...this.options.physics, obstacles });
      let travelled = horizontalDistance(beforeStep, zombie.body.pos) * blockSize;
      if (aimDirection && zombie.horizontalSpeed > 0.01) {
        const dx = zombie.body.pos[0] - beforeStep[0];
        const dz = zombie.body.pos[2] - beforeStep[2];
        const forward = (dx * aimDirection[0] + dz * aimDirection[2]) * blockSize;
        if (forward < zombie.horizontalSpeed * dt * 0.1) {
          const wallAhead =
            raycast(
              [beforeStep[0], beforeStep[1] + 0.1 / blockSize, beforeStep[2]],
              aimDirection,
              0.7 / blockSize,
              isSolid,
            ) !== undefined;
          const jumpClear =
            wallAhead &&
            canJumpObstacle({
              body: zombie.body,
              direction: aimDirection,
              isSolid,
              physics: this.options.physics,
              jumpSpeed: this.options.jumpSpeed,
              blockSize,
            });
          if (wallAhead && !jumpClear) {
            zombie.body.pos[0] = beforeStep[0];
            zombie.body.pos[2] = beforeStep[2];
            travelled = 0;
            zombie.horizontalSpeed = 0;
            zombie.body.vel[0] = 0;
            zombie.body.vel[2] = 0;
          }
        }
      }
      zombie.gaitPhase += (travelled / type.stepLength) * Math.PI;
      if (zombie.mode === 'idle' || zombie.mode === 'stroll') {
        zombie.wanderClock += dt;
      }
      if (stroll && zombie.mode === 'stroll' && zombie.horizontalSpeed > 0.01) {
        const requested = zombie.horizontalSpeed * dt;
        if (travelled + 1e-4 < requested * 0.1) {
          this.beginIdle(zombie);
        }
      }
      if (stroll && zombie.mode === 'stroll' && zombie.modeTimer <= 0 && zombie.horizontalSpeed <= 0.01) {
        this.beginIdle(zombie);
      }
      if (zombie.mode === 'search' && zombie.searchStrolling && zombie.horizontalSpeed > 0.01) {
        const requested = zombie.horizontalSpeed * dt;
        if (travelled + 1e-4 < requested * 0.1) {
          zombie.searchStrolling = false;
          zombie.modeTimer = inRange(rng, type.wander.idleSeconds);
        }
      }

      if (zombie.attackWindup > 0) {
        // Resolve regardless of mode — the zombie may have lost the chase mid-windup; only whether the
        // target is still in reach/LOS right now decides a hit versus a miss.
        zombie.attackWindup = Math.max(0, zombie.attackWindup - dt);
        const reach = { zombiePos: pos, playerPos: player.pos, type, blockSize, isSolid };
        if (zombie.attackWindup <= 0 && withinAttackReach(reach)) {
          this.options.hurtPlayer(type.attack.damage);
        }
      } else if (
        zombie.mode === 'chase' &&
        zombie.attackWait <= 0 &&
        canStillAttack(zombie.severed) &&
        withinAttackReach({ zombiePos: pos, playerPos: player.pos, type, blockSize, isSolid })
      ) {
        // Telegraph: sound and the visible windup start together; the cooldown starts now too (from
        // windup start, not from the hit), so it also gates re-starting an attack during this one's windup.
        this.options.onSound?.('shambler_attack', copy(pos));
        zombie.attackWindup = type.attack.windup;
        zombie.attackWait = type.attack.cooldown;
      }
      if (zombie.mode === 'return' && returnArrived && zombie.horizontalSpeed <= 0.01) {
        this.beginIdle(zombie);
        zombie.lastPerceived = undefined;
      }
    }
    separateBodies({
      bodies: entries.map(([, zombie]) => zombie.body),
      dt,
      isSolid,
      blockSize,
      obstacles: player.body ? [player.body] : [],
    });
    if (player.body) {
      for (const [, zombie] of entries) {
        separateBodyPair({ first: player.body, second: zombie.body, dt, isSolid, blockSize });
      }
    }
    const footfallCandidates = entries.flatMap(([id, zombie]) => {
      if (
        zombie.type.id !== 'shambler' ||
        !groundedAtTickStart.get(zombie) ||
        !zombie.body.onGround ||
        zombie.horizontalSpeed <= 0.01
      ) {
        return [];
      }
      const travelledMetres = horizontalDistance(zombie.renderPrevious.pos, zombie.body.pos) * blockSize;
      const advance = advanceShamblerFootsteps(zombie.footstepClock, travelledMetres, zombie.type.stepLength);
      zombie.footstepClock = advance.clock;
      return travelledMetres > 0 ? [{ id, zombie, steps: advance.steps }] : [];
    });
    const footstepVoices = new Set(
      [...footfallCandidates]
        .sort(
          (a, b) =>
            horizontalDistance(a.zombie.body.pos, player.pos) - horizontalDistance(b.zombie.body.pos, player.pos) ||
            a.id - b.id,
        )
        .slice(0, SHAMBLER_FOOTSTEP_VOICE_CAP)
        .map(({ zombie }) => zombie),
    );
    for (const { id, zombie, steps } of footfallCandidates) {
      if (!footstepVoices.has(zombie)) {
        continue;
      }
      for (let step = 0; step < steps; step++) {
        this.options.onFootstep?.(copy(zombie.body.pos), id, zombie.mode);
      }
    }
    this.playerAttackWait = Math.max(0, this.playerAttackWait - dt);
  }

  unsafeReason(playerPos = this.options.player().pos): string | undefined {
    const { blockSize } = this.options;
    for (const [, zombie] of this.store.entries()) {
      if (zombie.mode === 'chase' || horizontalDistance(zombie.body.pos, playerPos) * blockSize <= 30) {
        return 'A shambler is close';
      }
    }
    return undefined;
  }

  private firstRegionHit(origin: Vec3, direction: Vec3, reach: number): [EntityId, Zombie, ZombieRegion] | undefined {
    const { blockSize, isSolid } = this.options;
    let nearest: [EntityId, Zombie, ZombieRegion] | undefined;
    let nearestDistance = Number.POSITIVE_INFINITY;
    for (const [id, zombie] of this.store.entries()) {
      for (const region of ZOMBIE_REGION_NAMES) {
        if (zombie.regions[region] <= 0) {
          continue;
        }
        const distance = zombieRegionHitDistance({
          origin,
          direction,
          pose: {
            position: zombie.body.pos,
            facing: zombie.facing,
            headYaw: zombie.headYaw,
            gaitPhase: zombie.gaitPhase,
            moving: Math.hypot(zombie.body.vel[0], zombie.body.vel[2]) > 0.05,
          },
          region,
          blockSize,
        });
        if (
          distance === undefined ||
          distance * blockSize > reach ||
          raycast(origin, direction, distance, isSolid) ||
          distance >= nearestDistance
        ) {
          continue;
        }
        nearestDistance = distance;
        nearest = [id, zombie, region];
      }
    }
    return nearest;
  }

  /** Strikes the first visible zombie within the held weapon's reach. */
  swing(
    origin: Vec3,
    direction: Vec3,
    weapon: { damage: number; reach: number; cooldown: number },
  ): EntityId | undefined {
    if (this.playerAttackWait > 0) {
      return undefined;
    }
    this.options.onSound?.('melee_swing', copy(origin));
    const found = this.firstRegionHit(origin, unit(direction), weapon.reach);
    if (!found) {
      return undefined;
    }
    this.playerAttackWait = weapon.cooldown;
    const [id, zombie, region] = found;
    this.options.onSound?.('melee_hit', copy(zombie.body.pos));
    this.options.onSound?.('shambler_hurt', copy(zombie.body.pos));
    const health = Math.max(0, zombie.regions[region] - weapon.damage);
    zombie.regions[region] = health;
    const killed = region === 'head' && health === 0;
    // No dedicated dismemberment/gore sound exists in content/base/sounds.json yet (melee_hit/shambler_hurt
    // above already cover every hit) — "play one if a suitable one exists, else skip" per the design.
    if (health === 0 && region in ARM_REGION_PART) {
      // A destroyed arm region is a whole arm gone: the shoulder is the cut, so the renderer hides the
      // arm and the zombie counts it lost for attacking (canStillAttack).
      this.sever(id, zombie, ARM_REGION_PART[region as ArmRegion]);
    }
    this.rollDismember(id, zombie, killed);
    if (killed) {
      this.store.remove(id);
      this.options.onDeath?.(id, zombie);
    } else if (region !== 'head' && health === 0) {
      this.options.onSevered?.(zombie, region);
    }
    return id;
  }

  /** Records `part` as severed (cumulative, saved) and tells the renderer; a part already cut is a no-op. */
  private sever(id: EntityId, zombie: Zombie, part: string): void {
    if (zombie.severed.includes(part)) {
      return;
    }
    zombie.severed.push(part);
    this.options.onSever?.(id, zombie, part);
  }

  /** Independent rolls for this hit: type.dismember.chance for a random not-yet-severed arm part (skipping
   * one already implied by a containing part — see availableArmParts), and, only on a killing blow,
   * type.dismember.headOnKillChance for the head too. Uses zombie.dismemberRng, not behaviorRng — see
   * Zombie.dismemberRng's own doc comment. */
  private rollDismember(id: EntityId, zombie: Zombie, killed: boolean): void {
    const { dismember } = zombie.type;
    if (zombie.dismemberRng.chance(dismember.chance)) {
      const available = availableArmParts(zombie.severed);
      if (available.length > 0) {
        const part = available[zombie.dismemberRng.int(0, available.length - 1)]!;
        this.sever(id, zombie, part);
      }
    }
    if (killed && !zombie.severed.includes('head') && zombie.dismemberRng.chance(dismember.headOnKillChance)) {
      this.sever(id, zombie, 'head');
    }
  }
}
