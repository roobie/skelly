// The simulation half of a play session, without the DOM: the clock and scheduler, the
// player's body, inventory, needs, rest, the shamblers and their spawns. `startPlay`
// (the game) and the snapshot tests build the same object from here, so what a save
// captures is what the game runs. Sounds, notices and debug tools reach in through
// callbacks; nothing here draws or listens.

import { type BlockEntity, searchTime } from '../core/blockEntities.ts';
import { Character } from '../core/character.ts';
import { CLOCK_RATIO, hourOfDay } from '../core/clock.ts';
import type { RecipeDef, Registry } from '../core/content.ts';
import type { Vec3 } from '../core/coords.ts';
import { CraftCommands } from '../core/craftCommands.ts';
import { type CraftPreference, planCraft } from '../core/crafting.ts';
import { craftActionHooks } from '../core/craftWork.ts';
import { type EntityId, MapEntityStore } from '../core/entities.ts';
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
import { rollLoot } from '../core/loot.ts';
import { canSprint, stepStamina } from '../core/needs.ts';
import { type Body, CONTACT_SKIN, stepBody } from '../core/physics.ts';
import { PlayerCombat } from '../core/playerCombat.ts';
import type { SolidAt } from '../core/raycast.ts';
import {
  bindReach,
  pileDistance as distanceToPile,
  furnitureDistance,
  INVENTORY_CHEST,
  INVENTORY_REACH,
} from '../core/reach.ts';
import type { Readable } from '../core/readable.ts';
import { restorePlayerAudioState, type SaveSnapshot, snapshotSession } from '../core/saveState.ts';
import type { Scale } from '../core/scale.ts';
import { Simulation } from '../core/sim.ts';
import type { Site } from '../core/site.ts';
import { freezeSnapshot } from '../core/snapshotData.ts';
import type { SoundEventId } from '../core/soundEvents.ts';
import { type SoundEmission, type SoundEmissionMeta, SoundPicker } from '../core/soundPicker.ts';
import { wearMeleeWeaponOnHit, wearOnPlayerHit } from '../core/wear.ts';
import type { World } from '../core/world.ts';
import type { ZombieRegion } from '../core/zombieRegions.ts';
import { ZombieSpawner } from '../core/zombieSpawns.ts';
import {
  type HitImpulse,
  type MeleeResult,
  type PlayerMovement,
  type VocalNoise,
  type Zombie,
  ZombieSystem,
} from '../core/zombies.ts';
import type { DebugNoclipStep } from './debugInterface.ts';
import { registerDoorAction } from './doorAction.ts';
import { FirearmMechanics, type FirearmShotEffect } from './firearmHandling.ts';
import {
  createPlayerBody,
  type MoveIntent,
  PLAYER,
  paceFactor,
  physicsFor,
  restorePlayer,
  snapshotPlayer,
  steer,
} from './player.ts';
import { Quickbar } from './quickbar.ts';
import { RestController } from './rest.ts';
import { Survival } from './survival.ts';

const PHYSICS_RATE = 60;
const ZOMBIE_RATE = 20;
const HANDLING_RATE = 20;
/** Seconds a player's noise stays audible to shamblers. */
const VOCAL_NOISE_LIFETIME = 0.5;
export const IDLE: MoveIntent = { forward: 0, right: 0, jump: false, sprint: false, walk: false, useDominant: false };

/** The item a severed shambler region leaves behind. */
export const SEVERED_ITEM: Readonly<Record<Exclude<ZombieRegion, 'head'>, string>> = {
  torso: 'shambler_torso',
  leftArm: 'shambler_left_arm',
  rightArm: 'shambler_right_arm',
  leftLeg: 'shambler_left_leg',
  rightLeg: 'shambler_right_leg',
};

