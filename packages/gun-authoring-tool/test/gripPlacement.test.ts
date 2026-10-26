import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { generate } from '@skelly/engine/assembly/generate.ts';
import { resolve } from '@skelly/engine/assembly/resolve.ts';
import type { Assembly } from '@skelly/engine/assembly/schema.ts';
import { applyPoint, extrusionPoint, type Transform, type Vec3 } from '@skelly/engine/foundation/math.ts';
import type { Solid } from '@skelly/engine/shapes/solid.ts';
import { describe, expect, it } from 'vitest';
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
  if (solid.kind === 'revolved') {
    throw new Error('gun designs have no revolved solids');
  }
  return solid.profile.flatMap((point) => solid.z.map((along) => extrusionPoint(solid.axis, point, along)));
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
  // A grip built of convex pieces shares its mount face's corners between pieces, so count each corner once.
  const corners = def.solids.flatMap((solid) =>
    solid.kind === 'extruded-polygon'
      ? solid.profile.filter(
          ([x, y]) => Math.abs((x - port.pos[0]) * port.normal[0] + (y - port.pos[1]) * port.normal[1]) < 1e-8,
        )
      : [],
  );
  const points = [
    ...new Map(corners.map(([x, y]) => [`${x.toFixed(6)},${y.toFixed(6)}`, [x, y] as const])).values(),
  ].map(([x, y]) => applyPoint(transform, [x, y, 0]));
  if (points.length !== 2) {
    throw new Error(`${assembly.name}: expected two grip mount face vertices, got ${points.length}`);
  }
  return points;
};

const fixtures = loadFixtures().filter((fixture) => fixture.name.startsWith('archetype-'));
const designs = designFiles.map(
  (file) => (JSON.parse(readFileSync(join(ROOT, 'designs', file), 'utf8')) as { assembly: Assembly }).assembly,
);
const templatesWithSeparateGrip = TEMPLATES.filter(
  (template) =>
    template.slots.some((slot) => slot.id === 'lower' && slot.family === 'lower') &&
    template.slots.some((slot) => slot.id === 'grip' && slot.family === 'grip'),
);

const gripFitViolation = (assembly: Assembly, label: string, lower: string, grip: string): string | undefined => {
  const resolved = resolve(assembly, gunDomain);
  const lowerDef = resolved.defs.get(lower)!;
  const lowerTransform = resolved.placed.get(lower)!;
  const body = lowerDef.solids.filter(({ id }) => !id.startsWith('trigger-guard-'));
  const [bodyRearX, bodyFrontX] = boundsX(body, lowerTransform);
  const faceX = gripMountFace(assembly, grip).map(([x]) => x);
  const faceRearX = Math.min(...faceX);
  const faceFrontX = Math.max(...faceX);
  const context = `${label}; layout=${resolved.params.get(lower)?.layout?.value}; grip-face=[${faceRearX.toFixed(6)}, ${faceFrontX.toFixed(6)}]; lower-body=[${bodyRearX.toFixed(6)}, ${bodyFrontX.toFixed(6)}]`;
  return faceRearX >= bodyRearX && faceFrontX <= bodyFrontX ? undefined : context;
};

describe('separate grips fit under lower bodies', () => {
  const authored = [
    ...fixtures.map((assembly) => ({ assembly, label: assembly.name })),
    ...designs.map((assembly) => ({ assembly, label: `design ${assembly.name}` })),
  ].flatMap(({ assembly, label }) => {
    const grip = separateGrip(assembly);
    return grip ? [{ assembly, label, ...grip }] : [];
  });

  it('has authored assemblies with a separate grip to check', () => {
    expect(authored.length).toBeGreaterThan(0);
  });

  it.each(authored.map((sample) => [sample.label, sample] as const))(
    '%s: keeps the grip mount face within the lower body and not behind its rearmost solid',
    (_label, { assembly, label, lower, grip }) => {
      expect(gripFitViolation(assembly, label, lower, grip)).toBeUndefined();
    },
  );

  it.each(templatesWithSeparateGrip.map((template) => [template.name, template] as const))(
    '%s template: generates a separate grip that fits under its lower body',
    (_name, template) => {
      for (let seed = 0; seed < 100; seed++) {
        const assembly = generate(template, gunDomain, seed);
        const grip = separateGrip(assembly);
        if (grip) {
          expect(
            gripFitViolation(assembly, `${template.name} template seed ${seed}`, grip.lower, grip.grip),
          ).toBeUndefined();
          return;
        }
      }
      expect.fail(`${template.name} did not generate a separate lower grip in 100 seeds`);
    },
  );
});
