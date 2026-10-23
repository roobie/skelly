// The simulation half of a play session, without the DOM: the clock and scheduler, the
// player's body, inventory, needs, rest, the shamblers and their spawns. `startPlay`
// (the game) and the snapshot tests build the same object from here, so what a save
// captures is what the game runs. Sounds, notices and debug tools reach in through
// callbacks; nothing here draws or listens.

import type { Body as MobBody } from '@mobgen/core/body.ts';
import { AimController, type AimWobbleNoiseTuning, aimDirection, NEUTRAL_AIM } from '../core/aim.ts';
import { BearTraps } from '../core/bearTrap.ts';
import { type BlockEntity, searchTime } from '../core/blockEntities.ts';
import { bookReadingHooks } from '../core/bookReading.ts';
import { Character, dominantSide, offSide, SKILL_LEVEL_MIN, skillEffectLevel } from '../core/character.ts';
import { hourOfDay } from '../core/clock.ts';
import { terrainSolid, worldMeleeBlocker, worldSoundBlocking } from '../core/collision.ts';
import { type RecipeDef, type Registry, requireDayCycle } from '../core/content.ts';
import { CORE_CONTENT_IDS } from '../core/contentIds.ts';
import { CHUNK, type Vec3 } from '../core/coords.ts';
import { coreMessage } from '../core/coreText.ts';
import { CraftCommands } from '../core/craftCommands.ts';
import { type CraftPreference, planCraft } from '../core/crafting.ts';
import { craftActionHooks } from '../core/craftWork.ts';
import { dayPhaseAt } from '../core/dayPhase.ts';
import { type EntityId, MapEntityStore } from '../core/entities.ts';
import { advanceEventRules } from '../core/eventRules.ts';
import { blastShare, bodyCentre, Fuses, fragmentDirections, fragmentHitsOnBody, inSight } from '../core/explosive.ts';
import {
  type FirearmsCombatTuning,
  type FirearmsSkillShotKind,
  type FirearmsSkillZeroHandling,
  firearmsSkillEffects,
  sameFirearmsSkillZeroHandling,
} from '../core/firearmsSkill.ts';
import { foliageRustle, initialRustleClock } from '../core/foliageRustle.ts';
import {
  advanceFootsteps,
  footstepEventAt,
  initialFootstepClock,
  isHardLanding,
  shamblerFootstepEventAt,
} from '../core/footsteps.ts';
import {
  type FurnitureMover,
  type FurnitureSlideWay,
  liftFurniture,
  placeFurniture,
  placement,
  removalRefusal,
  removeFurniture,
  ruinFurniture,
  slideDestination,
  slideFurniture,
  tipCarried,
  turnCarried,
} from '../core/furnitureMove.ts';
import { pickFurniture } from '../core/furniturePick.ts';
import { HandlingQueue, type Job, type MoveStart, type TickResult } from '../core/handling.ts';
import { Inventory, type Location } from '../core/inventory.ts';
import { defOf, type Item } from '../core/items.ts';
import { settleCell } from '../core/itemThrow.ts';
import { climb, LadderHold } from '../core/ladders.ts';
import { inventoryLightSources, SunExposureCache } from '../core/lights.ts';
import { corpseLootPoint, lootPointStream, rollLoot } from '../core/loot.ts';
import { type BlockJolt, blockJolt, meleeBlock } from '../core/meleeCombat.ts';
import { modified } from '../core/modifiers.ts';
import { canSprint, spendStamina, stepStamina } from '../core/needs.ts';
import { freshDropTarget } from '../core/options.ts';
import { type Body, bodyOverlapsTerrain, CONTACT_SKIN, stepBody } from '../core/physics.ts';
import { PlayerCombat } from '../core/playerCombat.ts';
import type { PlayerStance } from '../core/playerStance.ts';
import { pryPlan } from '../core/prying.ts';
import { Rng } from '../core/random.ts';
import { raycast, type SolidAt } from '../core/raycast.ts';
import { bindReach, pileDistance as distanceToPile, furnitureDistance, reachTuning } from '../core/reach.ts';
import type { Readable } from '../core/readable.ts';
import { restorePlayerAudioState, type SaveSnapshot, snapshotSession } from '../core/saveState.ts';
import type { Scale } from '../core/scale.ts';
import { nearDiscoveryBox, type ScenarioDiscovery } from '../core/scenarioDiscovery.ts';
import { assertScenarioRun, ScenarioRun } from '../core/scenarioRun.ts';
import type { EventRuleDef } from '../core/schema.ts';
import { Simulation } from '../core/sim.ts';
import type { ColumnSource } from '../core/site.ts';
import { siteGenerationOf } from '../core/sitePalette.ts';
import { type PlacedPowerDevice, SitePower } from '../core/sitePower.ts';
import { skillActivityPractice, skillActivityPracticeRate } from '../core/skillTraining.ts';
import { freezeSnapshot } from '../core/snapshotData.ts';
import { type SolidBricks, worldBricks } from '../core/solidBricks.ts';
import type { SoundId } from '../core/soundEvents.ts';
import { type SoundEmission, type SoundEmissionMeta, SoundPicker } from '../core/soundPicker.ts';
import { simTimestamp } from '../core/time.ts';
import { spendFuel } from '../core/torch.ts';
import { VehicleOccupancy } from '../core/vehicleProjection.ts';
import { playerWearHooks, wearMeleeWeaponOnHit } from '../core/wear.ts';
import type { World } from '../core/world.ts';
import { figureSeedPool, zombieFigure } from '../core/zombieFigure.ts';
import { ZombieSpawner } from '../core/zombieSpawns.ts';
import {
  type AcidGroundImpact,
  BACKGROUND_ZOMBIE_RATE,
  BACKGROUND_ZOMBIE_SLICE_COUNT,
  BACKGROUND_ZOMBIE_SLICE_RATE,
  type HitImpulse,
  loweredStanceTuning,
  type MeleeResult,
  type MeleeWeapon,
  PLAYER_ARM_REACH_M,
  type PlayerMovement,
  type VocalNoise,
  type Zombie,
  ZombieSystem,
} from '../core/zombies.ts';
import { firearmShotSound } from './audioPresentation.ts';
import { interruptDisarm, registerTrapActions } from './bearTrapActions.ts';
import type { DebugNoclipStep } from './debugInterface.ts';
import { registerDoorAction } from './doorAction.ts';
import { type DownedBodyWay, downedBodyPlan, queueDownedBody, registerDownedBodyAction } from './downedBody.ts';
import {
  ATTACHMENT_WORK_SKILL,
  FirearmAttachmentHandling,
  isAttachmentWorkAction,
} from './firearmAttachmentHandling.ts';
import {
  FirearmMechanics,
  type FirearmOutcome,
  type FirearmShotEffect,
  type FirearmTrajectory,
  isFirearmTrainingAction,
} from './firearmHandling.ts';
import { MagazineHandling } from './magazineHandling.ts';
import {
  createPlayerBody,
  type MoveIntent,
  movementPace,
  nextStance,
  physicsFor,
  playerTuning,
  restorePlayer,
  type StanceToggle,
  snapshotPlayer,
  steer,
} from './player.ts';
import { Quickbar } from './quickbar.ts';
import { RestController } from './rest.ts';
import { shamblerVoiceLaw } from './shamblerAudio.ts';
import { ZOMBIE_RATE } from './simulationRates.ts';
import { Survival } from './survival.ts';
import { ThrowCharge } from './throwCharge.ts';
import { UNPACK_ACTION } from './unpacking.ts';
import { applyZombiePlayerHit } from './zombiePlayerHit.ts';

export const PHYSICS_RATE = 60;
export const HANDLING_RATE = 20;
const sessionFirearmsTuning = (
  mechanics: FirearmMechanics,
  tuning: FirearmsCombatTuning,
  firearmUid: number | undefined,
): FirearmsCombatTuning =>
  firearmUid === undefined ? tuning : { ...tuning, skillZeroHandling: mechanics.skillZeroHandlingFor(firearmUid) };
const sessionFirearmsSkillZeroHandling = (
  mechanics: FirearmMechanics,
  firearmUid: number | undefined,
  shared: FirearmsSkillZeroHandling,
): FirearmsSkillZeroHandling => (firearmUid === undefined ? shared : mechanics.skillZeroHandlingSettingFor(firearmUid));
const sessionFirearmsShotKind = (
  mechanics: FirearmMechanics,
  firearmUid: number | undefined,
  timeSimSeconds: number,
): FirearmsSkillShotKind =>
  firearmUid === undefined ? 'singleShot' : mechanics.handlingShotKind(firearmUid, timeSimSeconds);
const sessionFirearmTargetName = (registry: Registry, firearmType: string | undefined): string | undefined =>
  firearmType === undefined ? undefined : registry.items.get(firearmType)?.name;
const isInventoryPracticeAction = (job: Job): boolean =>
  job.kind === 'action' && (job.jobType === UNPACK_ACTION || job.jobType === 'furniture.search');
const createSessionAim = ({
  player,
  tuning,
  seed,
  restored,
  character,
  wobbleFlatOverride,
  wobbleNoiseScaleOverride,
}: {
  player: ReturnType<typeof playerTuning>;
  tuning: FirearmsCombatTuning;
  seed: number;
  restored: SaveSnapshot | undefined;
  character: Character;
  wobbleFlatOverride: number | undefined;
  wobbleNoiseScaleOverride: number | undefined;
}): AimController => {
  const footstepClock = restored?.character.playerAudio.footstepClock ?? initialFootstepClock();
  const wobbleSeed = Rng.stream(restored?.character.simulation.seed ?? seed, 'player-aim-wobble').int(0, 0xff_ff_ff_ff);
  return new AimController({
    tuning: player.aim,
    wobbleLimitRadians: tuning.wobbleLimitRadians,
    wobbleShape: {
      verticalToHorizontalRatio: wobbleFlatOverride ?? tuning.wobbleVerticalToHorizontalRatio,
      archPower: tuning.wobbleLuneArchPower,
      phaseOffsetRadians: tuning.wobbleLunePhaseOffsetRadians,
    },
    wobbleSeed,
    wobbleNoise: {
      reversionRatePerSimSecond: tuning.wobbleNoiseReversionRatePerSimSecond,
      sigmaRadiansPerSqrtSecond: tuning.wobbleNoiseSigmaRadiansPerSqrtSecond,
      smoothingSimSeconds: tuning.wobbleNoiseSmoothingSimSeconds,
    } satisfies AimWobbleNoiseTuning,
    wobbleNoiseStrengthScale: wobbleNoiseScaleOverride ?? 1,
    ...(restored ? { state: restored.character.aim, wobbleNoiseState: restored.character.aim.wobbleNoise } : {}),
    variance: firearmsSkillEffects(firearmsSkillLevel(character), tuning).variance,
    stridePhase: footstepClock.stridePhase,
  });
};

const advanceSessionAim = ({
  aim,
  firearms,
  tuning,
  skillLevel,
  firearmUid,
  timeSimSeconds,
  dt,
  velocity,
  blockSize,
  yaw,
  pitch,
  aimSway,
  firing,
  stridePhase,
}: {
  aim: AimController;
  firearms: FirearmMechanics;
  tuning: FirearmsCombatTuning;
  skillLevel: number;
  firearmUid: number | undefined;
  timeSimSeconds: number;
  dt: number;
  velocity: Vec3;
  blockSize: number;
  yaw: number;
  pitch: number;
  aimSway: number;
  firing: boolean;
  stridePhase: number;
}): void => {
  const shotKind = sessionFirearmsShotKind(firearms, firearmUid, timeSimSeconds);
  const skill = firearmsSkillEffects(skillLevel, sessionFirearmsTuning(firearms, tuning, firearmUid), shotKind);
  aim.advance({
    dt,
    velocity,
    blockSize,
    yaw,
    pitch,
    variance: skill.variance * aimSway,
    firing,
    recoilRecoveryRate: skill.recoilRecoveryRate,
    stridePhase,
  });
};
const setSessionFirearmsSkillZeroHandling = (
  mechanics: FirearmMechanics,
  firearmUid: number | undefined,
  value: FirearmsSkillZeroHandling,
): void => {
  if (firearmUid !== undefined) {
    mechanics.setSkillZeroHandlingFor(firearmUid, value);
  }
};
export const IDLE: MoveIntent = { forward: 0, right: 0, jump: false, sprint: false, walk: false, useDominant: false };

