import { Matrix4, SkinnedMesh, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { afterEach, expect, it, vi } from 'vitest';
import fixture from '../../thing-authoring-tool/test/fixtures/bend-strip.json' with { type: 'json' };
import { buildItem, loadCatalogue, palette } from '../../thing-authoring-tool/src/catalogue.ts';
import { exportItem } from '../../thing-authoring-tool/src/exports.ts';
import { authoredSkin } from '../../thing-authoring-tool/src/skin.ts';
import { exportGlb } from '../../thing-export/src/glb.ts';
import type { ExportSkin } from '../../thing-export/src/skin.ts';
import { ModelLibrary } from '../src/render/models.ts';
import { buildFixtureRegistry } from './economyFixtures.ts';

const item = loadCatalogue(fixture).items[0]!;
const asset = { id: item.id, file: `assets/models/${item.id}.glb` as const };
const voxel = { voxelGrain: item.voxelGrain! };
const exported = () => exportItem(item, asset, voxel);
const meshOf = (root: import('three').Object3D) => {
  const meshes: SkinnedMesh[] = [];
  root.traverse((node) => { if (node instanceof SkinnedMesh) meshes.push(node); });
  expect(meshes.length).toBeGreaterThan(0);
  return meshes[0]!;
};
const vertex = (mesh: SkinnedMesh, index: number) => mesh.getVertexPosition(index, new Vector3());
const close = (actual: Vector3, expected: Vector3) => expect(actual.distanceTo(expected)).toBeLessThan(1e-6);
const load = async () => {
  const out = exported();
  const gltf = await new GLTFLoader().parseAsync(Uint8Array.from(out.glb).buffer, '');
  vi.spyOn(GLTFLoader.prototype, 'load').mockImplementation((_url, loaded) => { loaded(gltf); });
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
      const actual = [0, 1, 2, 3].reduce((sum, slot) => sum + (joints.getComponent(i, slot) === index ? weights.getComponent(i, slot) : 0), 0);
      expect(actual).toBeCloseTo(influence.weight);
    }
    mixed ||= expected.filter(({ weight }) => weight > 0).length > 1;
    close(vertex(mesh, i), point);
  }
  expect(mixed).toBe(true);
  // Voxel face splits may duplicate indices, but the surface must remain connected by shared positions.
  const indices = mesh.geometry.index!;
  const adjacency = new Map<string, Set<string>>();
  const key = (i: number) => new Vector3().fromBufferAttribute(position, i).toArray().join(',');
  for (let i = 0; i < indices.count; i += 3) {
    const keys = [0, 1, 2].map((j) => key(indices.getX(i + j)));
    for (const a of keys) {
      if (!adjacency.has(a)) adjacency.set(a, new Set());
      for (const b of keys) adjacency.get(a)!.add(b);
    }
  }
  const reached = new Set<string>();
  const pending = [adjacency.keys().next().value!];
  while (pending.length) {
    const key = pending.pop()!;
    if (reached.has(key)) continue;
    reached.add(key);
    pending.push(...adjacency.get(key)!);
  }
  expect(reached.size).toBe(adjacency.size);
  instance.dispose();
});

it.each(['unassigned', 'unresolved', 'negative', 'nonfinite', 'zero', 'overflow', 'cycle', 'missing-parent'] as const)('refuses %s skin data before writing a GLB', (bad) => {
  const valid = authoredSkin(item.skin!);
  const invalid: ExportSkin = {
    joints: bad === 'cycle' ? valid.joints.map((joint) => ({ ...joint, parent: joint.name })) : bad === 'missing-parent' ? valid.joints.map((joint) => ({ ...joint, parent: 'missing' })) : valid.joints,
    weights: () => bad === 'unassigned' ? [] : [{ joint: bad === 'unresolved' ? 'missing' : valid.joints[0]!.name, weight: bad === 'negative' ? -1 : bad === 'nonfinite' ? NaN : bad === 'zero' ? 0 : bad === 'overflow' ? Infinity : 1 }],
  };
  const out = exportGlb({ resolved: buildItem(item, voxel).report.resolved, palette, asset, ...voxel, skin: invalid });
  expect(out.ok).toBe(false);
  if (!out.ok) expect(out.error.code).toBe('invalid-skin');
});

it('refuses ambiguous authoring regions instead of choosing the first one', () => {
  const skin = item.skin!;
  expect(() => exportItem({ ...item, skin: { ...skin, regions: [...skin.regions, skin.regions[0]!] } }, asset, voxel)).toThrow('ambiguous');
});

