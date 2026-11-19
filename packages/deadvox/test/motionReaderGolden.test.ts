// The shared motion reader must pose every part where the reader it replaced did. The fixture was recorded from the
// previous reader (per-part axis, stroke and turn, and a rearward/dwell/forward cycle) over every gun with an action
// and every vehicle with a moving fitting, so a drift in either shows as a pose or a time that moved.
import { buildRegistry, loadVehicleBlueprint, ModelSchema } from '@skelly/engine/content';
import { actionStrokeTimes, type FirearmMode } from '@skelly/engine/internal/core/firearmAction.ts';
import { actionCycleSeconds, actionOpenSeconds, actionPhaseSeconds, ejectSeconds } from '@skelly/engine/inventory';
import { posePoint } from '@skelly/motion/motion';
import {
  actionPartPaths,
  cloneHeldModel,
  type HeldActionPart,
  partPointAt,
  poseActionParts,
  posePartShares,
  rackGrip,
  sampleActionPose,
} from '@skelly/presentation/internal/render/firearmModel.ts';
import { prepareModel } from '@skelly/presentation/internal/render/models.ts';
import type { Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { parse } from 'valibot';
import { describe, expect, it } from 'vitest';
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
  poses: Record<string, { elapsed: number; stroke: number; rack?: { reach: number }; parts: Matrices }[]>;
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
      firearmContent.models.find((candidate) => candidate.id === id),
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
      // The forward sound once sounded after the draw and hold alone, without the unlock before them: it now sounds
      // where the part is released, which is the open time.
      const expected = { ...recorded.timings, forwardSound: recorded.timings.open! };
      for (const [name, seconds] of Object.entries(expected)) {
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

    it('moves a part on its own motion by its share of the way', async () => {
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

    it('keeps each hand grip and travel where they were', async () => {
      const { parts } = await held();
      for (const part of parts) {
        const { travel, handGrip, hinged } = recorded.grips[part.id]!;
        if (!hinged) {
          const [from, to] = [0, 1].map((clock) => partPointAt(part, [0, 0, 0], clock));
          expect(deviation(to!.sub(from!).toArray(), travel), `${part.id} travel`).toBeLessThanOrEqual(METRES);
        }
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

  it('poses every fitting both readers have along its clock as before', () => {
    expect(issues).toEqual([]);
    let compared = 0;
    for (const [vehicle, fittings] of Object.entries(
      golden.vehicles as Record<string, Record<string, { clock: number; points: number[][] }[]>>,
    )) {
      const placed = loadVehicleBlueprint(registry, vehicle).fittings;
      for (const [fitting, samples] of Object.entries(fittings)) {
        const current = placed.find(({ id }) => id === fitting);
        if (!current?.motion) {
          continue;
        }
        const box = current.collision[0]!;
        const points = [current.centreOfMass, box.min, box.max];
        for (const { clock, points: expected } of samples) {
          points.forEach((point, i) => {
            expect(
              deviation(posePoint(current.motion!, point, clock), expected[i]!),
              `${vehicle} ${fitting} ${i}@${clock}`,
            ).toBeLessThanOrEqual(METRES);
          });
        }
        compared += 1;
      }
    }
    expect(compared).toBeGreaterThan(0);
  });
});