/** What the player is doing with the keyboard and mouse, read each tick. */
export interface SessionControls {
  /** True when input reaches the world: the pointer is locked and no menu has it. */
  active: () => boolean;
  intent: () => MoveIntent;
  /** Clears edge-triggered intents after the player tick samples them. */
  consumeDominantUse?: () => void;
  consumeOffUse?: () => void;
  /** Runs dominant use on the player-tick boundary, with that tick's aim/state. */
  useDominant?: () => void;
  /** Held-trigger sampling, including release/inactive ticks, for debug firearm cadence. */
  heldDominantUse?: (time: number, pressed: boolean, held: boolean) => void;
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
export interface SessionDebug {
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
  /** Whether the world under (x, z), in blocks, is loaded enough to stand on. */
  ready: (x: number, z: number) => boolean;
  controls: SessionControls;
  audio: SessionAudio;
  /** A message that isn't an interruption, such as why a move was refused. */
  notice: (text: string) => void;
  /** Authored text selected by a live domain command; presentation owns its view. */
  onRead: (readable: Readonly<Readable>) => void;
  /** Observational hook for actual handling completion/failure outcomes. */
  onHandlingOutcomes?: (result: TickResult) => void;
  /** Output only, called after the simulation has committed the case transition. */
  onFirearmEjection?: (effect: FirearmShotEffect) => void;
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
export interface RestoredLook {
  yaw: number;
  pitch: number;
  walk: boolean;
}

export const createSession = (options: SessionOptions) => {
  const { registry, world, isSolid, scale, seed, controls, audio, debug } = options;
  const s = scale.blockSize;
  const physics = physicsFor(scale);
  const restored = options.restore;

  const restoredPlayer = restored ? restorePlayer(restored.character.player) : undefined;
  const body: Body =
    restoredPlayer?.body ?? createPlayerBody(scale, options.spawn[0], options.spawn[1], options.spawn[2]);
  const restoredLook: RestoredLook | undefined = restoredPlayer && {
    yaw: restoredPlayer.yaw,
    pitch: restoredPlayer.pitch,
    walk: restoredPlayer.walk,
  };

  const character = restored
    ? Character.restoreState(registry, restored.character.progression)
    : new Character(registry, { handedness: options.handedness });
  const inventory = restored
    ? Inventory.restoreState(registry, restored.character.inventory, options.entities, character)
    : new Inventory(registry, undefined, options.entities, character);
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

  const sim = new Simulation({
    seed,
    clock: { ratio: CLOCK_RATIO, start: options.start },
    unsafe: () => debug?.()?.dangerReason() ?? zombieSystem.unsafeReason(),
    restRate: () => sim.actions.restRate,
  });
  const { compression } = sim;
  const audioEvents = sim.events.reader();
  const soundPicker = new SoundPicker(seed, registry.sounds);

  // The player's own noise, which shamblers can hear. Saved with the character.
  const playerAudio: { vocalNoiseId: number; vocalNoise: VocalNoise | undefined } = {
    vocalNoiseId: 0,
    vocalNoise: undefined,
  };
  if (restored) {
    const saved = restorePlayerAudioState(restored.character.playerAudio);
    playerAudio.vocalNoiseId = saved.vocalNoiseId;
    playerAudio.vocalNoise =
      saved.vocalNoise === null ? undefined : { ...saved.vocalNoise, pos: [...saved.vocalNoise.pos] };
    soundPicker.restoreState(structuredClone(saved.soundPicker));
  }

  const admitSound = (
    event: SoundEventId,
    position: Vec3,
    time: number,
    { player, sourceLabel = null, listenerRelative = false }: SoundEmissionMeta & { player: boolean },
  ): boolean => {
    const pick = soundPicker.pick(event, time);
    if (!pick) {
      return false;
    }
    const definition = registry.sounds.get(event)!;
    const emittedAsNoise = player && definition.noise.enabled;
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
    if (emittedAsNoise) {
      playerAudio.vocalNoiseId += 1;
      playerAudio.vocalNoise = {
        id: playerAudio.vocalNoiseId,
        pos: [...position],
        radiusMetres: definition.noise.radiusMetres,
        expiresAt: time + VOCAL_NOISE_LIFETIME,
      };
    }
    sim.events.emit({ kind: 'sound', ...sound });
    if (emittedAsNoise) {
      const { id, pos, radiusMetres, expiresAt } = playerAudio.vocalNoise!;
      sim.events.emit({ kind: 'noise', event, position: [...pos], time, id, radiusMetres, expiresAt });
    }
    audio.play(sound);
    return true;
  };
  const playWorldSound = (
    event: SoundEventId,
    position: Vec3,
    time = sim.time,
    meta: SoundEmissionMeta = {},
  ): boolean => admitSound(event, position, time, { ...meta, player: false });
  const playPlayerSound = (event: SoundEventId, time = sim.time, meta: SoundEmissionMeta = {}): boolean =>
    admitSound(event, chest(), time, { ...meta, player: true });
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
    pose: (uid) =>
      inventory.hands.right?.uid === uid || inventory.hands.left?.uid === uid
        ? {
            feet: feet(),
            eye: [body.pos[0], body.pos[1] + PLAYER.eye / s, body.pos[2]],
            yaw: controls.yaw(),
            pitch: controls.pitch(),
            blockSize: s,
          }
        : undefined,
    onEjection: (effect) => options.onFirearmEjection?.(effect),
    onShot: (shot, time) => {
      zombieSystem.firePellets(shot);
      playPlayerSound('shotgun_blast', time, { listenerRelative: true, sourceLabel: 'pump shotgun' });
    },
    onSound: (event, position, time) =>
      position ? playWorldSound(event, position, time) : playPlayerSound(event, time, { listenerRelative: true }),
  });