it('bends the band and far side, keeps the fixed side still, and bounds the deformed strip under placement', async () => {
  const { library } = await load();
  const instance = library.skinned(asset.id)!;
  const mesh = meshOf(instance.root);
  instance.bounds();
  const before = Array.from({ length: mesh.geometry.getAttribute('position').count }, (_, i) => vertex(mesh, i));
  const joint = item.skin!.joints.find(({ parent }) => parent)!;
  const pivot = new Vector3(...joint.rest.t);
  const turn = new Matrix4().makeTranslation(...pivot.toArray()).multiply(new Matrix4().makeRotationZ(Math.PI / 3)).multiply(new Matrix4().makeTranslation(...pivot.clone().negate().toArray()));
  instance.pose(new Map(item.skin!.joints.map((entry) => [entry.name, entry.parent ? turn.clone().multiply(new Matrix4().makeTranslation(...entry.rest.t)) : new Matrix4()])));
  const weights = mesh.geometry.getAttribute('skinWeight');
  const indices = mesh.geometry.getAttribute('skinIndex');
  const moving = mesh.skeleton.bones.findIndex(({ name }) => name === joint.name);
  const saw = new Set<string>();
  for (let i = 0; i < before.length; i++) {
    const weight = [0, 1, 2, 3].reduce((sum, slot) => sum + (indices.getComponent(i, slot) === moving ? weights.getComponent(i, slot) : 0), 0);
    const expected = before[i]!.clone().lerp(before[i]!.clone().applyMatrix4(turn), weight);
    close(vertex(mesh, i), expected);
    if (weight === 0) saw.add('fixed');
    else if (expected.distanceTo(before[i]!) > 1e-6) saw.add(weight === 1 ? 'far' : 'band');
  }
  expect(saw).toEqual(new Set(['fixed', 'far', 'band']));
  instance.root.position.set(3, -2, 1);
  const bounds = instance.bounds();
  for (let i = 0; i < before.length; i++) expect(bounds.clone().expandByScalar(1e-6).containsPoint(vertex(mesh, i).applyMatrix4(mesh.matrixWorld))).toBe(true);
  expect(mesh.boundingSphere).not.toBeNull();
});

it('instances own their bones: posing or disposing one cannot change the other or prototype', async () => {
  const { library, gltf } = await load();
  const first = library.skinned(asset.id)!;
  const second = library.skinned(asset.id)!;
  const a = meshOf(first.root);
  const b = meshOf(second.root);
  const prototype = meshOf(gltf.scene);
  first.bounds(); second.bounds();
  const before = Array.from({ length: b.geometry.getAttribute('position').count }, (_, i) => vertex(b, i));
  const frames = new Map(item.skin!.joints.map((joint) => [joint.name, new Matrix4().makeRotationZ(Math.PI / 4).multiply(new Matrix4().makeTranslation(...joint.rest.t))]));
  first.pose(frames);
  expect(before.some((point, i) => point.distanceTo(vertex(a, i)) > 1e-6)).toBe(true);
  second.bounds();
  for (let i = 0; i < before.length; i++) close(vertex(b, i), before[i]!);
  first.dispose();
  second.bounds();
  for (let i = 0; i < before.length; i++) close(vertex(b, i), before[i]!);
  expect(a.geometry).toBe(b.geometry);
  expect(a.skeleton).not.toBe(b.skeleton);
  expect(a.skeleton.bones[0]).not.toBe(prototype.skeleton.bones[0]);
});

it('preserves child length under a nonuniformly scaled rotated parent without losing compensating shear', async () => {
  const { library } = await load();
  const instance = library.skinned(asset.id)!;
  const root = item.skin!.joints.find(({ parent }) => !parent)!;
  const child = item.skin!.joints.find(({ parent }) => parent)!;
  const parentFrame = new Matrix4().makeRotationZ(Math.PI / 5).scale(new Vector3(1, 1.7, 1));
  const childFrame = new Matrix4().makeTranslation(...new Vector3(...child.rest.t).applyMatrix4(parentFrame).toArray()).multiply(new Matrix4().makeRotationZ(-Math.PI / 4));
  instance.pose(new Map([[root.name, parentFrame], [child.name, childFrame]]));
  const bone = instance.bones.get(child.name)!;
  expect(bone.matrixAutoUpdate).toBe(false);
  const origin = new Vector3();
  const end = new Vector3(0, 1, 0);
  expect(origin.clone().applyMatrix4(bone.matrixWorld).distanceTo(end.clone().applyMatrix4(bone.matrixWorld))).toBeCloseTo(origin.distanceTo(end));
  close(end.clone().applyMatrix4(bone.matrixWorld), end.clone().applyMatrix4(childFrame));
  const mesh = meshOf(instance.root);
  const positions = mesh.geometry.getAttribute('position');
  const weights = mesh.geometry.getAttribute('skinWeight');
  const indices = mesh.geometry.getAttribute('skinIndex');
  const childIndex = mesh.skeleton.bones.indexOf(bone);
  let tested = false;
  for (let i = 0; i < positions.count; i++) {
    if (![0, 1, 2, 3].some((slot) => indices.getComponent(i, slot) === childIndex && weights.getComponent(i, slot) === 1)) continue;
    const rest = new Vector3().fromBufferAttribute(positions, i);
    close(vertex(mesh, i), rest.sub(new Vector3(...child.rest.t)).applyMatrix4(childFrame));
    tested = true;
  }
  expect(tested).toBe(true);
});
