// Content schemas (Valibot). Each schema checks one kind of content's shape, and the
// TypeScript types are inferred from it. References between content (loot tables,
// furniture, zombie types, models) are checked after all files are merged (content.ts).
// Units: grams, millilitres, metres and seconds; inventory space is in cells.

import { MATERIALS } from '@skelly/thing-core/materials';
import { OpticApertureSchema } from '@skelly/thing-core/optic-aperture';
import { ReticleSchema } from '@skelly/thing-core/reticle';
import { ModelPointSchema, modelSchema } from '@skelly/thing-core/schema';
import {
  array,
  check,
  exactOptional,
  finite,
  type InferOutput,
  integer,
  literal,
  maxLength,
  maxValue,
  minLength,
  minValue,
  nonEmpty,
  nullable,
  number,
  omit,
  optional,
  picklist,
  pipe,
  rawCheck,
  record,
  regex,
  safeInteger,
  strictObject,
  string,
  transform,
  tuple,
  union,
  unknown,
  variant,
  boolean as vBoolean,
} from 'valibot';
import { BLUEPRINTS } from '../vehicles/catalogue.ts';
import { solidBlocks } from '../vehicles/solid.ts';
import { ActionTextSchema } from './actionText.ts';
import { hasSegment } from './authoredTerrain.mjs';
import {
  BODY_REGIONS,
  type BodyRegion,
  DAMAGE_KINDS,
  type DamageKind,
  MELEE_DAMAGE_KINDS,
  TOUCHES,
  type Touch,
} from './body.ts';
import { SKILL_LEVEL_MAX, SKILL_LEVEL_MIN } from './character.ts';
import { SPAWN_TIME_NAMES } from './clock.ts';
import { CORE_CONTENT_IDS } from './contentIds.ts';
import { CORE_LABEL_SLOTS, CORE_MESSAGE_SLOTS } from './coreText.ts';
import { DAY_PHASES } from './dayPhase.ts';
import { DECAL_KINDS, type DecalKind } from './decalKinds.ts';
import { FIREARMS_SKILL_ZERO_RANGES } from './firearmsSkill.ts';
import { GraphicsOptionsSchema } from './graphics.ts';
import { ItemEconomySchema, LootContextSchema, UsageSchema } from './loot.ts';
import { MELEE_MOTIONS } from './meleeMotion.ts';
import { MAX_EXPOSURE, MIN_EXPOSURE, TONE_KEYS } from './mood.ts';
import { POWER_UNITS, PowerDeviceSchema, PowerTuningSchema, unitCount } from './powerContent.ts';
import { hasReadableWords, isReadablePlainText, READABLE_TEXT_LIMIT, READABLE_TITLE_LIMIT } from './readable.ts';
import { SCENARIO_KINDS } from './scenarioKinds.ts';
import { shapeBlocks } from './shapeSolid.ts';
import { SOUND_EVENT_IDS } from './soundEvents.ts';
import { jfxrPresetIssues } from './soundSynth.ts';
import { SLOT_PATTERN } from './textTemplate.ts';
import {
  gameHours,
  gameMinutes,
  gamePerHour,
  gameTimeOfDay,
  realSeconds,
  simAcceleration,
  simPerMinute,
  simRate,
  simSeconds,
} from './time.ts';
import { TREE_SHAPES, type TreeShape } from './treeShapes.ts';
import { WEATHERING_RANGES } from './weather.ts';
import { ZOMBIE_REGION_NAMES } from './zombieRegionNames.ts';

const ID_PATTERN = /^[a-z0-9_]+$/;
const CALIBRE_ID_PATTERN = /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/;

