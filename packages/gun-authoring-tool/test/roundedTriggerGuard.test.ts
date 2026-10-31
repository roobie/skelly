import type { PartDef, Resolved } from '@skelly/engine/assembly/schema.ts';
import { IDENTITY } from '@skelly/engine/foundation/math.ts';
import { boxFromMinMax, localSolidBounds, validateExtrudedPolygon } from '@skelly/engine/shapes/geometry.ts';
import type { Solid, Vec2 } from '@skelly/engine/shapes/solid.ts';
import { describe, expect, it } from 'vitest';
import { gunDomain } from '../src/gun/domain.ts';
import { FAMILIES } from '../src/gun/parts.ts';
import {
  openTriggerGuard,
  rampedTriggerGuardSolids,
  TRIGGER_GUARD_REAR_TAGS,
  triggerBlade,
} from '../src/gun/roundedTriggerGuard.ts';
import { triggerGuard } from '../src/gun/rules.ts';
import { TRIGGER_BLADE, type TriggerGuardDimensions } from '../src/gun/triggerGuards.ts';
import { loadFixture } from './helpers.ts';

const dimensions: TriggerGuardDimensions = {
  wallU: 0.6,
  clearanceU: 0.5,
  halfWidthU: 0.5,
  frontCutU: 0.2,
  frontCutDegrees: 40,
  rearSlantDegrees: 10,
  rear: 'open',
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
const fixture = (rear: TriggerGuardDimensions['rear'] = 'open') => {
  const built = openTriggerGuard(finger, { ...dimensions, rear }, 4, face);
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
const issuesWith = (
  edit: (lower: PartDef, grip: PartDef) => PartDef,
  rear: TriggerGuardDimensions['rear'] = 'open',
) => {
  const { lower, grip, resolved } = fixture(rear);
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
    expect(built.tags).toEqual([TRIGGER_GUARD_REAR_TAGS[dimensions.rear]]);
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
  it('rejects a finger reaching above the ceiling', () => {
    expect(() => openTriggerGuard(finger, dimensions, 2.9, face)).toThrow('ceiling');
  });
  it('hangs a valid blade inside the finger space from the given top', () => {
    const blade = triggerBlade(finger, TRIGGER_BLADE, 4);
    if (blade.kind !== 'extruded-polygon') {
      throw new Error('Expected polygon');
    }
    expect(validateExtrudedPolygon(blade.profile, blade.z)).toBeUndefined();
    const [min, max] = localSolidBounds(blade);
    expect(max[1]).toBe(4);
    expect(min[0]).toBeGreaterThan(0);
    expect(max[0]).toBeLessThan(2);
    expect(min[1]).toBeGreaterThan(0);
  });
  it('rejects a front cut larger than the bar', () => {
    expect(() => openTriggerGuard(finger, { ...dimensions, frontCutU: dimensions.wallU * 2 }, 4, face)).toThrow('cut');
    expect(() => openTriggerGuard(finger, { ...dimensions, frontCutDegrees: 1 }, 4, face)).toThrow('cut');
  });
});

describe('ramped closed trigger guard builder', () => {
  const closed = { wallU: 0.3, rearWallU: 0.6, clearanceU: 0.4, frontRampDegrees: 55, halfWidthU: 0.5 };
  it('builds a closed loop the guard rule accepts, its front ramp leaning forward from a clear foot', () => {
    const guards = rampedTriggerGuardSolids(finger, closed);
    for (const guard of guards) {
      if (guard.kind !== 'extruded-polygon') {
        throw new Error(`${guard.id} is not a profile`);
      }
      expect(validateExtrudedPolygon(guard.profile, guard.z), guard.id).toBeUndefined();
    }
    const lower: PartDef = {
      family: 'lower',
      solids: [box('plate', [-3, 3 + closed.wallU, -1], [6, 4, 1]), ...guards],
      keepOuts: [{ id: 'trigger-finger', kind: 'clearance', box: finger }],
      ports: [],
      axes: [],
    };
    const { resolved } = fixture();
    expect(triggerGuard.check({ ...resolved, defs: new Map([['lower', lower]]), connections: [] })).toEqual([]);
    const front = guards.find(({ id }) => id === 'trigger-guard-front')!;
    if (front.kind !== 'extruded-polygon') {
      throw new Error('Expected a profile');
    }
    const foot = Math.min(...front.profile.map(([x]) => x));
    const rear = localSolidBounds(guards.find(({ id }) => id === 'trigger-guard-rear')!);
    const [fingerMin, fingerMax] = localSolidBounds({ id: 'finger', kind: 'box', box: finger });
    expect(foot - fingerMax[0]).toBeCloseTo(fingerMin[0] - rear[1][0]);
    const topX = Math.max(
      ...front.profile.filter(([, y]) => y === Math.max(...front.profile.map(([, py]) => py))).map(([x]) => x),
    );
    expect(topX).toBeGreaterThan(foot);
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
  it('accepts a trigger blade hanging from the receiver into the finger space', () => {
    expect(
      issuesWith((lower) => ({ ...lower, solids: [...lower.solids, triggerBlade(finger, TRIGGER_BLADE, 4)] })),
    ).toEqual([]);
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
      'same-part obstruction in the finger space',
      (lower) => ({
        ...lower,
        solids: [...lower.solids, box('receiver-obstruction', [0.2, 0.3, -0.8], [1.8, 2.7, 0.8])],
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

describe('declared trigger guard rear', () => {
  // The space behind the opening, from the grip face at the bar's top to the corner's front, up to the receiver.
  const rearBox = (id: string, bottomY = 0, topY = 4, halfZ = 0.5) =>
    box(id, [face.xAt(0), bottomY, -halfZ], [-dimensions.clearanceU, topY, halfZ]);
  const adding =
    (...solids: Solid[]) =>
    (lower: PartDef): PartDef => ({ ...lower, solids: [...lower.solids, ...solids] });
  it('rejects a body solid filling a rear declared open, whatever its name', () => {
    expect(issuesWith(adding(rearBox('body-rear-closure'))).map(({ message }) => message)).toEqual([
      "lower's trigger guard rear is declared open, but a solid of the part fills it.",
    ]);
    expect(issuesWith(adding(rearBox('trigger-guard-rear'))).length).toBeGreaterThan(0);
  });
  it.each([
    ['one body box', [rearBox('body-rear-closure')]],
    ['two stacked body boxes', [rearBox('lug', 0, 1.5), rearBox('boss', 1.5, 4)]],
  ])('accepts a rear declared closed by the lower and filled by %s', (_name, solids) => {
    expect(issuesWith(adding(...solids), 'lower')).toEqual([]);
  });
  it.each([
    ['nothing', []],
    ['a body box short of the receiver', [rearBox('body-rear-closure', 0, 3)]],
    ['a body box narrower than the guard', [rearBox('body-rear-closure', 0, 4, 0.25)]],
    ['a guard-named box', [rearBox('trigger-guard-rear')]],
  ])('rejects a rear declared closed by the lower and filled by %s', (_name, solids) => {
    expect(issuesWith(adding(...solids), 'lower').length).toBeGreaterThan(0);
  });
  it('rejects a part declaring both rears', () => {
    const both = (lower: PartDef): PartDef => ({ ...lower, tags: Object.values(TRIGGER_GUARD_REAR_TAGS) });
    expect(issuesWith(both).length).toBeGreaterThan(0);
  });
});
