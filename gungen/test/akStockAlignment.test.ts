import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { generate } from '../src/core/generate.ts';
import { applyPoint, type Transform, type Vec3 } from '../src/core/math.ts';
import { resolve } from '../src/core/resolve.ts';
import type { Assembly, PortDef, Solid } from '../src/core/schema.ts';
import { gunDomain } from '../src/gun/domain.ts';
import { ak } from '../src/gun/templates.ts';
import { loadFixture } from './helpers.ts';

const ROOT = join(import.meta.dirname, '..');
const akDesign = (
  JSON.parse(readFileSync(join(ROOT, 'designs', 'archetype-ak.json'), 'utf8')) as {
    assembly: Assembly;
  }
).assembly;

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

const facePointsAtX = (solids: readonly Solid[], x: number, transform: Transform): readonly Vec3[] =>
  solids.flatMap((solid) =>
    solidVertices(solid)
      .filter(([pointX]) => Math.abs(pointX - x) < 1e-8)
      .map((point) => applyPoint(transform, point)),
  );

const yRange = (points: readonly Vec3[]): readonly [number, number] => {
  const ys = points.map(([, y]) => y);
  return [Math.min(...ys), Math.max(...ys)];
};

const stockM = generate(ak, gunDomain, 2);
const stockL = generate(ak, gunDomain, 0);
const samples: { assembly: Assembly; label: string; stockLength: 'M' | 'L' }[] = [
  { assembly: loadFixture('archetype-ak'), label: 'archetype-ak fixture', stockLength: 'L' },
  { assembly: akDesign, label: 'archetype-ak design', stockLength: 'L' },
  { assembly: stockM, label: 'AK template seed 2 (M stock)', stockLength: 'M' },
  { assembly: stockL, label: 'AK template seed 0 (L stock)', stockLength: 'L' },
];

describe('AK dropped-stock alignment', () => {
  it('aligns the stock mating face to the receiver rear face', () => {
    for (const { assembly, label, stockLength } of samples) {
      const resolved = resolve(assembly, gunDomain);
      const receiver = resolved.defs.get('receiver')!;
      const receiverTransform = resolved.placed.get('receiver')!;
      const stock = resolved.defs.get('stock')!;
      const stockTransform = resolved.placed.get('stock')!;
      const receiverPort = receiver.ports.find(({ id }) => id === 'stock') as PortDef;
      const stockPort = stock.ports.find(({ id }) => id === 'front') as PortDef;
      const receiverFace = facePointsAtX(receiver.solids, receiverPort.pos[0], receiverTransform);
      const stockFace = facePointsAtX(stock.solids, stockPort.pos[0], stockTransform);
      expect(receiverFace.length, `${label}: receiver rear face vertices`).toBeGreaterThan(0);
      expect(stockFace.length, `${label}: stock mating face vertices`).toBeGreaterThan(0);
      const [receiverMinY, receiverMaxY] = yRange(receiverFace);
      const [stockMinY, stockMaxY] = yRange(stockFace);
      const receiverHeight = receiverMaxY - receiverMinY;
      const stockHeight = stockMaxY - stockMinY;
      const centerOffset = (stockMinY + stockMaxY - receiverMinY - receiverMaxY) / 2;
      const topOffset = stockMaxY - receiverMaxY;
      const context = `${label}: receiver Y=[${receiverMinY}, ${receiverMaxY}], stock Y=[${stockMinY}, ${stockMaxY}], center offset=${centerOffset}, top offset=${topOffset}`;

      expect(assembly.parts.stock?.params?.style, `${label}: dropped stock`).toBe('dropped');
      expect(assembly.parts.stock?.params?.length, `${label}: stock length`).toBe(stockLength);
      expect(receiverHeight, `${label}: receiver rear face taller than stock mating face`).toBeGreaterThan(stockHeight);
      expect(Math.abs(topOffset), context).toBeLessThanOrEqual(1e-6);
    }
  });
});
