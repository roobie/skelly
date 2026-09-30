import type { BlockEntityState } from './blockEntities.ts';
import {
  canonicalJsonBytes as canonicalBytes,
  canonicalJsonAt as canonicalStringify,
  decodeCanonicalNumbers as decodeNumberTags,
} from './canonicalJson.ts';
import { CHUNK, CHUNK_VOLUME } from './coords.ts';
import type { InventoryState } from './inventory.ts';
import type { ItemState, PlacedState } from './items.ts';
import type { SaveSnapshot } from './saveState.ts';
import { freezeSnapshot } from './snapshotData.ts';
import type { ZombieState } from './zombies.ts';

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
  site: 'hamlet' | 'testHouse' | 'city';
  storeys: number;
}

export interface SaveWorldIdentity extends SaveWorldOptions {
  seed: number;
  clock: { ratio: number; start: number };
}

export type SaveContentKind = 'block' | 'item' | 'furniture' | 'zombie' | 'sound' | 'scheduler';
export type SaveContentLookup = (kind: SaveContentKind, id: string) => boolean;

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
  maxPayloadBytes?: number;
}

export interface DecodedSave {
  snapshot: Readonly<SaveSnapshot>;
  versionIdentity: SaveVersionIdentity;
  generation: number;
  worldOptions: SaveWorldIdentity;
}

interface Run {
  start: number;
  length: number;
  base: number;
  id: number;
}