const Id = pipe(string(), regex(ID_PATTERN, 'must be lowercase letters, digits and _'));
const CalibreId = pipe(string(), regex(CALIBRE_ID_PATTERN, 'must be a cartridge-data id'));
const Name = pipe(string(), nonEmpty('must not be empty'));
const Color = pipe(string(), regex(/^#[0-9a-fA-F]{6}$/, 'expected "#rrggbb"'));
const NonNegative = pipe(number(), minValue(0, 'must be 0 or more'));
const Positive = pipe(number(), minValue(Number.MIN_VALUE, 'must be more than 0'));
const Count = pipe(number(), integer('must be a whole number'), minValue(0, 'must be 0 or more'));
const SkillLevel = pipe(
  number(),
  integer('must be a whole number'),
  minValue(SKILL_LEVEL_MIN, `must be at least ${SKILL_LEVEL_MIN}`),
  maxValue(SKILL_LEVEL_MAX, `must be at most ${SKILL_LEVEL_MAX}`),
);
const Fraction = pipe(number(), minValue(0, 'must be 0 to 1'), maxValue(1, 'must be 0 to 1'));
const skillZeroFactor = ({ min, max }: { min: number; max: number }) =>
  pipe(number(), minValue(min, `must be at least ${min}`), maxValue(max, `must be at most ${max}`));
const FirearmsSkillZeroEffectSchema = strictObject({
  variance: skillZeroFactor(FIREARMS_SKILL_ZERO_RANGES.variance),
  recoilKickScale: skillZeroFactor(FIREARMS_SKILL_ZERO_RANGES.recoilKickScale),
  recoilRecoveryScale: skillZeroFactor(FIREARMS_SKILL_ZERO_RANGES.recoilRecoveryScale),
});
const FirearmsSkillZeroHandlingSchema = strictObject({
  singleShot: FirearmsSkillZeroEffectSchema,
  automaticFollowup: FirearmsSkillZeroEffectSchema,
});
const QualityLevel = pipe(number(), integer('must be a whole number'), minValue(1), maxValue(5));
const SimSeconds = pipe(NonNegative, transform(simSeconds));
const PositiveSimSeconds = pipe(Positive, transform(simSeconds));
const PositiveRealSeconds = pipe(Positive, transform(realSeconds));
const SimRate = pipe(Positive, transform(simRate));
const NonNegativeSimRate = pipe(NonNegative, transform(simRate));
const SimAcceleration = pipe(Positive, transform(simAcceleration));
const SimDurationRange = strictObject({ min: PositiveSimSeconds, max: PositiveSimSeconds });
const PositiveGameHours = pipe(Positive, transform(gameHours));
const PositiveGameMinutes = pipe(Positive, transform(gameMinutes));
const GameMinutes = pipe(NonNegative, transform(gameMinutes));
const GamePerHour = pipe(Positive, transform(gamePerHour));
const SimPerMinute = pipe(Positive, transform(simPerMinute));
const GameTimeOfDay = pipe(
  string(),
  regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/, 'expected HH:MM'),
  transform((text) => {
    const [hours, minutes] = text.split(':').map(Number);
    return gameTimeOfDay(hours! * 3600 + minutes! * 60);
  }),
);

/** An inclusive [min, max] range. */
const range = <S extends typeof Count | typeof Fraction>(item: S) =>
  pipe(
    tuple([item, item]),
    check(([min, max]) => min <= max, 'min must not be more than max'),
  );

/** [x, y, z] in blocks. */
const Size = tuple([
  pipe(Count, minValue(1, 'must be at least 1')),
  pipe(Count, minValue(1, 'must be at least 1')),
  pipe(Count, minValue(1, 'must be at least 1')),
]);

// ---- blocks ----

/**
 * Procedural surface patterns, drawn in the chunk shader. The index is the id the mesher
 * emits and the shader switches on (render/chunks.ts), so append, never reorder.
 */
export const BLOCK_PATTERNS = [
  'none',
  'brick',
  'planks',
  'cobble',
  'dressed',
  'rough',
  'tiles',
  'siding',
  'corrugated',
  'shingles',
  'noise',
  'camo',
] as const;

const BlockSchema = strictObject({
  id: Id,
  name: Name,
  color: Color,
  /** Blocks movement independently of sight and render geometry. */
  solid: vBoolean(),
  /** Blocks sight/aim/picking; ordinary blocks inherit their movement rule when omitted. */
  opaque: optional(vBoolean()),
  soundBlocking: optional(vBoolean()),
  /** A medium the body can be in, such as water; never derived from `solid`, since air is not solid either. */
  liquid: optional(vBoolean()),
  meleePass: optional(
    strictObject({
      motions: array(picklist(MELEE_MOTIONS)),
      minimumZombieReachMetres: Positive,
    }),
  ),
  /** Poles stay inside the occupied cell, so they need no separate collision rule. */
  fencePosts: optional(
    strictObject({
      widthBlocks: pipe(Positive, maxValue(1)),
      spacingBlocks: pipe(number(), integer(), minValue(1)),
    }),
  ),
  /** Open wire geometry; wireFraction controls coverage, while color supplies the tint. */
  wireMesh: optional(
    strictObject({
      cellsPerBlock: pipe(number(), integer(), minValue(1), maxValue(16)),
      wireFraction: pipe(number(), minValue(0.01), maxValue(0.5)),
    }),
  ),
  /** Content-owned brushing events: gentle movement and fast movement. */
  rustle: optional(strictObject({ gentle: picklist(SOUND_EVENT_IDS), fast: picklist(SOUND_EVENT_IDS) })),
  /**
   * Authored ground-contact events, one per actor family. Omitted means the block is silent underfoot,
   * which is the built-in air's case; authored walkable blocks select both events explicitly.
   */
  footsteps: optional(
    strictObject({
      player: picklist(SOUND_EVENT_IDS),
      shambler: picklist(SOUND_EVENT_IDS),
    }),
  ),
  /** Surface pattern; `none` when omitted. */
  pattern: optional(picklist(BLOCK_PATTERNS)),
  /** Whether render-only site weathering may affect this built material. */
  weatherable: optional(vBoolean()),
  /** Four-colour palette read only by the `camo` surface pattern. */
  patternPalette: optional(tuple([Color, Color, Color, Color])),
  /** Washout amount in [0, 1], read only by the `camo` surface pattern. */
  patternWashout: optional(pipe(number(), minValue(0), maxValue(1))),
});

// ---- items ----

const ITEM_CATEGORIES = [
  'food',
  'drink',
  'medical',
  'tool',
  'weapon',
  'clothing',
  'bag',
  'light',
  'battery',
  'ammo',
  'material',
  'book',
  'note',
  'misc',
] as const;

/** What a fitted vehicle part provides; the game supports these, so content naming another is refused. */
const VEHICLE_CAPABILITIES = [
  'steered',
  'driven',
  'power',
  'fuel',
  'electricity',
  'storage',
  'seat',
  /** A door or hatch a player gets in through. */
  'entry',
  'light',
  'glazing',
  'protection',
  /** Frame, tray or mount that other fittings rest on. */
  'structure',
  /** A road wheel, the part a vehicle rolls on. */
  'wheel',
  /** Raises heavy loads; the part names its rated load. */
  'lift',
  /** Braces a lifting vehicle against the ground; a vehicle that lifts needs one. */
  'stabiliser',
  /** A floor a cargo space can rest on (`src/core/cargoSpace.ts`, `freeFloor`). */
  'load_floor',
] as const;
export type VehicleCapability = (typeof VEHICLE_CAPABILITIES)[number];

/** Eyes sits beside the head so goggles stack with a helmet or headlamp (`DESIGN.md`, "The item model"). */
const CLOTHING_SLOTS = ['head', 'eyes', 'torso', 'vest', 'legs', 'back', 'waist', 'hands', 'feet'] as const;
/** The shoulder holds a slung long gun, never clothing (`DESIGN.md`, "Shoulder and sling"). */
const WEAR_SLOTS = [...CLOTHING_SLOTS, 'shoulder'] as const;

export type WearSlot = (typeof WEAR_SLOTS)[number];

const Cells = pipe(Count, minValue(1, 'must be at least 1'));

/** Width and height in inventory cells. */
const Area = tuple([Cells, Cells]);

const PocketSchema = strictObject({
  name: optional(Name),
  /** Its grid: the only limit on what fits (`DESIGN.md`, "The item model"). */
  grid: Area,
  /** Sim seconds to take an item out or put one in, before the per-cell part. */
  handlingSimSeconds: SimSeconds,
});

const ContainerSchema = strictObject({
  pockets: pipe(array(PocketSchema), nonEmpty('needs at least one pocket')),
  /** Why its pockets need more than the inventory width tuning allows. */
  wideReason: optional(pipe(string(), nonEmpty('must not be empty'))),
});

/** Ordered lower bounds with a word each; the first starts at 0 and each rises, so every value in [0, 1] reads as one band. */
const ConditionBandsSchema = pipe(
  array(strictObject({ from: Fraction, word: Name })),
  nonEmpty('needs at least one band'),
  rawCheck(({ dataset, addIssue }) => {
    if (!dataset.typed) {
      return;
    }
    dataset.value.forEach(({ from }, index) => {
      if (index === 0 && from !== 0) {
        addIssue({ message: `bands[${index}].from must be 0 so no value is left without a word` });
      } else if (index > 0 && !(from > dataset.value[index - 1]!.from)) {
        addIssue({ message: `bands[${index}].from must be above the band before it, or bands overlap` });
      }
    });
  }),
);

const InventoryTuningSchema = strictObject({
  id: Id,
  /** What a condition reads as (`DESIGN.md`, "The item model"); furniture reads the same table. */
  conditionBands: ConditionBandsSchema,
  /** The real side of one inventory cell; footprints and pockets are real sizes rounded up to it (`DESIGN.md`, "The item model"). */
  cellMetres: Positive,
  /** Maximum width, in cells, for a container pocket without a content-owned exception. */
  containerMaxWidthCells: Cells,
  /** Most pile states validation explores for one ground supply before calling it unproven (`DESIGN.md`, "Loot"). */
  groundPileStateCap: Cells,
  /** Metres from the chest to the nearest point of a pile, furniture box or body for inventory actions. */
  reachMetres: Positive,
  /** Metres above the feet at which reach is measured. */
  chestHeightMetres: Positive,
  /** Metres within which a looked-at furniture piece can be used. */
  useReachMetres: Positive,
  /** Searching a container takes `minSimSeconds` for an empty one, rising linearly to `maxSimSeconds` at `cellsForMax` pocket cells. */
  search: strictObject({ minSimSeconds: SimSeconds, maxSimSeconds: SimSeconds, cellsForMax: Cells }),
  /** Sim seconds a thrown item takes from the hand to where it lands. */
  throwFlightSimSeconds: Positive,
  /** Metres a thrown item rises above the straight line from hand to landing, at mid-flight. */
  throwArcHeightMetres: NonNegative,
  /** Air resistance on a thrown item (`DESIGN.md`, "Held-item throws"). */
  throwDrag: strictObject({
    airDensityKgPerCubicMetre: NonNegative,
    /** Drag coefficient against the item's footprint area; it folds in the shape and how much of the footprint faces the air. */
    footprintDragCoefficient: NonNegative,
  }),
  /** Carrying furniture in both hands (`DESIGN.md`, "Moving furniture"). */
  furnitureMove: strictObject({
    /** The largest piece the player can lift, along each side. */
    maxSizeMetres: Positive,
    /** Stamina curves for moving furniture: each drains `base + perKg * massKg`. */
    fatigue: strictObject({
      lift: strictObject({ base: NonNegative, perKg: NonNegative }),
      drag: strictObject({ base: NonNegative, perKg: NonNegative }),
      carry: strictObject({ basePerSimSecond: SimRate, perKgPerSimSecond: SimRate }),
    }),
    slide: strictObject({
      stepSimSeconds: PositiveSimSeconds,
    }),
    /** How the carried piece shows in first person, in view metres (x right, y up, z back from the eye). */
    carriedView: strictObject({
      offsetMetres: tuple([number(), number(), number()]),
      /** The piece's longest side is drawn this long, so a big piece doesn't fill the view. */
      sizeMetres: Positive,
      /** How far it rises and sinks while held, and how many times a real second. */
      bobMetres: NonNegative,
      bobPerRealSecond: NonNegative,
    }),
  }),
});

/** Text whose `{slot}` names are exactly `slots`, so a template can't drop or invent what code fills in. */
const slotted = (slots: readonly string[]) =>
  pipe(
    Name,
    check(
      (text) => {
        const named = new Set([...text.matchAll(SLOT_PATTERN)].map(([, slot]) => slot));
        return named.size === slots.length && slots.every((slot) => named.has(slot));
      },
      slots.length === 0
        ? 'must not name a {slot}'
        : `must name exactly ${slots.map((slot) => `{${slot}}`).join(', ')}`,
    ),
  );

const slottedTable = <K extends string>(slots: Readonly<Record<K, readonly string[]>>) =>
  strictObject(
    Object.fromEntries(Object.entries<readonly string[]>(slots).map(([key, names]) => [key, slotted(names)])) as Record<
      K,
      ReturnType<typeof slotted>
    >,
  );

/** Labels and messages the screens under `src/ui` draw. */
const UiScreenTextSchema = strictObject({
  powerControl: slottedTable({ on: [], off: [] }),
  charger: slottedTable({
    idle: [],
    running: [],
    noPower: [],
    ready: [],
    start: [],
    stop: [],
    collect: [],
    load: ['name'],
    remaining: ['gameSeconds'],
  }),
  /** The opened vehicle: its parts, empty service sites and service work. */
  vehicle: slottedTable({
    inspect: ['key', 'vehicle'],
    heading: ['vehicle', 'distance'],
    empty: ['site'],
    remove: [],
    install: ['part'],
    noPart: [],
    removing: ['part'],
    installing: ['part'],
  }),
  /** What the HUD options call each element they switch. */
  hudOptionLabels: strictObject({
    stats: Name,
    clock: Name,
    details: Name,
    crosshair: Name,
    interaction: Name,
    interactionOutline: Name,
    quickbar: Name,
    handling: Name,
    messages: Name,
  }),
  /** What the audio options call each volume. */
  audioVolumeLabels: strictObject({ master: Name, world: Name, body: Name, ui: Name }),
  /** The fixed pointer input each unbindable pointer action names. */
  pointerButtonLabels: strictObject({ 'hand.use-dominant': Name, 'hand.off-instant': Name, 'pointer.look': Name }),
  /** What the win card says about saving the completed attempt. */
  winCheckpointMessages: strictObject({ saved: Name, pending: Name, failed: Name, unavailable: Name }),
  /** The HUD, audio, graphics and fullscreen options in the menu. */
  options: slottedTable({
    hudHeading: [],
    showHud: ['key'],
    audioHeading: [],
    volume: ['category'],
    graphicsHeading: [],
    on: [],
    off: [],
    modDefault: [],
    urlOverride: [],
    fullscreen: [],
    leaveFullscreen: [],
    browserShortcutsLabel: [],
    browserShortcuts: ['shortcuts'],
  }),
  inputOptions: slottedTable({
    heading: [],
    browserControlsLabel: [],
    storageLabel: [],
    storage: [],
    capturing: ['action'],
    cancel: [],
    saved: [],
    fixedHeading: [],
    fixedControl: ['code', 'action'],
    reset: [],
    restored: [],
  }),
  worldLoading: slottedTable({ loading: [], failed: ['error'], reload: [] }),
  /** The main menu's play button before and after the world starts. */
  menu: slottedTable({ play: [], continue: [] }),
  credits: slottedTable({
    heading: [],
    none: [],
    back: [],
    byAuthor: ['author'],
    fromHost: ['host'],
    licence: ['licence'],
    changes: ['changes'],
  }),
  death: slottedTable({
    heading: [],
    cause: ['cause', 'span'],
    seed: ['seed'],
    summary: ['searched', 'loot'],
    noLoot: [],
    lootCount: ['count', 'item'],
    feedback: [],
    newWorld: [],
    spanLong: ['hrs', 'mins'],
    spanShort: ['mins'],
  }),
  win: slottedTable({ heading: [], seed: ['seed'], played: ['hrs'], export: [], newWorld: [], freshAttempt: [] }),
  rest: slottedTable({ waiting: [], fallingAsleep: [], until: ['rest', 'clock'], stop: ['key'] }),
  /** The continue-or-stop prompt an interruption raises, on the rest card and in the world prompt. */
  prompt: slottedTable({ interruption: ['reason'], continue: ['key'], stop: ['key'] }),
  reading: slottedTable({ putAway: [], putAwayLabel: [], progress: [], text: [] }),
  crafting: slottedTable({
    heading: [],
    headingFact: [],
    length: ['span'],
    found: ['item', 'found', 'needed'],
    use: ['choice'],
    group: ['recipe', 'group'],
    quality: ['quality', 'best', 'required'],
    skill: ['skill', 'level', 'required'],
    station: ['station'],
    craft: ['item'],
    repair: ['item'],
    repairName: ['item'],
    cheapestAvailable: [],
    noMatches: [],
    noRepairTarget: [],
    repairing: ['item'],
    inProgress: ['item'],
    disassembly: ['item'],
    mins: ['value'],
    secs: ['value'],
  }),
  /** The handling meter and quickbar while the inventory is closed. */
  handling: slottedTable({
    throwForce: [],
    pause: ['key'],
    next: ['job'],
    progress: ['done', 'total'],
    minimumRelease: ['percent'],
  }),
  quickbar: slottedTable({
    empty: [],
    inRightHand: [],
    inLeftHand: [],
    worn: [],
    pocket: ['container', 'secs'],
    count: ['item', 'count'],
  }),
  /** The optional stats, clock and details readout lines. */
  stats: slottedTable({
    health: ['value'],
    blood: ['value'],
    stamina: ['value'],
    sprinting: [],
    light: ['value'],
    food: ['value'],
    water: ['value'],
    fatigue: ['value'],
    pain: ['value'],
    painTier: ['value', 'tier'],
    painParts: ['acute', 'injuries', 'relief'],
    bleeding: ['tier', 'region'],
    bleedingWarning: ['tier', 'region'],
    speed: ['speed'],
    paused: [],
    carrying: ['kg'],
    fps: ['fps'],
    seed: ['seed'],
    radius: ['radius'],
    walking: ['key'],
    jogging: ['key'],
    position: ['x', 'y', 'z'],
    chunks: ['meshed', 'pending'],
    looking: ['name'],
  }),
  /** The interaction hint for the looked-at target and the carried piece. */
  interaction: slottedTable({
    action: ['key', 'action'],
    open: ['name'],
    close: ['name'],
    force: ['name', 'method'],
    blocked: ['action', 'reason'],
    lock: ['lock'],
    bar: [],
    barDoor: ['name'],
    liftBar: [],
    hold: ['key', 'action'],
    climb: ['name'],
    read: ['name'],
    rest: ['name'],
    sleep: ['name'],
    search: ['name'],
    lookIn: ['name'],
    damaged: ['damage', 'name'],
    turn: ['key'],
    tip: ['key'],
  }),
  primaryAction: slottedTable({ nothingToDo: ['item'] }),
  mods: slottedTable({
    heading: [],
    jsonLabel: [],
    jsonFact: ['maxBytes'],
    storageFailed: [],
    input: [],
    inputLabel: [],
    add: [],
    upload: [],
    up: [],
    down: [],
    remove: [],
    moveUp: ['mod'],
    moveDown: ['mod'],
    removeLabel: ['mod'],
    valid: [],
    start: [],
    httpOnly: [],
    httpStatus: ['status'],
    emptyResponse: [],
    tooLarge: ['maxBytes'],
    fetchFailed: [],
    jsonOnly: [],
  }),
  /** The practice run's objective lines and buttons; each label sits beside its action's key cap. */
  tutorial: slottedTable({
    inventory: [],
    closeInventory: [],
    quickAction: [],
    wieldSelectedItem: [],
    eatBeans: [],
    openedBeans: [],
    openCan: [],
    canOfBeans: [],
    forward: [],
    back: [],
    left: [],
    right: [],
    look: [],
    openDoor: [],
    selectPrevious: [],
    selectNext: [],
    takeSelected: [],
    wieldSelected: [],
    wearOrRemove: [],
    searchSupplies: [],
    beansAndOpener: [],
    drink: [],
    waterBottle: [],
    switchOff: [],
    switchOn: [],
    flashlight: [],
    crouch: [],
    exitPath: [],
    mainMenu: [],
    revolver: [],
    pumpShotgun: [],
    ammunitionDetails: [],
    wieldAmmunitionBox: [],
    carryLooseAmmunition: [],
    wearBackpack: [],
    ready: [],
    fireDominant: [],
    fireOff: [],
    load: [],
    pump: [],
    closeCylinder: [],
    boxedAmmunition: [],
    unpackDominant: [],
    unpackOff: [],
    partialLoad: [],
    readyFire: [],
    sightsOff: [],
    reloadAfterFiring: [],
    sightedFire: [],
    sights: [],
    unloadLiveRounds: [],
    unload: [],
    emptyHands: [],
    putDownSelected: [],
    stowSelected: [],
    enGarde: [],
    punch: [],
    weaponsComplete: [],
    weaponsPractice: [],
    finishPractice: [],
    rangeSupplies: [],
    loadingDetail: [],
    pumpingDetail: [],
    unsaved: [],
    practiceControls: [],
    restart: [],
    exit: [],
  }),
  /** Save discovery, checkpoint and recovery status on the title and pause card. */
  save: slottedTable({
    insecurePage: [],
    apisUnavailable: [],
    debugRun: [],
    noSavedWorld: [],
    checkingSaves: [],
    checkingCompatibility: [],
    checkingStorage: [],
    scanning: [],
    storageUnavailable: ['error'],
    storageUnavailableFallback: [],
    continueUnavailable: [],
    corrupt: ['error'],
    survivorDied: [],
    available: ['version'],
    availableCorruptSlots: ['version', 'slots'],
    cannotLoad: ['error'],
    version: ['build', 'digest'],
    unreadableVersion: [],
    unknownBuild: [],
    unknownVersion: [],
    olderPreserved: ['namespace', 'version'],
    damagedPreserved: ['namespace'],
    persistentStorage: ['backend', 'bytes'],
    bestEffortStorage: ['backend'],
    validCorruptSlots: ['slots'],
    continued: [],
    clockRatioMismatch: [],
    incompatible: ['error'],
    newWorld: [],
    replaceSaved: [],
    needsRecoveryLabel: [],
    needsRecovery: [],
    playWithoutSaving: [],
    unreadable: ['error'],
    failure: ['what', 'error'],
    storageRequestFailed: [],
    exportFailed: [],
    saveFailed: [],
    saved: ['generation', 'reason'],
    saveFailedFor: ['reason', 'error'],
    couldNotStart: ['error'],
    chooseHand: [],
    newWorldReady: [],
    newWorldReadyUnsaved: ['problem'],
    noSnapshot: [],
    snapshotExported: [],
    snapshotExportFailed: ['error'],
    persistGranted: [],
    persistRefused: [],
    persistUnsupported: [],
    persistFailed: ['error'],
    recordsExported: [],
    recordsExportFailed: ['error'],
    storageLabel: [],
    storageFact: [],
    reasonWon: [],
    reasonHidden: [],
    reasonClosed: [],
    reasonPeriodic: [],
    reasonSleep: [],
    reasonDeath: [],
    reasonRetry: [],
  }),
  inventory: slottedTable({
    heading: [],
    headingFact: [],
    carrying: ['weight'],
    tabsLabel: [],
    tabItems: [],
    tabSkills: [],
    tabCrafting: [],
    tabActions: [],
    find: [],
    findLabel: [],
    needsLabel: [],
    controls: [],
    controlLine: ['key', 'action'],
    assignQuickbar: ['keys'],
    you: [],
    rightHand: [],
    leftHand: [],
    reserved: ['item'],
    splitterLabel: [],
    around: [],
    onFloor: ['distance'],
    bagOnFloor: ['bag'],
    atFeet: [],
    furniture: ['name', 'distance'],
    pocket: ['number'],
    pocketName: [],
    pocketReach: ['pocket', 'span'],
    searching: [],
    searchIt: ['key'],
    noSelection: [],
    inspect: [],
    whereItCanGo: [],
    firearmSlots: [],
    slot: ['slot', 'item'],
    open: [],
    fit: ['item'],
    remove: [],
    battery: ['battery'],
    count: ['item', 'count'],
    countBadge: ['count'],
    itemTitle: ['item', 'condition'],
    weightSize: ['weight', 'width', 'height', 'condition'],
    recipe: ['recipe'],
    takingApart: ['item'],
    progress: ['done', 'total'],
    stacks: ['count'],
    twoHanded: [],
    food: ['calories', 'water'],
    quality: ['quality', 'level'],
    melee: ['damage', 'type', 'reach', 'recovery'],
    light: ['radius', 'seenFrom'],
    worn: ['slot', 'encumbrance'],
    pockets: ['sizes'],
    pocketSize: ['width', 'height'],
    notWornThere: [],
    body: [],
    vitals: ['health', 'blood', 'shock'],
    regionDamage: ['damage'],
    infection: ['infection'],
    skillsHeading: [],
    level: ['level'],
    practice: ['practice', 'next'],
    practiceMax: ['practice'],
    skillProgress: ['skill'],
    actionsHeading: [],
    wait: [],
    wakeAt: [],
    whenRested: [],
    earlier: [],
    later: [],
    doingNext: [],
    doingNextFact: [],
    queueLeft: ['span', 'key'],
    nothingQueued: [],
    nothingToSearch: [],
    noRoom: [],
    taking: ['count', 'category'],
    noneToTake: ['category'],
    secs: ['value'],
    kg: ['value'],
    viewerClose: ['key'],
  }),
});

export type ScreenText = InferOutput<typeof UiScreenTextSchema>;

const UiTuningSchema = strictObject({
  id: Id,
  screenText: UiScreenTextSchema,
  /** Multiplies every UI margin, padding and gap; below 1 packs the UI for smaller screens. */
  spacing: Positive,
  /** Multiplies the root font size the UI is measured in; the world canvas is not scaled. */
  hudScale: Positive,
  /** The sound event played when the player tries an action that cannot be completed. */
  refusalSound: picklist(SOUND_EVENT_IDS),
  /** The audio options' volumes before the player saves any. */
  audioVolumes: strictObject({ master: Fraction, world: Fraction, body: Fraction, ui: Fraction }),
  /** What the rest card calls each kind of rest. */
  restLabels: strictObject({ rest: Name, sleep: Name }),
  /** Why a door will not close: the player, or something else, is standing in its way. */
  doorCloseBlockedMessages: strictObject({ player: Name, other: Name }),
  /**
   * Why a piece of furniture can't be lifted, turned, put down or removed, and what the player says on dropping it
   * worn out.
   */
  furnitureMoveMessages: strictObject({
    tooBig: Name,
    carryInstead: Name,
    floorOnly: Name,
    slideTired: Name,
    fastened: Name,
    handsFull: Name,
    tired: Name,
    standingOn: Name,
    someoneOnIt: Name,
    holdsUp: Name,
    holdsItems: Name,
    barricaded: Name,
    reserved: Name,
    fallsOnPlayer: Name,
    fallsOnOther: Name,
    nowhereToLand: Name,
    noRoom: Name,
    playerInWay: Name,
    otherInWay: Name,
    coversHatch: Name,
    hatchCovered: Name,
    blocksLadder: Name,
    outOfReach: Name,
    wornOut: Name,
    emptyHands: Name,
    staysUpright: Name,
  }),
  actionText: ActionTextSchema,
  /** Core's refusals and notices, by the key code asks for. */
  coreMessages: slottedTable(CORE_MESSAGE_SLOTS),
  /** What core's item, door and work options are called, by the key code asks for. */
  coreActionLabels: slottedTable(CORE_LABEL_SLOTS),
  /** What the inventory screen calls each wear slot. */
  wearSlotLabels: strictObject({
    head: Name,
    eyes: Name,
    torso: Name,
    vest: Name,
    legs: Name,
    back: Name,
    waist: Name,
    hands: Name,
    feet: Name,
    shoulder: Name,
  }),
});

const SaveTuningSchema = strictObject({
  id: Id,
  /** Simulated seconds of play between periodic checkpoints, independent of the clock ratio. */
  checkpointSimSeconds: PositiveSimSeconds,
  /** Real seconds without a completed save before a running game confirms page exit. */
  leaveConfirmationRealSeconds: PositiveRealSeconds,
});

/** A dimensionless time multiplier; 1 runs at the normal Sim rate. */
const CompressionCap = pipe(number(), minValue(1, 'must be at least 1'));

const CompressionTuningSchema = strictObject({
  id: Id,
  /** The highest compression each compressing long action ramps to; prying always runs at 1×. */
  caps: strictObject({
    wait: CompressionCap,
    rest: CompressionCap,
    sleep: CompressionCap,
    craft: CompressionCap,
    reading: CompressionCap,
    treatment: CompressionCap,
  }),
});

const WearableSchema = pipe(
  strictObject({
    slot: picklist(CLOTHING_SLOTS),
    figureFit: optional(Id),
    viewModel: optional(
      strictObject({
        model: Id,
        tint: Fraction,
        darkening: Fraction,
      }),
    ),
    /** 0–100: how much it slows and hampers you. */
    encumbrance: pipe(NonNegative, maxValue(100, 'must be 0 to 100')),
    warmth: optional(pipe(NonNegative, maxValue(100, 'must be 0 to 100'))),
    wearPerDamage: optional(NonNegative),
    protects: optional(record(picklist(DAMAGE_KINDS), pipe(NonNegative, maxValue(1)))),
    /** Damage kinds that neither reach the wearer through it nor wear it (`DESIGN.md`, "Worn coverage"). */
    imperviousTo: optional(
      pipe(
        array(picklist(DAMAGE_KINDS)),
        check((kinds) => new Set(kinds).size === kinds.length, 'impervious damage kinds must be unique'),
      ),
    ),
  }),
  check(
    (wearable) => wearable.figureFit === undefined || wearable.slot === 'torso',
    'an under-layer fit requires the torso slot',
  ),
  check(
    (wearable) => wearable.viewModel === undefined || wearable.slot === 'head',
    'a first-person model requires the head slot',
  ),
  check(
    (wearable) => !(wearable.imperviousTo ?? []).some((kind) => wearable.protects?.[kind] !== undefined),
    'protected damage kinds must not also be impervious',
  ),
);

const FoodSchema = pipe(
  strictObject({
    /** Kilocalories. */
    calories: NonNegative,
    /** Millilitres of water it gives. */
    water: NonNegative,
    /** Sim seconds to eat or drink one. */
    consumeSimSeconds: PositiveSimSeconds,
    /** Game hours until it spoils; absent means it keeps. */
    rotsAfterGameHours: optional(PositiveGameHours),
    /** Share of `rotsAfterGameHours` after which it reads as going off; required for food that spoils. */
    goingOffFraction: optional(pipe(Positive, maxValue(1, 'must be at most 1'))),
    /** Health lost to eating it once rotten; required for food that spoils. */
    poisonHealth: optional(Positive),
  }),
  check(
    (food) =>
      food.rotsAfterGameHours === undefined
        ? food.goingOffFraction === undefined && food.poisonHealth === undefined
        : food.goingOffFraction !== undefined && food.poisonHealth !== undefined,
    'food that spoils needs goingOffFraction and poisonHealth, and food that keeps has neither',
  ),
);

const ToolSchema = strictObject({
  /** Quality levels, such as { "prying": 2 }. */
  qualities: record(Id, QualityLevel),
  /** It runs on a swappable canister: the item type that fits it, and Sim seconds to swap one in. */
  fuel: optional(strictObject({ canister: Id, swapSimSeconds: PositiveSimSeconds })),
});

/** The fill shape of a battery, for a canister a fuelled tool draws on. */
const CanisterSchema = strictObject({
  /** Fill when full, in the units a forcing method's `fuel` spends. */
  capacity: Positive,
});

/** Holding the attack past the wind-up builds a stronger strike. Doc: `docs/charged-attacks.md`. */
const MeleeChargeSchema = strictObject({
  /** Sim seconds of holding that reach the full charge; holding longer adds nothing. */
  fullSimSeconds: PositiveSimSeconds,
  /** Shapes the build-up: the charge level is the held share of `fullSimSeconds` raised to this power. */
  curveExponent: Positive,
  /** Damage multiplier at the full charge; a partial charge scales linearly towards it. */
  damageMultiplier: Positive,
  /** Impulse multiplier at the full charge; a partial charge scales linearly towards it. */
  impulseMultiplier: Positive,
  /** Extra stamina a full charge costs on release, scaled by the charge level. */
  stamina: NonNegative,
});
export type MeleeCharge = InferOutput<typeof MeleeChargeSchema>;

const WeaponSchema = strictObject({
  melee: strictObject({
    motion: picklist(MELEE_MOTIONS),
    damage: Positive,
    /** Metres beyond the player's hand; the arm's reach is added when swinging. */
    reach: Positive,
    /** Sim seconds between swings. */
    cooldownSimSeconds: PositiveSimSeconds,
    stamina: NonNegative,
    /** Share of the cooldown a swing winds up before contact, capped by `windupCapSimSeconds`. */
    contactFraction: Fraction,
    /** The longest wind-up before contact, in sim seconds. */
    windupCapSimSeconds: PositiveSimSeconds,
    /** Impulse delivered by a melee hit, in N·s; it is also the strike's strength against a door. */
    impulse: NonNegative,
    /** Condition lost when this weapon lands a melee hit. */
    wearPerHit: optional(Fraction),
    /** Overrides the weapon class's per-hit damage spread. */
    damageVariance: optional(Fraction),
    /** Overrides the weapon class's head-hit damage multiplier. */
    headDamageMultiplier: optional(Positive),
    /** Overrides the weapon class's limb-hit damage multiplier. */
    limbDamageMultiplier: optional(Positive),
    /** Overrides the weapon class's swing-speed multiplier. */
    speedMultiplier: optional(Positive),
    /** Swing presentation event; absent uses the shared swing. */
    swingSound: optional(Id),
    /** Hit presentation event; absent uses the shared hit. */
    hitSound: optional(Id),
    /** Played over the hit, such as a metal ring for a metal weapon. */
    hitLayerSound: optional(Id),
    type: picklist(MELEE_DAMAGE_KINDS),
    charge: optional(MeleeChargeSchema),
  }),
});

/** The bare-handed attack, which no item supplies. */
const UnarmedAttackSchema = strictObject({
  motion: picklist(MELEE_MOTIONS),
  damage: Positive,
  /** Metres beyond the player's hand; the arm's reach is added when swinging. */
  reach: Positive,
  /** Sim seconds between swings. */
  cooldownSimSeconds: PositiveSimSeconds,
  stamina: NonNegative,
  contactFraction: Fraction,
  windupCapSimSeconds: PositiveSimSeconds,
  impulse: NonNegative,
});

const MeleeClassSchema = pipe(
  strictObject({
    id: picklist([...MELEE_DAMAGE_KINDS, 'fists']),
    /** Fractional spread applied symmetrically around base weapon damage. */
    damageVariance: Fraction,
    headDamageMultiplier: Positive,
    limbDamageMultiplier: Positive,
    /** Multiplies swing speed; cooldown is divided by this value. */
    speedMultiplier: Positive,
    /** Present exactly on the `fists` class, whose attack has no weapon item to carry it. */
    unarmed: optional(UnarmedAttackSchema),
  }),
  check(
    (meleeClass) => (meleeClass.id === CORE_CONTENT_IDS.fistsMeleeClass) === (meleeClass.unarmed !== undefined),
    'only the fists melee class carries an unarmed attack, and it must',
  ),
);

const RoundFeedPoseSchema = pipe(
  strictObject({
    pickupEnd: NonNegative,
    approachEnd: NonNegative,
    thumbEnd: NonNegative,
    pickupSide: NonNegative,
    pickupBelow: NonNegative,
    pickupBack: NonNegative,
    palmBelow: NonNegative,
    palmBack: NonNegative,
    thumbLift: NonNegative,
    thumbTravel: NonNegative,
  }),
  check(
    (pose) =>
      pose.pickupEnd > 0 && pose.pickupEnd < pose.approachEnd && pose.approachEnd < pose.thumbEnd && pose.thumbEnd < 1,
    'feed phases must increase strictly between zero and one',
  ),
);
export type RoundFeedPoseTuning = InferOutput<typeof RoundFeedPoseSchema>;

const FirearmSchema = strictObject({
  pump: optional(vBoolean()),
  bolt: optional(vBoolean()),
  roundLoadSimSeconds: optional(PositiveSimSeconds),
  /** Shot presentation event; every firearm selects one, so a new gun needs no code edit. */
  shotSound: Id,
  /** Shot event while a suppressor is fitted; required when the model can mount one. */
  suppressedShotSound: optional(Id),
  /** Low-frequency layer played with the shot, for a gun whose report needs more body than one recording has; skipped while suppressed. */
  shotBodySound: optional(Id),
  /** Trigger pulled on an empty chamber; absent stays silent. */
  dryFireSound: optional(Id),
  /** The trigger pull cocks the hammer itself (double action), so every empty pull clicks; otherwise only working the action re-cocks it. */
  triggerCocks: optional(vBoolean()),
  /** A bolt gun's open and close strokes; each plays on its own phase, so a bolt gun needs both. */
  boltOpenSound: optional(Id),
  boltCloseSound: optional(Id),
  /** Camera-local aim kick per committed shot, scaled by firearms control. */
  recoilKickRadians: Positive,
  /** Half-angle of the firearm's independent per-round cone; pump firearms must set zero because pellet spread owns their cone. */
  dispersionRadians: pipe(NonNegative, maxValue(Math.PI / 2, 'must be at most a right angle')),
  /** Multiplies an ammunition item's pellet spread, so the firearm owns its choke. */
  pelletSpreadScale: Positive,
  /** Optional per-gun skill-zero endpoints; absent guns use firearms-combat's shared factors. */
  skillZeroHandling: optional(FirearmsSkillZeroHandlingSchema),
  /** Reload handling times at skill 0, before the firearms skill's reload factor. */
  revolver: optional(
    strictObject({
      doubleActionPullSimSeconds: PositiveSimSeconds,
      doubleActionDispersionRadians: pipe(NonNegative, maxValue(Math.PI / 2)),
      recoverySimSeconds: PositiveSimSeconds,
      openSimSeconds: PositiveSimSeconds,
      ejectSimSeconds: PositiveSimSeconds,
      pickSimSeconds: PositiveSimSeconds,
      loadSimSeconds: PositiveSimSeconds,
      loadPose: RoundFeedPoseSchema,
      closeSimSeconds: PositiveSimSeconds,
      cockSimSeconds: PositiveSimSeconds,
    }),
  ),
  handling: strictObject({
    /** Taking the fitted magazine out and drawing one in; required for a magazine-fed gun. */
    magazine: optional(
      strictObject({
        removeSimSeconds: PositiveSimSeconds,
        insertSimSeconds: PositiveSimSeconds,
      }),
    ),
  }),
});
/** Per projectile (one rifle bullet, or each pellet); damage, push and reach are gameplay estimates, not ballistics. */
const AmmoSchema = strictObject({
  calibre: CalibreId,
  pellets: pipe(Count, minValue(1), maxValue(64)),
  /** Base half-angle for pellet directions; the firearm's choke scale multiplies it. */
  spreadDegrees: pipe(NonNegative, maxValue(90, 'must be at most a right angle')),
  diameterMm: Positive,
  /** Region health a projectile takes, before the zombie's per-region pierce resistance. */
  damage: Positive,
  /** Push in N·s on the struck body. */
  impulse: Positive,
  /** Hitscan reach. */
  rangeMetres: Positive,
  /** Scales `damage` on a head hit; absent means 1. */
  headDamageMultiplier: optional(Positive),
  /** Sim seconds to press one into a magazine, before the firearms skill's reload factor. */
  loadSimSeconds: PositiveSimSeconds,
  /** Sim seconds to strip one out of a magazine, before the firearms skill's reload factor. */
  stripSimSeconds: PositiveSimSeconds,
});

export const BeamSpillSchema = strictObject({
  /** Off keeps the tunables authored but renders the plain cone; a mod or `torchspill=1` turns it on. */
  enabled: vBoolean(),
  radiusRatio: pipe(number(), finite(), minValue(1 + Number.EPSILON)),
  intensity: pipe(number(), finite(), minValue(0), maxValue(1 - Number.EPSILON)),
});
export type BeamSpill = InferOutput<typeof BeamSpillSchema>;

/** How bright light in view flares through the goggles (`src/render/nightVisionFlare.ts`, `nightVisionFlare`). */
const NightVisionFlareSchema = strictObject({
  /** How hard the summed sources wash the view out; 0 turns the flare off. */
  strength: NonNegative,
  /** Metres at which a source's flare falls to half. */
  distanceMetres: Positive,
  /** A blast fireball's brightness to the goggles at the moment of the blast. */
  blastIntensity: NonNegative,
  /** Time constant of the after-image. */
  recoverRealSeconds: PositiveRealSeconds,
  /** A halo's radius at a light, as a share of the picture's size. */
  haloRadius: pipe(Positive, maxValue(1, 'must be at most 1')),
});

const NightVisionSchema = strictObject({
  /** Multiplies the scene's linear light before tone mapping. */
  gain: Positive,
  /** The colour the picture's brightness is shown in. */
  tint: Color,
  /** Peak-to-peak grain, in display-referred colour (0..1). */
  grain: Fraction,
  /**
   * The narrowed field of view: the picture darkens from `inner` to `outer` (distances from its centre, as shares
   * of its size) and by `darkening` beyond.
   */
  edge: pipe(
    strictObject({ darkening: Fraction, inner: Fraction, outer: Fraction }),
    check((edge) => edge.inner < edge.outer, 'inner must be less than outer'),
  ),
  flare: NightVisionFlareSchema,
});
export type NightVision = InferOutput<typeof NightVisionSchema>;

const LightSchema = strictObject({
  /** Metres it lights up. */
  radius: Positive,
  /** Metres from which others can see it (`DESIGN.md`, "Light"). */
  seenFrom: Positive,
  /** Point-light colour, and intensity in the light units the renderer draws and the simulation measures. */
  color: Color,
  intensity: Positive,
  /** Material glow for sources that remain visible when outside the point-light pool. */
  emissive: optional(NonNegative),
  /** Total burn in Game hours for a consumable flame/light. */
  burnTimeGameHours: optional(PositiveGameHours),
  /** Fuel units consumed per Game hour, for self-fueled sources such as a lighter. */
  fuelPerGameHour: optional(GamePerHour),
  liquidFuel: optional(
    strictObject({
      accepts: pipe(array(Id), minLength(1)),
      microlitresPerGameSecond: pipe(Positive, integer(), maxValue(Number.MAX_SAFE_INTEGER)),
    }),
  ),
  /** A cone-shaped beam; absent means light all around. */
  beam: optional(
    strictObject({
      /** Full width of the cone, in degrees. */
      angleDegrees: pipe(Positive, maxValue(180, 'must be at most 180')),
      /** Share of the cone, from its edge inward, over which the beam fades to dark; the rest is the hotspot. */
      penumbra: pipe(number(), minValue(0, 'must be at least 0'), maxValue(1, 'must be at most 1')),
      decay: NonNegative,
      spill: optional(BeamSpillSchema),
    }),
  ),
  burning: optional(
    strictObject({
      ignition: picklist(['manual', 'firestarter', 'snap']),
      douse: vBoolean(),
      sprint: picklist(['stay', 'douse']),
      stow: picklist(['refuse', 'douse', 'stay']),
      drop: picklist(['douse', 'stay']),
      relight: vBoolean(),
    }),
  ),
  /** Size of the drawn flame, in metres, standing on the model's `flame` anchor while lit. */
  flame: optional(strictObject({ heightMetres: Positive, radiusMetres: Positive })),
  /** What powers it: an item with a battery component, and charge used per Game hour. */
  power: optional(
    strictObject({
      battery: Id,
      compatibleBatteries: optional(array(Id)),
      chargePerGameHour: GamePerHour,
      swapSimSeconds: PositiveSimSeconds,
    }),
  ),
  /** Stays lit while worn and answers the worn-light control, so a source not in the hand needs no new key. */
  wornSwitch: optional(vBoolean()),
  /** How the view looks through it while worn, on and charged (`DESIGN.md`, "Light"). */
  nightVision: optional(NightVisionSchema),
});

const IgniterSchema = strictObject({ capacity: Positive, perIgnition: Positive });

/** A thrown charge whose fuse starts when it leaves the hand (`DESIGN.md`, "Hand grenade"). */
const ExplosiveSchema = strictObject({
  fuseSimSeconds: PositiveSimSeconds,
  /**
   * Region health taken from every region of a body whose centre the blast sees, and the push in N·s on it, both
   * falling to none at the radius.
   */
  blast: strictObject({ radiusMetres: Positive, damage: Positive, impulse: Positive }),
  /**
   * Seeded rays through the shot hit test; each takes `damage` from the region it strikes. Every ray is traced
   * against the bodies in range when the charge goes off, so the count sets that moment's cost.
   */
  fragments: strictObject({
    count: pipe(Count, minValue(1, 'must be at least 1'), maxValue(1000, 'must be at most 1000')),
    damage: Positive,
    rangeMetres: Positive,
    /** Push in N·s on the struck body. */
    impulse: Positive,
  }),
  /** Sound event at detonation; its noise draws zombies. */
  sound: picklist(SOUND_EVENT_IDS),
});

/** A trap set on the floor that springs on whatever enters its cell (`SLICE-5.md`, "Settled bear-trap rules — issue #107"). */
const TrapSchema = strictObject({
  setSimSeconds: PositiveSimSeconds,
  /** One uninterrupted bare-hands attempt; an interrupted attempt starts again from nothing. */
  disarmSimSeconds: PositiveSimSeconds,
  /** How long its jaws hold a caught leg before the victim pulls free. */
  holdSimSeconds: PositiveSimSeconds,
  /** The player's wound when it springs on them. */
  playerInjury: strictObject({ region: picklist(BODY_REGIONS), damage: Positive, kind: picklist(DAMAGE_KINDS) }),
  /** Health taken from a caught zombie's legs, shared between those not yet destroyed. */
  zombieLegDamage: NonNegative,
});

/** Tagged with its model's attachment kind, so each kind authors every effect it has and no other. */
const FirearmAttachmentEffectsSchema = variant('kind', [
  strictObject({
    kind: literal('suppressor'),
    /** Fraction of the firearm's committed recoil kick removed at full condition. */
    recoilReduction: Fraction,
    /** Condition lost per committed shot; zero means the attachment does not wear. */
    wearPerShot: Fraction,
    /** Firearms Combat level required to fit this suppressor; removing it remains open. */
    fitSkillLevel: SkillLevel,
    /** Player-facing refusal when the character lacks the fitting skill. */
    fitRefusal: Name,
  }),
  strictObject({
    kind: literal('foregrip'),
    /** Multipliers applied to the existing aim and stance response. */
    swayScale: Positive,
    recoveryScale: Positive,
    raiseScale: Positive,
    swingScale: Positive,
    wearPerShot: Fraction,
  }),
]);

const BatterySchema = strictObject({
  /** Charge when full, in the units lights use per hour. */
  capacity: Positive,
  rechargeable: optional(strictObject({ microjoulesPerCharge: pipe(number(), safeInteger(), minValue(1)) })),
});

export const HELD_DISPLAY_KIND = { compass: 'compass' } as const;
const HELD_DISPLAY_KINDS = Object.values(HELD_DISPLAY_KIND);
export const PILE_DISPLAY_KIND = { scatter: 'scatter' } as const;
const PILE_DISPLAY_KINDS = Object.values(PILE_DISPLAY_KIND);

const BookSchema = strictObject({
  title: Name,
  recipes: pipe(array(Id), nonEmpty('needs at least one recipe')),
  /** Game minutes spent reading. */
  readingGameMinutes: PositiveGameMinutes,
});

const readableText = (limit: number) =>
  pipe(
    string(),
    check(hasReadableWords, 'must contain non-whitespace text'),
    check(isReadablePlainText, 'must be plain text without markup or control characters'),
    maxLength(limit, `must be at most ${limit} characters`),
  );
const ReadableSchema = strictObject({
  title: readableText(READABLE_TITLE_LIMIT),
  text: readableText(READABLE_TEXT_LIMIT),
});

const ItemCountSchema = strictObject({ item: Id, count: pipe(Count, minValue(1, 'must be at least 1')) });
const YieldRounding = picklist(['floor', 'round', 'ceil']);
const SkillFractions = pipe(
  array(Fraction),
  minLength(2, `needs a skill-${SKILL_LEVEL_MIN} and top-skill fraction`),
  maxLength(SKILL_LEVEL_MAX - SKILL_LEVEL_MIN + 1, 'extends beyond the maximum skill level'),
  check((fractions) => fractions.every((fraction, i) => i === 0 || fraction >= fractions[i - 1]!), 'must not decrease'),
  check((fractions) => fractions.at(-1)! > fractions[0]!, 'must increase with skill'),
);
const ToolFractionBonus = pipe(
  array(Fraction),
  minLength(1, 'needs a bonus for at least one tool level'),
  check((fractions) => fractions.every((fraction, i) => i === 0 || fraction >= fractions[i - 1]!), 'must not decrease'),
);
const DisassemblyYieldSchema = strictObject({
  ...ItemCountSchema.entries,
  /** Multiplier by skill level: index 0 is skill 0; the last entry is this yield's top level. */
  fractions: SkillFractions,
  /** Applied independently to this yield's scaled count. */
  rounding: YieldRounding,
  toolModifier: optional(
    strictObject({
      quality: Id,
      /** Additions by tool quality level: index 0 is level 1; higher levels saturate at the last entry. */
      bonusByLevel: ToolFractionBonus,
    }),
  ),
});
const DisassemblySchema = strictObject({
  /** Game minutes. */
  timeGameMinutes: PositiveGameMinutes,
  skill: Id,
  yields: pipe(array(DisassemblyYieldSchema), nonEmpty('needs at least one yield')),
});
/** What one dose of a painkiller does to felt pain (`DESIGN.md`, "Pain"); it heals nothing. */
const AnalgesicSchema = strictObject({
  /** Painkillers that share one cap; an item without a group is its own. */
  group: optional(Id),
  /** Handling time to take one dose. */
  takeSimSeconds: PositiveSimSeconds,
  /** Pain one dose takes off at its peak. */
  reliefPerDose: Positive,
  /** The most relief the group's doses give together, so a repeat dose adds less. */
  maxRelief: Positive,
  /** Game minutes for a dose's relief to rise from nothing to its peak; 0 reaches the peak on taking. */
  onsetGameMinutes: GameMinutes,
  /** Game minutes it holds at its peak. */
  peakGameMinutes: GameMinutes,
  /** Game minutes it then takes to fall back to nothing; 0 stops at once. */
  fadeGameMinutes: GameMinutes,
  /** Edge blur and darkening at a dose's peak, as a share of full; it follows the dose's relief curve. */
  vignette: optional(Fraction),
});

/** What one application does to a body wound (`DESIGN.md`, "Bleeding"). */
const TreatmentSchema = pipe(
  strictObject({
    /** Strength: the bleeding one application closes before its roll and modifiers, in `treatmentEffort` units. */
    bleeding: optional(Positive),
    /** The infection stages one application can resolve, and its chance to. */
    infection: optional(
      strictObject({
        stages: pipe(array(picklist(['early', 'advanced'])), nonEmpty('must name a stage')),
        chance: Fraction,
      }),
    ),
  }),
  check(
    (treatment) => treatment.bleeding !== undefined || treatment.infection !== undefined,
    'must treat bleeding or infection',
  ),
);

const LiquidVolumeMicrolitres = pipe(number(), safeInteger(), minValue(0));
const LiquidContentsSchema = union([
  strictObject({ kind: literal('empty') }),
  strictObject({
    kind: literal('filled'),
    liquid: Id,
    volumeMicrolitres: pipe(LiquidVolumeMicrolitres, minValue(1)),
  }),
]);
const LiquidSchema = strictObject({ id: Id, name: Name, densityGramsPerMillilitre: pipe(Positive, finite()) });
const VesselSchema = strictObject({
  capacityMicrolitres: pipe(LiquidVolumeMicrolitres, minValue(1)),
  accepts: pipe(array(Id), nonEmpty()),
  initialContents: LiquidContentsSchema,
  pour: optional(
    strictObject({
      incrementMicrolitres: pipe(LiquidVolumeMicrolitres, minValue(1)),
      microlitresPerSimSecond: pipe(Positive, finite()),
    }),
  ),
});

export type LiquidContents = InferOutput<typeof LiquidContentsSchema>;

const ItemSchema = strictObject({
  id: Id,
  economy: ItemEconomySchema,
  workInProgress: vBoolean(),
  notLoot: vBoolean(),
  name: Name,
  category: picklist(ITEM_CATEGORIES),
  weight: optional(NonNegative),
  /** Cells it takes in a grid, as [w, h]; it can be rotated. */
  size: Area,
  description: optional(string()),
  /** Extra words a player may type to find it on the inventory screen, besides its name. */
  keywords: optional(array(Name)),
  /** Identical, stateless instances stack, up to this many (nails, batteries). */
  stack: optional(pipe(Count, minValue(2, 'must be at least 2'))),
  /** Held in both hands. */
  twoHanded: optional(vBoolean()),
  container: optional(strictObject({ ...ContainerSchema.entries, rigid: optional(vBoolean()) })),
  wearable: optional(WearableSchema),
  figureModels: optional(
    array(
      strictObject({
        model: Id,
        overTorso: optional(record(Id, Id)),
        frame: Id,
        covers: optional(array(Id)),
        pivot: tuple([number(), number(), number()]),
        at: tuple([number(), number(), number()]),
        turn: tuple([number(), number(), number()]),
      }),
    ),
  ),
  food: optional(FoodSchema),
  serving: optional(strictObject({ food: Id, empty: Id })),
  treatment: optional(TreatmentSchema),
  analgesic: optional(AnalgesicSchema),
  tool: optional(ToolSchema),
  weapon: optional(WeaponSchema),
  firearm: optional(FirearmSchema),
  ammo: optional(AmmoSchema),
  /** Sealed, non-container payload: held primary activation opens one package. */
  unpack: optional(
    strictObject({
      item: Id,
      count: pipe(Count, minValue(1, 'must be at least 1')),
      simSeconds: PositiveSimSeconds,
      qualities: optional(record(Id, QualityLevel)),
      inPlace: optional(vBoolean()),
    }),
  ),
  /** An authored yield for a finished item; never inferred from recipe alternatives. */
  disassembly: optional(DisassemblySchema),
  /** Fixed outputs for found items with no recipe. */
  salvage: optional(pipe(array(ItemCountSchema), nonEmpty('needs at least one salvage output'))),
  /** Work time to salvage; required with `salvage`, forbidden without it. */
  salvageTimeGameMinutes: optional(PositiveGameMinutes),
  light: optional(LightSchema),
  igniter: optional(IgniterSchema),
  explosive: optional(ExplosiveSchema),
  trap: optional(TrapSchema),
  readable: optional(ReadableSchema),
  paperMap: optional(literal(true)),
  /** Display capability shown in first person; later devices can share this rendering seam. */
  heldDisplay: optional(picklist(HELD_DISPLAY_KINDS)),
  /** How the item appears when it is in a ground pile. */
  pileDisplay: optional(picklist(PILE_DISPLAY_KINDS)),
  book: optional(BookSchema),
  battery: optional(BatterySchema),
  canister: optional(CanisterSchema),
  vessel: optional(VesselSchema),
  /** A working alarm clock: carried, it lets a sleep run to a chosen wake hour. */
  alarm: optional(literal(true)),
  /** Initial ADS power for a variable-power optic; constrained by its exported range. */
  opticMagnification: optional(Positive),
  opticZoom: optional(strictObject({ step: Positive, rememberPerWeapon: vBoolean() })),
  /** Deadvox-owned handling/wear tuning for a fitted firearm attachment. */
  firearmAttachmentEffects: optional(FirearmAttachmentEffectsSchema),
  /** Fits a long gun's sling mount, so the gun can be carried on the shoulder. */
  sling: optional(vBoolean()),
  /** A light mount: fits a long gun whose `lightMountSite` has the same kind, where gungen exports no rail for it. */
  lightMount: optional(strictObject({ kind: Id })),
  /** Where a long gun takes a `lightMount` of the same kind: a frame in the gun model's metres and XYZ degrees. */
  lightMountSite: optional(
    strictObject({
      kind: Id,
      at: tuple([number(), number(), number()]),
      turn: tuple([number(), number(), number()]),
    }),
  ),
  /** One authored/global lock id; no per-placement key payload. */
  key: optional(strictObject({ lock: Id })),
  /**
   * Dropped across a closed door from the side the player stands on, it bars the door from the other side
   * (`DESIGN.md`, "Door bar"). Held in both hands to set; `look` draws it on the door.
   */
  doorBar: optional(
    strictObject({
      setSimSeconds: PositiveSimSeconds,
      liftSimSeconds: PositiveSimSeconds,
      look: strictObject({ color: Color, thickness: Positive }),
    }),
  ),
  /** Its model (the `models` section); without one it's a bundle in a pile and a box in the hand. */
  model: optional(Id),
  /** A vehicle part: blueprints may fit it, and its model must export parts with baked collision. */
  vehicle: optional(
    strictObject({
      /** Content identity of the service interface this loose part can occupy. */
      mount: optional(Id),
      capabilities: pipe(
        array(picklist(VEHICLE_CAPABILITIES)),
        check((list) => new Set(list).size === list.length, 'capabilities must be distinct'),
      ),
      /** Channel-specific blockers; a physical fitting need not hide, shade, hear or stop a strike. */
      obstruction: strictObject({
        sight: vBoolean(),
        light: vBoolean(),
        sound: vBoolean(),
        combat: vBoolean(),
      }),
      /** The heaviest load a `lift` part raises; one rating, not a chart over reach. */
      ratedLoadKg: optional(Positive),
      /**
       * A cargo space: a block whose footprint is its one pocket (`DESIGN.md`, "Vehicles", **Cargo space.**).
       * Its block is a fitting's `cargo` cells, whatever voxels its model is drawn in.
       */
      cargoSpace: optional(
        strictObject({
          /** Sim seconds to take an item out or put one in, before the per-cell part. */
          handlingSimSeconds: SimSeconds,
          /** The clearance above a free-floor cell with nothing over it, in cells. */
          openClearanceCells: Cells,
          /** Why its pocket may be wider than the inventory width tuning allows. */
          wideReason: optional(pipe(string(), nonEmpty('must not be empty'))),
        }),
      ),
    }),
  ),
});

const VehicleFittingSchema = strictObject({
  id: Id,
  /** An item with a `vehicle` block. */
  part: Id,
  /** Where the part's model origin sits, in vehicle metres: x forward, y up, z toward the near side. */
  at: ModelPointSchema,
  /** Reflected across z about `at`: the other side's placement of an unhanded part. */
  mirror: optional(literal(true)),
  /** Every fitting it rests on; an authored structural choice, not inferred from contact. */
  supportedBy: array(Id),
  /** A factory cargo space's size in inventory cells along x, y and z; its pocket is x by z. */
  cargo: optional(tuple([Cells, Cells, Cells])),
  /** Requirements for servicing this site; omitted sites are not player-serviceable. */
  service: optional(
    strictObject({
      /** What the opened vehicle calls this site while it is empty. */
      name: Name,
      mount: Id,
      durationSimSeconds: PositiveSimSeconds,
      qualities: record(Id, QualityLevel),
    }),
  ),
});

/** A factory build, as a vehicle authoring export: parts by item id, placed and supported. */
const VehicleBlueprintSchema = strictObject({
  id: Id,
  name: Name,
  fittings: pipe(
    array(VehicleFittingSchema),
    nonEmpty('needs at least one fitting'),
    check((list) => new Set(list.map(({ id }) => id)).size === list.length, 'fitting ids must be distinct'),
  ),
});

// ---- models ----

/** [x, y, z] in the model file's metres. */
const Point = ModelPointSchema;

/**
 * A glTF binary in the pack, in metres, lying at rest on the ground with its long side
 * along x (`DESIGN.md`, "Piles and item models"). The entry adds what the file can't say.
 */
const SoundMultipliers = pipe(
  tuple([Positive, Positive]),
  check(([min, max]) => min <= max, 'minimum must not exceed maximum'),
);

/** A jfxr preset as the jfxr editor saves it, named so picks and the sound sheet can tell it apart. */
const SoundRecipeSchema = strictObject({
  recipe: Id,
  jfxr: pipe(
    record(string(), unknown()),
    rawCheck(({ dataset, addIssue }) => {
      if (dataset.typed) {
        for (const message of jfxrPresetIssues(dataset.value)) {
          addIssue({ message });
        }
      }
    }),
  ),
});

const SoundSchema = strictObject({
  id: Id,
  /** What makes the sound play, as the listening sheet tells a tester how to hear it. */
  description: Name,
  /** A `?debug=1` shortcut that makes the sound easier to reach on the listening sheet. */
  debugHint: optional(Name),
  variants: pipe(
    array(
      union([
        pipe(string(), regex(/^assets\/audio\/[a-z0-9_.-]+\.ogg$/, 'expected an Ogg file under assets/audio/')),
        SoundRecipeSchema,
      ]),
    ),
    nonEmpty('needs at least one variant'),
    check((variants) => {
      const names = variants.flatMap((v) => (typeof v === 'string' ? [] : [v.recipe]));
      return new Set(names).size === names.length;
    }, 'recipe names must be unique within a sound'),
  ),
  gain: pipe(Positive, maxValue(1, 'must be at most 1')),
  lowShelf: optional(strictObject({ frequencyHz: Positive, gainDb: pipe(number(), finite()) })),
  /** Scrambles the voice: a carrier of this frequency multiplies the sample by `1 - depth + depth * carrier`. */
  ringMod: optional(strictObject({ frequencyHz: Positive, depth: pipe(Positive, maxValue(1, 'must be at most 1')) })),
  pitchJitter: SoundMultipliers,
  gainJitter: SoundMultipliers,
  minIntervalSimSeconds: SimSeconds,
  category: picklist(['world', 'body', 'ui']),
  noise: strictObject({ enabled: vBoolean(), radiusMetres: Positive }),
  /** Most voices of this sound at once; a new one steals the oldest so a burst stays bounded. Absent is uncapped. */
  voiceCap: optional(pipe(Count, minValue(1, 'must be at least 1'))),
  wall: optional(
    strictObject({
      gain: pipe(NonNegative, maxValue(1, 'must be at most 1')),
      cutoffHz: Positive,
    }),
  ),
});

const UnitVector = pipe(
  Point,
  check(([x, y, z]) => Math.abs(Math.hypot(x, y, z) - 1) <= 1e-6, 'must be a unit vector'),
);

const ActionCycleSchema = pipe(
  strictObject({
    durationSimSeconds: PositiveSimSeconds,
    rearwardSimSeconds: PositiveSimSeconds,
    dwellSimSeconds: SimSeconds,
    forwardSimSeconds: PositiveSimSeconds,
    unlockSimSeconds: optional(PositiveSimSeconds),
    lockSimSeconds: optional(PositiveSimSeconds),
  }),
  check(
    (cycle) =>
      (cycle.unlockSimSeconds ?? 0) +
        cycle.rearwardSimSeconds +
        cycle.dwellSimSeconds +
        cycle.forwardSimSeconds +
        (cycle.lockSimSeconds ?? 0) <=
      cycle.durationSimSeconds + 1e-9,
    'cycle phases must fit within durationSimSeconds',
  ),
);

const ActionPartSchema = strictObject({
  /** Exact GLB node name, e.g. `bolt-carrier:bolt-carrier`. */
  node: pipe(string(), nonEmpty('must not be empty')),
  axis: UnitVector,
  strokeMetres: Positive,
  handGrip: optional(Point),
  turn: optional(
    strictObject({
      pivot: Point,
      axis: UnitVector,
      angleRadians: pipe(
        number(),
        check((angle) => angle !== 0, 'turn angle must not be zero'),
      ),
    }),
  ),
  /** References shared timelines; modes not listed keep this node at home. */
  modes: pipe(
    array(picklist(['fire', 'hand'])),
    nonEmpty('needs at least one cycle mode'),
    check((modes) => new Set(modes).size === modes.length, 'cycle modes must be distinct'),
  ),
});

const ActionSchema = pipe(
  strictObject({
    parts: pipe(
      record(Id, ActionPartSchema),
      check((parts) => Object.keys(parts).length > 0, 'needs at least one moving part'),
    ),
    fire: optional(ActionCycleSchema),
    hand: ActionCycleSchema,
    ejectAt: Fraction,
    /** Unit direction vector in the exported model frame. */
    ejectDirection: UnitVector,
    holdOpen: vBoolean(),
    /** Cyclic rate in rounds per Sim minute. */
    roundsPerSimMinute: optional(SimPerMinute),
    triggerMode: optional(picklist(['semi', 'auto'])),
  }),
  check(
    (action) => Object.values(action.parts).every((part) => part.modes.every((mode) => action[mode] !== undefined)),
    'moving part modes must reference a declared timeline',
  ),
  check(
    (action) =>
      Object.values(action.parts).every(
        (part) =>
          !part.turn ||
          part.modes.every(
            (mode) => action[mode]?.unlockSimSeconds !== undefined && action[mode]?.lockSimSeconds !== undefined,
          ),
      ),
    'turning parts need unlock and lock phases in every referenced timeline',
  ),
  check(
    (action) => (action.fire === undefined) === (action.roundsPerSimMinute === undefined),
    'only an automatic fire timeline has a cyclic rpm',
  ),
  check(
    (action) => action.triggerMode === undefined || action.fire !== undefined,
    'trigger mode needs a fire timeline',
  ),
);

const RevolverRotationSchema = strictObject({
  node: pipe(string(), nonEmpty('must not be empty')),
  pivot: Point,
  axis: UnitVector,
});
const RevolverSchema = pipe(
  strictObject({
    chambers: pipe(number(), integer('must be a whole number'), minValue(1)),
    crane: strictObject({
      ...RevolverRotationSchema.entries,
      openRadians: pipe(
        number(),
        check((value) => Number.isFinite(value) && value !== 0, 'needs a finite nonzero angle'),
      ),
    }),
    cylinder: strictObject({
      node: pipe(string(), nonEmpty('must not be empty')),
      centre: Point,
      axis: UnitVector,
      chamberRadiusMetres: Positive,
      chamberZeroRadians: pipe(
        number(),
        check((value) => Number.isFinite(value), 'must be finite'),
      ),
    }),
    ejector: strictObject({
      node: pipe(string(), nonEmpty('must not be empty')),
      axis: UnitVector,
      strokeMetres: Positive,
    }),
    hammer: strictObject({
      ...RevolverRotationSchema.entries,
      cockRadians: pipe(
        number(),
        check((value) => Number.isFinite(value) && value !== 0, 'needs a finite nonzero angle'),
      ),
    }),
    trigger: strictObject({
      ...RevolverRotationSchema.entries,
      pullRadians: pipe(
        number(),
        check((value) => Number.isFinite(value) && value !== 0, 'needs a finite nonzero angle'),
      ),
    }),
  }),
  check(
    (value) =>
      new Set([value.crane.node, value.cylinder.node, value.ejector.node, value.hammer.node, value.trigger.node])
        .size === 5,
    'revolver parts need distinct nodes',
  ),
);

const MagazineRoundSchema = strictObject({
  /** Centre in metres in the magazine model frame (+x forward, +y up, +z right). */
  at: Point,
  /** Degrees about +z; nose-up is positive. */
  tilt: number(),
});

const MagazineCapacity = pipe(number(), integer('must be a whole number'), minValue(1, 'must be at least 1'));
const AttachmentPropertiesSchema = strictObject({
  magnification: optional(
    pipe(
      strictObject({ min: Positive, max: Positive }),
      check(({ min, max }) => max >= min, 'maximum magnification cannot be below minimum'),
    ),
  ),
  aperture: optional(OpticApertureSchema),
  reticle: optional(ReticleSchema),
  noiseFactor: optional(Fraction),
  wearClass: optional(picklist(['real', 'improvised'])),
  handlingClass: optional(pipe(string(), nonEmpty('must not be empty'))),
  railSpanNotches: optional(
    pipe(
      strictObject({
        minOffset: pipe(number(), integer('must be a whole number')),
        maxOffset: pipe(number(), integer('must be a whole number')),
      }),
      check(({ minOffset, maxOffset }) => minOffset <= maxOffset, 'maximum notch offset cannot be below minimum'),
    ),
  ),
});
const AttachmentSightSchema = strictObject({
  kind: picklist(['optic', 'iron']),
  eye: Point,
  direction: UnitVector,
  up: UnitVector,
  eyeReliefMetres: Positive,
  ocularDiameterMetres: optional(Positive),
});
const AttachmentFieldsSchema = strictObject({
  id: pipe(string(), nonEmpty('must not be empty')),
  kind: picklist(['optic', 'iron-sight', 'suppressor', 'flashlight-mount', 'foregrip', 'muzzle-device']),
  mount: picklist(['rail-top', 'rail-side', 'rail-bottom', 'muzzle']),
  mountFrame: strictObject({ normal: UnitVector, up: UnitVector }),
  properties: AttachmentPropertiesSchema,
  sight: optional(AttachmentSightSchema),
});
const attachmentSpanMatchesMount = ({ mount, properties }: InferOutput<typeof AttachmentFieldsSchema>): boolean =>
  mount === 'muzzle' ? properties.railSpanNotches === undefined : properties.railSpanNotches !== undefined;
const attachmentSpanCheck = check(
  attachmentSpanMatchesMount,
  'rail attachments need a notch span and muzzle attachments cannot have one',
);
const attachmentHasOpticPresentation = ({ kind, properties }: InferOutput<typeof AttachmentFieldsSchema>): boolean =>
  (kind === 'optic') === (properties.reticle !== undefined) &&
  (kind === 'optic') === (properties.aperture !== undefined);
const AttachmentSchema = pipe(
  AttachmentFieldsSchema,
  attachmentSpanCheck,
  check(
    attachmentHasOpticPresentation,
    'optics need an authored reticle and aperture; other attachments cannot have them',
  ),
  check(
    ({ kind, properties }) => (kind === 'suppressor') === (properties.noiseFactor !== undefined),
    'suppressors need a noise factor and other attachments cannot have one',
  ),
);
const FittedAttachmentSchema = pipe(
  strictObject({
    ...AttachmentFieldsSchema.entries,
    node: pipe(string(), nonEmpty('must not be empty')),
    mountedAt: pipe(string(), nonEmpty('must not be empty')),
  }),
  check(
    (value) => attachmentHasOpticPresentation(value),
    'optics need an authored reticle and aperture; other attachments cannot have them',
  ),
  check(
    (value) => attachmentSpanMatchesMount(value),
    'rail attachments need a notch span and muzzle attachments cannot have one',
  ),
);
const AttachmentSlotSchema = pipe(
  strictObject({
    id: pipe(string(), nonEmpty('must not be empty')),
    mount: picklist(['rail-top', 'rail-side', 'rail-bottom', 'muzzle']),
    position: Point,
    direction: UnitVector,
    up: UnitVector,
    railId: optional(pipe(string(), nonEmpty('must not be empty'))),
    notchIndex: optional(pipe(number(), integer('must be a whole number'), minValue(0, 'must be non-negative'))),
  }),
  check(
    ({ mount, railId, notchIndex }) =>
      mount === 'muzzle'
        ? railId === undefined && notchIndex === undefined
        : railId !== undefined && notchIndex !== undefined,
    'rail slots need railId and notchIndex; muzzle interfaces cannot have them',
  ),
);
const AttachmentCompatibilityChoiceSchema = tuple([
  pipe(string(), nonEmpty('must not be empty')),
  pipe(string(), nonEmpty('must not be empty')),
]);
const AttachmentCompatibilityPairSchema = tuple([
  AttachmentCompatibilityChoiceSchema,
  AttachmentCompatibilityChoiceSchema,
]);
const ModelMagazineSlotSchema = strictObject({
  node: pipe(string(), nonEmpty('must not be empty')),
  at: Point,
  turn: Point,
});

const attachmentRangesDoNotOverlap = (
  attachments: readonly InferOutput<typeof FittedAttachmentSchema>[],
  slots: readonly InferOutput<typeof AttachmentSlotSchema>[],
): boolean => {
  const ranges = attachments.flatMap(({ mountedAt, properties }) => {
    const slot = slots.find(({ id }) => id === mountedAt);
    const span = properties.railSpanNotches;
    return slot?.railId !== undefined && slot.notchIndex !== undefined && span
      ? [{ railId: slot.railId, min: slot.notchIndex + span.minOffset, max: slot.notchIndex + span.maxOffset }]
      : [];
  });
  return ranges.every((a, index) =>
    ranges.slice(index + 1).every((b) => a.railId !== b.railId || a.max < b.min || b.max < a.min),
  );
};

const GunModelSchema = pipe(
  strictObject({
    /** Cartridge-data id (not a display designation); punctuation is normalized only in model slugs. */
    calibre: optional(CalibreId),
    /** Full magazine capacity and one centre/tilt pose per round, ordered top to bottom. */
    capacity: optional(MagazineCapacity),
    /** Integral magazine, loaded singly through anchors.loading_port; no box round-pose column. */
    internalMagazine: optional(strictObject({ capacity: MagazineCapacity })),
    rounds: optional(array(MagazineRoundSchema)),
    /** Replaceable model parts and the gun-side mount frames for later fitting. */
    attachments: optional(array(FittedAttachmentSchema)),
    attachmentSlots: optional(array(AttachmentSlotSchema)),
    /** Complete per-slot allowlist certified by gungen; absence denies dynamic fitting. */
    compatibility: optional(
      record(pipe(string(), nonEmpty('must not be empty')), array(pipe(string(), nonEmpty('must not be empty')))),
    ),
    /** Complete pairwise allowlist; each tuple is [slot ID, attachment ID], absence denies pairs. */
    compatibilityPairs: optional(array(AttachmentCompatibilityPairSchema)),
    /** Exact baked GLB node and replacement transform for each item-owned model slot. */
    slots: optional(strictObject({ magazine: optional(ModelMagazineSlotSchema) })),
    /** Static model metadata for an attachment exported as its own item asset. */
    attachment: optional(AttachmentSchema),
    /** Model-derived eye point, sight line and up axis for ADS presentation and ballistics. */
    sight: optional(
      strictObject({
        kind: picklist(['iron', 'optic']),
        eye: Point,
        eyeReliefMetres: NonNegative,
        ocularDiameterMetres: optional(Positive),
        direction: UnitVector,
        up: UnitVector,
      }),
    ),
    /** Unit barrel direction in the same local model frame as anchors. */
    muzzleDirection: optional(UnitVector),
    /** Optional estimated action cycles and the named moving GLB nodes. */
    action: optional(ActionSchema),
    revolver: optional(RevolverSchema),
    /**
     * Where the charging handle sits around the bore: degrees from the top of the receiver toward the gun's right
     * (+z). A rack rolls the gun toward the off hand, further when the handle is on the far side (`DESIGN.md`, "Rifles"). Hand-authored: the export does not carry it.
     */
    chargingHandleDegrees: optional(pipe(number(), minValue(-180), maxValue(180))),
  }),
  check(
    ({ calibre, capacity, rounds }) =>
      capacity === undefined && rounds === undefined
        ? true
        : calibre !== undefined && capacity !== undefined && rounds !== undefined && rounds.length === capacity,
    'magazine metadata needs calibre, capacity, and one round pose per capacity slot',
  ),
  check(
    ({ attachments, attachmentSlots }) =>
      attachments === undefined ||
      (attachmentSlots !== undefined &&
        new Set(attachments.map(({ mountedAt }) => mountedAt)).size === attachments.length &&
        attachments.every(({ mountedAt, mount }) =>
          attachmentSlots.some((slot) => slot.id === mountedAt && slot.mount === mount),
        ) &&
        attachmentRangesDoNotOverlap(attachments, attachmentSlots)),
    'fitted attachments need unique matching mount slots and non-overlapping rail spans',
  ),
  check(
    ({ sight }) => sight?.kind !== 'optic' || sight.ocularDiameterMetres !== undefined,
    'optic sight metadata needs an ocular opening diameter',
  ),
  check(
    ({ internalMagazine, calibre, capacity, rounds }) =>
      internalMagazine === undefined || (calibre !== undefined && capacity === undefined && rounds === undefined),
    'internal magazine metadata needs calibre and cannot carry a box round column',
  ),
);

/**
 * The safety lever a fused throwable sheds when its fuse lights: the exported piece that leaves the model and
 * how it flies off (`DESIGN.md`, "Hand grenade"). Hand-authored: the export does not carry it.
 */
const LeverModelSchema = strictObject({
  piece: pipe(string(), nonEmpty()),
  launchMetresPerRealSecond: Positive,
  spinDegreesPerRealSecond: NonNegative,
  lifetimeRealSeconds: PositiveRealSeconds,
});

/**
 * The safety pin a fused throwable hides while it is pulled: the exported piece drawn as the pin and its ring
 * (`DESIGN.md`, "Hand grenade"). Hand-authored: the export does not carry it.
 */
const PinModelSchema = strictObject({ piece: pipe(string(), nonEmpty()) });

const ModelMaterialId = pipe(
  string(),
  check((id) => Object.hasOwn(MATERIALS, id), 'must name a model material'),
);

/** A magnetic compass card drawn on the model's display: it turns with its needle to point north. */
const CompassDialSchema = strictObject({
  /** Model materials whose colours paint the card, its marks and the needle's two ends. */
  face: ModelMaterialId,
  ink: ModelMaterialId,
  north: ModelMaterialId,
  south: ModelMaterialId,
  /** Labels spaced evenly clockwise from north, the first in the north colour. */
  marks: pipe(array(pipe(string(), nonEmpty())), nonEmpty()),
  /** Letter height, needle reach from the pin and needle width, as fractions of the card's radius. */
  markHeight: Fraction,
  needleLength: Fraction,
  needleWidth: Fraction,
});
export type CompassDial = InferOutput<typeof CompassDialSchema>;

/**
 * How a hand closes, by name: the empty fist, a hand around a plain grip, flat on a screen, a firing hand on a pistol
 * grip or on a stock wrist, or a support hand on a forend.
 */
const HAND_POSES = [
  'fist',
  'holding',
  'open',
  'pistolGrip',
  'pistolWrap',
  'pistolCup',
  'stockWrist',
  'forend',
] as const;

/**
 * One hand's hold on a held model, in the model's frame as authored for a right-handed hold: where the palm's face
 * meets the model, which way the palm presses and which way the straight fingers point before they curl. A left
 * hold mirrors the model's z. The palm and fingers are perpendicular, which validation checks.
 */
const HandHoldSchema = strictObject({ at: Point, palm: UnitVector, fingers: UnitVector, pose: picklist(HAND_POSES) });

/** Authored palm contacts avoid inferring a shoulder seat for free-held firearms. */
const HandsModelSchema = strictObject({
  seat: Point,
  butt: optional(Point),
  loweredPitchRadians: optional(pipe(number(), minValue(0), maxValue(Math.PI / 2))),
  torsoForwardDegrees: optional(pipe(number(), minValue(0), maxValue(90))),
  adsEyeReliefMetres: optional(Positive),
  viewOffset: optional(Point),
  adsViewEyeReliefMetres: optional(Positive),
  firing: HandHoldSchema,
  support: HandHoldSchema,
});
export type HandsModelDef = InferOutput<typeof HandsModelSchema>;

export const ModelSchema = pipe(
  modelSchema({
    gun: optional(GunModelSchema),
    dial: optional(CompassDialSchema),
    lever: optional(LeverModelSchema),
    pin: optional(PinModelSchema),
    hands: optional(HandsModelSchema),
  }),
  check(
    ({ gun, anchors }) => gun?.internalMagazine === undefined || anchors?.loading_port !== undefined,
    'internal magazine metadata needs a loading_port anchor',
  ),
  check(({ hands, grip }) => hands === undefined || grip !== undefined, 'hands need a grip to hold by'),
);

// ---- furniture ----

const FurnitureMaterialSchema = pipe(
  strictObject({
    id: Id,
    /** What a blow on a piece of this material sounds like; it must alert hearing, since every blow is heard. */
    blowSound: Id,
    /** Forcing methods a door of this material admits; a door's material must list them. */
    methods: optional(array(Id)),
    /** How a broken leaf of this material is painted: its colour moves `strength` of the way to `tint`. */
    broken: optional(strictObject({ tint: Color, strength: Fraction })),
    /**
     * How a piece is painted as its damage grows toward ruin, so the player sees how close it is to giving way.
     * Each step applies once the damage reaches `from`, a fraction of the piece's durability; the last step reached wins.
     */
    damaged: optional(array(strictObject({ from: Fraction, tint: Color, strength: Fraction }))),
  }),
  check(
    ({ damaged }) => (damaged ?? []).every((step, at) => at === 0 || step.from > damaged![at - 1]!.from),
    'damage looks need strictly rising thresholds',
  ),
);

const DoorForcingSchema = pipe(
  strictObject({
    quality: Id,
    level: QualityLevel,
    strikeSound: Id,
    /** Skill whose level shortens forcing time. */
    skill: Id,
    /** Sim seconds of work at the lowest skill level. */
    timeSimSeconds: PositiveSimSeconds,
    /** Sim seconds of work at the fastest skill level. */
    fastestTimeSimSeconds: PositiveSimSeconds,
    /** Sim seconds between noisy strikes at the lowest skill level. */
    strikeIntervalSimSeconds: PositiveSimSeconds,
    /** Canister fill a finished cut spends; the cut won't start without it. A fuelled tool is needed. */
    fuel: optional(Positive),
  }),
  check(
    ({ timeSimSeconds, fastestTimeSimSeconds }) => fastestTimeSimSeconds <= timeSimSeconds,
    'fastest forcing time cannot exceed the base time',
  ),
);

/** How a doorway leaf or hatch reads as one that opens; lengths are in metres (`docs/content.md`, "Door detail"). */
const DoorDetailSchema = strictObject({
  /** Colour of the handle and hinges. */
  hardware: Color,
  /** How far the fields stand off each face of the leaf. */
  relief: Positive,
  /** Bare border round the fields, and the gap between them; both show the leaf's darker core. */
  frame: NonNegative,
  seam: NonNegative,
  /** Raised fields across the leaf from its hinge edge, and along that edge. */
  fields: tuple([pipe(Count, minValue(1, 'must be at least 1')), pipe(Count, minValue(1, 'must be at least 1'))]),
  /** Strap hinges lying on both faces from the hinge edge. */
  hinges: strictObject({ count: Count, length: Positive, width: Positive }),
  /** On both faces: its grip centre lies `fromFreeEdge` in from the free edge and `along` the length of the hinge edge. */
  handle: strictObject({
    kind: picklist(['knob', 'lever', 'pull', 'bar', 'ring']),
    fromFreeEdge: Positive,
    along: Fraction,
    length: Positive,
    thickness: Positive,
  }),
});

const FurnitureShapeBoxSchema = strictObject({
  /** Lower corner in the furniture's cell coordinates. */
  position: tuple([NonNegative, NonNegative, NonNegative]),
  /** Extent in cell coordinates. */
  size: tuple([Positive, Positive, Positive]),
  /** Paints this box instead of the furniture's colour, so a heap can mix materials. */
  color: optional(Color),
});

const FurnitureSchema = pipe(
  strictObject({
    id: Id,
    name: Name,
    /** Cells, in blocks: [x, y, z]. It's anchored at its lowest corner. */
    size: Size,
    color: Color,
    /** The furniture material whose damage looks the piece shows (`DESIGN.md`, "Block entities"). */
    material: Id,
    /** Estimated kilograms for a piece that can be lifted or dragged. */
    massKg: optional(NonNegative),
    solid: optional(vBoolean()),
    /** A flat piece that may lie on a shut hatch (`DESIGN.md`, "Moving furniture"); it must be non-solid and one block high. */
    cover: optional(literal(true)),
    /** A debug practice surface; hits may receive a profile-specific presentation ping. */
    shotTarget: optional(literal(true)),
    scenarioGoal: optional(literal(true)),
    /** Carried, it turns but won't tip over (`DESIGN.md`, "Moving furniture"). */
    upright: optional(literal(true)),
    readable: optional(ReadableSchema),
    mount: optional(literal('wall')),
    container: optional(ContainerSchema),
    /** Sound emitted when searching this furniture; it must alert hearing. */
    searchNoise: optional(strictObject({ sound: picklist([...SOUND_EVENT_IDS]) })),
    /** It opens and closes, taking this many Sim seconds. */
    door: optional(
      strictObject({
        handlingSimSeconds: SimSeconds,
        methods: record(Id, DoorForcingSchema),
        openNoise: optional(strictObject({ sound: picklist([...SOUND_EVENT_IDS]) })),
        /** It lies flat in a floor or roof and swings up on its hinge edge, which is on its facing side. */
        hatch: optional(literal(true)),
        /** Barricaded from this side, the facing side (`front`) or its opposite (`back`): it opens only from the other. */
        barredFrom: optional(picklist(['front', 'back'])),
        detail: optional(DoorDetailSchema),
      }),
    ),
    /**
     * How the piece yields to blows (`DESIGN.md`, "Block entities"); every piece has it. Strength is in the N·s of a
     * melee weapon's `impulse`: a blow below `minimumStrength` does nothing, and the strengths of blows at or above it
     * add up to `durability`, which ruins the piece.
     */
    breach: strictObject({ minimumStrength: Positive, durability: Positive }),
    /**
     * Worldgen may place the piece already worn, by a share of its durability drawn from this range (`DESIGN.md`,
     * "Block entities"). Both ends stay below 1, so a placed piece is never ruined; no range places it intact.
     */
    wear: optional(
      pipe(
        strictObject({
          from: pipe(number(), minValue(0, 'must be 0 or more'), maxValue(1 - Number.EPSILON, 'must be below 1')),
          to: pipe(number(), minValue(0, 'must be 0 or more'), maxValue(1 - Number.EPSILON, 'must be below 1')),
        }),
        check(({ from, to }) => from <= to, 'wear must run from the lower share to the higher'),
      ),
    ),
    /** What a ruined piece leaves besides its contents (`DESIGN.md`, "Damage, destruction and dismemberment"). */
    ruin: optional(
      strictObject({
        debris: array(strictObject({ item: Id, count: pipe(Count, minValue(1, 'must be at least 1')) })),
      }),
    ),
    /** The player climbs it; its facing is the side the climber stands on (`DESIGN.md`, "Ladders and hatches"). */
    climbable: optional(strictObject({ speedMetresPerSimSecond: Positive })),
    appearance: optional(
      strictObject({
        kind: picklist(['cabinet', 'drawers', 'fridge', 'door', 'lid', 'rack']),
        surface: picklist(['wood', 'painted-metal', 'plastic']),
      }),
    ),
    /**
     * A dead human, drawn as the figure lying in its corpse pose and dressed in the named outfit of that figure
     * (`DESIGN.md`, "Dead humans").
     */
    corpse: optional(strictObject({ figure: Id, outfit: Id })),
    /** Boxes in cell coordinates that the piece is drawn as. */
    shape: optional(pipe(array(FurnitureShapeBoxSchema), nonEmpty('needs at least one box'))),
    /**
     * A solid shaped piece that isn't a door stops movement and light only in the blocks its `shape` fills to at least
     * this fraction, so a player can walk where it looks open.
     */
    solidFill: optional(Fraction),
    /**
     * Rendered as this vehicle: a blueprint without the `removed` fittings, in `body` paint, `dirt` grimy (0 clean to
     * 1 filthy). Its blocks stop movement and light where its parts fill at least `solidFill` of them, so a low
     * bonnet can be climbed while the cabin still blocks.
     */
    vehicle: optional(
      pipe(
        strictObject({
          blueprint: string(),
          body: Color,
          dirt: Fraction,
          removed: array(string()),
          solidFill: Fraction,
        }),
        check(({ blueprint }) => BLUEPRINTS[blueprint] !== undefined, 'unknown vehicle blueprint'),
        check(
          ({ blueprint, removed }) =>
            removed.every((id) => BLUEPRINTS[blueprint]?.fittings.some((fitting) => fitting.id === id)),
          'removed names a fitting the blueprint lacks',
        ),
      ),
    ),
    power: optional(
      strictObject({
        device: Id,
        fuelLitres: pipe(
          NonNegative,
          check((value) => unitCount(value, POWER_UNITS.amount) !== undefined, 'fuel must be exact in power units'),
        ),
        enabled: vBoolean(),
        light: optional(strictObject({ color: Color, intensity: Positive, radius: Positive })),
      }),
    ),
    charger: optional(
      strictObject({
        batteries: pipe(array(Id), nonEmpty('needs a compatible battery')),
        pocket: pipe(number(), safeInteger(), minValue(0)),
        efficiency: pipe(Positive, maxValue(1)),
      }),
    ),
    /** Comfort scales fatigue recovery; sleepable pieces also enable the sleep rate. */
    rest: optional(strictObject({ quality: Fraction, sleep: optional(literal(true)) })),
    /** A station available to matching recipes within reach; bonus is the fraction removed from work time. */
    workstation: optional(
      strictObject({
        id: Id,
        qualities: record(Id, QualityLevel),
        workFactorBonus: Fraction,
      }),
    ),
  }),
  check(
    ({ size, shape }) =>
      shape === undefined ||
      shape.every(
        ({ position: [x, y, z], size: [w, h, d] }) => x + w <= size[0] && y + h <= size[1] && z + d <= size[2],
      ),
    (issue) => `shape boxes of "${(issue.input as { id: string }).id}" must stay within furniture size`,
  ),
  check(
    ({ shape, solid, door, solidFill }) =>
      (solidFill !== undefined) === (shape !== undefined && solid !== false && door === undefined),
    'solidFill belongs on exactly the solid shaped pieces that are not doors',
  ),
  // Its blocks stay within its size because its boxes do (checked above), so only emptiness is left to refuse.
  check(
    ({ shape, solidFill }) =>
      shape === undefined || solidFill === undefined || shapeBlocks(shape, solidFill).length > 0,
    (issue) => `shaped piece "${(issue.input as { id: string }).id}" must block somewhere`,
  ),
  check(
    ({ size, vehicle }) => {
      if (vehicle === undefined || BLUEPRINTS[vehicle.blueprint] === undefined) {
        return true;
      }
      const blocks = solidBlocks(vehicle, size);
      return blocks.length > 0 && blocks.every((block) => block.every((at, axis) => at >= 0 && at < size[axis]!));
    },
    (issue) => `vehicle piece "${(issue.input as { id: string }).id}" must block somewhere, and only within its size`,
  ),
  check(
    ({ appearance, container, shape, door, readable }) =>
      !appearance || (container !== undefined && !shape && !door && !readable),
    'appearance needs a plain container without a shape, door or readable',
  ),
  check(({ door, shape }) => !(door?.hatch && shape), 'a hatch is its own panel and cannot have a shape'),
  check(
    ({ corpse, shape, appearance, door, vehicle, solid }) =>
      !corpse || (!(shape || appearance || door || vehicle) && solid === false),
    'a corpse is drawn as its figure, so it is non-solid and has no shape, appearance, door or vehicle',
  ),
  // The same reading as `src/core/blockEntities.ts`, `isBodyDoor`: a body door is the front of its own drawn body.
  check(
    ({ door, shape, container }) => !door?.detail || shape === undefined || container === undefined,
    'a body door draws its handle on its body, so door detail belongs only on doorway leaves and hatches',
  ),
  // The same reading as `src/core/blockEntities.ts`, `isBodyDoor`: any other door breaks instead of being ruined.
  check(
    ({ ruin, door, shape, container }) => !(ruin && door) || (shape !== undefined && container !== undefined),
    'a door leaf breaks rather than being ruined, so it leaves no debris',
  ),
  check(({ climbable, solid }) => !climbable || solid === false, 'a climbable piece must not be solid'),
  check(
    ({ cover, solid, size, door, climbable, mount }) =>
      !cover || (solid === false && size[1] === 1 && !door && !climbable && !mount),
    'a cover must be non-solid, one block high and not a door, ladder or wall mount',
  ),
  check(
    ({ mount, size, shape, solid }) =>
      !mount ||
      (size.every((extent) => extent === 1) &&
        solid === false &&
        shape?.length === 1 &&
        shape.every(
          ({ position: [x, y, z], size: [w, h, d] }) =>
            x === 0 && y === 0 && w === 1 && h === 1 && d < 1 && z + d === 1,
        )),
    'a wall mount needs a non-solid single-cell shape spanning its face, thin and flush with its back',
  ),
);

// ---- loot tables ----

const LootEntrySchema = pipe(
  strictObject({
    weight: Positive,
    item: optional(Id),
    table: optional(Id),
    nothing: optional(vBoolean()),
    /** How many of the item, inclusive. */
    count: optional(range(Count)),
    /** Condition of the item, 0 (broken) to 1 (new), inclusive. */
    condition: optional(range(Fraction)),
  }),
  check(
    (e) => [e.item, e.table, e.nothing].filter((x) => x !== undefined).length === 1,
    'needs exactly one of "item", "table" or "nothing"',
  ),
);

const LootTableSchema = strictObject({
  id: Id,
  /** How many times to roll, inclusive. */
  rolls: range(Count),
  entries: pipe(array(LootEntrySchema), nonEmpty('needs at least one entry')),
});

// ---- templates ----

const Char = pipe(string(), regex(/^.$/u, 'palette keys are single characters'));

const DoorLockSchema = strictObject({ id: Id, locked: vBoolean() });
// Names stay names through parsing: the day cycle that gives them meaning is content too (`resolveSpawnTime`).
const SpawnTime = union([picklist(SPAWN_TIME_NAMES), GameTimeOfDay], 'expected a named game time or HH:MM');
const SpawnWindowSchema = pipe(
  strictObject({ fromGameTimeOfDay: SpawnTime, toGameTimeOfDay: optional(SpawnTime) }),
  check(
    ({ fromGameTimeOfDay, toGameTimeOfDay }) => toGameTimeOfDay === undefined || fromGameTimeOfDay !== toGameTimeOfDay,
    'from and to must differ',
  ),
);

const FixedLootItem = strictObject({
  item: Id,
  count: optional(pipe(Count, minValue(1))),
  condition: optional(Fraction),
  /** Observation only: playtest metrics record when the player first loots or reads this item. */
  key: optional(vBoolean()),
  /** Surface items begin as visible world piles on their furniture's top; other items fill its container. */
  placement: optional(picklist(['surface', 'container'], 'placement must be surface or container')),
  /** Item types fitted at spawn, by slot id: a found gun that comes with its sling. */
  fitted: optional(record(Id, Id)),
  /** Battery charge at spawn as a share of full, for the item if it is a battery and for its fitted batteries. */
  charge: optional(Fraction),
});
const GroundLootSupplySchema = union([
  strictObject({ kind: literal('empty') }),
  strictObject({ kind: literal('table'), table: Id }),
  strictObject({
    kind: literal('fixed'),
    items: pipe(array(omit(FixedLootItem, ['placement'])), nonEmpty()),
    table: optional(Id),
  }),
]);
export type GroundLootSupply = InferOutput<typeof GroundLootSupplySchema>;

/** A palette entry that isn't a plain block. */
const PaletteThingSchema = pipe(
  strictObject({
    furniture: optional(Id),
    groundLoot: optional(GroundLootSupplySchema),
    /** The table this container placement rolls. */
    loot: optional(Id),
    lootUsage: optional(UsageSchema),
    facing: optional(picklist(['n', 'e', 's', 'w'])),
    /** The face this furniture lies on, when it is not standing on its bottom. */
    tip: optional(picklist(['back', 'front', 'left', 'right', 'top'])),
    /** Initial lock state, only on a door; ids are unique within an authored site. */
    lock: optional(DoorLockSchema),
    /** Fastened where it stands, like a fitted cupboard, so the player can't move it. */
    fixed: optional(literal(true)),
    /** Stock every copy of this piece always holds, beside its table's roll. */
    items: optional(pipe(array(omit(FixedLootItem, ['key'])), nonEmpty())),
    /** A zombie type that may stand here; the cell itself is air. */
    spawn: optional(Id),
    chance: optional(Fraction),
    /** Daily game-clock window; omitted markers spawn when their column loads. */
    window: optional(SpawnWindowSchema),
    /** The ground here: the cell stamps nothing and keeps whatever surface the site put under the item. */
    ground: optional(literal(true)),
  }),
  check(
    (e) => [e.furniture, e.spawn, e.ground, e.groundLoot].filter((part) => part !== undefined).length === 1,
    'needs exactly one of "furniture", "spawn", "ground" or "groundLoot"',
  ),
  check((e) => e.spawn !== undefined || e.window === undefined, '"window" only goes with "spawn"'),
  check(
    (e) =>
      e.furniture !== undefined ||
      (e.loot === undefined &&
        e.facing === undefined &&
        e.tip === undefined &&
        e.lock === undefined &&
        e.fixed === undefined &&
        e.items === undefined),
    '"loot", "facing", "tip", "lock", "fixed" and "items" only go with "furniture"',
  ),
  check((e) => e.spawn !== undefined || e.chance === undefined, '"chance" only goes with "spawn"'),
);

/** Template-local block coordinates; horizontal half cells permit centred, two-cell-wide landings. */
const CellCoordinate = pipe(
  number(),
  check((v) => Number.isFinite(v) && Number.isInteger(v * 2), 'must be on the half-cell grid'),
);
const CellPosition = tuple([CellCoordinate, Count, CellCoordinate]);
const StairSchema = strictObject({
  from: Id,
  to: Id,
  lower: CellPosition,
  upper: CellPosition,
  width: pipe(Count, minValue(2)),
  block: Id,
});
const TemplateAccessSchema = strictObject({
  ground: Id,
  entrance: CellPosition,
  storeys: pipe(array(strictObject({ id: Id, floor: Count })), nonEmpty()),
  stairs: array(StairSchema),
});

const OwnershipSchema = strictObject({
  /** '.' leaves terrain alone, S claims occupancy, A excavates, R reserves empty circulation. */
  layers: array(array(pipe(string(), regex(/^[.SAR]*$/)))),
});
const DecalVariantSchema = strictObject({
  sizeMetres: tuple([Positive, Positive]),
  color: Color,
  agedColor: Color,
  opacity: Fraction,
  agedOpacity: Fraction,
  ageingGameHours: PositiveGameHours,
  noiseScale: Positive,
  edgeRaggedness: Fraction,
  /** Normalized line segments, each [x0, y0, x1, y1, width]. */
  strokes: pipe(
    array(
      pipe(
        tuple([Fraction, Fraction, Fraction, Fraction, Fraction]),
        check(([x0, y0, x1, y1, width]) => width > 0 && (x0 !== x1 || y0 !== y1), 'needs a nonzero stroke'),
      ),
    ),
    maxLength(64),
  ),
});
export const DecalSchema = strictObject({
  kind: picklist(Object.keys(DECAL_KINDS) as DecalKind[]),
  at: tuple([number(), number(), number()]),
  door: optional(tuple([number(), number(), number()])),
  normal: picklist(['n', 'e', 's', 'w', 'up', 'down']),
  rotation: number(),
  variants: pipe(array(DecalVariantSchema), nonEmpty(), maxLength(32)),
});
export type DecalDef = InferOutput<typeof DecalSchema>;

const BuildingEligibilitySchema = strictObject({
  settlementKinds: pipe(array(Id), nonEmpty()),
});

const TemplateSchema = strictObject({
  id: Id,
  lootContext: LootContextSchema,
  eligibility: optional(BuildingEligibilitySchema),
  /** The most storeys the stress-test city stacks this template to; absent means no limit. */
  maxStoreys: optional(pipe(Count, minValue(1), maxValue(8))),
  /** Blocks: [x, y, z]. */
  size: Size,
  /** What each character means: a block id ("air" for empty), or furniture or a spawn point. */
  palette: record(Char, union([Id, PaletteThingSchema])),
  /** Layers from the bottom up; each is rows along z of characters along x. */
  layers: array(array(string())),
  decals: optional(pipe(array(DecalSchema), maxLength(128))),
  /** Explicit floors and flights, never stress-test repetitions. Floor heights are feet heights in blocks. */
  access: optional(TemplateAccessSchema),
  ownership: optional(OwnershipSchema),
});

const KitSize = pipe(
  Size,
  check(
    ([x, y, z]) => Number.isSafeInteger(x * y * z) && x * y * z <= 1_048_576,
    'kit volume exceeds the allocation bound',
  ),
);
const MaterialRole = picklist(['shell', 'interior_floor', 'support', 'trim', 'opening']);
const MapStyleSchema = strictObject({
  id: Id,
  bindings: record(Id, strictObject({ role: MaterialRole, block: Id })),
});
const KitBoxSchema = strictObject({ min: tuple([Count, Count, Count]), size: KitSize });
const KitAnchorSchema = strictObject({ at: CellPosition, kind: picklist(['standing', 'interaction', 'point']) });
const KitPortSchema = strictObject({
  id: Id,
  type: Id,
  at: CellPosition,
  facing: picklist(['n', 'e', 's', 'w', 'up', 'down']),
  traversal: picklist(['walk', 'climb', 'drop', 'sealed']),
  aperture: tuple([pipe(Count, minValue(1)), pipe(Count, minValue(1))]),
  clearance: KitBoxSchema,
  standing: CellPosition,
});
const MapPieceSchema = strictObject({
  id: Id,
  lootContext: LootContextSchema,
  size: KitSize,
  style: Id,
  palette: record(Char, union([strictObject({ role: MaterialRole, material: Id }), PaletteThingSchema])),
  layers: array(array(string())),
  decals: optional(pipe(array(DecalSchema), maxLength(128))),
  ownership: OwnershipSchema,
  anchors: record(Id, KitAnchorSchema),
  ports: array(KitPortSchema),
});
const KitRefSchema = strictObject({ kind: picklist(['piece', 'assembly']), id: Id, style: optional(Id) });
const KitSlotSchema = pipe(
  strictObject({
    id: Id,
    at: tuple([Count, Count, Count]),
    size: KitSize,
    turn: picklist([0, 1, 2, 3]),
    choices: optional(pipe(array(strictObject({ ref: KitRefSchema, weight: Positive })), nonEmpty())),
    pool: optional(Id),
  }),
  check((slot) => (slot.choices === undefined) !== (slot.pool === undefined), 'needs exactly one of choices or pool'),
);
const KitEndpointSchema = strictObject({ slot: Id, port: Id });
const KitJoinSchema = strictObject({
  id: Id,
  a: KitEndpointSchema,
  b: KitEndpointSchema,
  seam: strictObject({ piece: Id, at: tuple([Count, Count, Count]), turn: picklist([0, 1, 2, 3]), a: Id, b: Id }),
});
const MapAssemblySchema = strictObject({
  id: Id,
  lootContext: LootContextSchema,
  eligibility: optional(BuildingEligibilitySchema),
  size: KitSize,
  slots: array(KitSlotSchema),
  joins: array(KitJoinSchema),
  anchors: record(Id, KitAnchorSchema),
  ports: array(strictObject({ id: Id, slot: Id, port: Id })),
  access: optional(TemplateAccessSchema),
});
const MapSiteSchema = strictObject({
  id: Id,
  assembly: Id,
  origin: tuple([pipe(number(), integer()), pipe(number(), integer()), pipe(number(), integer())]),
  turn: picklist([0, 1, 2, 3]),
  routes: pipe(
    array(strictObject({ from: Id, to: Id, traversal: picklist(['walk', 'climb']), return: vBoolean() })),
    nonEmpty(),
  ),
});

// ---- authored site layouts (metres, independent of chunk/block order) ----

const Metres = pipe(
  number(),
  check((value) => Number.isFinite(value), 'must be finite'),
);
const Degrees = pipe(
  number(),
  check((value) => Number.isFinite(value), 'must be finite'),
);
const CalendarDateSchema = pipe(
  strictObject({
    month: pipe(Count, minValue(1), maxValue(12)),
    day: pipe(Count, minValue(1), maxValue(31)),
  }),
  check(({ month, day }) => day <= [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1]!, 'invalid date'),
);
const SkyColour = pipe(
  string(),
  regex(/^#[0-9a-fA-F]{6}$/, 'must be a #rrggbb colour'),
  transform((text): readonly [number, number, number] => {
    const rgb = Number.parseInt(text.slice(1), 16);
    return [((rgb >> 16) & 255) / 255, ((rgb >> 8) & 255) / 255, (rgb & 255) / 255];
  }),
);
const UnitFraction = pipe(number(), finite(), minValue(0), maxValue(1));
/** One sky look: the keyframe values the time of day blends between (core/sky.ts owns the blend). */
const SkyLookSchema = strictObject({
  sky: SkyColour,
  lightColor: SkyColour,
  lightIntensity: NonNegative,
  ambientSky: SkyColour,
  ambientGround: SkyColour,
  ambientIntensity: NonNegative,
  fogNear: UnitFraction,
  fogFar: UnitFraction,
  heightFog: NonNegative,
  heightFogColor: SkyColour,
  bloom: NonNegative,
  tone: UnitFraction,
});
/** The weather's fog on top of the looks; fractions only shrink the distance fog, so both stay below 1. */
const WeatherTuningSchema = strictObject({
  /** The fogginess a session starts at; the looks' height fog is exactly their own density here. */
  defaultFogginess: pipe(UnitFraction, minValue(Number.MIN_VALUE)),
  nearTighten: pipe(UnitFraction, maxValue(0.99)),
  farTighten: pipe(UnitFraction, maxValue(0.99)),
});
const SKY_PHASES = ['night', 'dawn', 'day', 'dusk'] as const;
/** Where a look sits in a solar phase: 0 is the phase's start, 1 its end. */
const SkyKeySchema = strictObject({
  phase: picklist(SKY_PHASES),
  at: UnitFraction,
  look: picklist(['night', 'deepNight', 'dawn', 'day', 'dusk']),
});
/**
 * The blend sorts keys by time and wraps the last to the first, so two keys at one instant would
 * make the blend span a whole day. Keys therefore run in cycle order, strictly later each time,
 * and the last stays short of the first a cycle later.
 */
const SkyKeysSchema = pipe(
  array(SkyKeySchema),
  minLength(2),
  rawCheck(({ dataset, addIssue }) => {
    if (!dataset.typed) {
      return;
    }
    const positions = dataset.value.map((key) => SKY_PHASES.indexOf(key.phase) + key.at);
    positions.forEach((position, index) => {
      if (index > 0 && position <= positions[index - 1]!) {
        addIssue({ message: `keys[${index}].at must come strictly after the key before it in cycle order` });
      }
    });
    const last = positions.length - 1;
    if (positions[last]! >= positions[0]! + SKY_PHASES.length) {
      addIssue({ message: `keys[${last}].at must come strictly before the first key a cycle later` });
    }
  }),
);
export const DayCycleSchema = strictObject({
  /** Calendar seconds per simulation second: how long a game day lasts in play. A new session takes it; a save keeps its own. */
  clockRatio: Positive,
  latitudeDegrees: pipe(Degrees, minValue(-90), maxValue(90)),
  date: CalendarDateSchema,
  twilight: literal('nautical'),
  /** The keyframe looks by solar phase: night and deepNight around midnight, dawn and dusk at the sun's edge. */
  looks: strictObject({
    night: SkyLookSchema,
    deepNight: SkyLookSchema,
    dawn: SkyLookSchema,
    day: SkyLookSchema,
    dusk: SkyLookSchema,
  }),
  /** Which look sits where in its phase, in cycle order; timing tuning, with the order the blend needs enforced here. */
  keys: SkyKeysSchema,
  weather: WeatherTuningSchema,
  /** Where a new game starts when the scenario names no time; light is good with dusk still far off. */
  defaultStartGameTimeOfDay: GameTimeOfDay,
  /** The named spawn-window times the sun doesn't derive: dawn and dusk follow the cycle's sun. */
  midnightGameTimeOfDay: GameTimeOfDay,
  noonGameTimeOfDay: GameTimeOfDay,
});
const HalfMetres = pipe(
  Metres,
  check((v) => Number.isInteger(v * 2), 'must be snapped to 0.5 m'),
);
const MetrePosition = tuple([Metres, Metres, Metres]);
const LayoutPoint = tuple([Metres, Metres]); // [x, z]; Tiled's pixel y becomes world z.
const PositiveMetres = pipe(Metres, minValue(Number.MIN_VALUE));
const TerrainPrimitive = union([
  strictObject({
    kind: literal('ridge'),
    points: pipe(
      array(LayoutPoint),
      minLength(2),
      check((points) => hasSegment(points), 'ridge needs a non-zero segment'),
    ),
    rise: PositiveMetres,
    width: PositiveMetres,
  }),
  strictObject({
    kind: literal('hill'),
    centre: LayoutPoint,
    radii: tuple([PositiveMetres, PositiveMetres]),
    rise: PositiveMetres,
  }),
  strictObject({
    kind: literal('basin'),
    centre: LayoutPoint,
    radii: tuple([PositiveMetres, PositiveMetres]),
    depth: PositiveMetres,
  }),
]);
const FixedLootOverride = strictObject({
  lootUsage: optional(UsageSchema),
  /** Template-local furniture anchor in half-metre block cells. */
  at: tuple([Count, Count, Count]),
  items: pipe(array(FixedLootItem), nonEmpty('needs at least one fixed item')),
});
const LayoutBuilding = strictObject({
  lootContext: optional(LootContextSchema),
  template: Id,
  position: tuple([HalfMetres, HalfMetres, HalfMetres]),
  rotation: picklist([0, 90, 180, 270], 'rotation must be a quarter turn'),
  storeys: optional(pipe(Count, minValue(1), maxValue(8))),
  fixedLoot: optional(array(FixedLootOverride)),
  /** The lot stands in water on purpose, so the flooded-lot check skips it. */
  overWater: optional(vBoolean()),
});
const LayoutRect = pipe(
  strictObject({ x0: Metres, z0: Metres, x1: Metres, z1: Metres }),
  check((r) => r.x0 < r.x1 && r.z0 < r.z1, 'must have positive area'),
);

const HalfMetrePosition = tuple([HalfMetres, HalfMetres, HalfMetres]);
const PositiveHalfMetres = pipe(HalfMetres, minValue(0.5));
/** Where new features are shown: an authored row of slots and a derived catalogue of every furniture piece. */
const ShowroomSchema = strictObject({
  /** The west end of the slot row's front line, feet on the deck; slots run east from here. */
  row: HalfMetrePosition,
  /** Which way every slot's front faces; the row is seen from that side. */
  facing: picklist(['n', 's']),
  /** Gap between neighbouring slots. */
  spacing: PositiveHalfMetres,
  /** How many slots the row holds; a new slot past it replaces the oldest. */
  capacity: pipe(Count, minValue(1)),
  /** Oldest first; the default spawn faces the last. */
  slots: array(
    strictObject({
      furniture: Id,
      fixed: optional(literal(true)),
      /** The slot's fixture stock. */
      items: optional(pipe(array(omit(FixedLootItem, ['key'])), nonEmpty())),
    }),
  ),
  /** How far in front of a prop a focus spawn stands. */
  focusDistance: PositiveHalfMetres,
  /** Every content furniture piece in rows facing south, on a flat floor; row packing remains game logic. */
  catalogue: strictObject({
    /** The floor's north-west corner, feet height; rows run east and each next row lies further south. */
    position: HalfMetrePosition,
    /** How far east a row may run. */
    width: PositiveHalfMetres,
    /** Gap between neighbouring pieces, and the aisle in front of each row. */
    spacing: PositiveHalfMetres,
    /** The block the floor is made of. */
    floor: Id,
    /** How far the natural ground takes to blend into the floor. */
    blend: PositiveHalfMetres,
  }),
});

const SiteLayoutSchema = strictObject({
  /** Layout keys are URL scene names, including camel-case names. */
  id: pipe(string(), regex(/^[a-zA-Z][a-zA-Z0-9_]*$/, 'must be a URL scene name')),
  lootContext: LootContextSchema,
  /** Fixture and showcase layouts are not world sources; unmarked authored layouts contribute building containers and fixed loot. */
  demo: optional(vBoolean()),
  /** The render-only weathering profile for this site; absent layouts use the default profile. */
  weatheringProfile: optional(Id),
  bounds: LayoutRect,
  /** Foundation elevation: lower face of the top ground block, in metres. */
  ground: HalfMetres,
  /** Calendar time on day 1 when this site is selected without an explicit ?time=. */
  startTimeGameTimeOfDay: optional(GameTimeOfDay),
  terrain: array(TerrainPrimitive),
  buildings: array(LayoutBuilding),
  vehicles: optional(
    array(
      strictObject({
        blueprint: Id,
        placementKey: pipe(string(), nonEmpty()),
        position: MetrePosition,
        facing: picklist(['n', 'e', 's', 'w']),
      }),
    ),
  ),
  /** Vehicle parking bays: a vehicle's origin and facing, whether or not one is parked there. */
  bays: optional(array(strictObject({ position: MetrePosition, facing: picklist(['n', 'e', 's', 'w']) }))),
  /** The building template whose containers receive derived repair stock; derivation remains game logic. */
  repairStock: optional(Id),
  showroom: optional(ShowroomSchema),
  /** Debug lane placement is independent of landscape bounds, so enlarging a view does not move test supplies. */
  handlingRange: optional(strictObject({ beside: LayoutRect, floor: HalfMetres })),
  player: strictObject({
    position: MetrePosition,
    /** Clockwise degrees from WORLD_NORTH; converted to camera yaw only at startup. */
    bearing: Degrees,
  }),
  shamblers: array(
    strictObject({
      type: Id,
      position: MetrePosition,
      chance: optional(Fraction),
      window: optional(SpawnWindowSchema),
    }),
  ),
  hordes: optional(array(strictObject({ id: Id, position: MetrePosition }))),
  woodlands: array(strictObject({ polygon: pipe(array(LayoutPoint), minLength(3)), density: Fraction })),
  /** Standing water: wherever a column inside the polygon has its bed below the level, water fills up to it. */
  water: optional(
    array(
      strictObject({
        /** The water's top face, the plane a swimmer floats at; `ground` is instead a block's lower face. */
        level: HalfMetres,
        polygon: pipe(array(LayoutPoint), minLength(3)),
        /** How far from the water the ground turns to sand. */
        shore: pipe(Metres, minValue(0)),
      }),
    ),
  ),
  tracks: array(
    strictObject({
      points: pipe(array(LayoutPoint), minLength(2)),
      width: pipe(Metres, minValue(Number.MIN_VALUE)),
      /** The block the track's surface is made of. */
      surface: Id,
    }),
  ),
  /** Observation only: playtest metrics record when the player first stands in each beat's area. */
  beats: optional(array(strictObject({ id: Id, area: LayoutRect }))),
  /** Practice's optional modules: the items each teaches and the labels its steps show. */
  practice: optional(
    strictObject({
      light: strictObject({
        light: Id,
        battery: Id,
        labels: strictObject({ start: Name, on: Name, assign: Name, swap: Name, relight: Name }),
      }),
    }),
  ),
});

const PoolRefSchema = union([KitRefSchema, strictObject({ kind: literal('template'), id: Id, style: optional(Id) })]);
const MapPoolSchema = strictObject({
  id: Id,
  choices: pipe(
    array(
      strictObject({
        ref: PoolRefSchema,
        weight: pipe(
          number(),
          minValue(0),
          check((value) => Number.isFinite(value), 'must be finite'),
        ),
        atLeast: optional(pipe(number(), integer('must be a whole number'), minValue(1))),
        atMost: optional(pipe(number(), integer('must be a whole number'), minValue(0))),
      }),
    ),
    minLength(1),
    check(
      (rows) => rows.every(({ atLeast, atMost }) => atLeast === undefined || atMost === undefined || atLeast <= atMost),
      'atLeast must not exceed atMost',
    ),
    check(
      (rows) => new Set(rows.map(({ ref }) => `${ref.kind}:${ref.id}@${ref.style ?? ''}`)).size === rows.length,
      'building refs must be unique',
    ),
    check((rows) => rows.some(({ weight }) => weight > 0), 'needs a positive building weight'),
  ),
});

const StartDescentSchema = variant('kind', [
  strictObject({ kind: literal('ladder'), ladder: CellPosition, upper: CellPosition, lower: CellPosition }),
  strictObject({ kind: literal('stairs'), hatch: CellPosition, upper: CellPosition, lower: CellPosition }),
  strictObject({
    kind: literal('drop'),
    upper: CellPosition,
    edge: CellPosition,
    landing: CellPosition,
    lower: CellPosition,
  }),
]);

/** Block geometry of a street grid, in blocks; shared so a scenario city and the stress city keep the same limits. */
const CityBlockGeometry = {
  street: pipe(Count, minValue(4), maxValue(64)),
  blockX: pipe(Count, minValue(8), maxValue(256)),
  blockZ: pipe(Count, minValue(8), maxValue(256)),
  pad: pipe(Count, minValue(2), maxValue(32)),
  gap: pipe(Count, minValue(1), maxValue(32)),
  blend: pipe(Count, maxValue(64)),
  rows: pipe(
    Count,
    minValue(2),
    maxValue(8),
    check((value) => value % 2 === 0, 'needs paired rows'),
  ),
};
const CityBenchmarkSchema = strictObject({
  id: Id,
  settlementKind: Id,
  pool: Id,
  ...CityBlockGeometry,
  reachMetres: PositiveMetres,
});
const PerimeterCrossingSchema = strictObject({ id: Id, inside: CellPosition, outside: CellPosition });
export type PerimeterCrossingDef = InferOutput<typeof PerimeterCrossingSchema>;

const CityLotSchema = strictObject({
  id: Id,
  position: tuple([CellCoordinate, CellCoordinate]),
  size: tuple([pipe(Count, minValue(1)), pipe(Count, minValue(1))]),
  turn: picklist([0, 1, 2, 3]),
  source: optional(
    union([
      strictObject({ kind: picklist(['template', 'assembly']), id: Id, style: optional(Id) }),
      strictObject({ kind: literal('pool'), id: Id }),
    ]),
  ),
  /** A direct crossing prevents a route around the fence from certifying a blocked breach. */
  routes: optional(array(PerimeterCrossingSchema)),
});
/** A corridor under the city; elements, mouths and ports are lists so a later junction is one more entry. */
const CityUndergroundSchema = strictObject({
  id: Id,
  assembly: Id,
  position: tuple([CellCoordinate, CellCoordinate]),
  turn: picklist([0, 1, 2, 3]),
  /** Ladders up to the street, in element cells. */
  mouths: pipe(array(strictObject({ ladder: CellPosition, upper: CellPosition, lower: CellPosition })), minLength(1)),
  /** Openings into the service: `outside` in element cells; `threshold` and `inside` in service cells. */
  ports: pipe(
    array(strictObject({ id: Id, outside: CellPosition, threshold: CellPosition, inside: CellPosition })),
    minLength(1),
  ),
});
// Action ids are code-owned and dotted, so `Id` does not fit; `controlRowIssue` checks them against the actions.
const ControlSchema = strictObject({
  id: pipe(string(), minLength(1)),
  keys: array(
    strictObject({
      code: pipe(string(), minLength(1)),
      modifier: exactOptional(picklist(['shift', 'alt', 'ctrl', 'meta'])),
    }),
  ),
});
/** A scenario event: once its trigger has passed and every condition holds, its effects apply once. See `SLICE-5.md`, "Settled event and playtest rules". */
const EventRuleSchema = strictObject({
  id: Id,
  trigger: union([strictObject({ kind: literal('elapsed'), afterGameHours: PositiveGameHours })]),
  conditions: optional(
    array(union([strictObject({ kind: literal('dayPhase'), phases: pipe(array(picklist(DAY_PHASES)), nonEmpty()) })])),
    [],
  ),
  effects: pipe(
    array(
      union([
        /** A horde of one zombie type appears at `at`, in world cells, and heads for where the player stood. */
        strictObject({
          kind: literal('releaseHorde'),
          zombie: Id,
          count: pipe(Count, minValue(1), maxValue(64)),
          at: CellPosition,
        }),
      ]),
    ),
    nonEmpty('needs an effect'),
  ),
});
export type EventRuleDef = InferOutput<typeof EventRuleSchema>;
const ScenarioSchema = strictObject({
  id: Id,
  kind: picklist(SCENARIO_KINDS),
  outbreakAgeGameHours: PositiveGameHours,
  decalLimit: pipe(Count, maxValue(4096)),
  body: Id,
  compression: Id,
  serviceTemplate: Id,
  composition: optional(
    strictObject({
      start: strictObject({
        template: Id,
        cell: tuple([pipe(number(), integer()), pipe(number(), integer())]),
        spawn: CellPosition,
        minimumOpenDescents: optional(pipe(Count, minValue(1), maxValue(32)), 2),
        descents: pipe(array(StartDescentSchema), minLength(1), maxLength(32)),
        /** Core stock the instance promises in the start building, at template-local furniture anchors. */
        fixedLoot: optional(array(FixedLootOverride)),
      }),
      fixedLoot: pipe(array(FixedLootOverride), nonEmpty('needs a fixed resource source')),
      events: optional(
        array(
          strictObject({
            template: Id,
            lot: Id,
            at: CellPosition,
            fixedLoot: pipe(array(FixedLootOverride), nonEmpty('needs a promised item')),
          }),
        ),
      ),
      /** Core stock the instance promises in a fixed lot's building; the building's template stays unchanged. */
      stops: optional(
        array(
          strictObject({
            lot: Id,
            fixedLoot: pipe(array(FixedLootOverride), nonEmpty('needs a promised item')),
          }),
        ),
      ),
      leads: tuple([
        strictObject({
          template: Id,
          fixedLoot: optional(array(FixedLootOverride)),
          lot: optional(Id),
          at: optional(CellPosition),
          standing: optional(CellPosition),
        }),
        strictObject({
          template: Id,
          fixedLoot: optional(array(FixedLootOverride)),
          lot: optional(Id),
          at: optional(CellPosition),
          standing: optional(CellPosition),
        }),
      ]),
      landmarks: tuple([Id, Id]),
      landmarkPositions: optional(tuple([CellPosition, CellPosition])),
      incidentalTemplates: pipe(array(Id), minLength(1), maxLength(32)),
      objective: CellPosition,
      objectiveFace: CellPosition,
      retreat: CellPosition,
      /**
       * Service-local unless `lot` names a fixed lot, whose stop then holds the stock and whose local frame the poses
       * use. A `key` route is proved from the start: up its climbs to the holder, back down, then to the resource.
       */
      resources: pipe(
        array(
          strictObject({
            at: CellPosition,
            standing: CellPosition,
            lot: optional(Id),
            key: optional(
              strictObject({
                at: CellPosition,
                standing: CellPosition,
                climbs: optional(
                  array(strictObject({ ladder: CellPosition, upper: CellPosition, lower: CellPosition })),
                  [],
                ),
              }),
            ),
          }),
        ),
        nonEmpty('needs a resource standing pose'),
      ),
      storeys: pipe(array(strictObject({ id: Id, standing: CellPosition })), minLength(1), maxLength(16)),
      seals: optional(
        array(
          strictObject({
            doors: pipe(array(CellPosition), nonEmpty()),
            key: CellPosition,
            held: optional(literal(true)),
            standing: CellPosition,
          }),
        ),
        [],
      ),
      stairs: optional(array(strictObject({ upper: CellPosition, lower: CellPosition })), []),
      descents: pipe(
        array(strictObject({ ladder: CellPosition, upper: CellPosition, lower: CellPosition })),
        maxLength(32),
      ),
    }),
  ),
  portal: strictObject({
    hatch: CellPosition,
    ladder: CellPosition,
    upper: CellPosition,
    lower: CellPosition,
  }),
  eventRules: optional(array(EventRuleSchema), []),
  /** The ordinary buildings' street pressure; authored markers are separate from it. */
  population: strictObject({
    settlementPressure: vBoolean(),
    authoredMarkers: vBoolean(),
    /** Ordinary buildings per street group; each group gets roadside stragglers. */
    groupSize: pipe(Count, minValue(1), maxValue(64)),
    /** Hordes in the whole city, each on a different seeded street group. */
    hordes: pipe(Count, maxValue(16)),
    hordeAreas: optional(array(LayoutRect)),
    /** Metres each side of a street's centreline where stragglers stand. */
    roadsideOffset: pipe(Count, minValue(1), maxValue(32)),
    /** Stragglers added to each group on top of its baseline settlement count. */
    extraStragglers: pipe(Count, maxValue(16)),
  }),
  city: strictObject({
    settlementKind: Id,
    blocksX: pipe(Count, minValue(1), maxValue(4)),
    blocksZ: pipe(Count, minValue(1), maxValue(4)),
    ...CityBlockGeometry,
    /** Holds the ground at the city floor beyond the bounds instead of blending to the natural terrain, so a confined playtest site has no relief. */
    flatSurroundings: optional(vBoolean()),
    perimeter: optional(
      strictObject({
        block: Id,
        height: pipe(Count, minValue(1), maxValue(32)),
        thickness: pipe(Count, minValue(2), maxValue(8)),
        /** Solid wire fence on top of the wall. */
        wire: optional(strictObject({ block: Id, height: pipe(Count, minValue(1), maxValue(8)) })),
        /** Assembly set against the wall's inside face every `pitch` blocks, facing inward. */
        lining: optional(strictObject({ assembly: Id, pitch: pipe(Count, minValue(2), maxValue(64)) })),
        /** Assembly set against the wall where the central street meets it. */
        gate: optional(strictObject({ assembly: Id })),
      }),
    ),
    /** One row of buildings around the grid, backs to the wall and fronts to the outermost street. */
    ring: optional(strictObject({ pool: Id, setback: pipe(Count, minValue(1), maxValue(64)) })),
    streetProps: optional(pipe(array(Id), maxLength(16))),
    bounds: optional(LayoutRect),
    lots: optional(array(CityLotSchema)),
    underground: optional(array(CityUndergroundSchema)),
    fillRows: optional(vBoolean()),
    paving: optional(array(LayoutRect)),
    service: optional(
      strictObject({
        cell: tuple([CellCoordinate, CellCoordinate]),
        turn: picklist([0, 1, 2, 3]),
        routes: optional(array(PerimeterCrossingSchema)),
      }),
    ),
    pool: Id,
  }),
});

// ---- zombies ----

export type ShamblerHitRegion = 'head' | 'torso' | 'leftArm' | 'rightArm' | 'leftLeg' | 'rightLeg';
export type ZombieRegion = ShamblerHitRegion;
export type ZombieHitRegion = ZombieRegion | 'core.trunk' | `member.${number}.${ShamblerHitRegion}`;
export type ZombieRegions = Record<string, number>;

const AMALGAM_REGION_KEYS = ['core.trunk', ...ZOMBIE_REGION_NAMES.map((region) => `member.${region}`)];

const ZOMBIE_MODEL = picklist(['shambler', 'runner', 'brute', 'acid', 'amalgam']);

const ZOMBIE_ABILITIES = [
  'grab',
  'leap',
  'scream',
  'explode',
  'acidSpit',
  'heatAura',
  'lightEmitter',
  'armoured',
  'regenerate',
  'burrow',
] as const;

const MeleeDamageResistanceSchema = strictObject({
  head: strictObject({ blunt: Fraction, cut: Fraction, pierce: Fraction }),
  torso: strictObject({ blunt: Fraction, cut: Fraction, pierce: Fraction }),
  leftArm: strictObject({ blunt: Fraction, cut: Fraction, pierce: Fraction }),
  rightArm: strictObject({ blunt: Fraction, cut: Fraction, pierce: Fraction }),
  leftLeg: strictObject({ blunt: Fraction, cut: Fraction, pierce: Fraction }),
  rightLeg: strictObject({ blunt: Fraction, cut: Fraction, pierce: Fraction }),
});

/** What a landed hit can be, picked by weight as it lands (`DESIGN.md`, "Bleeding"). */
const DamageMoveSchema = strictObject({
  id: Id,
  weight: Positive,
  damage: Positive,
  damageKind: picklist(DAMAGE_KINDS),
  hitRegions: pipe(
    array(strictObject({ region: picklist(BODY_REGIONS), weight: Positive })),
    nonEmpty('needs at least one hit region'),
  ),
});
const ZombieMovesSchema = pipe(
  array(strictObject({ ...DamageMoveSchema.entries, motion: picklist(MELEE_MOTIONS) })),
  nonEmpty('needs at least one move'),
);

/** Tunables of the `acidSpit` ability (`docs/acid-zombie.md`, "Ability, not type"). */
const AcidSpitSchema = pipe(
  strictObject({
    rangeBand: strictObject({ nearMetres: Positive, farMetres: Positive }),
    windupSimSeconds: PositiveSimSeconds,
    cooldownSimSeconds: PositiveSimSeconds,
    /** Fraction of the cooldown a spit cancelled by a hit costs. */
    cancelPenaltyFraction: Fraction,
    spreadDegrees: pipe(NonNegative, maxValue(90, 'must be at most 90')),
    globMetresPerSimSecond: SimRate,
    globGravityMetresPerSimSecondSquared: SimAcceleration,
    presentation: strictObject({
      color: Color,
      radiusMetres: Positive,
      splashRadiusMetres: Positive,
      splashRealSeconds: PositiveRealSeconds,
    }),
    moves: pipe(array(DamageMoveSchema), nonEmpty('needs at least one move')),
    puddle: strictObject({
      lifetimeSimSeconds: PositiveSimSeconds,
      radiusMetres: Positive,
      damagePerSimSecond: Positive,
    }),
  }),
  check(({ rangeBand }) => rangeBand.nearMetres < rangeBand.farMetres, 'range band near edge must be inside far edge'),
  check((spit) => spit.windupSimSeconds < spit.cooldownSimSeconds, 'windup must be less than cooldown'),
  check(({ moves }) => new Set(moves.map(({ id }) => id)).size === moves.length, 'zombie move ids must be unique'),
);

/** How the acid model's body shows its acid (`docs/acid-zombie.md`, "Model"). Presentation only. */
const AcidBodySchema = pipe(
  strictObject({
    color: Color,
    /** Multiplier on the sac's emission, at rest and at the end of a spit wind-up. */
    charge: strictObject({ idle: NonNegative, charged: NonNegative }),
    /** The point light the sac lends its surroundings while the actor is among the nearest glowing ones. */
    light: strictObject({ intensity: Positive, radiusMetres: Positive }),
    drips: strictObject({ perRealSecond: Positive, sizeMetres: Positive }),
    /** The burst of droplets that replaces the sac on death. */
    deathSplash: strictObject({
      droplets: pipe(number(), integer(), minValue(1, 'must be at least 1')),
      speedMetresPerRealSecond: Positive,
      slowestSpeedFraction: Fraction,
      sizeMetres: Positive,
    }),
  }),
  check(({ charge }) => charge.idle <= charge.charged, 'the sac must not dim during the wind-up'),
);

const ZombieSchema = strictObject({
  id: Id,
  name: Name,
  /** Mobgen template selected for this type's silhouette and posed hit regions. */
  model: ZOMBIE_MODEL,
  /** Uniform scale for this model's realized body, in addition to the mobgen template's dimensions. */
  bodyScale: optional(Positive),
  /** Mobgen figure seeds an individual of this type is drawn from. Every model but the amalgam, whose figure seed is fixed, defines them. */
  figureSeeds: optional(
    pipe(
      array(pipe(number(), integer('must be a whole number'), minValue(1, 'must be 1 or more'))),
      minLength(1, 'needs at least one figure seed'),
      check((seeds) => new Set(seeds).size === seeds.length, 'figure seeds must be distinct'),
    ),
  ),
  /** Overrides body-height pitch scaling for this type's voice cues. */
  soundPitchMultiplier: optional(Positive),
  /** Health keyed by hit-region id; ordinary shamblers use six anatomy keys, amalgams use manifest ids. */
  regions: record(pipe(string(), nonEmpty('must not be empty')), Positive),
  /** Explicitly null when this region leaves no item. */
  severedItems: record(pipe(string(), nonEmpty('must not be empty')), nullable(Id)),
  /** Relative chance that an ordinary settlement spawn chooses this type; 1 is the common baseline. */
  spawnWeight: pipe(Positive, maxValue(1, 'must be at most 1')),
  /** Excludes this kind from ordinary settlement selection while keeping authored/debug spawns available. */
  authoredOnly: optional(vBoolean()),
  /** Sound ids are content references, so a new voice needs content only; the registry checks each exists. */
  sounds: strictObject({ idle: Id, alert: Id, attack: Id, hurt: Id }),
  /** Idle voice cadence and its local-crowd thinning curve. */
  idleSound: strictObject({
    intervalSimSeconds: SimDurationRange,
    density: strictObject({ radiusMetres: Positive, penaltyPerNeighbour: NonNegative }),
  }),
  /** Fraction of each melee damage type resisted by each region; omitted entries are neutral. */
  meleeDamageResistance: optional(MeleeDamageResistanceSchema),
  /** Fraction of acid damage resisted, whatever the region; 1 is immune and omitted is neutral. */
  acidResistance: optional(Fraction),
  speed: strictObject({
    wanderMetresPerSimSecond: SimRate,
    chaseMetresPerSimSecond: SimRate,
    /** The farthest one background-tier tick moves it toward its target. */
    backgroundStepMetres: Positive,
  }),
  /** Metres advanced by one half-cycle of the leg gait. */
  stepLength: Positive,
  /** Surface-step sound family for grounded travel; omitted types do not emit footfalls. */
  footstepSound: optional(picklist(['shambler'])),
  /** Whether this type tries to jump low obstacles when grounded. */
  canJumpObstacles: vBoolean(),
  /**
   * Force of a bash against a closed door it is pressed against, in the N·s of a melee weapon's `impulse`, so a
   * player's strike and a bash meet the same door gate. It bashes once per attack cooldown; 0 never damages a door.
   */
  strength: NonNegative,
  /**
   * How it moves relative to its facing: `forward` walks only along its facing, so it turns before it heads
   * somewhere new; `omnidirectional` moves straight toward its goal whatever its facing, which still turns to
   * the goal. Omitted is `forward`.
   */
  locomotion: optional(picklist(['forward', 'omnidirectional'])),
  /** Metres by day. */
  sight: Positive,
  /** Metres by night. */
  nightSight: Positive,
  /** Multiplies the range at which a light is spotted; omitted is 1. */
  lightSightScale: optional(Positive),
  /** Sim seconds before a heard or seen stimulus is forgotten. */
  stimulusMemorySimSeconds: Positive,
  /** Half-angle of the sight cone, in degrees. */
  sightCone: pipe(Positive, maxValue(180, 'must be at most 180')),
  /** Height above its feet that it sees from. */
  eyeHeightMetres: Positive,
  /** Height above its feet that it hears at; a sound's occlusion line runs level from the source at this height. */
  earHeightMetres: Positive,
  /** A horde of this type stands on a golden-angle spiral whose radius grows from `innerMetres` by `stepMetres` × √member. */
  hordeSpacing: strictObject({ innerMetres: NonNegative, stepMetres: Positive }),
  /** Idle/stroll timing, home leash and eased look controls. */
  wander: strictObject({
    obstacleWanderChance: Fraction,
    obstacleWanderDistanceMetres: Positive,
    /**
     * How far a zombie held up at a piece looks for a way past it (`DESIGN.md`, "Senses and AI"). It bashes the piece
     * only when no way past gains ground toward its target within this reach.
     */
    wayAroundReachMetres: Positive,
    /**
     * The share of the ground a clear heading would gain toward its target that a slanted heading must still gain
     * within that reach to count as a way past.
     */
    wayAroundMinGainFraction: Fraction,
    idleSimSeconds: SimDurationRange,
    strollSimSeconds: SimDurationRange,
    leashMetres: Positive,
    lookIntervalSimSeconds: SimDurationRange,
    bodyLookArcDegrees: pipe(Positive, maxValue(360, 'must be at most 360')),
    headLookArcDegrees: pipe(Positive, maxValue(360, 'must be at most 360')),
    bodyTurnDegreesPerSimSecond: SimRate,
    headTurnDegreesPerSimSecond: SimRate,
    movementAccelerationMetresPerSimSecondSquared: SimAcceleration,
  }),
  /** 1 is normal hearing. */
  hearing: NonNegative,
  hearingRange: strictObject({ walk: Positive, jog: Positive, sprint: Positive }),
  hearingModel: pipe(
    strictObject({
      farMultiplier: pipe(Positive, minValue(1, 'must be at least 1')),
      bearingErrorRadians: pipe(Positive, maxValue(Math.PI, 'must be at most pi')),
      investigationDistanceMetres: Positive,
      loudNoiseRadiusMetres: Positive,
      hesitationSimSeconds: SimDurationRange,
      refusalSuspicionSimSeconds: PositiveSimSeconds,
      refusalLean: Fraction,
      alertCooldownSimSeconds: NonNegative,
      chainRadiusMetres: NonNegative,
      chainChance: Fraction,
      searchSimSeconds: SimDurationRange,
      searchRadiusMetres: Positive,
      searchStrollSimSeconds: SimDurationRange,
    }),
    check(
      (model) => model.hesitationSimSeconds.min <= model.hesitationSimSeconds.max,
      'minimum hesitation must not exceed maximum',
    ),
    check(
      (model) => model.searchSimSeconds.min <= model.searchSimSeconds.max,
      'minimum search duration must not exceed maximum',
    ),
    check(
      (model) => model.searchStrollSimSeconds.min <= model.searchStrollSimSeconds.max,
      'minimum search stroll must not exceed maximum',
    ),
  ),
  chaseMotion: pipe(
    strictObject({
      swayDegrees: pipe(NonNegative, maxValue(90, 'must be at most 90')),
      swayIntervalSimSeconds: SimDurationRange,
      speedMultiplier: strictObject({ min: Positive, max: Positive }),
      lurchSimSeconds: PositiveSimSeconds,
      stumbleChancePerSimSecond: pipe(NonNegative, maxValue(1, 'must be at most 1'), transform(simRate)),
      stumbleDurationSimSeconds: SimDurationRange,
      stumbleEaseSimSeconds: PositiveSimSeconds,
      stumbleSpeedFraction: Fraction,
      stumbleDecelerationMetresPerSimSecondSquared: SimAcceleration,
    }),
    check(
      (motion) => motion.swayIntervalSimSeconds.min <= motion.swayIntervalSimSeconds.max,
      'minimum sway interval must not exceed maximum',
    ),
    check(
      (motion) => motion.speedMultiplier.min <= motion.speedMultiplier.max,
      'minimum speed multiplier must not exceed maximum',
    ),
    check(
      (motion) => motion.stumbleDurationSimSeconds.min <= motion.stumbleDurationSimSeconds.max,
      'minimum stumble duration must not exceed maximum',
    ),
    check(
      (motion) => motion.stumbleDurationSimSeconds.min >= 2 * motion.stumbleEaseSimSeconds,
      'stumble duration must allow easing in and out',
    ),
  ),
  attack: pipe(
    strictObject({
      reach: Positive,
      cooldownSimSeconds: PositiveSimSeconds,
      windupSimSeconds: PositiveSimSeconds,
      /** A grab lands only while the player's feet are less than this far above or below its own. */
      grabBandMetres: optional(Positive),
      moves: ZombieMovesSchema,
    }),
    check((attack) => attack.windupSimSeconds < attack.cooldownSimSeconds, 'windup must be less than cooldown'),
    check(({ moves }) => new Set(moves.map(({ id }) => id)).size === moves.length, 'zombie move ids must be unique'),
  ),
  /** A melee hit with at least this impulse holds the zombie still and spoils its attack (docs/stagger.md);
   * absent means it never staggers. */
  stagger: optional(strictObject({ impulseThreshold: Positive, durationSimSeconds: PositiveSimSeconds })),
  /** Flesh a damaging hit knocks off the body, leaving a hole (src/core/amalgamCarving.ts): the struck voxel
   * and every voxel within the radius of it. Amalgams only. */
  carving: optional(
    strictObject({
      radiusMetresPerDamage: pipe(NonNegative, maxValue(0.01, 'must be at most 0.01')),
      maxRadiusMetres: pipe(NonNegative, maxValue(1, 'must be at most 1')),
      /** The hole's inner faces. */
      interiorColor: Color,
    }),
  ),
  /** Per-hit chance of severing a random not-yet-severed arm part (src/core/zombies.ts's swing); a
   * killing blow additionally rolls headOnKillChance to sever the head too. Both independent 0..1 chances,
   * not a shared budget. */
  dismember: strictObject({ chance: Fraction, headOnKillChance: Fraction }),
  /** The timed actions that clear a downed body (src/game/downedBody.ts). Finishing it off needs no tool;
   * dismembering it needs a carried tool with the quality and leaves its arms and head behind. */
  downed: optional(
    strictObject({
      finishOff: strictObject({ simSeconds: PositiveSimSeconds }),
      dismember: strictObject({ simSeconds: PositiveSimSeconds, quality: Id, level: QualityLevel }),
    }),
  ),
  abilities: array(picklist(ZOMBIE_ABILITIES)),
  /** Tunables of the `acidSpit` ability; present exactly when the type lists that ability. */
  acidSpit: optional(AcidSpitSchema),
  /** The acid model's glow, drips and death splash; present exactly when the model is `acid`. */
  acidBody: optional(AcidBodySchema),
  /** What's in its pockets. */
  loot: optional(Id),
});

const zombieAcidSpitMatchesAbility = (zombie: InferOutput<typeof ZombieSchema>): boolean =>
  zombie.abilities.includes('acidSpit') === (zombie.acidSpit !== undefined);

const zombieRegionsMatchModel = (zombie: InferOutput<typeof ZombieSchema>): boolean => {
  const expected = zombie.model === 'amalgam' ? AMALGAM_REGION_KEYS : ZOMBIE_REGION_NAMES;
  const keys = Object.keys(zombie.regions);
  return keys.length === expected.length && expected.every((key) => Object.hasOwn(zombie.regions, key));
};

/** A lowered stance's drawn pose, pivoting about the hip; `DESIGN.md`, "Crouching and lying prone". */
const StancePoseSchema = strictObject({
  hipDropMetres: NonNegative,
  /** Torso, head and arms pitch forward about the hip. */
  torsoForwardDegrees: Degrees,
  /** Legs and feet swing forward about the hip; negative swings them back. */
  legsForwardDegrees: Degrees,
  /** Each shin and foot swing back about the knee. */
  kneeBendDegrees: Degrees,
  /** Each foot turns toe up about the ankle. */
  ankleDegrees: Degrees,
  /** Each arm swings forward about its shoulder, from hanging along the torso. */
  armsForwardDegrees: Degrees,
  /** Each forearm and hand swing forward and up about the elbow, from hanging along the upper arm. */
  elbowBendDegrees: Degrees,
  /** The head tips back about the neck, from standing on the torso. */
  headUpDegrees: Degrees,
});

/** The limbs a figure hangs from its body, each at the body joint of the same name in `FIGURE_LIMB_JOINTS`. */
export const FIGURE_LIMBS = ['leftArm', 'rightArm', 'leftLeg', 'rightLeg'] as const;
export type FigureLimb = (typeof FIGURE_LIMBS)[number];
/** The pivots the limbs hang from and are posed about. */
const FIGURE_JOINTS = ['leftHip', 'rightHip', 'leftShoulder', 'rightShoulder'] as const;
export type FigureJoint = (typeof FIGURE_JOINTS)[number];
export const FIGURE_LIMB_JOINTS: Readonly<Record<FigureLimb, FigureJoint>> = {
  leftArm: 'leftShoulder',
  rightArm: 'rightShoulder',
  leftLeg: 'leftHip',
  rightLeg: 'rightHip',
};

/** An authored limb: its model and the model anchor that sits at, and turns about, its body joint. */
const FigureLimbSchema = strictObject({ model: Id, joint: Id });

/** The arm model's segments, each a part the first-person view turns about its own joint; `DESIGN.md`, "Models". */
export const ARM_SEGMENTS = ['upper', 'fore', 'hand', 'fingers', 'thumb'] as const;
export type ArmSegment = (typeof ARM_SEGMENTS)[number];
/** One segment: the limb model's part, and the model anchor it turns about. */
const ArmSegmentSchema = strictObject({ part: Id, pivot: Id });
/** How a hand closes: the fingers curl at the knuckles; the thumb folds across the palm and in toward it. */
const HandPoseSchema = strictObject({ fingersDegrees: Degrees, thumbAcrossDegrees: Degrees, thumbInDegrees: Degrees });
/** The first-person view's rig over the arm model (src/render/armRig.ts). */
const ArmRigSchema = strictObject({
  upper: ArmSegmentSchema,
  fore: ArmSegmentSchema,
  hand: ArmSegmentSchema,
  fingers: ArmSegmentSchema,
  thumb: ArmSegmentSchema,
  /** The anchor on the palm's midline a held item's grip sits against, moved out to the palm's face. */
  grip: Id,
  /** One closing per `HAND_POSES` name; a held model's hold names the one its hand takes. */
  handPoses: strictObject({
    fist: HandPoseSchema,
    holding: HandPoseSchema,
    open: HandPoseSchema,
    pistolGrip: HandPoseSchema,
    pistolWrap: HandPoseSchema,
    pistolCup: HandPoseSchema,
    stockWrist: HandPoseSchema,
    forend: HandPoseSchema,
  }),
  /**
   * Where the view hangs the right arm, in the eye's frame (x right, y up, z back); the left mirrors x. Presentation,
   * not the body's own shoulder: wider and lower, so the arms show in view. Validation wants it right of and below
   * the eye.
   */
  shoulderFromEye: Point,
});
export type ArmRigDef = InferOutput<typeof ArmRigSchema>;

/** The leg model's segments below the thigh, each turned about its own joint as a stance bends the leg. */
export const LEG_SEGMENTS = ['shin', 'foot'] as const;
export type LegSegment = (typeof LEG_SEGMENTS)[number];
/** Both leg models' rig, from the hip down; the thigh is the rest of the model. */
const LegRigSchema = strictObject({ shin: ArmSegmentSchema, foot: ArmSegmentSchema });
export type HandPoseDef = InferOutput<typeof HandPoseSchema>;

const ReadyHandSchema = strictObject({ offset: Point, rotation: Point });
const HeldPosesSchema = strictObject({
  reachLeadMetres: NonNegative,
  oneHand: Point,
  twoHand: Point,
  display: Point,
  supportUpright: Point,
  supportForward: Point,
  /** Firearm-ready hand transforms; guard transforms stay separate so they cannot move a weapon bore. */
  readyPrimary: ReadyHandSchema,
  readySupport: ReadyHandSchema,
  guardPrimary: ReadyHandSchema,
  guardSupport: ReadyHandSchema,
  /** Raised free-hand transform while an active off-hand item accompanies an aimed firearm. */
  aimActiveOffHand: ReadyHandSchema,
});
export type HeldPosesDef = InferOutput<typeof HeldPosesSchema>;

/** Actor models and poses are content so appearance doesn't live in renderer code; `DESIGN.md`, "Models". */
const FigureSchema = strictObject({
  id: Id,
  /** Where the hips stand above the ground; stances pivot about them. */
  hipHeightMetres: Positive,
  /**
   * The head and torso model; each joint names its anchor. It stands with its hips at the hip height. A stance turns
   * the head part about its pivot.
   */
  body: strictObject({
    model: Id,
    joints: strictObject({ leftHip: Id, rightHip: Id, leftShoulder: Id, rightShoulder: Id }),
    head: ArmSegmentSchema,
  }),
  limbs: strictObject({
    leftArm: FigureLimbSchema,
    rightArm: FigureLimbSchema,
    leftLeg: FigureLimbSchema,
    rightLeg: FigureLimbSchema,
  }),
  /** Both arm models' rig; the two arms share it because each is the mirror of the other. */
  armRig: ArmRigSchema,
  holds: HeldPosesSchema,
  attachmentFrames: record(
    Id,
    strictObject({
      part: picklist(['body', ...FIGURE_LIMBS]),
      pivot: optional(Id),
      at: tuple([number(), number(), number()]),
      turn: tuple([number(), number(), number()]),
      insideView: vBoolean(),
    }),
  ),
  /** Both leg models' rig; the two legs share it because each is the mirror of the other. */
  legRig: LegRigSchema,
  /** Walking swings each leg about its hip and each arm, against its leg, about its shoulder; peak angles. */
  gait: strictObject({ legSwingDegrees: Degrees, armSwingDegrees: Degrees }),
  /** Where the debug mannequin stands from the player, along and across the player's facing. */
  mannequinPlacement: strictObject({ aheadMetres: Positive, asideMetres: Positive }),
  stancePoses: strictObject({
    crouching: StancePoseSchema,
    prone: StancePoseSchema,
    /** How long the drawn body takes to settle into a new stance. */
    blendRealSeconds: PositiveRealSeconds,
  }),
  /**
   * Temporary corpse role tint by outfit id, with a colour per model part's material slot. Omitted slots keep the
   * model colour. This is not clothing; delete with #1366 (`DESIGN.md`, "Dead humans").
   */
  outfits: record(Id, record(Id, record(Id, Color))),
  /** How a dead body lies. It rests on its lowest point, so it has no hip drop. */
  corpsePose: omit(StancePoseSchema, ['hipDropMetres']),
});

// ---- skills and recipes ----

const SkillCurveSchema = strictObject({
  saturationFloor: Fraction,
  saturationHalfLifeLevels: Positive,
});
const SkillProgressionSchema = strictObject({
  id: Id,
  practicePerLevel: Positive,
});

const SkillSchema = pipe(
  strictObject({
    id: Id,
    name: Name,
    curve: optional(SkillCurveSchema),
    /** Recipes a new character knows from the start. */
    startingRecipes: optional(array(Id)),
    training: optional(
      strictObject({
        craftingTierOffset: optional(Count),
        activities: optional(
          record(
            Id,
            pipe(
              strictObject({
                practice: optional(NonNegative),
                practicePerSimSecond: optional(NonNegativeSimRate),
                tier: optional(SkillLevel),
              }),
              check(
                (activity) => (activity.practice === undefined) !== (activity.practicePerSimSecond === undefined),
                'needs exactly one of "practice" or "practicePerSimSecond"',
              ),
            ),
          ),
        ),
      }),
    ),
    inventory: optional(
      strictObject({
        handlingFactorFloor: Fraction,
        handlingFactorHalfLifeLevels: Positive,
        handlingPerCellSimSeconds: NonNegative,
        handlingGroundSimSeconds: NonNegative,
        handlingWearSimSeconds: NonNegative,
      }),
    ),
    combat: optional(
      strictObject({
        firearms: optional(
          strictObject({
            raiseMinimumSimSeconds: PositiveSimSeconds,
            raiseRangeSimSeconds: SimSeconds,
            raiseHalfLifeLevels: Positive,
            readyMovementMinimum: Fraction,
            readyMovementRange: Fraction,
            readyMovementHalfLifeLevels: Positive,
            loweredPitchRadians: pipe(NonNegative, maxValue(Math.PI / 2)),
            adsApertureFill: pipe(Positive, maxValue(0.95)),
            skillZeroHandling: FirearmsSkillZeroHandlingSchema,
            wobbleSkillTenVariance: pipe(Positive, maxValue(100)),
            wobbleLimitRadians: pipe(Positive, maxValue(Math.PI / 2)),
            wobbleVerticalToHorizontalRatio: pipe(Positive, maxValue(1)),
            wobbleLuneArchPower: pipe(Positive, maxValue(4)),
            wobbleLunePhaseOffsetRadians: pipe(NonNegative, maxValue(0.45)),
            wobbleNoiseReversionRatePerSimSecond: pipe(Positive, maxValue(30)),
            wobbleNoiseSigmaRadiansPerSqrtSecond: pipe(NonNegative, maxValue(1)),
            wobbleNoiseSmoothingSimSeconds: pipe(Positive, maxValue(1)),
            reloadFactorFloor: Fraction,
            reloadFactorHalfLifeLevels: Positive,
            rackFactorFloor: Fraction,
            rackFactorHalfLifeLevels: Positive,
            attachmentFactorFloor: Fraction,
            attachmentFactorHalfLifeLevels: Positive,
            caseEjection: strictObject({
              speedMetresPerSimSecond: Positive,
              flightSimSeconds: PositiveSimSeconds,
              /** A landed case rests this far above its settled voxel surface, so it never z-fights the floor. */
              landingLiftMetres: NonNegative,
            }),
            shotTraceRangeBlocks: Positive,
            /** `DESIGN.md`, "Holding breath". */
            breathHold: strictObject({
              staminaPerSimSecond: NonNegativeSimRate,
              recoverySimSeconds: SimSeconds,
              recoverySwayScale: pipe(number(), minValue(1, 'must be at least 1'), maxValue(10)),
              steadyingMinimum: Fraction,
              steadyingSkillRange: Fraction,
              steadyingSkillHalfLifeLevels: Positive,
              painWeakeningPerRatio: NonNegative,
            }),
            /** The owning skill's curve is attached by the registry, not authored here. */
            curve: optional(SkillCurveSchema),
          }),
        ),
        melee: optional(
          strictObject({
            blockChanceMinimum: Fraction,
            blockChanceRange: Fraction,
            blockChanceHalfLifeLevels: Positive,
            mitigationMinimum: Fraction,
            mitigationRange: Fraction,
            mitigationHalfLifeLevels: Positive,
            staminaPerAbsorbedPoint: Positive,
            staminaCostFloor: Fraction,
            staminaCostHalfLifeLevels: Positive,
            joltPerAbsorbedPoint: NonNegative,
            joltRealSeconds: NonNegative,
            deflectRiseMetres: NonNegative,
            deflectRiseFloor: Fraction,
            deflectRealSeconds: NonNegative,
          }),
        ),
      }),
    ),
  }),
  check(({ training, id, combat, inventory }) => {
    const activity = (activityId: string, field: 'practice' | 'practicePerSimSecond') =>
      training?.activities?.[activityId]?.[field] !== undefined;
    const complete =
      (id !== CORE_CONTENT_IDS.crafting || training?.craftingTierOffset !== undefined) &&
      (id !== CORE_CONTENT_IDS.firearmsCombat ||
        (combat?.firearms !== undefined &&
          activity('readying', 'practicePerSimSecond') &&
          activity('handling', 'practice') &&
          activity('shot', 'practice') &&
          activity('hit', 'practice') &&
          activity('attachment', 'practice'))) &&
      (id !== CORE_CONTENT_IDS.meleeCombat ||
        (combat?.melee !== undefined && activity('block', 'practice') && activity('hit', 'practice'))) &&
      (id !== CORE_CONTENT_IDS.inventoryManagement || (inventory !== undefined && activity('handling', 'practice')));
    const firearm = combat?.firearms;
    const melee = combat?.melee;
    return (
      complete &&
      (!firearm ||
        (firearm.readyMovementMinimum + firearm.readyMovementRange <= 1 &&
          firearm.breathHold.steadyingMinimum + firearm.breathHold.steadyingSkillRange <= 1)) &&
      (!melee ||
        (melee.blockChanceMinimum + melee.blockChanceRange <= 1 &&
          melee.mitigationMinimum + melee.mitigationRange <= 1))
    );
  }, 'missing required skill tuning or effect range exceeds one'),
  check(
    ({ id, training }) =>
      id !== CORE_CONTENT_IDS.inventoryManagement || training?.activities?.handling?.tier === undefined,
    'inventory-management handling activity must be untiered',
  ),
);
/** Tree shapes in metres from the trunk's foot, built from half-metre slices (`src/core/vegetation.ts`, `treeShapes`). */
const TreeCrownSchema = variant('kind', [
  /** Leaves filling an ellipsoid around the trunk. */
  strictObject({
    kind: literal('ellipsoid'),
    centreMetres: PositiveMetres,
    radiiMetres: tuple([PositiveMetres, PositiveMetres, PositiveMetres]),
  }),
  /** Square leaf layers from `baseMetres` up to `topMetres`, narrowing by `taper` metres per metre of height. */
  strictObject({
    kind: literal('cone'),
    baseMetres: NonNegative,
    topMetres: PositiveMetres,
    taper: Positive,
    minHalfWidthMetres: PositiveMetres,
  }),
]);

const TreeShapeSchema = pipe(
  strictObject({ crown: TreeCrownSchema, heightMetres: PositiveMetres, branchReachMetres: PositiveMetres }),
  check(({ crown }) => crown.kind !== 'cone' || crown.baseMetres < crown.topMetres, 'cone base must be below top'),
);

const TreesSchema = strictObject({
  trunkHalfWidthMetres: PositiveMetres,
  /** Two crossed branch layers, each this thick, the upper one this far below the trunk top. */
  branchLayer: strictObject({ topDropMetres: NonNegative, thicknessMetres: PositiveMetres }),
  shapes: strictObject(
    Object.fromEntries(TREE_SHAPES.map((shape) => [shape, TreeShapeSchema])) as Record<
      TreeShape,
      typeof TreeShapeSchema
    >,
  ),
});

const SiteGenerationSchema = strictObject({
  id: Id,
  activeZombieRadiusMetres: PositiveMetres,
  topography: strictObject({
    amplitudeMetres: NonNegative,
    wavelengthMetres: PositiveMetres,
    buildingMarginMetres: NonNegative,
    roadShoulderMetres: NonNegative,
    spawnMarginMetres: NonNegative,
  }),
  // The natural ground every site stands on; metres, so a block size never changes the landscape.
  terrain: pipe(
    strictObject({
      minHeightMetres: NonNegative,
      maxHeightMetres: NonNegative,
      beachBelowMetres: NonNegative,
      dirtDepthMetres: NonNegative,
      featureSizeMetres: PositiveMetres,
      octaves: pipe(number(), integer('must be a whole number'), minValue(1, 'must be 1 or more')),
    }),
    check(({ minHeightMetres, maxHeightMetres }) => minHeightMetres < maxHeightMetres, 'min height must be below max'),
  ),
  vegetation: strictObject({
    woodlandEdgeWavelengthMetres: PositiveMetres,
    woodlandEdgeVariation: pipe(Fraction, maxValue(0.5, 'must not exceed 0.5')),
    openDensity: Fraction,
    obstacleMarginMetres: NonNegative,
    // One entry per draw, so repeating a shape weights it.
    treeMix: pipe(array(picklist(TREE_SHAPES)), minLength(1)),
    treeCellMetres: PositiveMetres,
    /** How far a tree may stray from its cell's centre on each axis. */
    treeJitterMetres: NonNegative,
    trees: TreesSchema,
    forestHalfExtentMetres: PositiveMetres,
    forestDensityField: strictObject({
      wavelengthMetres: PositiveMetres,
      seedSalt: Count,
      floor: Fraction,
      gain: NonNegative,
      ceiling: Fraction,
    }),
  }),
  // One palette shared by every site kind: terrain, paving, trees and litter are block ids.
  palette: strictObject({
    terrain: strictObject({ grass: Id, dirt: Id, rock: Id, sand: Id, water: Id }),
    paving: Id,
    trees: strictObject({ trunk: Id, branch: Id, leaves: Id }),
    leafLitter: Id,
  }),
});

const BlockCount = pipe(number(), integer('must be a whole number'), minValue(1, 'must be at least 1'));
const BlockOffset = pipe(number(), integer('must be a whole number'));

/** Distances are whole blocks: `offset` runs along the lane from its near end, `lateral` across it from its centre line. */
const HandlingRangeSchema = strictObject({
  id: Id,
  /** Clear ground between the site this range sits beside and the lane's near end. */
  gap: Count,
  /** How far the terrain blends into the level lane beyond its edge. */
  blend: BlockCount,
  length: BlockCount,
  width: BlockCount,
  firingLine: strictObject({ offset: Count, depth: BlockCount, inset: Count }),
  target: strictObject({ halfWidth: Count, height: BlockCount }),
  /** One entry per target, nearest first; staggering them laterally keeps each one clear of the nearer ones' line of fire. */
  targets: pipe(
    array(strictObject({ offset: Count, lateral: BlockOffset })),
    minLength(1, 'needs at least one target'),
  ),
  table: strictObject({ offset: Count, lateral: BlockOffset }),
});

const LoweredStanceSchema = strictObject({
  hearingRangeScale: Fraction,
  sightRangeScale: Fraction,
});

const PlayerStanceTuningSchema = strictObject({
  speedMetresPerSimSecond: SimRate,
  eyeDropMetres: Positive,
  bodyHeightMetres: Positive,
});

const PlayerSchema = strictObject({
  id: Id,
  halfWidth: Positive,
  height: Positive,
  eye: Positive,
  walk: SimRate,
  jog: SimRate,
  sprint: SimRate,
  jump: SimRate,
  reach: Positive,
  stepHeight: Positive,
  movement: strictObject({ sidewaysSpeedScale: Fraction, backwardSpeedScale: Fraction }),
  crouch: PlayerStanceTuningSchema,
  prone: PlayerStanceTuningSchema,
  load: pipe(
    strictObject({ light: NonNegative, heavy: Positive, slowest: Fraction, handlingScale: Fraction }),
    check(({ light, heavy }) => heavy > light, 'heavy load must exceed light load'),
  ),
  aim: strictObject({
    moveYawPerSpeed: NonNegative,
    lookSensitivityRadiansPerPixel: Positive,
    lookLagPerRadian: NonNegative,
    lookSettleSimSeconds: PositiveSimSeconds,
    recoilRecoverySimSeconds: PositiveSimSeconds,
    maxOffsetRadians: pipe(Positive, maxValue(Math.PI / 2)),
  }),
});

const SenseSchema = strictObject({
  id: Id,
  /** Chest height as a fraction of the eye height, so a stance that lowers the eyes lowers the chest. */
  chestEyeFraction: Fraction,
  crouch: LoweredStanceSchema,
  /** Below crouch: the player lies down and crawls. */
  prone: LoweredStanceSchema,
  wall: strictObject({
    hearingRangeScale: Fraction,
    gain: Fraction,
    cutoffHz: Positive,
    clearGain: Fraction,
    clearCutoffHz: Positive,
  }),
  /** Footfall spacing per moving gait and the fall that lands hard; cadence and landing noise follow from these. */
  footsteps: strictObject({
    walkingStepMetres: Positive,
    joggingStepMetres: Positive,
    sprintingStepMetres: Positive,
    hardLandingMetres: Positive,
  }),
  /** How long a player vocal noise stays audible to shamblers after it is emitted. */
  vocalNoiseLifetimeSimSeconds: PositiveSimSeconds,
  /**
   * The shambler voice-pitch law (`DESIGN.md`, "Audio"), as multiples of the old law's pitch √(reference height ÷ body
   * height) at the smallest pooled body. One law covers the whole figure pool, so it lives here, not on a zombie type.
   */
  shamblerVoice: strictObject({
    oldLawReferenceHeightMetres: Positive,
    smallestAnchorMultiplier: Positive,
    clampMultiplier: pipe(
      strictObject({ min: Positive, max: Positive }),
      check(({ min, max }) => min <= max, 'min must not exceed max'),
    ),
  }),
  light: strictObject({
    playerDaySightScale: Fraction,
    /** Reduce how far shamblers investigate non-player light sources. */
    lureRangeScale: Fraction,
    throwMaxDistanceMetres: Positive,
    throwChargeSimSeconds: PositiveSimSeconds,
    throwMinimumHoldSimSeconds: PositiveSimSeconds,
    throwStanceDropHoldRealSeconds: Positive,
    wornLightToggleHoldRealSeconds: Positive,
    renderedBeamLimit: pipe(Count, minValue(2)),
    /** Powered fixtures drawn as lights at once, nearest the camera first; the rest stay dark. */
    renderedFixtureLimit: pipe(Count, minValue(1)),
    throwArmSpeedMetresPerRealSecond: Positive,
    throwArmEnergyJoules: Positive,
    /**
     * A light set down: the height a zombie's sight line aims at, and the drawn point light's lift when its model
     * has no flame to shine from, high enough that the near-field falloff reaches nearby surfaces.
     */
    groundLight: strictObject({ senseHeightMetres: Positive, renderLiftMetres: Positive }),
    /**
     * Light at a point, in the renderer's light units (`DESIGN.md`, "Light"): the distance decay and near-field
     * offset every punctual light is drawn and measured with, and the least light a page or sign needs to be read.
     */
    illumination: strictObject({ pointDecay: NonNegative, nearFieldMetres: NonNegative, readingThreshold: Positive }),
  }),
});
/** Counts are whole items, never millilitres; no partial-liquid storage contract exists yet. */
const RecipeItemSchema = ItemCountSchema;

const weatheringNumber = (field: keyof typeof WEATHERING_RANGES) => {
  const { min, max } = WEATHERING_RANGES[field];
  return pipe(number(), minValue(min), maxValue(max));
};

const WeatheringSchema = strictObject({
  id: Id,
  /** Shared weathering strength for the rendered site. */
  strength: weatheringNumber('strength'),
  /** Linear tint multiplier for grime. */
  tintColor: Color,
  /** Grime darkness multiplier, before the profile's mix ceiling. */
  tintDarkness: weatheringNumber('tintDarkness'),
  /** Streak tint, blended from the grime tint where runoff appears. */
  streakColor: Color,
  /** Amount of vertical runoff mixed into the profile. */
  streakStrength: weatheringNumber('streakStrength'),
  /** World-space period of vertical runoff, in metres. */
  streakLengthMetres: weatheringNumber('streakLengthMetres'),
  /** Organic patch colour. */
  mossColor: Color,
  /** Amount of moss mixed into the profile; zero disables moss independently. */
  mossStrength: weatheringNumber('mossStrength'),
  /** World-space wavelength for broad weathering changes, in metres. */
  variationScaleMetres: weatheringNumber('variationScaleMetres'),
  /** Strength of world-scale weathering variation. */
  variationStrength: weatheringNumber('variationStrength'),
  /** Noise cutoff for organic moss and damp patches. */
  mossThreshold: weatheringNumber('mossThreshold'),
  /** How much shelter and ground proximity lower the organic-patch cutoff. */
  mossBias: weatheringNumber('mossBias'),
  /** Upper bound for the final combined grime, streak and moss mix. */
  mixCeiling: weatheringNumber('mixCeiling'),
  /** Blend from multiplicative weathering toward opaque grime/moss colours. */
  weatheringBlend: weatheringNumber('weatheringBlend'),
});

/** One value for every damage kind, so no kind is ever left out. */
const perDamageKind = <S extends typeof Fraction | typeof NonNegative>(value: S) =>
  strictObject(Object.fromEntries(DAMAGE_KINDS.map((kind) => [kind, value])) as Record<DamageKind, S>);

const WearSlotSchema = picklist(WEAR_SLOTS);

const CoveringSlots = pipe(
  array(WearSlotSchema),
  check((slots) => new Set(slots).size === slots.length, 'covering slots must be unique'),
);

/** One bleeding tier; the list runs mildest first (`DESIGN.md`, "Bleeding"). */
const BleedingTierSchema = strictObject({
  id: Id,
  /** How the HUD, inventory and item actions name a wound bleeding at this tier. */
  label: Name,
  /** Shown with the warning style and sign. */
  warn: vBoolean(),
  /** The character's line when their worst bleeding worsens to this tier; omitted tiers pass unspoken. */
  notice: optional(Name),
  /** Blood lost per Sim second at the top of this tier's band. */
  bloodLossPerSimSecond: SimRate,
  /** Sim seconds a wound takes to close through this tier's band by itself while the body recovers. */
  closeSimSeconds: PositiveSimSeconds,
  /** Treatment quality it takes to close this tier's band. */
  treatmentEffort: Positive,
  /** Least hit damage that can open this tier. */
  minDamage: NonNegative,
  /** Per-region chance multipliers; omitted regions use 1, and 0 excludes that region. */
  regionFactor: optional(record(picklist(BODY_REGIONS), NonNegative)),
  /** This tier's share of the wound roll per point of accumulated damage. */
  chancePerDamage: perDamageKind(NonNegative),
  /** Drips per second relative to the base rate, and droplet size relative to the base size. */
  drip: strictObject({ rate: Positive, size: Positive }),
  /** Background pain while a wound bleeds at this tier. */
  pain: NonNegative,
});

/** One pain tier, its start a share of the knockout threshold; the list runs mildest first (`DESIGN.md`, "Pain"). */
const PainTierSchema = strictObject({
  id: Id,
  /** Where the tier starts, as a share of the knockout threshold. The first tier's start is where pain's effects begin. */
  from: Positive,
  /** The character's line when felt pain worsens into this tier; omitted tiers pass unspoken. */
  notice: optional(Name),
  /** How much colour one pulse of the seen cue drains, at its peak. */
  desaturation: Fraction,
  /** Real seconds between the seen cue's pulses. */
  pulseIntervalRealSeconds: PositiveRealSeconds,
});

/** A pain effect: the multiplier grows by `perShare` for each share of the threshold above the first tier, up to `1 + max`. */
const PainEffectSchema = strictObject({ perShare: NonNegative, max: NonNegative });

const PainTuningSchema = strictObject({
  /** Felt pain that knocks the player out; tiers and effects are shares of it. Pain itself has no upper bound. */
  knockoutAt: Positive,
  /** Acute pain per point of hit damage, by the hit's damage kind. */
  perDamage: perDamageKind(NonNegative),
  /** Multiplies a hit's acute pain and a region's background pain from its damage. */
  regionWeight: strictObject(
    Object.fromEntries(BODY_REGIONS.map((region) => [region, NonNegative])) as Record<
      (typeof BODY_REGIONS)[number],
      typeof NonNegative
    >,
  ),
  /** Background pain per point of a region's damage. */
  perRegionDamage: NonNegative,
  /** Background pain from a wound at each infection stage. */
  infection: strictObject({ early: NonNegative, advanced: NonNegative }),
  /** Acute pain fades by this much per Sim second… */
  acuteFadePerSimSecond: NonNegativeSimRate,
  /** …plus this share of itself per Sim second, so it fades faster when high. */
  acuteFadeSharePerSimSecond: NonNegativeSimRate,
  aimSway: PainEffectSchema,
  /** Slows reloading, racking, magazine work and swings; never treatment or crafting. */
  handlingSlowdown: PainEffectSchema,
  tiers: pipe(
    array(PainTierSchema),
    nonEmpty('needs at least one tier'),
    check((tiers) => new Set(tiers.map(({ id }) => id)).size === tiers.length, 'pain tier ids must be unique'),
    check(
      (tiers) => tiers.every((tier, index) => index === 0 || tier.from > tiers[index - 1]!.from),
      'each pain tier must start above the one before it',
    ),
  ),
});

const NeedPercent = pipe(number(), minValue(0, 'must be 0 to 100'), maxValue(100, 'must be 0 to 100'));

const CriticalNeedSchema = pipe(
  strictObject({
    need: picklist(['calories', 'hydration', 'fatigue']),
    /** Critical while the need is under this. */
    below: optional(NeedPercent),
    /** Critical while the need is over this; fatigue has no upper cap. */
    above: optional(NonNegative),
    /** What the player is told when the need becomes critical. */
    message: Name,
  }),
  check((rule) => (rule.below === undefined) !== (rule.above === undefined), 'needs exactly one of below and above'),
);

/** Survival needs and stamina. Vitals run 0 to 100; fatigue is sleep debt (`packages/deadvox/src/core/needs.ts`). */
const NeedsTuningSchema = strictObject({
  /** The needs and stamina a new character starts with. */
  spawn: strictObject({ calories: NeedPercent, hydration: NeedPercent, fatigue: NonNegative, stamina: NeedPercent }),
  /** Calories and hydration lost per Game hour. */
  drainPerGameHour: strictObject({ calories: GamePerHour, hydration: GamePerHour }),
  /** Health lost per Game hour while calories or hydration sit at 0; both add up. */
  healthLossPerGameHour: strictObject({ starving: GamePerHour, dehydrated: GamePerHour }),
  stamina: strictObject({
    /** Spent per Sim second of sprinting. */
    sprintPerSimSecond: SimRate,
    /** Recovered per Sim second when not sprinting. */
    recoverPerSimSecond: SimRate,
    /** Recovery is scaled by this while any critical need holds. */
    wornRecoveryFactor: Fraction,
    /** Below this stamina you're winded and can't start sprinting. */
    windedBelow: NeedPercent,
  }),
  /** 100% calories is this many kilocalories, and 100% hydration this many millilitres. */
  full: strictObject({ kcal: Positive, ml: Positive }),
  /** Crossing one of these interrupts a long action and says its message. */
  critical: array(CriticalNeedSchema),
  /** Health falling under this from above interrupts a long action and says its message. */
  badlyHurt: strictObject({ below: Positive, message: Name }),
});

const BodyTuningSchema = pipe(
  strictObject({
    id: Id,
    /** Game hours after a bleeding wound before an at-risk infection becomes early. */
    infectionOnsetGameHours: PositiveGameHours,
    /** Game hours the early infection stage remains treatable with antiseptic. */
    antisepticWindowGameHours: PositiveGameHours,
    infectionChance: Fraction,
    /** Sim seconds that the player remains unconscious. */
    knockoutSimSeconds: PositiveSimSeconds,
    /** Why the player can't act while unconscious. */
    knockoutRefusal: Name,
    /** Sim seconds to wait after stamina reaches zero before recovery begins. */
    staminaRegenDelaySimSeconds: PositiveSimSeconds,
    /** Player eye height in metres while unconscious and prone. */
    proneEyeHeightMetres: Positive,
    /** Where on the upright body a grenade fragment strikes, as fractions of its height: above `head` hits the head, above `torso` the torso, else a leg. */
    fragmentRegionHeights: pipe(
      strictObject({ head: Fraction, torso: Fraction }),
      check(({ head, torso }) => torso < head, 'torso must start below head'),
    ),
    /** Shock damage per point of health damage, by the hit's damage kind. */
    shockPerDamage: perDamageKind(NonNegative),
    /** How much harder a hit of each damage kind wears the outermost worn item on the struck region; 1 is the item's own rate. */
    outerWearMultiplier: perDamageKind(NonNegative),
    /** The wear slots covering each region, outermost first; a hit meets the first one worn (`DESIGN.md`, "Worn coverage"). */
    coverage: strictObject(
      Object.fromEntries(BODY_REGIONS.map((region) => [region, CoveringSlots])) as Record<
        BodyRegion,
        typeof CoveringSlots
      >,
    ),
    /** The slot each touch meets first, where that slot covers the touched region. */
    touchFirst: strictObject(
      Object.fromEntries(TOUCHES.map((touch) => [touch, WearSlotSchema])) as Record<Touch, typeof WearSlotSchema>,
    ),
    exposureRefusal: Name,
    linger: record(
      picklist(DAMAGE_KINDS),
      strictObject({
        simSeconds: PositiveSimSeconds,
      }),
    ),
    landing: strictObject({
      safeSpeedMetresPerSimSecond: SimRate,
      damagePerSquaredSpeed: Positive,
      damageSpread: pipe(
        strictObject({ min: Positive, max: Positive }),
        check(({ min, max }) => min <= max, 'min must not be more than max'),
      ),
      kind: picklist(DAMAGE_KINDS),
      cause: Name,
      regions: pipe(
        array(strictObject({ region: picklist(BODY_REGIONS), weight: Positive })),
        nonEmpty('needs at least one landing region'),
        check(
          (regions) => new Set(regions.map(({ region }) => region)).size === regions.length,
          'landing regions must be unique',
        ),
      ),
    }),
    /** Sim seconds required to apply wound treatment. */
    treatmentSimSeconds: PositiveSimSeconds,
    /** The range each treatment application's strength is multiplied by, rolled per application. */
    treatmentSpread: pipe(
      strictObject({ min: NonNegative, max: Positive }),
      check(({ min, max }) => min <= max, 'min must not be more than max'),
    ),
    /** Shock restored when the player wakes, on a 0–100 scale. */
    wakeShock: pipe(
      Positive,
      check((value) => value < 100, 'must be below 100'),
    ),
    /** The bleeding tiers, and when and with what line bleeding refuses time compression. */
    bleeding: strictObject({
      refusal: Name,
      /** Total blood loss per Sim second at or above which bleeding refuses compression; 0 means any bleeding. */
      blockCompressionAtLossPerSimSecond: NonNegativeSimRate,
      tiers: pipe(
        array(BleedingTierSchema),
        nonEmpty('needs at least one tier'),
        check((tiers) => new Set(tiers.map(({ id }) => id)).size === tiers.length, 'bleeding tier ids must be unique'),
        check(
          (tiers) =>
            tiers.every(
              (tier, index) => index === 0 || tier.bloodLossPerSimSecond > tiers[index - 1]!.bloodLossPerSimSecond,
            ),
          'each bleeding tier must lose blood faster than the one before it',
        ),
      ),
    }),
    pain: PainTuningSchema,
    /** Blood recovered per Sim second when no wound bleeds. */
    bloodRecoveryPerSimSecond: SimRate,
    /** Shock recovered per Sim second outside a knockout. */
    shockRecoveryPerSimSecond: SimRate,
    /** Health lost per Sim second while infection is advanced. */
    advancedInfectionHealthLossPerSimSecond: SimRate,
    needs: NeedsTuningSchema,
    /** The stamina heartbeat, a presentation cue only (`DESIGN.md`, "Audio"). */
    heartbeat: strictObject({
      /** One beat each: the slow recording, and the shorter one used once a beat is too quick for the slow one. */
      sounds: strictObject({ slow: Id, fast: Id }),
      /** Silent above this stamina; rate and loudness rise linearly from here to exhaustion. */
      startStamina: NeedPercent,
      startHz: Positive,
      exhaustedHz: Positive,
      startGain: Fraction,
      exhaustedGain: Fraction,
    }),
    /** Fatigue is sleep debt with no upper cap; this much accrues per Game hour awake. */
    fatigueRisePerGameHour: GamePerHour,
    /** Fatigue cleared per Game hour resting, scaled by the furniture's rest quality. */
    restFatigueRecoveryPerGameHour: GamePerHour,
    /** Fatigue cleared per Game hour asleep at rest quality 1: a normal sleep. */
    sleepFatigueRecoveryPerGameHour: GamePerHour,
    /** Sleep onset gets shorter as fatigue rises, reaching its minimum at the authored threshold. */
    sleepOnset: pipe(
      strictObject({
        minGameMinutes: PositiveGameMinutes,
        maxGameMinutes: PositiveGameMinutes,
        fatigueAtMinimum: Positive,
      }),
      check(
        ({ minGameMinutes, maxGameMinutes }) => minGameMinutes <= maxGameMinutes,
        'minimum must not exceed maximum',
      ),
    ),
    /** The share of a normal sleep's recovery at rest quality 0; it rises linearly to all of it at 1. */
    roughSleepShare: Fraction,
    /** Health, and each region's damage, recovered per Game hour while needs are at their floor or above and fatigue under its ceiling. */
    healthRecoveryPerGameHour: GamePerHour,
    /** The lowest calories and hydration at which health and regions still recover. */
    healthRecoveryNeedsFloor: strictObject({ calories: NonNegative, hydration: NonNegative }),
    /** The highest fatigue at which health and regions still recover, awake and asleep; a state left out has none. */
    healthRecoveryFatigueCeiling: strictObject({ awake: optional(NonNegative), asleep: optional(NonNegative) }),
    /** Multiplies health, regional and blood recovery while asleep. */
    sleepRecoveryFactor: Positive,
    /** Aim sway added per point of torso damage. */
    aimSwayPerDamage: Positive,
    /** Swing slowdown added per point of arm damage. */
    swingSlowdownPerDamage: Positive,
    /** Movement slowdown added per point of leg damage. */
    movementSlowdownPerDamage: Positive,
    /** Lowest movement-speed multiplier caused by leg damage. */
    minimumMovementSpeed: pipe(
      Positive,
      check((value) => value <= 1, 'must not exceed 1'),
    ),
  }),
  // A touch slot that covers no region would never be met, so the touch would silently fall back to coverage.
  rawCheck(({ dataset, addIssue }) => {
    if (!dataset.typed) {
      return;
    }
    const covering = new Set(Object.values(dataset.value.coverage).flat());
    for (const touch of TOUCHES) {
      if (!covering.has(dataset.value.touchFirst[touch])) {
        addIssue({ message: `touchFirst.${touch} must name a slot that covers some region` });
      }
    }
  }),
);

const RecipeSchema = strictObject({
  id: Id,
  result: RecipeItemSchema,
  /** Omitted means an ordinary craft. A repair recipe's result identifies its target type. */
  kind: optional(picklist(['craft', 'repair'])),
  repair: optional(strictObject({ skill: Id, amount: Fraction, perSkill: Fraction })),
  activation: optional(literal('sharpen')),
  /** Game minutes. */
  timeGameMinutes: PositiveGameMinutes,
  skills: record(Id, SkillLevel),
  qualities: record(Id, pipe(Count, minValue(1), maxValue(5))),
  components: array(pipe(array(RecipeItemSchema), nonEmpty('needs at least one alternative'))),
  consumeFitted: optional(vBoolean()),
  workstation: optional(nullable(Id)),
});

const GraphicsTuningSchema = strictObject({
  id: Id,
  readyRadiusM: pipe(number(), finite(), minValue(0)),
  /** How far past the view radius terrain stays loaded and drawn, so a column on the edge does not churn. */
  streamHysteresisM: pipe(Positive, finite()),
  /**
   * The camera's far plane as a multiple of where the fog ends. Fog goes by horizontal distance; a
   * larger scale lets more of what is far above or below the camera stay unfogged, and culls less
   * (`src/render/distanceFog.ts`).
   */
  fogFarPlaneScale: pipe(number(), finite(), minValue(1)),
  itemPictureCacheCapacity: pipe(number(), integer(), minValue(1)),
  /** Diffuse sky visibility drawn where a sky field has no answer yet (`DESIGN.md`, "Light"). */
  unbuiltSkyCap: Fraction,
  /** The inventory item viewer: opening pose, drag and wheel response, and zoom range around the opening zoom of 1. */
  itemViewer: pipe(
    strictObject({
      /** Half the view's shorter side per bounding radius at zoom 1. */
      framing: Positive,
      startYawDegrees: Degrees,
      startPitchDegrees: Degrees,
      pitchLimitDegrees: pipe(number(), minValue(0), maxValue(90)),
      degreesPerPixel: Positive,
      zoomPerWheelPixel: Positive,
      zoomMin: Positive,
      zoomMax: Positive,
    }),
    check(({ zoomMin, zoomMax }) => zoomMin <= 1 && zoomMax >= 1, 'zoom range must include 1'),
    check(
      ({ startPitchDegrees, pitchLimitDegrees }) => Math.abs(startPitchDegrees) <= pitchLimitDegrees,
      'start pitch must be within the pitch limit',
    ),
  ),
  mobActors: strictObject({ maxCorpses: Count }),
  gore: strictObject({
    dropletCap: Count,
    splatCap: Count,
    dropletSpawnsPerFrame: Count,
    dripSourceCap: Count,
  }),
  ...GraphicsOptionsSchema.entries,
});

/** The game's default look (core/mood.ts `LookDefaults`); URL parameters and the debug panel override it. */
const LookDefaultsSchema = strictObject({
  id: Id,
  tone: picklist(TONE_KEYS),
  exposure: pipe(
    number(),
    minValue(MIN_EXPOSURE, `must be ${MIN_EXPOSURE} to ${MAX_EXPOSURE}`),
    maxValue(MAX_EXPOSURE, `must be ${MIN_EXPOSURE} to ${MAX_EXPOSURE}`),
  ),
  srgb: vBoolean(),
  patterns: vBoolean(),
  vao: vBoolean(),
  /** The mood pass's master switch: off, bloom, film and grade render nothing. */
  post: vBoolean(),
  bloom: vBoolean(),
  film: vBoolean(),
  grade: Fraction,
  heightFog: strictObject({ baseMetres: NonNegative, scaleMetres: Positive }),
  painCue: strictObject({
    pulseRiseRealSeconds: PositiveRealSeconds,
    pulseFallRealSeconds: PositiveRealSeconds,
    settleStretch: NonNegative,
  }),
  damageFeedback: strictObject({
    vignetteMax: Fraction,
    damageForFullStrength: Positive,
    vignetteFadeRealSeconds: PositiveRealSeconds,
    rollPeakDegrees: Positive,
    rollRiseRealSeconds: PositiveRealSeconds,
    rollSettleRealSeconds: PositiveRealSeconds,
  }),
  mobActors: strictObject({
    corpseLieSimSeconds: PositiveSimSeconds,
    corpseSinkSimSeconds: PositiveSimSeconds,
    corpseSinkDepthMetres: Positive,
    launchSpinRadiansPerSimSecond: Positive,
    hearingGazeJitter: strictObject({
      yawDegrees: NonNegative,
      pitchDegrees: NonNegative,
      cyclesPerSimSecond: NonNegative,
    }),
  }),
});

// ---- files ----

/** Native schemas and section metadata live here, not in parallel loader/validator lists. */
const SECTION_DESCRIPTOR = {
  blocks: { schema: optional(array(BlockSchema)), label: 'blocks', order: 0 },
  items: { schema: optional(array(ItemSchema)), label: 'items', order: 1 },
  liquids: { schema: optional(array(LiquidSchema)), label: 'liquids', order: 34 },
  furnitureMaterials: { schema: optional(array(FurnitureMaterialSchema)), label: 'furniture materials', order: 32 },
  vehicleBlueprints: { schema: optional(array(VehicleBlueprintSchema)), label: 'vehicle blueprints', order: 33 },
  furniture: { schema: optional(array(FurnitureSchema)), label: 'furniture', order: 2 },
  loot: { schema: optional(array(LootTableSchema)), label: 'loot tables', order: 4 },
  templates: { schema: optional(array(TemplateSchema)), label: 'templates', order: 5 },
  zombies: {
    schema: optional(
      pipe(
        array(ZombieSchema),
        check(
          (types) => types.every((zombie) => zombie.model !== 'amalgam' || zombie.bodyScale !== undefined),
          'amalgam must define bodyScale',
        ),
        check(
          (types) => types.every((zombie) => zombie.model === 'amalgam' || zombie.carving === undefined),
          'only an amalgam may define carving',
        ),
        check(
          (types) => types.every((zombie) => (zombie.model === 'amalgam') === (zombie.downed === undefined)),
          'every type but the amalgam, which never lies downed, must define downed',
        ),
        check(
          (types) => types.every((zombie) => (zombie.model === 'amalgam') === (zombie.figureSeeds === undefined)),
          'every type but the amalgam, whose figure seed is fixed, must define figureSeeds',
        ),
        check(
          (types) =>
            types.every((zombie) => (zombie.model === 'amalgam') === (zombie.attack.grabBandMetres === undefined)),
          'every type but the amalgam, which strikes from its core, must define attack.grabBandMetres',
        ),
        check((types) => types.every(zombieRegionsMatchModel), 'zombie region keys must match the model'),
        check(
          (types) => types.every(zombieAcidSpitMatchesAbility),
          'acidSpit tunables must match the acidSpit ability',
        ),
        check(
          (types) => types.every((zombie) => (zombie.model === 'acid') === (zombie.acidBody !== undefined)),
          'acidBody must be defined exactly for the acid model',
        ),
      ),
    ),
    label: 'zombie types',
    order: 6,
  },
  figures: { schema: optional(array(FigureSchema)), label: 'figures', order: 3 },
  models: { schema: optional(array(ModelSchema)), label: 'models', order: 7 },
  sounds: { schema: optional(array(SoundSchema)), label: 'sound events', order: 8 },
  skills: { schema: optional(array(SkillSchema)), label: 'skills', order: 9 },
  skillProgression: { schema: optional(array(SkillProgressionSchema)), label: 'skill progression', order: 9 },
  recipes: { schema: optional(array(RecipeSchema)), label: 'recipes', order: 10 },
  layouts: { schema: optional(array(SiteLayoutSchema)), label: 'site layouts', order: 11 },
  body: { schema: optional(array(BodyTuningSchema)), label: 'body tuning', order: 12 },
  senses: { schema: optional(array(SenseSchema)), label: 'sense tuning', order: 13 },
  player: { schema: optional(array(PlayerSchema)), label: 'player tuning', order: 13.5 },
  meleeClasses: { schema: optional(array(MeleeClassSchema)), label: 'melee classes', order: 14 },
  siteGeneration: { schema: optional(array(SiteGenerationSchema)), label: 'site generation', order: 15 },
  handlingRange: { schema: optional(array(HandlingRangeSchema)), label: 'handling range', order: 29 },
  weathering: { schema: optional(array(WeatheringSchema)), label: 'weathering', order: 16 },
  inventory: { schema: optional(array(InventoryTuningSchema)), label: 'inventory tuning', order: 17 },
  saves: { schema: optional(array(SaveTuningSchema)), label: 'save tuning', order: 18 },
  compression: { schema: optional(array(CompressionTuningSchema)), label: 'compression tuning', order: 19 },
  ui: { schema: optional(array(UiTuningSchema)), label: 'UI tuning', order: 20 },
  scenarios: { schema: optional(array(ScenarioSchema)), label: 'scenarios', order: 21 },
  cityBenchmarks: { schema: optional(array(CityBenchmarkSchema)), label: 'city benchmarks', order: 30 },
  controls: { schema: optional(array(ControlSchema)), label: 'default keys', order: 31 },
  graphics: { schema: optional(array(GraphicsTuningSchema)), label: 'graphics tuning', order: 22 },
  mapStyles: { schema: optional(array(MapStyleSchema)), label: 'map styles', order: 23 },
  mapPieces: { schema: optional(array(MapPieceSchema)), label: 'map pieces', order: 24 },
  mapAssemblies: { schema: optional(array(MapAssemblySchema)), label: 'map assemblies', order: 25 },
  mapSites: { schema: optional(array(MapSiteSchema)), label: 'map site recipes', order: 26 },
  mapPools: { schema: optional(array(MapPoolSchema)), label: 'map pools', order: 27 },
  look: { schema: optional(array(LookDefaultsSchema)), label: 'default look', order: 28 },
  powerDevices: { schema: optional(array(PowerDeviceSchema)), label: 'power devices', order: 32 },
  powerTuning: { schema: optional(array(PowerTuningSchema)), label: 'power tuning', order: 33 },
} as const;

type SectionSchemas = { [S in keyof typeof SECTION_DESCRIPTOR]: (typeof SECTION_DESCRIPTOR)[S]['schema'] };
const sectionSchemas = Object.fromEntries(
  Object.entries(SECTION_DESCRIPTOR).map(([section, descriptor]) => [section, descriptor.schema]),
) as SectionSchemas;

/** One content file: any declared section, each a list of definitions. */
export const ContentFileSchema = strictObject({ ...sectionSchemas, dayCycle: optional(DayCycleSchema) });

export type BlockDef = InferOutput<typeof BlockSchema>;
export type ItemDef = InferOutput<typeof ItemSchema>;
export type FurnitureDef = InferOutput<typeof FurnitureSchema>;
type LootTable = InferOutput<typeof LootTableSchema>;
export type LootEntry = LootTable['entries'][number];
export type TemplateDef = InferOutput<typeof TemplateSchema>;
export type MapPieceDef = InferOutput<typeof MapPieceSchema>;
export type MapAssemblyDef = InferOutput<typeof MapAssemblySchema>;
export type MapSiteDef = InferOutput<typeof MapSiteSchema>;
export type MapPoolDef = InferOutput<typeof MapPoolSchema>;
export type CityBenchmarkDef = InferOutput<typeof CityBenchmarkSchema>;
export type KitPort = InferOutput<typeof KitPortSchema>;
export type KitAnchor = InferOutput<typeof KitAnchorSchema>;
export type KitRef = InferOutput<typeof KitRefSchema>;
export type StairDef = InferOutput<typeof StairSchema>;
export type TemplateAccess = InferOutput<typeof TemplateAccessSchema>;
export type FixedLootItemDef = InferOutput<typeof FixedLootItem>;
export type SiteLayoutDef = InferOutput<typeof SiteLayoutSchema>;
export type LightPracticeDef = NonNullable<SiteLayoutDef['practice']>['light'];
export type ScenarioDef = InferOutput<typeof ScenarioSchema>;
export type FixedLootOverrideDef = InferOutput<typeof FixedLootOverride>;
export type DoorLockDef = InferOutput<typeof DoorLockSchema>;
export type ZombieDef = InferOutput<typeof ZombieSchema>;
export type FigureDef = InferOutput<typeof FigureSchema>;
export type GunModelDef = InferOutput<typeof GunModelSchema>;
export type ModelDef = InferOutput<typeof ModelSchema>;
export type VehicleFittingDef = InferOutput<typeof VehicleBlueprintSchema>['fittings'][number];
export type SoundDef = InferOutput<typeof SoundSchema>;
export type SoundRecipe = InferOutput<typeof SoundRecipeSchema>;
export type RecipeDef = InferOutput<typeof RecipeSchema>;
export type MeleeClassDef = InferOutput<typeof MeleeClassSchema>;
export type BodyTuningDef = InferOutput<typeof BodyTuningSchema>;
export type InventoryTuningDef = InferOutput<typeof InventoryTuningSchema>;
export type TreatmentDef = InferOutput<typeof TreatmentSchema>;
export type CompressionCaps = InferOutput<typeof CompressionTuningSchema>['caps'];
export type HandlingRangeDef = InferOutput<typeof HandlingRangeSchema>;
export type WeatheringDef = InferOutput<typeof WeatheringSchema>;
export type SenseDef = InferOutput<typeof SenseSchema>;
export type PlayerDef = InferOutput<typeof PlayerSchema>;
export type GraphicsTuningDef = InferOutput<typeof GraphicsTuningSchema>;
export type LookDefaultsDef = InferOutput<typeof LookDefaultsSchema>;
export type TreeConeCrown = Extract<InferOutput<typeof TreeCrownSchema>, { kind: 'cone' }>;
export type DayCycleDef = InferOutput<typeof DayCycleSchema>;
export type ContentFile = InferOutput<typeof ContentFileSchema>;
export type ContentSection = keyof typeof SECTION_DESCRIPTOR;

/** Also rejects independently adding a schema section without its metadata. */
export const CONTENT_SECTIONS = SECTION_DESCRIPTOR satisfies Record<ContentSection, { label: string; order: number }>;
/** Order preserves the existing duplicate-id diagnostics independently of schema field order. */
export const CONTENT_SECTION_KEYS = (Object.keys(CONTENT_SECTIONS) as ContentSection[]).sort(
  (a, b) => CONTENT_SECTIONS[a].order - CONTENT_SECTIONS[b].order,
);
