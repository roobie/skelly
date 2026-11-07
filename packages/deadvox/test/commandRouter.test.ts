import { describe, expect, it } from 'vitest';
import { dominantSide } from '../src/core/character.ts';
import { Inventory } from '../src/core/inventory.ts';
import type { Simulation } from '../src/core/sim.ts';
import { type CommandRouterPorts, createCommandRouter } from '../src/game/commandRouter.ts';
import { type FirearmShotInput, firearmHandlingFor } from '../src/game/firearmHandling.ts';
import type { ReplayControlSample } from '../src/game/inputReplay.ts';
import { PlayerControls } from '../src/game/playerControls.ts';
import type { Session } from '../src/game/session.ts';
import { baseRegistry } from './baseRegistry.ts';

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
    modalCommand: unused,
    debugCommand: unused,
    hintCommand: unused,
  },
  active: () => true,
  worldReady: unused,
  sampleAtPlayerTick: (_tick, live) => live,
  replaying: () => false,
  replaySample: () => undefined,
  setReplaySample: () => undefined,
  recorder: () => undefined,
  inputContext: unused,
  pendingPlayerTickActions: { enqueue: unused },
  dispatchScreenCommand: unused,
  firearmReady: () => true,
  aimingDownSights: () => false,
  blocking: () => false,
  buildMode: () => false,
  handlingBusy: () => false,
  sprinting: () => false,
  throwingStance: () => false,
  syncThrowingStance: unused,
  beginItemThrow: () => undefined,
  itemThrowTuning: {
    maximumDistanceMetres: 0,
    chargeSimSeconds: 0,
    armSpeedMetresPerRealSecond: 0,
    armEnergyJoules: 0,
  },
  throwMinimumHoldSimSeconds: 0,
  scale: { blockSize: 1, minCy: 0 },
  eye: unused,
  lookDir: unused,
  performHandUse: () => undefined,
  advanceHeldStrip: () => undefined,
  selectedMagazineAction: () => undefined,
  firearmShotInput: unused,
  fire: unused,
  fireReason: () => undefined,
  descending: () => false,
  actOnWork: unused,
  enqueueDoorBar: unused,
  toggleDoor: unused,
  toggleRestFromTarget: unused,
  furnitureActions: unused,
  continueAction: unused,
  stopAction: unused,
  gestures: {
    reloadBinding: unused,
    toggleThrowingStance: unused,
    dropHeldItemForThrowingStance: unused,
    toggleWornLights: unused,
    useForwardButton: unused,
    quickbarTap: unused,
    quickbarHold: unused,
  },
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
    const shots: number[] = [];
    const router = createCommandRouter(
      routerPorts({
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
          modalCommand: () => false,
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
});
