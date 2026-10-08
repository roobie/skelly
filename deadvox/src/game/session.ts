// The simulation half of a play session, without the DOM: the clock and scheduler, the
// player's body, inventory, needs, rest, the shamblers and their spawns. `startPlay`
// (the game) and the snapshot tests build the same object from here, so what a save
// captures is what the game runs. Sounds, notices and debug tools reach in through
// callbacks; nothing here draws or listens.

import type { Body as MobBody } from '@mobgen/core/body.ts';
import { zombieFigure } from '@mobgen/mob/shamblerFigure.ts';
import { AimController } from '../core/aim.ts';
import { type BlockEntity, searchTime } from '../core/blockEntities.ts';
import { bodyRegionForHitArea } from '../core/body.ts';
import { bookReadingHooks } from '../core/bookReading.ts';
import { Character, dominantSide, offSide, SKILL_LEVEL_MIN, skillEffectLevel } from '../core/character.ts';
import { CLOCK_RATIO, hourOfDay } from '../core/clock.ts';
import type { RecipeDef, Registry } from '../core/content.ts';
import { CHUNK, type Vec3 } from '../core/coords.ts';
import { CraftCommands } from '../core/craftCommands.ts';
import { type CraftPreference, planCraft } from '../core/crafting.ts';
import { craftActionHooks } from '../core/craftWork.ts';
import { type EntityId, MapEntityStore } from '../core/entities.ts';
import {
  type FirearmsCombatTuning,
  type FirearmsSkillShotKind,
  type FirearmsSkillZeroHandling,
  firearmStanceEffects,
  firearmsSkillEffects,
  sameFirearmsSkillZeroHandling,
} from '../core/firearmsSkill.ts';
import { foliageRustle, initialRustleClock } from '../core/foliageRustle.ts';
import {
  advanceFootsteps,
  footstepEventForBlock,
  initialFootstepClock,
  isHardLanding,
  shamblerFootstepEventAt,
} from '../core/footsteps.ts';
import { HandlingQueue, type MoveStart, type TickResult } from '../core/handling.ts';
import { Inventory, type Location } from '../core/inventory.ts';
import { lightSenseSourceFor, sunExposedAt } from '../core/lights.ts';
import { rollLoot } from '../core/loot.ts';
import { blocksAttack } from '../core/meleeCombat.ts';
import { canSprint, stepStamina } from '../core/needs.ts';
import { type Body, CONTACT_SKIN, stepBody } from '../core/physics.ts';
import { PlayerCombat } from '../core/playerCombat.ts';
import { pryPlan } from '../core/prying.ts';
import { Rng } from '../core/random.ts';
import type { SolidAt } from '../core/raycast.ts';
import { bindReach, pileDistance as distanceToPile, furnitureDistance, INVENTORY_CHEST } from '../core/reach.ts';
import type { Readable } from '../core/readable.ts';
import { restorePlayerAudioState, type SaveSnapshot, snapshotSession } from '../core/saveState.ts';
import type { Scale } from '../core/scale.ts';
import { Simulation } from '../core/sim.ts';
import type { Site } from '../core/site.ts';
import { skillActivityPractice, skillActivityPracticeRate } from '../core/skillTraining.ts';
import { freezeSnapshot } from '../core/snapshotData.ts';
import type { SoundEventId } from '../core/soundEvents.ts';
import { type SoundEmission, type SoundEmissionMeta, SoundPicker } from '../core/soundPicker.ts';
import { wearMeleeWeaponOnHit, wearOnPlayerHit } from '../core/wear.ts';
import type { World } from '../core/world.ts';
import type { ZombieRegion } from '../core/zombieRegions.ts';
import { ZombieSpawner } from '../core/zombieSpawns.ts';
import {
  BACKGROUND_ZOMBIE_RATE,
  BACKGROUND_ZOMBIE_SLICE_COUNT,
  BACKGROUND_ZOMBIE_SLICE_RATE,
  type HitImpulse,
  type MeleeResult,
  type PlayerMovement,
  type VocalNoise,
  type Zombie,
  ZombieSystem,
} from '../core/zombies.ts';
import type { DebugNoclipStep } from './debugInterface.ts';
import { registerDoorAction } from './doorAction.ts';
import {
  FirearmMechanics,
  type FirearmShotEffect,
  type FirearmTrajectory,
  isFirearmTrainingAction,
} from './firearmHandling.ts';
import { MagazineHandling } from './magazineHandling.ts';
import {
  createPlayerBody,
  type MoveIntent,
  movementPace,
  PLAYER,
  physicsFor,
  restorePlayer,
  snapshotPlayer,
  steer,
} from './player.ts';
import { Quickbar } from './quickbar.ts';
import { RestController } from './rest.ts';
import { shamblerBodyPitch } from './shamblerAudio.ts';
import { ZOMBIE_RATE } from './simulationRates.ts';
import { Survival } from './survival.ts';

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
): FirearmsSkillZeroHandling => (firearmUid === undefined ? shared : mechanics.skillZeroHandlingFor(firearmUid));
const sessionFirearmsShotKind = (
  mechanics: FirearmMechanics,
  firearmUid: number | undefined,
  timeSimSeconds: number,
): FirearmsSkillShotKind =>
  firearmUid === undefined ? 'singleShot' : mechanics.handlingShotKind(firearmUid, timeSimSeconds);