/** What the player is doing with the keyboard and mouse, read each tick. */
export interface PlayerInputSample {
  readonly active: boolean;
  readonly inputLocked: boolean;
  readonly intent: MoveIntent;
  readonly yaw: number;
  readonly pitch: number;
  readonly walking: boolean;
  readonly descending: boolean;
  readonly worldReady: boolean;
}

export interface SessionControls {
  /** True when input reaches the world: the pointer is locked and no menu has it. */
  active: () => boolean;
  intent: () => MoveIntent;
  /** Recording and replay meet at the fixed player-tick boundary, never at a DOM timestamp. */
  sampleAtPlayerTick?: (tick: number, live: PlayerInputSample, time: number, compression: number) => PlayerInputSample;
  /** Clears edge-triggered intents after the player tick samples them. */
  consumeDominantUse?: () => void;
  consumeOffUse?: () => void;
  consumeStanceToggle?: () => StanceToggle | undefined;
  /** Runs dominant use on the player-tick boundary, with that tick's aim/state. */
  useDominant?: () => void;
  /** Held-trigger sampling, including release/inactive ticks, for debug firearm cadence. */
  heldDominantUse?: (time: number, pressed: boolean, held: boolean) => void;
  /** Right mouse requests firearm readiness; input gates this while a menu or lock owns the pointer. */
  readyHeld?: () => boolean;
  /** True only while the player is in the melee en-garde stance. */
  blocking?: () => boolean;
  /** True only while an automatic firearm is selected and its trigger is held. */
  automaticFireHeld?: () => boolean;
  /** Applies a requested camera-pitch shift and returns the amount accepted by its pitch limits. */
  adjustPitch?: (delta: number) => number;
  /** Runs off-hand use on the player-tick boundary, with that tick's aim/state. */
  useOff?: () => void;
  /** Radians; 0 looks down -z. */
  yaw: () => number;
  pitch: () => number;
  /** Walk instead of jog (the Z toggle). */
  walking: () => boolean;
  /** R held: descend while in noclip. */
  descending: () => boolean;
}

/** Sound output. Positions are in blocks; the game converts to metres for playback. */
export interface SessionAudio {
  /** One-way playback of an admitted choice; unavailable output cannot undo hearing or picker state. */
  play: (sound: Readonly<SoundEmission>) => void;
  /** Presentation cue selectors; selected cues use the session picker without adding vocal noise. */
  onMoveStart?: (move: MoveStart, ownerLocation: Location | undefined, chest: Vec3, time: number) => void;
  onMoveComplete?: (move: MoveStart, time: number) => void;
}

/** The part of the debug tools that changes what the simulation does. */
interface SessionDebug {
  readonly noclip: boolean;
  stepNoclip: (step: DebugNoclipStep) => void;
}

export interface SessionOptions {
  powerDevices?: readonly PlacedPowerDevice[];
  registry: Registry;
  scenario?:
    | Readonly<{ id: string; body: string; compression: string; eventRules?: readonly EventRuleDef[] }>
    | undefined;
  objective?: Readonly<Vec3> | undefined;
  discovery?: Readonly<ScenarioDiscovery> | undefined;
  world: World;
  isSolid: SolidAt;
  isOpaque: SolidAt;
  scale: Scale;
  /** Immutable choice for a new actor; saved progression wins on restore. */
  handedness?: Character['handedness'] | undefined;
  /** The world's seed. */
  seed: number;
  /** Calendar seconds at the start of day 1. */
  start: number;
  /** Player feet, in blocks, when starting fresh. Ignored when restoring. */
  spawn: Vec3;
  /** The game's shared block entities; restore populates this same object in place. */
  entities?: Inventory['entities'];
  /** Deterministic scenario registrations run after restore, before world consumers. */
  registerVehicles?: ((inventory: Inventory) => void) | undefined;
  terrainFloor?: (x: number, z: number) => number;
  /** Whether the world under (x, z), in blocks, is loaded enough to stand on. */
  ready: (x: number, z: number) => boolean;
  /** Optional replayed terrain readiness used only to classify zombie tiers. */
  zombieReady?: ((x: number, z: number) => boolean) | undefined;
  controls: SessionControls;
  audio: SessionAudio;
  /** A message that isn't an interruption, such as a completion notice. */
  notice: (text: string) => void;
  /** Presentation cue for an action the handling queue refused. */
  refusal?: ((text: string) => void) | undefined;
  /** Authored text selected by a live domain command; presentation owns its view. */
  onRead: (readable: Readonly<Readable>, bookUid?: number, itemType?: string) => void;
  /** Observational hook for actual handling completion/failure outcomes. */
  onHandlingOutcomes?: (result: TickResult) => void;
  onConsumed?: ((type: string) => void) | undefined;
  onHandlingOutcome?: (item: Item, outcome: FirearmOutcome) => void;
  onDischarge?: (item: Item, sighted: boolean) => void;
  onCompletedSwing?: (isFist: boolean) => void;
  onBatterySwapped?: ((lightType: string) => void) | undefined;
  /** Output only, called after the simulation has committed the case transition. */
  onFirearmEjection?: (effect: FirearmShotEffect) => void;
  /** Output only, after the simulation inserts an ejected item into its landing pile. */
  onFirearmCaseLanded?: (seed: number, item: Item, instanceIndex: number) => void;
  /** Presentation-only trajectory for every committed round, including virtual automatic fire. */
  onFirearmTrajectory?: (trajectory: FirearmTrajectory, time: number) => void;
  /** Presentation-only: an explosive went off here, with this blast radius, both in metres. */
  onDetonation?: (at: Vec3, radiusMetres: number) => void;
  /** Presentation-only: a melee block absorbed damage. */
  onBlock?: (jolt: BlockJolt, full: boolean) => void;
  onAcidImpact?: (position: Vec3, type: Zombie['type']) => void;
  onAcidGroundImpact?: (impact: AcidGroundImpact) => void;
  /** Presentation hooks for what the shamblers' rules decide; they only draw, and change no state. */
  zombieEffects?: {
    /** A hit drew blood: where it struck, along which line, and how hard. */
    onWound?: (id: EntityId, zombie: Zombie, hit: HitImpulse, damage: number) => void;
    /** A part was cut off (the zombie's `severed` already lists it). Fires before onDeath on a killing blow. */
    onSever?: (id: EntityId, zombie: Zombie, part: string, hit: HitImpulse) => void;
    /** A hit knocked flesh out of an amalgam (its `carved` already lists `cells`). */
    onCarve?: (id: EntityId, zombie: Zombie, cells: readonly number[], hit: HitImpulse) => void;
    /** A zombie became incapacitated but remains in the store and may be revived later. */
    onIncapacitated?: (id: EntityId, zombie: Zombie) => void;
    /** A zombie died: it is already out of the store, and its loot is already dropped. */
    onDeath?: (id: EntityId, zombie: Zombie) => void;
    /** The actual result of the player's last swing, for debug-only presentation. */
    onMeleeResult?: (result: MeleeResult) => void;
    /** Presentation-only first-person recoil for a confirmed hit. */
    onMeleeContact?: (impulse: number) => void;
  };
  /** Debug tools, once attached; read each time they matter. */
  debug?: () => SessionDebug | undefined;
  /** Debug-only vertical/horizontal ratio override for the walking lune. */
  wobbleFlatOverride?: number | undefined;
  /** Debug-only multiplier for authored OU noise strength. */
  wobbleNoiseScaleOverride?: number | undefined;
  /**
   * Continue from a save. Inventory and block-entity state are restored into the
   * game's shared `entities` object. Re-streamed columns are safe: entity anchors and
   * the zombie-spawn ledger prevent resetting existing furniture or respawning actors.
   */
  restore?: Readonly<SaveSnapshot>;
}

export interface SessionSnapshotIds {
  worldId: string;
  characterId: string;
}

/** Where the player was looking when a save was taken; the caller applies it to its input. */
interface RestoredLook {
  yaw: number;
  pitch: number;
  walk: boolean;
}

const firearmsSkillLevel = (character: Character): number =>
  skillEffectLevel(character.skills.firearms_combat ?? SKILL_LEVEL_MIN);

interface StanceBody {
  readonly body: Body;
  readonly heights: Readonly<Record<PlayerStance, number>>;
  readonly isSolid: SolidAt;
}

const setStanceHeight = (stance: StanceBody, current: PlayerStance): void => {
  stance.body.height = stance.heights[current];
};

/** A lower stance shrinks the collision body; rising is refused, keeping the stance, without room overhead. */
const settleStance = (
  stance: StanceBody,
  current: PlayerStance,
  wanted: PlayerStance,
  refuse: (text: string) => void,
): PlayerStance => {
  if (wanted === current) {
    return current;
  }
  const height = stance.heights[wanted];
  if (height > stance.body.height && bodyOverlapsTerrain({ ...stance.body, height }, stance.isSolid)) {
    refuse(wanted === 'standing' ? 'No room to stand up' : 'No room to crouch');
    return current;
  }
  setStanceHeight(stance, wanted);
  return wanted;
};

const resolvePlayerEyeHeight = (
  unconscious: boolean,
  proneHeight: number,
  eyeDrop: number | undefined,
  eye: number,
): number => (unconscious ? proneHeight : eye - (eyeDrop ?? 0));

const movementIntent = (refusal: string | undefined, intent: MoveIntent): MoveIntent => (refusal ? IDLE : intent);

const playerMovementForIntent = (moving: MoveIntent, stance: PlayerStance, sprinting: boolean): PlayerMovement => {
  if (moving.forward === 0 && moving.right === 0) {
    return 'still';
  }
  if (stance !== 'standing') {
    return 'walking';
  }
  if (sprinting) {
    return 'sprinting';
  }
  return moving.walk ? 'walking' : 'jogging';
};

const createSessionCharacter = (
  registry: Registry,
  handedness: SessionOptions['handedness'],
  restored: Readonly<SaveSnapshot> | undefined,
): Character =>
  restored ? Character.restoreState(registry, restored.character.progression) : new Character(registry, { handedness });

const playerBodyTuning = (registry: Registry, id: string = CORE_CONTENT_IDS.player) => {
  const tuning = registry.body.get(id);
  if (!tuning) {
    throw new Error('Missing player body tuning');
  }
  return tuning;
};

const playerCompressionCaps = (registry: Registry, id: string = CORE_CONTENT_IDS.player) => {
  const tuning = registry.compression.get(id);
  if (!tuning) {
    throw new Error('Missing player compression tuning');
  }
  return tuning.caps;
};

const playerSenseTuning = (registry: Registry) => {
  const tuning = registry.senses.get(CORE_CONTENT_IDS.player);
  if (!tuning) {
    throw new Error('Missing player sense tuning');
  }
  return tuning;
};

const playerTreatmentHooks = (
  inventory: Inventory,
  sim: Simulation,
): NonNullable<Simulation['actions']['treatment']> => ({
  validate: (region, itemUid, itemType) => {
    const item = inventory.itemByUid(itemUid);
    const treatment = item?.type === itemType ? defOf(inventory.registry, itemType).treatment : undefined;
    if (!treatment) {
      return 'Treatment item is unavailable';
    }
    return sim.body.canTreat(region, treatment) ? undefined : 'That treatment does not apply';
  },
  finish: (region, itemUid, itemType) => {
    const item = inventory.itemByUid(itemUid);
    const treatment = item?.type === itemType ? defOf(inventory.registry, itemType).treatment : undefined;
    if (!(item && treatment)) {
      return 'Treatment item is no longer available';
    }
    if (!sim.body.canTreat(region, treatment)) {
      return 'That treatment no longer applies';
    }
    if (!inventory.consume(item)) {
      return 'Treatment item is no longer available';
    }
    const roll = sim.rng(`treatment:${region}:${itemUid}:${sim.time}`);
    if (!sim.body.treat(region, treatment, () => roll.next())) {
      throw new Error('Body treatment changed during completion');
    }
    return true;
  },
});

