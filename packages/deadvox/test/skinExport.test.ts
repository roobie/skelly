// biome-ignore-all lint/suspicious/noMisplacedAssertion: shared skin assertions are called only by tests.
import { readFileSync } from 'node:fs';
import { Bone, Matrix4, type Object3D, SkinnedMesh, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { afterEach, expect, it, vi } from 'vitest';
import { ModelLibrary } from '../src/render/models.ts';
import { buildFixtureRegistry } from './economyFixtures.ts';
import modelEntry from './fixtures/skin/things/bend_strip.model.json' with { type: 'json' };

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
  const bytes = readFileSync(new URL(`./fixtures/skin/${modelEntry.file}`, import.meta.url));
  const gltf = await new GLTFLoader().parseAsync(Uint8Array.from(bytes).buffer, '');
  vi.spyOn(GLTFLoader.prototype, 'load').mockImplementation((_url, loaded) => {
    loaded(gltf);
  });
  const { registry, issues } = buildFixtureRegistry([{ source: 'skin-fixture', data: { models: [modelEntry] } }]);
  expect(issues).toEqual([]);
  const report = vi.fn();
  const library = new ModelLibrary(registry, report, { [modelEntry.file]: 'fixture.glb' });
  expect(report).not.toHaveBeenCalled();
  expect(library.has(modelEntry.id)).toBe(true);
  expect(library.groundParts(modelEntry.id)).toBeUndefined();
  expect(library.held(modelEntry.id)).toBeUndefined();
  expect(library.part(modelEntry.id)).toBeUndefined();
  return { library, gltf };
};
afterEach(() => vi.restoreAllMocks());

const rigOf = (instance: NonNullable<ReturnType<ModelLibrary['skinned']>>) => {
  instance.root.updateMatrixWorld(true);
  const toRoot = instance.root.matrixWorld.clone().invert();
  const frames = new Map([...instance.bones].map(([name, bone]) => [name, toRoot.clone().multiply(bone.matrixWorld)]));
  const child = [...instance.bones.values()].find((bone) => bone.parent instanceof Bone);
  expect(child).toBeInstanceOf(Bone);
  const parent = child!.parent as Bone;
  expect(instance.bones.get(parent.name)).toBe(parent);
  return { frames, child: child!, parent };
};

it('bends the band and far side, keeps the fixed side still, and bounds the deformed strip under placement', async () => {
  const { library } = await load();
  const instance = library.skinned(modelEntry.id)!;
  const mesh = meshOf(instance.root);
  const { child, frames } = rigOf(instance);
  instance.bounds();
  const before = Array.from({ length: mesh.geometry.getAttribute('position').count }, (_, i) => vertex(mesh, i));
  const pivot = new Vector3().setFromMatrixPosition(frames.get(child.name)!);
  const turn = new Matrix4()
    .makeTranslation(...pivot.toArray())
    .multiply(new Matrix4().makeRotationZ(Math.PI / 3))
    .multiply(new Matrix4().makeTranslation(...pivot.clone().negate().toArray()));
  instance.pose(
    new Map([...frames].map(([name, rest]) => [name, name === child.name ? turn.clone().multiply(rest) : rest])),
  );
  const moving = mesh.skeleton.bones.indexOf(child);
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
  const first = library.skinned(modelEntry.id)!;
  const second = library.skinned(modelEntry.id)!;
  const a = meshOf(first.root);
  const b = meshOf(second.root);
  const prototype = meshOf(gltf.scene);
  const { frames } = rigOf(first);
  first.bounds();
  second.bounds();
  const before = Array.from({ length: b.geometry.getAttribute('position').count }, (_, i) => vertex(b, i));
  const turn = new Matrix4().makeRotationZ(Math.PI / 4);
  first.pose(new Map([...frames].map(([name, rest]) => [name, turn.clone().multiply(rest)])));
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
  const instance = library.skinned(modelEntry.id)!;
  const { child, parent, frames } = rigOf(instance);
  const parentRest = frames.get(parent.name)!;
  const childRest = frames.get(child.name)!;
  const parentFrame = new Matrix4()
    .makeRotationZ(Math.PI / 5)
    .scale(new Vector3(1, 1.7, 1))
    .multiply(parentRest);
  const childPosition = new Vector3()
    .setFromMatrixPosition(childRest)
    .applyMatrix4(parentRest.clone().invert())
    .applyMatrix4(parentFrame);
  const childFrame = new Matrix4()
    .makeTranslation(...childPosition.toArray())
    .multiply(new Matrix4().makeRotationZ(-Math.PI / 4));
  frames.set(parent.name, parentFrame);
  frames.set(child.name, childFrame);
  instance.pose(frames);
  expect(child.matrixAutoUpdate).toBe(false);
  const origin = new Vector3();
  const end = new Vector3(0, 1, 0);
  const length = origin.clone().applyMatrix4(child.matrixWorld).distanceTo(end.clone().applyMatrix4(child.matrixWorld));
  expect(length).toBeCloseTo(origin.distanceTo(end));
  close(end.clone().applyMatrix4(child.matrixWorld), end.clone().applyMatrix4(childFrame));
  const mesh = meshOf(instance.root);
  const positions = mesh.geometry.getAttribute('position');
  const childIndex = mesh.skeleton.bones.indexOf(child);
  const deformation = childFrame.clone().multiply(childRest.clone().invert());
  let tested = false;
  for (let i = 0; i < positions.count; i++) {
    if (weightOf(mesh, i, childIndex) !== 1) {
      continue;
    }
    const rest = new Vector3().fromBufferAttribute(positions, i);
    close(vertex(mesh, i), rest.applyMatrix4(deformation));
    tested = true;
  }
  expect(tested).toBe(true);
  instance.dispose();
});
