import { PlayerControls, RELOAD_GESTURE_MS, type ReplayControlSample } from '@skelly/engine/input';
import { Compression, longActionLimits } from '@skelly/engine/internal/core/compression.ts';
import { simSeconds } from '@skelly/engine/internal/core/time.ts';
import type { CommandRouterPorts } from '@skelly/engine/internal/game/commandRouter.ts';
import { FirearmMechanics, type FirearmShotInput } from '@skelly/engine/internal/game/firearmHandling.ts';
import { planRealFrame } from '@skelly/engine/internal/game/frameDriver.ts';
import { registerWindowAction } from '@skelly/engine/internal/game/windowAction.ts';
import { firearmHandlingFor, HandlingQueue, Inventory, PILE_GRID, repairCeiling } from '@skelly/engine/inventory';
import { createCommandRouter, createSession, type Session } from '@skelly/engine/session';
import { Character, dominantSide, offSide, PlayerTickActions, realSeconds, type Simulation } from '@skelly/engine/sim';
import { makeScale, type Vec3, World } from '@skelly/engine/world';
import { describe, expect, it } from 'vitest';
import { stackActorFigureFiles } from './baseContentFiles.ts';
import { baseRegistry, baseRegistryWith } from './baseRegistry.ts';
import { fixtureSources } from './economyFixtures.ts';
import { FIXTURE_WAND, fixtureMagicGrants, fixtureMagicSource } from './fixtures/magic.ts';
import { COMPRESSION_CAPS_FIXTURE, Simulation as SimulationFixture } from './simulationFixture.ts';

const registry = baseRegistry();

const automaticRifleInHand = () => {
  const inventory = new Inventory(registry);
  for (const def of registry.items.values()) {
    const action = def.model ? registry.models.get(def.model)?.gun?.action : undefined;
    if (!action || action.triggerMode === 'semi') {
      continue;
    }
    const item = inventory.create(def.id);
    const data = firearmHandlingFor(item, registry);
    if (data.action.fire && data.roundsPerSimSecond !== undefined && !item.firearm?.cylinder) {
      if (!inventory.add(item, { kind: 'hand', side: dominantSide(inventory.character) })) {
        throw new Error(`${def.id} does not fit the dominant hand`);
      }
      return { inventory, item, roundsPerSimSecond: data.roundsPerSimSecond };
    }
  }
  throw new Error('No authored automatic firearm');
};

const unused = (): never => {
  throw new Error('This path does not reach this port');
};
const unusedGesture = { keyDown: unused, keyUp: unused };

/** Every port refuses to be reached unless a test supplies it. */
const routerPorts = (ports: Partial<CommandRouterPorts>): CommandRouterPorts => ({
  controls: new PlayerControls({ playing: () => true, viewerInputAllowed: () => true, held: () => false }),
  registry,
  session: unused,
  inventory: unused,
  sim: unused,
  presentation: {
    refusal: () => undefined,
    noPrimaryAction: unused,
    notice: unused,
    closeInventoryScreen: unused,
    syncMenuState: unused,
    openInventory: unused,
    openFurnitureChoices: unused,
    beginSearch: unused,
    weaponInspected: unused,
    throwVisual: unused,
    spectatorAllows: unused,
    screenInputCommand: unused,
    locomotionPressed: unused,
    modal: {
      toggleMainMenu: unused,
      mainMenuOpen: unused,
      readingOpen: unused,
      readingAction: unused,
      readingMovementAction: unused,
      toggleInventory: unused,
      screenOpen: unused,
      screenAction: unused,
    },
    debugCommand: unused,
    hintCommand: unused,
  },
  active: () => true,
  worldReady: unused,
  pointerLocked: unused,
  menuPointer: unused,
  beforeSleep: unused,
  replaying: () => false,
  replayPlayer: () => undefined,
  replaySample: () => undefined,
  setReplaySample: () => undefined,
  recorder: () => undefined,
  stopRecordingForColumnOverflow: unused,
  inputContext: unused,
  pendingPlayerTickActions: { enqueue: unused, applyAtNextTick: () => undefined },
  gunPose: { active: false, readyHeld: (live) => live, aimingDownSights: (live) => live },
  buildMode: () => false,
  handlingBusy: () => false,
  sprinting: () => false,
  itemThrowTuning: {
    maximumDistanceMetres: 0,
    chargeSimSeconds: 0,
    armSpeedMetresPerRealSecond: 0,
    armEnergyJoules: 0,
  },
  throwMinimumHoldSimSeconds: 0,
  scale: { blockSize: 1, minCy: 0 },
  pick: { worldSeed: 0, isSolid: unused, isOpaque: unused },
  advanceHeldStrip: () => undefined,
  selectedMagazineAction: () => undefined,
  firearmShotInput: unused,
  fire: unused,
  fireReason: () => undefined,
  descending: () => false,
  liveGestures: {
    crouchProne: unusedGesture,
    throwStance: unusedGesture,
    wornLight: unusedGesture,
    interact: unusedGesture,
    offHandUse: { keyDown: () => false, keyUp: unused },
    quickbar: unusedGesture,
    emote: unusedGesture,
    cancelHeld: unused,
  },
  ...ports,
});