const sessionFirearmTargetName = (registry: Registry, firearmType: string | undefined): string | undefined =>
  firearmType === undefined ? undefined : registry.items.get(firearmType)?.name;
const createSessionAim = ({
  tuning,
  seed,
  restored,
  character,
  wobbleFlatOverride,
}: {
  tuning: FirearmsCombatTuning;
  seed: number;
  restored: SaveSnapshot | undefined;
  character: Character;
  wobbleFlatOverride: number | undefined;
}): AimController => {
  const footstepClock = restored?.character.playerAudio.footstepClock ?? initialFootstepClock();
  const jitterSeed = Rng.stream(restored?.character.simulation.seed ?? seed, 'player-aim-wobble').int(0, 0xff_ff_ff_ff);
  return new AimController({
    wobbleLimitRadians: tuning.wobbleLimitRadians,
    wobbleShape: {
      verticalToHorizontalRatio: wobbleFlatOverride ?? tuning.wobbleVerticalToHorizontalRatio,
      archPower: tuning.wobbleLuneArchPower,
      phaseOffsetRadians: tuning.wobbleLunePhaseOffsetRadians,
      jitterShare: tuning.wobbleJitterShare,
      jitterAmplitudeFraction: tuning.wobbleJitterAmplitudeFraction,
    },
    jitterSeed,
    ...(restored ? { state: restored.character.aim } : {}),
    variance: firearmsSkillEffects(firearmsSkillLevel(character), tuning).variance,
    stridePhase: footstepClock.stridePhase,
    stepIndex: footstepClock.stepIndex,
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
  stepIndex,
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
  stepIndex: number;
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
    stepIndex,
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
/** Seconds a player's noise stays audible to shamblers. */
const VOCAL_NOISE_LIFETIME = 0.5;
export const IDLE: MoveIntent = { forward: 0, right: 0, jump: false, sprint: false, walk: false, useDominant: false };

/** The item a severed shambler region leaves behind. */
const SEVERED_ITEM: Readonly<Record<Exclude<ZombieRegion, 'head'>, string>> = {
  torso: 'shambler_torso',
  leftArm: 'shambler_left_arm',
  rightArm: 'shambler_right_arm',
  leftLeg: 'shambler_left_leg',
  rightLeg: 'shambler_right_leg',
};

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

interface SessionControls {
  /** True when input reaches the world: the pointer is locked and no menu has it. */
  active: () => boolean;
  intent: () => MoveIntent;
  /** Recording and replay meet at the fixed player-tick boundary, never at a DOM timestamp. */
  sampleAtPlayerTick?: (tick: number, live: PlayerInputSample, time: number, compression: number) => PlayerInputSample;
  /** Clears edge-triggered intents after the player tick samples them. */
  consumeDominantUse?: () => void;
  consumeOffUse?: () => void;
  consumeCrouchToggle?: () => boolean;
  /** Runs dominant use on the player-tick boundary, with that tick's aim/state. */
  useDominant?: () => void;
  /** Held-trigger sampling, including release/inactive ticks, for debug firearm cadence. */
  heldDominantUse?: (time: number, pressed: boolean, held: boolean) => void;
  /** Right mouse requests firearm readiness; input gates this while a menu or lock owns the pointer. */
  readyHeld?: () => boolean;
  /** True only for S held while the player is in the melee en-garde stance. */
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
  dangerReason: () => string | undefined;
  stepNoclip: (step: DebugNoclipStep) => void;
}

export interface SessionOptions {
  registry: Registry;
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
  onRead: (readable: Readonly<Readable>) => void;
  /** Observational hook for actual handling completion/failure outcomes. */
  onHandlingOutcomes?: (result: TickResult) => void;
  /** Output only, called after the simulation has committed the case transition. */
  onFirearmEjection?: (effect: FirearmShotEffect) => void;
  /** Presentation-only trajectory for every committed round, including virtual automatic fire. */
  onFirearmTrajectory?: (trajectory: FirearmTrajectory, time: number) => void;
  /** Presentation hooks for what the shamblers' rules decide; they only draw, and change no state. */
  zombieEffects?: {
    /** A part was cut off (the zombie's `severed` already lists it). Fires before onDeath on a killing blow. */
    onSever?: (id: EntityId, zombie: Zombie, part: string, hit: HitImpulse) => void;
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
  /** Debug-only wobble vertical/horizontal ratio override. */
  wobbleFlatOverride?: number | undefined;
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

const nextCrouchState = (togglePressed: boolean, noclip: boolean, crouching: boolean): boolean =>
  togglePressed && !noclip ? !crouching : crouching;

const resolvePlayerEyeHeight = (
  unconscious: boolean,
  proneHeight: number,
  crouching: boolean,
  crouchDrop: number,
): number => (unconscious ? proneHeight : PLAYER.eye - (crouching ? crouchDrop : 0));

const movementIntent = (refusal: string | undefined, intent: MoveIntent): MoveIntent => (refusal ? IDLE : intent);

const playerMovementForIntent = (moving: MoveIntent, crouching: boolean, sprinting: boolean): PlayerMovement => {
  if (moving.forward === 0 && moving.right === 0) {
    return 'still';
  }
  if (crouching) {
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

const playerBodyTuning = (registry: Registry) => {
  const tuning = registry.body.get('player');
  if (!tuning) {
    throw new Error('Missing player body tuning');
  }
  return tuning;
};

const playerSenseTuning = (registry: Registry) => {
  const tuning = registry.senses.get('player');
  if (!tuning) {
    throw new Error('Missing player sense tuning');
  }
  return tuning;
};

const playerTreatmentHooks = (
  inventory: Inventory,
  sim: Simulation,
): NonNullable<Simulation['actions']['treatment']> => ({
  validate: (region, itemUid, treatment) => {
    const item = inventory.itemByUid(itemUid);
    if (!item || item.type !== treatment) {
      return 'Treatment item is unavailable';
    }
    return sim.body.canTreat(region, treatment) ? undefined : 'That treatment does not apply';
  },
  finish: (region, itemUid, treatment) => {
    const item = inventory.itemByUid(itemUid);
    if (!item || item.type !== treatment) {
      return 'Treatment item is no longer available';
    }
    if (!sim.body.canTreat(region, treatment)) {
      return 'That treatment no longer applies';
    }
    if (!inventory.consume(item)) {
      return 'Treatment item is no longer available';
    }
    if (!sim.body.treat(region, treatment)) {
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

export const createSession = (options: SessionOptions) => {
  const { registry, world, isSolid, scale, seed, controls, audio, debug } = options;
  const s = scale.blockSize;
  const skyTop = (scale.maxCy + 1) * CHUNK - 1;
  const isSunExposedAt = (pos: Vec3, hour: number): boolean => sunExposedAt(pos, hour, skyTop, options.isOpaque);
  const physics = physicsFor(scale);
  const restored = options.restore;

  const restoredPlayer = restored ? restorePlayer(restored.character.player) : undefined;
  const senseTuning = playerSenseTuning(registry);
  let crouching = restoredPlayer?.crouching ?? false;
  const body: Body =
    restoredPlayer?.body ?? createPlayerBody(scale, options.spawn[0], options.spawn[1], options.spawn[2]);
  const restoredLook: RestoredLook | undefined = restoredPlayer && {
    yaw: restoredPlayer.yaw,
    pitch: restoredPlayer.pitch,
    walk: restoredPlayer.walk,
  };

  const character = createSessionCharacter(registry, options.handedness, restored);
  const firearmsCombatTuning = registry.skills.get('firearms_combat')?.combat?.firearms;
  if (!firearmsCombatTuning) {
    throw new Error('Missing firearms-combat skill tuning');
  }
  const currentFirearmsCombatTuning = (): FirearmsCombatTuning => firearmsCombatTuning;
  const meleeCombatTuning = registry.skills.get('melee_combat')?.combat?.melee;
  const inventory = restored
    ? Inventory.restoreState(registry, restored.character.inventory, options.entities, character)
    : new Inventory(registry, undefined, options.entities, character);
  const aim = createSessionAim({
    tuning: currentFirearmsCombatTuning(),
    seed,
    restored,
    character,
    wobbleFlatOverride: options.wobbleFlatOverride,
  });
  const { entities } = inventory;
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
  };
  const reach = bindReach(reachPlayer);
  const pileDistance = (pos: Vec3) => distanceToPile(body.pos, pos, s);
  const chest = (): Vec3 => [body.pos[0], body.pos[1] + INVENTORY_CHEST / s, body.pos[2]];
  const entityDistance = (entity: BlockEntity) => furnitureDistance(reachPlayer, entity);

  const bodyTuning = playerBodyTuning(registry);
  const sim = new Simulation({
    seed,
    bodyTuning,
    clock: { ratio: CLOCK_RATIO, start: options.start },
    unsafe: () => debug?.()?.dangerReason() ?? zombieSystem.unsafeReason(),
    restRate: () => sim.actions.restRate,
  });
  const { compression } = sim;
  const audioEvents = sim.events.reader();
  const soundPicker = new SoundPicker(seed, registry.sounds);

  // The player's own noise, which shamblers can hear. Saved with the character.
  const {
    playerAudio,
    footstepClock: savedFootstepClock,
    rustleClock: restoredRustleClock,
    airbornePeakY: restoredAirbornePeakY,
  } = restoreSessionAudio(restored, soundPicker);

  const admitSound = (
    event: SoundEventId,
    position: Vec3,
    time: number,
    {
      player,
      sourceLabel = null,
      listenerRelative = false,
      body: mobBody,
      noiseRadiusMetres,
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
    const pitch = mobBody ? selected.pitch * shamblerBodyPitch(mobBody) : selected.pitch;
    const pick = { ...selected, pitch };
    const emittedAsNoise = noiseRadiusMetres !== undefined || (player && definition.noise.enabled);
    const emittedNoiseRadius = noiseRadiusMetres ?? definition.noise.radiusMetres;
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
    const expiresAt = time + VOCAL_NOISE_LIFETIME;
    if (emittedAsNoise) {
      playerAudio.vocalNoise = {
        id: noiseId!,
        pos: noisePosition,
        radiusMetres: emittedNoiseRadius,
        expiresAt: time + VOCAL_NOISE_LIFETIME,
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
    event: SoundEventId,
    position: Vec3,
    time = sim.time,
    meta: SoundEmissionMeta & { body?: MobBody } = {},
  ): boolean => admitSound(event, position, time, { ...meta, player: false });
  const playPlayerSound = (event: SoundEventId, time = sim.time, meta: SoundEmissionMeta = {}): boolean =>
    admitSound(event, chest(), time, { ...meta, listenerRelative: meta.listenerRelative ?? true, player: true });
  const queue = new HandlingQueue(
    inventory,
    (move) =>
      options.audio.onMoveStart?.(
        move,
        move.from.kind === 'pocket' ? inventory.locate(move.from.owner) : undefined,
        chest(),
        sim.time,
      ),
    (move) => options.audio.onMoveComplete?.(move, sim.time),
  );

  const firearms = new FirearmMechanics(inventory, queue, {
    blockSize: s,
    isSolid,
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
    onTrajectory: (trajectory, time) => options.onFirearmTrajectory?.(trajectory, time),
    firearmsSkillLevel: () => firearmsSkillLevel(character),
    firearmsSkillZeroHandling: () => currentFirearmsCombatTuning().skillZeroHandling,
    onCommittedShot: (shotSeed, recoilKickRadians, shotKind, firearmUid) => {
      const training = skillActivityPractice(registry, 'firearms_combat', 'shot');
      character.awardPractice('firearms_combat', training.practice, training.tier);
      const tuning = sessionFirearmsTuning(firearms, currentFirearmsCombatTuning(), firearmUid);
      aim.recordShot(
        shotSeed,
        recoilKickRadians,
        firearmsSkillEffects(firearmsSkillLevel(character), tuning, shotKind).recoilKickScale,
      );
    },
    onShot: (shot, time, firearm) => {
      const hits = zombieSystem.firePellets(shot);
      if (hits > 0 && firearmReadyWalking) {
        const training = skillActivityPractice(registry, 'firearms_combat', 'hit');
        character.awardPractice('firearms_combat', training.practice, training.tier);
      }
      // Other firearms' shot sounds are the player's presentation cue (play.ts, `firearmShotSound`).
      if (registry.items.get(firearm.type)?.firearm?.pump) {
        playPlayerSound('shotgun_blast', time, { sourceLabel: 'pump shotgun' });
      }
    },
    onSound: (event, position, time) =>
      position ? playWorldSound(event, position, time) : playPlayerSound(event, time),
  });

  const magazines = new MagazineHandling(inventory, queue, {
    feet,
    reloadFactor: () =>
      firearmsSkillEffects(firearmsSkillLevel(character), currentFirearmsCombatTuning()).reloadDuration,
    onSound: (event, time) => playPlayerSound(event, time),
  });

  const survival = new Survival(sim, inventory, queue, {
    reach,
    feet: () => ({ kind: 'pile', pos: feet() }),
    notice: options.notice,
    read: options.onRead,
  });
  sim.actions.craft = craftActionHooks(inventory, character, reach, feet);
  sim.actions.reading = bookReadingHooks(inventory, character);
  sim.actions.treatment = playerTreatmentHooks(inventory, sim);
  const rest = new RestController(sim, {
    furniture: (uid) => {
      const entity = entities.byUid(uid);
      const restDef = entity && entities.defOf(entity).rest;
      return restDef ? { quality: restDef.quality, sleepable: restDef.sleep === true } : undefined;
    },
    withinReach: (uid) => {
      const entity = entities.byUid(uid);
      return entity !== undefined && inventory.canReachEntity(entity);
    },
    notice: options.notice,
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
      crouching,
      senseTuning.crouch.eyeDropMetres,
    );
  let footstepClock = savedFootstepClock;
  let rustleClock = restoredRustleClock;
  let airbornePeakY = restoredAirbornePeakY;
  const currentIntent = (): MoveIntent => {
    const input = sampledInput();
    return input.active && !input.inputLocked ? input.intent : IDLE;
  };
  const playerCrouching = (): boolean => crouching;
  const playerMovement = (): PlayerMovement =>
    playerMovementForIntent(movementIntent(sim.body.actionRefusal, currentIntent()), crouching, sprinting);
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
      aimSway: sim.body.consequences.aimSway,
      firing,
      stridePhase: footstepClock.stridePhase,
      stepIndex: footstepClock.stepIndex,
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
      if (!wasGrounded && airbornePeakY !== undefined && isHardLanding((airbornePeakY - body.pos[1]) * s)) {
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
    const footsteps = advanceFootsteps(footstepClock, travelled > 0 ? playerMovement() : 'still', travelled);
    footstepClock = footsteps.clock;
    for (let i = 0; i < footsteps.steps; i++) {
      const [x, y, z] = feet();
      const surface = registry.blocks[world.getBlock(x, y - 1, z)]?.id ?? 'unknown';
      playPlayerSound(footstepEventForBlock(surface), time);
    }
  };
  const playerSense = () => {
    const { yaw } = sampledInput();
    const eyeHeightMetres = playerEyeHeightMetres();
    const hour = hourOfDay(sim.calendar);
    const lightSources = [...inventory.items()]
      .map(({ item, location, path }) =>
        lightSenseSourceFor({
          registry,
          item,
          location,
          path,
          playerPosition: body.pos,
          eyeHeightMetres,
        }),
      )
      .filter((source) => source !== undefined)
      .map((source) => ({
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
      crouching: playerCrouching(),
      vocalNoise:
        playerAudio.vocalNoise && sim.time <= playerAudio.vocalNoise.expiresAt ? playerAudio.vocalNoise : undefined,
      lit: carriedLight !== undefined,
      lightSeenFrom: carriedLight?.seenFrom ?? 40,
      eyeHeightMetres,
      lightHeightMetres: eyeHeightMetres,
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
  const zombieSystem = new ZombieSystem({
    store: zombieStore,
    seed: sim.seed,
    isLoaded: zombieReadinessFor(options),
    terrainFloor: options.terrainFloor,
    isSolid,
    isOpaque: options.isOpaque,
    blockSize: s,
    physics,
    // Metres per second, as PLAYER.jump is: the system divides by blockSize itself.
    jumpSpeed: PLAYER.jump,
    tuning: senseTuning,
    player: playerSense,
    hour: () => hourOfDay(sim.calendar),
    isSunExposedAt,
    hurtPlayer: (amount, area, attacker) => {
      if (
        controls.blocking?.() &&
        meleeCombatTuning !== undefined &&
        blocksAttack(
          character.skills.melee_combat ?? SKILL_LEVEL_MIN,
          sim.rng(`block:${attacker}:${sim.time}`).next(),
          meleeCombatTuning,
        )
      ) {
        const training = skillActivityPractice(registry, 'melee_combat', 'block');
        character.awardPractice('melee_combat', training.practice, training.tier);
        return;
      }
      wearOnPlayerHit(inventory, area);
      const legSide = sim.rng(`player-leg-hit:${sim.time}`).int(0, 1) === 0 ? 'leftLeg' : 'rightLeg';
      const region =
        area === 'legs'
          ? bodyRegionForHitArea('legs', legSide)
          : bodyRegionForHitArea(area === 'head' ? 'head' : 'torso');
      const attackerType = zombieStore.get(attacker)?.type.name.toLowerCase() ?? 'zombie';
      sim.hit(amount, `a ${attackerType}`, region, { bleeding: true, blunt: true });
    },
    onSound: (event, position, zombie) => {
      if (event === 'melee_swing' || event === 'melee_hit' || event === 'melee_hit_fist') {
        playWorldSound(event, position, sim.time, {
          listenerRelative: true,
          sourceLabel: 'player melee',
          ...(zombie ? { body: zombieFigure(zombie.type.model, zombie.figureSeed).realized.body } : {}),
        });
        return;
      }
      playWorldSound(
        event,
        position,
        sim.time,
        zombie ? { body: zombieFigure(zombie.type.model, zombie.figureSeed).realized.body } : {},
      );
    },
    onFootstep: (position, id, mode, zombie) => {
      const event = shamblerFootstepEventAt(position, (x, y, z) => {
        const block = world.getBlock(x, y, z);
        return registry.blocks[block]?.id ?? 'unknown';
      });
      playWorldSound(event, position, sim.time, {
        sourceLabel: `${zombie.type.name.toLowerCase()} #${id} · ${mode}`,
        body: zombieFigure(zombie.type.model, zombie.figureSeed).realized.body,
      });
    },
    onSevered: (zombie, region) => {
      const pos: Vec3 = [
        Math.floor(zombie.body.pos[0]),
        Math.floor(zombie.body.pos[1]),
        Math.floor(zombie.body.pos[2]),
      ];
      inventory.add(inventory.create(SEVERED_ITEM[region]), { kind: 'pile', pos });
    },
    onSever: (id, zombie, part, hit) => options.zombieEffects?.onSever?.(id, zombie, part, hit),
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
        for (const drop of rollLoot(registry, table, sim.rng(`zombie-loot:${zombie.body.pos.join(',')}`))) {
          inventory.add(inventory.create(drop.type, drop.count, drop.condition), { kind: 'pile', pos });
        }
      }
      options.zombieEffects?.onDeath?.(id, zombie);
    },
  });
  const playerCombat = new PlayerCombat(zombieSystem, (uid) => wearMeleeWeaponOnHit(inventory, uid), character);
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
    controls.heldDominantUse?.(
      sim.time,
      moving && Boolean(intent.useDominant),
      moving && Boolean(intent.useDominantHeld),
    );
    if (!moving) {
      return;
    }
    if (intent.useDominant) {
      controls.useDominant?.();
    }
    if (intent.useOff) {
      controls.useOff?.();
    }
  };
  sim.scheduler.register({
    id: 'zombies',
    rate: ZOMBIE_RATE,
    tick: (dt, time) => {
      spawner.advance({ calendar: sim.calendar, registry, zombies: zombieSystem });
      zombieSystem.tickActive(dt, time, heldItemUids());
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

  const advancePlayerBody = (dt: number, time: number, pacedIntent: MoveIntent): void => {
    const wasGrounded = body.onGround;
    const previousPosition: Vec3 = [...body.pos];
    const jumpStarted = pacedIntent.jump && wasGrounded;
    steer(body, scale, sampledInput().yaw, pacedIntent);
    if (jumpStarted) {
      playPlayerSound('player_strain', time);
    }
    const zombieBodies = [...zombieStore.entries()].map(([, zombie]) => zombie.body);
    stepBody(body, dt, isSolid, { ...physics, obstacles: zombieBodies });
    updatePlayerSounds(wasGrounded, previousPosition, time);
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
    const readyInput = moving && Boolean(heldFirearm && controls.readyHeld?.() && firearmsCombatTuning);
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
      const training = skillActivityPracticeRate(registry, 'firearms_combat', 'readying');
      character.awardPractice('firearms_combat', dt * training.practicePerSecond, training.tier);
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
    const moving = playerInput.active && !playerInput.inputLocked && !sim.body.actionRefusal;
    const intent = moving ? playerInput.intent : IDLE;
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
    sprinting =
      !crouching &&
      intent.sprint &&
      (intent.forward !== 0 || intent.right !== 0) &&
      !handling &&
      !readyGait &&
      canSprint(sim.needs, sprinting);
    survival.setSprinting(sprinting);
    stepStamina(sim.needs, dt, sprinting, bodyTuning.staminaRegenDelaySimSeconds);
    const readyMovementFactor = readyGait
      ? firearmStanceEffects(firearmsSkillLevel(character), currentFirearmsCombatTuning()).readyMovementFactor
      : 1;
    const pacedIntent = movementPace(
      { ...intent, sprint: sprinting, crouch: crouching },
      {
        grams: inventory.carriedWeight(),
        handling,
        readyMovementFactor,
        movementSpeed: sim.body.consequences.movementSpeed,
        crouchSpeed: senseTuning.crouch.speedMetresPerSimSecond,
      },
    );
    const tools = debug?.();
    if (tools?.noclip) {
      footstepClock = advanceFootsteps(footstepClock, 'still', 0).clock;
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
      if (isFirearmTrainingAction(job)) {
        const training = skillActivityPractice(registry, 'firearms_combat', 'handling');
        character.awardPractice('firearms_combat', training.practice, training.tier);
      }
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
    others: () => [...zombieStore.entries()].map(([, zombie]) => zombie.body),
    playWorldSound: (event, position) => {
      const noise = registry.sounds.get(event)?.noise;
      playWorldSound(event, position, sim.time, noise?.enabled ? { noiseRadiusMetres: noise.radiusMetres } : {});
    },
  });
  sim.actions.prying = {
    validate: (entityUid, toolUid) => {
      const entity = entities.byUid(entityUid);
      if (!entity) {
        return 'The door is no longer there';
      }
      const plan = pryPlan(inventory, entity, toolUid, character);
      return plan.ok ? undefined : plan.reason;
    },
    strike: (_entityUid, _toolUid, time) => playPlayerSound('lock_pry', time, { sourceLabel: 'prying padlock' }),
    finish: (entityUid, toolUid) => {
      const entity = entities.byUid(entityUid);
      if (!entity) {
        return 'The door is no longer there';
      }
      const plan = pryPlan(inventory, entity, toolUid, character);
      return plan.ok ? entities.breakLock(entity) : plan.reason;
    },
  };

  if (restored) {
    world.restoreDiffs(restored.world.diffs, (id) => {
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

  return {
    sim,
    inventory,
    entities,
    queue,
    firearms,
    magazines,
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
    pryDoor: (entity: BlockEntity, toolUid?: number) => {
      const plan = pryPlan(inventory, entity, toolUid, character);
      return plan.ok ? sim.actions.beginPrying(entity.uid, plan.tool.uid, plan.time, plan.strikeInterval) : plan.reason;
    },
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
    /** The player's noise state; saved with the character. */
    playerAudio,
    worldDiffs: () => world.snapshotDiffs((id) => registry.blocks[id]!.id),
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
    get crouching() {
      return crouching;
    },
    get playerEyeHeightMetres() {
      return playerEyeHeightMetres();
    },
    /** Furniture (with its loot) and spawns arrive with their column; saved state makes revisits idempotent. */
    onColumn: (cx: number, cz: number, site: Site | undefined) => {
      for (const { spec, loot } of site?.furnitureIn(cx, cz) ?? []) {
        inventory.furnish(spec, loot);
      }
      if (site) {
        spawner.onColumn({ cx, cz, site, registry, zombies: zombieSystem });
      }
    },
    onColumnUnload: (cx: number, cz: number): void => spawner.unloadColumn(cx, cz),
    /** Queues a search of a container, unless one is queued or done. */
    search: (entity: BlockEntity): string | undefined => {
      if (entity.searched || searching.has(entity)) {
        return undefined;
      }
      searching.add(entity);
      queue.enqueueAction('furniture.search', `Search the ${nameOf(entity)}`, searchTime(entities.defOf(entity)), {
        entityUid: entity.uid,
      });
      return undefined;
    },
    /** F's gaze/occlusion selection is in play; admission shares Search's live furniture reach. */
    readFurniture: (entity: BlockEntity): string | undefined => {
      if (entities.byUid(entity.uid) !== entity) {
        return 'It is no longer there';
      }
      if (!inventory.canReachEntity(entity)) {
        return 'Too far away';
      }
      const { readable } = entities.defOf(entity);
      if (!readable) {
        return 'Nothing to read';
      }
      options.onRead(readable);
      return undefined;
    },
    searching: (entity: BlockEntity): boolean => searching.has(entity),
    nameOf,
    /** Advances an explicit Sim-time step (through rest, if any) and the player's own sounds. */
    frame: (dt: number, until?: number): void => {
      crouching = nextCrouchState(controls.consumeCrouchToggle?.() ?? false, debug?.()?.noclip ?? false, crouching);
      rest.frame(dt, until);
      for (const event of audioEvents.read()) {
        if (event.kind === 'damage') {
          playPlayerSound(event.amount >= 15 ? 'player_hurt_heavy' : 'player_hurt_light', event.time);
        }
      }
    },
    frameReplay: (realSeconds: number): void => {
      crouching = nextCrouchState(controls.consumeCrouchToggle?.() ?? false, debug?.()?.noclip ?? false, crouching);
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
        world,
        blockContentId: (id) => registry.blocks[id]!.id,
        inventory,
        character,
        simulation: sim,
        player: snapshotPlayer(body, {
          yaw: controls.yaw(),
          pitch: controls.pitch(),
          walk: controls.walking(),
          crouching,
          sprinting,
          firearmReadyWalking,
          handlingPausedForKnockout,
        }),
        aim,
        survival,
        quickbar: quickbar.snapshotState(inventory),
        zombies: zombieSystem,
        playerCombat,
        spawner,
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