interface EncodedChunk {
  cx: number;
  cy: number;
  cz: number;
  order: number;
  palette: string[];
  runs: Run[];
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
    zombieSystem: { playerAttackWait: number; nextEntityId: number };
    blockEntitiesNextUid: number;
    spawned: string[];
  };
  character: {
    id: string;
    simulation: Omit<SaveSnapshot['character']['simulation'], 'seed' | 'clock'>;
    player: SaveSnapshot['character']['player'];
    inventory: Omit<InventoryState, 'piles' | 'entities'>;
    rest: SaveSnapshot['character']['rest'];
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
const SCHEMA_VERSION = 3;
const WORLD_REGION_METRES = 512;
const DEFAULT_MAX_PAYLOAD_BYTES = 50 * 1024 * 1024;
const ID = /^[a-z0-9_]+$/;
const HASH = /^[0-9a-f]{64}$/;
const REGION_KEY = /^(0|-?[1-9]\d*),(0|-?[1-9]\d*)$/;

// `vite.config.ts` supplies source, Git diagnostic, and canonical base-content identities.
declare const __DEADVOX_SIMULATION_HASH__: string;
declare const __DEADVOX_BUILD_REVISION__: string;
declare const __DEADVOX_BASE_CONTENT_HASH__: string;

function defaultVersion(): SaveVersionComponents {
  try {
    return {
      simulationHash: __DEADVOX_SIMULATION_HASH__,
      schemaVersion: SCHEMA_VERSION,
      generators: { worldgen: 'worldgen-v1', shamblerFigure: 'shambler-figure-v1' },
      contentPacks: [{ id: 'deadvox.base', version: '1', canonicalHash: __DEADVOX_BASE_CONTENT_HASH__ }],
    };
  } catch (error) {
    throw new Error('Explicit save version components are required outside a Vite build', { cause: error });
  }
}

function defaultBuildRevision(): string {
  try {
    return __DEADVOX_BUILD_REVISION__;
  } catch {
    return 'unavailable';
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
const lazy = (get: () => Schema): Schema => ({ kind: 'lazy', get });
const anyJson: Schema = { kind: 'json' };

const finite = num();
const safeInt = num({ integer: true, safe: true });
const positiveInt = num({ integer: true, safe: true, min: 1 });
const nonNegativeInt = num({ integer: true, safe: true, min: 0 });
const nonNegative = num({ min: 0 });
const positive = num({ min: Number.MIN_VALUE });
const vec3 = tuple(finite, finite, finite);
const body = obj({ pos: vec3, vel: vec3, halfWidth: positive, height: positive, onGround: bool });
const needs = obj({
  calories: num({ min: 0, max: 100 }),
  hydration: num({ min: 0, max: 100 }),
  fatigue: num({ min: 0, max: 100 }),
  health: num({ min: 0, max: 100 }),
  stamina: num({ min: 0, max: 100 }),
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
  compression: obj({ c: num({ min: 1, max: 30 }), active: bool, interruption: opt(str()) }),
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
  condition: num({ min: 0, max: 1 }),
  charges: opt(nonNegative),
  on: opt(bool),
  made: opt(nonNegative),
  pockets: opt(arr(arr(lazy(() => placedSchema)))),
});
placedSchema = obj({ item: lazy(() => itemSchema), x: nonNegativeInt, y: nonNegativeInt, rotated: bool });
const placedGrid = arr(lazy(() => placedSchema));
const inventoryCore = obj({
  nextItemUid: positiveInt,
  hands: obj({ right: opt(lazy(() => itemSchema)), left: opt(lazy(() => itemSchema)) }),
  worn: obj({
    head: opt(lazy(() => itemSchema)),
    torso: opt(lazy(() => itemSchema)),
    legs: opt(lazy(() => itemSchema)),
    back: opt(lazy(() => itemSchema)),
    waist: opt(lazy(() => itemSchema)),
    hands: opt(lazy(() => itemSchema)),
    feet: opt(lazy(() => itemSchema)),
  }),
  looted: arr(tuple(str({ id: true }), nonNegativeInt)),
});
const blockEntitySchema = obj({
  uid: positiveInt,
  type: str({ id: true }),
  pos: tuple(safeInt, safeInt, safeInt),
  size: tuple(positiveInt, positiveInt, positiveInt),
  facing: enumeration(['n', 'e', 's', 'w']),
  searched: bool,
  open: bool,
  pockets: opt(arr(arr(lazy(() => placedSchema)))),
});
const pileSchema = obj({ pos: tuple(safeInt, safeInt, safeInt), items: placedGrid });
const entitiesState = obj({ nextUid: positiveInt, entities: arr(blockEntitySchema) });
const inventory = obj({
  ...inventoryCore.fields,
  piles: arr(pileSchema),
  entities: entitiesState,
});
const rest = obj({
  action: opt(
    obj({
      kind: enumeration(['rest', 'sleep']),
      label: str({ nonEmpty: true }),
      rate: finite,
      startFatigue: num({ min: 0, max: 100 }),
    }),
  ),
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
const playerAudio = obj({ vocalNoiseId: nonNegativeInt, vocalNoise: nullable(vocalNoise), soundPicker });
const player = obj({ body, yaw: finite, pitch: finite, walk: bool });
const handling = obj({ jobs: arr(anyJson) });
const zombie = obj({
  type: str({ id: true }),
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
  regions: obj({
    head: positive,
    torso: nonNegative,
    leftArm: nonNegative,
    rightArm: nonNegative,
    leftLeg: nonNegative,
    rightLeg: nonNegative,
  }),
  lastPerceived: opt(vec3),
  attackWait: finite,
  attackWindup: finite,
  gaitPhase: finite,
  wanderClock: finite,
  stanceWeight: opt(finite),
  stepOffset: opt(finite),
  hitFlinchTime: opt(nonNegative),
  /** Part names severed so far (mobgen/src/mob/dismember.ts's SEVERABLE_PARTS) — cumulative, never
   * shrinks; see Zombie.severed's own doc comment. */
  severed: arr(str()),
});
const playerState = obj({
  body,
  yaw: finite,
  pitch: finite,
  walk: bool,
});
const playerStateInventory = obj({
  ...inventoryCore.fields,
});
const worldOptionsSchema = obj({
  blockSize: positive,
  site: enumeration(['hamlet', 'testHouse', 'city']),
  storeys: num({ integer: true, safe: true, min: 1, max: 20 }),
});
const worldIdentitySchema = obj({ ...worldOptionsSchema.fields, seed: safeInt, clock });
const versionComponentsSchema = obj({
  simulationHash: str(),
  schemaVersion: positiveInt,
  generators: record(str({ nonEmpty: true })),
  contentPacks: arr(obj({ id: str({ nonEmpty: true }), version: str({ nonEmpty: true }), canonicalHash: str() })),
});

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
            runs: arr(obj({ start: nonNegativeInt, length: positiveInt, base: nonNegativeInt, id: nonNegativeInt }), 1),
          }),
        ),
        zombies: arr(obj({ order: nonNegativeInt, id: positiveInt, zombie })),
        entities: arr(obj({ order: nonNegativeInt, entity: blockEntitySchema })),
        piles: arr(obj({ order: nonNegativeInt, pile: pileSchema })),
      }),
    ),
    zombieSystem: obj({ playerAttackWait: nonNegative, nextEntityId: positiveInt }),
    blockEntitiesNextUid: positiveInt,
    spawned: arr(str({ nonEmpty: true })),
  }),
  character: obj({
    id: str({ nonEmpty: true }),
    simulation: simulationWithoutWorldIdentity,
    player,
    inventory: playerStateInventory,
    rest,
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

function validateVersion(version: SaveVersionComponents): void {
  validateSchema(versionComponentsSchema, version, 'version');
  if (!HASH.test(version.simulationHash)) {
    throw new Error('Invalid simulation source hash');
  }
  if (version.schemaVersion !== SCHEMA_VERSION) {
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
    const describePacks = (packs: SaveVersionComponents['contentPacks']) =>
      packs.map((pack) => `${pack.id}@${pack.version}#${pack.canonicalHash}`).join(', ');
    differences.push(
      `content packs differ (saved [${describePacks(saved.contentPacks)}], running [${describePacks(running.contentPacks)}])`,
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

export async function currentSaveVersionIdentity(): Promise<SaveVersionIdentity> {
  const components = structuredClone(defaultVersion());
  validateVersion(components);
  return {
    digest: await versionDigest(components),
    components,
    buildRevision: defaultBuildRevision(),
  };
}

function regionIndex(blockCoordinate: number, blockSize: number): number {
  return Math.floor((blockCoordinate * blockSize) / WORLD_REGION_METRES);
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
  snapshot.world.diffs.chunks.forEach((chunk, order) => {
    const x = Math.floor(chunk.cx / regionChunks);
    const z = Math.floor(chunk.cz / regionChunks);
    const pairs = chunk.cells.map(({ base, id }) => `${base}\u0000${id}`);
    const palette = [...new Set(chunk.cells.flatMap(({ base, id }) => [base, id]))].sort();
    const paletteIndex = new Map(palette.map((id, index) => [id, index]));
    const runs: Run[] = [];
    for (let index = 0; index < chunk.cells.length; index++) {
      const cell = chunk.cells[index]!;
      const previous = runs.at(-1);
      if (previous && previous.start + previous.length === cell.index && pairs[index] === pairs[index - 1]) {
        previous.length += 1;
      } else {
        runs.push({ start: cell.index, length: 1, base: paletteIndex.get(cell.base)!, id: paletteIndex.get(cell.id)! });
      }
    }
    getRegion(x, z).chunks.push({ cx: chunk.cx, cy: chunk.cy, cz: chunk.cz, order, palette, runs });
  });
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
        playerAttackWait: snapshot.world.zombies.playerAttackWait,
        nextEntityId: snapshot.world.zombies.nextEntityId,
      },
      blockEntitiesNextUid: savedInventory.entities.nextUid,
      spawned: [...snapshot.world.spawned],
    },
    character: {
      id: snapshot.character.id,
      simulation: {
        time: snapshot.character.simulation.time,
        scheduler: snapshot.character.simulation.scheduler,
        needs: snapshot.character.simulation.needs,
        compression: snapshot.character.simulation.compression,
        ...(snapshot.character.simulation.pendingInterrupt === undefined
          ? {}
          : { pendingInterrupt: snapshot.character.simulation.pendingInterrupt }),
        ...(snapshot.character.simulation.dead === undefined ? {} : { dead: snapshot.character.simulation.dead }),
      },
      player: snapshot.character.player,
      inventory: {
        nextItemUid: savedInventory.nextItemUid,
        hands: savedInventory.hands,
        worn: savedInventory.worn,
        looted: savedInventory.looted,
      },
      rest: snapshot.character.rest,
      lightUid: snapshot.character.lightUid,
      quickbar: [...snapshot.character.quickbar],
      handling: snapshot.character.handling,
      playerAudio: snapshot.character.playerAudio,
    },
  };
  return wire;
}

function restoreWirePayload(wire: WirePayload): SaveSnapshot {
  const chunks: { order: number; chunk: SaveSnapshot['world']['diffs']['chunks'][number] }[] = [];
  const zombies: { order: number; id: number; zombie: ZombieState }[] = [];
  const entities: BlockEntityState[] = [];
  const piles: InventoryState['piles'] = [];
  for (const region of Object.values(wire.world.regions)) {
    for (const encoded of region.chunks) {
      const cells: SaveSnapshot['world']['diffs']['chunks'][number]['cells'] = [];
      for (const run of encoded.runs) {
        for (let offset = 0; offset < run.length; offset++) {
          cells.push({ index: run.start + offset, base: encoded.palette[run.base]!, id: encoded.palette[run.id]! });
        }
      }
      chunks.push({ order: encoded.order, chunk: { cx: encoded.cx, cy: encoded.cy, cz: encoded.cz, cells } });
    }
    zombies.push(...region.zombies);
    entities.push(...region.entities.map(({ order: _order, entity }) => entity));
    piles.push(...region.piles.map(({ order: _order, pile }) => pile));
  }
  const ordered = <T extends { order: number }>(values: T[]): T[] => values.sort((a, b) => a.order - b.order);
  const snapshot: SaveSnapshot = {
    world: {
      id: wire.world.id,
      diffs: { chunks: ordered(chunks).map(({ chunk }) => chunk) },
      zombies: { ...wire.world.zombieSystem, zombies: ordered(zombies).map(({ order: _order, ...entry }) => entry) },
      spawned: [...wire.world.spawned],
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
        },
      },
    },
  };
  return snapshot;
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: combines run ordering, palette, and maximality invariants for one chunk.
function encodeChunkRunsValidate(chunks: EncodedChunk[], path: string): void {
  const chunkKeys = new Set<string>();
  for (const [ci, chunk] of chunks.entries()) {
    const chunkPath = `${path}.chunks[${ci}]`;
    const key = `${chunk.cx},${chunk.cy},${chunk.cz}`;
    if (chunkKeys.has(key)) {
      throw new Error(`Duplicate chunk ${key}`);
    }
    chunkKeys.add(key);
    if (
      new Set(chunk.palette).size !== chunk.palette.length ||
      chunk.palette.some((id, i) => i > 0 && chunk.palette[i - 1]! >= id)
    ) {
      throw new Error(`Invalid RLE palette at ${chunkPath}.palette`);
    }
    const used = new Set<number>();
    let end = 0;
    let previous: Run | undefined;
    for (const [ri, run] of chunk.runs.entries()) {
      if (
        run.length === 0 ||
        run.start + run.length > CHUNK_VOLUME ||
        run.start < end ||
        run.base === run.id ||
        run.base >= chunk.palette.length ||
        run.id >= chunk.palette.length
      ) {
        throw new Error(`Malformed RLE run at ${chunkPath}.runs[${ri}]`);
      }
      if (previous && end === run.start && previous.base === run.base && previous.id === run.id) {
        throw new Error(`Non-maximal RLE runs at ${chunkPath}.runs[${ri}]`);
      }
      used.add(run.base);
      used.add(run.id);
      end = run.start + run.length;
      previous = run;
    }
    if (used.size !== chunk.palette.length) {
      throw new Error(`Unused RLE palette entry at ${chunkPath}.palette`);
    }
  }
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: cross-region ID, ordering, and ownership checks are intentionally centralized before restore.
function validateWire(wire: WirePayload, lookup?: SaveContentLookup): SaveSnapshot {
  validateSchema(wirePayloadSchema, wire, 'payload');
  const worldOptions = wire.world.options;
  if (wire.character.handling.jobs.length > 0) {
    throw new Error('Pending handling jobs are not supported in save payloads');
  }
  const regions = new Set<string>();
  const chunkSet = new Set<string>();
  const entityIds = new Set<number>();
  const zombieIds = new Set<number>();
  const itemIds = new Set<number>();
  const anchors = new Set<string>();
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
    const path = `payload.world.regions[${JSON.stringify(regionKey)}]`;
    const [regionX, regionZ] = parseRegionKey(regionKey);
    if (regions.has(regionKey)) {
      throw new Error(`Duplicate region ${regionKey}`);
    }
    regions.add(regionKey);
    if (region.chunks.length + region.zombies.length + region.entities.length + region.piles.length === 0) {
      throw new Error(`Empty region ${regionKey}`);
    }
    encodeChunkRunsValidate(region.chunks, path);
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
      const anchor = entity.pos.join(',');
      if (anchors.has(anchor)) {
        throw new Error(`Duplicate block entity anchor ${anchor}`);
      }
      anchors.add(anchor);
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
  if (new Set(wire.world.spawned).size !== wire.world.spawned.length) {
    throw new Error('Duplicate zombie spawn key');
  }
  for (const key of wire.world.spawned) {
    spawnKeys.add(key);
  }
  const snapshot = restoreWirePayload(wire);
  const walkItem = (item: ItemState, path: string): void => {
    if (itemIds.has(item.uid)) {
      throw new Error(`Duplicate item id ${item.uid} at ${path}`);
    }
    itemIds.add(item.uid);
    for (const [pi, grid] of (item.pockets ?? []).entries()) {
      for (const [ii, placed] of grid.entries()) {
        walkItem(placed.item, `${path}.pockets[${pi}][${ii}].item`);
      }
    }
  };
  const walkPlaced = (placed: PlacedState, path: string): void => walkItem(placed.item, `${path}.item`);
  for (const [side, item] of Object.entries(snapshot.character.inventory.hands)) {
    if (item) {
      walkItem(item, `character.inventory.hands.${side}`);
    }
  }
  for (const [slot, item] of Object.entries(snapshot.character.inventory.worn)) {
    if (item) {
      walkItem(item, `character.inventory.worn.${slot}`);
    }
  }
  for (const [pi, pile] of snapshot.character.inventory.piles.entries()) {
    for (const [ii, placed] of pile.items.entries()) {
      walkPlaced(placed, `character.inventory.piles[${pi}].items[${ii}]`);
    }
  }
  for (const [ei, entity] of snapshot.character.inventory.entities.entities.entries()) {
    for (const [pi, pocket] of (entity.pockets ?? []).entries()) {
      for (const [ii, placed] of pocket.entries()) {
        walkPlaced(placed, `character.inventory.entities[${ei}].pockets[${pi}][${ii}]`);
      }
    }
  }
  const maxItem = [...itemIds].reduce((maximum, id) => Math.max(maximum, id), 0);
  if (snapshot.character.inventory.nextItemUid <= maxItem) {
    throw new Error('Next item id does not exceed saved item ids');
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
  if (
    new Set(snapshot.world.diffs.chunks.map(({ cx, cy, cz }) => `${cx},${cy},${cz}`)).size !==
    snapshot.world.diffs.chunks.length
  ) {
    throw new Error('Duplicate chunk diff');
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

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: one traversal validates every persisted stable content reference before restoration.
function validateContentReferences(snapshot: SaveSnapshot, lookup: SaveContentLookup): void {
  const check = (kind: SaveContentKind, id: string, path: string) => {
    if (!lookup(kind, id)) {
      throw new Error(`Unknown ${kind} content id "${id}" at ${path}`);
    }
  };
  for (const chunk of snapshot.world.diffs.chunks) {
    for (const [index, cell] of chunk.cells.entries()) {
      check('block', cell.base, `world.diffs.chunks.${chunk.cx},${chunk.cy},${chunk.cz}.cells[${index}].base`);
      check('block', cell.id, `world.diffs.chunks.${chunk.cx},${chunk.cy},${chunk.cz}.cells[${index}].id`);
    }
  }
  const visitItem = (item: ItemState, path: string) => {
    check('item', item.type, `${path}.type`);
    for (const [pi, grid] of (item.pockets ?? []).entries()) {
      for (const [ii, placed] of grid.entries()) {
        visitItem(placed.item, `${path}.pockets[${pi}][${ii}].item`);
      }
    }
  };
  for (const [side, item] of Object.entries(snapshot.character.inventory.hands)) {
    if (item) {
      visitItem(item, `character.inventory.hands.${side}`);
    }
  }
  for (const [slot, item] of Object.entries(snapshot.character.inventory.worn)) {
    if (item) {
      visitItem(item, `character.inventory.worn.${slot}`);
    }
  }
  for (const [pi, pile] of snapshot.character.inventory.piles.entries()) {
    for (const [ii, placed] of pile.items.entries()) {
      visitItem(placed.item, `character.inventory.piles[${pi}].items[${ii}].item`);
    }
  }
  for (const [ei, entity] of snapshot.character.inventory.entities.entities.entries()) {
    check('furniture', entity.type, `character.inventory.entities[${ei}].type`);
    for (const [pi, pocket] of (entity.pockets ?? []).entries()) {
      for (const [ii, placed] of pocket.entries()) {
        visitItem(placed.item, `character.inventory.entities[${ei}].pockets[${pi}][${ii}].item`);
      }
    }
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

function assertSnapshot(snapshot: SaveSnapshot): void {
  canonicalStringify(snapshot, 'snapshot');
  validateSchema(
    obj({
      world: obj({
        id: str({ nonEmpty: true }),
        diffs: obj({
          chunks: arr(
            obj({
              cx: safeInt,
              cy: safeInt,
              cz: safeInt,
              cells: arr(obj({ index: nonNegativeInt, base: str({ id: true }), id: str({ id: true }) })),
            }),
          ),
        }),
        zombies: obj({
          playerAttackWait: nonNegative,
          nextEntityId: positiveInt,
          zombies: arr(obj({ id: positiveInt, zombie })),
        }),
        spawned: arr(str({ nonEmpty: true })),
      }),
      character: obj({
        id: str({ nonEmpty: true }),
        simulation,
        player: playerState,
        inventory,
        rest,
        lightUid: nullable(positiveInt),
        quickbar: arr(nullable(positiveInt)),
        handling: obj({ jobs: arr(anyJson, 0) }),
        playerAudio,
      }),
    }),
    snapshot,
    'snapshot',
  );
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
    buildRevision: requestedBuildRevision ?? defaultBuildRevision(),
  };
  const envelope: Envelope = {
    magic: MAGIC,
    schemaVersion: SCHEMA_VERSION,
    versionIdentity: identity,
    generation,
    payloadByteLength: payloadBytes.byteLength,
    checksum: await sha256(payloadBytes),
    payload,
  };
  return canonicalBytes(envelope);
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
  if (bytes.byteLength > maxPayloadBytes + 1024 * 1024) {
    throw new Error('Save envelope exceeds configured limit');
  }
  let raw: string;
  let envelope: unknown;
  try {
    raw = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
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
  if (parsed.schemaVersion !== SCHEMA_VERSION) {
    throw new Error(`Save schema mismatch: saved ${parsed.schemaVersion}, running ${SCHEMA_VERSION}`);
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
      `Save version mismatch (${differences.join('; ')}): saved simulation ${parsed.versionIdentity.components.simulationHash} (build ${parsed.versionIdentity.buildRevision}), running simulation ${running.simulationHash} (build ${runningBuildRevision ?? defaultBuildRevision()})`,
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