describe('command router at an interruption prompt', () => {
  it('opens and closes the inventory over the prompt, which waits on until Stop ends the action', () => {
    const sim = new SimulationFixture({ seed: 1 });
    expect(sim.actions.startWait()).toBeUndefined();
    sim.emit({ kind: 'interrupt', reason: 'test interruption' });
    sim.frame(1);
    expect(sim.compression.interruption).toBe('test interruption');
    const session = { sim, rest: { action: undefined } } as unknown as Session;
    let inventoryOpen = false;
    const ports = routerPorts({ session: () => session });
    const router = createCommandRouter({
      ...ports,
      presentation: {
        ...ports.presentation,
        modal: {
          ...ports.presentation.modal,
          readingOpen: () => false,
          mainMenuOpen: () => false,
          screenOpen: () => inventoryOpen,
          toggleInventory: () => {
            inventoryOpen = !inventoryOpen;
          },
        },
      },
    });

    router.modalCommand('ui.inventory-toggle');
    expect(inventoryOpen).toBe(true);
    expect(sim.compression.refusesKeys).toBe(true);
    router.modalCommand('ui.inventory-toggle');
    expect(inventoryOpen).toBe(false);
    expect(sim.compression.interruption).toBe('test interruption');

    expect(router.modalCommand('handling.stop')).toBe(true);
    expect(sim.actions.job).toBeUndefined();
    expect(sim.compression.interruption).toBeUndefined();
  });
});

describe('command router furniture choices', () => {
  it('offers Repair on a repairable piece, as the action ring does', () => {
    const furniture = 'router_repair_furniture';
    const repairRegistry = baseRegistryWith(
      fixtureSources([
        {
          source: 'router-repair-fixture',
          data: {
            items: [
              { id: 'router_repair_stock', name: 'Fixture stock', category: 'material', size: [1, 1], weight: 1 },
            ],
            furniture: [{ id: furniture, name: 'Fixture furniture', size: [1, 1, 1], color: '#777777' }],
            recipes: [
              {
                id: 'router_repair',
                kind: 'repair',
                result: { item: 'router_repair_stock', count: 1 },
                repair: { entity: furniture, skill: 'crafting', amount: 0.2, perSkill: 0 },
                timeGameMinutes: 1,
                skills: {},
                qualities: {},
                components: [[{ item: 'router_repair_stock', count: 1 }]],
              },
            ],
          },
        },
      ]),
    );
    const character = new Character(repairRegistry);
    character.initializeProgression({}, ['router_repair']);
    const inventory = new Inventory(repairRegistry);
    const piece = inventory.entities.add({ type: furniture, pos: [0, 0, 0], size: [1, 1, 1], facing: 'n' })!;
    // Below its repair ceiling, since a piece at it is offered no Repair.
    inventory.entities.wear(piece, 1 - repairCeiling(repairRegistry, repairRegistry.recipes.get('router_repair')) / 2);
    const session = {
      inventory,
      entities: inventory.entities,
      character,
      isObjective: () => false,
      rest: { action: undefined },
      sim: { time: 0, compression: { admitKey: () => true } },
    } as unknown as Session;
    const offered: string[][] = [];
    const ports = routerPorts({
      registry: repairRegistry,
      session: () => session,
      inventory: () => inventory,
      sim: () => session.sim,
    });
    ports.presentation.openFurnitureChoices = (_entity, actions) => {
      offered.push(actions.map(({ id }) => id));
    };
    const router = createCommandRouter(ports);
    router.applyScreenCommand({ kind: 'furniture.interact', entityUid: piece.uid, alternatives: true });
    expect(offered).toHaveLength(1);
    expect(offered[0]).toContain('repair');
  });
});

