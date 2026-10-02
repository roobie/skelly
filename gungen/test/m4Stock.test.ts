import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { worldSolid } from '../src/core/geometry.ts';
import { applyPoint, cross, IDENTITY, sub } from '../src/core/math.ts';
import { meshForSolid } from '../src/core/mesh.ts';
import { resolve } from '../src/core/resolve.ts';
import type { Assembly, PortDef, Solid } from '../src/core/schema.ts';
import { gunDomain } from '../src/gun/domain.ts';
import { FAMILIES, M4_STOCK_GEOMETRY } from '../src/gun/parts.ts';
import { loadFixture } from './helpers.ts';

const ROOT = join(import.meta.dirname, '..');
const CLIP_BEVEL_ERROR = /set display\.bevel to false/;
const designAssembly = (name: string): Assembly =>
  (JSON.parse(readFileSync(join(ROOT, 'designs', `${name}.json`), 'utf8')) as { assembly: Assembly }).assembly;
const stockSamples = [
  { assembly: loadFixture('archetype-ar'), label: 'AR fixture' },
  { assembly: designAssembly('archetype-ar'), label: 'archetype-ar design' },
  { assembly: loadFixture('archetype-ar-free-float'), label: 'AR free-float fixture' },
  { assembly: designAssembly('archetype-ar-free-float'), label: 'archetype-ar-free-float design' },
];

const vertices = (solid: Solid) => {
  const polyhedron = worldSolid(IDENTITY, solid);
  return 'vertices' in polyhedron ? [...polyhedron.vertices] : [];
};

