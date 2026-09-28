// Normal play: walk, look, loot, manage what you carry, eat, drink and light your way.
// The simulation core runs the clock, the player's physics, needs and the handling
// queue; Esc pauses it. When health runs out, the death screen offers a new world.

import { Vector3 } from 'three';
import assetManifest from '../content/base/assets/manifest.json' with { type: 'json' };
import { validateManifest } from '../core/assets.ts';
import { type BlockEntity, searchTime } from '../core/blockEntities.ts';
import { CLOCK_RATIO, formatClock, hourOfDay } from '../core/clock.ts';
import type { Vec3 } from '../core/coords.ts';
import { MapEntityStore } from '../core/entities.ts';
import {
  advanceFootsteps,
  footstepEventForBlock,
  initialFootstepClock,
  isHardLanding,
  shamblerFootstepEventAt,
} from '../core/footsteps.ts';
import { pickFurniture } from '../core/furniturePick.ts';
import { HandlingQueue } from '../core/handling.ts';
import { Inventory, type Pile } from '../core/inventory.ts';
import { chargeShare } from '../core/lights.ts';
import { rollLoot } from '../core/loot.ts';
import { canSprint, stepStamina } from '../core/needs.ts';
import { stepBody } from '../core/physics.ts';
import { Simulation } from '../core/sim.ts';
import { skyAt } from '../core/sky.ts';
import type { SoundEventId } from '../core/soundEvents.ts';
import { ZombieSpawner } from '../core/zombieSpawns.ts';
import { FISTS_MELEE, type PlayerMovement, type VocalNoise, type Zombie, ZombieSystem } from '../core/zombies.ts';
import { Flashlight } from '../render/flashlight.ts';
import { FurnitureMeshes } from '../render/furniture.ts';
import { HeldItems } from '../render/hands.ts';
import { ModelLibrary } from '../render/models.ts';
import { PileMeshes } from '../render/piles.ts';
import { PlayerMeshes } from '../render/playerFigure.ts';
import { applySky } from '../render/sky.ts';
import { StepOffset } from '../render/stepOffset.ts';
import { ZombieMeshes } from '../render/zombies.ts';
import { renderAudioOptions } from '../ui/audioOptions.ts';
import { mountCredits } from '../ui/credits.ts';
import { newWorldQuery, showDeath } from '../ui/death.ts';
import { mountGameCursor } from '../ui/gameCursor.ts';
import { Quickbar, quickbarKey, renderHandling, renderQuickbar } from '../ui/hud.ts';
import { hudVisibility, readHudOptions, renderHudOptions, writeHudOptions } from '../ui/hudOptions.ts';
import { InventoryScreen } from '../ui/inventoryScreen.ts';
import { renderRest } from '../ui/rest.ts';
import { GameAudio, type SoundPlaybackMeta } from './audio.ts';
import { cameraRotation, DamageFeedback } from './damageFeedback.ts';
import type { DebugModule, DebugRuntime } from './debugInterface.ts';
import { DOOR_ACTION, registerDoorAction } from './doorAction.ts';
import type { Engine } from './engine.ts';
import { Input, isMenuOpeningKey, KEY_BINDINGS, worldActionForKey } from './input.ts';
import { startingLoadout } from './loadout.ts';
import { createPlayerBody, PLAYER, paceFactor, physicsFor, steer } from './player.ts';
import { RestController, type RestKind } from './rest.ts';
import { Survival } from './survival.ts';
import { toHands } from './targets.ts';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const PHYSICS_RATE = 60;
const HANDLING_RATE = 20;
/** Metres: how far away you can loot a pile or furniture. */
const LOOT_REACH = 2;
/** Metres: how far away you can open a door or search a container you're looking at. */
const USE_REACH = 2;
/** Metres above the feet that reach to furniture is measured from. */
const CHEST = 1;
const QUICK_KEY = /^Digit([1-5])$/;
const IDLE = { forward: 0, right: 0, jump: false, sprint: false, walk: false };

