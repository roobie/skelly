// biome-ignore-all lint/correctness/noUndeclaredDependencies: @mobgen is a workspace source alias.
import { crawlerPose } from '@mobgen/mob/crawler.ts';
import { severedBoneSet } from '@mobgen/mob/dismember.ts';
import graphics from '../src/content/base/graphics.json' with { type: 'json' };
import inventory from '../src/content/base/inventory.json' with { type: 'json' };
import player from '../src/content/base/player.json' with { type: 'json' };
import { zombieFigure } from '../src/core/zombieFigure.ts';
import { initializeRagdollPhysics, RagdollWorld, ragdollContent } from '../src/render/ragdoll.ts';

interface Sample {
  seed: number;
  model: string;
  constrained: boolean;
  restDriftMetres: number[];
  residualSpeed: number[];
  residualSpin: number[];
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
  const seed = 17;
  const samples: Sample[] = [];
  for (const model of ragdollContent.sweep.models) {
    for (const constrained of [false, true]) {
      const figure = zombieFigure({ model }, seed).realized;
      const world = new RagdollWorld(player.player[0]!.gravityMetresPerSimSecondSquared);
      try {
        const corpses = Array.from({ length: maxCorpses }, (_, index) =>
          world.spawn({
            realized: figure,
            model,
            pose: model === 'crawler' ? crawlerPose(figure) : { root: [0, 0, 0], rotations: {} },
            excluded: new Set(
              [
                ...severedBoneSet(
                  figure.body.bones,
                  ragdollContent.sweep.cuts[index % ragdollContent.sweep.cuts.length]!,
                ),
              ].map((id) => figure.body.bones.findIndex((bone) => bone.id === id)),
            ),
            position: [index * ragdollContent.footprintMetres[0]! * 2, 0, 0],
            yaw: 0,
            direction: -1,
            seed,
            ...(constrained
              ? { reach: Math.min(inventory.inventory[0]!.reachMetres, ragdollContent.downedDriftMetres) }
              : {}),
            ground: { blockSize: 1, isSolid: (_x, y, _z) => y < 0 },
          }),
        );
        // biome-ignore lint/performance/noAwaitInLoops: each timing sample must run alone.
        await world.ready;
        const timings: number[] = [];
        let residualSpeed: number[] = [];
        let residualSpin: number[] = [];
        for (let step = 0; step < ragdollContent.stepBudget; step++) {
          const awake = corpses.every(
            (corpse) => !corpse.settled && corpse.parts.every((part) => !part.body.isSleeping()),
          );
          if (step === ragdollContent.stepBudget - 1) {
            residualSpeed = corpses.map((corpse) =>
              Math.max(...corpse.parts.map(({ body }) => Math.hypot(...Object.values(body.linvel())))),
            );
            residualSpin = corpses.map((corpse) =>
              Math.max(...corpse.parts.map(({ body }) => Math.hypot(...Object.values(body.angvel())))),
            );
          }
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
          model,
          constrained,
          restDriftMetres: corpses.map((corpse, index) => {
            const t = corpse.parts[0]!.body.translation();
            return Math.hypot(t.x - index * ragdollContent.footprintMetres[0]! * 2, t.z);
          }),
          residualSpeed,
          residualSpin,
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
  }
  return { initMs, timestep: ragdollContent.timestep, samples };
}
