import { type AimSnapshotState, assertAimState, assertAimWobbleNoiseState } from './aim.ts';
import type { BlockEntityState } from './blockEntities.ts';
import { BODY_REGIONS, DAMAGE_KINDS, MELEE_DAMAGE_KINDS, TOUCHES } from './body.ts';
import { getBuildRevision } from './buildInfo.ts';
import {
  canonicalJsonBytes as canonicalBytes,
  canonicalJsonAt as canonicalStringify,
  decodeCanonicalNumbers as decodeNumberTags,
} from './canonicalJson.ts';
import { SKILL_LEVEL_LEGENDARY, SKILL_LEVEL_MIN } from './character.ts';
import { CHUNK, CHUNK_VOLUME } from './coords.ts';
import { assertFirearmState } from './firearmState.ts';
import { type InventoryState, WORK_IN_PROGRESS } from './inventory.ts';
import type { ItemState } from './items.ts';
import { itemIds as collectItemIds, savedItemTree } from './itemTree.ts';
import { validateLongJob } from './longAction.ts';
import { MELEE_MOTIONS } from './meleeMotion.ts';
import type { PlayerCombatState } from './playerCombat.ts';
import type { SaveSnapshot } from './saveState.ts';
import { assertScenarioRun } from './scenarioRun.ts';
import { freezeSnapshot } from './snapshotData.ts';
import type { SavedChunk, SavedColumn } from './world.ts';
import { regionIndex, WORLD_REGION_METRES } from './worldRegion.ts';
import type { HordeState, ZombieState, ZombieSystemState } from './zombies.ts';

/** Disk-format API. The implementation is data-only and safe to use in Node, workers, and browsers. */
export interface SaveVersionComponents {
  simulationHash: string;
  schemaVersion: number;
  generators: Record<string, string>;
  contentPacks: { id: string; version: string; canonicalHash: string }[];
}

export interface SaveVersionIdentity {
  digest: string;
  components: SaveVersionComponents;
  /** Informational only; unlike the simulation fingerprint, this never gates compatibility. */
  buildRevision: string;
}

export interface SaveWorldOptions {
  blockSize: number;
  site: string;
  storeys: number;
  density: number | null;
}

export interface SaveWorldIdentity extends SaveWorldOptions {
  seed: number;
  clock: { ratio: number; start: number };
}

export type SaveContentKind =
  | 'block'
  | 'item'
  | 'furniture'
  | 'climbable'
  | 'zombie'
  | 'sound'
  | 'scheduler'
  | 'skill'
  | 'recipe'
  | 'scenario';
type SaveContentLookup = (kind: SaveContentKind, id: string) => boolean;

export interface EncodeSaveOptions {
  /** Slot owner supplies a strictly increasing safe-integer generation; the codec has no storage state. */
  generation: number;
  /** Omit in the built game to use its injected simulation fingerprint and base-pack hash. */
  version?: SaveVersionComponents;
  /** Git revision is diagnostic metadata only and is not part of the compatibility digest. */
  buildRevision?: string;
  worldOptions: SaveWorldOptions;
  maxPayloadBytes?: number;
}

export interface DecodeSaveOptions {
  /** Omit in the built game to compare against its injected simulation fingerprint and base-pack hash. */
  version?: SaveVersionComponents;
  /** Running revision is shown in refusal messages but never gates compatibility. */
  buildRevision?: string;
  contentLookup: SaveContentLookup;
  /** Bounds the decompressed payload, so it is enforced while inflating. */
  maxPayloadBytes?: number;
}

export interface DecodedSave {
  snapshot: Readonly<SaveSnapshot>;
  versionIdentity: SaveVersionIdentity;
  generation: number;
  worldOptions: SaveWorldIdentity;
}

interface EncodedChunk extends SavedChunk {
  cx: number;
  cz: number;
  order: number;
}

interface Region {
  chunks: EncodedChunk[];
  zombies: { order: number; id: number; zombie: ZombieState }[];
  entities: { order: number; entity: BlockEntityState }[];
  piles: { order: number; pile: InventoryState['piles'][number] }[];
}

interface WirePayload {
  world: {
    id: string;
    options: SaveWorldIdentity;
    regions: Record<string, Region>;
    zombieSystem: {
      nextEntityId: number;
      nextPuddleId: number;
      hordes: HordeState[];
      acidGlobs: ZombieSystemState['acidGlobs'];
      acidPuddles: ZombieSystemState['acidPuddles'];
    };
    blockEntitiesNextUid: number;
    blockEntitiesReserved?: number[];
    spawned: string[];
    rolledColumns: string[];
  };
  character: {
    id: string;
    scenarioRun: SaveSnapshot['character']['scenarioRun'];
    simulation: Omit<SaveSnapshot['character']['simulation'], 'seed' | 'clock'>;
    player: SaveSnapshot['character']['player'];
    aim: AimSnapshotState;
    inventory: Omit<InventoryState, 'piles' | 'entities'>;
    progression: SaveSnapshot['character']['progression'];
    longAction: SaveSnapshot['character']['longAction'];
    playerCombat: PlayerCombatState;
    lightUid: number | null;
    quickbar: (number | null)[];
    handling: SaveSnapshot['character']['handling'];
    playerAudio: SaveSnapshot['character']['playerAudio'];
  };
}

interface Envelope {
  magic: 'DEADVOX_SAVE';
  schemaVersion: number;
  versionIdentity: SaveVersionIdentity;
  generation: number;
  payloadByteLength: number;
  checksum: string;
  payload: WirePayload;
}

const MAGIC = 'DEADVOX_SAVE';
export const SAVE_SCHEMA_VERSION = 54;
const DEFAULT_MAX_PAYLOAD_BYTES = 50 * 1024 * 1024;
const ID = /^[a-z0-9_]+$/;
const HASH = /^[0-9a-f]{64}$/;
const REGION_KEY = /^(0|-?[1-9]\d*),(0|-?[1-9]\d*)$/;

// `vite.config.ts` supplies source, Git diagnostic, and canonical base-content identities.
declare const __DEADVOX_SIMULATION_HASH__: string;
declare const __DEADVOX_BASE_CONTENT_HASH__: string;

function defaultVersion(): SaveVersionComponents {
  try {
    return {
      simulationHash: __DEADVOX_SIMULATION_HASH__,
      schemaVersion: SAVE_SCHEMA_VERSION,
      generators: { worldgen: 'worldgen-v2', shamblerFigure: 'shambler-figure-v1', amalgamFigure: 'amalgam-figure-v1' },
      contentPacks: [{ id: 'deadvox.base', version: '1', canonicalHash: __DEADVOX_BASE_CONTENT_HASH__ }],
    };
  } catch (error) {
    throw new Error('Explicit save version components are required outside a Vite build', { cause: error });
  }
}

type Schema =
  | { kind: 'string'; nonEmpty?: boolean; id?: boolean }
  | { kind: 'number'; integer?: boolean; safe?: boolean; min?: number; max?: number }
  | { kind: 'boolean' }
  | { kind: 'enum'; values: readonly (string | number | boolean)[] }
  | { kind: 'array'; item: Schema; minLength?: number; maxLength?: number }
  | { kind: 'tuple'; items: readonly Schema[] }
  | { kind: 'object'; fields: Record<string, Schema> }
  | { kind: 'optional'; schema: Schema }
  | { kind: 'nullable'; schema: Schema }
  | { kind: 'record'; value: Schema }
  | { kind: 'union'; variants: readonly Schema[] }
  | { kind: 'lazy'; get: () => Schema }
  | { kind: 'json' };

const str = (options: Omit<Extract<Schema, { kind: 'string' }>, 'kind'> = {}): Schema => ({
  kind: 'string',
  ...options,
});
const num = (options: Omit<Extract<Schema, { kind: 'number' }>, 'kind'> = {}): Schema => ({
  kind: 'number',
  ...options,
});
const bool: Schema = { kind: 'boolean' };
const enumeration = (values: readonly (string | number | boolean)[]): Schema => ({ kind: 'enum', values });
const arr = (item: Schema, minLength?: number): Schema => ({
  kind: 'array',
  item,
  ...(minLength === undefined ? {} : { minLength }),
});
const tuple = (...items: Schema[]): Schema => ({ kind: 'tuple', items });
const obj = (fields: Record<string, Schema>): Extract<Schema, { kind: 'object' }> => ({ kind: 'object', fields });
const opt = (schema: Schema): Schema => ({ kind: 'optional', schema });
const nullable = (schema: Schema): Schema => ({ kind: 'nullable', schema });
const record = (value: Schema): Schema => ({ kind: 'record', value });
const union = (...variants: Schema[]): Schema => ({ kind: 'union', variants });
const lazy = (get: () => Schema): Schema => ({ kind: 'lazy', get });
const anyJson: Schema = { kind: 'json' };

