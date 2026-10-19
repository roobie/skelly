import { motionTransform } from '@skelly/engine/assembly/motion.ts';
import { resolve } from '@skelly/engine/assembly/resolve.ts';
import type { PartFamily } from '@skelly/engine/assembly/schema.ts';
import { applyDir, applyPoint, IDENTITY, type Vec3 } from '@skelly/engine/foundation/math.ts';
import { localSolidBounds, penetrationWorld, worldSolid } from '@skelly/engine/shapes/geometry.ts';
import type { BoxSolid } from '@skelly/engine/shapes/solid.ts';
import { expect, it } from 'vitest';
import { resolveGunAction } from '../src/gun/actionDescription.ts';
import { sweepBoltAction } from '../src/gun/boltSweep.ts';
import { gunDomain } from '../src/gun/domain.ts';
import { loadFixture } from './helpers.ts';

it.each(['turn', 'draw'] as const)('detects a %s obstruction between clear endpoint poses', (phase) => {
  const assembly = loadFixture('archetype-bolt-rifle');
  const baseline = resolve(assembly, gunDomain);
  const action = resolveGunAction(baseline)!;
  const knob = action.parts.knob!;
  const solid = knob.def.solids[0]!;
  const motion = knob.def.motion!;
  const [min, max] = localSolidBounds(solid);
  const centre = min.map((value, axis) => (value + max[axis]!) / 2) as unknown as Vec3;
  const pose = (progress: number) =>
    motionTransform(knob.placed, motion, phase === 'draw' ? progress : 0, phase === 'turn' ? progress : 1);
  const contactPhase = phase === 'turn' ? 0.2 : 0.25;
  const blocker: BoxSolid = {
    id: 'blocker',
    kind: 'box',
    box: {
      center: applyPoint(pose(contactPhase), centre),
      half: [0.01, 0.01, 0.01],
    },
  };
  const fixed = worldSolid(IDENTITY, blocker);
  expect(penetrationWorld(worldSolid(pose(contactPhase), solid), fixed)).toBeGreaterThan(0);
  for (const endpoint of [0, 1]) {
    expect(penetrationWorld(worldSolid(pose(endpoint), solid), fixed)).toBeLessThan(1e-7);
  }
  const receiver = [...baseline.defs].find(([, def]) => def.family === 'receiver')!;
  const rail = receiver[1].ports.find(({ id }) => id === 'rail')!;
  const placed = baseline.placed.get(receiver[0])!;
  const normal = applyDir(placed, rail.normal).map((value) => -value) as unknown as Vec3;
  const family: PartFamily = {
    name: 'sweep-blocker',
    params: {},
    build: () => ({
      family: 'sweep-blocker',
      solids: [blocker],
      keepOuts: [],
      axes: [],
      ports: [
        {
          id: 'base',
          mount: rail.mount,
          gender: 'male',
          pos: applyPoint(placed, rail.pos),
          normal,
          up: applyDir(placed, rail.up),
        },
      ],
    }),
  };
  const fixture = {
    ...assembly,
    parts: { ...assembly.parts, 'sweep-blocker': { family: 'sweep-blocker' } },
    connections: [...assembly.connections, { from: `${receiver[0]}.rail`, to: 'sweep-blocker.base', slot: 0 }],
  };
  const resolved = resolve(fixture, { ...gunDomain, families: { ...gunDomain.families, 'sweep-blocker': family } });
  expect(sweepBoltAction(resolved).some((issue) => issue.includes('sweep-blocker.blocker'))).toBe(true);
});
