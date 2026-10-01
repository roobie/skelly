// The simulation half of a play session, without the DOM: the clock and scheduler, the
// player's body, inventory, needs, rest, the shamblers and their spawns. `startPlay`
// (the game) and the snapshot tests build the same object from here, so what a save
// captures is what the game runs. Sounds, notices and debug tools reach in through
// callbacks; nothing here draws or listens.

import { type BlockEntity, searchTime } from '../core/blockEntities.ts';
import { CLOCK_RATIO, hourOfDay } from '../core/clock.ts';
import type { Registry } from '../core/content.ts';
import type { Vec3 } from '../core/coords.ts';
import { type EntityId, MapEntityStore } from '../core/entities.ts';
import {
  advanceFootsteps,
  footstepEventForBlock,
  initialFootstepClock,
  isHardLanding,
  shamblerFootstepEventAt,
} from '../core/footsteps.ts';
import { HandlingQueue } from '../core/handling.ts';
import { Inventory } from '../core/inventory.ts';
import { rollLoot } from '../core/loot.ts';
import { canSprint, stepStamina } from '../core/needs.ts';
import { type Body, stepBody } from '../core/physics.ts';
import type { SolidAt } from '../core/raycast.ts';
import { restorePlayerAudioState, type SaveSnapshot, snapshotSession } from '../core/saveState.ts';
import type { Scale } from '../core/scale.ts';
import { Simulation } from '../core/sim.ts';
import type { Site } from '../core/site.ts';
import type { SoundEventId } from '../core/soundEvents.ts';
import type { SoundPickerState } from '../core/soundPicker.ts';
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

