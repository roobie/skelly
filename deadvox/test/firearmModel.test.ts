import { readFileSync } from 'node:fs';
import { Group, type Object3D, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { describe, expect, it } from 'vitest';
import firearmContent from '../src/content/base/models-firearms.json' with { type: 'json' };
import type { ModelDef } from '../src/core/content.ts';
import { heldEjectionPose, heldGripOffset } from '../src/core/heldPose.ts';
import {
  actionPartPaths,
  cloneHeldModel,
  type FirearmAction,
  poseActionParts,
  sampleActionStroke,
} from '../src/render/firearmModel.ts';
import { prepareModel } from '../src/render/models.ts';

const ar = firearmContent.models.find((model) => model.id === 'rifle_assault') as ModelDef;
const load = () => {
  const bytes = readFileSync(`src/content/base/${ar.file}`);
  return new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
};

describe('exported firearm presentation', () => {
  it('binds the real colon-named export by glTF index even when every Object3D name is changed', async () => {
    const gltf = await load();
    gltf.scene.traverse((node) => {
      node.name = 'not-an-exported-name';
    });
    const paths = actionPartPaths(gltf.scene, ar.action, gltf.parser);
    const definitions = Object.values(ar.action!.parts);
    expect(definitions.length).toBeGreaterThan(0);
    expect(paths).toHaveLength(definitions.length);
    const { held } = prepareModel(ar, gltf.scene);
    const clone = cloneHeldModel(held, paths);
    expect(clone.parts.map(({ nodeIndex }) => gltf.parser.json.nodes[nodeIndex].name)).toEqual(
      definitions.map(({ node }) => node),
    );
    for (const mode of ['fire', 'hand'] as const) {
      poseActionParts(clone.parts, mode, 1);
      for (const part of clone.parts) {
        const expected = part.rest.clone();
        if (part.modes.includes(mode)) {
          expected.add(part.travel);
        }
        expect(part.node.position.distanceTo(expected)).toBeCloseTo(0, 8);
      }
    }
  });

  it('caps fire at the rpm period while retaining rearward, dwell and return proportions', () => {
    const cycle = { durationSeconds: 0.4, rearwardSeconds: 0.1, dwellSeconds: 0.1, forwardSeconds: 0.2 };
    const action = { ...ar.action!, fire: cycle, hand: cycle, rpm: 600 } satisfies FirearmAction;
    for (const [time, stroke] of [
      [0, 0],
      [0.0125, 0.5],
      [0.025, 1],
      [0.0375, 1],
      [0.05, 1],
      [0.075, 0.5],
      [0.1, 0],
    ] as const) {
      expect(sampleActionStroke(action, 'fire', time)).toBeCloseTo(stroke, 10);
    }
    expect(sampleActionStroke(action, 'hand', 0.1)).toBe(1);
    expect(sampleActionStroke(action, 'hand', 0.3)).toBeCloseTo(0.5);
    expect(sampleActionStroke(action, 'fire', -1)).toBe(0);
  });

  it('samples a hand-only action without inventing an automatic pose', () => {
    const { fire: _fire, rpm: _rpm, ...handOnly } = ar.action!;
    const rearward = handOnly.hand.rearwardSeconds;
    expect(sampleActionStroke(handOnly, 'fire', rearward / 2)).toBe(0);
    expect(sampleActionStroke(handOnly, 'hand', rearward / 2)).toBeCloseTo(0.5);
    expect(sampleActionStroke(handOnly, 'hand', rearward)).toBe(1);
  });

  it('keeps cloned action motion independent from another held copy and the prepared ground meshes', async () => {
    const gltf = await load();
    const paths = actionPartPaths(gltf.scene, ar.action, gltf.parser);
    const prepared = prepareModel(ar, gltf.scene);
    const groundBefore = prepared.groundParts.map(({ matrix }) => matrix.clone());
    const first = cloneHeldModel(prepared.held, paths);
    const other = cloneHeldModel(prepared.held, paths);
    poseActionParts(first.parts, 'hand', 1);
    expect(first.parts.every(({ node, rest }) => !node.position.equals(rest))).toBe(true);
    expect(other.parts.every(({ node, rest }) => node.position.equals(rest))).toBe(true);
    expect(prepared.groundParts.every(({ matrix }, index) => matrix.equals(groundBefore[index]!))).toBe(true);
    poseActionParts(first.parts, undefined, 0);
    expect(first.parts.every(({ node, rest }) => node.position.equals(rest))).toBe(true);
  });

  it('matches gameplay ejection coordinates to the real held hierarchy through grip, roll, pitch and yaw', async () => {
    const gltf = await load();
    const model: ModelDef = { ...ar, grip: { ...ar.grip!, turn: [13, 26, -18] }, roll: 32 };
    const { held } = prepareModel(model, gltf.scene);
    const eye = new Vector3(10, 2, -7);
    const yaw = -1.3;
    const pitch = 0.27;
    for (const side of ['right', 'left'] as const) {
      const view = new Group();
      view.rotation.set(pitch, yaw, 0, 'YXZ');
      view.position.copy(new Vector3(...heldGripOffset(side, true)).applyQuaternion(view.quaternion).add(eye));
      view.add(held);
      view.updateMatrixWorld(true);
      const heldScene = held.children[0]!.children[0]!.children[0]!;
      const expectedAt = heldScene.localToWorld(new Vector3(...model.anchors!.ejection!));
      const expectedDirection = new Vector3(...model.action!.ejectDirection).transformDirection(heldScene.matrixWorld);
      const actual = heldEjectionPose({ model, side, twoHanded: true, eye: [eye.x, eye.y, eye.z], yaw, pitch });
      for (let axis = 0; axis < 3; axis += 1) {
        expect(actual.origin[axis]).toBeCloseTo(expectedAt.getComponent(axis), 9);
        expect(actual.direction[axis]).toBeCloseTo(expectedDirection.getComponent(axis), 9);
      }
    }
  });

  it('converts model-frame travel through a rotated parent instead of moving on the parent x axis', async () => {
    const gltf = await load();
    const index = gltf.parser.json.nodes.findIndex(
      (node: { name?: string }) => node.name === ar.action!.parts.carrier!.node,
    );
    let carrier: Object3D | undefined;
    gltf.scene.traverse((node) => {
      if (gltf.parser.associations.get(node)?.nodes === index) {
        carrier = node;
      }
    });
    const parent = new Group();
    parent.rotation.z = Math.PI / 2;
    gltf.scene.add(parent);
    parent.add(carrier!);
    const paths = actionPartPaths(gltf.scene, ar.action, gltf.parser);
    const clone = cloneHeldModel(prepareModel(ar, gltf.scene).held, paths);
    clone.root.updateMatrixWorld(true);
    const moving = clone.parts.find((part) => part.nodeIndex === index)!;
    const before = moving.node.getWorldPosition(new Vector3());
    const modelScene = clone.root.children[0]!.children[0]!.children[0]!;
    const definition = ar.action!.parts.carrier!;
    const modelOrigin = new Vector3().applyMatrix4(modelScene.matrixWorld);
    const expected = new Vector3(...definition.axis)
      .multiplyScalar(definition.strokeMetres)
      .applyMatrix4(modelScene.matrixWorld)
      .sub(modelOrigin);
    poseActionParts(clone.parts, 'fire', 1);
    clone.root.updateMatrixWorld(true);
    const delta = moving.node.getWorldPosition(new Vector3()).sub(before);
    expect(delta.distanceTo(expected)).toBeCloseTo(0, 8);
  });
});
