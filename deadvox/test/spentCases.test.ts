import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { InstancedMesh } from 'three';
import { describe, expect, it } from 'vitest';
import { buildRegistry } from '../src/core/content.ts';
import { Inventory } from '../src/core/inventory.ts';
import type { FirearmShotEffect } from '../src/game/firearmHandling.ts';
import { CaseEffects, FLYING_CASE_CAP } from '../src/render/caseEffects.ts';
import { PileMeshes } from '../src/render/piles.ts';
import { SPENT_CASE_SCATTER_CAP, spentCaseScatter } from '../src/render/spentCaseScatter.ts';

const BASE = 'src/content/base';
const { registry } = buildRegistry(
  readdirSync(BASE)
    .filter((file) => file.endsWith('.json'))
    .sort()
    .map((file) => ({ source: file, data: JSON.parse(readFileSync(join(BASE, file), 'utf8')) as unknown })),
);

describe('spent-case presentation', () => {
  it('scatters deterministically, spreads with count, and stops changing at its cap', () => {
    const pile: [number, number, number] = [7, 3, -2];
    const one = spentCaseScatter(25, pile, 1, 0.5);
    const many = spentCaseScatter(25, pile, 24, 0.5);
    const capped = spentCaseScatter(25, pile, SPENT_CASE_SCATTER_CAP, 0.5);
    const beyond = spentCaseScatter(25, pile, 5000, 0.5);
    const radius = (items: typeof one) =>
      Math.max(...items.map(({ position }) => Math.hypot(position[0] - 3.75, position[2] + 0.75)));
    expect(spentCaseScatter(25, pile, 24, 0.5)).toEqual(many);
    expect(radius(many)).toBeGreaterThan(radius(one));
    expect(beyond).toEqual(capped);
    expect(capped).toHaveLength(SPENT_CASE_SCATTER_CAP);
  });

  it('renders spent-case stacks as capped instanced cases rather than a generic bundle', () => {
    const inventory = new Inventory(registry);
    expect(inventory.add(inventory.create('spent_case_7_62x39', 12), { kind: 'pile', pos: [1, 2, 3] })).toBe(true);
    const piles = new PileMeshes(0.5, undefined, 17);
    piles.sync(inventory);
    expect(piles.group.children).toHaveLength(1);
    expect(piles.group.children[0]).toBeInstanceOf(InstancedMesh);
    expect((piles.group.children[0] as InstancedMesh).count).toBe(12);
  });

  it('caps flying-case effects and removes them after they settle', () => {
    const effects = new CaseEffects(1);
    const shot: FirearmShotEffect = { origin: [0, 1.2, 0], direction: [0.9, 0.15, 0], speed: 3.5, seed: 33 };
    for (let index = 0; index < FLYING_CASE_CAP; index++) {
      expect(effects.spawn(shot)).toBe(true);
    }
    expect(effects.spawn(shot)).toBe(false);
    expect(effects.activeCount).toBe(FLYING_CASE_CAP);
    let settledAt = -1;
    for (let frame = 0; frame < 120; frame++) {
      effects.update(0.05, (_x, y) => y < 0);
      if (effects.activeCount === 0) {
        settledAt = frame;
        break;
      }
    }
    expect(settledAt).toBeGreaterThanOrEqual(0);
    expect(settledAt).toBeLessThan(100);
    expect(effects.mesh.count).toBe(0);
    effects.dispose();
  });
});
