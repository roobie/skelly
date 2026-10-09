import { displayItems } from '@skelly/engine/core/display.ts';
import { meshForSolid, meshForSolidGroup } from '@skelly/engine/core/mesh.ts';
import type { Resolved } from '@skelly/engine/core/resolve.ts';
import { resolve } from '@skelly/engine/core/resolve.ts';
import type { Solid } from '@skelly/engine/core/schema.ts';
import { validate } from '@skelly/engine/core/validate.ts';
import { describe, expect, it } from 'vitest';
import { gunDomain } from '../src/gun/domain.ts';
import { FAMILIES } from '../src/gun/parts.ts';
import { REVOLVER_PROPORTIONS, revolverAlignment } from '../src/gun/revolver.ts';
import { tWiseCases } from './coveringArray.ts';
import { expectWatertightMesh, loadFixture, variant } from './helpers.ts';
import { runSweeps, sweepGroup } from './sweeps.ts';

const validateFrameSolidMutation = (mutate: (solid: Solid) => Solid) => {
  const source = FAMILIES['revolver-frame']!;
  const domain = {
    ...gunDomain,
    families: {
      ...FAMILIES,
      'revolver-frame': {
        ...source,
        build(params: Parameters<typeof source.build>[0]) {
          const def = source.build(params);
          return { ...def, solids: def.solids.map(mutate) };
        },
      },
    },
  };
  return validate(loadFixture('archetype-revolver'), domain);
};

const shiftPart = (resolved: Resolved, part: string, delta: readonly [number, number, number]): Resolved => {
  const placed = new Map(resolved.placed);
  const transform = placed.get(part)!;
  placed.set(part, {
    ...transform,
    t: [transform.t[0] + delta[0], transform.t[1] + delta[1], transform.t[2] + delta[2]],
  });
  return { ...resolved, placed };
};

interface RevolverVariant {
  frameSize: 'S' | 'M' | 'L';
  butt: 'round' | 'square';
  bore: 'S' | 'M';
  barrelLength: 'S' | 'M' | 'L';
  style: 'classic' | 'vented';
  gripLength: 'S' | 'M' | 'L';
}

/**
 * The default run covers every pair of variant values; explicit guard canaries below target the detached-segment fault.
 * The full 216-case product runs only in the gated sweep.
 */
const revolverParams = {
  frameSize: { values: ['S', 'M', 'L'] },
  butt: { values: ['round', 'square'] },
  bore: { values: ['S', 'M'] },
  barrelLength: { values: ['S', 'M', 'L'] },
  style: { values: ['classic', 'vented'] },
  gripLength: { values: ['S', 'M', 'L'] },
};
const defaultRevolverVariants = tWiseCases(revolverParams, 2) as unknown as RevolverVariant[];

const REVOLVER_COMBINATION_COUNT = 216;
const revolverVariants: RevolverVariant[] = runSweeps
  ? (['S', 'M', 'L'] as const).flatMap((frameSize) =>
      (['round', 'square'] as const).flatMap((butt) =>
        (['S', 'M'] as const).flatMap((bore) =>
          (['S', 'M', 'L'] as const).flatMap((barrelLength) =>
            (['classic', 'vented'] as const).flatMap((style) =>
              (['S', 'M', 'L'] as const).map((gripLength) => ({
                frameSize,
                butt,
                bore,
                barrelLength,
                style,
                gripLength,
              })),
            ),
          ),
        ),
      ),
    )
  : [];

const variantAssembly = (combination: RevolverVariant) => {
  const { frameSize, butt, bore, barrelLength, style, gripLength } = combination;
  return variant('archetype-revolver', (draft) => {
    draft.parts.frame!.params!.frameSize = frameSize;
    draft.parts.frame!.params!.butt = butt;
    draft.parts.frame!.params!.bore = bore;
    draft.parts.barrel!.params!.length = barrelLength;
    draft.parts.barrel!.params!.style = style;
    draft.parts.grip!.params!.length = gripLength;
  });
};

