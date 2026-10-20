import { readFileSync } from 'node:fs';
import { resolve } from '@skelly/engine/assembly/resolve.ts';
import { applyPoint, compose, type Transform } from '@skelly/engine/foundation/math.ts';
import { localSolidBounds, penetrationWorld, worldSolid } from '@skelly/engine/shapes/geometry.ts';
import { Matrix4, Quaternion, Vector3 } from 'three';
import { expect, it } from 'vitest';
import { buildRegistry } from '../../deadvox/src/core/content.ts';
import { parseCartridgeJson } from '../src/ammo/parseCartridge.ts';
import { exportFileText } from '../src/cli/exportFile.ts';
import { gunDomain } from '../src/gun/domain.ts';
import { readGlb } from './glbReader.ts';
import { loadFixture } from './helpers.ts';

const exported = exportFileText(readFileSync('designs/archetype-revolver.json', 'utf8'), {
  id: 'fixture_revolver',
  file: 'assets/models/fixture_revolver.glb',
});
if (!exported.ok) {
  throw new Error(exported.message);
}
const metadata = exported.modelEntry.revolver!;
const glb = readGlb(exported.glb);
const resolved = resolve(loadFixture('archetype-revolver'), gunDomain);
const vec = (value: readonly number[]) => new Vector3(value[0], value[1], value[2]);
const rotation = (pivot: readonly number[], axis: readonly number[], angle: number) =>
  new Matrix4()
    .makeTranslation(...vec(pivot).toArray())
    .multiply(new Matrix4().makeRotationAxis(vec(axis), angle))
    .multiply(new Matrix4().makeTranslation(...vec(pivot).negate().toArray()));
const transform = (matrix: Matrix4): Transform => {
  const e = matrix.elements;
  return { r: [e[0]!, e[4]!, e[8]!, e[1]!, e[5]!, e[9]!, e[2]!, e[6]!, e[10]!], t: [e[12]!, e[13]!, e[14]!] };
};

it('exports separate moving nodes, chamber geometry and bore-parallel axes that deadvox validates', () => {
  expect(metadata).toBeDefined();
  expect(exported.modelEntry.action).toBeUndefined();
  const roles = [metadata.crane, metadata.cylinder, metadata.ejector, metadata.hammer, metadata.trigger];
  expect(new Set(roles.map(({ node }) => node)).size).toBe(roles.length);
  for (const role of roles) {
    expect(glb.json.nodes.find(({ name, mesh }) => name === role.node && mesh !== undefined)).toBeDefined();
  }
  expect(metadata.chambers).toBe(Number(resolved.params.get('cylinder')!.chamberCount!.value));
  for (const { axis } of [metadata.crane, metadata.cylinder]) {
    expect(vec(axis).cross(vec(exported.modelEntry.muzzleDirection!)).length()).toBeLessThan(1e-9);
  }
  for (const { axis } of [metadata.hammer, metadata.trigger]) {
    expect(Math.abs(vec(axis).dot(vec(exported.modelEntry.muzzleDirection!)))).toBeLessThan(1e-9);
  }
  const frame = resolved.defs.get('frame')!;
  for (let axis = 0; axis < 3; axis++) {
    const bounds = frame.solids.map(localSolidBounds);
    expect(metadata.crane.pivot[axis]! / gunDomain.units.metresPerUnit).toBeGreaterThanOrEqual(
      Math.min(...bounds.map(([min]) => min[axis]!)),
    );
    expect(metadata.crane.pivot[axis]! / gunDomain.units.metresPerUnit).toBeLessThanOrEqual(
      Math.max(...bounds.map(([, max]) => max[axis]!)),
    );
  }
  const cartridge = parseCartridgeJson(readFileSync('cartridges/357-magnum.json', 'utf8'));
  if (!cartridge.ok || cartridge.cartridge.kind !== 'metallic') {
    throw new Error('Missing cartridge');
  }
  expect(metadata.ejector.strokeMetres).toBe(cartridge.cartridge.case.length.value! / 1000);
  expect(buildRegistry([{ source: 'fixture', data: { models: [exported.modelEntry] } }]).issues).toEqual([]);
});