  const survival = new Survival(sim, inventory, queue, {
    reach,
    feet: () => ({ kind: 'pile', pos: feet() }),
    notice: options.notice,
    read: options.onRead,
  });
  sim.actions.craft = craftActionHooks(inventory, character, reach, feet);
  const rest = new RestController(sim, {
    bedQuality: () => {
      const bed = entities.bedNear(chest(), INVENTORY_REACH / s);
      return bed ? entities.defOf(bed).bed!.quality : undefined;
    },
    notice: options.notice,
  });

  let sprinting = false;
  let footstepClock = initialFootstepClock();
  let rustleClock = initialRustleClock();
  let airbornePeakY: number | undefined;
  const playerMovement = (): PlayerMovement => {
    const moving = controls.active() && !compression.locksInput ? controls.intent() : IDLE;
    if (moving.forward === 0 && moving.right === 0) {
      return 'still';
    }
    if (sprinting) {
      return 'sprinting';
    }
    return moving.walk ? 'walking' : 'jogging';
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
    const yaw = controls.yaw();
    return {
      pos: [body.pos[0], body.pos[1], body.pos[2]] as Vec3,
      body: debug?.()?.noclip ? undefined : body,
      facing: [-Math.sin(yaw), 0, -Math.cos(yaw)] as Vec3,
      movement: playerMovement(),
      vocalNoise:
        playerAudio.vocalNoise && sim.time <= playerAudio.vocalNoise.expiresAt ? playerAudio.vocalNoise : undefined,
      lit: survival.lit?.on === true,
      lightSeenFrom: registry.items.get(survival.lit?.type ?? '')?.light?.seenFrom ?? 40,
    };
  };
  const heldItemUids = () => ({
    right: inventory.hands.right?.uid ?? null,
    left: inventory.hands.left?.uid ?? null,
  });
  const zombieSystem = new ZombieSystem({
    store: zombieStore,
    seed: sim.seed,
    isSolid,
    isOpaque: options.isOpaque,
    blockSize: s,
    physics,
    // Metres per second, as PLAYER.jump is: the system divides by blockSize itself.
    jumpSpeed: PLAYER.jump,
    player: playerSense,
    hour: () => hourOfDay(sim.calendar),
    hurtPlayer: (amount, area) => {
      wearOnPlayerHit(inventory, area);
      sim.hurt(amount, 'a shambler');
    },
    onSound: (event, position) => playWorldSound(event, position),
    onFootstep: (position, id, mode) => {
      const event = shamblerFootstepEventAt(position, (x, y, z) => {
        const block = world.getBlock(x, y, z);
        return registry.blocks[block]?.id ?? 'unknown';
      });
      playWorldSound(event, position, sim.time, { sourceLabel: `shambler #${id} · ${mode}` });
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
  let lastPlayerStep = 0;
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
      zombieSystem.tick(dt, time, heldItemUids());
      lastZombieStep = time;
    },
  });

