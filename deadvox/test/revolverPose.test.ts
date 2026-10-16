import { readFileSync } from 'node:fs';
import { Matrix4, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { expect, it } from 'vitest';
import type { CylinderState } from '../src/core/firearmState.ts';
import { actionPartPaths, cloneHeldModel, poseRevolverParts } from '../src/render/firearmModel.ts';
import { prepareModel } from '../src/render/models.ts';
import { content } from './fixtures/startupContent.ts';

it('flat revolver nodes ride the crane without accumulating motion, then return to their exported rests', async () => {
  const model = [...content.registry.models.values()].find((definition) => definition.revolver)!;
  const data = model.revolver!;
  const bytes = readFileSync(`src/content/base/${model.file}`);
  const gltf = await new GLTFLoader().parseAsync(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    '',
  );
  const paths = actionPartPaths(gltf.scene, undefined, gltf.parser, data);
  const held = cloneHeldModel(prepareModel(model, gltf.scene).held, paths);
  const state: CylinderState = {
    chambers: Array.from({ length: data.chambers }, () => ({ state: 'empty' })),
    aligned: 0,
    open: false,
    cocked: false,
  };
  const rests = held.parts.map((part) => part.restMatrix.clone());
  expect(held.parts.length).toBeGreaterThan(0);
  state.open = true;
  poseRevolverParts(held.parts, data, state);
  const posed = held.parts.map((part) => part.node.matrix.clone());
  const cylinder = held.parts.find((part) => part.revolverPart === 'cylinder')!;
  const crane = held.parts.find((part) => part.revolverPart === 'crane')!;
  const delta = (part: typeof cylinder) => part.node.matrix.clone().multiply(part.restMatrix.clone().invert());
  const point = new Vector3(...data.cylinder.centre);
  const carriedPoint = point.clone().applyMatrix4(delta(cylinder));
  expect(carriedPoint.distanceTo(point)).toBeGreaterThan(0);
  const cranePoint = point.clone().applyMatrix4(delta(crane));
  expect(carriedPoint.distanceTo(cranePoint)).toBeLessThan(1e-9);
  poseRevolverParts(held.parts, data, state);
  held.parts.forEach((part, index) => {
    expect(part.node.matrix.elements).toEqual(posed[index]!.elements);
  });
  state.open = false;
  poseRevolverParts(held.parts, data, state);
  held.parts.forEach((part, index) => {
    const error = new Matrix4()
      .copy(part.node.matrix)
      .elements.map((value, axis) => Math.abs(value - rests[index]!.elements[axis]!));
    expect(Math.max(...error)).toBeLessThan(1e-9);
  });
});
