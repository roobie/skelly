// Normal play: walk, look, loot, manage what you carry, eat, drink and light your way.
// The simulation core runs the clock, the player's physics, needs and the handling
// queue; Esc pauses it. When health runs out, the death screen offers a new world.

import assetManifest from '../content/base/assets/manifest.json' with { type: 'json' };
import { validateManifest } from '../core/assets.ts';
import type { BlockEntity } from '../core/blockEntities.ts';
import { formatClock, hourOfDay, nextTimeOfDay, skipTarget } from '../core/clock.ts';
import { SKIP_COMPRESSION } from '../core/compression.ts';
import type { Vec3 } from '../core/coords.ts';
import { pickFurniture } from '../core/furniturePick.ts';
import type { Pile } from '../core/inventory.ts';
import { chargeShare, offHandUse } from '../core/lights.ts';
import { DEFAULT_LOOK, DEFAULT_MOOD, DEFAULT_SHADOWS } from '../core/mood.ts';
import { isForwardButton, PressDedupe } from '../core/sideButton.ts';
import { skyAt, sunDirection, sunShadowStrength } from '../core/sky.ts';
import { DEFAULT_FOGGINESS, skyInWeather, type Weather } from '../core/weather.ts';
import { FISTS_MELEE, type MeleeWeapon } from '../core/zombies.ts';
import { Flashlight, flashlightDaylightScale } from '../render/flashlight.ts';
import { FrameTimes } from '../render/frameTimes.ts';
import { FurnitureMeshes } from '../render/furniture.ts';
import { HeldItems } from '../render/hands.ts';
import { applyLook } from '../render/look.ts';
import { renderMeleePose } from '../render/meleePose.ts';
import { MobActorMeshes, type ZombieRenderer } from '../render/mobActors.ts';
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
import { quickbarKey, renderHandling, renderQuickbar } from '../ui/hud.ts';
import { hudVisibility, readHudOptions, renderHudOptions, writeHudOptions } from '../ui/hudOptions.ts';
import { InventoryScreen } from '../ui/inventoryScreen.ts';
import { mountMenuPointer } from '../ui/menuPointer.ts';
import { computeMenuState } from '../ui/menuState.ts';
import { primaryActionHint } from '../ui/primaryActionHint.ts';
import { renderRest } from '../ui/rest.ts';
import { aimDirection } from './aim.ts';
import { GameAudio } from './audio.ts';
import { mountControlsCard } from './controls.ts';
import { cameraRotation, DamageFeedback } from './damageFeedback.ts';
import type { DebugModule, DebugRuntime } from './debugInterface.ts';
import { DOOR_ACTION } from './doorAction.ts';
import type { Engine } from './engine.ts';
import {
  CONTROL_CODES,
  Input,
  isMenuOpeningKey,
  KEY_BINDINGS,
  quickbarSlotForKey,
  worldActionForKey,
} from './input.ts';
import { startingLoadout } from './loadout.ts';
import { shouldEnterMeleeReady, startPlayerMelee } from './melee.ts';
import { PLAYER } from './player.ts';
import { PlaytestObserver } from './playtestObserver.ts';
import {
  createSnapshotHistory,
  loadMetrics,
  metricsExportJson,
  persistMetrics,
  SessionMetrics,
} from './playtestTools.ts';
import { ACTION_HAND_BINDINGS, selectPrimaryAction } from './primaryAction.ts';
import type { RestKind } from './rest.ts';
import { createSession, LOOT_REACH } from './session.ts';
import { toHands } from './targets.ts';
import { playerStartFromWorld } from './worldSetup.ts';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
/** Metres: how far away you can open a door or search a container you're looking at. */
const USE_REACH = 2;
/** Sim seconds of slack for a debug time skip "reaching its target"; the clamped last frame lands within float error of it. */
const SKIP_SLACK = 1e-6;

