// Normal play: walk, look, loot, manage what you carry, eat, drink and light your way.
// The simulation core runs the clock, the player's physics, needs and the handling
// queue; Esc pauses it. When health runs out, the death screen offers a new world.
// Build mode (B, with ?debug=1) is a development tool for editing blocks, and the
// spawn menu (G) drops any item at your feet.

import { Vector3 } from 'three';
import assetManifest from '../content/base/assets/manifest.json' with { type: 'json' };
import { validateManifest } from '../core/assets.ts';
import { type BlockEntity, searchTime } from '../core/blockEntities.ts';
import { CLOCK_RATIO, formatClock, hourOfDay } from '../core/clock.ts';
import type { Vec3 } from '../core/coords.ts';
import { MapEntityStore } from '../core/entities.ts';
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
import { applySky } from '../render/sky.ts';
import { StepOffset } from '../render/stepOffset.ts';
import { ZombieMeshes } from '../render/zombies.ts';
import { mountCredits } from '../ui/credits.ts';
import { newWorldQuery, showDeath } from '../ui/death.ts';
import { Quickbar, quickbarKey, renderHandling, renderQuickbar } from '../ui/hud.ts';
import { InventoryScreen } from '../ui/inventoryScreen.ts';
import { SpawnMenu } from '../ui/spawnMenu.ts';
import { GameAudio } from './audio.ts';
import { isAudioSettingsShortcut, mountAudioSettings } from './audioSettings.ts';
import { BuildMode } from './build.ts';
import type { Engine } from './engine.ts';
import { Input } from './input.ts';
import { startingLoadout } from './loadout.ts';
import { createPlayerBody, PLAYER, paceFactor, physicsFor, steer, stepNoclip } from './player.ts';
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
const DOOR_CLOSE_MESSAGES = { player: "You're in the way", other: "Something's in the way" } as const;

