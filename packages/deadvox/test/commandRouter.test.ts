import { PlayerControls, RELOAD_GESTURE_MS, type ReplayControlSample } from '@skelly/engine/input';
import { Compression, longActionLimits } from '@skelly/engine/internal/core/compression.ts';
import type { CommandRouterPorts } from '@skelly/engine/internal/game/commandRouter.ts';
import type { FirearmShotInput } from '@skelly/engine/internal/game/firearmHandling.ts';
import { planRealFrame } from '@skelly/engine/internal/game/frameDriver.ts';
import { firearmHandlingFor, Inventory } from '@skelly/engine/inventory';
import { createCommandRouter, type Session } from '@skelly/engine/session';
import { dominantSide, realSeconds, type Simulation } from '@skelly/engine/sim';
import type { Vec3 } from '@skelly/engine/world';
import { describe, expect, it } from 'vitest';
import { baseRegistry } from './baseRegistry.ts';
import { COMPRESSION_CAPS_FIXTURE } from './simulationFixture.ts';

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
    quickbar: unusedGesture,
    cancelHeld: unused,
  },
  ...ports,
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
    expect(router.interactionTargetAt([0.5, 0.9, 0.5], [0, -1, 0])).toMatchObject({ kind: 'item', item });
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

  describe('reload press during a compression ramp-down', () => {
    const rampingDown = (): Compression => {
      const compression = new Compression(longActionLimits(COMPRESSION_CAPS_FIXTURE.wait));
      compression.start(undefined, 'long-action');
      for (let frame = 0; frame < 600 && compression.c < compression.limits.cap; frame++) {
        planRealFrame(compression, realSeconds(1 / 60));
      }
      compression.stop();
      planRealFrame(compression, realSeconds(1 / 60));
      expect(compression.c).toBeGreaterThan(1);
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
    const hold = RELOAD_GESTURE_MS.hold;

    it('keeps the ramp for a short single tap, which has no action', () => {
      const compression = rampingDown();
      const before = compression.c;
      const { router, reload } = reloadRouter(compression, undefined);
      reload.keyDown(0, router.reloadBinding());
      reload.keyUp(hold / 2);
      reload.advance(hold * 4, router.reloadBinding());
      expect(compression.c).toBe(before);
    });

    it('keeps the ramp when the owner refuses a held reload', () => {
      const compression = rampingDown();
      const before = compression.c;
      const { router, reload } = reloadRouter(compression, 'full');
      reload.keyDown(0, router.reloadBinding());
      reload.advance(hold * 2, router.reloadBinding());
      expect(compression.c).toBe(before);
    });

    it('ends the ramp when a held reload is admitted', () => {
      const compression = rampingDown();
      const { router, reload } = reloadRouter(compression, undefined);
      reload.keyDown(0, router.reloadBinding());
      reload.advance(hold * 2, router.reloadBinding());
      expect(compression.c).toBe(1);
    });
  });
});
