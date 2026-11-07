import { describe, expect, it } from 'vitest';
import { dominantSide } from '../src/core/character.ts';
import { Inventory } from '../src/core/inventory.ts';
import type { Simulation } from '../src/core/sim.ts';
import { createCommandRouter } from '../src/game/commandRouter.ts';
import { type FirearmShotInput, firearmHandlingFor } from '../src/game/firearmHandling.ts';
import { PlayerControls } from '../src/game/playerControls.ts';
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

describe('command router', () => {
  it('fires an automatic weapon on the press tick, then at its cadence while the trigger is held', () => {
    const { inventory, roundsPerSimSecond } = automaticRifleInHand();
    // The router reads only the clock and the body's action refusal.
    const sim = { time: 0, body: { actionRefusal: undefined } } as unknown as Pick<Simulation, 'time' | 'body'>;
    const shots: number[] = [];
    const unused = (): never => {
      throw new Error('The trigger path does not reach this port');
    };
    const router = createCommandRouter({
      controls: new PlayerControls({ playing: () => true, viewerInputAllowed: () => true, held: () => false }),
      registry,
      session: unused,
      inventory: () => inventory,
      sim: () => sim,
      presentation: {
        refusal: () => undefined,
        closeInventoryScreen: unused,
        syncMenuState: unused,
        openInventory: unused,
        openFurnitureChoices: unused,
        beginSearch: unused,
        weaponInspected: unused,
        throwVisual: unused,
      },
      active: () => true,
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
      firearmShotInput: (_uid, atSimSeconds) => ({ simTime: atSimSeconds }) as FirearmShotInput,
      fire: (shot) => {
        shots.push(shot.simTime);
        return true;
      },
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
        requestStanceAction: unused,
        reloadBinding: unused,
        toggleThrowingStance: unused,
        dropHeldItemForThrowingStance: unused,
        toggleWornLights: unused,
        useForwardButton: unused,
        quickbarTap: unused,
        quickbarHold: unused,
      },
      dispatchInputCommand: unused,
    });
    const interval = 1 / roundsPerSimSecond;
    router.controls.heldDominantUse!(1, true, true);
    expect(shots).toEqual([1]);
    router.controls.heldDominantUse!(1 + 1.5 * interval, false, true);
    expect(shots).toHaveLength(2);
    expect(shots[1]).toBeCloseTo(1 + interval, 9);
  });
});
