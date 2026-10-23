import { describe, expect, it } from 'vitest';
import { requireDayCycle } from '../src/core/content.ts';
import { CORE_CONTENT_IDS } from '../src/core/contentIds.ts';
import type { Vec3 } from '../src/core/coords.ts';
import { type IlluminationScene, litEnoughToRead } from '../src/core/illumination.ts';
import { Inventory } from '../src/core/inventory.ts';
import { chargeOf, drainLight, toggleLight } from '../src/core/lights.ts';
import { makeScale } from '../src/core/scale.ts';
import { gameSeconds } from '../src/core/time.ts';
import { baseRegistry } from './baseRegistry.ts';

const base = baseRegistry();
const { readingThreshold } = base.senses.get(CORE_CONTENT_IDS.player)!.light.illumination;
// Far above the threshold wherever it sits, so each case turns on its own rule, not on tuning.
const BRIGHT = readingThreshold * 1000;
const flashlight = base.items.get('flashlight')!;
const registry = {
  ...base,
  items: new Map(base.items).set('flashlight', { ...flashlight, light: { ...flashlight.light!, intensity: BRIGHT } }),
};
const cycle = requireDayCycle(registry);
const MIDNIGHT = 0;
const NOON = 12;
const READER: Vec3 = [0.5, 1.5, 0.5];

const sceneWith = (inventory: Inventory, over: Partial<IlluminationScene> = {}): IlluminationScene => ({
  inventory,
  sky: { visibilityAt: () => 0 },
  gameHour: MIDNIGHT,
  cycle,
  fixtures: [],
  isBlocking: () => false,
  blockSize: makeScale(0.5).blockSize,
  holder: READER,
  ...over,
});

const holding = () => {
  const inventory = new Inventory(registry);
  const light = inventory.create('flashlight');
  const held = inventory.add(light, { kind: 'hand', side: 'right' });
  return { inventory, light, held };
};

describe('illumination', () => {
  it('a carried light reads in the dark only while it is on and charged', () => {
    const { inventory, light, held } = holding();
    expect(held).toBe(true);
    expect(litEnoughToRead(sceneWith(inventory), READER)).toBe(false);
    expect(toggleLight(registry, light, 0)).toBeUndefined();
    expect(litEnoughToRead(sceneWith(inventory), READER)).toBe(true);
    const rate = registry.items.get('flashlight')!.light!.power!.chargePerGameHour / 3600;
    drainLight(registry, light, gameSeconds(chargeOf(registry, light)! / rate + 1));
    expect(chargeOf(registry, light)).toBe(0);
    expect(litEnoughToRead(sceneWith(inventory), READER)).toBe(false);
  });

  it('a powered fixture lights a page in open air and not through a wall', () => {
    const inventory = new Inventory(registry);
    const fixtures = [{ pos: [3.5, 1.5, 0.5] as Vec3, color: '#ffffff', intensity: BRIGHT, radius: 8 }];
    expect(litEnoughToRead(sceneWith(inventory), READER)).toBe(false);
    expect(litEnoughToRead(sceneWith(inventory, { fixtures }), READER)).toBe(true);
    const wall = (x: number) => x === 2;
    expect(litEnoughToRead(sceneWith(inventory, { fixtures, isBlocking: wall }), READER)).toBe(false);
  });

  it('open sky reads at noon and not at midnight', () => {
    const inventory = new Inventory(registry);
    const openSky = { visibilityAt: () => 1 };
    expect(litEnoughToRead(sceneWith(inventory, { sky: openSky, gameHour: NOON }), READER)).toBe(true);
    expect(litEnoughToRead(sceneWith(inventory, { sky: openSky, gameHour: MIDNIGHT }), READER)).toBe(false);
  });
});
