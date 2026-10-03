import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { generate } from '../src/core/generate.ts';
import { applyPoint, invert } from '../src/core/math.ts';
import { resolve } from '../src/core/resolve.ts';
import type { Assembly, ExtrudedPolygonSolid } from '../src/core/schema.ts';
import { validate } from '../src/core/validate.ts';
import { GUN_ANCHORS } from '../src/gun/anchorData.ts';
import { GUN_ANCHOR_POLICY, selectGunAnchors } from '../src/gun/anchors.ts';
import { loadGunDesign } from '../src/gun/designLoader.ts';
import { gunDomain } from '../src/gun/domain.ts';
import { pumpShotgun, TEMPLATES } from '../src/gun/templates.ts';

const PUMP_LENGTH = /^(M|L)$/;

const pumpSamples = (): Assembly[] => {
  const loaded = loadGunDesign(
    readFileSync(join(import.meta.dirname, '..', 'designs', 'archetype-pump-shotgun.json'), 'utf8'),
  );
  if (!loaded.ok) {
    throw new Error(loaded.error.message);
  }
  const template = TEMPLATES.find((candidate) => candidate.name === 'pump-shotgun')!;
  return [loaded.design.assembly, ...[100, 200].map((seed) => generate(template, gunDomain, seed))];
};

const section = (solids: readonly ExtrudedPolygonSolid[], x: number): number[] =>
  solids.flatMap((solid) =>
    solid.profile.flatMap((a, i) => {
      const b = solid.profile[(i + 1) % solid.profile.length]!;
      if (x < Math.min(a[0], b[0]) - 1e-8 || x > Math.max(a[0], b[0]) + 1e-8) {
        return [];
      }
      if (Math.abs(a[0] - b[0]) < 1e-8) {
        return Math.abs(x - a[0]) < 1e-8 ? [a[1], b[1]] : [];
      }
      const t = (x - a[0]) / (b[0] - a[0]);
      return [a[1] + t * (b[1] - a[1])];
    }),
  );

const measure = (assembly: Assembly) => {
  const resolved = resolve(assembly, gunDomain);
  const stockId = Object.keys(assembly.parts).find((id) => assembly.parts[id]!.family === 'stock')!;
  const stock = resolved.defs.get(stockId)!;
  const grip = stock.solids.find(
    (solid): solid is ExtrudedPolygonSolid => solid.id === 'grip' && solid.kind === 'extruded-polygon',
  );
  if (!grip) {
    throw new Error(`${assembly.name}: stock has no extruded grip solid`);
  }
  const profiles = stock.solids.filter((solid): solid is ExtrudedPolygonSolid => solid.kind === 'extruded-polygon');
  const gripFrontX = Math.max(...grip.profile.map(([x]) => x));
  const combY = Math.max(...section(profiles, gripFrontX));
  const stockTransform = resolved.placed.get(stockId)!;
  const combWorld = applyPoint(stockTransform, [gripFrontX, combY, 0]);

  const lower = resolved.defs.get('lower')!;
  const trigger = lower.keepOuts.find((keepOut) => keepOut.id === 'trigger-finger')!;
  const lowerTransform = resolved.placed.get('lower')!;
  const triggerCenter = applyPoint(lowerTransform, trigger.box.center);
  const triggerRearX = Math.min(
    ...[0, 1].flatMap((xSide) =>
      [0, 1].flatMap((ySide) =>
        [0, 1].map(
          (zSide) =>
            applyPoint(lowerTransform, [
              trigger.box.center[0] + (xSide ? 1 : -1) * trigger.box.half[0],
              trigger.box.center[1] + (ySide ? 1 : -1) * trigger.box.half[1],
              trigger.box.center[2] + (zSide ? 1 : -1) * trigger.box.half[2],
            ])[0],
        ),
      ),
    ),
  );
  const gripFrontWorld = applyPoint(stockTransform, [gripFrontX, combY, 0]);
  const localTriggerCenter = applyPoint(invert(stockTransform), triggerCenter);
  const params = Object.fromEntries(
    Object.entries(resolved.params.get(stockId)!).map(([name, value]) => [name, value.value]),
  );
  const hold = GUN_ANCHORS.stock!.anchors(params, stock).hold!;
  const holdWorld = applyPoint(stockTransform, hold.position);
  const holdInsideGrip =
    hold.position[2] >= grip.z[0] - 1e-8 &&
    hold.position[2] <= grip.z[1] + 1e-8 &&
    grip.profile.every((a, i) => {
      const b = grip.profile[(i + 1) % grip.profile.length]!;
      return (b[0] - a[0]) * (hold.position[1] - a[1]) - (b[1] - a[1]) * (hold.position[0] - a[0]) >= -1e-8;
    });
  const anchors = selectGunAnchors(resolved, GUN_ANCHORS, GUN_ANCHOR_POLICY);
  return {
    name: assembly.name,
    stockLength: params.length,
    triggerCenterY: triggerCenter[1],
    combAtGripFrontY: combWorld[1],
    triggerBelowComb: combWorld[1] - triggerCenter[1],
    gap: triggerRearX - gripFrontWorld[0],
    gapAfterTwoUnitMove: triggerRearX - 2 - gripFrontWorld[0],
    triggerCenterStockLocalY: localTriggerCenter[1],
    holdY: holdWorld[1],
    reach: Math.hypot(...holdWorld.map((v, i) => v - triggerCenter[i]!)),
    holdInsideGrip,
    anchors,
  };
};

describe('pump stock ergonomics', () => {
  it('offers only M/L tapered stocks on the pump template', () => {
    const stock = pumpShotgun.slots.find((slot) => slot.id === 'stock');
    expect(stock?.params?.length).toEqual(['M', 'L']);
  });

  it('keeps the grip front 5u–7u behind the trigger, including a 2u rearward move', () => {
    for (const assembly of pumpSamples()) {
      const result = measure(assembly);
      expect(result.gap, result.name).toBeGreaterThanOrEqual(5);
      expect(result.gap, result.name).toBeLessThanOrEqual(7);
      expect(result.gapAfterTwoUnitMove, result.name).toBeGreaterThanOrEqual(3);
      expect(result.gapAfterTwoUnitMove, result.name).toBeLessThanOrEqual(7);
    }
  });

  it('keeps the palm inside the grip above the index finger, with 5–7u actual reach for M/L stocks', () => {
    for (const assembly of pumpSamples()) {
      const result = measure(assembly);
      expect(result.stockLength, result.name).toMatch(PUMP_LENGTH);
      expect(result.holdInsideGrip, result.name).toBe(true);
      expect(result.holdY, result.name).toBeGreaterThan(result.triggerCenterY);
      expect(result.reach, result.name).toBeGreaterThanOrEqual(5);
      expect(result.reach, result.name).toBeLessThanOrEqual(7);
      expect('code' in result.anchors, result.name).toBe(false);
      const report = validate(assembly, gunDomain);
      expect(report.ok, `${result.name}: ${report.issues.map((issue) => issue.message).join('; ')}`).toBe(true);
    }
  });
});
