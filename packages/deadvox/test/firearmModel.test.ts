import { readFileSync } from 'node:fs';
import { Box3, Group, type Object3D, Quaternion, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { parse } from 'valibot';
import { describe, expect, it } from 'vitest';
import firearmContent from '../src/content/base/models-firearms.json' with { type: 'json' };
import type { ModelDef } from '../src/core/content.ts';
import { heldEjectionPose, heldGripOffset } from '../src/core/heldPose.ts';
import { ModelSchema } from '../src/core/schema.ts';
import { simPerMinute, simSeconds } from '../src/core/time.ts';
import {
  actionPartPaths,
  cloneHeldModel,
  type FirearmAction,
  magazineMotion,
  poseActionParts,
  sampleActionStroke,
  sampleActionTurn,
} from '../src/render/firearmModel.ts';
import { prepareModel } from '../src/render/models.ts';
import { baseRegistry } from './baseRegistry.ts';

const { holds } = baseRegistry().figures.get('player')!;

const ar = parse(
  ModelSchema,
  firearmContent.models.find((model) => model.id === 'rifle_assault'),
);
const ak = parse(
  ModelSchema,
  firearmContent.models.find((model) => model.id === 'rifle_ak'),
);
const load = (model: ModelDef = ar) => {
  const bytes = readFileSync(`src/content/base/${model.file}`);
  return new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
};

describe('exported firearm presentation', () => {
  it('turns the exported bolt knob before drawing it by the exported stroke and resets from rest', async () => {
    const bolt = parse(
      ModelSchema,
      firearmContent.models.find(
        (candidate) =>
          'gun' in candidate &&
          'action' in candidate.gun &&
          Object.values(candidate.gun.action.parts).some((part) => 'turn' in part),
      ),
    );
    const action = bolt.gun!.action!;
    const gltf = await load(bolt);
    const paths = actionPartPaths(gltf.scene, action, gltf.parser);
    const clone = cloneHeldModel(prepareModel(bolt, gltf.scene).held, paths);
    const knob = clone.parts.find((part) => part.id === 'knob')!;
    expect(knob).toBeDefined();
    clone.root.updateMatrixWorld(true);
    const scene = clone.root.children[0]!.children[0]!.children[0]!;
    const rest = scene.worldToLocal(knob.node.getWorldPosition(new Vector3()));
    const definition = action.parts.knob!;
    const rotation = new Quaternion().setFromAxisAngle(
      new Vector3(...definition.turn!.axis),
      definition.turn!.angleRadians,
    );
    const turned = rest
      .clone()
      .sub(new Vector3(...definition.turn!.pivot))
      .applyQuaternion(rotation)
      .add(new Vector3(...definition.turn!.pivot));
    expect(turned.distanceTo(rest)).toBeGreaterThan(0);
    const unlock = action.hand.unlockSimSeconds!;
    for (const [time, stroke] of [
      [unlock, 0],
      [unlock + action.hand.rearwardSimSeconds, 1],
    ] as const) {
      poseActionParts(
        clone.parts,
        'hand',
        sampleActionStroke(action, 'hand', time),
        sampleActionTurn(action, 'hand', time),
      );
      clone.root.updateMatrixWorld(true);
      const actual = scene.worldToLocal(knob.node.getWorldPosition(new Vector3()));
      const expected = turned
        .clone()
        .addScaledVector(new Vector3(...definition.axis), definition.strokeMetres * stroke);
      expect(actual.distanceTo(expected)).toBeCloseTo(0, 8);
    }
    poseActionParts(clone.parts, undefined, 0);
    expect(knob.node.position.equals(knob.rest)).toBe(true);
    expect(knob.node.quaternion.angleTo(knob.restRotation)).toBeCloseTo(0);
  });
  it('uses the actual AK rear-notch top as the ADS sight datum', async () => {
    const gltf = await load(ak);
    gltf.scene.updateMatrixWorld(true);
    const nodes = gltf.parser.json.nodes as { extras?: { family?: string } }[];
    const rearIndex = nodes.findIndex((node) => node.extras?.family === 'ak-rear-sight');
    expect(rearIndex).toBeGreaterThanOrEqual(0);
    let rearSight: Object3D | undefined;
    gltf.scene.traverse((node) => {
      if (gltf.parser.associations.get(node)?.nodes === rearIndex) {
        rearSight = node;
      }
    });
    expect(rearSight).toBeDefined();
    const bounds = new Box3().setFromObject(rearSight!);
    expect(ak.gun?.sight?.eye[1]).toBeCloseTo(bounds.max.y, 7);
  });

  it('binds the real colon-named export by glTF index even when every Object3D name is changed', async () => {
    const gltf = await load();
    gltf.scene.traverse((node) => {
      node.name = 'not-an-exported-name';
    });
    const paths = actionPartPaths(gltf.scene, ar.gun?.action, gltf.parser);
    const definitions = Object.values(ar.gun!.action!.parts);
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
    const cycle = {
      durationSimSeconds: simSeconds(0.4),
      rearwardSimSeconds: simSeconds(0.1),
      dwellSimSeconds: simSeconds(0.1),
      forwardSimSeconds: simSeconds(0.2),
    };
    const action = {
      ...ar.gun!.action!,
      fire: cycle,
      hand: cycle,
      roundsPerSimMinute: simPerMinute(600),
    } satisfies FirearmAction;
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
    const { fire: _fire, roundsPerSimMinute: _rate, ...handOnly } = ar.gun!.action!;
    const rearward = handOnly.hand.rearwardSimSeconds;
    expect(sampleActionStroke(handOnly, 'fire', rearward / 2)).toBe(0);
    expect(sampleActionStroke(handOnly, 'hand', rearward / 2)).toBeCloseTo(0.5);
    expect(sampleActionStroke(handOnly, 'hand', rearward)).toBe(1);
  });

  it('poses a magazine job from its progress alone: out of the well first, then the new one in, never both', () => {
    // A removal alone, an insertion alone, and a change that removes before it inserts.
    for (const removeShare of [1, 0, 0.5]) {
      const poses = Array.from({ length: 33 }, (_, step) => {
        const pose = magazineMotion(step / 16, 2, removeShare);
        expect(magazineMotion(step / 8, 4, removeShare)).toEqual(pose); // A longer job at the same progress.
        expect(pose.outgoing === undefined || pose.incoming === undefined).toBe(true);
        return pose;
      });
      const outgoing = poses.flatMap((pose) => (pose.outgoing === undefined ? [] : [pose.outgoing]));
      const incoming = poses.flatMap((pose) => (pose.incoming === undefined ? [] : [pose.incoming]));
      expect(outgoing).toEqual(outgoing.toSorted((a, b) => a - b));
      expect(incoming).toEqual(incoming.toSorted((a, b) => b - a));
      const firstIn = poses.findIndex((pose) => pose.incoming !== undefined);
      expect(firstIn === -1 || poses.findLastIndex((pose) => pose.outgoing !== undefined) < firstIn).toBe(true);
      // Only a removal leaves the well empty, and only once it is done.
      expect(poses.every((pose) => pose.outgoing !== undefined || pose.incoming !== undefined)).toBe(removeShare < 1);
      expect(outgoing.length > 0).toBe(removeShare > 0);
      expect(incoming.length > 0).toBe(removeShare < 1);
      expect(poses[0]).toMatchObject(removeShare > 0 ? { outgoing: 0 } : { incoming: 1 }); // Starts seated, or clear.
      expect(poses.at(-1)!.outgoing).toBeUndefined(); // Ends gone, or seated.
      expect(poses.at(-1)!.incoming ?? 0).toBe(0);
      expect([poses[0]!.reach, poses.at(-1)!.reach]).toEqual([0, 0]); // The hand starts and ends at its grip.
    }
    expect(magazineMotion(-1, 2, 0.5)).toEqual(magazineMotion(0, 2, 0.5));
    expect(magazineMotion(3, 2, 0.5)).toEqual(magazineMotion(2, 2, 0.5));
  });

  it('keeps cloned action motion independent from another held copy and the prepared ground meshes', async () => {
    const gltf = await load();
    const paths = actionPartPaths(gltf.scene, ar.gun?.action, gltf.parser);
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
      view.position.copy(
        new Vector3(...heldGripOffset({ side, twoHanded: true, model, holds }))
          .applyQuaternion(view.quaternion)
          .add(eye),
      );
      view.add(held);
      view.updateMatrixWorld(true);
      const heldScene = held.children[0]!.children[0]!.children[0]!;
      const expectedAt = heldScene.localToWorld(new Vector3(...model.anchors!.ejection!));
      const expectedDirection = new Vector3(...model.gun!.action!.ejectDirection).transformDirection(
        heldScene.matrixWorld,
      );
      const actual = heldEjectionPose({ holds, model, side, twoHanded: true, eye: [eye.x, eye.y, eye.z], yaw, pitch });
      for (let axis = 0; axis < 3; axis += 1) {
        expect(actual.origin[axis]).toBeCloseTo(expectedAt.getComponent(axis), 9);
        expect(actual.direction[axis]).toBeCloseTo(expectedDirection.getComponent(axis), 9);
      }
    }
  });

  it('converts model-frame travel through a rotated parent instead of moving on the parent x axis', async () => {
    const gltf = await load();
    const index = gltf.parser.json.nodes.findIndex(
      (node: { name?: string }) => node.name === ar.gun!.action!.parts.carrier!.node,
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
    const paths = actionPartPaths(gltf.scene, ar.gun?.action, gltf.parser);
    const clone = cloneHeldModel(prepareModel(ar, gltf.scene).held, paths);
    clone.root.updateMatrixWorld(true);
    const moving = clone.parts.find((part) => part.nodeIndex === index)!;
    const before = moving.node.getWorldPosition(new Vector3());
    const modelScene = clone.root.children[0]!.children[0]!.children[0]!;
    const definition = ar.gun!.action!.parts.carrier!;
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
