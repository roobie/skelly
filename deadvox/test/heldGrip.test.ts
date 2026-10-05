import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { Character } from '../src/core/character.ts';
import { buildRegistry } from '../src/core/content.ts';
import { ejectSeconds } from '../src/core/firearmAction.ts';
import { HandlingQueue } from '../src/core/handling.ts';
import { type HandSide, Inventory } from '../src/core/inventory.ts';
import { FirearmMechanics, type FirearmShotEffect, firearmHandlingFor } from '../src/game/firearmHandling.ts';

const base = 'src/content/base';
const { registry: source } = buildRegistry(
  readdirSync(base)
    .filter((file) => file.endsWith('.json'))
    .map((file) => ({ source: file, data: JSON.parse(readFileSync(join(base, file), 'utf8')) as unknown })),
);
const rifleType = 'debug_rifle_assault';
const items = new Map(source.items);
items.set(rifleType, { ...items.get(rifleType)!, twoHanded: true });
const registry = { ...source, items };

const ejectFrom = (side: HandSide): FirearmShotEffect[] => {
  const character = new Character(registry, { handedness: side === 'right' ? 'left' : 'right' });
  const inventory = new Inventory(registry, undefined, undefined, character);
  const rifle = inventory.create(rifleType);
  if (!inventory.add(rifle, { kind: 'hand', side })) {
    throw new Error('Could not place the fixture rifle in its physical slot');
  }
  const effects: FirearmShotEffect[] = [];
  const pose = {
    feet: [0, 1, 0],
    eye: [0, 4, 0],
    yaw: 0,
    pitch: 0,
    aimFrame: { yaw: 0, pitch: 0 },
    blockSize: 0.5,
  } as const;
  const mechanics = new FirearmMechanics(inventory, new HandlingQueue(inventory), {
    blockSize: pose.blockSize,
    pose: () => ({ ...pose, feet: [...pose.feet], eye: [...pose.eye] }),
    onEjection: (effect) => effects.push(effect),
  });
  if (
    !mechanics.fire({
      ...pose,
      feet: [...pose.feet],
      eye: [...pose.eye],
      item: rifle,
      debugMode: true,
      seed: 71,
      simTime: 1,
    })
  ) {
    throw new Error('Fixture shot was refused');
  }
  const data = firearmHandlingFor(rifle, registry);
  mechanics.advanceTo(1 + ejectSeconds(data.action, 'fire'));
  return effects;
};

describe('actual-slot held placement', () => {
  it('translates two-handed ejection origins by physical slot, not actor dominance, without mirroring authored direction', () => {
    const rightEffects = ejectFrom('right');
    const leftEffects = ejectFrom('left');
    expect(rightEffects).toHaveLength(1);
    expect(leftEffects).toHaveLength(1);
    const right = rightEffects[0]!;
    const left = leftEffects[0]!;
    expect(right.origin[0] - left.origin[0]).toBeGreaterThan(0);
    expect(left.origin.slice(1)).toEqual(right.origin.slice(1));
    expect(left.direction).toEqual(right.direction);
    expect(Math.hypot(...left.direction)).toBeCloseTo(1);
  });
});