describe('revolver alignment rules', () => {
  const resolved = () => resolve(loadFixture('archetype-revolver'), gunDomain);

  it('rejects a displaced top chamber bore', () => {
    expect(revolverAlignment.topChamberBore(shiftPart(resolved(), 'cylinder', [0, 0.1, 0]))).toBe(false);
  });

  it('rejects a displaced cylinder axis', () => {
    expect(revolverAlignment.cylinderAxis(shiftPart(resolved(), 'cylinder', [0, 0.1, 0]))).toBe(false);
  });

  it('rejects a displaced physical top-chamber marker while ports and axes remain unchanged', () => {
    const source = FAMILIES['revolver-cylinder']!;
    const domain = {
      ...gunDomain,
      families: {
        ...FAMILIES,
        'revolver-cylinder': {
          ...source,
          build(params: Parameters<typeof source.build>[0]) {
            const def = source.build(params);
            return {
              ...def,
              displaySolids: (def.displaySolids ?? def.solids).map((solid) =>
                solid.id === 'chamber-0' && solid.kind === 'extruded-polygon'
                  ? { ...solid, profile: solid.profile.map(([y, z]) => [y + 0.125, z] as const) }
                  : solid,
              ),
            };
          },
        },
      },
    };
    const report = validate(loadFixture('archetype-revolver'), domain);
    expect(report.issues.some((issue) => issue.rule === 'revolver-top-chamber-bore')).toBe(true);
    expect(report.issues.some((issue) => issue.rule === 'axis-alignment')).toBe(false);
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
        solid.id === 'topstrap' && solid.kind === 'extruded-polygon'
          ? { ...solid, profile: solid.profile.map(([x, y]) => [x + 1, y] as const) }
          : solid,
      ),
    });
    expect(revolverAlignment.topstrapSpan({ ...base, defs })).toBe(false);
  });

  it('rejects a cylinder whose real body is displaced from the roof axis despite stale metadata', () => {
    const source = FAMILIES['revolver-cylinder']!;
    let builds = 0;
    const shiftProfile = (solid: Solid) =>
      solid.kind === 'extruded-polygon'
        ? { ...solid, profile: solid.profile.map(([y, z]) => [y, z + 0.5] as const) }
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
    expect(report.resolved.defs.get('cylinder')?.axes).toEqual(resolved().defs.get('cylinder')?.axes);
    expect(report.resolved.defs.get('cylinder')?.ports).toEqual(resolved().defs.get('cylinder')?.ports);
    expect(report.issues.some((issue) => issue.rule === 'revolver-cylinder-axis')).toBe(true);
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
                (solid.id.startsWith('grip-panel') || solid.id.startsWith('grip-cover')) &&
                solid.kind === 'extruded-polygon'
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

  it('keeps the side silhouette closed across the rear frame, guard, and grip front strap', () => {
    expect(revolverAlignment.gripJoint(resolved())).toBe(true);
  });

  it('derives the physical guard bottom from each selected frame height', () => {
    const frameFamily = FAMILIES['revolver-frame']!;
    const frameHeights = {
      S: REVOLVER_PROPORTIONS.frameHeightS.pickedU,
      M: REVOLVER_PROPORTIONS.frameHeight.pickedU,
      L: REVOLVER_PROPORTIONS.frameHeightL.pickedU,
    };
    const strapTopY = REVOLVER_PROPORTIONS.topstrapBottomY.pickedU + REVOLVER_PROPORTIONS.topstrapThickness.pickedU;
    for (const frameSize of ['S', 'M', 'L'] as const) {
      const frame = frameFamily.build({ frameSize, gripLength: 'M', bore: 'M', butt: 'round' });
      const guard = frame.solids.filter(
        (solid): solid is Extract<Solid, { kind: 'extruded-polygon' }> =>
          solid.id.startsWith('trigger-guard-') && solid.kind === 'extruded-polygon',
      );
      const actualBottom = Math.min(...guard.flatMap((solid) => solid.profile.map(([, y]) => y)));
      expect(actualBottom).toBeCloseTo(strapTopY - frameHeights[frameSize], 6);
    }
  });

  it('rejects even a sub-grid gap at the frame, guard, or grip bridge', () => {
    expect(validate(loadFixture('archetype-revolver'), gunDomain).issues).toEqual([]);
    const source = FAMILIES['revolver-frame']!;
    const domain = {
      ...gunDomain,
      families: {
        ...FAMILIES,
        'revolver-frame': {
          ...source,
          build(params: Parameters<typeof source.build>[0]) {
            const def = source.build(params);
            return {
              ...def,
              solids: def.solids.map((solid) =>
                solid.id === 'rear-frame-bridge' && solid.kind === 'extruded-polygon'
                  ? { ...solid, profile: solid.profile.map(([x, y]) => [x + 0.125, y] as const) }
                  : solid,
              ),
            };
          },
        },
      },
    };
    const report = validate(loadFixture('archetype-revolver'), domain);
    expect(report.issues.some((issue) => issue.rule === 'revolver-grip-joint')).toBe(true);
  });

  it('rejects a trigger bow missing one joined prism segment', () => {
    const base = resolved();
    expect(revolverAlignment.triggerBow(base)).toBe(true);
    const defs = new Map(base.defs);
    const frame = defs.get('frame')!;
    defs.set('frame', { ...frame, solids: frame.solids.filter((solid) => solid.id !== 'trigger-guard-9') });
    expect(revolverAlignment.triggerBow({ ...base, defs })).toBe(false);
  });

  it('rejects all trigger solids moved 10u above the bow from a valid baseline', () => {
    expect(validate(loadFixture('archetype-revolver'), gunDomain).issues).toEqual([]);
    const report = validateFrameSolidMutation((solid) =>
      solid.id.startsWith('curved-trigger-') && solid.kind === 'extruded-polygon'
        ? { ...solid, profile: solid.profile.map(([x, y]) => [x, y + 10] as const) }
        : solid,
    );
    expect(report.issues.some((issue) => issue.rule === 'revolver-trigger-bow')).toBe(true);
  });

  it('rejects all trigger solids moved 10u outside the bow depth from a valid baseline', () => {
    expect(validate(loadFixture('archetype-revolver'), gunDomain).issues).toEqual([]);
    const report = validateFrameSolidMutation((solid) =>
      solid.id.startsWith('curved-trigger-') && solid.kind === 'extruded-polygon'
        ? { ...solid, z: [solid.z[0] + 10, solid.z[1] + 10] as const }
        : solid,
    );
    expect(report.issues.some((issue) => issue.rule === 'revolver-trigger-bow')).toBe(true);
  });

  it('rejects a displaced trigger-bow segment with all IDs and ports intact', () => {
    expect(validate(loadFixture('archetype-revolver'), gunDomain).issues).toEqual([]);
    const source = FAMILIES['revolver-frame']!;
    const domain = {
      ...gunDomain,
      families: {
        ...FAMILIES,
        'revolver-frame': {
          ...source,
          build(params: Parameters<typeof source.build>[0]) {
            const def = source.build(params);
            return {
              ...def,
              solids: def.solids.map((solid) =>
                solid.id === 'trigger-guard-9' && solid.kind === 'extruded-polygon'
                  ? { ...solid, profile: solid.profile.map(([x, y]) => [x + 10, y] as const) }
                  : solid,
              ),
            };
          },
        },
      },
    };
    const report = validate(loadFixture('archetype-revolver'), domain);
    expect(report.issues.some((issue) => issue.rule === 'revolver-trigger-bow')).toBe(true);
  });

  it('rejects a grip disconnected from the frame interface', () => {
    expect(revolverAlignment.gripJoint(shiftPart(resolved(), 'grip', [0.1, 0, 0]))).toBe(false);
  });

  it('validates a fixed pairwise covering set of frame, grip, barrel, bore, butt, and style', () => {
    for (const combination of defaultRevolverVariants) {
      const report = validate(variantAssembly(combination), gunDomain);
      expect(report.issues, JSON.stringify(combination)).toEqual([]);
    }
    expect(defaultRevolverVariants.length).toBeLessThan(REVOLVER_COMBINATION_COUNT);
  });

  sweepGroup('revolver full assembly product', () => {
    it('validates all 216 legitimate frame/grip/barrel/bore/style combinations', { timeout: 20_000 }, () => {
      for (const combination of revolverVariants) {
        const report = validate(variantAssembly(combination), gunDomain);
        expect(report.issues, JSON.stringify(combination)).toEqual([]);
      }
      expect(revolverVariants).toHaveLength(REVOLVER_COMBINATION_COUNT);
    });
  });

  const displayVariants: readonly [string, readonly Record<string, string>[]][] = [
    [
      'revolver-frame',
      ['S', 'M', 'L'].flatMap((frameSize) => ['S', 'M'].map((bore) => ({ frameSize, bore, butt: 'round' }))),
    ],
    [
      'revolver-cylinder',
      Array.from({ length: 6 }, (_, chamberIndex) => ({ chamberCount: '6', chamberIndex: String(chamberIndex) })),
    ],
    [
      'revolver-barrel',
      ['S', 'M', 'L'].flatMap((length) => ['classic', 'vented'].map((style) => ({ bore: 'M', length, style }))),
    ],
    ['revolver-grip', ['S', 'M', 'L'].flatMap((length) => ['round', 'square'].map((butt) => ({ length, butt })))],
  ];

  it.each(displayVariants)('keeps $0 display parts watertight across their geometry variants', (familyName, cases) => {
    const family = FAMILIES[familyName]!;
    for (const params of cases) {
      const def = family.build(params);
      for (const item of displayItems(def.displaySolids ?? def.solids)) {
        const mesh = item.merged ? meshForSolidGroup(item.solids) : meshForSolid(item.solids[0]!);
        expectWatertightMesh(mesh, `${familyName} ${JSON.stringify(params)} ${item.id}`);
      }
    }
  });
});
