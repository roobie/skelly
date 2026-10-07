import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { buildRegistry } from '../src/core/content.ts';
import type { Vec3 } from '../src/core/coords.ts';
import { HandlingQueue } from '../src/core/handling.ts';
import { Inventory, type InventoryState } from '../src/core/inventory.ts';
import type { Item } from '../src/core/items.ts';
import { FirearmMechanics, type FirearmShotInput } from '../src/game/firearmHandling.ts';
import { MagazineHandling } from '../src/game/magazineHandling.ts';
import { RELOAD_GESTURE_MS, type ReloadBinding, ReloadInput } from '../src/game/reloadInput.ts';
import { chargedRifle, rifleAmmunition, settle } from './rifleFixture.ts';

const BASE = 'src/content/base';
const { registry } = buildRegistry(
  readdirSync(BASE)
    .filter((file) => file.endsWith('.json'))
    .sort()
    .map((file) => ({ source: file, data: JSON.parse(readFileSync(join(BASE, file), 'utf8')) as unknown })),
);
const pose = {
  feet: [0, 1, 0] as Vec3,
  eye: [0, 4, 0] as Vec3,
  yaw: 0,
  pitch: 0,
  aimFrame: { yaw: 0, pitch: 0 },
  blockSize: 0.5,
  ready: true,
  sprinting: false,
};
const shot = (item: Item, simTime: number): FirearmShotInput => ({ ...pose, item, seed: 71, simTime });

const rig = () => {
  const inventory = new Inventory(registry);
  const queue = new HandlingQueue(inventory);
  let fired = 0;
  // Clearing `grounded` takes the pose away, so nothing leaving the rifle can drop at the player's feet.
  const world = { grounded: true };
  const mechanics = new FirearmMechanics(inventory, queue, {
    blockSize: pose.blockSize,
    pose: () => (world.grounded ? { ...pose, feet: [...pose.feet], eye: [...pose.eye] } : undefined),
    onEjection: () => undefined,
    onCommittedShot: () => {
      fired += 1;
    },
  });
  return { inventory, queue, mechanics, world, fired: () => fired };
};

/** The empty AR in hand, and a worn bag holding one magazine loaded round by round per entry of `loads`. */
const carrying = (loads: readonly number[]) => {
  const rigged = rig();
  const { inventory, queue } = rigged;
  const { magazine: magazineType, cartridge } = rifleAmmunition(registry, 'rifle_assault');
  const magazines = new MagazineHandling(inventory, queue, { feet: () => pose.feet, reloadDurationScale: () => 1 });
  const bag = inventory.create('hiking_backpack');
  const pocket = { kind: 'pocket', owner: bag, pocket: 0 } as const;
  const hand = { kind: 'hand', side: 'right' } as const;
  const total = loads.reduce((sum, rounds) => sum + rounds, 0);
  const must = (ok: boolean, step: string): void => {
    if (!ok) {
      throw new Error(`Magazine fixture could not ${step}`);
    }
  };
  must(inventory.add(bag, { kind: 'worn' }) && inventory.add(inventory.create(cartridge, total), pocket), 'pack');
  const loaded = loads.map((rounds): Item => {
    const magazine = inventory.create(magazineType);
    must(inventory.add(magazine, hand), 'hold a magazine');
    for (let round = 0; round < rounds; round++) {
      must(magazines.loadNext(magazine.uid, 0) === undefined, 'load a round');
      settle(queue);
    }
    must(inventory.move(magazine, pocket).ok, 'pocket a magazine');
    return magazine;
  });
  const rifle = inventory.create('rifle_assault');
  must(inventory.add(rifle, hand), 'hold the rifle');
  return { ...rigged, cartridge, pocket, rifle, loaded, total };
};

