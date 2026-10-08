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

  it('keeps the buffer tube hollow and enclosed by the stock front face across its length options', () => {
    const pullLengths = new Map<string, number>();
    for (const length of ['M', 'L'] as const) {
      const stock = FAMILIES.stock!.build({ length, style: 'm4' });
      const tubeWalls = stock.solids.filter(({ id }) => id.startsWith('buffer-tube-wall-'));
      const bodySolids = stock.solids.filter(({ id }) => id.startsWith('m4-stock-body-'));
      const latch = stock.solids.find(({ id }) => id === 'latch-rib');
      const buttplate = stock.solids.find(({ id }) => id === 'buttplate');
      expect(tubeWalls.length).toBeGreaterThan(0);
      expect(bodySolids.length).toBeGreaterThan(0);
      expect(tubeWalls.every((wall) => wall.kind === 'extruded-polygon')).toBe(true);
      expect(bodySolids.every((solid) => solid.kind === 'extruded-polygon' && solid.display?.bevel === false)).toBe(
        true,
      );
      expect(latch).toBeDefined();
      expect(buttplate).toBeDefined();
      if (tubeWalls.some((wall) => wall.kind !== 'extruded-polygon')) {
        throw new Error('M4 buffer-tube walls must be extruded polygons.');
      }
      const tubePoints = tubeWalls.flatMap(vertices);
      const tubeBounds = {
        y: [Math.min(...tubePoints.map(([, y]) => y)), Math.max(...tubePoints.map(([, y]) => y))],
        z: [Math.min(...tubePoints.map(([, , z]) => z)), Math.max(...tubePoints.map(([, , z]) => z))],
      };
      expect(tubeBounds.y[0]! + tubeBounds.y[1]!).toBeCloseTo(0);
      expect(tubeBounds.z[0]! + tubeBounds.z[1]!).toBeCloseTo(0);
      expect(M4_STOCK_GEOMETRY.bufferTubeBoreAcrossFlats).toBeLessThan(M4_STOCK_GEOMETRY.bufferTubeAcrossFlats);
      const bodyVertices = bodySolids.flatMap(vertices);
      const frontX = Math.max(...bodyVertices.map(([x]) => x));
      const frontFace = bodyVertices.filter(([x]) => Math.abs(x - frontX) < 1e-8);
      const frontBounds = {
        y: [Math.min(...frontFace.map(([, y]) => y)), Math.max(...frontFace.map(([, y]) => y))],
        z: [Math.min(...frontFace.map(([, , z]) => z)), Math.max(...frontFace.map(([, , z]) => z))],
      };
      expect(frontBounds.y[0]!).toBeLessThan(tubeBounds.y[0]!);
      expect(frontBounds.y[1]!).toBeGreaterThan(tubeBounds.y[1]!);
      expect(frontBounds.z[0]!).toBeLessThan(tubeBounds.z[0]!);
      expect(frontBounds.z[1]!).toBeGreaterThan(tubeBounds.z[1]!);
      const allStockVertices = stock.solids.flatMap(vertices);
      const pullEnvelope = [
        Math.min(...allStockVertices.map(([x]) => x)),
        Math.max(...allStockVertices.map(([x]) => x)),
      ];
      expect(pullEnvelope[1]!).toBeGreaterThan(pullEnvelope[0]!);
      pullLengths.set(length, pullEnvelope[1]! - pullEnvelope[0]!);
    }
    expect(pullLengths.get('L')).toBeGreaterThan(pullLengths.get('M')!);
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
      expect(tubeWalls.length, `${label}: hollow buffer tube`).toBeGreaterThan(0);
      if (tubeWalls.some((wall) => wall.kind !== 'extruded-polygon')) {
        throw new Error('M4 buffer-tube walls must be extruded polygons.');
      }
      const matingFace = tubeWalls.flatMap(vertices).filter(([x]) => x === 0);
      expect(matingFace.length, `${label}: tube is seated at the adapter face`).toBeGreaterThan(0);
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
