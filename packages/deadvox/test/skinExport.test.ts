// biome-ignore-all lint/suspicious/noMisplacedAssertion: shared skin assertions are called only by tests.
import { type BufferGeometry, Matrix4, Mesh, type Object3D, SkinnedMesh, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { afterEach, expect, it, vi } from 'vitest';
import { buildItem, loadCatalogue, palette } from '../../thing-authoring-tool/src/catalogue.ts';
import { exportItem } from '../../thing-authoring-tool/src/exports.ts';
import { authoredSkin } from '../../thing-authoring-tool/src/skin.ts';
import fixture from '../../thing-authoring-tool/test/fixtures/bend-strip.json' with { type: 'json' };
import { exportGlb } from '../../thing-export/src/glb.ts';
import type { ExportSkin } from '../../thing-export/src/skin.ts';
import { ModelLibrary } from '../src/render/models.ts';
import { buildFixtureRegistry } from './economyFixtures.ts';

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
const vertex = (mesh: SkinnedMesh, index: number) => mesh.getVertexPosition(index, new Vector3());
const close = (actual: Vector3, expected: Vector3) => expect(actual.distanceTo(expected)).toBeLessThan(1e-6);
const weightOf = (mesh: SkinnedMesh, vertexIndex: number, jointIndex: number) => {
  const joints = mesh.geometry.getAttribute('skinIndex');
  const weights = mesh.geometry.getAttribute('skinWeight');
  return [0, 1, 2, 3].reduce(
    (sum, slot) =>
      sum + (joints.getComponent(vertexIndex, slot) === jointIndex ? weights.getComponent(vertexIndex, slot) : 0),
    0,
  );
};
const load = async () => {
  const out = exported();
  const gltf = await new GLTFLoader().parseAsync(Uint8Array.from(out.glb).buffer, '');
  vi.spyOn(GLTFLoader.prototype, 'load').mockImplementation((_url, loaded) => {
    loaded(gltf);
  });
  const { registry, issues } = buildFixtureRegistry([{ source: 'skin-fixture', data: { models: [out.modelEntry] } }]);
  expect(issues).toEqual([]);
  const report = vi.fn();
  const library = new ModelLibrary(registry, report, { [asset.file]: 'fixture.glb' });
  expect(report).not.toHaveBeenCalled();
  expect(library.has(asset.id)).toBe(true);
  expect(library.groundParts(asset.id)).toBeUndefined();
  expect(library.held(asset.id)).toBeUndefined();
  expect(library.part(asset.id)).toBeUndefined();
  return { library, gltf };
};
afterEach(() => vi.restoreAllMocks());

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
  const { library } = await load();
  const instance = library.skinned(asset.id)!;
  const mesh = meshOf(instance.root);
  expect([...instance.bones.keys()].sort()).toEqual(item.skin!.joints.map(({ name }) => name).sort());
  instance.bounds();
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
    close(vertex(mesh, i), point);
  }
  expect(mixed).toBe(true);
  expectConnected(mesh.geometry);
  instance.dispose();
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

it('bends the band and far side, keeps the fixed side still, and bounds the deformed strip under placement', async () => {
  const { library } = await load();
  const instance = library.skinned(asset.id)!;
  const mesh = meshOf(instance.root);
  instance.bounds();
  const before = Array.from({ length: mesh.geometry.getAttribute('position').count }, (_, i) => vertex(mesh, i));
  const joint = item.skin!.joints.find(({ parent }) => parent)!;
  const pivot = new Vector3(...joint.rest.t);
  const turn = new Matrix4()
    .makeTranslation(...pivot.toArray())
    .multiply(new Matrix4().makeRotationZ(Math.PI / 3))
    .multiply(new Matrix4().makeTranslation(...pivot.clone().negate().toArray()));
  instance.pose(
    new Map(
      item.skin!.joints.map((entry) => [
        entry.name,
        entry.parent ? turn.clone().multiply(new Matrix4().makeTranslation(...entry.rest.t)) : new Matrix4(),
      ]),
    ),
  );
  const moving = mesh.skeleton.bones.findIndex(({ name }) => name === joint.name);
  const saw = new Set<string>();
  for (let i = 0; i < before.length; i++) {
    const weight = weightOf(mesh, i, moving);
    const expected = before[i]!.clone().lerp(before[i]!.clone().applyMatrix4(turn), weight);
    close(vertex(mesh, i), expected);
    if (weight === 0) {
      saw.add('fixed');
    } else if (expected.distanceTo(before[i]!) > 1e-6) {
      saw.add(weight === 1 ? 'far' : 'band');
    }
  }
  expect(saw).toEqual(new Set(['fixed', 'far', 'band']));
  instance.root.position.set(3, -2, 1);
  const bounds = instance.bounds().expandByScalar(1e-6);
  for (let i = 0; i < before.length; i++) {
    expect(bounds.containsPoint(vertex(mesh, i).applyMatrix4(mesh.matrixWorld))).toBe(true);
  }
  expect(mesh.boundingSphere).not.toBeNull();
  instance.dispose();
});

