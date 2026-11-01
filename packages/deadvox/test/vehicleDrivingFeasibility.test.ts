import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { driving, rapierDriver, type Scenario, traceBits } from '../src/vehicles/feasibility/driving.ts';
import { ColliderDesc, RigidBodyDesc, type Voxels, World } from '../vendor/rapier-f64/rapier.js';
import init from '../vendor/rapier-f64/rapier_wasm3d.js';

// biome-ignore lint/style/useNamingConvention: upstream Rapier API names
const api = { ColliderDesc, RigidBodyDesc, World };
beforeAll(async () => {
  // biome-ignore lint/style/useNamingConvention: wasm-bindgen API
  await init({ module_or_path: readFileSync(new URL('../vendor/rapier-f64/rapier_wasm3d_bg.wasm', import.meta.url)) });
});
const wall = { centre: [0, 0, 0], half: [0.001, 5, 5], rotation: [0, 0, 0, 1] };
const fixture: Scenario = {
  id: 'fixture',
  behaviour: 'wall-stop',
  viewAxis: 1,
  position: [-2, 0, 0],
  velocity: [1000, 0, 0],
  boxes: [wall],
};

describe('driving collision envelope', () => {
  it('Rapier cannot tunnel through a wall thinner than a tick’s travel', () => {
    const driver = rapierDriver(api, fixture);
    try {
      expect(driver.step(0).position[0]).toBeLessThan(-wall.half[0]!);
    } finally {
      driver.dispose();
    }
  });
  it('Rapier refuses collider admission beyond its bounded scene', () => {
    expect(() =>
      rapierDriver(api, { ...fixture, boxes: Array.from({ length: driving.maxColliders + 1 }, () => wall) }),
    ).toThrow('admission');
  });
  it('Rapier retains tangential movement after wall contact', () => {
    const driver = rapierDriver(api, { ...fixture, velocity: [1000, 0, 3] });
    try {
      const sample = driver.step(0);
      expect(sample.position[0]).toBeLessThan(0);
      expect(sample.position[2]).toBeGreaterThan(0);
      expect(sample.velocity[0]).toBeLessThanOrEqual(0);
      expect(sample.velocity[2]).toBeGreaterThan(0);
    } finally {
      driver.dispose();
    }
  });
  it('Rapier edge departure continues falling instead of clamping to a missing surface', () => {
    const platform = { centre: [-4, -1, 0], half: [1, 0.5, 1], rotation: [0, 0, 0, 1] };
    const driver = rapierDriver(api, { ...fixture, position: [0, 0, 0], velocity: [1, -1, 0], boxes: [platform] });
    try {
      const sample = driver.step(0);
      expect(sample.position[1]).toBeLessThan(0);
      expect(sample.velocity[1]).toBeLessThan(-1);
    } finally {
      driver.dispose();
    }
  });
  it('f64 voxel bindings preserve signed JS grid coordinates through mutation and snapshot', () => {
    const world = new World({ x: 0, y: 0, z: 0 });
    let restored: World | undefined;
    try {
      const collider = world.createCollider(ColliderDesc.voxels(new Int32Array([-2, 1, 0]), { x: 1, y: 1, z: 1 }));
      collider.setVoxel(-3, 1, 0, true);
      restored = World.restoreSnapshot(world.takeSnapshot());
      const shape = restored.getCollider(collider.handle).shape as Voxels;
      const data = Array.from(shape.data);
      const cells = data.flatMap((_value, index) => (index % 3 === 0 ? [data.slice(index, index + 3)] : []));
      expect(shape.data).toBeInstanceOf(Int32Array);
      expect(cells).toContainEqual([-2, 1, 0]);
      expect(cells).toContainEqual([-3, 1, 0]);
    } finally {
      restored?.free();
      world.free();
    }
  });
  it('trace comparison distinguishes signed zero and the least f64 bit', () => {
    expect(traceBits([0])).not.toBe(traceBits([-0]));
    expect(traceBits([1])).not.toBe(traceBits([1 + Number.EPSILON]));
  });
});
