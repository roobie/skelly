import { type ModelDef, ModelSchema } from '@skelly/engine/content';
import { actionStrokeTimes } from '@skelly/engine/internal/core/firearmAction.ts';
import { heldEjectionPose } from '@skelly/engine/internal/core/heldPose.ts';
import { simPerMinute, simSeconds } from '@skelly/engine/internal/core/time.ts';
import { heldGripOffset } from '@skelly/engine/pose';
import { posePoint } from '@skelly/motion/motion';
import {
  type ActionPose,
  actionPartPaths,
  cloneHeldModel,
  type FirearmAction,
  type HeldActionPart,
  magazineMotion,
  partMatrixAt,
  poseActionParts,
  sampleActionPose,
  sampleActionStroke,
} from '@skelly/presentation/internal/render/firearmModel.ts';
import { prepareModel } from '@skelly/presentation/internal/render/models.ts';
import { Box3, Group, type Matrix4, type Object3D, Raycaster, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { parse } from 'valibot';
import { describe, expect, it } from 'vitest';
import firearmContent from '../../mods/skelly.firearms/models-firearms.json' with { type: 'json' };
import { baseRegistry } from './baseRegistry.ts';
import { modFileBytes } from './modFile.ts';

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
  const bytes = modFileBytes(model.file);
  return new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
};

/** Every part of `mode` at the same clock of its own motion. */
const atClock = (mode: 'fire' | 'hand', clock: number): ActionPose => ({
  mode,
  stroke: clock,
  clockOf: ({ motion, modes }) => (motion && modes.includes(mode) ? clock : 0),
});

const sameMatrix = (a: Matrix4, b: Matrix4): boolean =>
  a.elements.every((value, i) => Math.abs(value - b.elements[i]!) < 1e-9);

const atRest = (part: HeldActionPart): boolean => {
  part.node.updateMatrix();
  return sameMatrix(part.node.matrix, part.restMatrix);
};

describe('exported firearm presentation', () => {
  it.each(['pump_shotgun', 'rifle_hunting'])(
    'wraps the %s sporting-stock palm around the lower wrist instead of lifting it onto the top',
    async (type) => {
      const registry = baseRegistry();
      const model = registry.models.get(registry.items.get(type)!.model!)!;
      const gltf = await load(model);
      gltf.scene.updateMatrixWorld(true);
      let stock: Object3D | undefined;
      gltf.scene.traverse((node) => {
        if (node.userData.family === 'stock') {
          stock = node;
        }
      });
      expect(stock, type).toBeDefined();
      const bounds = new Box3().setFromObject(stock!);
      const [x, , z] = model.grip!.at;
      const height = bounds.max.y - bounds.min.y;
      const topHits = new Raycaster(new Vector3(x, bounds.max.y + height, z), new Vector3(0, -1, 0)).intersectObject(
        stock!,
        true,
      );
      const bottomHits = new Raycaster(new Vector3(x, bounds.min.y - height, z), new Vector3(0, 1, 0)).intersectObject(
        stock!,
        true,
      );
      expect(topHits.length, type).toBeGreaterThan(0);
      expect(bottomHits.length, type).toBeGreaterThan(0);
      const top = topHits[0]!.point.y;
      const bottom = bottomHits[0]!.point.y;
      const palm = model.hands!.firing.at;
      expect(palm[2], type).toBeCloseTo(z);
      expect(palm[1], type).toBeGreaterThanOrEqual(bottom);
      expect(palm[1], type).toBeLessThanOrEqual(bottom + (top - bottom) / 3);
    },
  );

  it('moves the exported bolt knob through its stops and resets from rest', async () => {
    const bolt = parse(
      ModelSchema,
      firearmContent.models.find(
        (candidate) =>
          'gun' in candidate &&
          'action' in candidate.gun &&
          Object.values(candidate.gun.action.parts).some((part) =>
            part.motion.stages.some(({ kind }: { kind: string }) => kind === 'hinge'),
          ),
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
    const { motion } = action.parts.knob!;
    const unlocked = motion.stops.find((stop) => stop.name === 'unlocked')!;
    expect(unlocked.clock).toBeGreaterThan(0);
    expect(unlocked.clock).toBeLessThan(1);
    const { reach, release } = actionStrokeTimes(action, 'hand');
    for (const [time, clock] of [
      [reach, unlocked.clock],
      [release, 1],
    ] as const) {
      poseActionParts(clone.parts, sampleActionPose(action, { mode: 'hand', elapsed: time }));
      clone.root.updateMatrixWorld(true);
      const actual = scene.worldToLocal(knob.node.getWorldPosition(new Vector3()));
      const expected = new Vector3(...posePoint(motion, [rest.x, rest.y, rest.z], clock));
      expect(expected.distanceTo(rest)).toBeGreaterThan(0);
      expect(actual.distanceTo(expected)).toBeCloseTo(0, 8);
    }
    poseActionParts(clone.parts, sampleActionPose(action, undefined));
    expect(atRest(knob)).toBe(true);
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
      poseActionParts(clone.parts, atClock(mode, 1));
      for (const part of clone.parts) {
        const moves = part.modes.includes(mode);
        expect(atRest(part), `${part.id} in ${mode}`).toBe(!moves);
        expect(sameMatrix(part.node.matrix, partMatrixAt(part, moves ? 1 : 0))).toBe(true);
      }
    }
  });

  it('caps fire at the rpm period while retaining draw, hold and return proportions', () => {
    const cycle = {
      durationSimSeconds: simSeconds(0.4),
      legs: [
        { to: 'open', seconds: simSeconds(0.1) },
        { to: 'open', seconds: simSeconds(0.1) },
        { to: 'rest', seconds: simSeconds(0.2) },
      ],
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
    const { reach, draw } = actionStrokeTimes(handOnly, 'hand');
    expect(sampleActionStroke(handOnly, 'fire', reach + draw / 2)).toBe(0);
    expect(sampleActionStroke(handOnly, 'hand', reach + draw / 2)).toBeCloseTo(0.5);
    expect(sampleActionStroke(handOnly, 'hand', reach + draw)).toBe(1);
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
    poseActionParts(first.parts, atClock('hand', 1));
    expect(first.parts.every((part) => !atRest(part))).toBe(true);
    expect(other.parts.every(atRest)).toBe(true);
    expect(prepared.groundParts.every(({ matrix }, index) => matrix.equals(groundBefore[index]!))).toBe(true);
    poseActionParts(first.parts, sampleActionPose(ar.gun!.action!, undefined));
    expect(first.parts.every(atRest)).toBe(true);
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
    const { motion } = ar.gun!.action!.parts.carrier!;
    const modelOrigin = new Vector3().applyMatrix4(modelScene.matrixWorld);
    const expected = new Vector3(...posePoint(motion, [0, 0, 0], 1))
      .applyMatrix4(modelScene.matrixWorld)
      .sub(modelOrigin);
    poseActionParts(clone.parts, atClock('fire', 1));
    clone.root.updateMatrixWorld(true);
    const delta = moving.node.getWorldPosition(new Vector3()).sub(before);
    expect(delta.distanceTo(expected)).toBeCloseTo(0, 8);
  });
});
