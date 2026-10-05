// Normal play: walk, look, loot, manage what you carry, eat, drink and light your way.
// The simulation core runs the clock, the player's physics, needs and the handling
// queue; Esc pauses it. When health runs out, the death screen offers a new world.

import assetManifest from '../content/base/assets/manifest.json' with { type: 'json' };
import { validateManifest } from '../core/assets.ts';
import type { BlockEntity } from '../core/blockEntities.ts';
import { dominantSide, offSide } from '../core/character.ts';
import { nextTimeOfDay, skipTarget } from '../core/clock.ts';
import { SKIP_COMPRESSION } from '../core/compression.ts';
import type { Vec3 } from '../core/coords.ts';
import type { WorkOperation } from '../core/craftCommands.ts';
import { pickFurniture } from '../core/furniturePick.ts';
import type { HandSide, Pile } from '../core/inventory.ts';
import type { Item } from '../core/items.ts';
import { chargeShare, offHandUse } from '../core/lights.ts';
import { doorOptions, doorPlan, type UseOption, useOption } from '../core/options.ts';
import type { SaveSnapshot } from '../core/saveState.ts';
import { isForwardButton, PressDedupe } from '../core/sideButton.ts';
import type { SoundEmission } from '../core/soundPicker.ts';
import { FISTS_MELEE, type MeleeWeapon } from '../core/zombies.ts';
import { FrameTimes } from '../render/frameTimes.ts';
import { renderMeleePose } from '../render/meleePose.ts';
import { startPlayFrames } from '../render/playFrames.ts';
import { createPlayView } from '../render/playView.ts';
import { renderAudioOptions } from '../ui/audioOptions.ts';
import { mountCraftPanel } from '../ui/craftController.ts';
import { mountCredits } from '../ui/credits.ts';
import { newWorldQuery, showDeath } from '../ui/death.ts';
import { mountGameCursor } from '../ui/gameCursor.ts';
import { quickbarKey, renderQuickbar } from '../ui/hud.ts';
import { hudVisibility, readHudOptions, renderHudOptions, writeHudOptions } from '../ui/hudOptions.ts';
import { InventoryScreen } from '../ui/inventoryScreen.ts';
import { mountMenuPointer } from '../ui/menuPointer.ts';
import { computeMenuState } from '../ui/menuState.ts';
import {
  type PlayStatus,
  playHudText,
  playInteractionText,
  playNeedsText,
  playPromptText,
  renderPlayHandling,
  renderPlayHud,
  renderPlayInventoryStats,
} from '../ui/playHud.ts';
import { playReadout } from '../ui/playReadout.ts';
import { primaryActionHint } from '../ui/primaryActionHint.ts';
import { mountReading } from '../ui/reading.ts';
import { renderRest } from '../ui/rest.ts';
import type { SaveController } from '../ui/saveController.ts';
import { aimDirection } from './aim.ts';
import { GameAudio } from './audio.ts';
import { firearmShotSound, handlingMoveCompleteCue, handlingMoveStartCue } from './audioPresentation.ts';
import type { DebugModule, DebugRuntime } from './debugInterface.ts';
import { DOOR_ACTION } from './doorAction.ts';
import type { Engine } from './engine.ts';
import { firearmHandlingFor } from './firearmHandling.ts';
import { DebugFirearmTrigger } from './firearmTrigger.ts';
import { Input } from './input.ts';
import { type InputCommand, type InputContext, keyboardInput } from './inputBindings.ts';
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
import { selectPrimaryAction } from './primaryAction.ts';
import { QuickbarActions } from './quickbarActions.ts';
import { QuickbarInput } from './quickbarInput.ts';
import type { ReloadBinding } from './reloadInput.ts';
import { createSession } from './session.ts';
import { populateTestHouseRepairCorner } from './testHouse.ts';
import { Unpacking } from './unpacking.ts';
import { playerStartFromWorld } from './worldSetup.ts';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
/** Metres: how far away you can open a door or search a container you're looking at. */
const USE_REACH = 2;
/** Sim seconds of slack for a debug time skip "reaching its target"; the clamped last frame lands within float error of it. */
const SKIP_SLACK = 1e-6;

export interface StartPlayOptions {
  readonly handedness?: HandSide;
  readonly restore?: Readonly<SaveSnapshot>;
  readonly saveController?: SaveController;
}