/** Metres: how far away you can loot a pile or furniture. */
export const LOOT_REACH = 2;
/** Metres above the feet that reach to furniture is measured from. */
export const CHEST = 1;
const PHYSICS_RATE = 60;
const ZOMBIE_RATE = 20;
const HANDLING_RATE = 20;
/** Seconds a player's noise stays audible to shamblers. */
const VOCAL_NOISE_LIFETIME = 0.5;
export const IDLE: MoveIntent = { forward: 0, right: 0, jump: false, sprint: false, walk: false };

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
  /** Returns whether the sound actually played: that gates the noise it makes for shamblers. */
  play: (
    event: SoundEventId,
    position: Vec3,
    time: number,
    meta: { emittedAsNoise?: boolean; sourceLabel?: string | null },
  ) => boolean;
  snapshotState: () => Readonly<SoundPickerState>;
  restoreState: (state: SoundPickerState) => void;
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
  scale: Scale;
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

  const inventory = restored
    ? Inventory.restoreState(registry, restored.character.inventory, options.entities)
    : new Inventory(registry, undefined, options.entities);
  const { entities } = inventory;
  const quickbar = new Quickbar();
  const spawner = new ZombieSpawner();
  const zombieStore = new MapEntityStore<Zombie>();

  /** The air block at the player's feet, where drops land. */
  const feet = (): Vec3 => [Math.floor(body.pos[0]), Math.floor(body.pos[1] + 0.01), Math.floor(body.pos[2])];
  /** Metres from the player's feet to the middle of a pile's block. */
  const pileDistance = (pos: Vec3) =>
    Math.hypot(pos[0] + 0.5 - body.pos[0], pos[1] - body.pos[1], pos[2] + 0.5 - body.pos[2]) * s;
  const chest = (): Vec3 => [body.pos[0], body.pos[1] + CHEST / s, body.pos[2]];
  /** Metres from the player's chest to the nearest part of a piece of furniture. */
  const entityDistance = (entity: BlockEntity) => entities.distance(entity, chest()) * s;
  inventory.canReach = (pos) => pileDistance(pos) <= LOOT_REACH;
  inventory.canReachEntity = (entity) => entityDistance(entity) <= LOOT_REACH;

  const sim = new Simulation({
    seed,
    clock: { ratio: CLOCK_RATIO, start: options.start },
    unsafe: () => debug?.()?.dangerReason() ?? zombieSystem.unsafeReason(),
    restRate: () => rest.action?.rate,
  });
  const { compression } = sim;
  const audioEvents = sim.events.reader();

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
    audio.restoreState(structuredClone(saved.soundPicker) as SoundPickerState);
  }

  const playWorldSound = (
    event: SoundEventId,
    position: Vec3,
    time = sim.time,
    meta: { emittedAsNoise?: boolean; sourceLabel?: string | null } = {},
  ): boolean => audio.play(event, position, time, meta);
  const playPlayerSound = (event: SoundEventId, time = sim.time): boolean => {
    const position = chest();
    const definition = registry.sounds.get(event);
    const emittedAsNoise = definition?.noise.enabled ?? false;
    if (!playWorldSound(event, position, time, { emittedAsNoise })) {
      return false;
    }
    if (definition?.noise.enabled) {
      playerAudio.vocalNoiseId += 1;
      playerAudio.vocalNoise = {
        id: playerAudio.vocalNoiseId,
        pos: position,
        radiusMetres: definition.noise.radiusMetres,
        expiresAt: time + VOCAL_NOISE_LIFETIME,
      };
    }
    return true;
  };
  const queue = new HandlingQueue(
    inventory,
    ({ from, target }) => {
      if (from?.kind === 'pocket') {
        const location = inventory.locate(from.owner);
        if (
          location?.kind === 'worn' &&
          !(target.kind === 'pocket' && target.owner === from.owner && target.pocket === from.pocket)
        ) {
          playWorldSound('pouch_take', chest());
        }
      }
    },
    ({ from, target }) => {
      if (target.kind === 'pile') {
        const samePile = from?.kind === 'pile' && from.pile.pos.every((v, i) => v === target.pos[i]);
        if (!samePile) {
          const [x, y, z] = target.pos;
          playWorldSound('item_drop_wood', [(x + 0.5) * s, y * s, (z + 0.5) * s]);
        }
      }
    },
  );

  const survival = new Survival(sim, inventory, queue, {
    feet: () => ({ kind: 'pile', pos: feet() }),
    notice: options.notice,
  });
  const rest = new RestController(sim, {
    bedQuality: () => {
      const bed = entities.bedNear(chest(), LOOT_REACH / s);
      return bed ? entities.defOf(bed).bed!.quality : undefined;
    },
    notice: options.notice,
  });

  let sprinting = false;
  let footstepClock = initialFootstepClock();
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
  const zombieSystem = new ZombieSystem({
    store: zombieStore,
    seed: sim.seed,
    isSolid,
    blockSize: s,
    physics,
    // Metres per second, as PLAYER.jump is: the system divides by blockSize itself.
    jumpSpeed: PLAYER.jump,
    player: playerSense,
    hour: () => hourOfDay(sim.calendar),
    hurtPlayer: (amount) => sim.hurt(amount, 'a shambler'),
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
  let lastZombieStep = 0;
  sim.scheduler.register({
    id: 'zombies',
    rate: ZOMBIE_RATE,
    tick: (dt, time) => {
      zombieSystem.tick(dt, time);
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
      if (!options.ready(body.pos[0], body.pos[2])) {
        return;
      }
      const moving = controls.active() && !compression.locksInput;
      const intent = moving ? controls.intent() : IDLE;
      const handling = queue.busy;
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
      for (const { job, reason } of queue.tick(dt).failed) {
        options.notice(`${job.label}: ${reason.toLowerCase()}`);
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
    entities,
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
    spawner.restoreState(restored.world.spawned);
    sim.restoreState(restored.character.simulation);
    rest.restoreState(restored.character.rest);
    survival.restoreState(restored.character.lightUid === null ? {} : { litUid: restored.character.lightUid });
    quickbar.restoreState(restored.character.quickbar, inventory);
  }

  return {
    sim,
    inventory,
    entities,
    queue,
    quickbar,
    survival,
    rest,
    zombies: zombieSystem,
    zombieStore,
    spawner,
    body,
    /** Set when the session was restored: the view direction to hand back to the input. */
    restoredLook,
    /** The player's noise state; saved with the character. */
    playerAudio,
    feet,
    chest,
    pileDistance,
    entityDistance,
    playWorldSound,
    playPlayerSound,
    /** Time of the last shambler step, for render interpolation. */
    get lastZombieStep() {
      return lastZombieStep;
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
        simulation: sim,
        player: snapshotPlayer(body, controls.yaw(), controls.pitch(), controls.walking()),
        rest,
        survival,
        quickbar: quickbar.snapshotState(),
        zombies: zombieSystem,
        spawner,
        handling: queue,
        vocalNoiseId: playerAudio.vocalNoiseId,
        vocalNoise: playerAudio.vocalNoise,
        audio,
      }),
  };
};

export type Session = ReturnType<typeof createSession>;