it('instances own their bones: posing or disposing one cannot change the other or prototype', async () => {
  const { library, gltf } = await load();
  const first = library.skinned(asset.id)!;
  const second = library.skinned(asset.id)!;
  const a = meshOf(first.root);
  const b = meshOf(second.root);
  const prototype = meshOf(gltf.scene);
  first.bounds();
  second.bounds();
  const before = Array.from({ length: b.geometry.getAttribute('position').count }, (_, i) => vertex(b, i));
  const frames = new Map(
    item.skin!.joints.map((joint) => [
      joint.name,
      new Matrix4().makeRotationZ(Math.PI / 4).multiply(new Matrix4().makeTranslation(...joint.rest.t)),
    ]),
  );
  first.pose(frames);
  expect(before.some((point, i) => point.distanceTo(vertex(a, i)) > 1e-6)).toBe(true);
  second.bounds();
  for (let i = 0; i < before.length; i++) {
    close(vertex(b, i), before[i]!);
  }
  first.dispose();
  second.bounds();
  for (let i = 0; i < before.length; i++) {
    close(vertex(b, i), before[i]!);
  }
  expect(a.geometry).toBe(b.geometry);
  expect(a.skeleton).not.toBe(b.skeleton);
  expect(a.skeleton.bones[0]).not.toBe(prototype.skeleton.bones[0]);
  second.dispose();
});

it('preserves child length under a nonuniformly scaled rotated parent without losing compensating shear', async () => {
  const { library } = await load();
  const instance = library.skinned(asset.id)!;
  const root = item.skin!.joints.find(({ parent }) => !parent)!;
  const child = item.skin!.joints.find(({ parent }) => parent)!;
  const parentFrame = new Matrix4().makeRotationZ(Math.PI / 5).scale(new Vector3(1, 1.7, 1));
  const childFrame = new Matrix4()
    .makeTranslation(...new Vector3(...child.rest.t).applyMatrix4(parentFrame).toArray())
    .multiply(new Matrix4().makeRotationZ(-Math.PI / 4));
  instance.pose(
    new Map([
      [root.name, parentFrame],
      [child.name, childFrame],
    ]),
  );
  const bone = instance.bones.get(child.name)!;
  expect(bone.matrixAutoUpdate).toBe(false);
  const origin = new Vector3();
  const end = new Vector3(0, 1, 0);
  const length = origin.clone().applyMatrix4(bone.matrixWorld).distanceTo(end.clone().applyMatrix4(bone.matrixWorld));
  expect(length).toBeCloseTo(origin.distanceTo(end));
  close(end.clone().applyMatrix4(bone.matrixWorld), end.clone().applyMatrix4(childFrame));
  const mesh = meshOf(instance.root);
  const positions = mesh.geometry.getAttribute('position');
  const childIndex = mesh.skeleton.bones.indexOf(bone);
  let tested = false;
  for (let i = 0; i < positions.count; i++) {
    if (weightOf(mesh, i, childIndex) !== 1) {
      continue;
    }
    const rest = new Vector3().fromBufferAttribute(positions, i);
    close(vertex(mesh, i), rest.sub(new Vector3(...child.rest.t)).applyMatrix4(childFrame));
    tested = true;
  }
  expect(tested).toBe(true);
  instance.dispose();
});
