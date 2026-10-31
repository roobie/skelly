import type { PartDef, Resolved } from '@skelly/engine/assembly/schema.ts';
import { IDENTITY } from '@skelly/engine/foundation/math.ts';
import { boxFromMinMax, localSolidBounds, validateExtrudedPolygon } from '@skelly/engine/shapes/geometry.ts';
import type { Solid, Vec2 } from '@skelly/engine/shapes/solid.ts';
import { describe, expect, it } from 'vitest';
import { gunDomain } from '../src/gun/domain.ts';
import { FAMILIES } from '../src/gun/parts.ts';
import { OPEN_TRIGGER_GUARD, openTriggerGuard } from '../src/gun/roundedTriggerGuard.ts';
import { triggerGuard } from '../src/gun/rules.ts';
import type { TriggerGuardDimensions } from '../src/gun/triggerGuards.ts';
import { loadFixture } from './helpers.ts';

const dimensions: TriggerGuardDimensions = {
  wallU: 0.6,
  clearanceU: 0.5,
  halfWidthU: 0.5,
  frontCutU: 0.2,
  frontCutDegrees: 40,
  rearSlantDegrees: 10,
  fingerY: [0, 3],
  fingerZ: [-1, 1],
};
const finger = boxFromMinMax([0, 0, -1], [2, 3, 1]);
const face = { xAt: (y: number) => -2 + 0.2 * y, straightTopY: 4 };
const box = (id: string, min: readonly [number, number, number], max: readonly [number, number, number]): Solid => ({
  id,
  kind: 'box',
  box: boxFromMinMax(min, max),
});
const polygon = (id: string, profile: readonly Vec2[]): Solid => ({
  id,
  kind: 'extruded-polygon',
  profile,
  z: [-0.5, 0.5],
});
const cornerId = 'trigger-guard-corner';
const fixture = () => {
  const built = openTriggerGuard(finger, dimensions, 4, face);
  const lower: PartDef = {
    family: 'lower',
    tags: built.tags,
    solids: [box('receiver', [-3, 4, -1], [4, 5, 1]), ...built.solids],
    keepOuts: [{ id: 'trigger-finger', kind: 'clearance', box: finger }],
    ports: [],
    axes: [],
  };
  const grip: PartDef = {
    family: 'grip',
    solids: [
      polygon('grip', [
        [-4, -2],
        [face.xAt(-2), -2],
        [face.xAt(4), 4],
        [-4, 4],
      ]),
    ],
    ports: [],
    axes: [],
    keepOuts: [],
  };
  const port = FAMILIES.lower!.build({ layout: 'ak' }).ports.find(({ id }) => id === 'grip')!;
  const resolved: Resolved = {
    assembly: loadFixture('archetype-ak'),
    domain: gunDomain,
    defs: new Map([
      ['lower', lower],
      ['grip', grip],
    ]),
    placed: new Map([
      ['lower', IDENTITY],
      ['grip', IDENTITY],
    ]),
    params: new Map(),
    issues: [],
    connections: [
      {
        index: 0,
        role: 'tree',
        conn: { from: 'lower.grip', to: 'grip.top' },
        from: { part: 'lower', port },
        to: { part: 'grip', port },
      },
    ],
  };
  return { lower, grip, resolved };
};
const changeCorner = (lower: PartDef, edit: (profile: Vec2[]) => void): PartDef => ({
  ...lower,
  solids: lower.solids.map((solid) => {
    if (solid.id !== cornerId || solid.kind !== 'extruded-polygon') {
      return solid;
    }
    const profile = solid.profile.map(([x, y]): Vec2 => [x, y]);
    edit(profile);
    const error = validateExtrudedPolygon(profile, solid.z);
    if (error) {
      throw new Error(`Invalid malformed fixture: ${error}`);
    }
    return { ...solid, profile };
  }),
});
const issuesWith = (edit: (lower: PartDef, grip: PartDef) => PartDef) => {
  const { lower, grip, resolved } = fixture();
  return triggerGuard.check({
    ...resolved,
    defs: new Map([
      ['lower', edit(lower, grip)],
      ['grip', grip],
    ]),
  });
};

