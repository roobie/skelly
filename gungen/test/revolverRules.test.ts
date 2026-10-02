import { describe, expect, it } from 'vitest';
import type { Resolved } from '../src/core/resolve.ts';
import type { Solid } from '../src/core/schema.ts';
import { resolve } from '../src/core/resolve.ts';
import { validate } from '../src/core/validate.ts';
import { gunDomain } from '../src/gun/domain.ts';
import { FAMILIES } from '../src/gun/parts.ts';
import { revolverAlignment } from '../src/gun/revolver.ts';
import { loadFixture } from './helpers.ts';

const shiftPart = (resolved: Resolved, part: string, delta: readonly [number, number, number]): Resolved => {
  const placed = new Map(resolved.placed);
  const transform = placed.get(part)!;
  placed.set(part, {
    ...transform,
    t: [transform.t[0] + delta[0], transform.t[1] + delta[1], transform.t[2] + delta[2]],
  });
  return { ...resolved, placed };
};

describe('revolver alignment rules', () => {
  const resolved = () => resolve(loadFixture('archetype-revolver'), gunDomain);

  it('rejects a displaced top chamber bore', () => {
    expect(revolverAlignment.topChamberBore(shiftPart(resolved(), 'cylinder', [0, 0.1, 0]))).toBe(false);
  });

  it('rejects a displaced cylinder axis', () => {
    expect(revolverAlignment.cylinderAxis(shiftPart(resolved(), 'cylinder', [0, 0.1, 0]))).toBe(false);
  });

  it('rejects a changed cylinder gap', () => {
    expect(revolverAlignment.cylinderGap(shiftPart(resolved(), 'barrel', [0.1, 0, 0]))).toBe(false);
  });

  it('rejects a topstrap that exceeds the frame envelope', () => {
    const base = resolved();
    const defs = new Map(base.defs);
    const frame = defs.get('frame')!;
    defs.set('frame', {
      ...frame,
      solids: frame.solids.map((solid) =>
        solid.id === 'topstrap' && solid.kind === 'box'
          ? { ...solid, box: { ...solid.box, center: [solid.box.center[0], solid.box.center[1], 10] } }
          : solid,
      ),
    });
    expect(revolverAlignment.topstrapSpan({ ...base, defs })).toBe(false);
  });

  it('rejects a cylinder whose placed display envelope overruns the topstrap', () => {
    const source = FAMILIES['revolver-cylinder']!;
    let builds = 0;
    const shiftProfile = (solid: Solid) =>
      solid.kind === 'extruded-polygon'
        ? { ...solid, profile: solid.profile.map(([x, y]) => [x + 0.5, y] as const) }
        : solid;
    const domain = {
      ...gunDomain,
      families: {
        ...FAMILIES,
        'revolver-cylinder': {
          ...source,
          build(params: Parameters<typeof source.build>[0]) {
            builds += 1;
            const def = source.build(params);
            return {
              ...def,
              solids: def.solids.map(shiftProfile),
              displaySolids: (def.displaySolids ?? def.solids).map(shiftProfile),
            };
          },
        },
      },
    };
    const report = validate(loadFixture('archetype-revolver'), domain);
    expect(builds).toBeGreaterThan(0);
    expect(report.issues.some((issue) => issue.rule === 'revolver-topstrap-span')).toBe(true);
  });

  it('rejects grip panels separated from the frame while ports and core remain aligned', () => {
    const source = FAMILIES['revolver-grip']!;
    let builds = 0;
    const domain = {
      ...gunDomain,
      families: {
        ...FAMILIES,
        'revolver-grip': {
          ...source,
          build(params: Parameters<typeof source.build>[0]) {
            builds += 1;
            const def = source.build(params);
            return {
              ...def,
              solids: def.solids.map((solid) =>
                solid.id.startsWith('grip-panel') && solid.kind === 'extruded-polygon'
                  ? { ...solid, z: [solid.z[0] + 3, solid.z[1] + 3] as const }
                  : solid,
              ),
            };
          },
        },
      },
    };
    const report = validate(loadFixture('archetype-revolver'), domain);
    expect(builds).toBeGreaterThan(0);
    expect(report.resolved.defs.get('grip')?.ports).toEqual(resolved().defs.get('grip')?.ports);
    expect(report.issues.some((issue) => issue.rule === 'revolver-grip-joint')).toBe(true);
  });

  it('rejects a grip disconnected from the frame interface', () => {
    expect(revolverAlignment.gripJoint(shiftPart(resolved(), 'grip', [0.1, 0, 0]))).toBe(false);
  });
});