const finite = num();
const safeInt = num({ integer: true, safe: true });
const positiveInt = num({ integer: true, safe: true, min: 1 });
const nonNegativeInt = num({ integer: true, safe: true, min: 0 });
const skillLevel = num({ integer: true, safe: true, min: SKILL_LEVEL_MIN, max: SKILL_LEVEL_LEGENDARY });
const nonNegative = num({ min: 0 });
const progression = obj({
  handedness: enumeration(['right', 'left']),
  skills: record(skillLevel),
  practice: record(nonNegative),
  knownRecipes: arr(str({ nonEmpty: true })),
});
const positive = num({ min: Number.MIN_VALUE });
const vec3 = tuple(finite, finite, finite);
const acidGlob = obj({
  source: positiveInt,
  type: str({ id: true }),
  move: str({ id: true }),
  pos: vec3,
  velocity: vec3,
  damage: nonNegative,
  puddleDamagePerSimSecond: nonNegative,
  regionRoll: num({ min: 0, max: 0.999_999_999_999_999_9 }),
});
const acidPuddle = obj({
  id: nonNegativeInt,
  type: str({ id: true }),
  pos: vec3,
  remainingSimSeconds: positive,
  damagePerSimSecond: nonNegative,
});
const bodyRegionValues = BODY_REGIONS;
const body = obj({
  pos: vec3,
  vel: vec3,
  halfWidth: positive,
  halfDepth: opt(positive),
  height: positive,
  onGround: bool,
});
const needs = obj({
  calories: num({ min: 0, max: 100 }),
  hydration: num({ min: 0, max: 100 }),
  fatigue: nonNegative,
  stamina: num({ min: 0, max: 100 }),
  staminaRegenDelayRemainingSimSeconds: nonNegative,
});
const bodyRegionDamage = obj({
  head: num({ min: 0, max: 100 }),
  torso: num({ min: 0, max: 100 }),
  leftArm: num({ min: 0, max: 100 }),
  rightArm: num({ min: 0, max: 100 }),
  leftLeg: num({ min: 0, max: 100 }),
  rightLeg: num({ min: 0, max: 100 }),
});
const bodyWound = nullable(
  obj({
    bleeding: nonNegative,
    infection: enumeration(['none', 'early', 'advanced', 'resolved']),
    infectionGameSeconds: nonNegative,
    infectionAtRisk: bool,
  }),
);
const bodyWounds = obj({
  head: bodyWound,
  torso: bodyWound,
  leftArm: bodyWound,
  rightArm: bodyWound,
  leftLeg: bodyWound,
  rightLeg: bodyWound,
});
const bodyState = obj({
  health: num({ min: 0, max: 100 }),
  blood: num({ min: 0, max: 100 }),
  shock: num({ min: 0, max: 100 }),
  knockoutElapsed: nonNegative,
  regionDamage: bodyRegionDamage,
  wounds: bodyWounds,
  pain: obj({
    acute: nonNegative,
    doses: arr(obj({ item: str({ nonEmpty: true }), elapsedGameSeconds: nonNegative })),
  }),
});
const scheduler = obj({
  time: nonNegative,
  systems: arr(obj({ id: str({ nonEmpty: true }), done: nonNegative, ticks: nonNegativeInt })),
});
const clock = obj({ ratio: positive, start: nonNegative });
const simulationFields = {
  time: nonNegative,
  scheduler,
  needs,
  body: bodyState,
  exposures: obj({
    simTimestamp: nonNegative,
    nextId: nonNegativeInt,
    exposures: arr(
      obj({
        region: enumeration(BODY_REGIONS),
        kind: enumeration(DAMAGE_KINDS),
        damage: nonNegative,
        roll: num({ min: 0, max: 1 }),
        infectionRoll: num({ min: 0, max: 1 }),
        infectionAtRisk: opt(bool),
        openedTier: opt(nonNegativeInt),
        sources: arr(
          obj({
            id: str({ nonEmpty: true }),
            cause: str({ nonEmpty: true }),
            rate: nonNegative,
            remaining: opt(positive),
            touch: opt(enumeration(TOUCHES)),
          }),
        ),
      }),
    ),
  }),
  compression: obj({
    // Content owns the cap; saves only require a valid finite multiplier.
    c: num({ min: 1 }),
    active: bool,
    owner: enumeration(['debug', 'long-action']),
    interruption: opt(str()),
  }),
  pendingInterrupt: opt(str()),
  dead: opt(obj({ cause: str({ nonEmpty: true }), time: nonNegative })),
};
const simulation = obj({ seed: safeInt, clock, ...simulationFields });
const simulationWithoutWorldIdentity = obj(simulationFields);
let itemSchema: Schema;
let placedSchema: Schema;
itemSchema = obj({
  uid: positiveInt,
  type: str({ id: true }),
  count: positiveInt,
  lootedCount: opt(nonNegativeInt),
  condition: num({ min: 0, max: 1 }),
  charges: opt(nonNegative),
  on: opt(bool),
  burnRemainingGameSeconds: opt(nonNegative),
  litAtGameTimestamp: opt(nonNegative),
  pinPulled: opt(bool),
  fuseRemainingSimSeconds: opt(nonNegative),
  trap: opt(
    union(
      obj({ state: enumeration(['armed']) }),
      obj({ state: enumeration(['holding']), zombie: opt(positiveInt), remainingSimSeconds: positive }),
    ),
  ),
  madeAtGameTimestamp: opt(nonNegative),
  pockets: opt(arr(arr(lazy(() => placedSchema)))),
  cartridges: opt(arr(str({ id: true }))),
  slots: opt(record(lazy(() => itemSchema))),
  firearm: opt(
    obj({
      chamber: opt(enumeration(['empty', 'round', 'case'])),
      cylinder: opt(
        obj({
          chambers: arr(
            union(
              obj({ state: enumeration(['empty', 'case']) }),
              obj({ state: enumeration(['round']), roundType: str({ id: true }) }),
            ),
          ),
          aligned: nonNegativeInt,
          open: bool,
          cocked: bool,
        }),
      ),
      roundType: opt(str({ id: true })),
      tube: opt(arr(str({ id: true }))),
      actionOpen: opt(bool),
      hammerDown: opt(bool),
      retainedRoundType: opt(str({ id: true })),
      landings: opt(
        arr(
          obj({
            at: nonNegative,
            position: vec3,
            type: str({ id: true }),
            seed: num({ integer: true, safe: true, min: 0, max: 0xff_ff_ff_ff }),
          }),
        ),
      ),
      pendingCase: opt(
        obj({
          origin: vec3,
          direction: vec3,
          feet: vec3,
          seed: num({ integer: true, safe: true, min: 0, max: 0xff_ff_ff_ff }),
        }),
      ),
      readying: opt(obj({ elapsed: nonNegative, duration: positive })),
      cycle: opt(
        obj({
          mode: enumeration(['fire', 'hand']),
          startedAt: nonNegative,
          elapsed: nonNegative,
          duration: opt(positive),
          ejected: bool,
          forwardSounded: opt(bool),
          phase: opt(enumeration(['open', 'close'])),
          preserveRound: opt(bool),
        }),
      ),
    }),
  ),
  work: opt(
    union(
      obj({
        kind: enumeration(['craft']),
        recipe: str({ id: true }),
        elapsed: nonNegative,
        duration: positive,
        repairTargetUid: opt(positiveInt),
        repairAmount: opt(num({ min: 0, max: 1 })),
        components: arr(
          lazy(() => itemSchema),
          1,
        ),
      }),
      obj({
        kind: enumeration(['disassembly']),
        source: str({ id: true }),
        skillLevel,
        toolLevels: record(num({ integer: true, safe: true, min: 0, max: 5 })),
        outputs: arr(obj({ item: str({ id: true }), count: positiveInt })),
        gather: nonNegative,
        elapsed: nonNegative,
        duration: positive,
        components: arr(
          lazy(() => itemSchema),
          1,
        ),
      }),
    ),
  ),
});
placedSchema = obj({ item: lazy(() => itemSchema), x: nonNegativeInt, y: nonNegativeInt, rotated: bool });
const placedGrid = arr(lazy(() => placedSchema));
const targetStateSchema = obj({
  kind: enumeration(['hand', 'worn', 'pocket', 'pile', 'furniture']),
  side: opt(enumeration(['right', 'left'])),
  ownerUid: opt(positiveInt),
  pocket: opt(nonNegativeInt),
  entityUid: opt(positiveInt),
  pos: opt(vec3),
  at: opt(obj({ x: nonNegativeInt, y: nonNegativeInt, rotated: bool })),
});
const inventoryCore = obj({
  nextItemUid: positiveInt,
  hands: obj({ right: opt(lazy(() => itemSchema)), left: opt(lazy(() => itemSchema)) }),
  worn: obj({
    head: opt(lazy(() => itemSchema)),
    eyes: opt(lazy(() => itemSchema)),
    torso: opt(lazy(() => itemSchema)),
    vest: opt(lazy(() => itemSchema)),
    legs: opt(lazy(() => itemSchema)),
    back: opt(lazy(() => itemSchema)),
    waist: opt(lazy(() => itemSchema)),
    hands: opt(lazy(() => itemSchema)),
    feet: opt(lazy(() => itemSchema)),
    shoulder: opt(lazy(() => itemSchema)),
  }),
  looted: arr(tuple(str({ id: true }), nonNegativeInt)),
  quickbarOrigins: arr(tuple(positiveInt, targetStateSchema)),
});
const blockEntitySchema = obj({
  uid: positiveInt,
  type: str({ id: true }),
  origin: tuple(safeInt, safeInt, safeInt),
  pos: tuple(safeInt, safeInt, safeInt),
  size: tuple(positiveInt, positiveInt, positiveInt),
  facing: enumeration(['n', 'e', 's', 'w']),
  tip: opt(enumeration(['back', 'front', 'left', 'right', 'top'])),
  carried: opt(enumeration([true])),
  fixed: opt(enumeration([true])),
  searched: bool,
  open: bool,
  damage: opt(positive),
  broken: opt(enumeration([true])),
  lock: opt(obj({ id: str({ id: true }), locked: bool })),
  pockets: opt(arr(arr(lazy(() => placedSchema)))),
});
const pileSchema = obj({ pos: tuple(safeInt, safeInt, safeInt), items: placedGrid });
const entitiesState = obj({ nextUid: positiveInt, entities: arr(blockEntitySchema), reserved: opt(arr(positiveInt)) });
const inventory = obj({
  ...inventoryCore.fields,
  piles: arr(pileSchema),
  entities: entitiesState,
});
const longJob = (jobType: Schema, extra: Record<string, Schema> = {}) =>
  obj({
    jobType,
    ...extra,
    stopped: bool,
    last: nonNegative,
    elapsed: opt(nonNegative),
    workUid: opt(positiveInt),
    bookUid: opt(positiveInt),
    entityUid: opt(positiveInt),
    toolUid: opt(positiveInt),
    region: opt(enumeration(bodyRegionValues)),
    itemUid: opt(positiveInt),
    itemType: opt(str({ id: true })),
    duration: opt(positive),
    strikeInterval: opt(positive),
    nextStrike: opt(positive),
    rest: opt(
      obj({
        kind: enumeration(['rest', 'sleep']),
        furnitureUid: positiveInt,
        rate: finite,
        startFatigue: nonNegative,
        wakeAt: opt(finite),
        sleepOnset: opt(obj({ durationGameSeconds: positive, elapsedGameSeconds: nonNegative })),
      }),
    ),
  });