describe('open trigger guard builder', () => {
  it.each([8, 12])('builds valid pieces on the straight grip face with rear angle %s', (rearSlantDegrees) => {
    const built = openTriggerGuard(finger, { ...dimensions, rearSlantDegrees }, 4, face);
    expect(built.tags).toContain(OPEN_TRIGGER_GUARD);
    expect(built.solids.map(({ id }) => id).sort()).toEqual(
      ['trigger-guard-bottom', cornerId, 'trigger-guard-front'].sort(),
    );
    for (const solid of built.solids) {
      if (solid.kind === 'box') {
        const [min, max] = localSolidBounds(solid);
        expect(min.every((value, axis) => Number.isFinite(value) && value < max[axis]!)).toBe(true);
        expect(max.every(Number.isFinite)).toBe(true);
        expect(max[1]).toBe(4);
        continue;
      }
      expect(solid.kind).toBe('extruded-polygon');
      if (solid.kind !== 'extruded-polygon') {
        throw new Error('Expected polygon');
      }
      expect(solid.profile.length).toBeGreaterThan(0);
      expect(validateExtrudedPolygon(solid.profile, solid.z)).toBeUndefined();
    }
    const corner = built.solids.find(({ id }) => id === cornerId)!;
    const bottom = built.solids.find(({ id }) => id === 'trigger-guard-bottom')!;
    if (corner.kind !== 'extruded-polygon' || bottom.kind !== 'extruded-polygon') {
      throw new Error('Expected polygon pieces');
    }
    const [frontBottom, frontTop, rearTop, rearBottom] = corner.profile;
    expect(frontTop![1] - frontBottom![1]).toBeCloseTo(dimensions.wallU);
    expect(rearBottom![1]).toBeGreaterThan(frontBottom![1]);
    expect(rearBottom![1]).toBeLessThanOrEqual(frontTop![1]);
    expect(rearTop![1]).toBe(frontTop![1]);
    for (const [x, y] of [rearTop!, rearBottom!]) {
      expect(x).toBeCloseTo(face.xAt(y));
    }
    expect((rearBottom![1] - frontBottom![1]) / (frontBottom![0] - rearBottom![0])).toBeCloseTo(
      Math.tan((rearSlantDegrees * Math.PI) / 180),
    );
    const [, cutStart, cutEnd] = bottom.profile;
    const rise = cutEnd![1] - cutStart![1];
    const run = cutEnd![0] - cutStart![0];
    expect(rise).toBeCloseTo(dimensions.frontCutU);
    expect(rise / run).toBeCloseTo(Math.tan((dimensions.frontCutDegrees * Math.PI) / 180));
    expect(rise).toBeLessThanOrEqual(dimensions.wallU);
    expect(run).toBeLessThan(localSolidBounds(bottom)[1][0] - localSolidBounds(bottom)[0][0]);
  });
  it('rejects a slant that reaches above the bar', () => {
    expect(() => openTriggerGuard(finger, { ...dimensions, rearSlantDegrees: 80 }, 4, face)).toThrow('slant');
  });
  it('rejects a corner outside the straight face domain', () => {
    expect(() => openTriggerGuard(finger, dimensions, 4, { ...face, straightTopY: -0.1 })).toThrow('straight');
  });
  it('rejects a finger reaching the ceiling', () => {
    expect(() => openTriggerGuard(finger, dimensions, 3, face)).toThrow('ceiling');
  });
  it('rejects a front cut larger than the bar', () => {
    expect(() => openTriggerGuard(finger, { ...dimensions, frontCutU: dimensions.wallU * 2 }, 4, face)).toThrow('cut');
    expect(() => openTriggerGuard(finger, { ...dimensions, frontCutDegrees: 1 }, 4, face)).toThrow('cut');
  });
});

