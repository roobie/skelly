import graphics from '../src/content/base/graphics.json' with { type: 'json' };
import { zombieFigure } from '../src/core/zombieFigure.ts';
import { initializeRagdollPhysics, RagdollWorld, ragdollContent } from '../src/render/ragdoll.ts';

interface Sample {
  seed: number;
  maxCorpses: number;
  awakeStepsMeasured: number;
  msPerAwakeStep: number;
  stepsToSleep: (number | null)[];
  stepsToFreeze: number[];
  digest: string;
}
export async function measureRagdolls() {
  const start = performance.now();
  await initializeRagdollPhysics();
  const initMs = performance.now() - start;
  const { maxCorpses } = graphics.graphics[0]!.mobActors;
  const seeds = [17, 31, 89];
  const samples: Sample[] = [];
  for (const seed of seeds) {
    const figure = zombieFigure({ model: 'shambler' }, seed).realized;
    const world = new RagdollWorld();
    try {
      const corpses = Array.from({ length: maxCorpses }, (_, index) =>
        world.spawn({
          realized: figure,
          pose: { root: [0, 0, 0], rotations: {} },
          position: [index * ragdollContent.footprintMetres[0]! * 2, 0, 0],
          yaw: 0,
          direction: -1,
          seed,
          ground: { blockSize: 1, isSolid: (_x, y, _z) => y < 0 },
        }),
      );
      // biome-ignore lint/performance/noAwaitInLoops: each timing sample must run alone.
      await world.ready;
      const timings: number[] = [];
      for (let step = 0; step < ragdollContent.stepBudget; step++) {
        const awake = corpses.every(
          (corpse) => !corpse.settled && corpse.parts.every((part) => !part.body.isSleeping()),
        );
        const before = performance.now();
        world.advance(ragdollContent.timestep);
        if (awake) {
          timings.push(performance.now() - before);
        }
      }
      const transforms = corpses.flatMap((corpse) =>
        corpse.parts.flatMap((part) => {
          const t = part.body.translation();
          const r = part.body.rotation();
          return [t.x, t.y, t.z, r.x, r.y, r.z, r.w];
        }),
      );
      const bytes = new DataView(new ArrayBuffer(transforms.length * 4));
      transforms.forEach((value, index) => {
        bytes.setFloat32(index * 4, value, true);
      });
      const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes.buffer)), (value) =>
        value.toString(16).padStart(2, '0'),
      ).join('');
      samples.push({
        seed,
        maxCorpses,
        awakeStepsMeasured: timings.length,
        msPerAwakeStep: timings.reduce((sum, value) => sum + value, 0) / timings.length,
        stepsToSleep: corpses.map((corpse) => corpse.sleepSteps ?? null),
        stepsToFreeze: corpses.map((corpse) => corpse.steps),
        digest,
      });
    } finally {
      world.dispose();
    }
  }
  return { initMs, timestep: ragdollContent.timestep, samples };
}