export const startPlay = (
  engine: Engine,
  debugModule?: DebugModule,
  options: StartPlayOptions = {},
): { enter: () => void } => {
  const { config, registry, streamer, renderer, camera, meshes } = engine;
  const inputTarget = renderer?.domElement ?? $('view');
  if (options.saveController) {
    streamer.onGenerationError = (error) => {
      if (!options.saveController?.refuseRestore(error)) {
        throw error;
      }
    };
  }
  const { scale } = config;
  const s = scale.blockSize;
  const eyeHeight = PLAYER.eye / s;

  const playerStart = playerStartFromWorld(engine, scale);
  let debugTools: DebugRuntime | undefined;
  const input = new Input(inputTarget, () => !debugTools?.buildOn);
  input.yaw = playerStart.yaw;
  let performHandUse: (hand: 'right' | 'left') => void = () => undefined;
  const audio = new GameAudio({
    registry,
    blockSize: s,
    isSolid: engine.isSolid,
    report: (message) => {
      const errors = $('errors');
      errors.textContent = [errors.textContent, message].filter(Boolean).join('\n');
    },
  });
  document.addEventListener('pointerdown', () => audio.unlock(), { once: true });
  const playSessionSound = (sound: Readonly<SoundEmission>): void =>
    audio.play(sound, sound.position.map((v) => v * s) as Vec3);

  // ---- simulation ----

  let playtestObserver: PlaytestObserver | undefined;
  const firearmTrigger = new DebugFirearmTrigger();
  const session = createSession({
    registry,
    handedness: options.handedness,
    world: engine.world,
    isSolid: engine.isSolid,
    isOpaque: engine.isOpaque,
    scale,
    seed: config.seed,
    start: config.start,
    spawn: playerStart.position,
    entities: engine.entities,
    stairFlights: engine.site?.stairFlights ?? [],
    terrainFloor: (x, z) => engine.groundAt(x * s, z * s) / s,
    ...(options.restore ? { restore: options.restore } : {}),
    ready: (x, z) => streamer.isReady(x, z),
    controls: {
      active: () => input.locked && !input.menuPointer,
      intent: () => input.intent(),
      consumeDominantUse: () => input.consumeDominantUse(),
      consumeOffUse: () => input.consumeOffUse(),
      useDominant: () => {
        // Build-mode canvas clicks belong exclusively to the block editor, not the held-item action.
        const action = selectPrimaryAction(inventory);
        if (
          !(
            debugTools?.buildOn ||
            (config.debug && action.kind === 'firearm' && !registry.items.get(action.item.type)?.firearm?.pump)
          )
        ) {
          performHandUse(dominantSide(inventory.character));
        }
      },
      heldDominantUse: (time, pressed, triggerHeld) => {
        const action = selectPrimaryAction(inventory);
        const weapon =
          config.debug &&
          !debugTools?.buildOn &&
          !queue.busy &&
          action.kind === 'firearm' &&
          !registry.items.get(action.item.type)?.firearm?.pump
            ? action.item
            : undefined;
        const deadlines = firearmTrigger.advance(time, triggerWeapon(weapon, pressed), pressed, triggerHeld);
        if (weapon) {
          for (const deadline of deadlines) {
            fireDebugWeapon(weapon, deadline);
          }
        }
      },
      useOff: () => {
        if (!debugTools?.buildOn) {
          performHandUse(offSide(inventory.character));
        }
      },
      yaw: () => input.yaw,
      pitch: () => input.pitch,
      walking: () => input.walking,
      descending: () => keyboardInput.held('noclip.descend'),
    },
    // The session works in blocks; playback is in metres.
    audio: {
      play: playSessionSound,
      onMoveStart: (move, ownerLocation, position, time) => {
        const cue = handlingMoveStartCue(move, ownerLocation, position);
        if (cue) {
          session.playWorldSound(cue.event, cue.position, time);
        }
      },
      onMoveComplete: (move, time) => {
        const cue = handlingMoveCompleteCue(move);
        if (cue) {
          session.playWorldSound(cue.event, cue.position, time);
        }
      },
    },
    notice: (text) => showNotice(text),
    onRead: (readable) => reading.open(readable),
    onHandlingOutcomes: (result) => playtestObserver?.handlingOutcomes(result),
    onFirearmEjection: (effect) => caseEffects.spawn(effect),
    debug: () => debugTools,
    // Presentation only: what the simulation decided (a part severed, a zombie dead) drawn as debris and a
    // corpse. Only MobActorMeshes implements these; ZombieMeshes leaves them undefined.
    zombieEffects: {
      onSever: (id, zombie, part, hit) => zombieMeshes.zombieSevered?.(id, part, hit, zombie),
      onIncapacitated: (id, zombie) => zombieMeshes.zombieIncapacitated?.(id, zombie),
      onDeath: (id, zombie) => zombieMeshes.zombieDied?.(id, zombie, [...body.pos]),
      ...(config.debug ? { onMeleeResult: (result) => debugTools?.recordMeleeResult(result) } : {}),
      onMeleeContact: (impulse) => view.recoil(impulse),
    },
  });
  const {
    sim,
    inventory,
    entities,
    queue,
    firearms,
    quickbar,
    survival,
    rest,
    body,
    feet,
    pileDistance,
    entityDistance,
    nameOf,
    search,
  } = session;
  const useItem = (item: Item): string | undefined =>
    firearms.supportsUse(item) ? firearms.use(item, sim.time) : survival.use(item);
  const { compression } = sim;
  const unpacking = new Unpacking(inventory, queue, feet);
  if (session.restoredLook) {
    input.yaw = session.restoredLook.yaw;
    input.pitch = session.restoredLook.pitch;
    input.walking = session.restoredLook.walk;
  }
  let snapshotIds = {
    worldId: options.restore?.world.id ?? '',
    characterId: options.restore?.character.id ?? '',
  };
  const captureSnapshot = () => session.snapshot(snapshotIds);
  const snapshotHistory = createSnapshotHistory();
  if (!(options.saveController || options.restore)) {
    snapshotIds = { worldId: crypto.randomUUID(), characterId: crypto.randomUUID() };
  }
  const { zombies: zombieSystem, playerCombat, zombieStore } = session;
  if (!options.restore) {
    startingLoadout(inventory);
    populateTestHouseRepairCorner({
      inventory,
      registry,
      site: config.site,
      spawn: engine.spawn.pos,
      blockSize: s,
    });
  }
  // Furniture, with the loot rolled for it, arrives with its column.
  streamer.onColumn = (cx, cz) => {
    session.onColumn(cx, cz, engine.site);
    for (const { spec, loot } of engine.furnitureIn(cx, cz)) {
      inventory.furnish(spec, loot);
    }
  };
  const view = createPlayView(engine, inventory, (message) => {
    const box = $('errors');
    box.textContent = [box.textContent, message].filter(Boolean).join('\n');
  });
  const { weather, caseEffects, flashlight, zombieMeshes } = view;
  const damageEvents = sim.events.reader();

  // ---- UI ----

  const overlay = $('overlay');
  const gameCursor = mountGameCursor($('game-cursor-root'));
  const inventoryPanel = $('inventory');
  const reading = mountReading($('reading'), () => syncMenuState());
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

  // ---- furniture: searching and doors ----

  const toggleDoor = (entity: BlockEntity) => {
    const option = doorOptions(inventory, entity)[0]!;
    if (!option.plan.ok) {
      showNotice(option.plan.reason);
      return;
    }
    queue.enqueueAction(DOOR_ACTION, `${option.label} the ${nameOf(entity)}`, option.plan.time, {
      entityUid: entity.uid,
      closing: option.operation === 'close',
    });
  };

  const activateKey = (item: Item) => {
    const entity = lookedAt();
    if (!(entity && entities.defOf(entity).door)) {
      return;
    }
    const lock = registry.items.get(item.type)?.key?.lock;
    if (lock === undefined) {
      return;
    }
    const operation = entity.lock?.locked ? 'unlock' : 'lock';
    const plan = doorPlan(inventory, entity, operation, [lock]);
    if (!plan.ok) {
      showNotice(plan.reason);
      return;
    }
    queue.enqueueAction(DOOR_ACTION, `${operation === 'lock' ? 'Lock' : 'Unlock'} the ${nameOf(entity)}`, plan.time, {
      entityUid: entity.uid,
      locked: operation === 'lock',
    });
  };

  const screen = new InventoryScreen(inventoryPanel, inventory, queue, {
    feet,
    reach: session.reach,
    nearby: () => session.reach().piles,
    distance: (pile: Pile) => pileDistance(pile.pos),
    containers: () => session.reach().furniture,
    entityDistance,
    search: (entity) => {
      playtestObserver?.beginSearch(entity, nameOf(entity));
      return search(entity);
    },
    searching: session.searching,
    notice: showNotice,
    use: useItem,
    useOption: (item, reachView): UseOption =>
      firearms.supportsUse(item) ? firearms.useOption(item) : useOption(item, reachView),
    describe: (item) => [...survival.describe(item), ...firearms.describe(item)],
    workOptions: (uid) => session.crafting.options(uid),
    work: (uid, operation) => actOnWork(uid, operation),
    assign: (slot, item) => {
      quickbar.assign(slot, item);
      showNotice(`${inventory.name(item)} on quickbar ${slot + 1}`);
    },
  });

  const craftPanel = mountCraftPanel($('crafting'), $('craft-status'), session, {
    notice: showNotice,
    started: () => {
      closeInventoryScreen();
      syncMenuState();
    },
    continue: () => continueAction(),
    stop: () => stopAction(),
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
  const measureSnapshot = () => playtestObserver!.measureSnapshot(captureSnapshot, session);
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
    newGame: options.restore === undefined,
    sim,
    input,
    roll: () => view.cameraRoll,
    zombies: () => zombieSystem,
    feet,
    showNotice,
    spawnItem,
    compress: () => compress(),
    skipGameHours: (hours) => skipGameHours(hours),
    setTimeOfDay: (hour, minute) => {
      const timeOfDay = hour * 3600 + minute * 60;
      sim.setDebugCalendarTime(nextTimeOfDay(sim.calendar, timeOfDay));
      options.saveController?.rearmAutosaveAfterTimeSeek();
    },
    revealZombies: (enabled) => {
      revealZombies = enabled;
    },
    measureSnapshot,
    exportMetrics,
  });

  let started = options.restore !== undefined;
  let mainMenuOpen = true;
  let resumeRequested = false;
  const syncMenuState = (pointerLockChanged = false) => {
    const state = computeMenuState({
      started,
      mainMenuOpen,
      inventoryOpen: screen.isOpen,
      readingOpen: reading.isOpen,
      debugMenuOpen: debugTools?.menuOpen ?? false,
      pointerLocked: input.locked,
      dead: sim.dead !== undefined,
      pointerLockChanged,
      resumeRequested,
      ...(started || !options.saveController ? {} : { titleNewWorldLabel: options.saveController.titleNewWorldLabel }),
      titleActive: Boolean(options.saveController && !options.saveController.isEntered),
    });
    ({ started, mainMenuOpen } = state);
    if (pointerLockChanged || state.closeOtherMenus) {
      resumeRequested = false;
    }
    if (state.closeOtherMenus) {
      reading.close();
      closeInventoryScreen();
      debugTools?.closeMenus();
    }
    input.menuPointer = state.menuPointer;
    keyboardInput.sync();
    overlay.hidden = state.overlayHidden;
    if (options.saveController) {
      options.saveController.setGoLabel(state.goLabel);
    } else {
      $('go').textContent = state.goLabel;
    }
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
    if (target?.closest('#go') || target?.closest('#save-replace-confirm') || (!input.locked && target === overlay)) {
      resume();
    }
  });
  const menuPointer = mountMenuPointer({ input, canvas: inputTarget, cursor: gameCursor });
  inputTarget.addEventListener('click', () => {
    if (mainMenuOpen) {
      resume();
      return;
    }
    if (input.locked || screen.isOpen || reading.isOpen || debugTools?.menuOpen || sim.dead) {
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

  const actOnWork = (uid: number, operation: WorkOperation): string | undefined => {
    const reason = session.crafting.act(uid, operation);
    if (!reason && operation === 'continue') {
      closeInventoryScreen();
      syncMenuState();
    }
    return reason;
  };

  /** Continue a craft, rest/sleep, or the debug compression test. */
  const continueAction = (): void => {
    const workUid = session.crafting.currentUid;
    if (workUid !== undefined) {
      const reason = actOnWork(workUid, 'continue');
      if (reason) {
        showNotice(`Can't continue: ${reason}`);
      }
    } else if (rest.action || sim.actions.job?.jobType === 'reading') {
      const reason = rest.action ? rest.resume() : sim.actions.resume();
      if (reason) {
        showNotice(`Can't continue: ${reason}`);
      }
    } else {
      compress();
    }
  };

  /** Stop the current long action without discarding owned progress. */
  const stopAction = (): void => {
    if (sim.actions.job?.jobType === 'craft' || sim.actions.job?.jobType === 'reading') {
      sim.actions.stop();
    } else if (rest.action) {
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
    if (code === 'compression.continue') {
      continueAction();
      return true;
    }
    if (code === 'handling.stop') {
      stopAction();
      return true;
    }
    return false;
  };

  const toggleInventory = () => {
    quickbarInput.cancel();
    if (screen.isOpen) {
      closeInventoryScreen();
    } else {
      openInventoryScreen();
      mainMenuOpen = false;
    }
    syncMenuState();
  };

  const quickbarActions = new QuickbarActions({ inventory, queue, feet, survival, notice: showNotice });
  const quickbarTap = (slot: number) => {
    const item = quickbar.resolve(slot, inventory);
    if (!item) {
      showNotice(`Quickbar ${slot + 1} is empty`);
      return;
    }
    quickbarActions.tap(item);
  };
  const quickbarHold = (slot: number) => {
    const item = quickbar.resolve(slot, inventory);
    if (!item) {
      showNotice(`Quickbar ${slot + 1} is empty`);
      return;
    }
    quickbarActions.hold(item);
  };
  const quickbarInput = new QuickbarInput({ tap: quickbarTap, hold: quickbarHold });
  globalThis.addEventListener('blur', () => quickbarInput.cancel());

  /** Default-view R is reload only; menus own their own bindings (including inventory rotation). */
  const reloadBinding = (): ReloadBinding | undefined => {
    if (!input.locked || input.menuPointer || compression.locksInput || sim.paused || sim.dead || debugTools?.buildOn) {
      return;
    }
    const uid = firearms.reloadableUid();
    if (uid === undefined) {
      return;
    }
    return {
      uid,
      busy: () => queue.busy || firearms.busy,
      load: () => {
        const reason = firearms.loadNext(uid, sim.time);
        if (reason) {
          showNotice(reason);
        }
        return reason === undefined;
      },
      rack: () => {
        const reason = firearms.cock(uid, sim.time);
        if (reason) {
          showNotice(reason);
        }
      },
      cancelLoad: () => firearms.cancelLoad(uid),
    };
  };

  const playContext = (): InputContext => {
    if (mainMenuOpen || sim.dead) {
      return 'menu';
    }
    if (reading.isOpen) {
      return 'reading';
    }
    if (screen.isOpen) {
      return 'inventory';
    }
    if (compression.interruption !== undefined) {
      return 'interrupted';
    }
    if (debugTools?.buildOn) {
      return 'build';
    }
    return debugTools?.noclip ? 'noclip' : 'play';
  };
  const inputContext = (): InputContext => {
    if (options.saveController && !options.saveController.isEntered) {
      return 'title';
    }
    if (debugTools?.spawnOpen) {
      return 'spawn';
    }
    if (debugTools?.menuOpen) {
      return 'debug-panel';
    }
    return playContext();
  };
  keyboardInput.context = () => ({ debug: config.debug, context: inputContext() });
  keyboardInput.cancelled = () => {
    input.cancel();
    quickbarInput.cancel();
  };
  keyboardInput.escape = () => reading.close();
  const modalCommand = (action: string): boolean => {
    if (action === 'ui.main-menu-toggle') {
      mainMenuOpen = !mainMenuOpen;
      if (mainMenuOpen) {
        reading.close();
        closeInventoryScreen();
        debugTools?.closeMenus();
      }
      syncMenuState();
      return true;
    }
    if (reading.isOpen) {
      reading.onAction(action);
      return true;
    }
    if (action === 'ui.inventory-toggle') {
      if (!compression.locksInput) {
        toggleInventory();
      }
      return true;
    }
    if (screen.isOpen) {
      screen.onAction(action);
      return true;
    }
    return mainMenuOpen || timeKeys(action);
  };
  const gameplayCommand = (action: string, at: number, slot: number | undefined): void => {
    switch (action) {
      case 'movement.walk-toggle':
        input.walking = !input.walking;
        break;
      case 'hand.use-off':
        input.useOff();
        break;
      case 'firearm.reload':
        input.reload.keyDown(at, reloadBinding());
        break;
      case 'world.interact':
        if (!compression.locksInput) {
          use();
        }
        break;
      case 'handling.stop':
        input.reload.cancel();
        queue.cancel();
        if (sim.actions.job) {
          stopAction();
        }
        break;
      default:
        break;
    }
    if (slot !== undefined && !compression.locksInput) {
      quickbarInput.keyDown(slot, at);
    }
  };
  const releaseCommand = (action: string, at: number, slot: number | undefined): void => {
    if (action === 'firearm.reload') {
      input.reload.keyUp(at);
    }
    if (slot !== undefined) {
      quickbarInput.keyUp(slot, at);
    }
  };
  keyboardInput.command = ({ action, phase, at }: InputCommand) => {
    const slot = action.startsWith('quickbar.use.') ? Number(action.slice('quickbar.use.'.length)) - 1 : undefined;
    if (phase === 'up') {
      releaseCommand(action, at, slot);
      return;
    }
    if (action.startsWith('debug.') || action.startsWith('spawn.')) {
      debugTools?.handleAction(action);
      syncMenuState();
      return;
    }
    if (sim.dead) {
      return;
    }
    if (!modalCommand(action)) {
      gameplayCommand(action, at, slot);
    }
  };
  keyboardInput.install();
  keyboardInput.sync();
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
      isSolid: engine.isOpaque,
    });

  const keyLockHint = (entity: BlockEntity): string | undefined => {
    if (!entities.defOf(entity).door) {
      return undefined;
    }
    const heldKeys = [
      inventory.hands[dominantSide(inventory.character)],
      inventory.hands[offSide(inventory.character)],
    ].filter((item): item is Item => item !== undefined && registry.items.get(item.type)?.key !== undefined);
    const heldKey =
      heldKeys.find((item) => registry.items.get(item.type)?.key?.lock === entity.lock?.id) ?? heldKeys[0];
    const keyLock = heldKey && registry.items.get(heldKey.type)?.key?.lock;
    if (keyLock === undefined) {
      return undefined;
    }
    const operation = entity.lock?.locked ? 'unlock' : 'lock';
    const plan = doorPlan(inventory, entity, operation, [keyLock]);
    return `${operation === 'lock' ? 'Lock' : 'Unlock'}${plan.ok ? '' : ` — ${plan.reason}`}`;
  };

  /** Describes the displayed action for the selected target. */
  const useText = (entity: BlockEntity): string => {
    const door = entities.defOf(entity).door ? doorOptions(inventory, entity)[0] : undefined;
    return playInteractionText({
      doorReason: door?.plan.ok === false ? door.plan.reason : undefined,
      lock: keyLockHint(entity),
      door: Boolean(entities.defOf(entity).door),
      open: entity.open,
      container: Boolean(entity.pockets),
      readable: Boolean(entities.defOf(entity).readable),
      searched: entity.searched,
      name: nameOf(entity),
      fullName: entities.defOf(entity).name,
    });
  };

  /** F: doors first, then readable furniture, then container search/inventory. */
  function use(): void {
    const entity = lookedAt();
    if (!entity) {
      return;
    }
    if (entities.defOf(entity).door) {
      toggleDoor(entity);
    } else if (entities.defOf(entity).readable) {
      const reason = session.readFurniture(entity);
      if (reason) {
        showNotice(reason);
      }
    } else if (entity.pockets) {
      playtestObserver?.beginSearch(entity, nameOf(entity));
      search(entity);
      if (!screen.isOpen) {
        toggleInventory();
      }
    }
  }

  inputTarget.addEventListener('contextmenu', (e) => e.preventDefault());
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
    const handOrder: readonly ('right' | 'left')[] = preferredHand
      ? [preferredHand]
      : [dominantSide(inventory.character), offSide(inventory.character)];
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
    const result = startPlayerMelee(playerCombat, sim.needs, {
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

  const fireDebugWeapon = (item: Item, time: number): boolean => {
    const fired = firearms.fire({
      debugMode: config.debug,
      item,
      feet: feet(),
      eye: eye(),
      yaw: input.yaw,
      pitch: input.pitch,
      seed: config.seed,
      simTime: time,
      blockSize: s,
    });
    if (!fired) {
      return false;
    }
    if (registry.items.get(item.type)?.firearm?.pump) {
      view.recoil(8);
      return true;
    }
    const shot = firearmShotSound(item.type);
    session.playPlayerSound(shot.event, time, shot);
    return true;
  };

  const triggerWeapon = (weapon: Item | undefined, pressed: boolean) => {
    if (!weapon) {
      return;
    }
    const reason = firearms.fireReason(weapon.uid);
    if (reason) {
      if (pressed) {
        showNotice(reason);
      }
      return;
    }
    const { rpm } = firearmHandlingFor(weapon, registry);
    return rpm === undefined ? undefined : { uid: weapon.uid, rpm };
  };

  const noticeReason = (reason: string | undefined): void => {
    if (reason) {
      showNotice(reason);
    }
  };

  performHandUse = (hand: 'right' | 'left') => {
    const action = selectPrimaryAction(inventory, hand);
    switch (action.kind) {
      case 'unpack':
        noticeReason(unpacking.activate(action.item));
        return;
      case 'melee':
        swing(action.hand);
        return;
      case 'light':
      case 'read':
        noticeReason(survival.use(action.item));
        return;
      case 'firearm': {
        if (!fireDebugWeapon(action.item, sim.time)) {
          showNotice(
            config.debug || registry.items.get(action.item.type)?.firearm?.pump
              ? (firearms.fireReason(action.item.uid) ?? 'Firearm is not ready')
              : 'Firearms can only be fired in debug mode',
          );
        }
        return;
      }
      case 'fists':
        swing(action.hand);
        return;
      case 'noop':
        return;
      case 'key':
        activateKey(action.item);
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
    // Instant off-hand use shares Survival's owner with a quickbar second press.
    const item = offHandUse(registry, inventory);
    const reason = item && survival.use(item);
    if (reason) {
      showNotice(reason);
    }
  };
  document.addEventListener('pointerdown', onForwardPress, true);
  document.addEventListener('mousedown', onForwardPress, true);
  inputTarget.addEventListener('mousedown', (e) => {
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
  let renderMs: number | null = engine.renderer ? 0 : null;
  let meshingQueueMs = 0;

  const displayCalendar = (): number => sim.calendar;
  const statusView = (): PlayStatus => ({
    calendar: displayCalendar(),
    speed: compression.c,
    paused: sim.paused,
    needs: sim.needs,
    sprinting: session.sprinting,
    lightCharge: survival.lit ? (chargeShare(registry, survival.lit) ?? 0) : undefined,
  });
  const needsText = (): string => playNeedsText(statusView());
  const hudText = (looking: string): string =>
    playHudText(
      {
        ...statusView(),
        carriedGrams: inventory.carriedWeight(),
        fps,
        seed: config.seed,
        radiusMetres: config.radiusM,
        walking: input.walking,
        positionMetres: body.pos.map((v) => v * s),
        meshed: meshes.count,
        pending: streamer.pending,
        looking,
      },
      hudVisibility(hudOptions),
    );
  const promptText = (now: number): string => {
    const visible = hudVisibility(hudOptions);
    const entity = visible.interaction && input.locked && !debugTools?.buildOn ? lookedAt() : undefined;
    return playPromptText(
      {
        now,
        notice,
        noticeUntil,
        interactionHint: entity ? useText(entity) : undefined,
        interruption: compression.interruption,
        resting: rest.action !== undefined,
      },
      visible,
    );
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
        view.damage(event.amount);
      }
    }
    view.updateCamera(
      {
        dt,
        body,
        paused: sim.paused,
        noclip: debugTools?.noclip ?? false,
        yaw: input.yaw,
        pitch: input.pitch,
        eye: eye(),
      },
      $('damage'),
    );
  };

  const updateDebugReadout = (now: number): void => {
    if (!debugTools || now - lastDebugUpdate < 250) {
      return;
    }
    lastDebugUpdate = now;
    debugTools.update(
      playReadout({
        measurements: {
          fps,
          frame: frameInterval.summary(),
          work: frameWork.summary(),
          seed: config.seed,
          radius: config.radiusM,
          chunks: meshes.count,
          pending: streamer.pending,
          holes: streamer.unmeshedColumns(body.pos[0], body.pos[2], config.radiusChunks),
          zombies: zombieStore.size,
          sounds: audio.heardSounds,
          simulationMs,
          renderMs,
          meshingQueueMs,
          entities: zombieStore.size + [...entities.all].length + inventory.piles.size,
          compression: compression.c,
          snapshotLastMs: snapshotHistory.lastMs ?? 0,
          snapshotP95Ms: snapshotHistory.p95Ms,
          snapshotCount: snapshotHistory.count,
        },
        walking: input.walking,
        positionBlocks: body.pos,
        blockSize: s,
        calendar: displayCalendar(),
        chunks: engine.world.chunks.values(),
        drawn: engine.meshes.group.children,
        revealedPositions: revealZombies
          ? [...zombieStore.entries()].map(([, { body: zombieBody }]) => zombieBody.pos)
          : [],
      }),
    );
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
    const action = playerCombat.activeMeleeAction;
    const elapsed = action
      ? Math.min(action.cooldown, action.elapsed + (sim.paused ? 0 : Math.max(0, sim.time - session.lastPlayerStep)))
      : 0;
    const pose = renderMeleePose(action, elapsed, ready, dominantSide(inventory.character));
    view.updateHeld(dt, pose, survival.lit, { firearms: firearms.frames(), job: queue.jobs[0] });
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
      descend: keyboardInput.held('noclip.descend'),
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
    input.reload.advance(now, reloadBinding());
    if (screen.isOpen || mainMenuOpen || compression.locksInput || sim.dead) {
      quickbarInput.cancel();
    } else {
      quickbarInput.update(now);
    }
    playtestObserver?.beforeFrame(queue, inventory);
    mark = performance.now();
    const gameFrozen = stepSimulation(dt, menuState.paused);
    caseEffects.update(dt, engine.isSolid);
    simulationMs = performance.now() - mark;
    options.saveController?.afterFrame();
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
    const { hour, sky } = view.syncWorld({
      calendar: sim.calendar,
      time: sim.time,
      lastZombieStep: session.lastZombieStep,
      dt,
      entities,
      zombies: zombieStore,
      frozen: debugTools !== undefined && (zombieSystem.isFrozen || gameFrozen),
    });
    updateDebugTargets();
    updateDebugReadout(now);
    mark = performance.now();

    updateVisualFeedback(dt);
    audio.updateListener([camera.position.x, camera.position.y, camera.position.z], lookDir());
    menuPointer.update();

    renderPlayHud(
      { hud, prompt, crosshair: $('crosshair') },
      {
        hud: hudText(debugTools?.target(eye(), lookDir(), input.locked) ?? ''),
        crosshairVisible: hudVisibility(hudOptions).crosshair,
        prompt: promptText(now),
      },
    );
    document.body.classList.toggle('resting', rest.action !== undefined);
    renderRest(restBox, rest.action, sim);
    screen.update();
    craftPanel.update(screen.isOpen && !sim.dead);
    renderPlayInventoryStats(inventoryStats, screen.isOpen, needsText());
    drawQuickbar();
    quickbarBox.hidden = (debugTools?.buildOn ?? false) || !hudVisibility(hudOptions).quickbar;
    renderPlayHandling(handlingBox, queue, !screen.isOpen && hudVisibility(hudOptions).handling);
    view.prepareLighting(sky);
    updateHeldItems(dt);
    view.updateShadows(hour, sky);
    renderMs = view.render();
    frameWork.record(now, performance.now() - workStart);
    if (sim.dead) {
      die(sim.dead);
      return false;
    }
    return true;
  };

  /** Stops play and shows what happened; "New world" reloads with the next seed. */
  const die = ({ cause, time }: { cause: string; time: number }) => {
    input.unlock();
    metrics.recordDeath(cause, time * sim.clock.ratio);
    saveMetrics();
    reading.close();
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
  if (options.saveController) {
    snapshotIds = options.saveController.bindSession(
      captureSnapshot,
      () => sim.time,
      { blockSize: s, site: config.site, storeys: config.storeys, density: config.density },
      { clock: sim.clock, recordSnapshotDuration: (durationMs) => snapshotHistory.add(durationMs) },
    );
  }
  // Shaders compile while the world streams in behind the main menu: started now, not awaited, so
  // nothing waits for it. Models that load later (glTF materials) compile when first drawn.
  view.warmUp().catch((error: unknown) => showNotice(`Shader warm-up failed: ${String(error)}`));
  startPlayFrames(frame);
  return {
    enter: () => {
      audio.unlock();
      resume();
    },
  };
};
