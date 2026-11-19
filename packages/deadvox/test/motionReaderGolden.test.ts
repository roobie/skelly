// The shared motion reader must pose every part where the reader it replaced did. The fixture was recorded from the
// previous reader (per-part axis, stroke and turn, and a rearward/dwell/forward cycle) over every gun with an action
// and every vehicle with a moving fitting, so a drift in either shows as a pose or a time that moved.
import { buildRegistry, loadVehicleBlueprint, ModelSchema } from '@skelly/engine/content';
import { actionStrokeTimes, type FirearmMode } from '@skelly/engine/internal/core/firearmAction.ts';
import { actionCycleSeconds, actionOpenSeconds, actionPhaseSeconds, ejectSeconds } from '@skelly/engine/inventory';
import { applyRigid, poseAt, posePoint, type Vec3 } from '@skelly/motion/motion';
import {
  actionPartPaths,
  cloneHeldModel,
  type HeldActionPart,
  partPointAt,
  poseActionParts,
  posePartShares,
  rackGrip,
  sampleActionPose,
  slideTravel,
} from '@skelly/presentation/internal/render/firearmModel.ts';
import { prepareModel } from '@skelly/presentation/internal/render/models.ts';
import { Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { parse } from 'valibot';
import { describe, expect, it } from 'vitest';
import pistolContent from '../../mods/skelly.firearms/items-pistol.json' with { type: 'json' };
import firearmContent from '../../mods/skelly.firearms/models-firearms.json' with { type: 'json' };
import { baseSources } from '../src/product/content.ts';
import golden from './fixtures/motionReaderGolden.json' with { type: 'json' };
import { modFileBytes } from './modFile.ts';

const METRES = 1e-6;
const SECONDS = 1e-9;
const SAMPLES = 20;

type Matrices = Record<string, number[]>;
interface GunGolden {
  timings: Record<string, number>;
  poses: Record<
    string,
    {
      elapsed: number;
      stroke: number;
      rack?: { reach: number };
      parts: Matrices;
      handGrips: Record<string, number[]>;
    }[]
  >;
  open: Matrices;
  shares: { share: number; parts: Matrices }[];
  grips: Record<string, { travel: number[]; handGrip?: number[]; hinged: boolean }>;
}

/** The largest difference between two lists of numbers, or infinity when they are not the same length. */
const deviation = (actual: readonly number[], expected: readonly number[]): number =>
  actual.length === expected.length
    ? Math.max(0, ...actual.map((value, i) => Math.abs(value - expected[i]!)))
    : Number.POSITIVE_INFINITY;

const load = (file: string) => {
  const bytes = modFileBytes(file);
  return new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
};

describe.each(Object.entries(golden.guns as Record<string, GunGolden>))(
  '%s matches the previous reader',
  (id, recorded) => {
    const model = parse(
      ModelSchema,
      [...firearmContent.models, ...pistolContent.models].find((candidate) => candidate.id === id),
    );
    const action = model.gun!.action!;
    const held = async () => {
      const gltf = await load(model.file);
      return cloneHeldModel(prepareModel(model, gltf.scene).held, actionPartPaths(gltf.scene, action, gltf.parser));
    };
    const matrices = (parts: readonly HeldActionPart[]): Matrices =>
      Object.fromEntries(
        parts.map((part) => {
          part.node.updateMatrix();
          return [part.id, [...part.node.matrix.elements]];
        }),
      );
    /** How far the posed parts are from the recorded matrices: the part ids must be the same. */
    const partsDeviation = (parts: readonly HeldActionPart[], expected: Matrices): number => {
      const posed = matrices(parts);
      return Object.keys(posed).toSorted().join() === Object.keys(expected).toSorted().join()
        ? Math.max(0, ...Object.entries(posed).map(([part, elements]) => deviation(elements, expected[part]!)))
        : Number.POSITIVE_INFINITY;
    };

    /** The grip points of the parts that carry one, as the posed parts place them in the model's frame. */
    const handGrips = (parts: readonly HeldActionPart[]): Record<string, number[]> =>
      Object.fromEntries(
        parts
          .filter((part) => part.handGrip)
          .map((part) => [part.id, new Vector3(...part.handGrip!).applyMatrix4(part.node.matrix).toArray()]),
      );

    it('times its cycles, ejection and phases as before', () => {
      const modes = (['hand', 'fire'] as FirearmMode[]).filter(
        (mode) => mode === 'hand' || action.roundsPerSimMinute !== undefined,
      );
      const timings: Record<string, number> = {
        open: actionOpenSeconds(action),
        forwardSound: actionStrokeTimes(action).release,
      };
      for (const mode of modes) {
        timings[`cycle.${mode}`] = actionCycleSeconds(action, mode);
        timings[`eject.${mode}`] = ejectSeconds(action, mode);
        timings[`phase.${mode}`] = actionPhaseSeconds(action, mode);
      }
      timings['phase.hand.open'] = actionPhaseSeconds(action, 'hand', 'open');
      timings['phase.hand.close'] = actionPhaseSeconds(action, 'hand', 'close');
      expect(Object.keys(timings).toSorted()).toEqual(Object.keys(recorded.timings).toSorted());
      for (const [name, seconds] of Object.entries(recorded.timings)) {
        expect(Math.abs(timings[name]! - seconds), name).toBeLessThanOrEqual(SECONDS);
      }
    });

    it('poses every part along its cycles as before', async () => {
      const { parts } = await held();
      for (const [key, samples] of Object.entries(recorded.poses)) {
        const [mode, scale] = key.split('x') as [FirearmMode, string];
        const duration = actionCycleSeconds(action, mode) * Number(scale);
        expect(samples).toHaveLength(SAMPLES);
        samples.forEach((sample, i) => {
          const elapsed = (duration * i) / (SAMPLES - 1);
          expect(Math.abs(elapsed - sample.elapsed)).toBeLessThanOrEqual(SECONDS);
          poseActionParts(parts, sampleActionPose(action, { mode, elapsed, duration, actionOpen: false }));
          expect(partsDeviation(parts, sample.parts), `${key}@${i}`).toBeLessThanOrEqual(METRES);
          const grips = handGrips(parts);
          expect(Object.keys(grips).toSorted(), `${key}@${i} grips`).toEqual(Object.keys(sample.handGrips).toSorted());
          for (const [part, grip] of Object.entries(grips)) {
            expect(deviation(grip, sample.handGrips[part]!), `${key}@${i} ${part} grip`).toBeLessThanOrEqual(METRES);
          }
          if (sample.rack) {
            expect(rackGrip(action, elapsed, duration).reach, `${key}@${i} reach`).toBeCloseTo(sample.rack.reach, 9);
          }
        });
      }
    });

    it('holds its parts where the open action stood', async () => {
      const { parts } = await held();
      poseActionParts(parts, sampleActionPose(action, { mode: 'hand', elapsed: 0, duration: 1, actionOpen: true }));
      expect(partsDeviation(parts, recorded.open)).toBeLessThanOrEqual(METRES);
    });

    it('moves a part that only slides by its share of the way as before', async () => {
      const { parts } = await held();
      for (const { share, parts: expected } of recorded.shares) {
        posePartShares(parts, Object.fromEntries(parts.map(({ id: part }) => [part, share])));
        // A hinged part's share was once a share of its slide alone; its motion now turns before it slides.
        const slides = parts.filter((part) => !recorded.grips[part.id]!.hinged);
        for (const part of slides) {
          expect(
            deviation(matrices([part])[part.id]!, expected[part.id]!),
            `share ${share} ${part.id}`,
          ).toBeLessThanOrEqual(METRES);
        }
      }
    });

    it('poses a part at a share of its motion as the motion at that clock, hinged or not', async () => {
      const { parts } = await held();
      const probes: Vec3[] = [
        [0, 0, 0],
        [0.1, 0.2, 0.3],
      ];
      for (const { share } of recorded.shares) {
        posePartShares(parts, Object.fromEntries(parts.map(({ id: part }) => [part, share])));
        for (const part of parts) {
          const toParent = (point: Vec3) => new Vector3(...point).applyMatrix4(part.parentFromModel);
          const posedFromRest = part.node.matrix.clone().multiply(part.restMatrix.clone().invert());
          for (const probe of probes) {
            // A rest point of the part, moved by the node's posed matrix, lies where the motion carries the point.
            const moved = toParent(probe).applyMatrix4(posedFromRest);
            const expected = toParent(applyRigid(poseAt(part.motion!, share), probe));
            expect(moved.distanceTo(expected), `share ${share} ${part.id}`).toBeLessThanOrEqual(METRES);
          }
        }
      }
    });

    it('keeps each hand grip and travel where they were', async () => {
      const { parts } = await held();
      for (const part of parts) {
        const { travel, handGrip } = recorded.grips[part.id]!;
        const slide = new Vector3(...slideTravel(part.motion!)).applyMatrix4(part.parentFromModel);
        const carried = slide.sub(new Vector3().applyMatrix4(part.parentFromModel));
        expect(deviation(carried.toArray(), travel), `${part.id} travel`).toBeLessThanOrEqual(METRES);
        expect(part.handGrip !== undefined, part.id).toBe(handGrip !== undefined);
        if (handGrip) {
          const grip: Vector3 = partPointAt(part, part.handGrip!, 0);
          expect(deviation(grip.toArray(), handGrip), `${part.id} grip`).toBeLessThanOrEqual(METRES);
        }
      }
    });
  },
);

describe('vehicle fittings match the previous reader', () => {
  const { registry, issues } = buildRegistry(baseSources);

  it('poses every recorded fitting along its clock as before', () => {
    expect(issues).toEqual([]);
    const vehicles = golden.vehicles as unknown as Record<
      string,
      Record<string, { points: Vec3[]; samples: { clock: number; points: number[][] }[] }>
    >;
    expect(Object.keys(vehicles).length).toBeGreaterThan(0);
    for (const [vehicle, fittings] of Object.entries(vehicles)) {
      const placed = loadVehicleBlueprint(registry, vehicle).fittings;
      for (const [fitting, { points, samples }] of Object.entries(fittings)) {
        const motion = placed.find(({ id }) => id === fitting)?.motion;
        expect(motion, `${vehicle} ${fitting} moves`).toBeDefined();
        for (const { clock, points: expected } of samples) {
          points.forEach((point, i) => {
            expect(
              deviation(posePoint(motion!, point, clock), expected[i]!),
              `${vehicle} ${fitting} ${i}@${clock}`,
            ).toBeLessThanOrEqual(METRES);
          });
        }
      }
    }
  });
});
