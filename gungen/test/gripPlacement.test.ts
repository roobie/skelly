import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { generate } from '../src/core/generate.ts';
import { applyPoint, type Transform, type Vec3 } from '../src/core/math.ts';
import { resolve } from '../src/core/resolve.ts';
import type { Assembly, Solid } from '../src/core/schema.ts';
import { gunDomain } from '../src/gun/domain.ts';
import { TEMPLATES } from '../src/gun/templates.ts';
import { loadFixtures } from './helpers.ts';

const ROOT = join(import.meta.dirname, '..');
const designFiles = readdirSync(join(ROOT, 'designs'))
  .filter((file) => file.endsWith('.json'))
  .sort();

const solidVertices = (solid: Solid): Vec3[] => {
  if (solid.kind === 'box') {
    const { center, half } = solid.box;
    return [-1, 1].flatMap((x) =>
      [-1, 1].flatMap((y) =>
        [-1, 1].map((z) => [center[0] + x * half[0], center[1] + y * half[1], center[2] + z * half[2]] as const),
      ),
    );
  }
  return solid.profile.flatMap(([x, y]) => solid.z.map((z) => [x, y, z] as const));
};

const boundsX = (solids: readonly Solid[], transform: Transform): readonly [number, number] => {
  const xs = solids.flatMap((solid) => solidVertices(solid).map((point) => applyPoint(transform, point)[0]));
  return [Math.min(...xs), Math.max(...xs)];
};

const separateGrip = (assembly: Assembly): { lower: string; grip: string } | undefined => {
  for (const connection of assembly.connections) {
    const refs = [connection.from, connection.to];
    const lowerGrip = refs.find((ref) => ref.endsWith('.grip'));
    const gripTop = refs.find((ref) => ref.endsWith('.top'));
    if (!(lowerGrip && gripTop)) {
      continue;
    }
    const lower = lowerGrip.slice(0, lowerGrip.lastIndexOf('.'));
    const grip = gripTop.slice(0, gripTop.lastIndexOf('.'));
    if (assembly.parts[lower]?.family === 'lower' && assembly.parts[grip]?.family === 'grip') {
      return { lower, grip };
    }
  }
  return undefined;
};

const gripMountFace = (assembly: Assembly, gripId: string): readonly Vec3[] => {
  const resolved = resolve(assembly, gunDomain);
  const def = resolved.defs.get(gripId)!;
  const transform = resolved.placed.get(gripId)!;
  const port = def.ports.find(({ id }) => id === 'top')!;
  const points = def.solids.flatMap((solid) =>
    solid.kind === 'extruded-polygon'
      ? solid.profile
          .filter(([x, y]) => Math.abs((x - port.pos[0]) * port.normal[0] + (y - port.pos[1]) * port.normal[1]) < 1e-8)
          .map(([x, y]) => applyPoint(transform, [x, y, 0]))
      : [],
  );
  if (points.length !== 2) {
    throw new Error(`${assembly.name}: expected two grip mount face vertices, got ${points.length}`);
  }
  return points;
};

const fixtures = loadFixtures().filter((fixture) => fixture.name.startsWith('archetype-'));
const designs = designFiles.map(
  (file) => (JSON.parse(readFileSync(join(ROOT, 'designs', file), 'utf8')) as { assembly: Assembly }).assembly,
);
const generated = TEMPLATES.filter(
  (template) =>
    template.slots.some((slot) => slot.id === 'lower' && slot.family === 'lower') &&
    template.slots.some((slot) => slot.id === 'grip' && slot.family === 'grip'),
).map((template) => {
  for (let seed = 0; seed < 100; seed++) {
    const assembly = generate(template, gunDomain, seed);
    if (separateGrip(assembly)) {
      return { assembly, label: `${template.name} template seed ${seed}` };
    }
  }
  throw new Error(`${template.name} did not generate a separate lower grip in 100 seeds`);
});

const samples = [
  ...fixtures.map((assembly) => ({ assembly, label: assembly.name })),
  ...designs.map((assembly) => ({ assembly, label: `design ${assembly.name}` })),
  ...generated,
].flatMap(({ assembly, label }) => {
  const grip = separateGrip(assembly);
  return grip ? [{ assembly, label, ...grip }] : [];
});

describe('separate grips fit under lower bodies', () => {
  it('keeps every grip mount face within the lower body and not behind its rearmost solid', () => {
    for (const { assembly, label, lower, grip } of samples) {
      const resolved = resolve(assembly, gunDomain);
      const lowerDef = resolved.defs.get(lower)!;
      const lowerTransform = resolved.placed.get(lower)!;
      const body = lowerDef.solids.filter(({ id }) => !id.startsWith('trigger-guard-'));
      const [bodyRearX, bodyFrontX] = boundsX(body, lowerTransform);
      const [lowerRearX] = boundsX(lowerDef.solids, lowerTransform);
      const faceX = gripMountFace(assembly, grip).map(([x]) => x);
      const faceRearX = Math.min(...faceX);
      const faceFrontX = Math.max(...faceX);
      const context = `${label}; layout=${resolved.params.get(lower)?.layout?.value}; grip-face=[${faceRearX.toFixed(6)}, ${faceFrontX.toFixed(6)}]; lower-body=[${bodyRearX.toFixed(6)}, ${bodyFrontX.toFixed(6)}]; lower-rearmost=${lowerRearX.toFixed(6)}`;
      expect(faceRearX, context).toBeGreaterThanOrEqual(bodyRearX);
      expect(faceFrontX, context).toBeLessThanOrEqual(bodyFrontX);
      expect(faceRearX, context).toBeGreaterThanOrEqual(lowerRearX);
    }
  });
});