describe('command router window aim', () => {
  const windowDef = [...registry.furniture.values()].find((def) => def.window?.initialPane === 'intact')!;
  const curtainDef = [...registry.boardings.values()].find((def) => def.curtain)!;
  /** A shut, latched window hung with a curtain, worked from its inside face through the real window action. */
  const curtained = (open: boolean) => {
    const inventory = new Inventory(registry);
    const window = inventory.entities.add({
      type: windowDef.id,
      pos: [0, 0, 0],
      size: [...windowDef.size],
      facing: 'n',
      fixed: true,
    })!;
    const inside: Vec3 = [window.size[0] / 2, 1, windowDef.window!.inside === 'back' ? 3 : -2];
    const refusal =
      inventory.entities.board(window, 'back', curtainDef.id) ??
      (open ? inventory.entities.operateWindow(window, 'openCurtain', inside, []) : undefined);
    if (refusal) {
      throw new Error(refusal);
    }
    inventory.actorPosition = () => inside;
    inventory.canReachEntity = () => true;
    const queue = new HandlingQueue(inventory);
    registerWindowAction(queue, inventory, () => []);
    const session = {
      inventory,
      entities: inventory.entities,
      queue,
      isObjective: () => false,
      rest: { action: undefined },
      sim: { time: 0, compression: { admitKey: () => true } },
    } as unknown as Session;
    const router = createCommandRouter(
      routerPorts({ session: () => session, inventory: () => inventory, sim: () => session.sim }),
    );
    const press = (payload: { alternatives?: true; part?: 'curtain' }) => {
      router.applyScreenCommand({ kind: 'furniture.interact', entityUid: window.uid, ...payload });
      queue.tick(Math.max(windowDef.window!.handlingSimSeconds, curtainDef.curtain!.handlingSimSeconds) + 1);
    };
    return { entities: inventory.entities, window, press };
  };

  it('toggles the curtain on use aimed at its cloth and leaves the sash shut and latched', () => {
    const { entities, window, press } = curtained(true);
    press({ part: 'curtain' });
    expect(entities.curtainClosed(window)).toBe(true);
    expect(window.window).toMatchObject({ open: false, latched: true });
    press({ part: 'curtain' });
    expect(entities.curtainClosed(window)).toBe(false);
    expect(window.window).toMatchObject({ open: false, latched: true });
  });

  it('works the window on use and hold aimed away from the cloth, leaving a closed curtain closed', () => {
    const { entities, window, press } = curtained(false);
    press({});
    expect(window.window).toMatchObject({ latched: false, open: false });
    press({});
    expect(window.window).toMatchObject({ open: true });
    press({});
    press({ alternatives: true });
    expect(window.window).toMatchObject({ open: false, latched: true });
    expect(entities.curtainClosed(window)).toBe(true);
  });
});

