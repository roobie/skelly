import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { BoxGeometry, Group, InstancedMesh, Matrix4, MeshBasicMaterial } from 'three';
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
    const geometry = new BoxGeometry(0.02, 0.008, 0.01);
    const material = new MeshBasicMaterial();
    const models = {
      version: 1,
      has: (id: string) => id === 'case_5_d_56x45',
      ground: (id: string) => (id === 'case_5_d_56x45' ? new Group() : undefined),
      groundParts: (id: string) =>
        id === 'case_5_d_56x45' ? [{ geometry, material, matrix: new Matrix4() }] : undefined,
    } as unknown as ModelLibrary;
    const piles = new PileMeshes(0.5, models, 17);
    piles.sync(inventory);
    expect(piles.group.children).toHaveLength(1);
    expect(piles.group.children[0]).toBeInstanceOf(InstancedMesh);
    expect((piles.group.children[0] as InstancedMesh).count).toBe(3);

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
    piles.dispose();
    geometry.dispose();
    material.dispose();
  });

  it('reuses warmed flying-case visuals across retire/refire cycles and model changes', () => {
    let groundClones = 0;
    const models = {
      has: () => true,
      ground: () => {
        groundClones += 1;
        return new Group();
      },
    } as unknown as ModelLibrary;
    const effects = new CaseEffects(1, models);
    const shot: FirearmShotEffect = {
      origin: [0, 1.2, 0],
      direction: [0.9, 0.15, 0],
      speed: 3.5,
      seed: 33,
      caseModelId: 'case_5_d_56x45',
    };
    for (let wave = 0; wave < 100; wave++) {
      for (let slot = 0; slot < FLYING_CASE_CAP; slot++) {
        expect(
          effects.spawn({
            ...shot,
            seed: wave * FLYING_CASE_CAP + slot,
            caseModelId: wave % 2 === 0 ? 'case_5_d_56x45' : 'case_7_62x39',
          }),
        ).toBe(true);
      }
      effects.update(6.1, () => false);
    }
    expect(groundClones).toBe(FLYING_CASE_CAP * 2);
    expect(effects.mesh.children).toHaveLength(FLYING_CASE_CAP * 2);
    expect(effects.mesh.children.every((visual) => !visual.visible)).toBe(true);
    effects.dispose();
  });

  it('reuses capped pile instances without cloning or rewriting unchanged scatter', () => {
    const inventory = new Inventory(registry);
    expect(
      inventory.add(inventory.create('spent_case_5_d_56x45', SPENT_CASE_SCATTER_CAP), { kind: 'pile', pos: [4, 2, 1] }),
    ).toBe(true);
    const geometry = new BoxGeometry(0.02, 0.008, 0.01);
    const material = new MeshBasicMaterial();
    let groundClones = 0;
    const models = {
      version: 1,
      has: () => true,
      ground: () => {
        groundClones += 1;
        return new Group();
      },
      groundParts: () => [{ geometry, material, matrix: new Matrix4() }],
    } as unknown as ModelLibrary;
    const piles = new PileMeshes(0.5, models, 17);
    piles.sync(inventory);
    const instanced = piles.group.children[0] as InstancedMesh;
    expect(instanced.count).toBe(SPENT_CASE_SCATTER_CAP);
    let writes = 0;
    const setMatrixAt = instanced.setMatrixAt.bind(instanced);
    instanced.setMatrixAt = (index, matrix) => {
      writes += 1;
      return setMatrixAt(index, matrix);
    };
    for (let update = 0; update < 100; update++) {
      inventory.version += 1;
      piles.sync(inventory);
    }
    expect(writes).toBe(0);
    expect(groundClones).toBe(0);
    piles.dispose();
    geometry.dispose();
    material.dispose();
  });

  it('reuses fallback InstancedMesh on rebuild and disposes it on removal or model upgrade', () => {
    const inventory = new Inventory(registry);
    expect(inventory.add(inventory.create('spent_case_5_d_56x45', 3), { kind: 'pile', pos: [1, 2, 3] })).toBe(true);
    const geometry = new BoxGeometry(0.02, 0.008, 0.01);
    const material = new MeshBasicMaterial();
    let loaded = false;
    const models = {
      version: 0,
      has: () => loaded,
      groundParts: () => (loaded ? [{ geometry, material, matrix: new Matrix4() }] : undefined),
    } as unknown as ModelLibrary;
    const piles = new PileMeshes(0.5, models, 17);
    piles.sync(inventory);
    const fallback = piles.group.children[0] as InstancedMesh;
    let fallbackDisposed = 0;
    let geometryDisposed = 0;
    fallback.addEventListener('dispose', () => (fallbackDisposed += 1));
    geometry.addEventListener('dispose', () => (geometryDisposed += 1));
    inventory.version += 1;
    piles.sync(inventory);
    expect(piles.group.children[0]).toBe(fallback);
    expect(fallbackDisposed).toBe(0);

    loaded = true;
    (models as unknown as { version: number }).version = 1;
    piles.sync(inventory);
    expect(fallbackDisposed).toBe(1);
    expect(piles.group.children[0]).toBeInstanceOf(InstancedMesh);
    expect((piles.group.children[0] as InstancedMesh).geometry).toBe(geometry);
    expect(geometryDisposed).toBe(0);

    inventory.piles.clear();
    inventory.version += 1;
    const upgraded = piles.group.children[0] as InstancedMesh;
    let upgradedDisposed = 0;
    upgraded.addEventListener('dispose', () => (upgradedDisposed += 1));
    piles.sync(inventory);
    expect(upgradedDisposed).toBe(1);
    expect(piles.group.children).toHaveLength(0);
    expect(geometryDisposed).toBe(0);
    piles.dispose();
    geometry.dispose();
    material.dispose();
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
    expect(effects.mesh.children).toHaveLength(FLYING_CASE_CAP);
    expect(effects.mesh.children.every((visual) => !visual.visible)).toBe(true);
    effects.dispose();
  });
});