describe('M4-only AR stock', () => {
  it('requires an explicit bevel opt-out for clipped extrusions', () => {
    const body = FAMILIES.stock!.build({ length: 'M', style: 'm4' }).solids.find(
      ({ id }) => id === 'm4-stock-body-top',
    );
    expect(body?.kind).toBe('extruded-polygon');
    if (body?.kind !== 'extruded-polygon') {
      throw new Error('M4 stock body must be an extruded polygon.');
    }
    expect(body.display?.bevel).toBe(false);
    expect(meshForSolid(body).triangleCount).toBeGreaterThan(0);
    expect(() => meshForSolid({ ...body, display: { bevel: true } })).toThrow(CLIP_BEVEL_ERROR);
  });

  it('pins the unchanged M/L pull envelopes, 4.5u body wedge, tube wrap, latch, and buttplate', () => {
    for (const length of ['M', 'L'] as const) {
      const stock = FAMILIES.stock!.build({ length, style: 'm4' });
      const tubeWalls = stock.solids.filter(({ id }) => id.startsWith('buffer-tube-wall-'));
      const bodySolids = stock.solids.filter(({ id }) => id.startsWith('m4-stock-body-'));
      const latch = stock.solids.find(({ id }) => id === 'latch-rib');
      const buttplate = stock.solids.find(({ id }) => id === 'buttplate');
      const expectedLength = length === 'M' ? 16 : 22;
      expect(tubeWalls).toHaveLength(8);
      expect(tubeWalls.every((wall) => wall.kind === 'extruded-polygon')).toBe(true);
      expect(bodySolids).toHaveLength(4);
      expect(bodySolids.every((solid) => solid.kind === 'extruded-polygon')).toBe(true);
      expect(latch?.kind).toBe('box');
      expect(buttplate?.kind).toBe('extruded-polygon');
      if (
        tubeWalls.some((wall) => wall.kind !== 'extruded-polygon') ||
        bodySolids.some((solid) => solid.kind !== 'extruded-polygon') ||
        buttplate?.kind !== 'extruded-polygon'
      ) {
        throw new Error('M4 stock is missing one of its required extruded parts.');
      }
      const tubeProfiles = tubeWalls.flatMap((wall) => (wall.kind === 'extruded-polygon' ? [wall.profile] : []));
      expect(tubeProfiles.every((profile) => profile.length === 4)).toBe(true);
      expect(tubeProfiles.flat().every(([y, z]) => Math.abs(y) <= 1.25 && Math.abs(z) <= 1.25)).toBe(true);
      expect(M4_STOCK_GEOMETRY.bufferTubeAcrossFlats).toBe(2.5);
      expect(M4_STOCK_GEOMETRY.bufferTubeBoreAcrossFlats).toBe(1.5);
      expect(
        tubeWalls.every((wall) => wall.kind === 'extruded-polygon' && wall.z[0] === -expectedLength && wall.z[1] === 0),
      ).toBe(true);
      expect(tubeProfiles.flat().some(([y, z]) => Math.max(Math.abs(y), Math.abs(z)) === 0.75)).toBe(true);
      expect(bodySolids.every((solid) => solid.kind === 'extruded-polygon' && solid.clip?.length === 3)).toBe(true);
      expect(bodySolids.every((solid) => solid.kind === 'extruded-polygon' && solid.display?.bevel === false)).toBe(
        true,
      );
      expect(
        bodySolids.every(
          (solid) => solid.kind === 'extruded-polygon' && solid.z[0] === -expectedLength && solid.z[1] === -3,
        ),
      ).toBe(true);
      expect(bodySolids.some((solid) => solid.kind === 'extruded-polygon' && solid.profile === buttplate.profile)).toBe(
        false,
      );
      expect(buttplate.profile.map(([y]) => y)).toEqual(expect.arrayContaining([-6.25, 1.75]));
      expect(buttplate.profile.map(([, z]) => z)).toEqual(expect.arrayContaining([-2.25, 2.25]));
      expect(buttplate.z).toEqual([-expectedLength - 1, -expectedLength]);
      const latchSolid = stock.solids.find(({ id }) => id === 'latch-rib');
      expect(latchSolid?.kind).toBe('box');
      if (latchSolid?.kind === 'box') {
        expect(latchSolid.box.center).toEqual([-4.5, -2, 0]);
        expect(latchSolid.box.half).toEqual([1.5, 0.75, 0.25]);
      }
      const boundsAtX = (x: number) => {
        const points = bodySolids.flatMap(vertices).filter(([pointX]) => Math.abs(pointX - x) < 1e-8);
        return {
          y: [Math.min(...points.map(([, y]) => y)), Math.max(...points.map(([, y]) => y))],
          z: [Math.min(...points.map(([, , z]) => z)), Math.max(...points.map(([, , z]) => z))],
        };
      };
      const frontBounds = boundsAtX(-3);
      const rearBounds = boundsAtX(-expectedLength);
      expect(frontBounds).toEqual({ y: [-1.5, 1.5], z: [-1.5, 1.5] });
      expect(rearBounds).toEqual({ y: [-6, 1.5], z: [-2, 2] });
      const tubePoints = tubeProfiles.flat();
      const tubeBounds = {
        y: [Math.min(...tubePoints.map(([y]) => y)), Math.max(...tubePoints.map(([y]) => y))],
        z: [Math.min(...tubePoints.map(([, z]) => z)), Math.max(...tubePoints.map(([, z]) => z))],
      };
      expect(frontBounds.y[0]! < tubeBounds.y[0]! && frontBounds.y[1]! > tubeBounds.y[1]!).toBe(true);
      expect(frontBounds.z[0]! < tubeBounds.z[0]! && frontBounds.z[1]! > tubeBounds.z[1]!).toBe(true);
      expect(tubeBounds.y).toEqual([-1.25, 1.25]);
      expect(tubeBounds.z).toEqual([-1.25, 1.25]);
      const allStockVertices = stock.solids.flatMap(vertices);
      const pullEnvelope = [
        Math.min(...allStockVertices.map(([x]) => x)),
        Math.max(...allStockVertices.map(([x]) => x)),
      ];
      expect(pullEnvelope).toEqual([-expectedLength - 1, 0]);
      expect(pullEnvelope[1]! - pullEnvelope[0]!).toBe(expectedLength + 1);
      expect(1.5 - -1.5).toBe(3);
      expect(1.5 - -6).toBe(7.5);
      expect(7.5 - 3).toBe(M4_STOCK_GEOMETRY.depthDifference);
      expect(stock.solids.flatMap(vertices).map(([x]) => x)).toEqual(expect.arrayContaining([-expectedLength - 1, 0]));
      expect(stock.ports.find(({ id }) => id === 'front')?.pos).toEqual([0, 0, 0]);
    }
  });

  it('mates the M4 buffer tube flush to both published AR receiver adapters', () => {
    for (const { assembly, label } of stockSamples) {
      expect(assembly.parts.stock?.params?.style, `${label}: M4-only stock selection`).toBe('m4');
      const resolved = resolve(assembly, gunDomain);
      const receiver = resolved.defs.get('receiver')!;
      const receiverTransform = resolved.placed.get('receiver')!;
      const stock = resolved.defs.get('stock')!;
      const stockTransform = resolved.placed.get('stock')!;
      const receiverPort = receiver.ports.find(({ id }) => id === 'stock') as PortDef;
      const stockPort = stock.ports.find(({ id }) => id === 'front') as PortDef;
      expect(applyPoint(receiverTransform, receiverPort.pos), `${label}: receiver interface`).toEqual(
        applyPoint(stockTransform, stockPort.pos),
      );
      const tubeWalls = stock.solids.filter(({ id }) => id.startsWith('buffer-tube-wall-'));
      expect(tubeWalls, `${label}: hollow buffer tube`).toHaveLength(8);
      if (tubeWalls.some((wall) => wall.kind !== 'extruded-polygon')) {
        throw new Error('M4 buffer-tube walls must be extruded polygons.');
      }
      const matingFace = tubeWalls.flatMap(vertices).filter(([x]) => x === 0);
      expect(matingFace.length, `${label}: tube is seated at the adapter face`).toBe(32);
      const matingPoints = matingFace.map((point) => applyPoint(stockTransform, point));
      const receiverPoint = applyPoint(receiverTransform, receiverPort.pos);
      expect(matingPoints.every(([x]) => Math.abs(x - receiverPoint[0]) < 1e-8)).toBe(true);
      const matingCenter = [0, 1, 2].map(
        (axis) => matingPoints.reduce((sum, point) => sum + point[axis]!, 0) / matingPoints.length,
      );
      for (const [axis, coordinate] of matingCenter.entries()) {
        expect(coordinate).toBeCloseTo(receiverPoint[axis]!, 8);
      }
      expect(receiverPort.pos[1]).toBe(0);
      const carrierTransform = resolved.placed.get('bolt-carrier')!;
      const carrierMotion = resolved.defs.get('bolt-carrier')!.motion!;
      const carrierAxisPoint = applyPoint(carrierTransform, carrierMotion.start);
      const carrierAxisTip = applyPoint(carrierTransform, [
        carrierMotion.start[0] + carrierMotion.axis[0],
        carrierMotion.start[1] + carrierMotion.axis[1],
        carrierMotion.start[2] + carrierMotion.axis[2],
      ]);
      const carrierAxis = sub(carrierAxisTip, carrierAxisPoint);
      const tubeAxisPoint = applyPoint(stockTransform, [0, 0, 0]);
      const tubeAxisTip = applyPoint(stockTransform, [1, 0, 0]);
      const tubeAxis = sub(tubeAxisTip, tubeAxisPoint);
      const magnitude = (vector: readonly number[]) => Math.hypot(vector[0]!, vector[1]!, vector[2]!);
      expect(magnitude(cross(tubeAxis, carrierAxis)), `${label}: axis direction`).toBeLessThan(1e-6);
      expect(
        magnitude(cross(sub(tubeAxisPoint, carrierAxisPoint), carrierAxis)) / magnitude(carrierAxis),
        `${label}: world-space axis offset`,
      ).toBeLessThan(1e-6);
    }
  });
});