export const startPlay = (engine: Engine, debugModule?: DebugModule): void => {
  const { config, registry, streamer, renderer, scene, camera, meshes } = engine;
  const { scale } = config;
  const s = scale.blockSize;
  const eyeHeight = PLAYER.eye / s;

  const playerStart = playerStartFromWorld(engine, scale);
  const input = new Input(renderer.domElement);
  input.yaw = playerStart.yaw;
  let cameraRoll = 0;
  let debugTools: DebugRuntime | undefined;
  let performPrimaryAction: (hand: 'right' | 'left') => void = () => undefined;
  // Play's look is on by default (the benchmark never applies it); debug tools may then restore a look from the URL.
  applyLook(renderer, meshes, DEFAULT_LOOK);
  engine.mood.restore(DEFAULT_MOOD);
  engine.shadows.restore(DEFAULT_SHADOWS);
  // The weather the sky is rendered in. No weather system yet (DESIGN.md, Slice 4): it will set
  // `fogginess` (and later more) here; until then only the debug controls change it.
  const weather: Weather = { fogginess: DEFAULT_FOGGINESS };

  const audio = new GameAudio({
    registry,
    seed: config.seed,
    blockSize: s,
    isSolid: engine.isSolid,
    report: (message) => {
      const errors = $('errors');
      errors.textContent = [errors.textContent, message].filter(Boolean).join('\n');
    },
  });
  document.addEventListener('pointerdown', () => audio.unlock(), { once: true });

  // ---- simulation ----

  let playtestObserver: PlaytestObserver | undefined;
  let meleeRecoilStrength = 0;
  let meleeRecoilTime = 0;
  const session = createSession({
    registry,
    world: engine.world,
    isSolid: engine.isSolid,
    scale,
    seed: config.seed,
    start: config.start,
    spawn: playerStart.position,
    entities: engine.entities,
    ready: (x, z) => streamer.isReady(x, z),
    controls: {
      active: () => input.locked && !input.menuPointer,
      intent: () => input.intent(),
      consumePrimaryAction: () => input.consumePrimaryAction(),
      consumeLeftHandAction: () => input.consumeLeftHandAction(),
      primaryAction: () => {
        // Build-mode canvas clicks belong exclusively to the block editor, not the held-item action.
        if (!debugTools?.buildOn) {
          performPrimaryAction(ACTION_HAND_BINDINGS.primaryClick);
        }
      },
      leftHandAction: () => {
        if (!debugTools?.buildOn) {
          performPrimaryAction(ACTION_HAND_BINDINGS.leftHandKey);
        }
      },
      yaw: () => input.yaw,
      pitch: () => input.pitch,
      walking: () => input.walking,
      descending: () => input.held.has(CONTROL_CODES.rest),
    },
    // The session works in blocks; playback is in metres.
    audio: {
      play: (event, position, time, meta) => audio.play(event, position.map((v) => v * s) as Vec3, time, meta),
      snapshotState: () => audio.snapshotState(),
      restoreState: (state) => audio.restoreState(state),
    },
    notice: (text) => showNotice(text),
    onHandlingOutcomes: (result) => playtestObserver?.handlingOutcomes(result),
    debug: () => debugTools,
    // Presentation only: what the simulation decided (a part severed, a zombie dead) drawn as debris and a
    // corpse. Only MobActorMeshes implements these; ZombieMeshes leaves them undefined.
    zombieEffects: {
      onSever: (id, zombie, part, hit) => zombieMeshes.zombieSevered?.(id, part, hit, zombie),
      onIncapacitated: (id, zombie) => zombieMeshes.zombieIncapacitated?.(id, zombie),
      onDeath: (id, zombie) => zombieMeshes.zombieDied?.(id, zombie, [...body.pos]),
      ...(config.debug ? { onMeleeResult: (result) => debugTools?.recordMeleeResult(result) } : {}),
      onMeleeContact: (impulse) => {
        meleeRecoilStrength = Math.max(0, Math.min(1, impulse / 12));
        meleeRecoilTime = 0.08;
      },
    },
  });
  const {
    sim,
    inventory,
    entities,
    queue,
    quickbar,
    survival,
    rest,
    body,
    feet,
    chest,
    pileDistance,
    entityDistance,
    nameOf,
    search,
  } = session;
  const { compression } = sim;
  const { zombies: zombieSystem, zombieStore } = session;
  const cameraStepOffset = new StepOffset(PLAYER.stepHeight);
  let playerGaitPhase = 0;
  startingLoadout(inventory);
  // Furniture, with the loot rolled for it, arrives with its column.
  streamer.onColumn = (cx, cz) => {
    session.onColumn(cx, cz, engine.site);
    for (const { spec, loot } of engine.furnitureIn(cx, cz)) {
      inventory.furnish(spec, loot);
    }
  };
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
  engine.shadows.attachTorch(flashlight.light);
  scene.add(piles.group, furniture.group, playerMeshes.group);
  const damageEvents = sim.events.reader();
  const damageFeedback = new DamageFeedback();
  // Mobgen actors (src/render/mobActors.ts) by default; `?actors=boxes` swaps in ZombieMeshes' six
  // boxes — same ZombieRenderer shape (group/sync/…), so the rest of this function
  // doesn't care which one it has. Declared after createSession, whose zombie hooks (above) reach it
  // through a closure that only ever runs later, during play.
  //
  // zombieDied ordering: a melee kill starts from the player-tick primary-action callback below and can
  // land before or after this frame's `zombieMeshes.sync()` call in either order. The session's onDeath hook calls zombieDied synchronously, in the very same call that
  // removes the zombie from zombieStore — MobActorMeshes' own zombieDied moves that id out of its
  // live-tracking map *before* returning, so whichever order sync() and a death happen to fall in this
  // frame, sync()'s own prune pass never mistakes a just-died zombie for a plain vanish (see
  // mobActors.ts's own doc comment).
  const zombieMeshes: ZombieRenderer = config.actors === 'detailed' ? new MobActorMeshes(s) : new ZombieMeshes(s);
  zombieMeshes.setWorld?.(engine.isSolid, s);
  scene.add(zombieMeshes.group);

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
  mountControlsCard($('controls'));
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
    const already = rest.action?.kind === kind;
    if (!already) {
      if (compression.locksInput) {
        return;
      }
      queue.cancel();
    }
    const reason = rest.toggle(kind);
    if (reason) {
      showNotice(`Can't ${kind}: ${reason}`);
    }
  };

  // ---- furniture: searching and doors ----

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
    search: (entity) => {
      playtestObserver?.beginSearch(entity, nameOf(entity));
      return search(entity);
    },
    searching: session.searching,
    notice: showNotice,
    use: (item) => survival.use(item),
    describe: (item) => survival.describe(item),
    assign: (slot, item) => {
      quickbar.assign(slot, item);
      showNotice(`${inventory.name(item)} on quickbar ${slot + 1}`);
    },
  });

  let revealZombies = false;
  const storedMetrics = (() => {
    try {
      return loadMetrics(config.seed, localStorage);
    } catch {
      // Storage can be disabled; metrics start fresh for this run.
      return null;
    }
  })();
  const metrics = new SessionMetrics(config.seed, storedMetrics);
  playtestObserver = new PlaytestObserver(metrics);
  const snapshotHistory = createSnapshotHistory();
  const saveMetrics = (): void => {
    try {
      persistMetrics(metrics, localStorage);
    } catch {
      /* Storage can be disabled; gameplay remains available. */
    }
  };
  const exportMetrics = (): void => {
    const blob = new Blob([metricsExportJson(metrics)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `deadvox-metrics-seed-${config.seed}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };
  const worldId = `debug-world-${config.seed}`;
  const characterId = `debug-character-${config.seed}`;
  const measureSnapshot = () =>
    playtestObserver!.measureSnapshot(() => session.snapshot({ worldId, characterId }), session, snapshotHistory);
  const openInventoryScreen = (): void => {
    screen.open();
  };
  const closeInventoryScreen = (): void => {
    screen.close();
  };

  const spawnItem = (type: string): string => {
    const item = inventory.create(type);
    return inventory.add(item, { kind: 'pile', pos: feet() })
      ? `${inventory.name(item)} is at your feet`
      : `No room for the ${inventory.name(item).toLowerCase()} in the pile at your feet`;
  };
  debugTools = debugModule?.attachDebugTools({
    engine,
    weather,
    flashlight,
    body,
    inventory,
    newGame: session.restoredLook === undefined,
    sim,
    input,
    roll: () => cameraRoll,
    zombies: () => zombieSystem,
    feet,
    showNotice,
    spawnItem,
    compress: () => compress(),
    skipGameHours: (hours) => skipGameHours(hours),
    setTimeOfDay: (hour, minute) => {
      const timeOfDay = hour * 3600 + minute * 60;
      sim.setDebugCalendarTime(nextTimeOfDay(sim.calendar, timeOfDay));
    },
    revealZombies: (enabled) => {
      revealZombies = enabled;
    },
    measureSnapshot,
    exportMetrics,
  });

  let started = false;
  let mainMenuOpen = true;
  let resumeRequested = false;
  const syncMenuState = (pointerLockChanged = false) => {
    const state = computeMenuState({
      started,
      mainMenuOpen,
      inventoryOpen: screen.isOpen,
      debugMenuOpen: debugTools?.menuOpen ?? false,
      pointerLocked: input.locked,
      dead: sim.dead !== undefined,
      pointerLockChanged,
      resumeRequested,
    });
    ({ started, mainMenuOpen } = state);
    if (pointerLockChanged || state.closeOtherMenus) {
      resumeRequested = false;
    }
    if (state.closeOtherMenus) {
      closeInventoryScreen();
      debugTools?.closeMenus();
    }
    input.menuPointer = state.menuPointer;
    overlay.hidden = state.overlayHidden;
    $('go').textContent = state.goLabel;
    return state;
  };
  const resume = () => {
    resumeRequested = true;
    if (input.locked) {
      syncMenuState();
      resumeRequested = false;
    } else {
      input.lock();
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
  const menuPointer = mountMenuPointer({ input, canvas: renderer.domElement, cursor: gameCursor });
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
      menuPointer.releaseCaptures();
    }
    syncMenuState(true);
  });
  document.addEventListener('pointerlockerror', () => {
    resumeRequested = false;
  });

  const compress = () => {
    queue.cancel();
    const result = sim.compress();
    if (!result.ok) {
      showNotice(`Can't rest: ${result.reason}`);
    }
  };

  /** Debug time skip: the simulation time it runs to, while one is running. */
  let skipUntil: number | undefined;
  /** Ends the skip exactly on target: snapping c to 1 keeps the ramp-down from running past it. */
  const endSkip = (): void => {
    skipUntil = undefined;
    sim.ignoreUnsafe = false;
    compression.stop();
    compression.snap();
  };

  /**
   * Debug: fast-forwards the real clock by `hours` game hours through the same compressed
   * stepping as rest (needs, scheduler and shamblers all run), ignoring danger. Another call
   * during a skip pushes the target out. It replaces a rest/sleep in progress.
   */
  const skipGameHours = (hours: number): void => {
    rest.stop();
    queue.cancel();
    skipUntil = skipTarget(sim.clock, skipUntil ?? sim.time, hours);
    sim.ignoreUnsafe = true;
    sim.compress(SKIP_COMPRESSION);
  };

  /** Ends the skip when it arrives, is interrupted, the player dies or the debug T key stops compression. */
  const updateSkip = (until: number): void => {
    const { interruption } = compression;
    if (interruption !== undefined) {
      showNotice(`Time skip stopped: ${interruption}`);
    }
    if (interruption !== undefined || sim.dead || !compression.active || until - sim.time <= SKIP_SLACK) {
      endSkip();
    }
  };

  /** Continues: resumes a rest/sleep action, or the debug compression test. */
  const continueAction = (): void => {
    if (rest.action) {
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
    if (rest.action) {
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
    if (code === CONTROL_CODES.continue) {
      continueAction();
      return true;
    }
    if (code === CONTROL_CODES.cancel) {
      stopAction();
      return true;
    }
    return false;
  };

  const toggleInventory = () => {
    if (screen.isOpen) {
      closeInventoryScreen();
    } else {
      openInventoryScreen();
      mainMenuOpen = false;
    }
    syncMenuState();
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
    [CONTROL_CODES.rest, () => (rest.action?.kind === 'rest' || !debugTools?.noclip) && toggleRest('rest')],
    [CONTROL_CODES.sleep, () => toggleRest('sleep')],
  ]);

  const playKeys = (code: string) => {
    const restAction = restActions.get(code);
    if (restAction) {
      restAction();
      return;
    }
    const quick = quickbarSlotForKey(code);
    const action = worldActionForKey(code);
    if (action === 'interact' && !compression.locksInput) {
      use();
    } else if (action === 'cancel') {
      queue.cancel();
      if (rest.action) {
        rest.stop(); // X also stops resting/sleeping at once, the same as Stop after an interruption
      }
    } else if (quick !== undefined && !compression.locksInput) {
      quickKey(quick);
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
        closeInventoryScreen();
        debugTools?.closeMenus();
      }
      syncMenuState();
    }
    return true;
  };

  const handleMenuKey = (e: KeyboardEvent): boolean => {
    if (debugTools?.handleKey(e)) {
      syncMenuState();
      return true;
    }
    if (e.code === CONTROL_CODES.inventory && !compression.locksInput) {
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
    if (e.code === CONTROL_CODES.inventory) {
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

  const lookDir = (): Vec3 => aimDirection(input.pitch, input.yaw);
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
      playtestObserver?.beginSearch(entity, nameOf(entity));
      search(entity);
      if (!screen.isOpen) {
        toggleInventory();
      }
    }
  }

  renderer.domElement.addEventListener('contextmenu', (e) => e.preventDefault());
  const handUids = () => ({
    right: inventory.hands.right?.uid ?? null,
    left: inventory.hands.left?.uid ?? null,
  });
  const meleeSelection = (
    preferredHand?: 'right' | 'left',
  ): {
    weapon: MeleeWeapon;
    profile: 'blunt' | 'cut' | 'pierce' | 'fists';
    hand?: 'right' | 'left';
    twoHanded: boolean;
    item?: (typeof inventory.hands)['right'];
  } => {
    const handOrder: readonly ('right' | 'left')[] = preferredHand ? [preferredHand] : ['right', 'left'];
    for (const hand of handOrder) {
      const item = inventory.hands[hand];
      const weapon = item && registry.items.get(item.type)?.weapon?.melee;
      if (item && weapon) {
        return {
          weapon,
          profile: weapon.type,
          hand,
          twoHanded: registry.items.get(item.type)?.twoHanded ?? false,
          item,
        };
      }
    }
    return {
      weapon: FISTS_MELEE,
      profile: 'fists',
      ...(preferredHand === undefined ? {} : { hand: preferredHand }),
      twoHanded: false,
    };
  };
  const meleeWeapon = () => meleeSelection().weapon;

  const swing = (preferredHand?: 'right' | 'left') => {
    const selected = meleeSelection(preferredHand);
    const result = startPlayerMelee(zombieSystem, sim.needs, {
      origin: eye(),
      direction: lookDir(),
      weapon: selected.weapon,
      profile: selected.profile,
      ...(selected.hand === undefined ? {} : { hand: selected.hand }),
      twoHanded: selected.twoHanded,
      hands: handUids(),
      aimYaw: input.yaw,
      aimPitch: input.pitch,
    });
    if (result === 'too-tired') {
      showNotice('You are too tired to swing');
    }
  };

  performPrimaryAction = (hand: 'right' | 'left') => {
    const action = selectPrimaryAction(registry, inventory.hands, hand);
    switch (action.kind) {
      case 'melee':
        swing(action.hand);
        return;
      case 'light': {
        const reason = survival.use(action.item);
        if (reason) {
          showNotice(reason);
        }
        return;
      }
      case 'firearm':
        showNotice('Firearms are not usable yet');
        return;
      case 'fists':
        swing(action.hand);
        return;
      case 'noop':
        return;
      case 'none':
        showNotice(primaryActionHint(registry, action.item));
        return;
      default: {
        const unhandled: never = action;
        throw new Error(`Unhandled primary action ${String(unhandled)}`);
      }
    }
  };
  // Buttons 3 and 4 are the browser's history Back/Forward; swallow every phase of them so a press never navigates away.
  // Listened on the document (capture) in case the pointer-lock target isn't the canvas; the mouse and pointer
  // events can both arrive for one press, so the forward press is deduped.
  const swallowSideButton = (e: MouseEvent) => {
    if (e.button === 3 || e.button === 4) {
      e.preventDefault();
    }
  };
  for (const type of ['pointerdown', 'mousedown', 'mouseup', 'auxclick']) {
    document.addEventListener(type, (e) => swallowSideButton(e as MouseEvent), true);
  }

  const forwardPress = new PressDedupe();
  const onForwardPress = (e: MouseEvent) => {
    if (!(isForwardButton(e) && forwardPress.accept(e.timeStamp))) {
      return;
    }
    if (!input.locked || input.menuPointer || compression.locksInput || debugTools?.buildOn) {
      return;
    }
    // Mouse 5 (side forward): the left hand's instant use (a light on/off), the same path as a quickbar second press.
    const item = offHandUse(registry, inventory);
    const reason = item && survival.use(item);
    if (reason) {
      showNotice(reason);
    }
  };
  document.addEventListener('pointerdown', onForwardPress, true);
  document.addEventListener('mousedown', onForwardPress, true);
  renderer.domElement.addEventListener('mousedown', (e) => {
    if (!input.locked || input.menuPointer || compression.locksInput || !debugTools?.buildOn) {
      return;
    }
    debugTools.click(e.button, eye(), lookDir());
  });

  // ---- loop ----

  let last = performance.now();
  let lastDebugUpdate = 0;
  let fps = 0;
  // Debug readout: frame intervals and CPU work alongside simulation, rendering and mesh timings.
  const frameInterval = new FrameTimes();
  const frameWork = new FrameTimes();
  let simulationMs = 0;
  let renderMs = 0;
  let meshingQueueMs = 0;

  const displayCalendar = (): number => sim.calendar;
  const clockText = (): string => {
    const speed = compression.c > 1.05 ? `   ×${compression.c.toFixed(0)}` : '';
    return `${formatClock(displayCalendar())}${speed}${sim.paused ? '   paused' : ''}`;
  };

  const needsText = (): string => {
    const { calories, hydration, fatigue, health, stamina } = sim.needs;
    const light = survival.lit ? `   light ${Math.round((chargeShare(registry, survival.lit) ?? 0) * 100)}%` : '';
    return [
      `health ${health.toFixed(0)}%   stamina ${stamina.toFixed(0)}%${session.sprinting ? ' (sprinting)' : ''}${light}`,
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
    if (messages && compression.interruption !== undefined && !rest.action) {
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
    cameraRoll = feedback.roll;
    camera.rotation.copy(cameraRotation(input.pitch, input.yaw, feedback.roll));
    $('damage').style.opacity = String(feedback.vignetteOpacity);
  };

  const updateDebugReadout = (now: number): void => {
    if (!debugTools || now - lastDebugUpdate < 250) {
      return;
    }
    lastDebugUpdate = now;
    debugTools.update({
      fps,
      frame: frameInterval.summary(),
      work: frameWork.summary(),
      seed: config.seed,
      radius: config.radiusM,
      movement: input.walking ? 'walking' : 'jogging',
      position: [body.pos[0] * s, body.pos[1] * s, body.pos[2] * s],
      chunks: meshes.count,
      pending: streamer.pending,
      holes: streamer.unmeshedColumns(body.pos[0], body.pos[2], config.radiusChunks),
      zombies: zombieStore.size,
      sounds: audio.heardSounds,
      simulationMs,
      renderMs,
      meshingQueueMs,
      entities: zombieStore.size + [...entities.all].length + inventory.piles.size,
      memoryBytes:
        [...engine.world.chunks.values()].reduce((sum, chunk) => sum + chunk.bytes, 0) +
        engine.meshes.group.children.reduce((sum, child) => {
          const mesh = child as unknown as {
            geometry?: { attributes?: Record<string, { array?: { byteLength: number } }> };
          };
          return (
            sum +
            Object.values(mesh.geometry?.attributes ?? {}).reduce(
              (bytes, attribute) => bytes + (attribute.array?.byteLength ?? 0),
              0,
            )
          );
        }, 0),
      clock: formatClock(displayCalendar()),
      compression: compression.c,
      snapshotLastMs: snapshotHistory.lastMs ?? 0,
      snapshotP95Ms: snapshotHistory.p95Ms,
      snapshotCount: snapshotHistory.count,
      revealedZombies: revealZombies
        ? [...zombieStore.entries()]
            .map(([, { body: zombieBody }]) => zombieBody.pos.map((v) => (v * s).toFixed(1)).join(','))
            .slice(0, 40)
        : [],
    });
  };

  const renderHandlingFrame = (): void => {
    if (screen.isOpen || !hudVisibility(hudOptions).handling) {
      handlingBox.hidden = true;
      return;
    }
    renderHandling(handlingBox, queue);
  };

  const updateHeldItems = (dt: number): void => {
    camera.updateMatrixWorld(); // the beam follows this frame's view, not the last one's
    const selectedMelee = meleeSelection();
    const ready = shouldEnterMeleeReady({
      rightMouseHeld: input.rightMouseHeld && input.locked && !input.menuPointer,
      meleeWeaponHeld: selectedMelee.item !== undefined,
      handsEmpty: !(inventory.hands.right || inventory.hands.left),
      debugBuild: debugTools?.buildOn ?? false,
      inputLocked: compression.locksInput,
    });
    const action = zombieSystem.activeMeleeAction;
    const elapsed = action
      ? Math.min(action.cooldown, action.elapsed + (sim.paused ? 0 : Math.max(0, sim.time - session.lastPlayerStep)))
      : 0;
    const pose = renderMeleePose(action, elapsed, ready);
    meleeRecoilTime = Math.max(0, meleeRecoilTime - dt);
    const recoil = meleeRecoilStrength * Math.max(0, Math.min(1, meleeRecoilTime / 0.08));
    held.update(camera, pose, recoil);
    flashlight.update(registry, survival.lit, held, camera);
  };

  /** The scheduler's player tick (which carries noclip) is stopped by the debug freeze, so noclip flight is stepped here instead. */
  const stepFrozenNoclip = (dt: number, frozenAndPlaying: boolean): void => {
    if (!(frozenAndPlaying && debugTools?.noclip && input.locked && !input.menuPointer)) {
      return;
    }
    debugTools.stepNoclip({
      body,
      scale,
      yaw: input.yaw,
      pitch: input.pitch,
      intent: input.intent(),
      descend: input.held.has('KeyR'),
      dt,
    });
  };

  /** Advances the simulation one frame; returns whether the debug game freeze (M) is on. */
  const stepSimulation = (dt: number, menuPaused: boolean): boolean => {
    // The freeze stops the sim like the pause menu does, but without the overlay or pointer release.
    const gameFrozen = debugTools?.frozen ?? false;
    sim.paused = menuPaused || gameFrozen;
    session.frame(dt, skipUntil);
    // A running time skip simply waits out the freeze: a paused sim.frame leaves its target and compression alone.
    if (skipUntil !== undefined) {
      updateSkip(skipUntil);
    }
    stepFrozenNoclip(dt, gameFrozen && !menuPaused);
    return gameFrozen;
  };

  const updateDebugTargets = () => {
    if (!debugTools) {
      return;
    }
    const aim = debugTools.aimEnabled ? zombieSystem.aimAt(eye(), lookDir(), meleeWeapon()) : undefined;
    debugTools.updateAim(aim);
    debugTools.updateLookedAt(eye(), lookDir(), input.locked);
  };

  const frame = (now: number) => {
    const workStart = performance.now();
    const realSeconds = Math.max(0, (now - last) / 1000);
    const dt = Math.min(0.1, realSeconds);
    frameInterval.record(now, now - last);
    last = now;
    fps += (1 / Math.max(dt, 1e-3) - fps) * 0.05;

    const menuState = syncMenuState();
    let mark = performance.now();
    streamer.update(body.pos[0], body.pos[2]);
    meshingQueueMs = performance.now() - mark;
    playtestObserver?.beforeFrame(queue, inventory);
    mark = performance.now();
    const gameFrozen = stepSimulation(dt, menuState.paused);
    simulationMs = performance.now() - mark;
    playtestObserver?.afterFrame(
      { realSeconds, screenOpen: screen.isOpen, visible: document.visibilityState === 'visible' },
      queue,
      session,
    );
    if (
      playtestObserver?.frame({
        realSeconds,
        paused: sim.paused,
        visible: document.visibilityState === 'visible',
        compression: compression.c,
        interruption: compression.interruption,
        now,
      })
    ) {
      saveMetrics();
    }
    const hour = hourOfDay(sim.calendar);
    const sky = skyInWeather(skyAt(hour), weather);
    applySky(engine.sky, sky);
    engine.mood.setSky(sky);
    piles.sync(inventory);
    furniture.sync(entities);
    const zombieAlpha = Math.max(0, Math.min(1, (sim.time - session.lastZombieStep) * 20));
    zombieMeshes.setCamera?.(camera); // only MobActorMeshes uses this (distance LOD + frustum culling)
    zombieMeshes.sync(zombieStore, dt, zombieAlpha, debugTools !== undefined && (zombieSystem.isFrozen || gameFrozen));
    updateDebugTargets();
    updateDebugReadout(now);
    mark = performance.now();

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
    menuPointer.update();

    hud.textContent = hudText(debugTools?.target(eye(), lookDir(), input.locked) ?? '');
    hud.hidden = hud.textContent === '';
    $('crosshair').hidden = !hudVisibility(hudOptions).crosshair;
    prompt.textContent = promptText(now);
    prompt.hidden = prompt.textContent === '';
    document.body.classList.toggle('resting', rest.action !== undefined);
    renderRest(restBox, rest.action, sim);
    screen.update();
    inventoryStats.hidden = !screen.isOpen;
    inventoryStats.textContent = needsText();
    drawQuickbar();
    quickbarBox.hidden = (debugTools?.buildOn ?? false) || !hudVisibility(hudOptions).quickbar;
    renderHandlingFrame();
    flashlight.daylightScale = flashlightDaylightScale(sky);
    flashlight.shadowsAllowed = engine.shadows.torchOn;
    updateHeldItems(dt);
    engine.shadows.update(sunShadowStrength(sunDirection(hour)[1], sky.lightIntensity), camera.position);
    const renderStart = performance.now();
    engine.mood.render(() => held.render(renderer, camera, engine.sky));
    renderMs = performance.now() - renderStart;
    frameWork.record(now, performance.now() - workStart);
    finishFrame();
  };

  /** Stops play and shows what happened; "New world" reloads with the next seed. */
  const die = ({ cause, time }: { cause: string; time: number }) => {
    input.unlock();
    metrics.recordDeath(cause, time * sim.clock.ratio);
    saveMetrics();
    closeInventoryScreen();
    inventoryPanel.hidden = true;
    syncMenuState();
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
  // Shaders compile while the world streams in behind the main menu: started now, not awaited, so
  // nothing waits for it. Models that load later (glTF materials) compile when first drawn.
  engine.shadows
    .warmUp(engine.mood, [{ scene, camera }, held.warmUpTarget])
    .catch((error: unknown) => showNotice(`Shader warm-up failed: ${String(error)}`));
  requestAnimationFrame(frame);
};