describe('command router', () => {
  it('fires an automatic weapon on the press tick, then at its cadence while the trigger is held', () => {
    const { inventory, roundsPerSimSecond } = automaticRifleInHand();
    // The router reads only the clock and the body's action refusal.
    const sim = { time: 0, body: { actionRefusal: undefined } } as unknown as Pick<Simulation, 'time' | 'body'>;
    // The gun is raised with the pointer in play, and the session holds it ready.
    const controls = new PlayerControls({ playing: () => true, viewerInputAllowed: () => true, held: () => false });
    controls.rightMouseHeld = true;
    const session = {
      sim: { compression: { locksInput: false } },
      firearms: { isReady: () => true },
      castCharge: { active: false },
    } as unknown as Session;
    const shots: number[] = [];
    const router = createCommandRouter(
      routerPorts({
        controls,
        session: () => session,
        pointerLocked: () => true,
        menuPointer: () => false,
        inventory: () => inventory,
        sim: () => sim,
        firearmShotInput: (_uid, atSimSeconds) => ({ simTime: atSimSeconds }) as FirearmShotInput,
        fire: (shot) => {
          shots.push(shot.simTime);
          return true;
        },
      }),
    );
    const interval = 1 / roundsPerSimSecond;
    router.controls.heldDominantUse!(1, true, true);
    expect(shots).toEqual([1]);
    router.controls.heldDominantUse!(1 + 1.5 * interval, false, true);
    expect(shots).toHaveLength(2);
    expect(shots[1]).toBeCloseTo(1 + interval, 9);
  });

  it('blocks a melee hit in a replay viewed without pointer lock, as the live run with the guard raised did', () => {
    // Empty hands and a raised guard: the recorded sample says input reached the world.
    const inventory = new Inventory(registry);
    const controls = new PlayerControls({ playing: () => true, viewerInputAllowed: () => true, held: () => false });
    controls.rightMouseHeld = true;
    const session = { sim: { compression: { locksInput: false } } } as unknown as Session;
    const sample = { active: true, inputLocked: false } as unknown as ReplayControlSample;
    const router = createCommandRouter(
      routerPorts({
        controls,
        session: () => session,
        inventory: () => inventory,
        replaying: () => true,
        replaySample: () => sample,
        // The viewer watches the replay with the pointer free.
        pointerLocked: () => false,
        menuPointer: () => false,
      }),
    );
    expect(router.controls.blocking!()).toBe(true);
  });

  it('throws from the simulated eye, not a view eye that the ADS blend moves with the frame rate', () => {
    const inventory = new Inventory(registry);
    const item = inventory.create(registry.items.keys().next().value!);
    const simulatedEye: Vec3 = [2, 10, 3];
    const session = {
      playerEye: () => simulatedEye,
      clearPlayerPoint: (point: Vec3) => point,
      playerLookDirection: () => [0, 0, -1],
      physicalSolid: () => false,
    } as unknown as Session;
    const router = createCommandRouter(
      routerPorts({ session: () => session, inventory: () => inventory, scale: { blockSize: 2, minCy: 0 } }),
    );
    expect(router.itemThrowFlight(item, 'right', 1).points[0]).toEqual([4, 20, 6]);
  });

  it('picks a modelled ground item from content alone, whatever models the renderer has loaded', () => {
    const inventory = new Inventory(registry);
    const modelled = [...registry.items.values()].find(
      (def) => def.model !== undefined && registry.models.has(def.model) && def.pileDisplay === undefined,
    );
    if (!modelled) {
      throw new Error('The fixture needs a modelled item drawn in a regular pile');
    }
    const item = inventory.create(modelled.id);
    expect(inventory.add(item, { kind: 'pile', pos: [0, 0, 0] })).toBe(true);
    const session = {
      entities: inventory.entities,
      vehicleParts: { all: () => [] },
      ladderHold: { on: false },
      actorStore: new Map(),
    } as unknown as Session;
    const router = createCommandRouter(
      routerPorts({
        session: () => session,
        inventory: () => inventory,
        pick: { ...routerPorts({}).pick, isSolid: () => false, isOpaque: () => false },
      }),
    );
    // Down through the pile's first cell, which the item laid first covers whatever its footprint.
    const firstCell: Vec3 = [0.5 / PILE_GRID.w, 0.9, 0.5 / PILE_GRID.h];
    expect(router.interactionTargetAt(firstCell, [0, -1, 0])).toMatchObject({ kind: 'item', item });
  });

  it('replays a recorded stance gesture as the stance toggle, not as a press for the live recogniser', () => {
    const controls = new PlayerControls({ playing: () => true, viewerInputAllowed: () => true, held: () => false });
    const recogniserPresses: string[] = [];
    // A live press reaches the crouch recogniser through the routed gameplay command, with everything open.
    const session = {
      sim: { actions: { cancelWaitForMovement: () => undefined }, dead: false, compression: { locksInput: false } },
    } as unknown as Session;
    const router = createCommandRouter(
      routerPorts({
        controls,
        session: () => session,
        sim: () => ({ time: 0, body: { actionRefusal: undefined } }) as unknown as Pick<Simulation, 'time' | 'body'>,
        replaying: () => true,
        worldReady: () => true,
        inputContext: () => 'play',
        presentation: {
          ...routerPorts({}).presentation,
          spectatorAllows: () => true,
          locomotionPressed: () => undefined,
          // Every modal UI is closed, so the press falls through to gameplay.
          modal: {
            ...routerPorts({}).presentation.modal,
            readingOpen: () => false,
            screenOpen: () => false,
            mainMenuOpen: () => false,
          },
          debugCommand: () => false,
          hintCommand: () => false,
        },
        liveGestures: {
          ...routerPorts({}).liveGestures,
          crouchProne: { keyDown: (action) => recogniserPresses.push(action), keyUp: unused },
        },
      }),
    );
    const sample = {
      active: true,
      inputLocked: false,
      intent: { forward: 0, strafe: 0, jump: false, sprint: false, useDominantHeld: false },
      yaw: 0,
      pitch: 0,
      walking: false,
      descending: false,
      worldReady: true,
      compression: 1,
    } as unknown as ReplayControlSample;
    router.dispatchReplayAction({ tick: 1, action: 'player.crouch-toggle', phase: 'down', context: 'play' }, sample);
    expect(controls.consumeStanceToggle()).toBe('crouch');
    expect(recogniserPresses).toEqual([]);
  });

  it('records no raw emote key, so a replay cannot reopen the ring and perform an emote the run never chose', () => {
    const recorded: string[] = [];
    const ring: string[] = [];
    const session = {
      sim: {
        actions: { cancelWaitForMovement: () => undefined },
        dead: false,
        compression: { locksInput: false, admitKey: () => true },
      },
    } as unknown as Session;
    const router = createCommandRouter(
      routerPorts({
        session: () => session,
        sim: () => ({ time: 0, body: { actionRefusal: undefined } }) as unknown as Pick<Simulation, 'time' | 'body'>,
        worldReady: () => true,
        inputContext: () => 'play',
        recorder: () =>
          ({ queueAction: (action: string) => recorded.push(action) }) as unknown as ReturnType<
            CommandRouterPorts['recorder']
          >,
        presentation: {
          ...routerPorts({}).presentation,
          spectatorAllows: () => true,
          locomotionPressed: () => undefined,
          modal: {
            ...routerPorts({}).presentation.modal,
            readingOpen: () => false,
            screenOpen: () => false,
            mainMenuOpen: () => false,
          },
          debugCommand: () => false,
          hintCommand: () => false,
        },
        liveGestures: {
          ...routerPorts({}).liveGestures,
          emote: { keyDown: () => ring.push('open'), keyUp: () => ring.push('release') },
        },
      }),
    );
    router.dispatchInputCommand({ action: 'emote.menu', phase: 'down', at: 0 });
    router.dispatchInputCommand({ action: 'emote.menu', phase: 'up', at: 100 });
    expect(ring).toEqual(['open', 'release']);
    expect(recorded).toEqual([]);
  });

  it("enters the emote ring's gun mode and offers its press check for a gun held only in the off hand", () => {
    // The fixture clip makes the rifle press-checkable whatever clip its shipped model carries.
    const clipped = baseRegistry();
    const rifleModelId = clipped.items.get('rifle_assault')!.model!;
    const rifleModel = clipped.models.get(rifleModelId)!;
    const still = { turnDegrees: { pitch: 0, yaw: 0, roll: 0 }, offHand: 'grip' as const };
    const pressCheck = { easing: 'linear' as const, keys: [still, { ...still, intoSimSeconds: simSeconds(1) }] };
    clipped.models.set(rifleModelId, { ...rifleModel, gun: { ...rifleModel.gun!, pressCheck } });
    const inventory = new Inventory(clipped);
    const rifle = inventory.create('rifle_assault');
    expect(inventory.add(rifle, { kind: 'hand', side: offSide(inventory.character) })).toBe(true);
    const firearms = new FirearmMechanics(inventory, new HandlingQueue(inventory), {
      blockSize: 1,
      isSolid: () => false,
      pose: () => undefined,
      onEjection: () => undefined,
      onCommittedShot: () => undefined,
    });
    const session = {
      sim: {
        compression: { locksInput: false, refusesKeys: false },
        paused: false,
        dead: false,
        body: { actionRefusal: undefined },
      },
      throwCharge: { startedAt: undefined },
      firearms,
    } as unknown as Session;
    const router = createCommandRouter(
      routerPorts({
        session: () => session,
        inventory: () => inventory,
        pointerLocked: () => true,
        menuPointer: () => false,
      }),
    );
    expect(router.emotes.mode('gun')).toBe(true);
    expect(router.emotes.emote('press-check')).toBe(true);
  });

  describe('reload press during a compression ramp-down', () => {
    const rampingDown = (): Compression => {
      const compression = new Compression(longActionLimits(COMPRESSION_CAPS_FIXTURE.wait));
      compression.start(undefined, 'long-action');
      for (let frame = 0; frame < 600 && compression.c < compression.limits.cap; frame++) {
        planRealFrame(compression, realSeconds(1 / 60));
      }
      compression.stop();
      planRealFrame(compression, realSeconds(1 / 60));
      return compression;
    };
    const reloadRouter = (compression: Compression, loadRefusal: string | undefined) => {
      const session = {
        sim: { compression, paused: false, dead: false, time: 0, body: { actionRefusal: undefined } },
        throwCharge: { startedAt: undefined },
        queue: { busy: false },
        ladderHold: { hand: () => undefined },
        firearms: {
          busy: false,
          reloadableUid: () => 1,
          reloadsInOneAction: () => false,
          loadNext: () => loadRefusal,
          cock: () => undefined,
          removeMagazine: () => undefined,
          stillLoaded: () => false,
          cancelLoad: () => undefined,
        },
        magazines: { reloadableUid: () => undefined },
      } as unknown as Session;
      const controls = new PlayerControls({ playing: () => true, viewerInputAllowed: () => true, held: () => false });
      const router = createCommandRouter(
        routerPorts({
          controls,
          session: () => session,
          pointerLocked: () => true,
          menuPointer: () => false,
          inputContext: () => 'play',
        }),
      );
      return { router, reload: controls.reload };
    };
    const { hold } = RELOAD_GESTURE_MS;

    it('keeps the ramp for a short single tap, which has no action', () => {
      const compression = rampingDown();
      const before = compression.c;
      expect(before).toBeGreaterThan(1);
      const { router, reload } = reloadRouter(compression, undefined);
      reload.keyDown(0, router.reloadBinding());
      reload.keyUp(hold / 2);
      reload.advance(hold * 4, router.reloadBinding());
      expect(compression.c).toBe(before);
    });

    it('keeps the ramp when the owner refuses a held reload', () => {
      const compression = rampingDown();
      const before = compression.c;
      expect(before).toBeGreaterThan(1);
      const { router, reload } = reloadRouter(compression, 'full');
      reload.keyDown(0, router.reloadBinding());
      reload.advance(hold * 2, router.reloadBinding());
      expect(compression.c).toBe(before);
    });

    it('ends the ramp when a held reload is admitted', () => {
      const compression = rampingDown();
      expect(compression.c).toBeGreaterThan(1);
      const { router, reload } = reloadRouter(compression, undefined);
      reload.keyDown(0, router.reloadBinding());
      reload.advance(hold * 2, router.reloadBinding());
      expect(compression.c).toBe(1);
    });
  });
});

