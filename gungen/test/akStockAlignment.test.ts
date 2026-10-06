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

const worldVertices = (solids: readonly Solid[], transform: Transform): readonly Vec3[] =>
  solids.flatMap((solid) => {
    const shape = worldSolid(transform, solid);
    return 'vertices' in shape ? shape.vertices : obbPolyhedron(shape).vertices;
  });

const facePointsAtX = (solids: readonly Solid[], transform: Transform, x: number): readonly Vec3[] =>
  worldVertices(solids, transform).filter(([pointX]) => Math.abs(pointX - x) < 1e-8);

describe('AK stock mating alignment', () => {
  it('seats the stock’s front on the receiver’s rear face: as tall, centred, and no wider', () => {
    expect(akCorpus.length).toBeGreaterThan(0);
    for (const { label, assembly } of akCorpus) {
      const resolved = resolve(assembly, gunDomain);
      const receiver = resolved.defs.get('receiver')!;
      const stock = resolved.defs.get('stock')!;
      const stockPlaced = resolved.placed.get('stock')!;
      const receiverPort = receiver.ports.find(({ id }) => id === 'stock') as PortDef;
      const stockPort = stock.ports.find(({ id }) => id === 'front') as PortDef;
      const interfacePoint = applyPoint(resolved.placed.get('receiver')!, receiverPort.pos);
      expect(applyPoint(stockPlaced, stockPort.pos), `${label}: interface`).toEqual(interfacePoint);
      const [faceX] = interfacePoint;
      const rearFace = ['receiver', 'lower'].flatMap((partId) =>
        facePointsAtX(resolved.defs.get(partId)!.solids, resolved.placed.get(partId)!, faceX),
      );
      const stockFace = facePointsAtX(stock.solids, stockPlaced, faceX);
      expect(rearFace.length, `${label}: receiver rear-face vertices`).toBeGreaterThan(0);
      expect(stockFace.length, `${label}: stock front-face vertices`).toBeGreaterThan(0);
      const [rearMin, rearMax] = boundsOfPoints(rearFace);
      const [stockMin, stockMax] = boundsOfPoints(stockFace);
      expect(stockMin[1], `${label}: height min`).toBeCloseTo(rearMin[1], 9);
      expect(stockMax[1], `${label}: height max`).toBeCloseTo(rearMax[1], 9);
      expect(stockMin[2] + stockMax[2], `${label}: centred`).toBeCloseTo(rearMin[2] + rearMax[2], 9);
      // BR 22:42 made the stock narrower than the receiver; no part of it may stick out past the receiver's sides.
      const [wholeMin, wholeMax] = boundsOfPoints(worldVertices(stock.solids, stockPlaced));
      expect(wholeMin[2], `${label}: no wider than the receiver`).toBeGreaterThanOrEqual(rearMin[2] - 1e-9);
      expect(wholeMax[2], `${label}: no wider than the receiver`).toBeLessThanOrEqual(rearMax[2] + 1e-9);
    }
  });
});
