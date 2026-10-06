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
  const mechanics = new FirearmMechanics(inventory, queue, {
    blockSize: pose.blockSize,
    pose: () => ({ ...pose, feet: [...pose.feet], eye: [...pose.eye] }),
    onEjection: () => undefined,
    onCommittedShot: () => {
      fired += 1;
    },
  });
  return { inventory, queue, mechanics, fired: () => fired };
};

describe('magazine-fed rifles', () => {
  it('conserves rounds across carried, loaded, chambered, dropped and fired through fire, charge and removal', () => {
    const { inventory, queue, mechanics, fired } = rig();
    const loaded = 5;
    const { rifle } = chargedRifle(inventory, queue, mechanics, { rounds: loaded });
    const { cartridge } = rifleAmmunition(registry, rifle.type);
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
    expect(rounds()).toBe(loaded);
    let time = 1;
    // Each step reports whether it was admitted: a shot fired, or a handling job queued without refusal.
    const steps: [string, () => boolean][] = [
      ['fire', () => mechanics.fire(shot(rifle, time))],
      ['fire again', () => mechanics.fire(shot(rifle, time))],
      ['charge a live round out', () => mechanics.cock(rifle.uid, time) === undefined],
      ['take the magazine out', () => mechanics.loadNext(rifle.uid, time) === undefined],
      ['charge the last round out', () => mechanics.cock(rifle.uid, time) === undefined],
      ['put the magazine back', () => mechanics.loadNext(rifle.uid, time) === undefined],
    ];
    for (const [step, act] of steps) {
      expect([step, act()]).toEqual([step, true]);
      settle(queue);
      time += 1;
      mechanics.advanceTo(time);
      expect([step, rounds()]).toEqual([step, loaded]);
    }
    expect(fired()).toBe(2);
    expect(rifle.firearm?.chamber).toBe('empty');
    expect(rifle.slots?.magazine?.cartridges).toHaveLength(loaded - fired() - 2);
  });

  it('swaps in the fullest carried magazine, and takes the fitted one out when none is fuller', () => {
    const { inventory, queue, mechanics } = rig();
    const { magazine: magazineType, cartridge } = rifleAmmunition(registry, 'rifle_assault');
    const magazines = new MagazineHandling(inventory, queue, { feet: () => pose.feet, reloadDurationScale: () => 1 });
    const bag = inventory.create('hiking_backpack');
    const pocket = { kind: 'pocket', owner: bag, pocket: 0 } as const;
    const hand = { kind: 'hand', side: 'right' } as const;
    expect(inventory.add(bag, { kind: 'worn' }) && inventory.add(inventory.create(cartridge, 4), pocket)).toBe(true);
    const loadedMagazine = (rounds: number): Item => {
      const magazine = inventory.create(magazineType);
      expect(inventory.add(magazine, hand)).toBe(true);
      for (let round = 0; round < rounds; round++) {
        expect(magazines.loadNext(magazine.uid, 0)).toBeUndefined();
        settle(queue);
      }
      expect(inventory.move(magazine, pocket).ok).toBe(true);
      return magazine;
    };
    const lighter = loadedMagazine(1);
    const fuller = loadedMagazine(3);
    const rifle = inventory.create('rifle_assault');
    expect(inventory.add(rifle, hand)).toBe(true);
    const change = () => {
      expect(mechanics.loadNext(rifle.uid, 0)).toBeUndefined();
      settle(queue);
    };

    change();
    expect(rifle.slots?.magazine).toBe(fuller);
    expect(inventory.locate(lighter)?.kind).toBe('pocket');
    change();
    expect(rifle.slots?.magazine).toBeUndefined();
    expect(inventory.locate(fuller)?.kind).toBe('pocket');
    change();
    expect(rifle.slots?.magazine).toBe(fuller);
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