export const startPlay = (engine: Engine, debugModule?: DebugModule): void => {
  const { config, registry, streamer, renderer, scene, camera, meshes } = engine;
  const { scale } = config;
  const s = scale.blockSize;
  const physics = physicsFor(scale);
  const eyeHeight = PLAYER.eye / s;

  const [sx, sy, sz] = engine.spawn.pos;
  const body = createPlayerBody(scale, sx / s, sy / s + 0.01, sz / s);
  const cameraStepOffset = new StepOffset(PLAYER.stepHeight);
  let playerGaitPhase = 0;
  const input = new Input(renderer.domElement);
  input.yaw = engine.spawn.yaw;
  let debugTools: DebugRuntime | undefined;

  /** The air block at the player's feet, where drops land. */
  const feet = (): Vec3 => [Math.floor(body.pos[0]), Math.floor(body.pos[1] + 0.01), Math.floor(body.pos[2])];
  /** Metres from the player's feet to the middle of a pile's block. */
  const pileDistance = (pos: Vec3) =>
    Math.hypot(pos[0] + 0.5 - body.pos[0], pos[1] - body.pos[1], pos[2] + 0.5 - body.pos[2]) * s;

  // ---- items ----

  const { entities } = engine;
  const inventory = new Inventory(registry, undefined, entities);
  let zombieSystem: ZombieSystem | undefined;
  const zombieSpawner = new ZombieSpawner();
  inventory.canReach = (pos) => pileDistance(pos) <= LOOT_REACH;
  const chest = (): Vec3 => [body.pos[0], body.pos[1] + CHEST / s, body.pos[2]];
  /** Metres from the player's chest to the nearest part of a piece of furniture. */
  const entityDistance = (entity: BlockEntity) => entities.distance(entity, chest()) * s;
  inventory.canReachEntity = (entity) => entityDistance(entity) <= LOOT_REACH;
  startingLoadout(inventory);
  // Furniture, with the loot rolled for it, arrives with its column.
  streamer.onColumn = (cx, cz) => {
    for (const { spec, loot } of engine.site?.furnitureIn(cx, cz) ?? []) {
      inventory.furnish(spec, loot);
    }
    if (engine.site && zombieSystem) {
      zombieSpawner.onColumn({ cx, cz, site: engine.site, registry, zombies: zombieSystem });
    }
  };
  const queue = new HandlingQueue(inventory);
  const quickbar = new Quickbar();
  const models = new ModelLibrary(registry, (message) => {
    const box = $('errors');
    box.textContent = [box.textContent, message].filter(Boolean).join('\n');
  });
  const playerPalette = registry.figures.get('player')!.palette;
  const piles = new PileMeshes(s, models);
  const furniture = new FurnitureMeshes(s);
  const playerMeshes = new PlayerMeshes(s, playerPalette);
  const held = new HeldItems(inventory, models, playerPalette);
  const flashlight = new Flashlight(scene);
  scene.add(piles.group, furniture.group, playerMeshes.group);

  // ---- simulation ----

  let rest: RestController | undefined;
  const sim = new Simulation({
    seed: config.seed,
    clock: { ratio: CLOCK_RATIO, start: config.start },
    unsafe: () => debugTools?.dangerReason() ?? zombieSystem?.unsafeReason(),
    restRate: () => rest?.action?.rate,
  });
  const { compression } = sim;
  const audioEvents = sim.events.reader();
  const damageEvents = sim.events.reader();
  const damageFeedback = new DamageFeedback();
  const audio = new GameAudio({
    registry,
    seed: sim.seed,
    blockSize: s,
    isSolid: engine.isSolid,
    report: (message) => {
      const errors = $('errors');
      errors.textContent = [errors.textContent, message].filter(Boolean).join('\n');
    },
  });
  document.addEventListener('pointerdown', () => audio.unlock(), { once: true });
  let vocalNoiseId = 0;
  let vocalNoise: VocalNoise | undefined;
  const playerSoundPosition = (): Vec3 => [body.pos[0], body.pos[1] + CHEST / s, body.pos[2]];
  const playWorldSound = (event: SoundEventId, position: Vec3, time = sim.time, metadata: SoundPlaybackMeta = {}) =>
    audio.play(event, position.map((value) => value * s) as Vec3, time, metadata);
  const playPlayerSound = (event: SoundEventId, time = sim.time) => {
    const position = playerSoundPosition();
    const definition = registry.sounds.get(event);
    const emittedAsNoise = definition?.noise.enabled ?? false;
    if (!playWorldSound(event, position, time, { emittedAsNoise })) {
      return;
    }
    if (definition?.noise.enabled) {
      vocalNoiseId += 1;
      vocalNoise = {
        id: vocalNoiseId,
        pos: position,
        radiusMetres: definition.noise.radiusMetres,
        expiresAt: time + 0.5,
      };
    }
  };
  const survival = new Survival(sim, inventory, queue, {
    feet: () => ({ kind: 'pile', pos: feet() }),
    notice: (text) => showNotice(text),
  });
  const zombieStore = new MapEntityStore<Zombie>();
  let sprinting = false;
  let footstepClock = initialFootstepClock();
  let airbornePeakY: number | undefined;
  const playerMovement = (): PlayerMovement => {
    const moving = input.locked && !input.menuPointer && !compression.locksInput ? input.intent() : IDLE;
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
      const surface = registry.blocks[engine.world.getBlock(x, y - 1, z)]?.id ?? 'unknown';
      playPlayerSound(footstepEventForBlock(surface), time);
    }
  };
  const playerSense = () => ({
    pos: [body.pos[0], body.pos[1], body.pos[2]] as Vec3,
    body: debugTools?.noclip ? undefined : body,
    facing: [-Math.sin(input.yaw), 0, -Math.cos(input.yaw)] as Vec3,
    movement: playerMovement(),
    vocalNoise: vocalNoise && sim.time <= vocalNoise.expiresAt ? vocalNoise : undefined,
    lit: survival.lit?.on === true,
    lightSeenFrom: registry.items.get(survival.lit?.type ?? '')?.light?.seenFrom ?? 40,
  });
  zombieSystem = new ZombieSystem({
    store: zombieStore,
    seed: sim.seed,
    isSolid: engine.isSolid,
    blockSize: s,
    physics,
    jumpSpeed: PLAYER.jump,
    player: playerSense,
    hour: () => hourOfDay(sim.calendar),
    hurtPlayer: (amount) => sim.hurt(amount, 'a shambler'),
    onSound: (event, position) => playWorldSound(event, position),
    onFootstep: (position, id, mode) => {
      const event = shamblerFootstepEventAt(position, (x, y, z) => {
        const block = engine.world.getBlock(x, y, z);
        return registry.blocks[block]?.id ?? 'unknown';
      });
      playWorldSound(event, position, sim.time, { sourceLabel: `shambler #${id} · ${mode}` });
    },
    onDeath: (zombie) => {
      const table = zombie.type.loot;
      if (!table) {
        return;
      }
      const pos: Vec3 = [
        Math.floor(zombie.body.pos[0]),
        Math.floor(zombie.body.pos[1]),
        Math.floor(zombie.body.pos[2]),
      ];
      for (const drop of rollLoot(registry, table, sim.rng(`zombie-loot:${zombie.body.pos.join(',')}`))) {
        inventory.add(inventory.create(drop.type, drop.count, drop.condition), { kind: 'pile', pos });
      }
    },
  });
  let lastZombieStep = 0;
  sim.scheduler.register({
    id: 'zombies',
    rate: 20,
    tick: (dt, time) => {
      zombieSystem?.tick(dt, time);
      lastZombieStep = time;
    },
  });
  const zombieMeshes = new ZombieMeshes(s);
  scene.add(zombieMeshes.group);

  // The player is held still until there is ground under them. Inputs are locked
  // while time is compressed. Handling and a heavy load slow you down, and sprinting
  // spends stamina: once winded, you jog until you've got your breath back.
  sim.scheduler.register({
    id: 'player',
    rate: PHYSICS_RATE,
    tick: (dt, time) => {
      if (!streamer.isReady(body.pos[0], body.pos[2])) {
        return;
      }
      const moving = input.locked && !input.menuPointer && !compression.locksInput;
      const intent = moving ? input.intent() : IDLE;
      const handling = queue.busy;
      const going = intent.forward !== 0 || intent.right !== 0;
      sprinting = intent.sprint && going && !handling && canSprint(sim.needs, sprinting);
      stepStamina(sim.needs, dt, sprinting);
      const pacedIntent = {
        ...intent,
        sprint: sprinting,
        pace: paceFactor(inventory.carriedWeight(), handling),
      };
      if (debugTools?.noclip) {
        footstepClock = initialFootstepClock();
        airbornePeakY = undefined;
        debugTools.stepNoclip({
          body,
          scale,
          yaw: input.yaw,
          pitch: input.pitch,
          intent: pacedIntent,
          descend: input.held.has('KeyR'),
          dt,
        });
        return;
      }
      const wasGrounded = body.onGround;
      const previousPosition: Vec3 = [...body.pos];
      const jumpStarted = pacedIntent.jump && wasGrounded;
      steer(body, scale, input.yaw, pacedIntent);
      if (jumpStarted) {
        playPlayerSound('player_strain', time);
      }
      const zombieBodies = [...zombieStore.entries()].map(([, zombie]) => zombie.body);
      stepBody(body, dt, engine.isSolid, { ...physics, obstacles: zombieBodies });
      updatePlayerSounds(wasGrounded, previousPosition, time);
    },
  });

  // ---- UI ----

  const overlay = $('overlay');
  const gameCursor = mountGameCursor($('game-cursor-root'));
  const inventoryPanel = $('inventory');
  const hud = $('hud');
  const inventoryStats = $('inventory-stats');
  const hudOptions = readHudOptions();
  const drawHudOptions = () =>
    renderHudOptions($('hud-options'), hudOptions, (key, value) => {
      hudOptions[key] = value;
      writeHudOptions(hudOptions);
      drawHudOptions();
    });
  drawHudOptions();
  const prompt = $('prompt');
  const quickbarBox = $('quickbar');
  const handlingBox = $('handling');
  const restBox = $('rest');
  const credits = validateManifest('assets/manifest.json', assetManifest);
  $('errors').textContent = [engine.contentErrors, ...credits.issues.map((i) => `${i.source} ${i.path}: ${i.message}`)]
    .filter(Boolean)
    .join('\n');
  mountCredits({ about: $('about'), box: $('credits'), show: $('show-credits') }, credits.manifest);
  renderAudioOptions($('audio-options'), audio.settings, (category, value) => audio.setVolume(category, value));

  /** A message that isn't an interruption, such as why a move was refused. */
  let notice = '';
  let noticeUntil = 0;
  const showNotice = (text: string) => {
    notice = text;
    noticeUntil = performance.now() + 3000;
  };

  rest = new RestController(sim, {
    bedQuality: () => {
      const bed = entities.bedNear(chest(), LOOT_REACH / s);
      return bed ? entities.defOf(bed).bed!.quality : undefined;
    },
    notice: showNotice,
  });

  /**
   * R/L: starts resting or sleeping, or stops it on a second press of the same key
   * (SLICE-1.md, 1.8 follow-up). Does nothing during the Continue/Stop prompt, which
   * owns C and X instead, or while busy with something else (e.g. the other kind, or
   * the debug compression test).
   */
  const toggleRest = (kind: RestKind): void => {
    if (compression.interruption !== undefined) {
      return;
    }
    const already = rest?.action?.kind === kind;
    if (!already) {
      if (compression.locksInput) {
        return;
      }
      queue.cancel();
    }
    const reason = rest?.toggle(kind);
    if (reason) {
      showNotice(`Can't ${kind}: ${reason}`);
    }
  };

  sim.scheduler.register({
    id: 'handling',
    rate: HANDLING_RATE,
    tick: (dt) => {
      // Handling happens in real time; compressed time belongs to long actions.
      if (compression.c > 1) {
        return;
      }
      for (const { job, reason } of queue.tick(dt).failed) {
        showNotice(`${job.label}: ${reason.toLowerCase()}`);
      }
    },
  });

  // ---- furniture: searching and doors ----

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
    playWorldSound,
  });

  const search = (entity: BlockEntity): string | undefined => {
    if (entity.searched || searching.has(entity)) {
      return undefined;
    }
    searching.add(entity);
    queue.enqueueAction('furniture.search', `Search the ${nameOf(entity)}`, searchTime(entities.defOf(entity)), {
      entityUid: entity.uid,
    });
    return undefined;
  };

  const toggleDoor = (entity: BlockEntity) => {
    const closing = entity.open;
    const time = entities.defOf(entity).door?.handling ?? 0;
    queue.enqueueAction(DOOR_ACTION, `${closing ? 'Close' : 'Open'} the ${nameOf(entity)}`, time, {
      entityUid: entity.uid,
      closing,
    });
  };

  const screen = new InventoryScreen(inventoryPanel, inventory, queue, {
    feet,
    nearby: () => inventory.pilesNear(body.pos, LOOT_REACH / s),
    distance: (pile: Pile) => pileDistance(pile.pos),
    containers: () => entities.containersNear(chest(), LOOT_REACH / s),
    entityDistance,
    search,
    searching: (entity) => searching.has(entity),
    notice: showNotice,
    use: (item) => survival.use(item),
    describe: (item) => survival.describe(item),
    assign: (slot, item) => {
      quickbar.assign(slot, item);
      showNotice(`${inventory.name(item)} on quickbar ${slot + 1}`);
    },
  });

  const spawnItem = (type: string): string => {
    const item = inventory.create(type);
    return inventory.add(item, { kind: 'pile', pos: feet() })
      ? `${inventory.name(item)} is at your feet`
      : `No room for the ${inventory.name(item).toLowerCase()} in the pile at your feet`;
  };
  debugTools = debugModule?.attachDebugTools({
    engine,
    body,
    sim,
    input,
    zombies: () => zombieSystem,
    feet,
    showNotice,
    spawnItem,
    compress: () => compress(),
  });

  let started = false;
  let mainMenuOpen = true;
  const syncOverlay = () => {
    started ||= input.locked;
    if (started && !input.locked && !sim.dead) {
      mainMenuOpen = true;
      screen.close();
      debugTools?.closeMenus();
    }
    overlay.hidden = (input.locked && !mainMenuOpen) || screen.isOpen || sim.dead !== undefined;
    input.menuPointer = mainMenuOpen || screen.isOpen || (debugTools?.menuOpen ?? false);
    $('go').textContent = started ? 'Paused. Click to continue' : 'Click to play';
  };
  const resume = () => {
    screen.close();
    debugTools?.closeMenus();
    mainMenuOpen = false;
    if (!input.locked) {
      input.lock();
    }
    if (input.locked) {
      syncOverlay();
    }
  };
  overlay.addEventListener('click', (e) => {
    const target = e.target instanceof Element ? e.target : undefined;
    if (target?.closest('a')) {
      return;
    }
    if (target?.closest('#go') || (!input.locked && target === overlay)) {
      resume();
    }
  });
  // Inventory redraws after pointerdown, so captured move/up events go to document rather than a soon-detached item node.
  const capturedPointers = new Set<number>();
  let forwardingPointer = false;
  const releasePointerTarget = (event: PointerEvent) => {
    if (event.type === 'pointerup' || event.type === 'pointercancel') {
      capturedPointers.delete(event.pointerId);
    }
  };
  const dispatchMenuPointer = (target: EventTarget, event: PointerEvent) => {
    forwardingPointer = true;
    try {
      target.dispatchEvent(
        new PointerEvent(event.type, {
          bubbles: true,
          cancelable: true,
          composed: true,
          pointerId: event.pointerId,
          pointerType: event.pointerType,
          isPrimary: event.isPrimary,
          button: event.button,
          buttons: event.buttons,
          clientX: input.cursorX,
          clientY: input.cursorY,
          screenX: input.cursorX,
          screenY: input.cursorY,
          width: event.width,
          height: event.height,
          pressure: event.pressure,
          tiltX: event.tiltX,
          tiltY: event.tiltY,
          twist: event.twist,
        }),
      );
    } finally {
      forwardingPointer = false;
    }
  };
  const forwardMenuPointer = (event: PointerEvent) => {
    if (forwardingPointer) {
      return;
    }
    if (!(input.locked && input.menuPointer)) {
      releasePointerTarget(event);
      return;
    }
    event.stopPropagation();
    const captured = capturedPointers.has(event.pointerId);
    const target = captured ? document : document.elementFromPoint(input.cursorX, input.cursorY);
    const forwardable =
      target === document ||
      (target instanceof Element && target !== renderer.domElement && target.id !== 'game-cursor');
    if (target && forwardable) {
      if (event.type === 'pointerdown') {
        capturedPointers.add(event.pointerId);
      }
      dispatchMenuPointer(target, event);
    }
    releasePointerTarget(event);
  };
  for (const type of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel'] as const) {
    document.addEventListener(type, forwardMenuPointer, true);
  }

  let forwardingClick = false;
  let hoveredElement: Element | null = null;
  document.addEventListener(
    'click',
    (e) => {
      if (forwardingClick || !input.locked || !input.menuPointer) {
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      const target = document.elementFromPoint(input.cursorX, input.cursorY);
      if (target && target !== renderer.domElement && target.id !== 'game-cursor') {
        forwardingClick = true;
        try {
          if (target instanceof HTMLInputElement) {
            target.focus();
          }
          target.dispatchEvent(
            new MouseEvent('click', {
              bubbles: true,
              cancelable: true,
              clientX: input.cursorX,
              clientY: input.cursorY,
              button: (e as MouseEvent).button,
            }),
          );
        } finally {
          forwardingClick = false;
        }
      }
    },
    true,
  );
  renderer.domElement.addEventListener('click', () => {
    if (mainMenuOpen) {
      resume();
      return;
    }
    if (input.locked || screen.isOpen || debugTools?.menuOpen || sim.dead) {
      return;
    }
    resume();
  });
  document.addEventListener('pointerlockchange', () => {
    if (!input.locked) {
      capturedPointers.clear();
    }
    syncOverlay();
  });

  const compress = () => {
    queue.cancel();
    const result = sim.compress();
    if (!result.ok) {
      showNotice(`Can't rest: ${result.reason}`);
    }
  };

  /** Continues: resumes a rest/sleep action, or the debug compression test. */
  const continueAction = (): void => {
    if (rest?.action) {
      const reason = rest.resume();
      if (reason) {
        showNotice(`Can't continue: ${reason}`);
      }
    } else {
      compress();
    }
  };

  /** Stops: ends a rest/sleep action, or the debug compression test. */
  const stopAction = (): void => {
    if (rest?.action) {
      rest.stop();
    } else {
      compression.stop();
    }
  };

  /** C continues and X stops after an interruption. Returns true if the key was used. */
  const timeKeys = (code: string): boolean => {
    if (compression.interruption === undefined) {
      return false;
    }
    if (code === 'KeyC') {
      continueAction();
      return true;
    }
    if (code === 'KeyX') {
      stopAction();
      return true;
    }
    return false;
  };

  const toggleInventory = () => {
    if (screen.isOpen) {
      screen.close();
    } else {
      screen.open();
      mainMenuOpen = false;
    }
    syncOverlay();
  };

  /** A quickbar key puts its item in your hands; pressing it again uses it. */
  const quickKey = (slot: number) => {
    const item = quickbar.slots[slot];
    if (!item) {
      showNotice(`Quickbar ${slot + 1} is empty: open the inventory, pick an item, press ${slot + 1}`);
      return;
    }
    const at = inventory.locate(item);
    if (!at) {
      showNotice(`The ${inventory.name(item).toLowerCase()} isn't with you`);
    } else if (at.kind === 'hand' || registry.items.get(item.type)?.battery) {
      const reason = survival.use(item);
      if (reason) {
        showNotice(reason);
      }
    } else {
      const reason = toHands(inventory, queue, item, feet());
      if (reason) {
        showNotice(reason);
      }
    }
  };

  /** Rest and sleep keys, each responsible for its own guard. */
  const restActions = new Map<string, () => void>([
    // R also descends in noclip (debug), but only while starting; stopping an active rest is fine.
    ['KeyR', () => (rest?.action?.kind === 'rest' || !debugTools?.noclip) && toggleRest('rest')],
    ['KeyL', () => toggleRest('sleep')],
  ]);

  const playKeys = (code: string) => {
    const restAction = restActions.get(code);
    if (restAction) {
      restAction();
      return;
    }
    const quick = QUICK_KEY.exec(code);
    const action = worldActionForKey(code);
    if (action === 'interact' && !compression.locksInput) {
      use();
    } else if (action === 'cancel') {
      queue.cancel();
      if (rest?.action) {
        rest.stop(); // X also stops resting/sleeping at once, the same as Stop after an interruption
      }
    } else if (quick && !compression.locksInput) {
      quickKey(Number(quick[1]) - 1);
    }
  };

  const handleMainMenuKey = (e: KeyboardEvent): boolean => {
    if (e.code !== KEY_BINDINGS.mainMenu.code) {
      return false;
    }
    e.preventDefault();
    if (!(e.repeat || sim.dead)) {
      mainMenuOpen = !mainMenuOpen;
      if (mainMenuOpen) {
        screen.close();
        debugTools?.closeMenus();
      }
      syncOverlay();
    }
    return true;
  };

  const handleMenuKey = (e: KeyboardEvent): boolean => {
    if (debugTools?.handleKey(e)) {
      input.menuPointer = mainMenuOpen || screen.isOpen || debugTools.menuOpen;
      return true;
    }
    if (e.code === 'Tab' && !compression.locksInput) {
      toggleInventory();
      return true;
    }
    if (!screen.isOpen) {
      return false;
    }
    if (screen.onKey(e)) {
      e.preventDefault();
    }
    return true;
  };

  globalThis.addEventListener('keydown', (e) => {
    if (handleMainMenuKey(e)) {
      return;
    }
    if (e.code === 'Tab') {
      e.preventDefault();
    }
    // Prevent the opening key from becoming text in a field focused by the menu.
    if (!e.repeat && isMenuOpeningKey(e.code, debugTools !== undefined, debugTools?.spawnOpen ?? false)) {
      e.preventDefault();
    }
    if (e.repeat || sim.dead) {
      return;
    }
    if (handleMenuKey(e)) {
      return;
    }
    if (timeKeys(e.code)) {
      return;
    }
    playKeys(e.code);
  });
  globalThis.addEventListener(
    'wheel',
    (e) => {
      if (input.locked && mainMenuOpen) {
        $('overlay').querySelector<HTMLElement>('.card')!.scrollTop += e.deltaY;
        e.preventDefault();
      } else if (input.locked && !input.menuPointer) {
        debugTools?.wheel(e.deltaY);
      }
    },
    { passive: false },
  );

  const lookDir = (): Vec3 => {
    const d = new Vector3(0, 0, -1).applyEuler(camera.rotation);
    return [d.x, d.y, d.z];
  };
  const eye = (): Vec3 => [body.pos[0], body.pos[1] + eyeHeight, body.pos[2]];

  /** The nearest visible furniture panel or cell in the crosshair. */
  const lookedAt = (): BlockEntity | undefined =>
    pickFurniture({
      entities,
      origin: eye(),
      direction: lookDir(),
      maxDistance: USE_REACH / s,
      blockSize: s,
      isSolid: engine.isSolid,
    });

  /** What F would do to it, for the prompt. */
  const useText = (entity: BlockEntity): string => {
    if (entities.defOf(entity).door) {
      return `F: ${entity.open ? 'close' : 'open'} the ${nameOf(entity)}`;
    }
    if (entity.pockets) {
      return `F: ${entity.searched ? 'look in' : 'search'} the ${nameOf(entity)}`;
    }
    return entities.defOf(entity).name;
  };

  /** F: opens or closes a door; searches a container and opens the inventory beside it. */
  function use(): void {
    const entity = lookedAt();
    if (!entity) {
      return;
    }
    if (entities.defOf(entity).door) {
      toggleDoor(entity);
    } else if (entity.pockets) {
      search(entity);
      if (!screen.isOpen) {
        toggleInventory();
      }
    }
  }

  renderer.domElement.addEventListener('contextmenu', (e) => e.preventDefault());
  const swing = () => {
    const heldWeapon = [inventory.hands.right, inventory.hands.left]
      .filter((item) => item !== undefined)
      .map((item) => registry.items.get(item.type)?.weapon?.melee)
      .find((attack) => attack !== undefined);
    const melee = heldWeapon ?? FISTS_MELEE;
    if (sim.needs.stamina < melee.stamina) {
      showNotice('You are too tired to swing');
      return;
    }
    if (zombieSystem?.swing(eye(), lookDir(), melee) !== undefined) {
      sim.needs.stamina = Math.max(0, sim.needs.stamina - melee.stamina);
    }
  };

  renderer.domElement.addEventListener('mousedown', (e) => {
    if (!input.locked || input.menuPointer || compression.locksInput) {
      return;
    }
    if (debugTools?.buildOn) {
      debugTools.click(e.button, eye(), lookDir());
    } else if (e.button === 0) {
      swing();
    }
  });

  // ---- loop ----

  let last = performance.now();
  let lastDebugUpdate = 0;
  let fps = 0;

  const clockText = (): string => {
    const speed = compression.c > 1.05 ? `   ×${compression.c.toFixed(0)}` : '';
    return `${formatClock(sim.calendar)}${speed}${sim.paused ? '   paused' : ''}`;
  };

  const needsText = (): string => {
    const { calories, hydration, fatigue, health, stamina } = sim.needs;
    const light = survival.lit ? `   light ${Math.round((chargeShare(registry, survival.lit) ?? 0) * 100)}%` : '';
    return [
      `health ${health.toFixed(0)}%   stamina ${stamina.toFixed(0)}%${sprinting ? ' (sprinting)' : ''}${light}`,
      `food ${calories.toFixed(0)}%   water ${hydration.toFixed(0)}%   fatigue ${fatigue.toFixed(0)}%`,
    ].join('\n');
  };

  const optionalHudLine = (visible: boolean, text: string): string => (visible ? text : '');
  const hudText = (looking: string): string => {
    const [x, y, z] = body.pos.map((v) => (v * s).toFixed(1));
    const visible = hudVisibility(hudOptions);
    const detailed = visible.details;
    return [
      optionalHudLine(visible.clock, clockText()),
      optionalHudLine(visible.stats, needsText()),
      optionalHudLine(visible.stats, `carrying ${(inventory.carriedWeight() / 1000).toFixed(1)} kg`),
      optionalHudLine(detailed, `${fps.toFixed(0)} fps   seed ${config.seed}`),
      optionalHudLine(detailed, `radius ${config.radiusM} m   ${input.walking ? 'walking' : 'jogging'} (Z)`),
      optionalHudLine(detailed, `pos ${x} ${y} ${z} m`),
      optionalHudLine(detailed, `chunks ${meshes.count} meshed, ${streamer.pending} pending`),
      optionalHudLine(visible.interaction && Boolean(looking), `looking at ${looking}`),
    ]
      .filter((line) => line !== '')
      .join('\n');
  };

  const promptText = (now: number): string => {
    const { messages, interaction } = hudVisibility(hudOptions);
    const lines = messages && now < noticeUntil ? [notice] : [];
    const entity = interaction && input.locked && !debugTools?.buildOn ? lookedAt() : undefined;
    if (entity) {
      lines.push(useText(entity));
    }
    // The rest screen carries its own Continue/Stop prompt while a long action is running.
    if (messages && compression.interruption !== undefined && !rest?.action) {
      lines.push(`${compression.interruption}.   C: continue   X: stop`);
    }
    return lines.join('\n');
  };

  let quickbarDrawn = '';
  const drawQuickbar = () => {
    const key = quickbarKey(quickbar, inventory);
    if (key !== quickbarDrawn) {
      quickbarDrawn = key;
      renderQuickbar(quickbarBox, quickbar, inventory);
    }
    quickbarBox.hidden = debugTools?.buildOn ?? false;
  };

  const updateVisualFeedback = (dt: number): void => {
    for (const event of damageEvents.read()) {
      if (event.kind === 'damage') {
        damageFeedback.hit(event.amount);
      }
    }
    const feedback = damageFeedback.step(dt);
    camera.rotation.copy(cameraRotation(input.pitch, input.yaw, feedback.roll));
    $('damage').style.opacity = String(feedback.vignetteOpacity);
  };

  const updateGameCursor = (): void => {
    gameCursor.hidden = !(input.locked && input.menuPointer);
    gameCursor.style.transform = `translate(${input.cursorX}px, ${input.cursorY}px)`;
    const underCursor = document.elementFromPoint(input.cursorX, input.cursorY);
    const clickable = underCursor?.closest('button, a, input, select, textarea, [role="button"]') ?? null;
    gameCursor.classList.toggle('hand', clickable !== null);
    hoveredElement?.classList.remove('game-cursor-hover');
    hoveredElement = clickable;
    hoveredElement?.classList.add('game-cursor-hover');
  };

  const updateDebugReadout = (now: number): void => {
    if (!debugTools || now - lastDebugUpdate < 250) {
      return;
    }
    lastDebugUpdate = now;
    debugTools.update({
      fps,
      seed: config.seed,
      radius: config.radiusM,
      movement: input.walking ? 'walking' : 'jogging',
      position: [body.pos[0] * s, body.pos[1] * s, body.pos[2] * s],
      chunks: meshes.count,
      pending: streamer.pending,
      holes: streamer.unmeshedColumns(body.pos[0], body.pos[2], config.radiusChunks),
      zombies: zombieStore.size,
      sounds: audio.heardSounds,
    });
  };

  const stepSimulationFrame = (dt: number): void => {
    if (rest) {
      rest.frame(dt);
    } else {
      sim.frame(dt);
    }
    for (const event of audioEvents.read()) {
      if (event.kind === 'damage') {
        playPlayerSound(event.amount >= 15 ? 'player_hurt_heavy' : 'player_hurt_light', event.time);
      }
    }
  };

  const renderHandlingFrame = (): void => {
    if (screen.isOpen || !hudVisibility(hudOptions).handling) {
      handlingBox.hidden = true;
      return;
    }
    renderHandling(handlingBox, queue);
  };

  const frame = (now: number) => {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    fps += (1 / Math.max(dt, 1e-3) - fps) * 0.05;

    input.menuPointer = mainMenuOpen || screen.isOpen || (debugTools?.menuOpen ?? false);
    streamer.update(body.pos[0], body.pos[2]);
    sim.paused = !overlay.hidden; // the pause card is up
    stepSimulationFrame(dt);
    applySky(engine.sky, skyAt(hourOfDay(sim.calendar)));
    piles.sync(inventory);
    furniture.sync(entities);
    const zombieAlpha = Math.max(0, Math.min(1, (sim.time - lastZombieStep) * 20));
    zombieMeshes.sync(zombieStore, dt, zombieAlpha);
    updateDebugReadout(now);

    const cameraOffset = cameraStepOffset.update(
      [body.pos[0] * s, body.pos[1] * s, body.pos[2] * s],
      body.onGround,
      dt,
      debugTools?.noclip ?? false,
    );
    const travel = Math.hypot(body.vel[0], body.vel[2]) * s * dt;
    const playerMoving = travel > 0.001 && !sim.paused;
    if (playerMoving) {
      playerGaitPhase += (travel / 0.6) * Math.PI;
    }
    playerMeshes.sync({
      body,
      yaw: input.yaw,
      stepOffset: cameraOffset,
      gaitPhase: playerGaitPhase,
      moving: playerMoving,
      inventory,
    });
    const [ex, ey, ez] = eye();
    camera.position.set(ex * s, ey * s + cameraOffset, ez * s);
    updateVisualFeedback(dt);
    audio.updateListener([camera.position.x, camera.position.y, camera.position.z], lookDir());
    updateGameCursor();

    hud.textContent = hudText(debugTools?.target(eye(), lookDir(), input.locked) ?? '');
    hud.hidden = hud.textContent === '';
    $('crosshair').hidden = !hudVisibility(hudOptions).crosshair;
    prompt.textContent = promptText(now);
    prompt.hidden = prompt.textContent === '';
    document.body.classList.toggle('resting', rest?.action !== undefined);
    renderRest(restBox, rest?.action, sim);
    screen.update();
    inventoryStats.hidden = !screen.isOpen;
    inventoryStats.textContent = needsText();
    drawQuickbar();
    quickbarBox.hidden = (debugTools?.buildOn ?? false) || !hudVisibility(hudOptions).quickbar;
    renderHandlingFrame();
    camera.updateMatrixWorld(); // the beam follows this frame's view, not the last one's
    held.update(camera);
    flashlight.update(registry, survival.lit, held, camera);
    renderer.render(scene, camera);
    held.render(renderer, camera, engine.sky);
    finishFrame();
  };

  /** Stops play and shows what happened; "New world" reloads with the next seed. */
  const die = ({ cause, time }: { cause: string; time: number }) => {
    input.unlock();
    screen.close();
    inventoryPanel.hidden = true;
    overlay.hidden = true;
    prompt.hidden = true;
    const summary = {
      cause,
      survived: time * sim.clock.ratio,
      looted: inventory.looted,
      searched: [...entities.all].filter((e) => e.searched).length,
    };
    showDeath($('death'), registry, summary, () => location.assign(newWorldQuery(location.search, config.seed)));
  };
  const finishFrame = (): void => {
    if (sim.dead) {
      die(sim.dead);
    } else {
      requestAnimationFrame(frame);
    }
  };
  requestAnimationFrame(frame);
};