it('opens the drum clear of every frame solid on the reserved swing side', () => {
  const unit = gunDomain.units.metresPerUnit;
  const { crane } = metadata;
  const motion = transform(
    rotation(
      crane.pivot.map((value) => value / unit),
      crane.axis,
      crane.openRadians,
    ),
  );
  const drum = resolved.defs.get('cylinder')!.solids.find(({ id }) => id === 'drum')!;
  const shape = worldSolid(compose(motion, resolved.placed.get('cylinder')!), drum);
  const frame = resolved.defs.get('frame')!;
  expect(frame.solids.length).toBeGreaterThan(0);
  for (const solid of frame.solids) {
    expect(penetrationWorld(shape, worldSolid(resolved.placed.get('frame')!, solid)), solid.id).toBeLessThanOrEqual(
      1e-7,
    );
  }
  const centre = applyPoint(
    motion,
    metadata.cylinder.centre.map((value) => value / unit) as unknown as readonly [number, number, number],
  );
  const swing = frame.keepOuts.find(({ id }) => id === 'cylinder-swing')!.box;
  expect(centre[2]).toBeLessThanOrEqual(swing.center[2]);
});

it('composes flat assembled nodes so the stroked ejector remains on the opened and indexed cylinder axis', () => {
  const node = glb.json.nodes.find(({ name }) => name === metadata.ejector.node)!;
  const rest = new Matrix4().compose(
    vec(node.translation!),
    new Quaternion(...((node.rotation ?? [0, 0, 0, 1]) as [number, number, number, number])),
    new Vector3(1, 1, 1),
  );
  const crane = rotation(metadata.crane.pivot, metadata.crane.axis, metadata.crane.openRadians);
  const index = rotation(metadata.cylinder.centre, metadata.cylinder.axis, (2 * Math.PI) / metadata.chambers);
  const stroke = new Matrix4().makeTranslation(
    ...vec(metadata.ejector.axis).multiplyScalar(metadata.ejector.strokeMetres).toArray(),
  );
  const pose = crane.clone().multiply(index).multiply(stroke).multiply(rest);
  const points = glb.json.meshes[node.mesh!]!.primitives.filter((primitive) =>
    (primitive.extras as { solids?: string[] })?.solids?.includes('ejector-rod'),
  ).flatMap((primitive) => {
    const values = glb.floats(primitive.attributes.POSITION);
    return Array.from({ length: values.length / 3 }, (_, i) => vec(Array.from(values.slice(i * 3, i * 3 + 3))));
  });
  expect(points.length).toBeGreaterThan(0);
  const minX = Math.min(...points.map(({ x }) => x));
  const maxX = Math.max(...points.map(({ x }) => x));
  const axis = vec(metadata.cylinder.axis).transformDirection(crane);
  const centre = vec(metadata.cylinder.centre).applyMatrix4(crane);
  for (const x of [minX, maxX]) {
    const end = points.filter((point) => point.x === x);
    expect(end.length).toBeGreaterThan(0);
    const average = end
      .reduce((sum, point) => sum.add(point), new Vector3())
      .divideScalar(end.length)
      .applyMatrix4(pose);
    expect(average.sub(centre).cross(axis).length()).toBeLessThan(1e-7);
  }
});

it('rejects malformed revolver rotations and aliased moving nodes', () => {
  for (const crane of [
    { ...metadata.crane, axis: [0, 0, 0] },
    { ...metadata.crane, node: metadata.cylinder.node },
    { ...metadata.crane, openRadians: 0 },
  ]) {
    const model = { ...exported.modelEntry, revolver: { ...metadata, crane } };
    expect(buildRegistry([{ source: 'fixture', data: { models: [model] } }]).issues.length).toBeGreaterThan(0);
  }
});