describe('magazine-fed rifles', () => {
  it('conserves rounds across carried, loaded, chambered, dropped and fired through fire, charge and change', () => {
    const { inventory, queue, mechanics, fired, cartridge, rifle, loaded, total } = carrying([5, 3]);
    const [first, spare] = loaded;
    // Every round is a loose cartridge (carried or on the ground), in a magazine, in the chamber, or fired.
    const rounds = (): number =>
      [...inventory.items()].reduce(
        (sum, { item }) =>
          sum +
          (item.type === cartridge ? item.count : 0) +
          (item.cartridges?.length ?? 0) +
          (item.firearm?.roundType === undefined ? 0 : 1),
        fired(),
      );
    expect(rounds()).toBe(total);
    let time = 1;
    // Each step reports whether it was admitted: a shot fired, or a handling job queued without refusal.
    const change = () => mechanics.loadNext(rifle.uid, time) === undefined;
    const charge = () => mechanics.cock(rifle.uid, time) === undefined;
    const fire = () => mechanics.fire(shot(rifle, time));
    const steps: [string, () => boolean][] = [
      ['insert the fullest magazine', change],
      ['charge', charge],
      ['fire', fire],
      ['fire again', fire],
      ['charge a live round out', charge],
      ['change to the spare, now fuller', change],
      ['charge the next live round out', charge],
      ['fire from the spare', fire],
    ];
    for (const [step, act] of steps) {
      expect([step, act()]).toEqual([step, true]);
      settle(queue);
      time += 1;
      mechanics.advanceTo(time);
      expect([step, rounds()]).toEqual([step, total]);
    }
    expect(fired()).toBe(3);
    expect(rifle.slots?.magazine).toBe(spare);
    expect(inventory.locate(first!)?.kind).toBe('pocket');
  });

  it('swaps in the fullest carried magazine, and refuses rather than unloading when none is fuller', () => {
    const { inventory, queue, mechanics, rifle, loaded } = carrying([1, 3]);
    const [lighter, fuller] = loaded;
    expect(mechanics.loadNext(rifle.uid, 0)).toBeUndefined();
    settle(queue);
    expect(rifle.slots?.magazine).toBe(fuller);
    expect(inventory.locate(lighter!)?.kind).toBe('pocket');

    // R only (re)loads (CONTROLS.md, "Reload only"): no fuller magazine means no job, and the fitted one stays.
    expect(mechanics.loadNext(rifle.uid, 0)).toBeDefined();
    expect(queue.busy).toBe(false);
    expect(rifle.slots?.magazine).toBe(fuller);
  });

  it('undoes a magazine change, keeping both magazines, when the removed one has nowhere to go', () => {
    const { inventory, queue, mechanics, world, pocket, rifle, loaded } = carrying([1, 3]);
    const [lighter, fuller] = loaded;
    // Set the fuller magazine down so the lighter one goes in, then pick it back up.
    expect(inventory.move(fuller!, { kind: 'pile', pos: pose.feet }).ok).toBe(true);
    expect(mechanics.loadNext(rifle.uid, 0)).toBeUndefined();
    settle(queue);
    expect(rifle.slots?.magazine).toBe(lighter);
    expect(inventory.move(fuller!, pocket).ok).toBe(true);
    const pocketed = inventory.locate(fuller!);

    world.grounded = false;
    expect(mechanics.loadNext(rifle.uid, 0)).toBeUndefined();
    settle(queue);
    expect(rifle.slots?.magazine).toBe(lighter);
    expect(inventory.locate(fuller!)).toEqual(pocketed);
    expect([lighter!.cartridges, fuller!.cartridges].map((rounds) => rounds?.length)).toEqual([1, 3]);
  });

  it('starts one magazine change per R hold, which neither repeats nor cancels on release', () => {
    const reload = new ReloadInput();
    const binding: ReloadBinding = {
      uid: 1,
      busy: () => false,
      oneAction: true,
      load: vi.fn(() => true),
      rack: vi.fn(),
      cancelLoad: vi.fn(),
    };
    reload.keyDown(0, binding);
    const held = Math.max(RELOAD_GESTURE_MS.hold, RELOAD_GESTURE_MS.doublePress);
    reload.advance(held, binding);
    reload.advance(held * 4, binding);
    reload.keyUp(held * 5);
    expect(binding.load).toHaveBeenCalledOnce();
    expect(binding.cancelLoad).not.toHaveBeenCalled();
  });

  it('restores the fitted magazine and chamber, and refuses a magazine or round of another calibre', () => {
    const { inventory, queue, mechanics } = rig();
    const { rifle } = chargedRifle(inventory, queue, mechanics);
    const saved = JSON.parse(JSON.stringify(inventory.snapshotState())) as InventoryState;
    expect(Inventory.restoreState(registry, saved).snapshotState()).toEqual(saved);
    const other = rifleAmmunition(registry, 'rifle_ak');
    const held = (state: InventoryState) => Object.values(state.hands).find((item) => item?.uid === rifle.uid)!;
    const corruptions: ((state: InventoryState) => void)[] = [
      (state) => {
        held(state).slots!.magazine = { ...held(state).slots!.magazine!, type: other.magazine, cartridges: [] };
      },
      (state) => {
        held(state).firearm!.roundType = other.cartridge;
      },
      (state) => {
        held(state).slots!.magazine!.uid = held(state).uid;
      },
    ];
    for (const corrupt of corruptions) {
      const state = structuredClone(saved);
      corrupt(state);
      expect(() => Inventory.restoreState(registry, state)).toThrow();
    }
  });
});