describe('command router casts', () => {
  const magicRegistry = baseRegistryWith([fixtureMagicSource()]);
  const castScale = makeScale(0.5);
  const solid = (_x: number, y: number) => y === 0;

  /** A live session driven through the router, as play drives it, with a focus in `hand`. */
  const castRouter = (hand: 'dominant' | 'off') => {
    const controls = new PlayerControls({ playing: () => true, viewerInputAllowed: () => true, held: () => false });
    const recorded: string[] = [];
    let enqueued = 0;
    const nextTick = new PlayerTickActions();
    let session: Session | undefined;
    const live = () => session!;
    const router = createCommandRouter(
      routerPorts({
        registry: magicRegistry,
        controls,
        session: live,
        inventory: () => live().inventory,
        sim: () => live().sim,
        worldReady: () => true,
        inputContext: () => 'play',
        recorder: () => ({ queueAction: (action) => recorded.push(action), recordTick: () => true }),
        pendingPlayerTickActions: {
          enqueue: (action) => {
            enqueued += 1;
            nextTick.enqueue(action);
          },
          applyAtNextTick: () => nextTick.applyAtNextTick(),
        },
        scale: { blockSize: castScale.blockSize, minCy: 0 },
        pick: { worldSeed: 0, isSolid: solid, isOpaque: solid },
        presentation: {
          ...routerPorts({}).presentation,
          notice: () => undefined,
          spectatorAllows: () => true,
          locomotionPressed: () => undefined,
          modal: {
            ...routerPorts({}).presentation.modal,
            readingOpen: () => false,
            screenOpen: () => false,
            mainMenuOpen: () => false,
          },
          debugCommand: () => false,
          hintCommand: () => false,
        },
        liveGestures: { ...routerPorts({}).liveGestures, offHandUse: { keyDown: () => false, keyUp: () => undefined } },
      }),
    );
    session = createSession({
      registry: magicRegistry,
      actorFigureFiles: stackActorFigureFiles(magicRegistry),
      world: new World(),
      scale: castScale,
      seed: 71,
      start: 43_200,
      spawn: [0, 1, 0],
      isSolid: solid,
      isOpaque: solid,
      ready: () => true,
      controls: router.controls,
      audio: { play: () => undefined },
      notice: () => undefined,
      refusal: () => undefined,
      onRead: () => undefined,
    });
    session.sim.paused = false;
    session.character.initializeMagic(fixtureMagicGrants());
    const side = hand === 'dominant' ? dominantSide(session.character) : offSide(session.character);
    const wand = session.inventory.create(FIXTURE_WAND);
    if (!session.inventory.add(wand, { kind: 'hand', side })) {
      throw new Error('Fixture caster could not hold the wand');
    }
    const { castCharge } = session;
    const frames = (count: number) => {
      for (let frame = 0; frame < count; frame++) {
        live().frame(1 / 60);
      }
    };
    const command = (phase: 'down' | 'up') => router.dispatchInputCommand({ action: 'hand.use-off', phase, at: 0 });
    return {
      router,
      session,
      side,
      wand,
      commits: () => recorded.filter((action) => action === 'cast.commit').length,
      recorded,
      enqueued: () => enqueued,
      frames,
      press: () => (hand === 'dominant' ? controls.pressDominantUse() : command('down')),
      release: () => (hand === 'dominant' ? controls.releaseDominantUse() : command('up')),
      /** Holds until the preparation is done, a frame at a time. */
      prepare: () => {
        for (let frame = 0; frame < 600 && !castCharge.ready(live().sim.time); frame++) {
          frames(1);
        }
        if (!castCharge.ready(live().sim.time)) {
          throw new Error('Fixture cast never prepared');
        }
      },
    };
  };

  it.each(['dominant', 'off'] as const)(
    'casts the %s hand focus once, at its own release, with the focus kept in that hand',
    (hand) => {
      const h = castRouter(hand);
      h.press();
      h.frames(1);
      expect(h.session.castCharge.hand).toBe(h.side);
      h.prepare();
      h.release();
      h.frames(3);
      expect(h.commits()).toBe(1);
      expect(h.session.actors.castVolleys.length + h.session.actors.castProjectiles.length).toBeGreaterThan(0);
      expect(h.session.inventory.hands[h.side]?.uid).toBe(h.wand.uid);
    },
  );

  it('casts nothing for a release before the preparation is done', () => {
    const h = castRouter('dominant');
    h.press();
    h.frames(1);
    expect(h.session.castCharge.active).toBe(true);
    h.release();
    h.frames(3);
    expect([h.commits(), h.enqueued(), h.session.castCharge.active]).toEqual([0, 0, false]);
  });

  it('drops a prepared cast on a cancel, through the recording, so the release casts nothing', () => {
    const h = castRouter('off');
    h.press();
    h.prepare();
    h.router.cancelCast();
    h.frames(1);
    expect(h.recorded).toContain('cast.cancel');
    expect(h.session.castCharge.active).toBe(false);
    h.release();
    h.frames(3);
    expect(h.commits()).toBe(0);
  });

  it('drops a prepared cast when a blow knocks the caster out', () => {
    const h = castRouter('dominant');
    h.press();
    h.prepare();
    h.session.sim.body.impact(30, 'torso', { kind: 'blunt' });
    h.session.sim.body.impact(30, 'torso', { kind: 'blunt' });
    expect(h.session.sim.body.actionRefusal).toBeDefined();
    h.frames(1);
    expect(h.session.castCharge.active).toBe(false);
    h.release();
    h.frames(3);
    expect(h.commits()).toBe(0);
  });

  it('casts the dominant focus in throwing stance without borrowing the occupied off hand or throwing either item', () => {
    const h = castRouter('dominant');
    const other = h.session.inventory.create(FIXTURE_WAND);
    expect(h.session.inventory.add(other, { kind: 'hand', side: offSide(h.session.character) })).toBe(true);
    h.router.setThrowingStance(true);
    h.press();
    h.frames(1);
    expect(h.session.throwCharge.active).toBe(false);
    expect(h.session.castCharge.hand).toBe(h.side);
    h.prepare();
    h.release();
    h.frames(3);
    expect(h.commits()).toBe(1);
    expect(h.session.inventory.hands[h.side]?.uid).toBe(h.wand.uid);
    expect(h.session.inventory.hands[offSide(h.session.character)]?.uid).toBe(other.uid);
    expect(h.session.actors.castVolleys[0]?.request.sourceItemUid).toBe(h.wand.uid);
  });
});