const longAction = obj({
  job: nullable(
    union(
      longJob(enumeration(['rest', 'sleep', 'craft', 'reading', 'treatment', 'wait'])),
      longJob(enumeration(['forceDoor']), { method: str({ id: true }) }),
    ),
  ),
  wakeGameHour: opt(num({ integer: true, safe: true, min: 0, max: 23 })),
});
const vocalNoise = obj({ id: positiveInt, pos: vec3, radiusMetres: positive, expiresAt: finite });
const soundPicker = obj({
  events: arr(
    obj({
      event: str({ id: true }),
      rng: tuple(safeInt, safeInt, safeInt, safeInt),
      lastVariant: nonNegativeInt,
      lastPlayedAt: finite,
    }),
  ),
});
const playerAudio = obj({
  vocalNoiseId: nonNegativeInt,
  vocalNoise: nullable(vocalNoise),
  footstepClock: obj({
    gait: enumeration(['still', 'walking', 'jogging', 'sprinting']),
    distanceUntilStep: nonNegative,
    stridePhase: num({ min: 0, max: 0.999_999_999_999_999_9 }),
    stepIndex: nonNegativeInt,
  }),
  airbornePeakY: nullable(finite),
  rustleClock: obj({ cells: arr(str()), nextSimTimestamp: finite }),
  soundPicker,
});
const handling = obj({ jobs: arr(anyJson) });
const horde = obj({
  id: str({ nonEmpty: true }),
  type: str({ id: true }),
  home: vec3,
  target: vec3,
  mode: enumeration(['home', 'roam', 'noise', 'release']),
  roamTimer: nonNegative,
  stimulusAt: opt(nonNegative),
  lastNoiseId: nonNegativeInt,
  rng: tuple(safeInt, safeInt, safeInt, safeInt),
});
const zombie = obj({
  type: str({ id: true }),
  hordeId: opt(str({ nonEmpty: true })),
  hordeOffset: opt(vec3),
  figureSeed: safeInt,
  incapacitated: bool,
  body,
  facing: vec3,
  home: vec3,
  mode: enumeration(['idle', 'stroll', 'search', 'chase', 'investigate', 'return']),
  investigationTier: opt(enumeration(['near', 'far'])),
  behaviorRng: tuple(safeInt, safeInt, safeInt, safeInt),
  soundRng: tuple(safeInt, safeInt, safeInt, safeInt),
  dismemberRng: tuple(safeInt, safeInt, safeInt, safeInt),
  lastVocalNoiseId: nullable(nonNegativeInt),
  idleSoundTimer: nonNegative,
  modeTimer: finite,
  searchAnchor: opt(vec3),
  searchTimer: finite,
  searchStrolling: bool,
  searchHeading: vec3,
  strollHeading: vec3,
  horizontalSpeed: finite,
  obstacleWanderHeading: opt(vec3),
  obstacleWanderRemaining: nonNegative,
  obstacleContact: bool,
  obstacleSlideSide: enumeration([-1, 0, 1]),
  bodyLookTarget: finite,
  headYaw: finite,
  headYawTarget: finite,
  lookTimer: finite,
  swayValue: finite,
  swayStart: finite,
  swayTarget: finite,
  swayElapsed: finite,
  swayDuration: finite,
  lurchValue: finite,
  lurchStart: finite,
  lurchTarget: finite,
  lurchElapsed: finite,
  lurchDuration: finite,
  stumbleFactor: finite,
  stumbleElapsed: finite,
  stumbleDuration: finite,
  regions: record(nonNegative),
  lastPerceived: opt(vec3),
  stimulusAt: opt(nonNegative),
  attackWait: finite,
  attackWindup: finite,
  spitWindup: nonNegative,
  spitWait: nonNegative,
  spitRng: tuple(safeInt, safeInt, safeInt, safeInt),
  gaitPhase: finite,
  footstepClock: obj({ distanceUntilStep: positive, nextLongStep: bool }),
  wanderClock: finite,
  stanceWeight: opt(finite),
  stepOffset: opt(finite),
  hitFlinchTime: opt(nonNegative),
  /** Part names severed so far (packages/mobgen/src/mob/dismember.ts's SEVERABLE_PARTS) — cumulative, never
   * shrinks; see Zombie.severed's own doc comment. */
  severed: arr(str()),
  /** Amalgam voxel-grid cells knocked out by hits, ascending; see Zombie.carved. */
  carved: arr(nonNegativeInt),
});
const playerState = obj({
  body,
  yaw: finite,
  pitch: finite,
  walk: bool,
  crouching: bool,
  sprinting: bool,
  firearmReadyWalking: bool,
  handlingPausedForKnockout: bool,
  /** `LadderHoldState` (src/core/ladders.ts): on a ladder, or grabbed and not reached yet. */
  ladder: nullable(union(obj({ on: enumeration([true]) }), obj({ on: enumeration([false]), grabbedUid: positiveInt }))),
});
const meleeAction = nullable(
  obj({
    profile: enumeration([...MELEE_DAMAGE_KINDS, 'fists']),
    hand: enumeration(['right', 'left']),
    twoHanded: bool,
    cooldown: positive,
    contactAt: positive,
    aimYaw: finite,
    aimPitch: finite,
    elapsed: nonNegative,
    hitResolved: bool,
    origin: vec3,
    direction: vec3,
    hands: obj({ right: nullable(positiveInt), left: nullable(positiveInt) }),
    weapon: obj({
      motion: enumeration(MELEE_MOTIONS),
      damage: positive,
      reach: positive,
      cooldown: positive,
      contactFraction: opt(num({ min: 0, max: 1 })),
      windupCapSimSeconds: opt(positive),
      stamina: opt(nonNegative),
      impulse: opt(nonNegative),
      damageVariance: opt(num({ min: 0, max: 1 })),
      headDamageMultiplier: opt(positive),
      limbDamageMultiplier: opt(positive),
      speedMultiplier: opt(positive),
      swingSound: opt(str({ id: true })),
      hitSound: opt(str({ id: true })),
      hitLayerSound: opt(str({ id: true })),
      type: opt(enumeration(MELEE_DAMAGE_KINDS)),
    }),
  }),
);
const playerCombat = obj({
  playerAttackWait: nonNegative,
  meleeAction,
  nextFistHand: enumeration(['right', 'left']),
});
const aim = obj({
  lookYaw: finite,
  lookPitch: finite,
  recoilYaw: finite,
  recoilPitch: finite,
  lastYaw: finite,
  lastPitch: finite,
  hasLookSample: bool,
  frame: obj({ yaw: finite, pitch: finite }),
  wobbleNoise: obj({
    yaw: obj({ raw: finite, smooth: finite }),
    pitch: obj({ raw: finite, smooth: finite }),
    rng: tuple(safeInt, safeInt, safeInt, safeInt),
  }),
});
const playerStateInventory = obj({
  ...inventoryCore.fields,
});
const worldOptionsSchema = obj({
  blockSize: positive,
  site: str({ nonEmpty: true }),
  storeys: num({ integer: true, safe: true, min: 1, max: 20 }),
  density: nullable(num({ min: 0, max: 1 })),
});
const worldIdentitySchema = obj({ ...worldOptionsSchema.fields, seed: safeInt, clock });
const versionComponentsSchema = obj({
  simulationHash: str(),
  schemaVersion: positiveInt,
  generators: record(str({ nonEmpty: true })),
  contentPacks: arr(obj({ id: str({ nonEmpty: true }), version: str({ nonEmpty: true }), canonicalHash: str() })),
});

