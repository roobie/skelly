import { BoxGeometry, Group, InstancedMesh, Matrix4, Mesh, MeshBasicMaterial } from 'three';
import { describe, expect, it } from 'vitest';
import { Inventory } from '../src/core/inventory.ts';
import { SPENT_CASE_SCATTER_CAP, spentCaseScatter } from '../src/core/scatterPile.ts';
import type { FirearmShotEffect } from '../src/game/firearmHandling.ts';
import { CaseEffects, caseFlightPoint, FLYING_CASE_CAP } from '../src/render/caseEffects.ts';
import type { ModelLibrary } from '../src/render/models.ts';
import { PileMeshes } from '../src/render/piles.ts';
import { baseRegistry } from './baseRegistry.ts';
import { buildFixtureRegistry as buildRegistry } from './economyFixtures.ts';
import { playerInventorySource } from './fixtures/playerInventory.ts';

const registry = baseRegistry();

describe('spent-case presentation', () => {
  it('ends the ballistic presentation at the simulation landing position', () => {
    const origin: [number, number, number] = [0.2, 1.1, -0.4];
    const landing: [number, number, number] = [2, 0.5, 1];
    const duration = 0.48;
    const initialVelocity: [number, number, number] = [3.15, 0.7, 0];
    const flight = { durationSimSeconds: duration, initialVelocity };
    expect(caseFlightPoint(origin, landing, 1, flight)).toEqual(landing);
    const progress = 0.001;
    const elapsed = duration * progress;
    const point = caseFlightPoint(origin, landing, progress, flight);
    const horizontalVelocity = [(point[0] - origin[0]) / elapsed, (point[2] - origin[2]) / elapsed];
    expect(
      Math.hypot(horizontalVelocity[0]! - initialVelocity[0], horizontalVelocity[1]! - initialVelocity[2]),
    ).toBeLessThan(0.1);
  });
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

  it('uses validated pile-display components instead of item ids to choose scatter rendering', () => {
    const { registry: fixtureRegistry, issues } = buildRegistry([
      playerInventorySource(),
      {
        source: 'pile-display-fixture',
        data: {
          items: [
            {
              id: 'scattered_fixture',
              name: 'Scattered fixture',
              category: 'material',
              weight: 1,
              size: [1, 1],
              pileDisplay: 'scatter',
            },
            {
              id: 'ordinary_fixture',
              name: 'Ordinary fixture',
              category: 'material',
              weight: 1,
              size: [1, 1],
            },
          ],
        },
      },
    ]);
    expect(issues).toEqual([]);
    const inventory = new Inventory(fixtureRegistry);
    expect(inventory.add(inventory.create('scattered_fixture'), { kind: 'pile', pos: [1, 2, 3] })).toBe(true);
    expect(inventory.add(inventory.create('ordinary_fixture'), { kind: 'pile', pos: [4, 2, 3] })).toBe(true);
    const piles = new PileMeshes(0.5);
    piles.sync(inventory);

    const scatter = piles.group.children.filter((child) => child instanceof InstancedMesh);
    const bundles = piles.group.children.filter((child) => child instanceof Mesh && !(child instanceof InstancedMesh));
    expect(scatter).toHaveLength(1);
    expect(scatter[0]!.count).toBe(1);
    expect(bundles).toHaveLength(1);
    piles.dispose();
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
        landingPosition: [2, 0.5, 1],
        startedAtSimSeconds: 0,
        landingAt: 0.48,
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
      landingPosition: [2, 0.5, 1],
      startedAtSimSeconds: 0,
      landingAt: 0.48,
      caseModelId: 'case_5_d_56x45',
    };
    // Warm both model caches, then refire the first; the browser probe covers 100 waves.
    for (let wave = 0; wave < 3; wave++) {
      for (let slot = 0; slot < FLYING_CASE_CAP; slot++) {
        expect(
          effects.spawn({
            ...shot,
            seed: wave * FLYING_CASE_CAP + slot,
            caseModelId: wave % 2 === 0 ? 'case_5_d_56x45' : 'case_7_62x39',
          }),
        ).toBe(true);
      }
      effects.update(0.48);
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
    for (let update = 0; update < 3; update++) {
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
      ground: () => (loaded ? new Group() : undefined),
      groundParts: () => (loaded ? [{ geometry, material, matrix: new Matrix4() }] : undefined),
    } as unknown as ModelLibrary;
    const piles = new PileMeshes(0.5, models, 17);
    piles.sync(inventory);
    const fallback = piles.group.children[0] as InstancedMesh;
    let fallbackDisposed = 0;
    let geometryDisposed = 0;
    let materialDisposed = 0;
    material.addEventListener('dispose', () => {
      materialDisposed += 1;
    });
    fallback.addEventListener('dispose', () => {
      fallbackDisposed += 1;
    });
    geometry.addEventListener('dispose', () => {
      geometryDisposed += 1;
    });
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
    expect(materialDisposed).toBe(0);

    inventory.piles.clear();
    inventory.version += 1;
    const upgraded = piles.group.children[0] as InstancedMesh;
    let upgradedDisposed = 0;
    upgraded.addEventListener('dispose', () => {
      upgradedDisposed += 1;
    });
    piles.sync(inventory);
    expect(upgradedDisposed).toBe(1);
    expect(piles.group.children).toHaveLength(0);
    piles.dispose();
    expect(geometryDisposed).toBe(0);
    expect(materialDisposed).toBe(0);
    geometry.dispose();
    material.dispose();
  });

  it('keeps cached non-current model visuals hidden when delayed loads upgrade them', () => {
    let loaded = false;
    const models = {
      has: () => loaded,
      ground: () => (loaded ? new Group() : undefined),
    } as unknown as ModelLibrary;
    const effects = new CaseEffects(1, models);
    const shot: FirearmShotEffect = {
      origin: [0, 1.2, 0],
      direction: [1, 0, 0],
      speed: 3.5,
      seed: 13,
      landingPosition: [2, 0.5, 1],
      startedAtSimSeconds: 0,
      landingAt: 0.48,
      caseModelId: 'first-case',
    };
    effects.spawn(shot);
    effects.update(0.48);
    effects.spawn({ ...shot, caseModelId: 'second-case' });
    loaded = true;
    effects.update(0.02);
    expect(effects.mesh.children).toHaveLength(2);
    expect(effects.mesh.children.filter((visual) => visual.visible)).toHaveLength(1);
    effects.dispose();
  });

  it('caps flying-case effects and hides their visuals after they settle', () => {
    const effects = new CaseEffects(1);
    const shot: FirearmShotEffect = {
      origin: [0, 1.2, 0],
      direction: [0.9, 0.15, 0],
      speed: 3.5,
      seed: 33,
      landingPosition: [2, 0.5, 1],
      startedAtSimSeconds: 0,
      landingAt: 0.48,
    };
    for (let index = 0; index < FLYING_CASE_CAP; index++) {
      expect(effects.spawn(shot)).toBe(true);
    }
    expect(effects.spawn(shot)).toBe(false);
    expect(effects.activeCount).toBe(FLYING_CASE_CAP);
    let settledAt = -1;
    for (let frame = 0; frame < 120; frame++) {
      effects.update((frame + 1) * 0.05);
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
