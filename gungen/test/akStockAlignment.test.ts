import { describe, expect, it } from 'vitest';
import { boundsOfPoints, obbPolyhedron, worldSolid } from '../src/core/geometry.ts';
import { applyPoint, type Transform, type Vec3 } from '../src/core/math.ts';
import { resolve } from '../src/core/resolve.ts';
import type { PortDef, Solid } from '../src/core/schema.ts';
import { gunDomain } from '../src/gun/domain.ts';
import { loadCorpus } from './helpers.ts';

const akCorpus = loadCorpus().filter(({ assembly }) =>
  Object.values(assembly.parts).some(({ family }) => family === 'ak-receiver'),
);

const facePointsAtX = (solids: readonly Solid[], transform: Transform, x: number): readonly Vec3[] =>
  solids.flatMap((solid) => {
    const shape = worldSolid(transform, solid);
    const vertices = 'vertices' in shape ? shape.vertices : obbPolyhedron(shape).vertices;
    return vertices.filter(([pointX]) => Math.abs(pointX - x) < 1e-8);
  });

describe('AK stock mating alignment', () => {
  it('matches the stock’s front face to the receiver’s rear face, lower included', () => {
    expect(akCorpus.length).toBeGreaterThan(0);
    for (const { label, assembly } of akCorpus) {
      const resolved = resolve(assembly, gunDomain);
      const receiver = resolved.defs.get('receiver')!;
      const stock = resolved.defs.get('stock')!;
      const receiverPort = receiver.ports.find(({ id }) => id === 'stock') as PortDef;
      const stockPort = stock.ports.find(({ id }) => id === 'front') as PortDef;
      const interfacePoint = applyPoint(resolved.placed.get('receiver')!, receiverPort.pos);
      expect(applyPoint(resolved.placed.get('stock')!, stockPort.pos), `${label}: interface`).toEqual(interfacePoint);
      const [faceX] = interfacePoint;
      const rearFace = ['receiver', 'lower'].flatMap((partId) =>
        facePointsAtX(resolved.defs.get(partId)!.solids, resolved.placed.get(partId)!, faceX),
      );
      const stockFace = facePointsAtX(stock.solids, resolved.placed.get('stock')!, faceX);
      expect(rearFace.length, `${label}: receiver rear-face vertices`).toBeGreaterThan(0);
      expect(stockFace.length, `${label}: stock front-face vertices`).toBeGreaterThan(0);
      const [rearMin, rearMax] = boundsOfPoints(rearFace);
      const [stockMin, stockMax] = boundsOfPoints(stockFace);
      for (const [axis, name] of [
        [1, 'height'],
        [2, 'width'],
      ] as const) {
        expect(stockMin[axis], `${label}: ${name} min`).toBeCloseTo(rearMin[axis]!, 9);
        expect(stockMax[axis], `${label}: ${name} max`).toBeCloseTo(rearMax[axis]!, 9);
      }
    }
  });
});