describe('a throw from the body pressed to a one-block wall', () => {
  const scale = makeScale(0.5);
  const WallZ = -4;
  const walled = (_x: number, y: number, z: number) => y === 0 || z === WallZ;

  it('releases the throw on the thrower side of the wall and lands it there, not inside the wall', () => {
    let forward = false;
    let noclip = false;
    const controls = new PlayerControls({
      playing: () => true,
      viewerInputAllowed: () => true,
      held: (action) => forward && action === 'movement.forward',
    });
    let session: Session | undefined;
    const live = () => session!;
    const router = createCommandRouter(
      routerPorts({
        controls,
        session: live,
        inventory: () => live().inventory,
        sim: () => live().sim,
        scale: { blockSize: scale.blockSize, minCy: 0 },
      }),
    );
    session = createSession({
      registry,
      actorFigureFiles: stackActorFigureFiles(registry),
      world: new World(),
      scale,
      seed: 71,
      start: 43_200,
      spawn: [0.5, 1, -1],
      isSolid: walled,
      isOpaque: walled,
      ready: () => true,
      controls: router.controls,
      debug: () => ({ noclip, stepNoclip: () => undefined }),
      audio: { play: () => undefined },
      notice: () => undefined,
      refusal: () => undefined,
      onRead: () => undefined,
    });
    session.sim.paused = false;
    const item = session.inventory.create(registry.items.keys().next().value!);
    expect(session.inventory.add(item, { kind: 'hand', side: 'right' })).toBe(true);
    const frames = (count: number) => {
      for (let frame = 0; frame < count; frame++) {
        live().frame(1 / 60);
      }
    };
    frames(1);
    controls.requestStanceToggle('crouch');
    forward = true;
    frames(240);
    forward = false;
    frames(1);
    expect(session.body.pos[2] - session.body.halfWidth).toBeCloseTo(WallZ + 1, 2);
    // Crouching leans the eye to the wall, and a steep downward look in throwing stance swings the hand past it.
    router.toggleThrowingStance();
    controls.adjustPitch(-1.3);
    const releaseCell = (flight: { points: Vec3[] }) => Math.floor(flight.points[0]![2] / scale.blockSize);
    // Noclip lifts the body's rules, so the release starts inside the wall: the case the clamp exists for.
    noclip = true;
    const unclamped = router.itemThrowFlight(item, 'right', 6);
    expect(releaseCell(unclamped)).toBe(WallZ);
    expect(unclamped.landing).toBeUndefined();
    noclip = false;
    const cleared = router.itemThrowFlight(item, 'right', 6);
    expect(releaseCell(cleared)).toBeGreaterThan(WallZ);
    expect(cleared.landing?.[2]).toBeGreaterThan(WallZ);
  });
});