const scenarioRun = nullable(
  obj({
    scenario: str({ id: true }),
    startedAtGameTimestamp: finite,
    completedAtGameTimestamp: nullable(finite),
    activeRealSeconds: nonNegative,
    distanceMetres: nonNegative,
    firstFurnitureReadAtGameTimestamp: nullable(finite),
    firstLadderUseAtGameTimestamp: nullable(finite),
    discovery: obj({
      clueRead: nullable(finite),
      landmarkArrival: nullable(finite),
      buildingArrival: nullable(finite),
      hatchEncounter: nullable(finite),
      hatchOpened: nullable(finite),
      entranceTravel: nullable(finite),
      sewerTravel: nullable(finite),
    }),
    eventsFiredAtGameTimestamp: record(finite),
  }),
);

const savedRun = obj({ start: nonNegativeInt, length: positiveInt, id: nonNegativeInt });

const wirePayloadSchema = obj({
  world: obj({
    id: str({ nonEmpty: true }),
    options: worldIdentitySchema,
    regions: record(
      obj({
        chunks: arr(
          obj({
            cx: safeInt,
            cy: safeInt,
            cz: safeInt,
            order: nonNegativeInt,
            palette: arr(str({ id: true }), 1),
            runs: arr(savedRun, 1),
          }),
        ),
        zombies: arr(obj({ order: nonNegativeInt, id: positiveInt, zombie })),
        entities: arr(obj({ order: nonNegativeInt, entity: blockEntitySchema })),
        piles: arr(obj({ order: nonNegativeInt, pile: pileSchema })),
      }),
    ),
    zombieSystem: obj({
      nextEntityId: positiveInt,
      nextPuddleId: nonNegativeInt,
      hordes: arr(horde),
      acidGlobs: arr(acidGlob),
      acidPuddles: arr(acidPuddle),
    }),
    blockEntitiesNextUid: positiveInt,
    blockEntitiesReserved: opt(arr(positiveInt)),
    spawned: arr(str({ nonEmpty: true })),
    rolledColumns: arr(str({ nonEmpty: true })),
  }),
  character: obj({
    id: str({ nonEmpty: true }),
    progression,
    scenarioRun,
    simulation: simulationWithoutWorldIdentity,
    player: playerState,
    aim,
    inventory: playerStateInventory,
    longAction,
    playerCombat,
    lightUid: nullable(positiveInt),
    quickbar: arr(nullable(positiveInt)),
    handling,
    playerAudio,
  }),
});

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: one schema dispatcher keeps exact required/unknown-field semantics auditable.
function validateSchema(schema: Schema, value: unknown, path: string, acceptTaggedNegativeZero = false): void {
  if (schema.kind === 'lazy') {
    validateSchema(schema.get(), value, path, acceptTaggedNegativeZero);
    return;
  }
  if (schema.kind === 'optional') {
    if (value !== undefined) {
      validateSchema(schema.schema, value, path, acceptTaggedNegativeZero);
    }
    return;
  }
  if (schema.kind === 'nullable') {
    if (value !== null) {
      validateSchema(schema.schema, value, path, acceptTaggedNegativeZero);
    }
    return;
  }
  if (schema.kind === 'union') {
    for (const variant of schema.variants) {
      try {
        validateSchema(variant, value, path, acceptTaggedNegativeZero);
        return;
      } catch {
        // Try the next strict object shape.
      }
    }
    throw new Error(`Invalid variant at ${path}`);
  }
  if (schema.kind === 'string') {
    if (typeof value !== 'string' || (schema.nonEmpty && value.length === 0) || (schema.id && !ID.test(value))) {
      throw new Error(`Invalid string at ${path}`);
    }
    return;
  }
  if (schema.kind === 'number') {
    if (
      typeof value !== 'number' ||
      !Number.isFinite(value) ||
      (schema.integer && !Number.isInteger(value)) ||
      (schema.safe && !Number.isSafeInteger(value)) ||
      (schema.min !== undefined && value < schema.min) ||
      (schema.max !== undefined && value > schema.max)
    ) {
      throw new Error(`Invalid number at ${path}`);
    }
    return;
  }
  if (schema.kind === 'boolean') {
    if (typeof value !== 'boolean') {
      throw new Error(`Invalid boolean at ${path}`);
    }
    return;
  }
  if (schema.kind === 'enum') {
    if (!schema.values.includes(value as never)) {
      throw new Error(`Invalid value at ${path}`);
    }
    return;
  }
  if (schema.kind === 'array') {
    if (
      !Array.isArray(value) ||
      (schema.minLength !== undefined && value.length < schema.minLength) ||
      (schema.maxLength !== undefined && value.length > schema.maxLength)
    ) {
      throw new Error(`Invalid array at ${path}`);
    }
    for (const [index, child] of value.entries()) {
      validateSchema(schema.item, child, `${path}[${index}]`, acceptTaggedNegativeZero);
    }
    return;
  }
  if (schema.kind === 'tuple') {
    if (!Array.isArray(value) || value.length !== schema.items.length) {
      throw new Error(`Invalid tuple at ${path}`);
    }
    for (const [index, child] of schema.items.entries()) {
      validateSchema(child, value[index], `${path}[${index}]`, acceptTaggedNegativeZero);
    }
    return;
  }
  if (schema.kind === 'object') {
    if (!isRecord(value)) {
      throw new Error(`Invalid object at ${path}`);
    }
    for (const key of Object.keys(value)) {
      if (!(key in schema.fields)) {
        throw new Error(`Unknown field ${path}.${key}`);
      }
    }
    for (const [key, field] of Object.entries(schema.fields)) {
      if (Object.hasOwn(value, key)) {
        validateSchema(field, value[key], `${path}.${key}`, acceptTaggedNegativeZero);
      } else if (field.kind !== 'optional') {
        throw new Error(`Missing field ${path}.${key}`);
      }
    }
    return;
  }
  if (schema.kind === 'record') {
    if (!isRecord(value)) {
      throw new Error(`Invalid record at ${path}`);
    }
    for (const [key, child] of Object.entries(value)) {
      validateSchema(schema.value, child, `${path}.${key}`, acceptTaggedNegativeZero);
    }
    return;
  }
  if (schema.kind === 'json') {
    canonicalStringify(value, path, { acceptTaggedNegativeZero });
    return;
  }
  throw new Error(`Unsupported schema at ${path}`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

async function sha256(bytes: Uint8Array): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes.slice().buffer as ArrayBuffer);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** Returns undefined once more than `maxBytes` arrive, without reading the rest. */
async function readStream(
  stream: ReadableStream<Uint8Array>,
  maxBytes = Number.POSITIVE_INFINITY,
): Promise<Uint8Array | undefined> {
  const reader = stream.getReader();
  const parts: Uint8Array[] = [];
  let length = 0;
  for (;;) {
    // biome-ignore lint/performance/noAwaitInLoops: stream chunks arrive in order.
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    length += value.byteLength;
    if (length > maxBytes) {
      await reader.cancel();
      return undefined;
    }
    parts.push(value);
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    bytes.set(part, offset);
    offset += part.byteLength;
  }
  return bytes;
}

async function gzip(bytes: Uint8Array): Promise<Uint8Array> {
  const compressed = new Blob([bytes.slice()]).stream().pipeThrough(new CompressionStream('gzip'));
  return (await readStream(compressed))!;
}

const envelopeLimit = (maxPayloadBytes: number): number => maxPayloadBytes + 1024 * 1024;

async function gunzipBounded(bytes: Uint8Array<ArrayBuffer>, maxBytes: number): Promise<Uint8Array> {
  // A small record must not inflate without limit, so the bound applies while streaming.
  let inflated: Uint8Array | undefined;
  try {
    inflated = await readStream(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip')), maxBytes);
  } catch (error) {
    throw new Error('Invalid or truncated compressed save', { cause: error });
  }
  if (!inflated) {
    throw new Error('Save envelope exceeds configured limit');
  }
  return inflated;
}

function validateVersion(version: SaveVersionComponents): void {
  validateSchema(versionComponentsSchema, version, 'version');
  if (!HASH.test(version.simulationHash)) {
    throw new Error('Invalid simulation source hash');
  }
  if (version.schemaVersion !== SAVE_SCHEMA_VERSION) {
    throw new Error(`Unsupported save schema version ${version.schemaVersion}`);
  }
  const packIds = new Set<string>();
  for (const pack of version.contentPacks) {
    if (!HASH.test(pack.canonicalHash)) {
      throw new Error(`Invalid content hash for pack ${pack.id}`);
    }
    if (packIds.has(pack.id)) {
      throw new Error(`Duplicate content pack id ${pack.id}`);
    }
    packIds.add(pack.id);
  }
}

export function contentPackDifferences(
  saved: SaveVersionComponents['contentPacks'],
  running: SaveVersionComponents['contentPacks'],
): string[] {
  const differences: string[] = [];
  for (const pack of saved) {
    const loaded = running.find(({ id }) => id === pack.id);
    if (!loaded) {
      differences.push(`Missing mod: ${pack.id}`);
    } else if (loaded.version !== pack.version || loaded.canonicalHash !== pack.canonicalHash) {
      differences.push(`Different mod: ${pack.id}`);
    }
  }
  for (const pack of running) {
    if (!saved.some(({ id }) => id === pack.id)) {
      differences.push(`Additional mod: ${pack.id}`);
    }
  }
  if (differences.length === 0 && saved.some((pack, index) => pack.id !== running[index]?.id)) {
    differences.push('Different mod order');
  }
  return differences;
}

function versionDifferences(saved: SaveVersionComponents, running: SaveVersionComponents): string[] {
  const differences: string[] = [];
  if (saved.simulationHash !== running.simulationHash) {
    differences.push('simulation source hashes differ');
  }
  if (saved.schemaVersion !== running.schemaVersion) {
    differences.push(`schema versions differ (${saved.schemaVersion} vs ${running.schemaVersion})`);
  }
  const generatorNames = [...new Set([...Object.keys(saved.generators), ...Object.keys(running.generators)])].sort();
  const changedGenerators = generatorNames.filter((name) => saved.generators[name] !== running.generators[name]);
  if (changedGenerators.length > 0) {
    differences.push(`generator versions differ for ${changedGenerators.join(', ')}`);
  }
  if (canonicalStringify(saved.contentPacks) !== canonicalStringify(running.contentPacks)) {
    differences.push(
      `content packs differ: ${contentPackDifferences(saved.contentPacks, running.contentPacks).join('; ')}`,
    );
  }
  if (differences.length === 0) {
    differences.push('identity digests differ');
  }
  return differences;
}

function identityTuple(version: SaveVersionComponents): unknown[] {
  return [
    version.simulationHash,
    version.schemaVersion,
    Object.fromEntries(
      Object.entries(version.generators).sort(([a], [b]) => {
        if (a < b) {
          return -1;
        }
        if (a > b) {
          return 1;
        }
        return 0;
      }),
    ),
    version.contentPacks.map(({ id, version: packVersion, canonicalHash }) => [id, packVersion, canonicalHash]),
  ];
}

function versionDigest(version: SaveVersionComponents): Promise<string> {
  return sha256(canonicalBytes(identityTuple(version)));
}

/** A bundled mod applied to the running content, identified by the hash of its data. */
export interface ActiveBundledMod {
  id: string;
  data: unknown;
}

export interface ActiveBrowserMod extends ActiveBundledMod {
  version: string;
}

export async function currentSaveVersionIdentity(
  bundledMods: readonly ActiveBundledMod[] = [],
  browserMods: readonly ActiveBrowserMod[] = [],
): Promise<SaveVersionIdentity> {
  const components = structuredClone(defaultVersion());
  const packs = await Promise.all(
    [...bundledMods]
      .sort((a, b) => (a.id < b.id ? -1 : 1))
      .map(async (mod) => ({
        id: `bundled.${mod.id}`,
        version: '1',
        canonicalHash: await sha256(canonicalBytes(mod.data)),
      })),
  );
  const browserPacks = await Promise.all(
    browserMods.map(async (mod) => ({
      id: `browser.${mod.id}`,
      version: mod.version,
      canonicalHash: await sha256(canonicalBytes(mod.data)),
    })),
  );
  components.contentPacks.push(...packs, ...browserPacks);
  validateVersion(components);
  return {
    digest: await versionDigest(components),
    components,
    buildRevision: getBuildRevision(),
  };
}

function parseRegionKey(key: string): [number, number] {
  const parts = REGION_KEY.exec(key);
  if (!parts) {
    throw new Error(`Invalid region key ${key}`);
  }
  const x = Number(parts[1]);
  const z = Number(parts[2]);
  if (!(Number.isSafeInteger(x) && Number.isSafeInteger(z))) {
    throw new Error(`Invalid region key ${key}`);
  }
  return [x, z];
}

function makeWirePayload(snapshot: SaveSnapshot, worldOptions: SaveWorldOptions): WirePayload {
  const regionChunks = WORLD_REGION_METRES / (CHUNK * worldOptions.blockSize);
  if (!Number.isSafeInteger(regionChunks) || regionChunks <= 0) {
    throw new Error('World block size does not map chunks to 512 m regions');
  }
  const regions = new Map<string, Region>();
  const getRegion = (x: number, z: number): Region => {
    const key = `${x},${z}`;
    let region = regions.get(key);
    if (!region) {
      region = { chunks: [], zombies: [], entities: [], piles: [] };
      regions.set(key, region);
    }
    return region;
  };
  let chunkOrder = 0;
  for (const { cx, cz, chunks } of snapshot.world.columns) {
    const region = getRegion(Math.floor(cx / regionChunks), Math.floor(cz / regionChunks));
    for (const chunk of chunks) {
      region.chunks.push({ cx, cz, order: chunkOrder, ...chunk });
      chunkOrder += 1;
    }
  }
  snapshot.world.zombies.zombies.forEach((entry, order) => {
    const [x, , z] = entry.zombie.body.pos;
    getRegion(regionIndex(x, worldOptions.blockSize), regionIndex(z, worldOptions.blockSize)).zombies.push({
      ...entry,
      order,
    });
  });
  snapshot.character.inventory.entities.entities.forEach((entity, order) => {
    getRegion(
      regionIndex(entity.pos[0], worldOptions.blockSize),
      regionIndex(entity.pos[2], worldOptions.blockSize),
    ).entities.push({ order, entity });
  });
  snapshot.character.inventory.piles.forEach((pile, order) => {
    getRegion(
      regionIndex(pile.pos[0], worldOptions.blockSize),
      regionIndex(pile.pos[2], worldOptions.blockSize),
    ).piles.push({ order, pile });
  });
  const { inventory: savedInventory } = snapshot.character;
  const wire: WirePayload = {
    world: {
      id: snapshot.world.id,
      options: {
        ...worldOptions,
        seed: snapshot.character.simulation.seed,
        clock: snapshot.character.simulation.clock,
      },
      regions: Object.fromEntries(regions),
      zombieSystem: {
        nextEntityId: snapshot.world.zombies.nextEntityId,
        nextPuddleId: snapshot.world.zombies.nextPuddleId,
        hordes: [...snapshot.world.zombies.hordes],
        acidGlobs: [...snapshot.world.zombies.acidGlobs],
        acidPuddles: [...snapshot.world.zombies.acidPuddles],
      },
      blockEntitiesNextUid: savedInventory.entities.nextUid,
      ...(savedInventory.entities.reserved ? { blockEntitiesReserved: [...savedInventory.entities.reserved] } : {}),
      spawned: [...snapshot.world.spawned],
      rolledColumns: [...snapshot.world.rolledColumns],
    },
    character: {
      id: snapshot.character.id,
      progression: snapshot.character.progression,
      simulation: {
        time: snapshot.character.simulation.time,
        scheduler: snapshot.character.simulation.scheduler,
        needs: snapshot.character.simulation.needs,
        body: snapshot.character.simulation.body,
        exposures: snapshot.character.simulation.exposures,
        compression: snapshot.character.simulation.compression,
        ...(snapshot.character.simulation.pendingInterrupt === undefined
          ? {}
          : { pendingInterrupt: snapshot.character.simulation.pendingInterrupt }),
        ...(snapshot.character.simulation.dead === undefined ? {} : { dead: snapshot.character.simulation.dead }),
      },
      player: snapshot.character.player,
      aim: snapshot.character.aim,
      inventory: {
        nextItemUid: savedInventory.nextItemUid,
        hands: savedInventory.hands,
        worn: savedInventory.worn,
        looted: savedInventory.looted,
        quickbarOrigins: savedInventory.quickbarOrigins,
      },
      longAction: snapshot.character.longAction,
      playerCombat: snapshot.character.playerCombat,
      lightUid: snapshot.character.lightUid,
      quickbar: [...snapshot.character.quickbar],
      handling: snapshot.character.handling,
      playerAudio: snapshot.character.playerAudio,
      scenarioRun: snapshot.character.scenarioRun,
    },
  };
  return wire;
}

function restoreWirePayload(wire: WirePayload): SaveSnapshot {
  const chunks: EncodedChunk[] = [];
  const zombies: { order: number; id: number; zombie: ZombieState }[] = [];
  const entities: BlockEntityState[] = [];
  const piles: InventoryState['piles'] = [];
  for (const region of Object.values(wire.world.regions)) {
    chunks.push(...region.chunks);
    zombies.push(...region.zombies);
    entities.push(...region.entities.map(({ order: _order, entity }) => entity));
    piles.push(...region.piles.map(({ order: _order, pile }) => pile));
  }
  const ordered = <T extends { order: number }>(values: T[]): T[] => values.sort((a, b) => a.order - b.order);
  // A column's chunks are consecutive in order, so a change of column starts the next one.
  const columns: SavedColumn[] = [];
  for (const { cx, cz, order: _order, ...chunk } of ordered(chunks)) {
    const column = columns.at(-1);
    if (column?.cx === cx && column.cz === cz) {
      column.chunks.push(chunk);
    } else {
      columns.push({ cx, cz, chunks: [chunk] });
    }
  }
  const snapshot: SaveSnapshot = {
    world: {
      id: wire.world.id,
      columns,
      zombies: { ...wire.world.zombieSystem, zombies: ordered(zombies).map(({ order: _order, ...entry }) => entry) },
      spawned: [...wire.world.spawned],
      rolledColumns: [...wire.world.rolledColumns],
    },
    character: {
      ...wire.character,
      simulation: { ...wire.character.simulation, seed: wire.world.options.seed, clock: wire.world.options.clock },
      inventory: {
        ...wire.character.inventory,
        piles: ordered(Object.values(wire.world.regions).flatMap((region) => region.piles)).map(({ pile }) => pile),
        entities: {
          nextUid: wire.world.blockEntitiesNextUid,
          entities: ordered(Object.values(wire.world.regions).flatMap((region) => region.entities)).map(
            ({ entity }) => entity,
          ),
          ...(wire.world.blockEntitiesReserved ? { reserved: [...wire.world.blockEntitiesReserved] } : {}),
        },
      },
    },
  };
  return snapshot;
}

/** Runs cover the chunk in order and are maximal, so each chunk has exactly one encoding. */
function validateSavedChunk(chunk: SavedChunk, path: string): void {
  if (chunk.palette.some((id, i) => i > 0 && chunk.palette[i - 1]! >= id)) {
    throw new Error(`Invalid RLE palette at ${path}.palette`);
  }
  const used = new Set<number>();
  let end = 0;
  let previousId: number | undefined;
  for (const [ri, run] of chunk.runs.entries()) {
    if (run.length === 0 || run.start !== end || run.id >= chunk.palette.length) {
      throw new Error(`Malformed RLE run at ${path}.runs[${ri}]`);
    }
    if (run.id === previousId) {
      throw new Error(`Non-maximal RLE runs at ${path}.runs[${ri}]`);
    }
    used.add(run.id);
    end = run.start + run.length;
    previousId = run.id;
  }
  if (end !== CHUNK_VOLUME) {
    throw new Error(`RLE runs do not cover the chunk at ${path}.runs`);
  }
  if (used.size !== chunk.palette.length) {
    throw new Error(`Unused RLE palette entry at ${path}.palette`);
  }
}

function validateSavedColumns(columns: readonly SavedColumn[]): void {
  for (const [index, column] of columns.entries()) {
    const path = `world.columns[${index}]`;
    const previous = columns[index - 1];
    if (previous && (previous.cx > column.cx || (previous.cx === column.cx && previous.cz >= column.cz))) {
      throw new Error(`Unsorted or duplicate saved column at ${path}`);
    }
    if (column.chunks.length === 0) {
      throw new Error(`Empty saved column at ${path}`);
    }
    for (const [ci, chunk] of column.chunks.entries()) {
      if (ci > 0 && column.chunks[ci - 1]!.cy >= chunk.cy) {
        throw new Error(`Unsorted or duplicate saved chunk at ${path}.chunks[${ci}]`);
      }
      validateSavedChunk(chunk, `${path}.chunks[${ci}]`);
    }
  }
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: cross-region ID, ordering, and ownership checks are intentionally centralized before restore.
function validateWire(wire: WirePayload, lookup?: SaveContentLookup): SaveSnapshot {
  validateSchema(wirePayloadSchema, wire, 'payload');
  const worldOptions = wire.world.options;
  assertScenarioRun(wire.character.scenarioRun, {
    calendar: worldOptions.clock.start + wire.character.simulation.time * worldOptions.clock.ratio,
    dead: wire.character.simulation.dead !== undefined,
  });
  if ((wire.character.scenarioRun?.scenario ?? worldOptions.site) !== worldOptions.site) {
    throw new Error('Scenario run does not match saved site');
  }
  if (wire.character.handling.jobs.length > 0) {
    throw new Error('Pending handling jobs are not supported in save payloads');
  }
  const regions = new Set<string>();
  const chunkSet = new Set<string>();
  const entityIds = new Set<number>();
  const zombieIds = new Set<number>();
  const origins = new Set<string>();
  const spawnKeys = new Set<string>();
  const regionChunks = WORLD_REGION_METRES / (CHUNK * worldOptions.blockSize);
  if (!Number.isSafeInteger(regionChunks) || regionChunks <= 0) {
    throw new Error('Invalid world region layout');
  }
  const chunkOrders: number[] = [];
  const zombieOrders: number[] = [];
  const entityOrders: number[] = [];
  const pileOrders: number[] = [];
  for (const [regionKey, region] of Object.entries(wire.world.regions)) {
    const [regionX, regionZ] = parseRegionKey(regionKey);
    if (regions.has(regionKey)) {
      throw new Error(`Duplicate region ${regionKey}`);
    }
    regions.add(regionKey);
    if (region.chunks.length + region.zombies.length + region.entities.length + region.piles.length === 0) {
      throw new Error(`Empty region ${regionKey}`);
    }
    for (const chunk of region.chunks) {
      chunkOrders.push(chunk.order);
      const key = `${chunk.cx},${chunk.cy},${chunk.cz}`;
      if (chunkSet.has(key)) {
        throw new Error(`Duplicate chunk ${key}`);
      }
      chunkSet.add(key);
      if (Math.floor(chunk.cx / regionChunks) !== regionX || Math.floor(chunk.cz / regionChunks) !== regionZ) {
        throw new Error(`Chunk ${key} is in the wrong region`);
      }
    }
    for (const { order, id, zombie: saved } of region.zombies) {
      zombieOrders.push(order);
      if (zombieIds.has(id)) {
        throw new Error(`Duplicate zombie id ${id}`);
      }
      zombieIds.add(id);
      if (
        regionIndex(saved.body.pos[0], worldOptions.blockSize) !== regionX ||
        regionIndex(saved.body.pos[2], worldOptions.blockSize) !== regionZ
      ) {
        throw new Error(`Zombie ${id} is in the wrong region`);
      }
    }
    for (const { order, entity } of region.entities) {
      entityOrders.push(order);
      if (entityIds.has(entity.uid)) {
        throw new Error(`Duplicate block entity id ${entity.uid}`);
      }
      entityIds.add(entity.uid);
      const origin = entity.origin.join(',');
      if (origins.has(origin)) {
        throw new Error(`Duplicate block entity origin ${origin}`);
      }
      origins.add(origin);
      if (
        regionIndex(entity.pos[0], worldOptions.blockSize) !== regionX ||
        regionIndex(entity.pos[2], worldOptions.blockSize) !== regionZ
      ) {
        throw new Error(`Block entity ${entity.uid} is in the wrong region`);
      }
    }
    for (const { order, pile } of region.piles) {
      pileOrders.push(order);
      if (
        regionIndex(pile.pos[0], worldOptions.blockSize) !== regionX ||
        regionIndex(pile.pos[2], worldOptions.blockSize) !== regionZ
      ) {
        throw new Error(`Pile at ${pile.pos.join(',')} is in the wrong region`);
      }
    }
  }
  const checkOrder = (orders: number[], label: string) => {
    const sorted = [...orders].sort((a, b) => a - b);
    if (sorted.some((order, index) => order !== index)) {
      throw new Error(`Invalid ${label} order`);
    }
  };
  checkOrder(chunkOrders, 'chunk');
  checkOrder(zombieOrders, 'zombie');
  checkOrder(entityOrders, 'block entity');
  checkOrder(pileOrders, 'pile');
  if (
    new Set(wire.world.rolledColumns).size !== wire.world.rolledColumns.length ||
    wire.world.rolledColumns.some((key) => {
      const parts = key.split(',').map(Number);
      return parts.length !== 2 || parts.some((part) => !Number.isSafeInteger(part)) || parts.join(',') !== key;
    })
  ) {
    throw new Error('Invalid rolled column keys');
  }
  if (new Set(wire.world.spawned).size !== wire.world.spawned.length) {
    throw new Error('Duplicate zombie spawn key');
  }
  for (const key of wire.world.spawned) {
    spawnKeys.add(key);
  }
  const snapshot = restoreWirePayload(wire);
  validateSavedColumns(snapshot.world.columns);
  assertAimState(snapshot.character.aim);
  assertAimWobbleNoiseState(snapshot.character.aim.wobbleNoise);
  validateActionReferences(snapshot);
  collectItemIds(savedItemTree(snapshot.character.inventory), snapshot.character.inventory.nextItemUid);
  for (const { item, path } of savedItemTree(snapshot.character.inventory)) {
    if (item.firearm) {
      if (item.count !== 1) {
        throw new Error(`Mechanical firearm state needs one item at ${path}`);
      }
      assertFirearmState(item.firearm);
    }
  }
  const maxEntity = [...entityIds].reduce((maximum, id) => Math.max(maximum, id), 0);
  if (wire.world.blockEntitiesNextUid <= maxEntity) {
    throw new Error('Invalid next block entity id');
  }
  const maxZombie = [...zombieIds].reduce((maximum, id) => Math.max(maximum, id), 0);
  if (snapshot.world.zombies.nextEntityId <= maxZombie) {
    throw new Error('Next zombie id does not exceed saved zombie ids');
  }
  if (snapshot.world.id === snapshot.character.id) {
    throw new Error('World and character IDs must be distinct');
  }
  if (new Set(snapshot.world.zombies.zombies.map(({ id }) => id)).size !== snapshot.world.zombies.zombies.length) {
    throw new Error('Duplicate zombie id');
  }
  if (
    new Set(snapshot.character.inventory.looted.map(([id]) => id)).size !== snapshot.character.inventory.looted.length
  ) {
    throw new Error('Duplicate looted item type');
  }
  if (
    new Set(snapshot.character.simulation.scheduler.systems.map(({ id }) => id)).size !==
    snapshot.character.simulation.scheduler.systems.length
  ) {
    throw new Error('Duplicate scheduler system id');
  }
  if (
    new Set(snapshot.character.playerAudio.soundPicker.events.map(({ event }) => event)).size !==
    snapshot.character.playerAudio.soundPicker.events.length
  ) {
    throw new Error('Duplicate sound picker event');
  }
  if (lookup) {
    validateContentReferences(snapshot, lookup);
  }
  return snapshot;
}

function validateWorkItems(tree: readonly { item: ItemState }[], itemsByUid: ReadonlyMap<number, ItemState>): void {
  for (const { item } of tree) {
    if (item.work && (item.type !== WORK_IN_PROGRESS || item.work.elapsed > item.work.duration)) {
      throw new Error('Invalid craft work payload');
    }
    if (item.work?.repairTargetUid !== undefined) {
      const target = itemsByUid.get(item.work.repairTargetUid);
      if (!target || target.uid === item.uid || target.count !== 1) {
        throw new Error('Missing repair target');
      }
    }
  }
}

function ownsLongActionItem(
  job: SaveSnapshot['character']['longAction']['job'],
  tree: readonly { item: ItemState }[],
): boolean {
  if (job?.jobType === 'craft') {
    return tree.some(({ item }) => item.uid === job.workUid && item.work !== undefined);
  }
  if (job?.jobType === 'reading') {
    return tree.some(({ item }) => item.uid === job.bookUid && item.type !== WORK_IN_PROGRESS);
  }
  if (job?.jobType === 'forceDoor') {
    return tree.some(({ item }) => item.uid === job.toolUid && item.type !== WORK_IN_PROGRESS);
  }
  if (job?.jobType === 'treatment') {
    return tree.some(({ item }) => item.uid === job.itemUid && item.type === job.itemType);
  }
  return true;
}

function validateActionReferences(snapshot: SaveSnapshot): void {
  const { job } = snapshot.character.longAction;
  validateLongJob(job, snapshot.character.simulation.time);
  if (
    job?.jobType === 'forceDoor' &&
    !job.stopped &&
    (snapshot.character.simulation.compression.active || snapshot.character.simulation.compression.c !== 1)
  ) {
    throw new Error('Running forcing action cannot use compression');
  }
  const tree = [...savedItemTree(snapshot.character.inventory)];
  const itemsByUid = new Map(tree.map(({ item }) => [item.uid, item]));
  validateWorkItems(tree, itemsByUid);
  if (!ownsLongActionItem(job, tree)) {
    let reason = 'Missing craft work item';
    if (job?.jobType === 'reading') {
      reason = 'Missing reading book';
    } else if (job?.jobType === 'forceDoor') {
      reason = 'Missing forcing tool';
    } else if (job?.jobType === 'treatment') {
      reason = 'Missing treatment item';
    }
    throw new Error(reason);
  }
  if (
    job?.jobType === 'forceDoor' &&
    !snapshot.character.inventory.entities.entities.some(({ uid }) => uid === job.entityUid)
  ) {
    throw new Error('Missing forcing target');
  }
  const { entities } = snapshot.character.inventory;
  if (entities.reserved?.some((uid) => !entities.entities.some((entity) => entity.uid === uid))) {
    throw new Error('Missing reserved block entity');
  }
  if (snapshot.character.player.ladder?.on === false && !grabbedLadder(snapshot)) {
    throw new Error('Missing grabbed ladder');
  }
}

/** The entity a pending ladder grab names, when the save holds it; its content check makes it a ladder. */
function grabbedLadder(
  snapshot: SaveSnapshot,
): SaveSnapshot['character']['inventory']['entities']['entities'][number] | undefined {
  const { ladder } = snapshot.character.player;
  return ladder?.on === false
    ? snapshot.character.inventory.entities.entities.find(({ uid }) => uid === ladder.grabbedUid)
    : undefined;
}

function validateItemContentReferences(
  state: SaveSnapshot['character']['inventory'],
  check: (kind: SaveContentKind, id: string, path: string) => void,
): void {
  for (const { item, path } of savedItemTree(state)) {
    check('item', item.type, `${path}.type`);
    if (item.firearm?.roundType) {
      check('item', item.firearm.roundType, `${path}.firearm.roundType`);
    }
    item.firearm?.cylinder?.chambers.forEach((chamber, index) => {
      if (chamber.state === 'round') {
        check('item', chamber.roundType, `${path}.firearm.cylinder.chambers[${index}].roundType`);
      }
    });
    if (item.firearm?.retainedRoundType) {
      check('item', item.firearm.retainedRoundType, `${path}.firearm.retainedRoundType`);
    }
    item.firearm?.tube?.forEach((type, index) => {
      check('item', type, `${path}.firearm.tube[${index}]`);
    });
    item.firearm?.landings?.forEach(({ type }, index) => {
      check('item', type, `${path}.firearm.landings[${index}].type`);
    });
    item.cartridges?.forEach((type, index) => {
      check('item', type, `${path}.cartridges[${index}]`);
    });
    if (item.work?.kind === 'craft') {
      check('recipe', item.work.recipe, `${path}.work.recipe`);
    } else if (item.work?.kind === 'disassembly') {
      check('item', item.work.source, `${path}.work.source`);
      item.work.outputs.forEach((output, index) => {
        check('item', output.item, `${path}.work.outputs[${index}].item`);
      });
    }
  }
}

function validateContentReferences(snapshot: SaveSnapshot, lookup: SaveContentLookup): void {
  const check = (kind: SaveContentKind, id: string, path: string) => {
    if (!lookup(kind, id)) {
      throw new Error(`Unknown ${kind} content id "${id}" at ${path}`);
    }
  };
  const savedBlocks = snapshot.world.columns.flatMap(({ cx, cz, chunks }) =>
    chunks.flatMap(({ cy, palette }) =>
      palette.map((id, index) => ({ id, path: `world.columns.${cx},${cy},${cz}.palette[${index}]` })),
    ),
  );
  for (const { id, path } of savedBlocks) {
    check('block', id, path);
  }
  if (snapshot.character.scenarioRun) {
    check('scenario', snapshot.character.scenarioRun.scenario, 'character.scenarioRun.scenario');
  }
  for (const skill of Object.keys(snapshot.character.progression.skills)) {
    check('skill', skill, `character.progression.skills.${skill}`);
  }
  for (const skill of Object.keys(snapshot.character.progression.practice)) {
    check('skill', skill, `character.progression.practice.${skill}`);
  }
  for (const [index, recipe] of snapshot.character.progression.knownRecipes.entries()) {
    check('recipe', recipe, `character.progression.knownRecipes[${index}]`);
  }
  if (
    new Set(snapshot.character.progression.knownRecipes).size !== snapshot.character.progression.knownRecipes.length
  ) {
    throw new Error('Duplicate known recipe');
  }
  validateItemContentReferences(snapshot.character.inventory, check);
  for (const [ei, entity] of snapshot.character.inventory.entities.entities.entries()) {
    check('furniture', entity.type, `character.inventory.entities[${ei}].type`);
  }
  const grabbed = grabbedLadder(snapshot);
  if (grabbed) {
    check('climbable', grabbed.type, 'character.player.ladder.grabbedUid');
  }
  snapshot.world.zombies.acidPuddles.forEach((puddle, index) => {
    check('zombie', puddle.type, `world.zombies.acidPuddles[${index}].type`);
  });
  for (const [index, glob] of snapshot.world.zombies.acidGlobs.entries()) {
    check('zombie', glob.type, `world.zombies.acidGlobs[${index}].type`);
  }
  for (const [index, savedZombie] of snapshot.world.zombies.zombies.entries()) {
    check('zombie', savedZombie.zombie.type, `world.zombies[${index}].type`);
  }
  for (const [index, [id]] of snapshot.character.inventory.looted.entries()) {
    check('item', id, `character.inventory.looted[${index}][0]`);
  }
  for (const [index, state] of snapshot.character.playerAudio.soundPicker.events.entries()) {
    check('sound', state.event, `character.playerAudio.soundPicker.events[${index}].event`);
  }
  for (const [index, system] of snapshot.character.simulation.scheduler.systems.entries()) {
    check('scheduler', system.id, `character.simulation.scheduler.systems[${index}].id`);
  }
}

function assertAcidGlobSources(state: ZombieSystemState): void {
  for (const glob of state.acidGlobs) {
    if (glob.source >= state.nextEntityId) {
      throw new Error('Invalid acid glob source');
    }
  }
}

function assertSnapshot(snapshot: SaveSnapshot): void {
  canonicalStringify(snapshot, 'snapshot');
  validateSchema(
    obj({
      world: obj({
        id: str({ nonEmpty: true }),
        columns: arr(
          obj({
            cx: safeInt,
            cz: safeInt,
            chunks: arr(obj({ cy: safeInt, palette: arr(str({ id: true }), 1), runs: arr(savedRun, 1) }), 1),
          }),
        ),
        zombies: obj({
          nextEntityId: positiveInt,
          nextPuddleId: nonNegativeInt,
          zombies: arr(obj({ id: positiveInt, zombie })),
          hordes: arr(horde),
          acidGlobs: arr(acidGlob),
          acidPuddles: arr(acidPuddle),
        }),
        spawned: arr(str({ nonEmpty: true })),
        rolledColumns: arr(str({ nonEmpty: true })),
      }),
      character: obj({
        id: str({ nonEmpty: true }),
        progression,
        scenarioRun,
        simulation,
        player: playerState,
        aim,
        inventory,
        longAction,
        playerCombat,
        lightUid: nullable(positiveInt),
        quickbar: arr(nullable(positiveInt)),
        handling: obj({ jobs: arr(anyJson, 0) }),
        playerAudio,
      }),
    }),
    snapshot,
    'snapshot',
  );
  validateSavedColumns(snapshot.world.columns);
  assertAimState(snapshot.character.aim);
  assertAimWobbleNoiseState(snapshot.character.aim.wobbleNoise);
  validateActionReferences(snapshot);
  assertAcidGlobSources(snapshot.world.zombies);
  const hordes = new Map<string, HordeState>();
  for (const hordeState of snapshot.world.zombies.hordes) {
    if (hordes.has(hordeState.id)) {
      throw new Error(`Duplicate horde ${hordeState.id}`);
    }
    hordes.set(hordeState.id, hordeState);
  }
  for (const { zombie: zombieState } of snapshot.world.zombies.zombies) {
    if ((zombieState.hordeId === undefined) !== (zombieState.hordeOffset === undefined)) {
      throw new Error('Incomplete zombie horde membership');
    }
    if (zombieState.hordeId !== undefined) {
      const hordeState = hordes.get(zombieState.hordeId);
      if (!hordeState || hordeState.type !== zombieState.type) {
        throw new Error(`Invalid horde membership ${zombieState.hordeId}`);
      }
    }
  }
  const blockEntities = snapshot.character.inventory.entities;
  if (blockEntities.nextUid <= Math.max(0, ...blockEntities.entities.map(({ uid }) => uid))) {
    throw new Error('Invalid next block entity id');
  }
  if (snapshot.world.zombies.nextEntityId <= Math.max(0, ...snapshot.world.zombies.zombies.map(({ id }) => id))) {
    throw new Error('Next zombie id does not exceed saved zombie ids');
  }
  if (WORLD_REGION_METRES / (CHUNK * 0.5) <= 0) {
    throw new Error('Invalid region layout');
  }
}

function packPayload(snapshot: SaveSnapshot, worldOptions: SaveWorldOptions): WirePayload {
  assertSnapshot(snapshot);
  validateSchema(worldOptionsSchema, worldOptions, 'worldOptions');
  const wire = makeWirePayload(snapshot, worldOptions);
  return wire;
}

export async function encodeSave(snapshot: SaveSnapshot, options: EncodeSaveOptions): Promise<Uint8Array> {
  const {
    version: requestedVersion,
    worldOptions: requestedWorldOptions,
    generation,
    maxPayloadBytes: configuredLimit,
    buildRevision: requestedBuildRevision,
  } = options;
  const snapshotCopy = structuredClone(snapshot);
  const version = structuredClone(requestedVersion ?? defaultVersion());
  const worldOptions = structuredClone(requestedWorldOptions);
  const maxPayloadBytes = configuredLimit ?? DEFAULT_MAX_PAYLOAD_BYTES;
  validateVersion(version);
  if (!Number.isSafeInteger(generation) || generation < 1) {
    throw new Error('Invalid save generation');
  }
  if (!Number.isSafeInteger(maxPayloadBytes) || maxPayloadBytes < 1) {
    throw new Error('Invalid payload limit');
  }
  const payload = packPayload(snapshotCopy, worldOptions);
  validateSchema(wirePayloadSchema, payload, 'payload');
  validateWire(payload);
  const payloadBytes = canonicalBytes(payload);
  if (payloadBytes.byteLength > maxPayloadBytes) {
    throw new Error(`Payload exceeds configured limit (${payloadBytes.byteLength} > ${maxPayloadBytes} bytes)`);
  }
  const identity: SaveVersionIdentity = {
    digest: await versionDigest(version),
    components: structuredClone(version),
    buildRevision: requestedBuildRevision ?? getBuildRevision(),
  };
  const envelope: Envelope = {
    magic: MAGIC,
    schemaVersion: SAVE_SCHEMA_VERSION,
    versionIdentity: identity,
    generation,
    payloadByteLength: payloadBytes.byteLength,
    checksum: await sha256(payloadBytes),
    payload,
  };
  return gzip(canonicalBytes(envelope));
}

/** Unchecked version metadata of a save this build may refuse, for describing it to the player. */
export async function readSaveVersionMetadata(input: Uint8Array): Promise<Partial<SaveVersionIdentity> | undefined> {
  const envelopeBytes = await gunzipBounded(input.slice(), envelopeLimit(DEFAULT_MAX_PAYLOAD_BYTES));
  const envelope = JSON.parse(new TextDecoder().decode(envelopeBytes)) as unknown;
  return isRecord(envelope) && isRecord(envelope.versionIdentity)
    ? (envelope.versionIdentity as Partial<SaveVersionIdentity>)
    : undefined;
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: ordered refusal gates must remain visible in the public decoder path.
export async function decodeSave(input: Uint8Array | ArrayBuffer, options: DecodeSaveOptions): Promise<DecodedSave> {
  const bytes = input instanceof Uint8Array ? input.slice() : new Uint8Array(input.slice(0));
  const {
    version: expectedVersion,
    buildRevision: runningBuildRevision,
    contentLookup,
    maxPayloadBytes: configuredLimit,
  } = options;
  const running = structuredClone(expectedVersion ?? defaultVersion());
  const maxPayloadBytes = configuredLimit ?? DEFAULT_MAX_PAYLOAD_BYTES;
  if (!Number.isSafeInteger(maxPayloadBytes) || maxPayloadBytes < 1) {
    throw new Error('Invalid payload limit');
  }
  const maxEnvelopeBytes = envelopeLimit(maxPayloadBytes);
  if (bytes.byteLength > maxEnvelopeBytes) {
    throw new Error('Save envelope exceeds configured limit');
  }
  const envelopeBytes = await gunzipBounded(bytes, maxEnvelopeBytes);
  let raw: string;
  let envelope: unknown;
  try {
    raw = new TextDecoder('utf-8', { fatal: true }).decode(envelopeBytes);
    envelope = JSON.parse(raw) as unknown;
  } catch (error) {
    throw new Error('Invalid or truncated UTF-8 JSON save', { cause: error });
  }
  if (!isRecord(envelope)) {
    throw new Error('Invalid save envelope');
  }
  const headerSchema = obj({
    magic: enumeration([MAGIC]),
    schemaVersion: positiveInt,
    versionIdentity: obj({
      digest: str(),
      components: versionComponentsSchema,
      buildRevision: str({ nonEmpty: true }),
    }),
    generation: positiveInt,
    payloadByteLength: nonNegativeInt,
    checksum: str(),
    payload: record(anyJson),
  });
  validateSchema(headerSchema, envelope, 'envelope', true);
  const parsed = envelope as unknown as Envelope;
  if (parsed.schemaVersion !== SAVE_SCHEMA_VERSION) {
    throw new Error(`Save schema mismatch: saved ${parsed.schemaVersion}, running ${SAVE_SCHEMA_VERSION}`);
  }
  validateVersion(parsed.versionIdentity.components);
  if (
    !HASH.test(parsed.versionIdentity.digest) ||
    (await versionDigest(parsed.versionIdentity.components)) !== parsed.versionIdentity.digest
  ) {
    throw new Error('Invalid save version identity digest');
  }
  validateVersion(running);
  const runningDigest = await versionDigest(running);
  if (
    parsed.versionIdentity.digest !== runningDigest ||
    canonicalStringify(identityTuple(parsed.versionIdentity.components)) !== canonicalStringify(identityTuple(running))
  ) {
    const differences = versionDifferences(parsed.versionIdentity.components, running);
    throw new Error(
      `Save version mismatch (${differences.join('; ')}): saved simulation ${parsed.versionIdentity.components.simulationHash} (build ${parsed.versionIdentity.buildRevision}), running simulation ${running.simulationHash} (build ${runningBuildRevision ?? getBuildRevision()})`,
    );
  }
  const payloadBytes = canonicalBytes(parsed.payload, { acceptTaggedNegativeZero: true });
  if (parsed.payloadByteLength > maxPayloadBytes || payloadBytes.byteLength > maxPayloadBytes) {
    throw new Error(`Payload exceeds configured limit (${payloadBytes.byteLength} > ${maxPayloadBytes} bytes)`);
  }
  if (parsed.payloadByteLength !== payloadBytes.byteLength) {
    throw new Error(`Payload length mismatch: declared ${parsed.payloadByteLength}, actual ${payloadBytes.byteLength}`);
  }
  if (!HASH.test(parsed.checksum) || (await sha256(payloadBytes)) !== parsed.checksum) {
    throw new Error('Save checksum mismatch');
  }
  if (canonicalStringify(envelope, '$', { acceptTaggedNegativeZero: true }) !== raw) {
    throw new Error('Non-canonical save encoding');
  }
  const payload = decodeNumberTags(parsed.payload) as WirePayload;
  validateSchema(wirePayloadSchema, payload, 'payload');
  const worldOptions = payload.world.options;
  const snapshot = validateWire(payload, contentLookup);
  return {
    snapshot: freezeSnapshot(snapshot),
    versionIdentity: {
      digest: parsed.versionIdentity.digest,
      components: freezeSnapshot(structuredClone(parsed.versionIdentity.components)) as SaveVersionComponents,
      buildRevision: parsed.versionIdentity.buildRevision,
    },
    generation: parsed.generation,
    worldOptions: freezeSnapshot(structuredClone(worldOptions)) as SaveWorldIdentity,
  };
}
