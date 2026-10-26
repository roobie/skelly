// biome-ignore-all lint/suspicious/noMisplacedAssertion: shared skin assertions are called only by tests.
import { exportGlb } from '@skelly/thing-export/glb.ts';
import type { ExportSkin } from '@skelly/thing-export/skin.ts';
import { type BufferGeometry, Mesh, type Object3D, SkinnedMesh, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { expect, it } from 'vitest';
import { buildItem, loadCatalogue, palette } from '../src/catalogue.ts';
import { exportItem } from '../src/exports.ts';
import { authoredSkin } from '../src/skin.ts';
import fixture from './fixtures/bend-strip.json' with { type: 'json' };

const item = loadCatalogue(fixture).items[0]!;
const asset = { id: item.id, file: `assets/models/${item.id}.glb` as const };
const voxel = { voxelGrain: item.voxelGrain! };
const exported = () => exportItem(item, asset, voxel);
const meshOf = (root: Object3D) => {
  const meshes: SkinnedMesh[] = [];
  root.traverse((node) => {
    if (node instanceof SkinnedMesh) {
      meshes.push(node);
    }
  });
  expect(meshes.length).toBeGreaterThan(0);
  return meshes[0]!;
};
const weightOf = (mesh: SkinnedMesh, vertexIndex: number, jointIndex: number) => {
  const joints = mesh.geometry.getAttribute('skinIndex');
  const weights = mesh.geometry.getAttribute('skinWeight');
  return [0, 1, 2, 3].reduce(
    (sum, slot) =>
      sum + (joints.getComponent(vertexIndex, slot) === jointIndex ? weights.getComponent(vertexIndex, slot) : 0),
    0,
  );
};
const expectConnected = (geometry: BufferGeometry) => {
  const position = geometry.getAttribute('position');
  const indices = geometry.index!;
  const adjacency = new Map<string, Set<string>>();
  const keyOf = (i: number) => new Vector3().fromBufferAttribute(position, i).toArray().join(',');
  for (let i = 0; i < indices.count; i += 3) {
    const keys = [0, 1, 2].map((j) => keyOf(indices.getX(i + j)));
    for (const a of keys) {
      if (!adjacency.has(a)) {
        adjacency.set(a, new Set());
      }
      for (const b of keys) {
        adjacency.get(a)!.add(b);
      }
    }
  }
  expect(adjacency.size).toBeGreaterThan(0);
  const reached = new Set<string>();
  const pending = [adjacency.keys().next().value!];
  while (pending.length > 0) {
    const key = pending.pop()!;
    if (reached.has(key)) {
      continue;
    }
    reached.add(key);
    pending.push(...adjacency.get(key)!);
  }
  expect(reached.size).toBe(adjacency.size);
};

it('round trips final voxel vertices with named joints, normalized weights and unchanged rest shape', async () => {
  const gltf = await new GLTFLoader().parseAsync(Uint8Array.from(exported().glb).buffer, '');
  const mesh = meshOf(gltf.scene);
  expect(mesh.skeleton.bones.map(({ name }) => name).sort()).toEqual(item.skin!.joints.map(({ name }) => name).sort());
  gltf.scene.updateMatrixWorld(true);
  const position = mesh.geometry.getAttribute('position');
  const weights = mesh.geometry.getAttribute('skinWeight');
  const joints = mesh.geometry.getAttribute('skinIndex');
  expect(weights.count).toBe(position.count);
  expect(joints.count).toBe(position.count);
  const field = authoredSkin(item.skin!);
  let mixed = false;
  for (let i = 0; i < position.count; i++) {
    const point = new Vector3().fromBufferAttribute(position, i);
    const expected = field.weights(point.toArray());
    let total = 0;
    for (let slot = 0; slot < 4; slot++) {
      const weight = weights.getComponent(i, slot);
      expect(weight).toBeGreaterThanOrEqual(0);
      expect(joints.getComponent(i, slot)).toBeLessThan(mesh.skeleton.bones.length);
      total += weight;
    }
    expect(total).toBeCloseTo(1);
    for (const influence of expected) {
      const index = mesh.skeleton.bones.findIndex(({ name }) => name === influence.joint);
      expect(weightOf(mesh, i, index)).toBeCloseTo(influence.weight);
    }
    mixed ||= expected.filter(({ weight }) => weight > 0).length > 1;
    expect(mesh.getVertexPosition(i, new Vector3()).distanceTo(point)).toBeLessThan(1e-6);
  }
  expect(mixed).toBe(true);
  expectConnected(mesh.geometry);
});

it('skin export leaves rigid output unchanged and adds no skin attributes to rigid models', async () => {
  const input = { resolved: buildItem(item, voxel).report.resolved, palette, asset, ...voxel };
  const before = exportGlb(input);
  exported();
  const after = exportGlb(input);
  expect(after).toEqual(before);
  expect(after.ok).toBe(true);
  if (!after.ok) {
    throw new Error('Rigid export refused');
  }
  const gltf = await new GLTFLoader().parseAsync(Uint8Array.from(after.glb).buffer, '');
  let seen = false;
  gltf.scene.traverse((node) => {
    if (node instanceof Mesh) {
      seen = true;
      expect(node).not.toBeInstanceOf(SkinnedMesh);
      expect(node.geometry.getAttribute('skinIndex')).toBeUndefined();
      expect(node.geometry.getAttribute('skinWeight')).toBeUndefined();
    }
  });
  expect(seen).toBe(true);
});

const badSkins: Record<string, (valid: ExportSkin) => ExportSkin> = {
  unassigned: (valid) => ({ ...valid, weights: () => [] }),
  unresolved: (valid) => ({ ...valid, weights: () => [{ joint: 'missing', weight: 1 }] }),
  negative: (valid) => ({ ...valid, weights: () => [{ joint: valid.joints[0]!.name, weight: -1 }] }),
  nonfinite: (valid) => ({ ...valid, weights: () => [{ joint: valid.joints[0]!.name, weight: Number.NaN }] }),
  zero: (valid) => ({ ...valid, weights: () => [{ joint: valid.joints[0]!.name, weight: 0 }] }),
  overflow: (valid) => ({
    ...valid,
    weights: () => [{ joint: valid.joints[0]!.name, weight: Number.POSITIVE_INFINITY }],
  }),
  'too-many-influences': (valid) => ({
    ...valid,
    joints: Array.from({ length: 5 }, (_, index) => ({ ...valid.joints[0]!, name: `joint_${index}` })),
    weights: () => Array.from({ length: 5 }, (_, index) => ({ joint: `joint_${index}`, weight: 1 })),
  }),
  cycle: (valid) => ({ ...valid, joints: valid.joints.map((joint) => ({ ...joint, parent: joint.name })) }),
  'missing-parent': (valid) => ({ ...valid, joints: valid.joints.map((joint) => ({ ...joint, parent: 'missing' })) }),
};
it.each(Object.entries(badSkins))('refuses %s skin data before writing a GLB', (_bad, invalidate) => {
  const out = exportGlb({
    resolved: buildItem(item, voxel).report.resolved,
    palette,
    asset,
    ...voxel,
    skin: invalidate(authoredSkin(item.skin!)),
  });
  expect(out.ok).toBe(false);
  if (!out.ok) {
    expect(out.error.code).toBe('invalid-skin');
  }
});

it('refuses ambiguous authoring regions instead of choosing the first one', () => {
  const skin = item.skin!;
  expect(() =>
    exportItem({ ...item, skin: { ...skin, regions: [...skin.regions, skin.regions[0]!] } }, asset, voxel),
  ).toThrow('ambiguous');
});