  // The player is held still until there is ground under them. Inputs are locked
  // while time is compressed. Handling and a heavy load slow you down, and sprinting
  // spends stamina: once winded, you jog until you've got your breath back.
  sim.scheduler.register({
    id: 'player',
    rate: PHYSICS_RATE,
    tick: (dt, time) => {
      lastPlayerStep = time;
      const moving = controls.active() && !compression.locksInput;
      const intent = moving ? controls.intent() : IDLE;
      controls.consumeDominantUse?.();
      controls.consumeOffUse?.();
      playerCombat.tick(dt, heldItemUids());
      dispatchPlayerActions(moving, intent);
      if (!options.ready(body.pos[0], body.pos[2])) {
        return;
      }
      const handling = queue.busy || firearms.busy;
      const going = intent.forward !== 0 || intent.right !== 0;
      sprinting = intent.sprint && going && !handling && canSprint(sim.needs, sprinting);
      stepStamina(sim.needs, dt, sprinting);
      const pacedIntent = {
        ...intent,
        sprint: sprinting,
        pace: paceFactor(inventory.carriedWeight(), handling),
      };
      const tools = debug?.();
      if (tools?.noclip) {
        footstepClock = initialFootstepClock();
        airbornePeakY = undefined;
        tools.stepNoclip({
          body,
          scale,
          yaw: controls.yaw(),
          pitch: controls.pitch(),
          intent: pacedIntent,
          descend: controls.descending(),
          dt,
        });
        return;
      }
      const wasGrounded = body.onGround;
      const previousPosition: Vec3 = [...body.pos];
      const jumpStarted = pacedIntent.jump && wasGrounded;
      steer(body, scale, controls.yaw(), pacedIntent);
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
        admitSound(rustle.sound.event, rustle.sound.position, time, { player: true, sourceLabel: 'brushing foliage' });
      }
    },
  });

  sim.scheduler.register({
    id: 'handling',
    rate: HANDLING_RATE,
    tick: (dt) => {
      // Handling happens in real time; compressed time belongs to long actions.
      if (compression.c > 1) {
        return;
      }
      const result = queue.tick(dt);
      options.onHandlingOutcomes?.(result);
      for (const { job, reason } of result.failed) {
        options.notice(`${job.label}: ${reason.toLowerCase()}`);
      }
    },
  });

  sim.scheduler.register({ id: 'firearms', rate: PHYSICS_RATE, tick: (_dt, time) => firearms.advanceTo(time) });

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
    playWorldSound: (event, position) => playWorldSound(event, position),
  });

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
    quickbar,
    character,
    planCraft: (recipe: RecipeDef, prefer?: CraftPreference) => planCraft(recipe, reach(), character, prefer),
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
    get lastPlayerStep() {
      return lastPlayerStep;
    },
    get sprinting() {
      return sprinting;
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
    /**
     * One real-time frame: advances the simulation (through rest, if any) and the player's own
     * sounds. `until` caps the simulation time reached, for the debug time skip.
     */
    frame: (dt: number, until?: number): void => {
      rest.frame(dt, until);
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
        player: snapshotPlayer(body, controls.yaw(), controls.pitch(), controls.walking()),
        survival,
        quickbar: quickbar.snapshotState(inventory),
        zombies: zombieSystem,
        playerCombat,
        spawner,
        handling: queue,
        vocalNoiseId: playerAudio.vocalNoiseId,
        vocalNoise: playerAudio.vocalNoise,
        audio: soundPicker,
      }),
  };
};

export type Session = ReturnType<typeof createSession>;