describe('open trigger guard rule', () => {
  it('accepts symmetric closed bars whose thickness differs from the retired constant', () => {
    const { lower, resolved } = fixture();
    const wall = dimensions.wallU;
    const closed: PartDef = {
      ...lower,
      tags: [],
      solids: [
        box('receiver', [-3, 3 + wall, -1], [4, 5, 1]),
        box('trigger-guard-top', [-2, 3, -0.5], [3.1, 3 + wall, 0.5]),
        box('trigger-guard-rear', [-2, -wall, -0.5], [-0.5, 3 + wall, 0.5]),
        box('trigger-guard-front', [2.5, -wall, -0.5], [3.1, 3 + wall, 0.5]),
        box('trigger-guard-bottom', [-2, -wall, -0.5], [3.1, 0, 0.5]),
      ],
    };
    expect(triggerGuard.check({ ...resolved, defs: new Map([['lower', closed]]), connections: [] })).toEqual([]);
  });
  it('accepts a receiver-closed open fixture with content-owned thickness', () => {
    expect(issuesWith((lower) => lower)).toEqual([]);
  });
  const rows: [string, (lower: PartDef) => PartDef][] = [
    ['tag without corner', (lower) => ({ ...lower, solids: lower.solids.filter(({ id }) => id !== cornerId) })],
    ['corner without tag', (lower) => ({ ...lower, tags: [] })],
    ...['top', 'rear'].map((name): [string, (lower: PartDef) => PartDef] => [
      `tag with ${name}`,
      (lower) => ({ ...lower, solids: [...lower.solids, { ...lower.solids[1]!, id: `trigger-guard-${name}` }] }),
    ]),
    [
      'restored rear above the bar',
      (lower) =>
        changeCorner(lower, (profile) => {
          profile[2] = [face.xAt(2), 2];
        }),
    ],
    [
      'corner below the bar',
      (lower) =>
        changeCorner(lower, (profile) => {
          profile[3] = [face.xAt(-0.8), -0.8];
        }),
    ],
    [
      'shortened front edge',
      (lower) =>
        changeCorner(lower, (profile) => {
          profile[1] = [-0.5, -0.1];
          profile[2] = [face.xAt(-0.1), -0.1];
        }),
    ],
    [
      'flat underside',
      (lower) =>
        changeCorner(lower, (profile) => {
          profile[3] = [face.xAt(-dimensions.wallU), -dimensions.wallU];
        }),
    ],
    [
      'box corner',
      (lower) => ({
        ...lower,
        solids: lower.solids.map((solid) =>
          solid.id === cornerId ? box(cornerId, [-2, -0.6, -0.5], [-0.5, 0, 0.5]) : solid,
        ),
      }),
    ],
    [
      'revolved corner',
      (lower) => ({
        ...lower,
        solids: lower.solids.map((solid) =>
          solid.id === cornerId
            ? ({
                id: cornerId,
                kind: 'revolved',
                axis: 'x',
                profile: [
                  [-2, 0],
                  [-2, 0.2],
                  [-0.5, 0.2],
                  [-0.5, 0],
                ],
              } satisfies Solid)
            : solid,
        ),
      }),
    ],
    ...[0.1, -0.1].map((shift): [string, (lower: PartDef) => PartDef] => [
      shift > 0 ? 'corner gapped from grip' : 'corner overlapping grip',
      (lower) =>
        changeCorner(lower, (profile) => {
          for (const index of [2, 3]) {
            profile[index] = [profile[index]![0] + shift, profile[index]![1]];
          }
        }),
    ]),
    [
      'side-only receiver',
      (lower) => ({
        ...lower,
        solids: lower.solids.map((solid) =>
          solid.id === 'receiver' ? box('receiver', [3.1, 0, -1], [4, 4, 1]) : solid,
        ),
      }),
    ],
    [
      'receiver cap over front only',
      (lower) => ({
        ...lower,
        solids: lower.solids.map((solid) =>
          solid.id === 'receiver' ? box('receiver', [2.5, 4, -1], [4, 5, 1]) : solid,
        ),
      }),
    ],
    [
      'finger inside receiver',
      (lower) => ({
        ...lower,
        keepOuts: [{ id: 'trigger-finger', kind: 'clearance', box: boxFromMinMax([0, 0, -1], [2, 4.1, 1]) }],
      }),
    ],
    [
      'bottom disconnected from corner',
      (lower) => ({
        ...lower,
        solids: lower.solids.map((solid) =>
          solid.id === 'trigger-guard-bottom' && solid.kind === 'extruded-polygon'
            ? { ...solid, profile: solid.profile.map(([x, y]): Vec2 => [x === -0.5 ? x + 0.1 : x, y]) }
            : solid,
        ),
      }),
    ],
  ];
  it.each(rows)('rejects %s', (_name, edit) => {
    expect(issuesWith(edit).length).toBeGreaterThan(0);
  });
});