const restoreSessionAudio = (restored: Readonly<SaveSnapshot> | undefined, soundPicker: SoundPicker) => {
  if (!restored) {
    return {
      playerAudio: { vocalNoiseId: 0, vocalNoise: undefined as VocalNoise | undefined },
      footstepClock: initialFootstepClock(),
      rustleClock: initialRustleClock(),
      airbornePeakY: undefined as number | undefined,
    };
  }
  const saved = restorePlayerAudioState(restored.character.playerAudio);
  soundPicker.restoreState(structuredClone(saved.soundPicker));
  return {
    playerAudio: {
      vocalNoiseId: saved.vocalNoiseId,
      vocalNoise:
        saved.vocalNoise === null ? undefined : { ...saved.vocalNoise, pos: [...saved.vocalNoise.pos] as Vec3 },
    },
    footstepClock: saved.footstepClock,
    rustleClock: { cells: new Set(saved.rustleClock.cells), nextSimTimestamp: saved.rustleClock.nextSimTimestamp },
    airbornePeakY: saved.airbornePeakY ?? undefined,
  };
};

const restorePlayerSessionLatches = (player: ReturnType<typeof restorePlayer> | undefined) => ({
  sprinting: player?.sprinting ?? false,
  firearmReadyWalking: player?.firearmReadyWalking ?? false,
  handlingPausedForKnockout: player?.handlingPausedForKnockout ?? false,
});

const zombieReadinessFor = (options: SessionOptions) => options.zombieReady ?? options.ready;

/** Physical bricks share the parked-vehicle occupancy projection with the cell collision path. */
const solidBricksFor = (world: World, registry: Registry, inventory: Inventory, blockSize: number): SolidBricks =>
  worldBricks(world, registry, inventory.entities, { vehicles: inventory.vehicles, blockSize });

const scenarioRunSnapshot = (run: ScenarioRun | undefined) => run?.snapshot() ?? null;
const scenarioRunWon = (run: ScenarioRun | undefined): boolean => run?.won ?? false;

const restoreScenarioRun = (options: SessionOptions, sim: Simulation): ScenarioRun | undefined => {
  const restored = options.restore;
  assertScenarioRun(restored?.character.scenarioRun ?? null, {
    calendar: sim.calendar,
    dead: sim.dead !== undefined,
    ...(restored && options.scenario ? { scenario: options.scenario.id } : {}),
  });
  if (restored?.character.scenarioRun && !options.scenario) {
    throw new Error('Unexpected scenario run');
  }
  const run = options.scenario
    ? new ScenarioRun(options.scenario.id, sim.calendar, restored?.character.scenarioRun ?? undefined)
    : undefined;
  if (run?.won) {
    sim.paused = true;
  }
  return run;
};

const observeScenarioMovement = (
  run: ScenarioRun | undefined,
  {
    before,
    after,
    blockSize,
    climbing,
    calendar,
  }: {
    before: Vec3;
    after: Vec3;
    blockSize: number;
    climbing: boolean;
    calendar: number;
  },
): void => {
  run?.moved(before, after, blockSize);
  if (climbing) {
    run?.entered(calendar);
  }
};

const createSessionPower = (options: SessionOptions, sim: Simulation, inventory: Inventory): SitePower | undefined => {
  const saved = options.restore?.world.power;
  if (!options.powerDevices?.length) {
    if (saved) {
      throw new Error('Saved power has no authored devices');
    }
    return undefined;
  }
  if (options.restore && !saved) {
    throw new Error('Save is missing authored power state');
  }
  const power = new SitePower({
    registry: options.registry,
    inventory,
    devices: options.powerDevices,
    clock: sim.clock,
    cycle: requireDayCycle(options.registry),
    ...(saved ? { saved } : {}),
  });
  sim.scheduler.register({
    id: 'power',
    rate: 1 / options.registry.powerTuning.get(CORE_CONTENT_IDS.powerTuning)!.tickSimSeconds,
    tick: (_dt, time) => power.advance(simTimestamp(time)),
  });
  return power;
};