export const startPlay = (engine: Engine): void => {
  const { config, registry, streamer, renderer, scene, camera, meshes } = engine;
  const { scale } = config;
  const s = scale.blockSize;
  const physics = physicsFor(scale);
  const eyeHeight = PLAYER.eye / s;

  const [sx, sy, sz] = engine.spawn.pos;
  const body = createPlayerBody(scale, sx / s, sy / s + 0.01, sz / s);
  const cameraStepOffset = new StepOffset(PLAYER.stepHeight);
  const input = new Input(renderer.domElement);
  input.yaw = engine.spawn.yaw;

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
  const piles = new PileMeshes(s, models);
  const furniture = new FurnitureMeshes(s);
  const held = new HeldItems(inventory, models);
  const flashlight = new Flashlight(scene);
  scene.add(piles.group, furniture.group);

  // ---- simulation ----

  /** Debug control for the compression interruption test (U). */
  let danger: string | undefined;
  const sim = new Simulation({
    seed: config.seed,
    clock: { ratio: CLOCK_RATIO, start: config.start },
    unsafe: () => danger ?? zombieSystem?.unsafeReason(),
  });
  const { compression } = sim;
  const audioEvents = sim.events.reader();
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
  const playWorldSound = (event: SoundEventId, position: Vec3, time = sim.time) =>
    audio.play(event, position.map((value) => value * s) as Vec3, time);
  const playPlayerSound = (event: SoundEventId, time = sim.time) => {
    const position = playerSoundPosition();
    if (!playWorldSound(event, position, time)) {
      return;
    }
    const definition = registry.sounds.get(event);
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
  let noclip = false;
  const playerMovement = (): PlayerMovement => {
    const moving = input.locked && !compression.locksInput ? input.intent() : IDLE;
    if (moving.forward === 0 && moving.right === 0) {
      return 'still';
    }
    if (sprinting) {
      return 'sprinting';
    }
    return moving.walk ? 'walking' : 'jogging';
  };
  const playerSense = () => ({
    pos: [body.pos[0], body.pos[1], body.pos[2]] as Vec3,
    body: noclip ? undefined : body,
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
      const moving = input.locked && !compression.locksInput;
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
      if (noclip) {
        stepNoclip({
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
      const jumpStarted = pacedIntent.jump && body.onGround;
      steer(body, scale, input.yaw, pacedIntent);
      if (jumpStarted) {
        playPlayerSound('player_strain', time);
      }
      const zombieBodies = [...zombieStore.entries()].map(([, zombie]) => zombie.body);
      stepBody(body, dt, engine.isSolid, { ...physics, obstacles: zombieBodies });
    },
  });

  // ---- UI ----

  const overlay = $('overlay');
  const inventoryPanel = $('inventory');
  const hud = $('hud');
  const prompt = $('prompt');
  const quickbarBox = $('quickbar');
  const handlingBox = $('handling');
  const credits = validateManifest('assets/manifest.json', assetManifest);
  $('errors').textContent = [engine.contentErrors, ...credits.issues.map((i) => `${i.source} ${i.path}: ${i.message}`)]
    .filter(Boolean)
    .join('\n');
  mountCredits({ about: $('about'), box: $('credits'), show: $('show-credits') }, credits.manifest);

  /** A message that isn't an interruption, such as why a move was refused. */
  let notice = '';
  let noticeUntil = 0;
  const showNotice = (text: string) => {
    notice = text;
    noticeUntil = performance.now() + 3000;
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

  const search = (entity: BlockEntity): string | undefined => {
    if (entity.searched || searching.has(entity)) {
      return undefined;
    }
    searching.add(entity);
    queue.enqueueAction(`Search the ${nameOf(entity)}`, searchTime(entities.defOf(entity)), () => {
      searching.delete(entity);
      const reached = inventory.canReachEntity(entity);
      if (reached) {
        entities.markSearched(entity);
      }
      return reached ? undefined : 'Too far away';
    });
    return undefined;
  };

  const toggleDoor = (entity: BlockEntity) => {
    const closing = entity.open;
    const time = entities.defOf(entity).door?.handling ?? 0;
    const center: Vec3 = [
      entity.pos[0] + entity.size[0] / 2,
      entity.pos[1] + entity.size[1] / 2,
      entity.pos[2] + entity.size[2] / 2,
    ];
    queue.enqueueAction(`${closing ? 'Close' : 'Open'} the ${nameOf(entity)}`, time, (): string | undefined => {
      if (!closing) {
        entities.setOpen(entity, true);
        playWorldSound('door_open', center);
        return;
      }
      const blocker = entities.closeDoor(
        entity,
        body,
        [...zombieStore.entries()].map(([, zombie]) => zombie.body),
      );
      if (blocker) {
        playWorldSound('door_blocked_close', center);
        return DOOR_CLOSE_MESSAGES[blocker];
      }
      playWorldSound('door_close', center);
      return undefined;
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

  const build = new BuildMode(engine, $('hotbar'), body, PLAYER.reach / s);

  const spawnMenu = new SpawnMenu($('spawn'), registry, (type) => {
    const item = inventory.create(type);
    return inventory.add(item, { kind: 'pile', pos: feet() })
      ? `${inventory.name(item)} is at your feet`
      : `No room for the ${inventory.name(item).toLowerCase()} in the pile at your feet`;
  });

  const audioSettingsPanel = $('audio-settings');
  let started = false;
  const syncOverlay = () => {
    started ||= input.locked;
    overlay.hidden = input.locked || screen.isOpen || spawnMenu.isOpen || sim.dead !== undefined;
    $('go').textContent = started ? 'Paused. Click to continue' : 'Click to play';
  };
  overlay.addEventListener('click', (e) => {
    if (!(e.target instanceof HTMLAnchorElement)) {
      input.lock();
    }
  });
  renderer.domElement.addEventListener('click', () => {
    if (!(input.locked || screen.isOpen || spawnMenu.isOpen || sim.dead)) {
      input.lock();
    }
  });
  document.addEventListener('pointerlockchange', syncOverlay);

  let resumeAfterAudioSettings = false;
  const closeAudioSettings = () => {
    audioSettingsPanel.hidden = true;
    if (resumeAfterAudioSettings) {
      input.lock();
    }
    syncOverlay();
  };
  mountAudioSettings(audioSettingsPanel, audio, closeAudioSettings);
  const toggleAudioSettings = () => {
    if (audioSettingsPanel.hidden) {
      resumeAfterAudioSettings = input.locked;
      audioSettingsPanel.hidden = false;
      input.unlock();
    } else {
      closeAudioSettings();
    }
    syncOverlay();
  };

  const compress = () => {
    queue.cancel();
    const result = sim.compress();
    if (!result.ok) {
      showNotice(`Can't rest: ${result.reason}`);
    }
  };

  /** Debug keys (`?debug=1`): T starts or stops compression, N makes a noise, U toggles danger, K hurts, V spawns a shambler. */
  const debugKeys = new Map<string, () => void>([
    ['KeyK', () => sim.hurt(25, 'a debug key')],
    [
      'KeyH',
      () => {
        sim.godMode = !sim.godMode;
      },
    ],
    [
      'KeyF',
      () => {
        noclip = !noclip;
        cameraStepOffset.clear();
        body.vel = [0, 0, 0];
        body.onGround = false;
      },
    ],
    ['KeyT', () => (compression.active ? compression.stop() : compress())],
    ['KeyN', () => sim.emit({ kind: 'interrupt', reason: 'You hear something outside' })],
    [
      'KeyU',
      () => {
        danger = danger ? undefined : 'Something is close';
      },
    ],
    [
      'KeyV',
      () => {
        const type = registry.zombies.get('shambler');
        if (!type) {
          return;
        }
        const forward: Vec3 = [-Math.sin(input.yaw), 0, -Math.cos(input.yaw)];
        const pos: Vec3 = [body.pos[0] + (forward[0] * 6) / s, body.pos[1], body.pos[2] + (forward[2] * 6) / s];
        zombieSystem?.add(type, pos, [-forward[0], 0, -forward[2]]);
        showNotice('A shambler is approaching');
      },
    ],
  ]);

  /** C continues and X stops after an interruption. Returns true if the key was used. */
  const timeKeys = (code: string): boolean => {
    if (compression.interruption === undefined) {
      const debug = config.debug ? debugKeys.get(code) : undefined;
      debug?.();
      return debug !== undefined;
    }
    if (code === 'KeyC') {
      compress();
      return true;
    }
    if (code === 'KeyX') {
      compression.stop();
      return true;
    }
    return false;
  };

  const toggleInventory = () => {
    if (screen.isOpen) {
      screen.close();
      input.lock();
    } else {
      screen.open();
      input.unlock();
    }
    syncOverlay();
  };

  const toggleSpawnMenu = () => {
    if (spawnMenu.isOpen) {
      spawnMenu.close();
      input.lock();
    } else {
      spawnMenu.open();
      input.unlock();
    }
    syncOverlay();
  };

  /**
   * While the spawn menu is open it takes every key, so typing in its filter does nothing
   * else; only Esc, or G outside the filter, closes it. Returns true if the key was used.
   */
  const spawnMenuKey = (e: KeyboardEvent): boolean => {
    if (!spawnMenu.isOpen) {
      return false;
    }
    if (e.code === 'Escape' || (e.code === 'KeyG' && !(e.target instanceof HTMLInputElement))) {
      toggleSpawnMenu();
    }
    return true;
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

  const playKeys = (code: string) => {
    const quick = QUICK_KEY.exec(code);
    if (code === 'KeyB' && config.debug) {
      build.toggle();
    } else if (code === 'KeyG' && config.debug) {
      toggleSpawnMenu();
    } else if (code === 'KeyE' && !compression.locksInput) {
      use();
    } else if (code === 'KeyX') {
      queue.cancel();
    } else if (!build.key(code) && quick && !compression.locksInput) {
      quickKey(Number(quick[1]) - 1);
    }
  };

  const audioSettingsKey = (e: KeyboardEvent): boolean => {
    if (isAudioSettingsShortcut(e.code) && !sim.dead) {
      e.preventDefault();
      toggleAudioSettings();
      return true;
    }
    if (audioSettingsPanel.hidden) {
      return false;
    }
    if (e.code === 'Escape') {
      closeAudioSettings();
    }
    return true;
  };

  globalThis.addEventListener('keydown', (e) => {
    if (e.code === 'Tab') {
      e.preventDefault();
    }
    if (audioSettingsKey(e) || spawnMenuKey(e) || e.repeat || sim.dead || timeKeys(e.code)) {
      return;
    }
    if (e.code === 'Tab' && !compression.locksInput) {
      toggleInventory();
    } else if (screen.isOpen) {
      if (screen.onKey(e)) {
        e.preventDefault();
      }
    } else {
      playKeys(e.code);
    }
  });
  globalThis.addEventListener('wheel', (e) => {
    if (input.locked) {
      build.wheel(e.deltaY);
    }
  });

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

  /** What E would do to it, for the prompt. */
  const useText = (entity: BlockEntity): string => {
    if (entities.defOf(entity).door) {
      return `E: ${entity.open ? 'close' : 'open'} the ${nameOf(entity)}`;
    }
    if (entity.pockets) {
      return `E: ${entity.searched ? 'look in' : 'search'} the ${nameOf(entity)}`;
    }
    return entities.defOf(entity).name;
  };

  /** E: opens or closes a door; searches a container and opens the inventory beside it. */
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
    if (!input.locked || compression.locksInput) {
      return;
    }
    if (build.on) {
      build.click(e.button, eye(), lookDir());
    } else if (e.button === 0) {
      swing();
    }
  });

  // ---- loop ----

  let last = performance.now();
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

  const debugText = (): string =>
    config.debug
      ? `debug: B build, G spawn, H god (${sim.godMode ? 'on' : 'off'}), F noclip (${noclip ? 'on' : 'off'}), Space rise/R descend, T rest, N noise, U danger (${danger ? 'on' : 'off'}), K hurt, V shambler`
      : '';

  const hudText = (looking: string): string => {
    const [x, y, z] = body.pos.map((v) => (v * s).toFixed(1));
    return [
      clockText(),
      needsText(),
      `carrying ${(inventory.carriedWeight() / 1000).toFixed(1)} kg${build.on ? '   BUILD MODE (B)' : ''}`,
      debugText(),
      config.debug ? `shamblers ${zombieStore.size}` : '',
      `${fps.toFixed(0)} fps   seed ${config.seed}`,
      `radius ${config.radiusM} m   ${input.walking ? 'walking' : 'jogging'} (Z)`,
      `pos ${x} ${y} ${z} m`,
      config.debug
        ? `chunks ${meshes.count} meshed, ${streamer.pending} pending; ${streamer.unmeshedColumns(body.pos[0], body.pos[2], config.radiusChunks)} holes`
        : `chunks ${meshes.count} meshed, ${streamer.pending} pending`,
      looking ? `looking at ${looking}` : '',
    ]
      .filter((line) => line !== '')
      .join('\n');
  };

  const promptText = (now: number): string => {
    const lines = now < noticeUntil ? [notice] : [];
    const entity = input.locked && !build.on ? lookedAt() : undefined;
    if (entity) {
      lines.push(useText(entity));
    }
    if (compression.interruption !== undefined) {
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
    quickbarBox.hidden = build.on;
  };

  const frame = (now: number) => {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    fps += (1 / Math.max(dt, 1e-3) - fps) * 0.05;

    streamer.update(body.pos[0], body.pos[2]);
    sim.paused = !overlay.hidden; // the pause card is up
    sim.frame(dt);
    for (const event of audioEvents.read()) {
      if (event.kind === 'damage') {
        playPlayerSound(event.amount >= 15 ? 'player_hurt_heavy' : 'player_hurt_light', event.time);
      }
    }
    applySky(engine.sky, skyAt(hourOfDay(sim.calendar)));
    piles.sync(inventory);
    furniture.sync(entities);
    const zombieAlpha = Math.max(0, Math.min(1, (sim.time - lastZombieStep) * 20));
    zombieMeshes.sync(zombieStore, dt, zombieAlpha);

    const cameraOffset = cameraStepOffset.update(
      [body.pos[0] * s, body.pos[1] * s, body.pos[2] * s],
      body.onGround,
      dt,
      noclip,
    );
    const [ex, ey, ez] = eye();
    camera.position.set(ex * s, ey * s + cameraOffset, ez * s);
    camera.rotation.set(input.pitch, input.yaw, 0);
    audio.updateListener([camera.position.x, camera.position.y, camera.position.z], lookDir());

    hud.textContent = hudText(build.target(eye(), lookDir(), input.locked));
    prompt.textContent = promptText(now);
    prompt.hidden = prompt.textContent === '';
    screen.update();
    drawQuickbar();
    if (screen.isOpen) {
      handlingBox.hidden = true;
    } else {
      renderHandling(handlingBox, queue);
    }
    camera.updateMatrixWorld(); // the beam follows this frame's view, not the last one's
    held.update(camera);
    flashlight.update(registry, survival.lit, held, camera);
    renderer.render(scene, camera);
    held.render(renderer, camera, engine.sky);
    if (sim.dead) {
      die(sim.dead);
      return;
    }
    requestAnimationFrame(frame);
  };

  /** Stops play and shows what happened; "New world" reloads with the next seed. */
  const die = ({ cause, time }: { cause: string; time: number }) => {
    input.unlock();
    screen.close();
    inventoryPanel.hidden = true;
    overlay.hidden = true;
    audioSettingsPanel.hidden = true;
    prompt.hidden = true;
    const summary = {
      cause,
      survived: time * sim.clock.ratio,
      looted: inventory.looted,
      searched: [...entities.all].filter((e) => e.searched).length,
    };
    showDeath($('death'), registry, summary, () => location.assign(newWorldQuery(location.search, config.seed)));
  };
  requestAnimationFrame(frame);
};
