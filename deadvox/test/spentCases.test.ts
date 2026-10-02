import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Group, InstancedMesh } from 'three';
import { describe, expect, it } from 'vitest';
import { buildRegistry } from '../src/core/content.ts';
import { Inventory } from '../src/core/inventory.ts';
import type { FirearmShotEffect } from '../src/game/firearmHandling.ts';
import { CaseEffects, FLYING_CASE_CAP } from '../src/render/caseEffects.ts';
import type { ModelLibrary } from '../src/render/models.ts';
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
    const one = spentCaseScatter({ worldSeed: 25, pilePos: pile, count: 1, blockSize: 0.5 });
    const many = spentCaseScatter({ worldSeed: 25, pilePos: pile, count: 24, blockSize: 0.5 });
    const capped = spentCaseScatter({
      worldSeed: 25,
      pilePos: pile,
      count: SPENT_CASE_SCATTER_CAP,
      blockSize: 0.5,
    });
    const beyond = spentCaseScatter({ worldSeed: 25, pilePos: pile, count: 5000, blockSize: 0.5 });
    const radius = (items: typeof one) =>
      Math.max(...items.map(({ position }) => Math.hypot(position[0] - 3.75, position[2] + 0.75)));
    expect(spentCaseScatter({ worldSeed: 25, pilePos: pile, count: 24, blockSize: 0.5 })).toEqual(many);
    expect(radius(many)).toBeGreaterThan(radius(one));
    expect(beyond).toEqual(capped);
    expect(capped).toHaveLength(SPENT_CASE_SCATTER_CAP);
  });

  it('renders spent-case stacks as capped instanced cases rather than a generic bundle', () => {
    const inventory = new Inventory(registry);
    expect(inventory.add(inventory.create('spent_case_5_d_56x45', 12), { kind: 'pile', pos: [1, 2, 3] })).toBe(true);
    const piles = new PileMeshes(0.5, undefined, 17);
    piles.sync(inventory);
    expect(piles.group.children).toHaveLength(1);
    expect(piles.group.children[0]).toBeInstanceOf(InstancedMesh);
    expect((piles.group.children[0] as InstancedMesh).count).toBe(12);
  });

  it('uses the exported case model for both pile scatter and flying effects when loaded', () => {
    const inventory = new Inventory(registry);
    expect(inventory.add(inventory.create('spent_case_5_d_56x45', 3), { kind: 'pile', pos: [1, 2, 3] })).toBe(true);
    const models = {
      version: 1,
      has: (id: string) => id === 'case_5_d_56x45',
      ground: (id: string) => (id === 'case_5_d_56x45' ? new Group() : undefined),
    } as unknown as ModelLibrary;
    const piles = new PileMeshes(0.5, models, 17);
    piles.sync(inventory);
    expect(piles.group.children).toHaveLength(3);
    expect(piles.group.children.every((child) => child instanceof Group)).toBe(true);

    const effects = new CaseEffects(1, models);
    expect(
      effects.spawn({
        origin: [0, 1.2, 0],
        direction: [0.9, 0.15, 0],
        speed: 3.5,
        seed: 33,
        caseModelId: 'case_5_d_56x45',
      }),
    ).toBe(true);
    expect(effects.mesh.children).toHaveLength(1);
    expect(effects.mesh.children[0]).toBeInstanceOf(Group);
    effects.dispose();
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
    expect(effects.mesh.children).toHaveLength(0);
    effects.dispose();
  });
});