export const createSession = (options: SessionOptions) => {
  const { registry, world, isSolid, scale, seed, controls, audio, debug } = options;
  const dayCycle = requireDayCycle(registry);
  const shamblerVoice = shamblerVoiceLaw(
    figureSeedPool(registry.zombies),
    registry.senses.get(CORE_CONTENT_IDS.player)!.shamblerVoice,
  );
  const s = scale.blockSize;
  const skyTop = (scale.maxCy + 1) * CHUNK - 1;
  const Player = playerTuning(registry);
  const physics = physicsFor(scale, Player);
  const restored = options.restore;
  const rolledColumns = new Set(restored?.world.rolledColumns);

  let physicalSolid = isSolid;
  const restoredPlayer = restored ? restorePlayer(restored.character.player) : undefined;
  const senseTuning = playerSenseTuning(registry);
  let playerStance: PlayerStance = restoredPlayer?.stance ?? 'standing';
  const body: Body = restoredPlayer?.body ?? createPlayerBody(scale, options.spawn, Player);
  // The stance sets the collision height, so a lowered save loads lowered and retuned content applies.
  const stanceBody: StanceBody = {
    body,
    heights: {
      standing: Player.height / s,
      crouching: Player.crouch.bodyHeightMetres / s,
      prone: Player.prone.bodyHeightMetres / s,
    },
    isSolid: (x, y, z) => physicalSolid(x, y, z),
  };
  setStanceHeight(stanceBody, playerStance);
  const updateStance = (): void => {
    const toggle = controls.consumeStanceToggle?.();
    const wanted = debug?.()?.noclip ? playerStance : nextStance(playerStance, toggle);
    playerStance = settleStance(stanceBody, playerStance, wanted, options.refusal ?? options.notice);
  };
  const loweredStance = () => loweredStanceTuning(Player, playerStance);
  const restoredLook: RestoredLook | undefined = restoredPlayer && {
    yaw: restoredPlayer.yaw,
    pitch: restoredPlayer.pitch,
    walk: restoredPlayer.walk,
  };

  const character = createSessionCharacter(registry, options.handedness, restored);
  const firearmsCombatTuning = registry.skills.get(CORE_CONTENT_IDS.firearmsCombat)?.combat?.firearms;
  if (!firearmsCombatTuning) {
    throw new Error('Missing firearms-combat skill tuning');
  }
  const currentFirearmsCombatTuning = (): FirearmsCombatTuning => firearmsCombatTuning;
  const meleeCombatTuning = registry.skills.get(CORE_CONTENT_IDS.meleeCombat)?.combat?.melee;
  const inventory = restored
    ? Inventory.restoreState(registry, restored.character.inventory, options.entities, {
        character,
        vehicles: restored.world.vehicles,
      })
    : new Inventory(registry, undefined, options.entities, character);
  options.registerVehicles?.(inventory);
  const vehicleOccupancy = new VehicleOccupancy(registry, inventory.vehicles, s);
  const vehicleSight = new VehicleOccupancy(registry, inventory.vehicles, s, 'sight');
  const vehicleLight = new VehicleOccupancy(registry, inventory.vehicles, s, 'light');
  physicalSolid = (x, y, z) => isSolid(x, y, z) || vehicleOccupancy.isSolid(x, y, z);
  const isOpaque = (x: number, y: number, z: number) => options.isOpaque(x, y, z) || vehicleSight.isSolid(x, y, z);
  const isLightBlocking = (x: number, y: number, z: number) =>
    options.isOpaque(x, y, z) || vehicleLight.isSolid(x, y, z);
  const wearPlaced = (piece: BlockEntity | undefined, wear: number | undefined): void => {
    if (piece && wear !== undefined) {
      inventory.entities.wear(piece, wear);
    }
  };
  const generateColumnSupply = (cx: number, cz: number, source: ColumnSource): void => {
    for (const { spec, loot, surfaceLoot, fixedCount, wear } of source.furnitureIn(cx, cz)) {
      wearPlaced(inventory.furnish(spec, loot, surfaceLoot, fixedCount), wear);
    }
    for (const point of source.lootPointsIn(cx, cz)) {
      if (point.channel !== 'ground') {
        continue;
      }
      for (const rolled of rollLoot(registry, point, lootPointStream(seed, point), scale.blockSize)) {
        if (!inventory.add(inventory.createRolled(rolled), { kind: 'pile', pos: point.destination })) {
          throw new Error(`ground item "${rolled.type}" does not fit in its pile`);
        }
      }
    }
  };
  const fuses = new Fuses(
    registry,
    Array.from(inventory.items(), ({ item }) => item),
  );
  const aim = createSessionAim({
    player: Player,
    tuning: currentFirearmsCombatTuning(),
    seed,
    restored,
    character,
    wobbleFlatOverride: options.wobbleFlatOverride,
    wobbleNoiseScaleOverride: options.wobbleNoiseScaleOverride,
  });
  const { entities } = inventory;
  // Zombie ticks share vertical block geometry; revisions keep edits visible to every caller.
  const sunExposureCache = new SunExposureCache(skyTop, scale.minCy * CHUNK, isLightBlocking);
  let cachedWorldVersion = world.version;
  let cachedEntityVersion = entities.version;
  let cachedVehicleVersion = inventory.vehicles.version;
  const clearSunExposureCache = (): void => {
    sunExposureCache.clear();
    cachedWorldVersion = world.version;
    cachedEntityVersion = entities.version;
    cachedVehicleVersion = inventory.vehicles.version;
  };
  const isSunExposedAt = (pos: Vec3, hour: number): boolean => {
    if (
      cachedWorldVersion !== world.version ||
      cachedEntityVersion !== entities.version ||
      cachedVehicleVersion !== inventory.vehicles.version
    ) {
      clearSunExposureCache();
    }
    return sunExposureCache.isExposedAt(pos, hour, dayCycle);
  };
  const quickbar = new Quickbar();
  const spawner = new ZombieSpawner();
  const zombieStore = new MapEntityStore<Zombie>();

  /** The air block at the player's feet, where drops land. */
  const feet = (): Vec3 => [Math.floor(body.pos[0]), Math.floor(body.pos[1] + 0.01), Math.floor(body.pos[2])];
  const reachPlayer = {
    inventory,
    blockSize: s,
    get position() {
      return body.pos;
    },
    get clock() {
      return sim.clock;
    },
    obstacles: {
      isSolid: (x: number, y: number, z: number) => physicalSolid(x, y, z),
      get version() {
        return world.version + inventory.vehicles.version;
      },
    },
  };
  const reach = bindReach(reachPlayer);
  inventory.landing = (pos) => settleCell(pos, s, scale.minCy * CHUNK, physicalSolid);
  inventory.dropFeet = feet;
  const pileDistance = (pos: Vec3) => distanceToPile(body.pos, pos, s);
  const chest = (): Vec3 => [
    body.pos[0],
    body.pos[1] + reachTuning(inventory.registry).chestHeightMetres / s,
    body.pos[2],
  ];
  const entityDistance = (entity: BlockEntity) => furnitureDistance(reachPlayer, entity);

  const bodyTuning = playerBodyTuning(registry, options.scenario?.body);
  const sim = new Simulation({
    seed,
    registry,
    bodyTuning,
    ...playerWearHooks(inventory, bodyTuning),
    analgesics: (item) => registry.items.get(item)?.analgesic,
    compressionCaps: playerCompressionCaps(registry, options.scenario?.compression),
    clock: { ratio: dayCycle.clockRatio, start: options.start },
  });
  const { compression } = sim;
  let scenarioRun: ScenarioRun | undefined;
  const audioEvents = sim.events.reader();
  const trapInterrupts = sim.events.reader();
  const soundPicker = new SoundPicker(seed, registry.sounds);

  // The player's own noise, which shamblers can hear. Saved with the character.
  const {
    playerAudio,
    footstepClock: savedFootstepClock,
    rustleClock: restoredRustleClock,
    airbornePeakY: restoredAirbornePeakY,
  } = restoreSessionAudio(restored, soundPicker);

  const admitSound = (
    event: SoundId,
    position: Vec3,
    time: number,
    {
      player,
      sourceLabel = null,
      listenerRelative = false,
      noiseRadiusScale = 1,
      body: mobBody,
      noiseRadiusMetres,
      soundPitchMultiplier,
    }: SoundEmissionMeta & {
      player: boolean;
      body?: MobBody;
    },
  ): boolean => {
    const selected = soundPicker.pick(event, time);
    if (!selected) {
      return false;
    }
    const definition = registry.sounds.get(event)!;
    const bodyPitch = soundPitchMultiplier ?? (mobBody ? shamblerVoice.bodyPitch(mobBody) : 1);
    const pitch = selected.pitch * bodyPitch;
    const pick = { ...selected, pitch };
    const emittedAsNoise = noiseRadiusMetres !== undefined || (player && definition.noise.enabled);
    const emittedNoiseRadius = noiseRadiusMetres ?? definition.noise.radiusMetres * noiseRadiusScale;
    const sound = freezeSnapshot({
      event,
      position: [...position] as Vec3,
      time,
      pick,
      emittedAsNoise,
      sourceLabel,
      listenerRelative,
    });
    // Commit gameplay before calling the output adapter, regardless of device/assets/volume.
    let noiseId: number | undefined;
    if (emittedAsNoise) {
      playerAudio.vocalNoiseId += 1;
      noiseId = playerAudio.vocalNoiseId;
    }
    const noisePosition = [...position] as Vec3;
    const expiresAt = time + senseTuning.vocalNoiseLifetimeSimSeconds;
    if (emittedAsNoise) {
      playerAudio.vocalNoise = {
        id: noiseId!,
        pos: noisePosition,
        radiusMetres: emittedNoiseRadius,
        expiresAt,
      };
    }
    sim.events.emit({ kind: 'sound', ...sound });
    if (emittedAsNoise) {
      sim.events.emit({
        kind: 'noise',
        event,
        position: noisePosition,
        time,
        id: noiseId!,
        radiusMetres: emittedNoiseRadius,
        expiresAt,
      });
    }
    audio.play(sound);
    return true;
  };
  const playWorldSound = (
    event: SoundId,
    position: Vec3,
    time = sim.time,
    meta: SoundEmissionMeta & { body?: MobBody } = {},
  ): boolean => admitSound(event, position, time, { ...meta, player: false });
  const playPlayerSound = (event: SoundId, time = sim.time, meta: SoundEmissionMeta = {}): boolean =>
    admitSound(event, chest(), time, { ...meta, listenerRelative: meta.listenerRelative ?? true, player: true });
  const awardInventoryPractice = (): void => {
    const training = skillActivityPractice(registry, CORE_CONTENT_IDS.inventoryManagement, 'handling');
    character.awardPractice(CORE_CONTENT_IDS.inventoryManagement, training.practice, training.tier);
  };
  /** What of a melee blow gets past the en-garde guard; acid never comes through here. */
  const blockedDamage = (damage: number, attacker: EntityId): number => {
    if (!controls.blocking?.() || meleeCombatTuning === undefined) {
      return damage;
    }
    const block = meleeBlock(
      {
        level: character.skills.melee_combat ?? SKILL_LEVEL_MIN,
        damage,
        roll: sim.rng(`block:${attacker}:${sim.time}`).next(),
        stamina: sim.needs.stamina,
        windedBelow: sim.body.staminaRules.windedBelow,
      },
      meleeCombatTuning,
    );
    if (block.absorbed <= 0) {
      return damage;
    }
    spendStamina(sim.needs, block.staminaCost, bodyTuning.staminaRegenDelaySimSeconds);
    const training = skillActivityPractice(registry, CORE_CONTENT_IDS.meleeCombat, 'block');
    character.awardPractice(CORE_CONTENT_IDS.meleeCombat, training.practice * block.absorbed, training.tier);
    playPlayerSound(block.full ? 'player_block_full' : 'player_block_partial');
    options.onBlock?.(blockJolt(block.absorbed, meleeCombatTuning), block.full);
    return damage - block.absorbed;
  };
  const queue = new HandlingQueue(
    inventory,
    (move) =>
      options.audio.onMoveStart?.(
        move,
        move.from.kind === 'pocket' ? inventory.locate(move.from.owner) : undefined,
        chest(),
        sim.time,
      ),
    (move) => {
      awardInventoryPractice();
      let source: Readonly<Vec3> | undefined;
      if (move.from.kind === 'pile') {
        source = move.from.pile.pos;
      } else if (move.from.kind === 'furniture') {
        source = move.from.entity.pos;
      }
      const { target } = move;
      const carriedPocket =
        target.kind === 'pocket' && [...inventory.carriedTree()].some(({ item }) => item === target.owner);
      const acquired = target.kind === 'hand' || target.kind === 'worn' || carriedPocket;
      if (
        source &&
        registry.items.get(move.item.type)?.readable &&
        acquired &&
        options.discovery?.clues.some((at) => at.every((value, axis) => value === source[axis]))
      ) {
        scenarioRun?.discover('clueRead', sim.calendar);
      }
      options.audio.onMoveComplete?.(move, sim.time);
    },
  );

  const firearms = new FirearmMechanics(inventory, queue, {
    blockSize: s,
    isSolid: physicalSolid,
    pose: (uid) =>
      inventory.hands.right?.uid === uid || inventory.hands.left?.uid === uid
        ? {
            feet: feet(),
            eye: [body.pos[0], body.pos[1] + playerEyeHeightMetres() / s, body.pos[2]],
            yaw: sampledInput().yaw,
            pitch: sampledInput().pitch,
            blockSize: s,
          }
        : undefined,
    onEjection: (effect) => options.onFirearmEjection?.(effect),
    onCaseLanded: (caseSeed, item, instanceIndex) => options.onFirearmCaseLanded?.(caseSeed, item, instanceIndex),
    onTrajectory: (trajectory, time) => options.onFirearmTrajectory?.(trajectory, time),
    firearmsSkillLevel: () => firearmsSkillLevel(character),
    firearmsSkillZeroHandling: () => currentFirearmsCombatTuning().skillZeroHandling,
    handlingSlowdown: () => sim.body.pain.effects.handlingSlowdown,
    onCommittedShot: (shotSeed, recoilKickRadians, shotKind, firearmUid) => {
      const training = skillActivityPractice(registry, CORE_CONTENT_IDS.firearmsCombat, 'shot');
      character.awardPractice(CORE_CONTENT_IDS.firearmsCombat, training.practice, training.tier);
      const tuning = sessionFirearmsTuning(firearms, currentFirearmsCombatTuning(), firearmUid);
      aim.recordShot(
        shotSeed,
        recoilKickRadians,
        firearmsSkillEffects(firearmsSkillLevel(character), tuning, shotKind).recoilKickScale *
          firearms.recoilScaleFor(firearmUid),
      );
    },
    onHandlingOutcome: (item, outcome) => options.onHandlingOutcome?.(item, outcome),
    onShot: (shot, time, firearm, sighted) => {
      options.onDischarge?.(firearm, sighted);
      const hits = zombieSystem.firePellets(shot);
      if (hits > 0 && firearmReadyWalking) {
        const training = skillActivityPractice(registry, CORE_CONTENT_IDS.firearmsCombat, 'hit');
        character.awardPractice(CORE_CONTENT_IDS.firearmsCombat, training.practice, training.tier);
      }
      const sound = firearmShotSound(registry, firearm);
      playPlayerSound(sound.event, time, {
        sourceLabel: sound.sourceLabel,
        noiseRadiusScale: firearms.noiseFactorFor(firearm),
      });
      if (sound.bodyEvent !== undefined) {
        playPlayerSound(sound.bodyEvent, time, { sourceLabel: sound.sourceLabel });
      }
    },
    onSound: (event, position, time) =>
      position ? playWorldSound(event, position, time) : playPlayerSound(event, time),
  });

  const firearmAttachments = new FirearmAttachmentHandling(inventory, queue, feet);

  const magazines = new MagazineHandling(inventory, queue, {
    feet,
    reloadFactor: () =>
      firearmsSkillEffects(firearmsSkillLevel(character), currentFirearmsCombatTuning()).reloadDuration *
      sim.body.pain.effects.handlingSlowdown,
    onSound: (event, time) => playPlayerSound(event, time),
  });

  const survival = new Survival(sim, inventory, queue, {
    reach,
    feet: (item) => freshDropTarget(inventory, item, feet()),
    notice: options.notice,
    read: options.onRead,
    consumed: options.onConsumed,
    batterySwapped: options.onBatterySwapped,
    bookRead: (bookUid) => {
      const item = inventory.itemByUid(bookUid);
      const book = item && registry.items.get(item.type)?.book;
      return Boolean(book?.recipes.every((recipe) => character.knownRecipes.has(recipe)));
    },
  });
  sim.actions.craft = craftActionHooks(inventory, character, reach, { feet, calendar: () => sim.calendar });
  sim.actions.reading = bookReadingHooks(inventory, character);
  sim.actions.treatment = playerTreatmentHooks(inventory, sim);
  const rest = new RestController(sim, {
    furniture: (uid) => {
      const entity = entities.byUid(uid);
      const restDef = entity && !entities.useRefusal(entity) && entities.defOf(entity).rest;
      return restDef ? { quality: restDef.quality, sleepable: restDef.sleep === true } : undefined;
    },
    withinReach: (uid) => {
      const entity = entities.byUid(uid);
      return entity !== undefined && inventory.canReachEntity(entity);
    },
    notice: options.notice,
    hasAlarm: () => [...inventory.carriedTree()].some(({ item }) => registry.items.get(item.type)?.alarm === true),
  });

  const {
    sprinting: restoredSprinting,
    firearmReadyWalking: restoredFirearmReadyWalking,
    handlingPausedForKnockout: restoredHandlingPause,
  } = restorePlayerSessionLatches(restoredPlayer);
  let sprinting = restoredSprinting;
  let firearmReadyWalking = restoredFirearmReadyWalking;
  const playerEyeHeightMetres = (): number =>
    resolvePlayerEyeHeight(
      sim.body.unconscious,
      sim.body.tuning.proneEyeHeightMetres,
      loweredStance()?.eyeDropMetres,
      Player.eye,
    );
  let footstepClock = savedFootstepClock;
  let rustleClock = restoredRustleClock;
  let airbornePeakY = restoredAirbornePeakY;
  /** `DESIGN.md`, "Ladders and hatches". */
  const ladderHold = new LadderHold({
    entities,
    body,
    inventory,
    reachBelow: physics.stepHeight,
    reach: Player.reach / s,
    restored: restoredPlayer?.ladder,
  });
  inventory.handHold = ladderHold;
  const throwCharge = new ThrowCharge(inventory, ladderHold);
  // A throw held when the ladder takes its hand ends there, so it is never released from the hand on the ladder.
  const refuseThrowForLadder = (): void => {
    const reason = throwCharge.refuseForLadder();
    if (reason) {
      (options.refusal ?? options.notice)(reason);
    }
  };
  const currentIntent = (): MoveIntent => {
    const input = sampledInput();
    return input.active && !input.inputLocked ? input.intent : IDLE;
  };
  const playerMovement = (): PlayerMovement =>
    playerMovementForIntent(movementIntent(sim.body.actionRefusal, currentIntent()), playerStance, sprinting);
  const updateAim = (dt: number, firing: boolean): void => {
    advanceSessionAim({
      aim,
      firearms,
      tuning: currentFirearmsCombatTuning(),
      skillLevel: firearmsSkillLevel(character),
      firearmUid: firearmInHands()?.uid,
      timeSimSeconds: sim.time,
      dt,
      velocity: body.vel,
      blockSize: s,
      yaw: sampledInput().yaw,
      pitch: sampledInput().pitch,
      aimSway: sim.body.consequences.aimSway * sim.body.pain.effects.aimSway,
      firing,
      stridePhase: footstepClock.stridePhase,
    });
  };
  const applyAimViewPitchShift = (): void => {
    const requested = aim.pendingViewPitchShift;
    if (requested !== 0) {
      aim.applyViewPitchShift(requested, controls.adjustPitch?.(requested) ?? 0);
    }
  };
  const updatePlayerSounds = (wasGrounded: boolean, previousPosition: Vec3, time: number) => {
    if (body.onGround) {
      if (
        !wasGrounded &&
        airbornePeakY !== undefined &&
        isHardLanding((airbornePeakY - body.pos[1]) * s, senseTuning.footsteps)
      ) {
        playPlayerSound('player_landing_hard', time);
      }
      airbornePeakY = undefined;
    } else {
      airbornePeakY = Math.max(airbornePeakY ?? previousPosition[1], body.pos[1]);
    }
    const travelled =
      wasGrounded && body.onGround
        ? Math.hypot(body.pos[0] - previousPosition[0], body.pos[2] - previousPosition[2]) * s
        : 0;
    const footsteps = advanceFootsteps(
      footstepClock,
      travelled > 0 ? playerMovement() : 'still',
      travelled,
      senseTuning.footsteps,
    );
    footstepClock = footsteps.clock;
    for (let i = 0; i < footsteps.steps; i++) {
      const event = footstepEventAt(body.pos, body, (x, y, z) => world.getBlock(x, y, z), registry.blocks);
      if (event) {
        playPlayerSound(event, time);
      }
    }
  };
  const playerSense = () => {
    const { yaw } = sampledInput();
    const eyeHeightMetres = playerEyeHeightMetres();
    const hour = hourOfDay(sim.calendar);
    const lightSources = inventoryLightSources(inventory, body.pos, eyeHeightMetres).map((source) => ({
      ...source,
      sunlit: isSunExposedAt([source.pos[0], source.pos[1] + source.heightMetres / s, source.pos[2]], hour),
    }));
    const playerLightHeight: Vec3 = [body.pos[0], body.pos[1] + eyeHeightMetres / s, body.pos[2]];
    const [carriedLight] = lightSources.filter((source) => source.carried).sort((a, b) => b.seenFrom - a.seenFrom);
    return {
      pos: [body.pos[0], body.pos[1], body.pos[2]] as Vec3,
      body: debug?.()?.noclip ? undefined : body,
      facing: [-Math.sin(yaw), 0, -Math.cos(yaw)] as Vec3,
      movement: playerMovement(),
      stance: playerStance,
      vocalNoise:
        playerAudio.vocalNoise && sim.time <= playerAudio.vocalNoise.expiresAt ? playerAudio.vocalNoise : undefined,
      lit: carriedLight !== undefined,
      lightSeenFrom: carriedLight?.seenFrom ?? 40,
      eyeHeightMetres,
      sunlit: isSunExposedAt(playerLightHeight, hour),
      lightSources,
    };
  };
  const heldItemUids = () => ({
    right: inventory.hands.right?.uid ?? null,
    left: inventory.hands.left?.uid ?? null,
  });
  const firearmInHands = () =>
    [inventory.hands[dominantSide(character)], inventory.hands[offSide(character)]].find(
      (item) => item && registry.items.get(item.type)?.firearm,
    );
  const meleeBlocker = worldMeleeBlocker(world, registry, {
    entities: inventory.entities,
    physical: physicalSolid,
    vehicles: inventory.vehicles,
    blockSize: s,
  });
  /**
   * One blow on a piece, a zombie's bash or the player's strike; every blow is heard, whatever it does, in the sound
   * its material names. A blow that ruins a piece destroys it, and whatever came down with it, with the work that
   * names them; where what it held has no room to fall, the piece stands until a blow finds room.
   */
  const bashPiece = (target: BlockEntity | undefined, strength: number): boolean => {
    const outcome = target && entities.bash(target, strength);
    if (!(target && outcome)) {
      return false;
    }
    playNoisyWorldSound(
      registry.furnitureMaterials.get(entities.defOf(target).material)!.blowSound,
      boxCentre(target.pos, target.size),
    );
    if (outcome === 'ruined') {
      for (const piece of ruinFurniture(furnitureMover(), target) ?? []) {
        forgetPiece(piece);
      }
    }
    return true;
  };
  /** A swing that meets no zombie strikes the piece in its reach with the weapon's impulse. */
  const strikePiece = (origin: Vec3, direction: Vec3, weapon: MeleeWeapon): boolean => {
    const reachBlocks = (PLAYER_ARM_REACH_M + weapon.reach) / s;
    const hit = raycast(origin, direction, reachBlocks, meleeBlocker({ kind: 'player', motion: weapon.motion }));
    const piece = hit && entities.at(...hit.block);
    return bashPiece(piece && entities.isSolid(...hit.block) ? piece : undefined, weapon.impulse ?? 0);
  };
  const traps = new BearTraps(inventory);
  const zombieSystem = new ZombieSystem({
    activeZombieRadiusMetres: siteGenerationOf(registry).activeZombieRadiusMetres,
    store: zombieStore,
    restrained: (id) => traps.holds(id),
    seed: sim.seed,
    isLoaded: zombieReadinessFor(options),
    terrainFloor: options.terrainFloor,
    isSolid: physicalSolid,
    solidBricks: solidBricksFor(world, registry, inventory, s),
    isOpaque,
    isSoundBlocking: worldSoundBlocking(world, registry, {
      entities: inventory.entities,
      physical: physicalSolid,
      vehicles: inventory.vehicles,
      blockSize: s,
    }),
    meleeBlocker,
    bashObstacle: (ahead, strength) => bashPiece(entities.pieceTouching(ahead), strength),
    blockSize: s,
    physics,
    jumpSpeed: Player.jump,
    tuning: senseTuning,
    player: playerSense,
    dayPhase: () => dayPhaseAt(dayCycle, sim.calendar),
    isSunExposedAt: (position) => isSunExposedAt(position, hourOfDay(sim.calendar)),
    hurtPlayer: (amount, hitRegions, attacker, kind) => {
      const source = zombieStore.get(attacker);
      const damage = blockedDamage(source ? modified('attack.damage', amount, source) : amount, attacker);
      if (damage <= 0) {
        return;
      }
      applyZombiePlayerHit(sim, {
        damage,
        sourceName: source?.type.name ?? 'zombie',
        regionRoll: sim.rng(`player-hit-region:${attacker}:${sim.time}`).next(),
        hitRegions,
        kind,
      });
    },
    onAcidPlayerHit: (hit) => applyZombiePlayerHit(sim, hit),
    onPlayerExposure: (contact) => sim.expose(contact),
    onPlayerLeaveExposure: (source) => sim.leaveExposure(source),
    onAcidImpact: (position, type) => options.onAcidImpact?.(position, type),
    onAcidGroundImpact: (impact) => options.onAcidGroundImpact?.(impact),
    onSound: (event, position, zombie, playerMelee) => {
      if (playerMelee) {
        playWorldSound(event, position, sim.time, {
          listenerRelative: true,
          sourceLabel: 'player melee',
          ...(zombie ? { body: zombieFigure(zombie.type, zombie.figureSeed).realized.body } : {}),
        });
        return;
      }
      playWorldSound(
        event,
        position,
        sim.time,
        zombie
          ? {
              body: zombieFigure(zombie.type, zombie.figureSeed).realized.body,
              ...(zombie.type.soundPitchMultiplier === undefined
                ? {}
                : { soundPitchMultiplier: zombie.type.soundPitchMultiplier }),
            }
          : {},
      );
    },
    onFootstep: (position, id, mode, zombie) => {
      const event = shamblerFootstepEventAt(
        position,
        zombie.body,
        (x, y, z) => world.getBlock(x, y, z),
        registry.blocks,
      );
      if (!event) {
        return;
      }
      playWorldSound(event, position, sim.time, {
        sourceLabel: `${zombie.type.name.toLowerCase()} #${id} · ${mode}`,
        body: zombieFigure(zombie.type, zombie.figureSeed).realized.body,
      });
    },
    onSevered: (zombie, region) => {
      const pos: Vec3 = [
        Math.floor(zombie.body.pos[0]),
        Math.floor(zombie.body.pos[1]),
        Math.floor(zombie.body.pos[2]),
      ];
      const item = zombie.type.severedItems[region];
      if (item !== null) {
        inventory.add(inventory.create(item!), { kind: 'pile', pos });
      }
    },
    onWound: (id, zombie, hit, damage) => options.zombieEffects?.onWound?.(id, zombie, hit, damage),
    onSever: (id, zombie, part, hit) => options.zombieEffects?.onSever?.(id, zombie, part, hit),
    onCarve: (id, zombie, cells, hit) => options.zombieEffects?.onCarve?.(id, zombie, cells, hit),
    onIncapacitated: (id, zombie) => options.zombieEffects?.onIncapacitated?.(id, zombie),
    ...(options.zombieEffects?.onMeleeResult ? { onMeleeResult: options.zombieEffects.onMeleeResult } : {}),
    ...(options.zombieEffects?.onMeleeContact ? { onMeleeContact: options.zombieEffects.onMeleeContact } : {}),
    onDeath: (id, zombie) => {
      const table = zombie.type.loot;
      if (table) {
        const pos: Vec3 = [
          Math.floor(zombie.body.pos[0]),
          Math.floor(zombie.body.pos[1]),
          Math.floor(zombie.body.pos[2]),
        ];
        for (const drop of rollLoot(registry, corpseLootPoint(table, id, pos), sim.rng(`zombie-loot:${id}`))) {
          inventory.add(inventory.createRolled(drop), { kind: 'pile', pos });
        }
      }
      options.zombieEffects?.onDeath?.(id, zombie);
    },
  });
  const playerCombat = new PlayerCombat(
    {
      playPlayerMeleeSwing: (origin, weapon) => zombieSystem.playPlayerMeleeSwing(origin, weapon),
      resolvePlayerMelee: (origin, direction, weapon, isFist) =>
        zombieSystem.resolvePlayerMelee(origin, direction, weapon, isFist) || strikePiece(origin, direction, weapon),
    },
    (uid) => wearMeleeWeaponOnHit(inventory, uid),
    character,
    {
      onLandedHit: () => {
        const training = skillActivityPractice(registry, CORE_CONTENT_IDS.meleeCombat, 'hit');
        character.awardPractice(CORE_CONTENT_IDS.meleeCombat, training.practice, training.tier);
      },
      onCompletedSwing: (isFist) => options.onCompletedSwing?.(isFist),
    },
  );
  let lastZombieStep = 0;
  let lastBackgroundStep = 0;
  let backgroundSliceIndex = 0;
  let lastPlayerStep = 0;
  let playerTick = 0;
  let playerInput: PlayerInputSample | undefined;
  const sampledInput = (): PlayerInputSample =>
    playerInput ?? {
      active: controls.active(),
      inputLocked: compression.locksInput,
      intent: controls.intent(),
      yaw: controls.yaw(),
      pitch: controls.pitch(),
      walking: controls.walking(),
      descending: controls.descending(),
      worldReady: false,
    };
  const dispatchPlayerActions = (moving: boolean, intent: MoveIntent): void => {
    // On a ladder, a hand that holds it, or an item that needs it too, refuses its use.
    const dominantRefusal = ladderHold.refusal(dominantSide(character));
    const dominantFree = moving && dominantRefusal === undefined;
    controls.heldDominantUse?.(
      sim.time,
      dominantFree && Boolean(intent.useDominant),
      dominantFree && Boolean(intent.useDominantHeld),
    );
    if (!moving) {
      return;
    }
    const use = (refusal: string | undefined, act: (() => void) | undefined): void => {
      if (refusal) {
        (options.refusal ?? options.notice)(refusal);
      } else {
        act?.();
      }
    };
    if (intent.useDominant) {
      use(dominantRefusal, controls.useDominant);
    }
    if (intent.useOff) {
      use(ladderHold.refusal(offSide(character)), controls.useOff);
    }
  };
  /** Where an explosive goes off, in blocks: its pile, its standing furniture, or the player carrying it or its piece. */
  const detonationPoint = (item: Item): Vec3 | undefined => {
    let location = inventory.locate(item);
    while (location?.kind === 'pocket' || location?.kind === 'slot' || location?.kind === 'work') {
      location = inventory.locate(location.owner);
    }
    if (location?.kind === 'pile') {
      const [x, y, z] = location.pile.pos;
      return [x + 0.5, y + 0.25, z + 0.5];
    }
    if (location?.kind === 'furniture' && !location.entity.carried) {
      const [x, y, z] = location.entity.pos;
      return [x + 0.5, y + 0.5, z + 0.5];
    }
    return location ? bodyCentre(body) : undefined;
  };
  /** The explosive is used up; the blast and its fragments hurt zombies and the player alike (`DESIGN.md`, "Hand grenade"). */
  const detonate = (item: Item): void => {
    const spec = registry.items.get(item.type)?.explosive;
    const at = detonationPoint(item);
    if (!(spec && at)) {
      return;
    }
    const consumed = inventory.consume(item);
    if (!consumed) {
      return;
    }
    const directions = fragmentDirections(sim.rng(`fragments:${item.uid}`), spec.fragments.count);
    const { damage, impulse, rangeMetres } = spec.fragments;
    zombieSystem.detonate({ blast: spec.blast, fragments: { origin: at, directions, damage, impulse, rangeMetres } });
    const centre = bodyCentre(body);
    const blast =
      spec.blast.damage *
      blastShare(spec.blast, Math.hypot(centre[0] - at[0], centre[1] - at[1], centre[2] - at[2]) * s);
    if (blast > 0 && inSight(at, centre, physicalSolid)) {
      sim.hit(blast, 'a grenade', 'torso', { kind: 'blunt' });
    }
    for (const region of fragmentHitsOnBody({
      origin: at,
      directions,
      rangeBlocks: rangeMetres / s,
      body,
      isSolid: physicalSolid,
      regionHeights: bodyTuning.fragmentRegionHeights,
    })) {
      sim.hit(damage, 'a grenade', region, { kind: 'pierce' });
    }
    options.onDetonation?.([at[0] * s, at[1] * s, at[2] * s], spec.blast.radiusMetres);
    // The blast is the player's doing, so it is heard as their noise, from where it went off.
    admitSound(spec.sound, at, sim.time, { player: true, sourceLabel: 'grenade' });
  };
  sim.scheduler.register({
    id: 'zombies',
    rate: ZOMBIE_RATE,
    tick: (dt, time) => {
      for (const item of fuses.advance(dt, (live) => inventory.locate(live)?.kind === 'hand')) {
        detonate(item);
      }
      spawner.advance({ calendar: sim.calendar, registry, zombies: zombieSystem });
      if (scenarioRun) {
        advanceEventRules({
          rules: options.scenario?.eventRules ?? [],
          run: scenarioRun,
          calendar: sim.calendar,
          dayPhase: dayPhaseAt(dayCycle, sim.calendar).phase,
          player: body.pos,
          registry,
          zombies: zombieSystem,
        });
      }
      zombieSystem.tickActive(dt, time, heldItemUids());
      traps.step(dt, {
        player: body.pos,
        zombies: [...zombieStore.entries()].map(([id, zombie]) => [id, zombie.body.pos] as const),
        blockSize: s,
        alive: (id) => zombieStore.get(id) !== undefined,
        hurtPlayer: ({ region, damage, kind }) => sim.hit(damage, 'a bear trap', region, { kind }),
        injureZombie: (id, damage) => zombieSystem.injureLegs(id, damage),
      });
      lastZombieStep = time;
    },
  });
  sim.scheduler.register({
    id: 'zombie-background',
    rate: BACKGROUND_ZOMBIE_SLICE_RATE,
    tick: (_dt, time) => {
      const sliceIndex = backgroundSliceIndex;
      backgroundSliceIndex = (backgroundSliceIndex + 1) % BACKGROUND_ZOMBIE_SLICE_COUNT;
      zombieSystem.tickBackground(1 / BACKGROUND_ZOMBIE_RATE, time, sliceIndex, BACKGROUND_ZOMBIE_SLICE_COUNT);
      if (sliceIndex === 0) {
        lastBackgroundStep = time;
      }
    },
  });

  /** A downed body lies on the floor: the player walks over it and a door closes on it, as shamblers already do. */
  const standingZombieBodies = (): Body[] =>
    [...zombieStore.entries()].filter(([, zombie]) => !zombie.incapacitated).map(([, zombie]) => zombie.body);

  /** A world sound that shamblers hear when its content gives it a noise. */
  const playNoisyWorldSound = (event: SoundId, position: Vec3): void => {
    const noise = registry.sounds.get(event)?.noise;
    playWorldSound(event, position, sim.time, noise?.enabled ? { noiseRadiusMetres: noise.radiusMetres } : {});
  };

  // ---- moving furniture (`DESIGN.md`, "Moving furniture") ----

  const moveTerrain = terrainSolid(world, registry);
  const furnitureMover = (): FurnitureMover => ({
    inventory,
    terrainSolid: (x, y, z) => moveTerrain(x, y, z) || vehicleOccupancy.isSolid(x, y, z),
    blockSize: s,
    player: body,
    others: standingZombieBodies(),
    stamina: sim.needs.stamina,
    beforeRelocate: (entity) => power?.beforeRemove(simTimestamp(sim.time), entity),
  });
  const boxCentre = (pos: Readonly<Vec3>, size: Readonly<Vec3>): Vec3 => [
    pos[0] + size[0] / 2,
    pos[1] + size[1] / 2,
    pos[2] + size[2] / 2,
  ];
  const liftPiece = (uid: number): string | undefined => {
    const entity = entities.byUid(uid);
    if (!entity) {
      return 'It is no longer there';
    }
    const centre = boxCentre(entity.pos, entity.size);
    const reason = liftFurniture(furnitureMover(), entity);
    if (reason) {
      return reason;
    }
    spendStamina(sim.needs, reachTuning(registry).furnitureMove.liftStamina, bodyTuning.staminaRegenDelaySimSeconds);
    playNoisyWorldSound('furniture_scrape', centre);
    return undefined;
  };
  queue.registerAction('furniture.slide', (params) => {
    const entity = typeof params.entityUid === 'number' ? entities.byUid(params.entityUid) : undefined;
    if (!entity) {
      return coreMessage(registry, 'gone');
    }
    if (
      (params.way !== 'push' && params.way !== 'drag') ||
      !Array.isArray(params.destination) ||
      params.destination.length !== 3 ||
      !params.destination.every(Number.isSafeInteger)
    ) {
      throw new Error('Invalid furniture slide');
    }
    const reason = slideFurniture(furnitureMover(), entity, params.way, { destination: params.destination as Vec3 });
    if (!reason) {
      spendStamina(
        sim.needs,
        reachTuning(registry).furnitureMove.slide.stamina,
        bodyTuning.staminaRegenDelaySimSeconds,
      );
      playNoisyWorldSound('furniture_drag', boxCentre(entity.pos, entity.size));
    }
    return reason;
  });
  const slidePiece = (uid: number, way: FurnitureSlideWay): string | undefined => {
    const entity = entities.byUid(uid);
    if (!entity) {
      return coreMessage(registry, 'gone');
    }
    if (queue.busy) {
      return coreMessage(registry, 'handsBusy');
    }
    const reason = slideFurniture(furnitureMover(), entity, way, { commit: false });
    if (reason) {
      return reason;
    }
    queue.enqueueAction(
      'furniture.slide',
      way === 'push' ? 'Pushing' : 'Dragging',
      reachTuning(registry).furnitureMove.slide.stepSimSeconds,
      { entityUid: uid, way, destination: slideDestination(body, entity, way) },
    );
    return undefined;
  };
  const placePiece = (aimed: Readonly<Vec3>): string | undefined => {
    const carried = entities.carrying();
    if (!carried) {
      return 'Nothing to set down';
    }
    const reason = placeFurniture(furnitureMover(), aimed);
    if (!reason) {
      playNoisyWorldSound('furniture_scrape', boxCentre(carried.pos, carried.size));
    }
    return reason;
  };
  /** Worn out, the player sets the piece down in front, or beside, wherever it first fits. */
  const putDownWornOut = (): void => {
    const carried = entities.carrying()!;
    const [fx, , fz] = aimDirection(sampledInput().yaw, 0, NEUTRAL_AIM);
    const length = Math.hypot(fx, fz) || 1;
    const clear = body.halfWidth + Math.max(carried.size[0], carried.size[2]) / 2 + 0.5;
    const [, y] = feet();
    for (const turn of [0, 1, -1, 2, -2, 3, -3, 4]) {
      const angle = (turn * Math.PI) / 4;
      const dx = (fx * Math.cos(angle) - fz * Math.sin(angle)) / length;
      const dz = (fx * Math.sin(angle) + fz * Math.cos(angle)) / length;
      const aimed: Vec3 = [Math.floor(body.pos[0] + dx * clear), y, Math.floor(body.pos[2] + dz * clear)];
      if (!placePiece(aimed)) {
        (options.refusal ?? options.notice)(registry.ui.get(CORE_CONTENT_IDS.coreUi)!.furnitureMoveMessages.wornOut);
        return;
      }
    }
  };

  const observeEntry = (
    run: ScenarioRun,
    discovery: ScenarioDiscovery,
    climbing: boolean,
    before: Readonly<Vec3>,
  ): void => {
    if (!nearDiscoveryBox(body.pos, discovery.entrance, 0)) {
      return;
    }
    // Collision contact correction is not ladder travel.
    if (climbing && Math.hypot(...body.pos.map((value, axis) => value - before[axis]!)) > 2 * CONTACT_SKIN) {
      run.discover('entranceTravel', sim.calendar);
    }
    for (const entity of entities.near(discovery.entrance.min, discovery.entrance.max)) {
      if (
        entities.defOf(entity).door?.hatch &&
        nearDiscoveryBox(entity.pos, discovery.entrance, 0) &&
        inventory.canReachEntity(entity)
      ) {
        run.discover('hatchEncounter', sim.calendar);
        if (entity.open) {
          run.discover('hatchOpened', sim.calendar);
        }
      }
    }
  };
  const observeDiscovery = (climbing: boolean, before: Readonly<Vec3>): void => {
    const { discovery } = options;
    if (!(scenarioRun && discovery) || sim.dead || debug?.()?.noclip) {
      return;
    }
    if (discovery.landmarks.some((box) => nearDiscoveryBox(body.pos, box, 4 / s))) {
      scenarioRun.discover('landmarkArrival', sim.calendar);
    }
    if (nearDiscoveryBox(body.pos, discovery.building, 2 / s)) {
      scenarioRun.discover('buildingArrival', sim.calendar);
    }
    if (discovery.ports.some((box) => nearDiscoveryBox(body.pos, box, 0))) {
      scenarioRun.discover('sewerTravel', sim.calendar);
    }
    observeEntry(scenarioRun, discovery, climbing, before);
  };

  const advancePlayerBody = (dt: number, time: number, pacedIntent: MoveIntent): void => {
    const wasGrounded = body.onGround;
    const previousPosition: Vec3 = [...body.pos];
    const jumpStarted = pacedIntent.jump && wasGrounded;
    // A climber uses its free hand standing still: the ladder holds it while an item action runs.
    const acting = queue.busy || firearms.busy || playerCombat.activeMeleeAction !== undefined || throwCharge.active;
    const steered = ladderHold.on && acting ? { ...pacedIntent, forward: 0, right: 0 } : pacedIntent;
    const ladder = ladderHold.piece(pacedIntent.jump || sim.body.actionRefusal !== undefined);
    steer(body, scale, { yaw: sampledInput().yaw, intent: { ...steered, onLadder: ladder !== undefined } }, Player);
    if (jumpStarted) {
      playPlayerSound('player_strain', time);
    }
    refuseThrowForLadder();
    const climbing =
      ladder !== undefined &&
      climb(body, ladder, {
        speed: entities.defOf(ladder).climbable!.speedMetresPerSimSecond / s,
        dt,
        strafing: steered.right !== 0,
      });
    const landingSpeed = stepBody(body, dt, physicalSolid, {
      ...physics,
      // Only a climb up steps up a ledge: one down would step back onto the roof edge it is leaving.
      ...(climbing ? { gravity: 0, braced: body.vel[1] >= 0 } : {}),
      obstacles: standingZombieBodies(),
      shapeOf: zombieSystem.shapeOf,
    });
    sim.land(landingSpeed * s);
    observeScenarioMovement(scenarioRun, {
      before: previousPosition,
      after: body.pos,
      blockSize: s,
      climbing,
      calendar: sim.calendar,
    });
    observeDiscovery(climbing, previousPosition);
    updatePlayerSounds(wasGrounded, previousPosition, time);
    if (climbing) {
      // A climb down is not a fall: a drop is measured from where the ladder was let go.
      [, airbornePeakY] = body.pos;
    }
    const rustle = foliageRustle(rustleClock, {
      body,
      world,
      registry,
      gait: playerMovement(),
      // Ignore contact-skin correction (even one skin on all three axes), not real brushing.
      moving:
        Math.hypot(
          body.pos[0] - previousPosition[0],
          body.pos[1] - previousPosition[1],
          body.pos[2] - previousPosition[2],
        ) >
        2 * CONTACT_SKIN,
      time,
    });
    rustleClock = rustle.clock;
    if (rustle.sound) {
      admitSound(rustle.sound.event, rustle.sound.position, time, {
        player: true,
        listenerRelative: true,
        sourceLabel: 'brushing foliage',
      });
    }
  };

  const advancePlayerReadiness = (dt: number, intent: MoveIntent, moving: boolean): boolean => {
    const heldFirearm = firearmInHands();
    const firearmHand =
      inventory.hands[dominantSide(character)] === heldFirearm ? dominantSide(character) : offSide(character);
    // A firearm is raised in the hand that holds it; on a ladder that hand must be free of it.
    const readyInput =
      moving &&
      Boolean(heldFirearm && controls.readyHeld?.() && firearmsCombatTuning) &&
      ladderHold.refusal(firearmHand) === undefined;
    const readyGait = readyInput && !queue.busy;
    const [activeJob] = queue.jobs;
    const preservingReady =
      readyInput &&
      queue.busy &&
      activeJob !== undefined &&
      isFirearmTrainingAction(activeJob) &&
      heldFirearm !== undefined &&
      firearms.isReady(heldFirearm.uid);
    const readyUid = readyGait || preservingReady ? heldFirearm?.uid : undefined;
    const readinessHeld = readyUid !== undefined;
    firearms.advanceReadiness(dt, readyUid, readinessHeld);
    const going = intent.forward !== 0 || intent.right !== 0;
    firearmReadyWalking = readyGait && going;
    if (readyGait && readyUid !== undefined && (!firearms.isReady(readyUid) || going)) {
      const training = skillActivityPracticeRate(registry, CORE_CONTENT_IDS.firearmsCombat, 'readying');
      character.awardPractice(CORE_CONTENT_IDS.firearmsCombat, dt * training.practicePerSecond, training.tier);
    }
    return readyGait;
  };

  const preparePlayerStep = (dt: number, time: number) => {
    const live: PlayerInputSample = {
      active: controls.active(),
      inputLocked: compression.locksInput,
      intent: controls.intent(),
      yaw: controls.yaw(),
      pitch: controls.pitch(),
      walking: controls.walking(),
      descending: controls.descending(),
      worldReady: options.ready(body.pos[0], body.pos[2]),
    };
    const tick = playerTick;
    playerTick += 1;
    playerInput = controls.sampleAtPlayerTick?.(tick, live, time, sim.compression.c) ?? live;
    const moving = playerInput.active && !playerInput.inputLocked && !sim.body.actionRefusal && !traps.holds(undefined);
    const intent = moving ? playerInput.intent : IDLE;
    if (
      trapInterrupts.read().some((event) => event.kind === 'interrupt') ||
      intent.forward !== 0 ||
      intent.right !== 0 ||
      intent.jump
    ) {
      interruptDisarm(queue);
    }
    const handling = queue.busy || firearms.busy;
    const readyGait = advancePlayerReadiness(dt, intent, moving);
    controls.consumeDominantUse?.();
    controls.consumeOffUse?.();
    updateAim(dt, moving && Boolean(controls.automaticFireHeld?.()));
    playerCombat.tick(dt, heldItemUids());
    dispatchPlayerActions(moving, intent);
    return { intent, moving, handling, readyGait };
  };

  const advancePlayerMovement = (
    dt: number,
    time: number,
    { intent, handling, readyGait }: ReturnType<typeof preparePlayerStep>,
  ): void => {
    const carrying = entities.carrying() !== undefined;
    sprinting =
      !(playerStance !== 'standing' || ladderHold.on || carrying) &&
      intent.sprint &&
      (intent.forward !== 0 || intent.right !== 0) &&
      !handling &&
      !readyGait &&
      canSprint(sim.needs, sprinting, sim.body.staminaRules);
    survival.setSprinting(sprinting);
    if (carrying) {
      spendStamina(
        sim.needs,
        reachTuning(registry).furnitureMove.carryStaminaPerSimSecond * dt,
        bodyTuning.staminaRegenDelaySimSeconds,
      );
      if (sim.needs.stamina <= 0) {
        putDownWornOut();
      }
    } else {
      stepStamina(sim.needs, dt, sprinting, {
        ...sim.body.staminaRules,
        staminaRegenDelaySimSeconds: bodyTuning.staminaRegenDelaySimSeconds,
      });
    }
    const readyFirearm = Object.values(inventory.hands).find((item) => item && registry.items.get(item.type)?.firearm);
    const readyMovementFactor =
      readyGait && readyFirearm ? firearms.stanceEffectsFor(readyFirearm.uid).readyMovementFactor : 1;
    const pacedIntent = movementPace(
      { ...intent, sprint: sprinting, jump: intent.jump && playerStance !== 'prone' },
      {
        grams: inventory.carriedWeight(),
        handling,
        readyMovementFactor,
        movementSpeed: sim.body.consequences.movementSpeed,
        stanceSpeed: loweredStance()?.speedMetresPerSimSecond,
        directionalSpeed: {
          sideways: Player.movement.sidewaysSpeedScale,
          backward: Player.movement.backwardSpeedScale,
        },
      },
      Player,
    );
    const tools = debug?.();
    if (tools?.noclip) {
      footstepClock = advanceFootsteps(footstepClock, 'still', 0, senseTuning.footsteps).clock;
      airbornePeakY = undefined;
      tools.stepNoclip({
        body,
        scale,
        yaw: sampledInput().yaw,
        pitch: sampledInput().pitch,
        intent: pacedIntent,
        descend: sampledInput().descending,
        dt,
      });
      return;
    }
    advancePlayerBody(dt, time, pacedIntent);
  };

  // The player is held still until there is ground under them. Inputs are locked
  // while time is compressed. Handling and a heavy load slow them down, and sprinting
  // spends stamina: once winded, they jog until they've got their breath back.
  sim.scheduler.register({
    id: 'player',
    rate: PHYSICS_RATE,
    tick: (dt, time) => {
      lastPlayerStep = time;
      const step = preparePlayerStep(dt, time);
      applyAimViewPitchShift();
      if (!playerInput?.worldReady) {
        return;
      }
      advancePlayerMovement(dt, time, step);
    },
  });

  let handlingPausedForKnockout = restoredHandlingPause;
  const awardCompletedActionPractice = (job: Job): void => {
    if (isInventoryPracticeAction(job)) {
      awardInventoryPractice();
    }
    if (isFirearmTrainingAction(job)) {
      const training = skillActivityPractice(registry, CORE_CONTENT_IDS.firearmsCombat, 'handling');
      character.awardPractice(CORE_CONTENT_IDS.firearmsCombat, training.practice, training.tier);
    }
    if (isAttachmentWorkAction(job)) {
      const training = skillActivityPractice(registry, ATTACHMENT_WORK_SKILL, 'attachment');
      character.awardPractice(ATTACHMENT_WORK_SKILL, training.practice, training.tier);
    }
  };
  const tickHandling = (dt: number) => {
    // Handling happens in real time; compressed time belongs to long actions.
    if (sim.body.actionRefusal) {
      handlingPausedForKnockout = true;
      return;
    }
    if (compression.c > 1 || handlingPausedForKnockout) {
      handlingPausedForKnockout = false;
      return;
    }
    const result = queue.tick(dt);
    for (const job of result.done) {
      awardCompletedActionPractice(job);
    }
    options.onHandlingOutcomes?.(result);
    for (const { job, reason } of result.failed) {
      (options.refusal ?? options.notice)(`${job.label}: ${reason.toLowerCase()}`);
    }
  };
  sim.scheduler.register({ id: 'handling', rate: HANDLING_RATE, tick: tickHandling });

  sim.scheduler.register({
    id: 'firearms',
    rate: PHYSICS_RATE,
    tick: (_dt, time) => {
      if (sim.body.actionRefusal) {
        firearms.pauseTo(time);
      } else {
        firearms.advanceTo(time);
      }
    },
  });

  /** Containers with a search queued, so pressing again doesn't queue another. */
  const searching = new Set<BlockEntity>();
  const nameOf = (entity: BlockEntity) => entities.defOf(entity).name.toLowerCase();
  /** Cancels the work that names a piece leaving the world, so a save never names a missing piece. */
  const forgetPiece = (entity: BlockEntity): void => {
    sim.actions.cancelNaming(entity.uid);
    queue.cancelNaming(entity.uid);
    searching.delete(entity);
    ladderHold.releasePiece(entity);
  };
  /**
   * The construction action's removal: it cancels the work that names the piece, then takes the piece out of the
   * world, so a save never names a missing piece; a refusal cancels nothing (`DESIGN.md`, "Edits persist").
   */
  const removePiece = (entity: BlockEntity): string | undefined => {
    if (entities.byUid(entity.uid) !== entity) {
      return 'It is no longer there';
    }
    const mover = furnitureMover();
    const refusal = removalRefusal(mover, entity);
    if (refusal) {
      return refusal;
    }
    forgetPiece(entity);
    return removeFurniture(mover, entity);
  };
  queue.registerAction('furniture.search', (params) => {
    const uid = params.entityUid;
    if (typeof uid !== 'number' || !Number.isSafeInteger(uid)) {
      throw new Error('Invalid furniture search target');
    }
    const entity = entities.byUid(uid);
    if (!entity) {
      return 'It is no longer there';
    }
    searching.delete(entity);
    const reserved = entities.useRefusal(entity);
    if (reserved) {
      return reserved;
    }
    const reached = inventory.canReachEntity(entity);
    if (reached) {
      entities.markSearched(entity);
    }
    return reached ? undefined : 'Too far away';
  });
  registerDoorAction({
    queue,
    inventory,
    player: () => body,
    others: standingZombieBodies,
    playWorldSound: playNoisyWorldSound,
    closeBlockedMessages: registry.ui.get(CORE_CONTENT_IDS.coreUi)!.doorCloseBlockedMessages,
  });
  registerDownedBodyAction({ queue, player: reachPlayer, zombies: zombieSystem });
  registerTrapActions({
    queue,
    inventory,
    reach: () => reach(),
    setCell: () => {
      const [fx, , fz] = [-Math.sin(controls.yaw()), 0, -Math.cos(controls.yaw())];
      const [x, y, z] = feet();
      return inventory.landing([x + Math.round(fx), y, z + Math.round(fz)]);
    },
  });
  sim.actions.forcing = {
    validate: (entityUid, toolUid, method) => {
      const entity = entities.byUid(entityUid);
      if (!entity) {
        return 'The door is no longer there';
      }
      const reserved = entities.useRefusal(entity);
      if (reserved) {
        return reserved;
      }
      const plan = pryPlan(inventory, entity, { toolUid, method }, character);
      return plan.ok ? undefined : plan.reason;
    },
    strike: (entityUid, toolUid, method, time) => {
      const entity = entities.byUid(entityUid);
      if (entity) {
        const plan = pryPlan(inventory, entity, { toolUid, method }, character);
        if (plan.ok) {
          playPlayerSound(plan.strikeSound, time, { sourceLabel: 'forcing padlock' });
        }
      }
    },
    finish: (entityUid, toolUid, method) => {
      const entity = entities.byUid(entityUid);
      if (!entity) {
        return 'The door is no longer there';
      }
      const plan = pryPlan(inventory, entity, { toolUid, method }, character);
      if (!plan.ok) {
        return plan.reason;
      }
      const broken = entities.breakLock(entity);
      if (broken === undefined && plan.fuel !== undefined) {
        spendFuel(inventory, plan.tool, plan.fuel);
      }
      return broken;
    },
  };

  const power = createSessionPower(options, sim, inventory);

  if (restored) {
    world.restoreColumns(restored.world.columns, (id) => {
      const found = registry.blockIds.get(id);
      if (found === undefined) {
        throw new Error(`Unknown block ${id} in save`);
      }
      return found;
    });
    zombieSystem.restoreState(restored.world.zombies, (id) => registry.zombies.get(id));
    playerCombat.restoreState(restored.character.playerCombat);
    spawner.restoreState(restored.world.spawned);
    sim.restoreState(restored.character.simulation);
    const schedulerState = sim.scheduler.snapshotState();
    lastZombieStep = schedulerState.systems.find(({ id }) => id === 'zombies')?.done ?? sim.time;
    const backgroundState = schedulerState.systems.find(({ id }) => id === 'zombie-background');
    lastBackgroundStep = backgroundState?.done ?? sim.time;
    backgroundSliceIndex = (backgroundState?.ticks ?? 0) % BACKGROUND_ZOMBIE_SLICE_COUNT;
    lastPlayerStep = schedulerState.systems.find(({ id }) => id === 'player')?.done ?? sim.time;
    sim.actions.restoreState(restored.character.longAction);
    survival.restoreState(restored.character.lightUid === null ? {} : { litUid: restored.character.lightUid });
    quickbar.restoreState(restored.character.quickbar, inventory);
  }

  scenarioRun = restoreScenarioRun(options, sim);
  /** Why a held piece can't be used: it is no longer the live piece, or its deconstruction holds it. */
  const pieceRefusal = (entity: BlockEntity): string | undefined =>
    entities.byUid(entity.uid) === entity ? entities.useRefusal(entity) : 'It is no longer there';
  const isObjective = (entity: BlockEntity): boolean =>
    Boolean(
      options.objective &&
        entity.pos.every((value, axis) => value === options.objective![axis]) &&
        entities.defOf(entity).scenarioGoal,
    );

  return {
    get scenarioRun() {
      return scenarioRunSnapshot(scenarioRun);
    },
    get won() {
      return scenarioRunWon(scenarioRun);
    },
    power,
    chargerControl: (uid: number, operation: 'start' | 'stop'): string | undefined => {
      const entity = entities.byUid(uid);
      const id = entity && power?.chargerId(entity);
      const spec = entity && registry.furniture.get(entity.type)?.charger;
      if (!(entity && id && spec && power?.chargers && inventory.canReachEntity(entity))) {
        return coreMessage(registry, 'tooFar');
      }
      const refusal = entities.useRefusal(entity) ?? sim.body.actionRefusal;
      if (refusal) {
        return refusal;
      }
      if (operation === 'stop') {
        power.chargers.stop(simTimestamp(sim.time), id);
        return undefined;
      }
      const battery = entity.pockets?.[spec.pocket]?.[0]?.item;
      if (!battery) {
        return coreMessage(registry, 'wrongBattery');
      }
      const result = power.chargers.start(simTimestamp(sim.time), id, battery);
      return result.ok ? undefined : result.reason;
    },
    isObjective,
    activateGoal: (entity: BlockEntity): string | undefined => {
      if (sim.dead) {
        return 'This survivor died';
      }
      const unusable = pieceRefusal(entity);
      if (unusable) {
        return unusable;
      }
      if (!(scenarioRun && isObjective(entity))) {
        return 'Not the designated objective';
      }
      if (scenarioRun.won) {
        return undefined;
      }
      if (sim.body.actionRefusal) {
        return sim.body.actionRefusal;
      }
      if (!inventory.canReachEntity(entity)) {
        return 'Too far away';
      }
      const yaw = controls.yaw();
      const pitch = controls.pitch();
      const selected = pickFurniture({
        entities,
        origin: [body.pos[0], body.pos[1] + playerEyeHeightMetres() / s, body.pos[2]],
        direction: aimDirection(yaw, pitch, NEUTRAL_AIM),
        maxDistance: reachTuning(inventory.registry).reachMetres / s,
        blockSize: s,
        isSolid: options.isOpaque,
      });
      if (selected !== entity) {
        return 'Face the unobstructed objective';
      }
      scenarioRun.complete(sim.calendar);
      sim.paused = true;
      return undefined;
    },
    observeRunFrame: (seconds: number, active: boolean): void => {
      if (!sim.dead) {
        scenarioRun?.observeFrame(seconds, active && !sim.paused);
      }
    },
    sim,
    /** Derived vehicle-aware world queries for presentation and input consumers. */
    physicalSolid,
    isOpaque,
    isSoundBlocking: worldSoundBlocking(world, registry, {
      entities: inventory.entities,
      physical: physicalSolid,
      vehicles: inventory.vehicles,
      blockSize: s,
    }),
    inventory,
    entities,
    queue,
    firearms,
    firearmAttachments,
    magazines,
    /** Explosives' pins and burning fuses; a pin is pulled here, and the fuse lights once the item leaves the hand. */
    fuses,
    aim,
    get firearmsSkillZeroHandling() {
      return sessionFirearmsSkillZeroHandling(
        firearms,
        firearmInHands()?.uid,
        currentFirearmsCombatTuning().skillZeroHandling,
      );
    },
    get firearmsSkillZeroTarget() {
      return sessionFirearmTargetName(registry, firearmInHands()?.type);
    },
    hasFirearmHandlingOverrides: () =>
      options.wobbleFlatOverride !== undefined ||
      options.wobbleNoiseScaleOverride !== undefined ||
      firearms.hasSkillZeroHandlingOverrides() ||
      !sameFirearmsSkillZeroHandling(
        firearmsCombatTuning.skillZeroHandling,
        currentFirearmsCombatTuning().skillZeroHandling,
      ),
    setFirearmsSkillZeroHandling: (value: FirearmsSkillZeroHandling): void => {
      setSessionFirearmsSkillZeroHandling(firearms, firearmInHands()?.uid, value);
    },
    quickbar,
    character,
    planCraft: (recipe: RecipeDef, prefer?: CraftPreference) => planCraft(recipe, reach(), character, prefer),
    forceDoor: (entity: BlockEntity, toolUid?: number, method?: string) => {
      const plan = pryPlan(inventory, entity, { toolUid, method }, character);
      return plan.ok
        ? sim.actions.beginForcing(entity.uid, plan.tool.uid, {
            method: plan.method,
            durationSimSeconds: plan.time,
            strikeIntervalSimSeconds: plan.strikeInterval,
          })
        : plan.reason;
    },
    downedBodyPlan: (id: EntityId, way: DownedBodyWay) => downedBodyPlan(reachPlayer, zombieStore.get(id), way),
    /** Queues finishing off or dismembering a downed body; returns why not. */
    clearDownedBody: (id: EntityId, way: DownedBodyWay) =>
      queueDownedBody({ queue, player: reachPlayer, zombies: zombieSystem }, id, way),
    crafting: new CraftCommands({ inventory, character, sim, queue, reach }),
    survival,
    rest,
    zombies: zombieSystem,
    playerCombat,
    zombieStore,
    spawner,
    body,
    /** Set when the session was restored: the view direction to hand back to the input. */
    restoredLook,
    vehicles: inventory.vehicles,
    /** The player's noise state; saved with the character. */
    playerAudio,
    worldColumns: () => world.snapshotColumns((id) => registry.blocks[id]!.id),
    audioState: () => soundPicker.snapshotState(),
    feet,
    chest,
    reach,
    pileDistance,
    entityDistance,
    playWorldSound,
    playPlayerSound,
    /** Time of the last shambler step, for render interpolation. */
    get lastZombieStep() {
      return lastZombieStep;
    },
    get lastBackgroundStep() {
      return lastBackgroundStep;
    },
    get lastPlayerStep() {
      return lastPlayerStep;
    },
    get playerStridePhase() {
      return footstepClock.stridePhase;
    },
    get sprinting() {
      return sprinting;
    },
    get stance() {
      return playerStance;
    },
    /** Whether the player climbs a ladder, so the pick reaches through it, and which hand is on it. */
    ladderHold,
    /** A held item's throw from press to release; play throws it and shows its notices. */
    throwCharge,
    /** F at a ladder grabs it; returns why not. */
    grabLadder: (entity: BlockEntity): string | undefined => {
      if (sim.body.actionRefusal) {
        return sim.body.actionRefusal;
      }
      const refusal = ladderHold.grab(entity);
      refuseThrowForLadder();
      return refusal;
    },
    get playerEyeHeightMetres() {
      return playerEyeHeightMetres();
    },
    /** Furniture (with its loot) and spawns arrive with their column; saved state makes revisits idempotent. */
    onColumn: (cx: number, cz: number, source: ColumnSource) => {
      const key = `${cx},${cz}`;
      if (!rolledColumns.has(key)) {
        generateColumnSupply(cx, cz, source);
        // Empty columns also stay rolled: absence of furniture or a surviving pile is not fresh supply.
        rolledColumns.add(key);
      }
      spawner.onColumn({ cx, cz, site: source, registry, zombies: zombieSystem });
    },
    onColumnUnload: (cx: number, cz: number): void => spawner.unloadColumn(cx, cz),
    /** Queues a search of a container, unless one is queued or done. */
    search: (entity: BlockEntity): string | undefined => {
      if (entity.searched || searching.has(entity)) {
        return undefined;
      }
      const reserved = entities.useRefusal(entity);
      if (reserved) {
        return reserved;
      }
      searching.add(entity);
      const { searchNoise } = entities.defOf(entity);
      if (searchNoise) {
        playPlayerSound(searchNoise.sound, sim.time, { sourceLabel: `searching ${nameOf(entity)}` });
      }
      queue.enqueueAction(
        'furniture.search',
        `Search the ${nameOf(entity)}`,
        inventory.scaleHandlingTime(searchTime(entities.defOf(entity), reachTuning(inventory.registry))),
        {
          entityUid: entity.uid,
        },
      );
      return undefined;
    },
    /** F's gaze/occlusion selection is in play; admission shares Search's live furniture reach. */
    readFurniture: (entity: BlockEntity): string | undefined => {
      const unusable = pieceRefusal(entity);
      if (unusable) {
        return unusable;
      }
      if (!inventory.canReachEntity(entity)) {
        return 'Too far away';
      }
      const { readable } = entities.defOf(entity);
      if (!readable) {
        return 'Nothing to read';
      }
      scenarioRun?.read(sim.calendar);
      if (options.discovery?.clues.some((at) => at.every((value, axis) => value === entity.pos[axis]))) {
        scenarioRun?.discover('clueRead', sim.calendar);
      }
      options.onRead(readable);
      return undefined;
    },
    searching: (entity: BlockEntity): boolean => searching.has(entity),
    nameOf,
    liftFurniture: liftPiece,
    slideFurniture: slidePiece,
    placeFurniture: placePiece,
    removeFurniture: removePiece,
    /** One blow on a piece, landed as a zombie's bash or the player's strike lands it. */
    bashFurniture: bashPiece,
    turnFurniture: () => turnCarried(inventory),
    tipFurniture: () => tipCarried(inventory),
    /** Where the carried piece would stand if put down at an aimed cell, or why it can't be. */
    furniturePlacement: (aimed: Readonly<Vec3>) => placement(furnitureMover(), aimed),
    /** Advances an explicit Sim-time step (through rest, if any) and the player's own sounds. */
    frame: (dt: number, until?: number): void => {
      if (scenarioRun?.won) {
        return;
      }
      clearSunExposureCache();
      updateStance();
      rest.frame(dt, until);
      for (const event of audioEvents.read()) {
        if (event.kind === 'damage') {
          playPlayerSound(event.amount >= 15 ? 'player_hurt_heavy' : 'player_hurt_light', event.time);
        }
      }
    },
    frameReplay: (realSeconds: number): void => {
      if (scenarioRun?.won) {
        return;
      }
      clearSunExposureCache();
      updateStance();
      rest.frameReplay(realSeconds);
      for (const event of audioEvents.read()) {
        if (event.kind === 'damage') {
          playPlayerSound(event.amount >= 15 ? 'player_hurt_heavy' : 'player_hurt_light', event.time);
        }
      }
    },
    /** Isolated plain-data copy of everything a save keeps. */
    snapshot: ({ worldId, characterId }: SessionSnapshotIds): Readonly<SaveSnapshot> =>
      snapshotSession({
        worldId,
        characterId,
        ...(power ? { power: power.network } : {}),
        scenarioRun: scenarioRunSnapshot(scenarioRun),
        world,
        blockContentId: (id) => registry.blocks[id]!.id,
        inventory,
        character,
        simulation: sim,
        player: snapshotPlayer(body, {
          yaw: controls.yaw(),
          pitch: controls.pitch(),
          walk: controls.walking(),
          stance: playerStance,
          sprinting,
          firearmReadyWalking,
          handlingPausedForKnockout,
          ladder: ladderHold.snapshotState(),
        }),
        aim,
        survival,
        quickbar: quickbar.snapshotState(inventory),
        zombies: zombieSystem,
        playerCombat,
        spawner,
        rolledColumns,
        handling: queue,
        vocalNoiseId: playerAudio.vocalNoiseId,
        vocalNoise: playerAudio.vocalNoise,
        footstepClock,
        airbornePeakY,
        rustleClock,
        audio: soundPicker,
      }),
  };
};

export type Session = ReturnType<typeof createSession>;
