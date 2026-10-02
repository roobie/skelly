import { describe, expect, it } from 'vitest';
import { GRID } from '../src/core/conventions.ts';
import { localSolidBounds, validateExtrudedPolygon } from '../src/core/geometry.ts';
import { cross, dot, length } from '../src/core/math.ts';
import { meshForSolid } from '../src/core/mesh.ts';
import type { PartFamily } from '../src/core/schema.ts';
import { validate } from '../src/core/validate.ts';
import { gunDomain } from '../src/gun/domain.ts';
import { BOLT_CARRIER_RUNNING_CLEARANCE_U, CARRIER_HANDLE_STYLES, FAMILIES } from '../src/gun/parts.ts';
import { REVOLVER_PROPORTIONS } from '../src/gun/revolver.ts';
import { fullProduct, tWiseCases } from './coveringArray.ts';
import { expectWatertightMesh, variant } from './helpers.ts';
import { runSweeps, sweepGroup } from './sweeps.ts';

/**
 * Keys of `FAMILIES` (not family names: `ak-receiver` is also named `receiver`) whose default-run cases are a 3-wise covering array instead of the full product. Any
 * family not listed here (including every family added later) gets the full product.
 *
 * Why these three: `receiver` (the AR/pump one) is 32,256 of the 37,320 combinations, `barrel` and
 * `handguard` 1,944 each. The array keeps coverage of the built geometry: on a sample of
 * `parts.ts` mutants it killed every mutant the full product killed, where 2-wise missed one.
 * `lower` stays a full product: the 3-wise array misses its `magazineOrientation=tilt` classes.
 * `sight` is sampled as an array so future optic parameters compose without making its full product
 * the default; the optic contract tests explicitly cover every stable catalog type. The full product
 * of these families still runs under `GUNGEN_SWEEPS` (see `sweepGroup` below).
 * `handleStyle` is deliberately excluded from these unconstrained products: arbitrary combinations
 * create invalid owner/pattern pairings. The compatible style × pattern × owner matrix below tests it.
 */
const ARRAY_SAMPLED_KEYS = ['receiver', 'barrel', 'handguard', 'sight'] as const;
const ARRAY_STRENGTH = 3;
const withoutHandleStyle = (family: PartFamily) =>
  Object.fromEntries(Object.entries(family.params).filter(([name]) => name !== 'handleStyle'));

/**
 * Interactions the array is known to miss, as explicit cases. `receiver`'s shell coordinates depend
 * on action, feed, section, carrierPattern and bore together; the 3-wise array does not hit this combination.
 */
const EXPLICIT_CASES: Readonly<Record<string, readonly Record<string, string>[]>> = {
  receiver: [
    {
      action: 'pump',
      feed: 'tube',
      section: 'pump',
      carrierPattern: 'auto',
      bore: 'S',
      chargingHandle: 'side',
      boltHandle: 'rest',
      boltHandleProfile: 'standard',
      rail: 'full',
      magazineWell: 'standard',
    },
  ],
};

const CARRIER_HANDLE_PAIRINGS = [
  { style: 'ar', pattern: 'ar', owner: 'receiver' },
  { style: 'ak', pattern: 'ak', owner: 'carrier' },
  { style: 'autoShotgun', pattern: 'ak', owner: 'carrier' },
  { style: 'bolt', pattern: 'bolt', owner: 'carrier' },
  { style: 'smg', pattern: 'smg', owner: 'handguard' },
  { style: 'battle', pattern: 'barrett', owner: 'carrier' },
  { style: 'barrett', pattern: 'barrett', owner: 'carrier' },
  { style: 'pump', pattern: 'pump', owner: 'none' },
  { style: 'pistol', pattern: 'ar', owner: 'none' },
  { style: 'bullpup', pattern: 'ar', owner: 'none' },
  { style: 'none', pattern: 'ar', owner: 'none' },
] as const;

const compatibleHandleStyleCases = (): Record<string, string>[] => {
  const carrier = FAMILIES['bolt-carrier']!;
  const pairings = CARRIER_HANDLE_PAIRINGS.map(({ style }) => style);
  const cases = tWiseCases(
    {
      pairing: { values: pairings },
      section: carrier.params.section!,
      bore: carrier.params.bore!,
      handleProfile: carrier.params.handleProfile!,
    },
    3,
  );
  return cases.map(({ pairing, ...axes }) => {
    const compatible = CARRIER_HANDLE_PAIRINGS.find(({ style }) => style === pairing)!;
    if (CARRIER_HANDLE_STYLES[compatible.style].owner !== compatible.owner) {
      throw new Error(`${compatible.style}: compatible owner row does not match the style catalog.`);
    }
    return {
      action: 'bolt',
      feed: 'box',
      pattern: compatible.pattern,
      handleStyle: compatible.style,
      ...axes,
    };
  });
};

const isArraySampled = (key: string): boolean => (ARRAY_SAMPLED_KEYS as readonly string[]).includes(key);
const sameParams = (a: Record<string, string>, b: Record<string, string>): boolean =>
  Object.keys(a).length === Object.keys(b).length && Object.entries(a).every(([k, v]) => b[k] === v);

/** The default product/covering-array cases; owner-specific styles are covered separately below. */
const defaultCases = (key: string, family: PartFamily): Record<string, string>[] => {
  const params = withoutHandleStyle(family);
  if (!isArraySampled(key)) {
    return fullProduct(params);
  }
  const cases = tWiseCases(params, ARRAY_STRENGTH);
  for (const extra of EXPLICIT_CASES[key] ?? []) {
    for (const [name, spec] of Object.entries(params)) {
      if (!spec.values.includes(extra[name] ?? '')) {
        throw new Error(`explicit ${key} case: ${name}=${extra[name]} is not one of ${spec.values.join(', ')}`);
      }
    }
    if (!cases.some((c) => sameParams(c, extra))) {
      cases.push(extra);
    }
  }
  return cases;
};

const onGrid = (n: number, step = GRID) => Math.abs(n / step - Math.round(n / step)) < 1e-9;

const onGridWithCarrierClearance = (value: number, step: number, family: PartFamily): boolean => {
  if (onGrid(value, step)) {
    return true;
  }
  if (family.name !== 'receiver') {
    return false;
  }
  const nearest = Math.round(value / step) * step;
  return Math.abs(Math.abs(value - nearest) - BOLT_CARRIER_RUNNING_CLEARANCE_U) < 1e-9;
};

const pumpTubeDimensions = (input: {
  bore: 'S' | 'M' | 'L';
  barrelClass: string;
  lengthPercent: '50' | '75' | '100';
}): {
  tubeEnd: number;
  tubeBodyEnd: number;
  barrelLug: number | undefined;
  barrelLugY: number | undefined;
  barrelSupportLug: number | undefined;
  tubeCap: number | undefined;
  tubeSupport: number | undefined;
  capBounds: readonly [number, number, number, number, number, number];
} => {
  const barrel = FAMILIES.barrel!.build({
    bore: input.bore,
    length: input.barrelClass,
    profile: 'standard',
    tubeLengthPercent: input.lengthPercent,
  });
  const tube = FAMILIES['tube-magazine']!.build({
    bore: input.bore,
    barrelLength: input.barrelClass,
    lengthPercent: input.lengthPercent,
  });
  const tubeSolid = tube.solids.find((solid) => solid.id === 'tube');
  const capLug = tube.solids.find((solid) => solid.id === 'cap-lug');
  if (tubeSolid?.kind !== 'extruded-polygon' || capLug?.kind !== 'extruded-polygon') {
    throw new Error('pump magazine tube and cap lug must be octagonal extrusions');
  }
  return {
    tubeEnd: tube.ports.find((port) => port.id === 'cap')!.pos[0],
    tubeBodyEnd: localSolidBounds(tubeSolid)[1][0],
    barrelLug: barrel.ports.find((port) => port.id === 'lug')?.pos[0],
    barrelLugY: barrel.ports.find((port) => port.id === 'lug')?.pos[1],
    barrelSupportLug: barrel.ports.find((port) => port.id === 'support-lug')?.pos[0],
    tubeCap: tube.ports.find((port) => port.id === 'cap')?.pos[0],
    tubeSupport: tube.ports.find((port) => port.id === 'support')?.pos[0],
    capBounds: [
      localSolidBounds(capLug)[0][0],
      localSolidBounds(capLug)[1][0],
      localSolidBounds(capLug)[0][1],
      localSolidBounds(capLug)[1][1],
      localSolidBounds(capLug)[0][2],
      localSolidBounds(capLug)[1][2],
    ] as const,
  };
};

describe('part library', () => {
  it('integrates the rear grip, magazine well, dust cover, and trigger guard into the pistol frame', () => {
    const frame = FAMILIES.frame!.build({ bore: 'S', gripLength: 'M', slideLength: 'S' });
    expect(frame.tags).toContain('firing-grip');
    expect(frame.ports.map((port) => port.id)).toEqual(['slide', 'barrel', 'magazine']);
    expect(frame.solids.map((part) => part.id)).toContain('dust-cover');
    expect(frame.solids.map((part) => part.id)).toContain('trigger-guard-bottom');
    expect(frame.keepOuts.map((keepOut) => keepOut.id)).toContain('trigger-finger');
    expect(frame.ports.find((port) => port.id === 'magazine')!.pos[0]).toBeLessThan(-6);
    const guardTop = frame.solids.find(({ id }) => id === 'trigger-guard-top')!;
    expect(guardTop.kind).toBe('box');
    if (guardTop.kind === 'box') {
      expect(guardTop.box.half[0] * 2).toBeCloseTo(4);
      expect(guardTop.box.half[2] * 2).toBeCloseTo(1.25);
    }
  });

  it('scales the pistol bore channel, slide walls, and dust cover with bore size', () => {
    for (const [bore, radius] of [
      ['S', 0.75],
      ['M', 1],
    ] as const) {
      const slide = FAMILIES.slide!.build({ bore, length: 'S' });
      const frame = FAMILIES.frame!.build({ bore, gripLength: 'M', slideLength: 'S' });
      const left = slide.solids.find(({ id }) => id === 'side-left')!;
      const right = slide.solids.find(({ id }) => id === 'forward-side-right')!;
      const roof = slide.solids.find(({ id }) => id === 'top')!;
      const dustCover = frame.solids.find(({ id }) => id === 'dust-cover')!;
      const barrel = FAMILIES.barrel!.build({ bore, length: 'S', profile: 'pistol' }).solids[0]!;
      expect(barrel.kind).toBe('extruded-polygon');
      expect(left.kind).toBe('box');
      expect(right.kind).toBe('box');
      expect(roof.kind).toBe('box');
      expect(dustCover.kind).toBe('box');
      if (left.kind !== 'box' || right.kind !== 'box' || roof.kind !== 'box' || dustCover.kind !== 'box') {
        throw new Error('Expected pistol slide and frame solids to use boxes.');
      }
      const [barrelMin, barrelMax] = localSolidBounds(barrel);
      const [, , barrelMinZ] = barrelMin;
      const [, , barrelMaxZ] = barrelMax;
      const leftInnerZ = left.box.center[2] + left.box.half[2];
      const leftClearance = barrelMinZ - leftInnerZ;
      const rightClearance = right.box.center[2] - right.box.half[2] - barrelMaxZ;
      expect(leftClearance).toBeCloseTo(0.125);
      expect(rightClearance).toBeCloseTo(0.125);
      expect(leftClearance).toBeLessThan(radius / 2);
      expect(dustCover.box.half[2]).toBeLessThanOrEqual(roof.box.half[2]);
    }
  });

  it('keeps the pistol tang and gives the rebuilt revolver an exposed hammer spur', () => {
    const pistol = FAMILIES.frame!.build({ bore: 'S', gripLength: 'M', slideLength: 'S' });
    const revolver = FAMILIES['revolver-frame']!.build({ bore: 'S', frameSize: 'M', butt: 'round' });
    expect(pistol.solids.some(({ id }) => id === 'beavertail-grip-safety')).toBe(true);
    expect(revolver.solids.some(({ id }) => id === 'exposed-hammer-spur')).toBe(true);
    expect(revolver.keepOuts.some(({ id }) => id === 'hammer-travel')).toBe(true);
  });

  it('builds a hollow pistol slide with ejection port and sight rail', () => {
    const slide = FAMILIES.slide!.build({ bore: 'S', length: 'S' });
    expect(slide.ports.map((port) => port.id)).toEqual(['frame', 'barrel', 'rail']);
    expect(slide.solids.map((part) => part.id)).toContain('ejection-port-upper');
    const barrelChannelOccupied = slide.solids.some((part) => {
      if (part.kind !== 'box') {
        return false;
      }
      const { center, half } = part.box;
      const xRange = [center[0] - half[0], center[0] + half[0]];
      const yRange = [center[1] - half[1], center[1] + half[1]];
      const zRange = [center[2] - half[2], center[2] + half[2]];
      return (
        xRange[1]! > 0 && xRange[0]! < 11 && yRange[1]! > -3.5 && yRange[0]! < -1.5 && zRange[1]! > -1 && zRange[0]! < 1
      );
    });
    expect(barrelChannelOccupied).toBe(false);
  });

  it('limits the pistol barrel crown and offers a muzzle attachment port', () => {
    const barrel = FAMILIES.barrel!.build({ bore: 'S', length: 'S', profile: 'pistol' });
    const tube = barrel.solids[0]!;
    expect(tube.kind).toBe('extruded-polygon');
    expect(localSolidBounds(tube)[1][0]).toBeCloseTo(12);
    expect(barrel.ports.find((port) => port.id === 'muzzle')?.pos[0]).toBe(12);
    expect(barrel.ports.find((port) => port.id === 'frame')?.required).toBe(true);
  });

  it('builds a sectioned revolver frame with one continuous rear bridge, named interfaces, and keep-outs', () => {
    const frame = FAMILIES['revolver-frame']!.build({ bore: 'S', frameSize: 'M', gripLength: 'M', butt: 'round' });
    expect(frame.family).toBe('revolver-frame');
    expect(frame.solids.map((part) => part.id)).toContain('topstrap');
    expect(frame.solids.map((part) => part.id)).toContain('rear-joint');
    expect(frame.solids.map((part) => part.id)).toContain('rear-frame-bridge');
    expect(frame.ports.map((port) => port.id)).toEqual(['barrel', 'cylinder', 'grip-frame', 'hammer', 'trigger-guard']);
    expect(frame.keepOuts.map((volume) => volume.id)).toEqual(['cylinder-swing', 'cylinder-gap', 'hammer-travel']);
  });

  it('joins the grip port to the rear-joint lower face below the cylinder window', () => {
    const frame = FAMILIES['revolver-frame']!.build({ bore: 'M', frameSize: 'M', gripLength: 'M', butt: 'round' });
    const block = frame.solids.find((solid) => solid.id === 'rear-joint')!;
    const gripPort = frame.ports.find((port) => port.id === 'grip-frame')!;
    const [min, max] = localSolidBounds(block);
    expect(gripPort.pos[1]).toBe(min[1]);
    expect(gripPort.pos[0]).toBeGreaterThan(min[0]);
    expect(gripPort.pos[0]).toBeLessThan(max[0]);
    expect(gripPort.pos[1]).toBeLessThan(-3.75);
  });

  it('extends the revolver cylinder and topstrap to a 5.00u window with the original gap', () => {
    const cylinder = FAMILIES['revolver-cylinder']!.build({ chamberCount: '6', chamberIndex: '0' });
    const drum = cylinder.solids.find((solid) => solid.id === 'drum')!;
    const frame = FAMILIES['revolver-frame']!.build({ bore: 'M', frameSize: 'M', gripLength: 'M', butt: 'round' });
    const topstrap = frame.solids.find((solid) => solid.id === 'topstrap')!;
    expect(drum.kind).toBe('extruded-polygon');
    if (drum.kind === 'extruded-polygon') {
      expect(drum.z[1] - drum.z[0]).toBe(5);
    }
    expect(localSolidBounds(topstrap)[0][0]).toBe(-6.25);
    expect(frame.ports.find((port) => port.id === 'cylinder')?.pos[0]).toBe(-2.75);
  });

  it('builds the approved raked grip envelope and distinct rounded/square butt profiles', () => {
    const round = FAMILIES['revolver-grip']!.build({ length: 'M', butt: 'round' });
    const square = FAMILIES['revolver-grip']!.build({ length: 'M', butt: 'square' });
    const roundButt = round.solids.find((solid) => solid.id === 'grip-core-butt')!;
    const squareButt = square.solids.find((solid) => solid.id === 'grip-core-butt')!;
    expect(roundButt.kind).toBe('extruded-polygon');
    expect(squareButt.kind).toBe('extruded-polygon');
    if (roundButt.kind !== 'extruded-polygon' || squareButt.kind !== 'extruded-polygon') {
      throw new Error('revolver grip butt sections must be extruded polygons');
    }
    expect(roundButt.profile).toHaveLength(6);
    expect(squareButt.profile).toHaveLength(4);
    const ordered = (profile: readonly (readonly [number, number])[]) =>
      [...profile].map(([x, y]) => [x, y]).sort((a, b) => a[0]! - b[0]! || a[1]! - b[1]!);
    const localProfile = (id: string) => {
      const solid = round.solids.find((entry) => entry.id === id)!;
      if (solid.kind !== 'extruded-polygon') {
        throw new Error(`${id} must be an extruded polygon`);
      }
      return solid.profile;
    };
    expect(ordered(localProfile('grip-core-neck'))).toEqual(
      ordered([
        [-1.5, 0],
        [1.5, 0],
        [1, -1.5],
        [-3.5, -1.5],
      ]),
    );
    expect(ordered(localProfile('grip-core'))).toEqual(
      ordered([
        [-3.5, -1.5],
        [1, -1.5],
        [0, -4.5],
        [-4.5, -4.5],
      ]),
    );
    expect(ordered(roundButt.profile)).toEqual(
      ordered([
        [-4.5, -4.5],
        [0, -4.5],
        [-0.25, -6.5],
        [-0.75, -7],
        [-5, -7],
        [-5.5, -6.5],
      ]),
    );
    const bounds = round.solids.map(localSolidBounds);
    const envelope = Math.max(...bounds.map((item) => item[1][1])) - Math.min(...bounds.map((item) => item[0][1]));
    expect(envelope).toBe(REVOLVER_PROPORTIONS.gripEnvelopeLengthM.pickedU);
    const bottomY = Math.min(...roundButt.profile.map((point) => point[1]));
    const bottomXs = roundButt.profile.filter((point) => point[1] === bottomY).map((point) => point[0]);
    const bottomX = (Math.min(...bottomXs) + Math.max(...bottomXs)) / 2;
    const rake = (Math.atan2(Math.abs(bottomX), Math.abs(bottomY)) * 180) / Math.PI + 90;
    expect(rake).toBeGreaterThanOrEqual(110);
    expect(rake).toBeLessThanOrEqual(115);
    expect(round.solids.filter((solid) => solid.id.startsWith('grip-panel-'))).toHaveLength(6);
  });

  it('builds named frame height and grip depth into their physical geometry', () => {
    const frame = FAMILIES['revolver-frame']!.build({ bore: 'M', frameSize: 'M', butt: 'round' });
    const strap = frame.solids.find((solid) => solid.id === 'topstrap')!;
    const guardSolids = frame.solids.filter((solid) => solid.id.startsWith('trigger-guard-'));
    const guardBottomY = Math.min(...guardSolids.map((solid) => localSolidBounds(solid)[0][1]));
    const frameHeight = localSolidBounds(strap)[1][1] - guardBottomY;
    expect(frameHeight).toBe(REVOLVER_PROPORTIONS.frameHeight.pickedU);

    const grip = FAMILIES['revolver-grip']!.build({ length: 'M', butt: 'round' });
    const gripBounds = grip.solids.map(localSolidBounds);
    const gripDepth =
      Math.max(...gripBounds.map((bounds) => bounds[1][2])) - Math.min(...gripBounds.map((bounds) => bounds[0][2]));
    expect(gripDepth).toBe(REVOLVER_PROPORTIONS.gripDepth.pickedU);
  });

  it('consumes each named frame-height, visible-wood-height and barrel-length row in geometry', () => {
    const frameHeights = {
      S: REVOLVER_PROPORTIONS.frameHeightS.pickedU,
      M: REVOLVER_PROPORTIONS.frameHeight.pickedU,
      L: REVOLVER_PROPORTIONS.frameHeightL.pickedU,
    } as const;
    const gripHeights = {
      S: REVOLVER_PROPORTIONS.gripEnvelopeLengthS.pickedU,
      M: REVOLVER_PROPORTIONS.gripEnvelopeLengthM.pickedU,
      L: REVOLVER_PROPORTIONS.gripEnvelopeLengthL.pickedU,
    } as const;
    const barrelLengths = {
      S: REVOLVER_PROPORTIONS.barrelLengthS.pickedU,
      M: REVOLVER_PROPORTIONS.barrelLengthM.pickedU,
      L: REVOLVER_PROPORTIONS.barrelLengthL.pickedU,
    } as const;
    for (const size of ['S', 'M', 'L'] as const) {
      const frame = FAMILIES['revolver-frame']!.build({ bore: 'M', frameSize: size, butt: 'round' });
      const guardBottom = Math.min(
        ...frame.solids
          .filter((solid) => solid.id.startsWith('trigger-guard-'))
          .map((solid) => localSolidBounds(solid)[0][1]),
      );
      const strapBounds = localSolidBounds(frame.solids.find((solid) => solid.id === 'topstrap')!);
      expect(strapBounds[1][1] - guardBottom).toBe(frameHeights[size]);
      expect(strapBounds[1][2] - strapBounds[0][2]).toBe(REVOLVER_PROPORTIONS.topstrapWidth.pickedU);

      const grip = FAMILIES['revolver-grip']!.build({ length: size, butt: 'round' });
      const gripBounds = grip.solids.map(localSolidBounds);
      expect(
        Math.max(...gripBounds.map((bounds) => bounds[1][1])) - Math.min(...gripBounds.map((bounds) => bounds[0][1])),
      ).toBe(gripHeights[size]);

      const barrel = FAMILIES['revolver-barrel']!.build({ bore: 'M', length: size, style: 'classic' });
      expect(barrel.ports.find((port) => port.id === 'muzzle')?.pos[0]).toBe(barrelLengths[size]);
    }
    expect(REVOLVER_PROPORTIONS.frameHeightEstimate.pickedU).toBe(8);
    expect(REVOLVER_PROPORTIONS.frameHeight.pickedU).toBe(9);
    expect(REVOLVER_PROPORTIONS.frameHeight.sourceRow).toContain('BR-approved correction');
  });

  it('builds a revolver octagonal barrel with its forcing cone, open underlug, sight and loop port', () => {
    const barrel = FAMILIES['revolver-barrel']!.build({ bore: 'S', length: 'S', style: 'classic' });
    expect(barrel.ports.map((port) => port.id)).toEqual(['frame', 'cylinder', 'muzzle']);
    expect(barrel.solids.map((part) => part.id)).toEqual([
      'forcing-cone',
      'barrel-octagon',
      'top-rib',
      'underlug-roof',
      'underlug-floor',
      'underlug-far-wall',
      'underlug-near-wall',
      'underlug-nose-cap',
      'front-sight',
    ]);
    expect(localSolidBounds(barrel.solids[1]!)[1][0]).toBeCloseTo(7.5);

    const vented = FAMILIES['revolver-barrel']!.build({ bore: 'M', length: 'S', style: 'vented' });
    const posts = vented.solids.filter((solid) => solid.id.startsWith('vented-rib-post-'));
    const intervals = posts.map((solid) => {
      const [min, max] = localSolidBounds(solid);
      return [min[0], max[0]] as const;
    });
    expect(intervals[0]).toEqual([0.5, 1]);
    expect(intervals.at(-1)).toEqual([7, 7.5]);
  });

  it('keeps six chamber positions as data and aligns index zero with the bore', () => {
    const cylinder = FAMILIES['revolver-cylinder']!.build({ chamberCount: '6', chamberIndex: '0' });
    const drum = cylinder.solids.find(({ id }) => id === 'drum');
    expect(drum?.kind).toBe('extruded-polygon');
    expect(cylinder.ports.map((port) => port.id)).toEqual(['frame', 'barrel']);
    const chamberAxis = cylinder.axes.find(({ kind }) => kind === 'bore')!;
    expect(chamberAxis.origin[0]).toBeCloseTo(0, 12);
    expect(chamberAxis.origin[1]).toBeCloseTo(1.25, 12);
    expect(chamberAxis.origin[2]).toBeCloseTo(0, 12);
    expect(FAMILIES['revolver-cylinder']!.params.chamberCount!.values).toEqual(['6']);
    expect(FAMILIES['revolver-cylinder']!.params.chamberIndex!.fault).toEqual(['1', '2', '3', '4', '5']);
  });

  it('uses the measured grip length bands for detached and integrated pistol grips', () => {
    const expected = { S: 7.5, M: 8.5, L: 9.5 };
    for (const size of ['S', 'M', 'L'] as const) {
      const body = FAMILIES.grip!.build({ length: size }).solids[0]!;
      expect(body.kind).toBe('extruded-polygon');
      if (body.kind === 'extruded-polygon') {
        expect(-Math.min(...body.profile.map(([, y]) => y))).toBe(expected[size]);
      }
      const frame = FAMILIES.frame!.build({ bore: 'M', gripLength: size, slideLength: 'M' });
      expect(frame.solids.some(({ id }) => id === 'well-wall-right')).toBe(true);
    }
  });

  it('models the grip as one beveled prism matching its mount face', () => {
    const { solids } = FAMILIES.grip!.build({ length: 'M' });
    expect(solids).toHaveLength(1);
    const [body] = solids;
    expect(body?.kind).toBe('extruded-polygon');
    if (body?.kind === 'extruded-polygon') {
      expect(body.profile).toHaveLength(5);
      expect(body.profile[3]![1]).toBeCloseTo(Math.tan((18 * Math.PI) / 180) * body.profile[3]![0]);
      expect(body.profile[4]![1]).toBeCloseTo(Math.tan((18 * Math.PI) / 180) * body.profile[4]![0]);
    }
  });

  it('adds a bore-fitted clamp ring only when the handguard is joined to the barrel', () => {
    const clamped = FAMILIES.handguard!.build({ length: 'M', inner: 'M', bore: 'M' });
    const floating = FAMILIES.handguard!.build({ length: 'M', inner: 'M', bore: 'none' });
    expect(clamped.solids.map(({ id }) => id)).toContain('clamp-top');
    expect(clamped.solids.map(({ id }) => id)).toContain('clamp-right');
    expect(floating.solids.map(({ id }) => id)).not.toContain('clamp-top');
  });

  it('builds a magazine well into the pistol grip', () => {
    const grip = FAMILIES.grip!.build({ length: 'S', well: 'magazine' });
    expect(grip.ports.map((port) => port.id)).toEqual(['top', 'magazine']);
    expect(grip.keepOuts).toHaveLength(1);
    expect(grip.keepOuts[0]!.allowPort).toBe('magazine');
    expect(grip.solids.map((solid) => solid.id)).toEqual([
      'body-upper',
      'well-wall-left',
      'well-wall-right',
      'well-wall-near',
      'well-wall-far',
    ]);
    const upper = grip.solids.find(({ id }) => id === 'body-upper');
    const frontWall = grip.solids.find(({ id }) => id === 'well-wall-right');
    expect(upper?.kind).toBe('extruded-polygon');
    expect(frontWall?.kind).toBe('box');
    if (upper?.kind !== 'extruded-polygon' || frontWall?.kind !== 'box') {
      throw new Error('Expected the integrated pistol-grip front panel and well wall.');
    }
    const gripFrontX = Math.max(...upper.profile.map(([x]) => x));
    const wellFrontX = frontWall.box.center[0] + frontWall.box.half[0];
    expect(wellFrontX).toBe(gripFrontX);
    const magazine = FAMILIES.magazine!.build({ length: 'S', profile: 'pistol' }).solids[0]!;
    expect(magazine.kind).toBe('box');
    if (magazine.kind === 'box') {
      expect(magazine.box.half[0] * 2).toBeCloseTo(3.5);
      expect(magazine.box.half[1] * 2).toBeCloseTo(6);
      expect(magazine.box.center[1] + magazine.box.half[1]).toBeCloseTo(5.75);
      expect(magazine.box.half[2] * 2).toBeCloseTo(2);
    }
  });

  it('scales the SMG magazine section by 0.6 in X and 0.8 in Z', () => {
    const body = FAMILIES.magazine!.build({ length: 'L', profile: 'smg' }).solids[0]!;
    expect(body.kind).toBe('box');
    if (body.kind === 'box') {
      expect(body.box.half[0] * 2).toBeCloseTo(5.5 * 0.6);
      expect(body.box.half[2] * 2).toBeCloseTo(2.5 * 0.8);
    }
  });

  // Each case checks only the PartDef that `build(params)` returns: grid alignment, orthonormal
  // ports, unique port ids and positive box sizes. No rules or geometry checks run.
  const definePartChecks = (family: PartFamily, cases: Record<string, string>[], batchSize = 1): void => {
    let gridStep = GRID;
    if (family.name === 'forend') {
      gridStep = GRID / 5;
    } else if (['frame', 'slide', 'front-sight', 'rail-front-sight'].includes(family.name)) {
      gridStep = GRID / 2;
    }
    const check = (params: Record<string, string>) => {
      const def = family.build(params);
      const bounds = (box: { center: readonly number[]; half: readonly number[] }) =>
        box.center.flatMap((center, axis) => [center - box.half[axis]!, center + box.half[axis]!]);
      // Guard geometry preserves the pistol golden and exact contact with angled grips; it has its own geometry tests.
      // Explicit metal handle parts use sub-grid clearances; their ownership, contact and motion have dedicated geometry tests.
      const explicitCarrierStyle = family.name === 'bolt-carrier' && params.handleStyle !== undefined;
      const numbers = [
        ...def.solids.flatMap((s) =>
          s.kind === 'box' &&
          !s.id.startsWith('trigger-guard-') &&
          !(family.name === 'magazine' && params.profile === 'smg') &&
          !(explicitCarrierStyle && s.slot === 'metal')
            ? bounds(s.box)
            : [],
        ),
        ...def.keepOuts.flatMap((k) =>
          explicitCarrierStyle && k.id.startsWith(`${params.handleStyle}-handle-`) ? [] : bounds(k.box),
        ),
        ...def.ports.flatMap((p) => [...p.pos, p.slots?.pitch ?? 0]),
        ...def.axes
          .filter((axis) => family.name !== 'revolver-cylinder' || axis.kind !== 'bore')
          .flatMap((axis) => [...axis.origin]),
      ];
      return {
        geometryOnGrid: numbers.every((n) => onGridWithCarrierClearance(n, gridStep, family)),
        portsOrthonormal: def.ports.every(
          (p) =>
            Math.abs(length(p.normal) - 1) < 1e-6 &&
            Math.abs(length(p.up) - 1) < 1e-6 &&
            Math.abs(dot(p.normal, p.up)) < 1e-6 &&
            Math.abs(length(cross(p.normal, p.up)) - 1) < 1e-6,
        ),
        uniquePortIds: new Set(def.ports.map((p) => p.id)).size === def.ports.length,
        positiveBoxSizes: def.solids.every((s) => s.kind !== 'box' || s.box.half.every((h) => h > 0)),
      };
    };
    const expected = {
      geometryOnGrid: true,
      portsOrthonormal: true,
      uniquePortIds: true,
      positiveBoxSizes: true,
    };

    if (batchSize === 1) {
      for (const params of cases) {
        const tag = JSON.stringify(params);
        it(`${tag}: geometry and port definitions are valid on the ${gridStep}u grid`, () => {
          expect(check(params), tag).toEqual(expected);
        });
      }
      return;
    }

    for (let start = 0; start < cases.length; start += batchSize) {
      const batch = cases.slice(start, start + batchSize);
      // 256 builds take under 1 s on the reference host; 10 s is ~10x measured and bounds the full sweep.
      it(`cases ${start}-${start + batch.length - 1}: geometry and port definitions are valid on the ${gridStep}u grid`, () => {
        for (const params of batch) {
          expect(check(params), JSON.stringify(params)).toEqual(expected);
        }
      }, 10_000);
    }
  };

  it('retains every receiver section in the default 3-wise sample', () => {
    const receiver = FAMILIES.receiver!;
    const sections = new Set(defaultCases('receiver', receiver).map(({ section }) => section));
    expect([...sections].sort()).toEqual([...receiver.params.section!.values].sort());
  });

  for (const [key, family] of Object.entries(FAMILIES)) {
    describe(key, () => {
      const cases = defaultCases(key, family);
      if (key === 'bolt-carrier') {
        const compatible = compatibleHandleStyleCases();
        it('retains every compatible handle-style pairing across all sections', () => {
          for (const pairing of CARRIER_HANDLE_PAIRINGS) {
            for (const section of family.params.section!.values) {
              expect(
                compatible.some(
                  (entry) =>
                    entry.handleStyle === pairing.style &&
                    entry.pattern === pairing.pattern &&
                    entry.section === section,
                ),
                `${pairing.style}/${pairing.pattern}/${pairing.owner} in ${section}`,
              ).toBe(true);
            }
          }
        });
        cases.push(...compatible);
      }
      definePartChecks(family, cases);
    });
  }

  // The exhaustive product for the families the default run samples with a covering array.
  sweepGroup('full parameter product of the array-sampled families', () => {
    for (const [key, family] of Object.entries(FAMILIES).filter(([k]) => isArraySampled(k))) {
      describe(key, () => {
        // A skipped group still registers its cases, so build none in the default run.
        // Batch exhaustive cases to cap Vitest registration memory; failures retain the exact params.
        definePartChecks(family, runSweeps ? fullProduct(withoutHandleStyle(family)) : [], 256);
      });
    }
  });
});

describe('tapered stock profile', () => {
  const profile = (stockSize: 'M' | 'L') => {
    const def = FAMILIES.stock!.build({ length: stockSize, style: 'tapered' });
    const solids = def.solids.filter((solid) => solid.kind === 'extruded-polygon');
    const byId = (id: string) => {
      const solid = solids.find((candidate) => candidate.id === id);
      if (solid?.kind !== 'extruded-polygon') {
        throw new Error(`missing profile ${id}`);
      }
      return solid;
    };
    const [jointX] = def.ports.find((port) => port.id === 'front')!.pos;
    const stockLength = jointX - Math.min(...byId('butt-pad').profile.map(([x]) => x));
    return { def, solids, byId, jointX, stockLength };
  };
  const segmentSection = (profilePoints: readonly (readonly [number, number])[], x: number): number[] => {
    const ys: number[] = [];
    for (let i = 0; i < profilePoints.length; i++) {
      const a = profilePoints[i]!;
      const b = profilePoints[(i + 1) % profilePoints.length]!;
      if (x < Math.min(a[0], b[0]) - 1e-8 || x > Math.max(a[0], b[0]) + 1e-8) {
        continue;
      }
      if (Math.abs(a[0] - b[0]) < 1e-8) {
        if (Math.abs(x - a[0]) < 1e-8) {
          ys.push(a[1], b[1]);
        }
        continue;
      }
      const t = (x - a[0]) / (b[0] - a[0]);
      ys.push(a[1] + t * (b[1] - a[1]));
    }
    return ys;
  };
  const section = (solids: ReturnType<typeof profile>['solids'], x: number) => {
    const ys = solids.flatMap((solid) => segmentSection(solid.profile, x));
    return { min: Math.min(...ys), max: Math.max(...ys), height: Math.max(...ys) - Math.min(...ys) };
  };
  const degrees = (dx: number, dy: number) => (Math.atan2(Math.abs(dy), Math.abs(dx)) * 180) / Math.PI;

  for (const size of ['M', 'L'] as const) {
    it(`${size}: extruded stock profiles are valid`, () => {
      for (const solid of profile(size).solids) {
        expect(validateExtrudedPolygon(solid.profile, solid.z)).toBeUndefined();
      }
    });

    it(`${size}: comb starts at the built receiver rear-face centre`, () => {
      const { def, solids, jointX } = profile(size);
      const receiver = FAMILIES.receiver!.build({ action: 'pump', feed: 'tube', bore: 'L', rail: 'full' });
      const bodyY = receiver.solids.flatMap((solid) => {
        if (solid.kind !== 'box' || !solid.id.startsWith('receiver-shell-')) {
          return [];
        }
        return [solid.box.center[1] - solid.box.half[1], solid.box.center[1] + solid.box.half[1]];
      });
      const minY = Math.min(...bodyY);
      const maxY = Math.max(...bodyY);
      const centerY = (minY + maxY) / 2;
      const halfY = (maxY - minY) / 2;
      const [, stockPortY] = receiver.ports.find((port) => port.id === 'stock')!.pos;
      const rearFaceTopY = centerY + halfY;
      const combAtJoint = section(solids, jointX).max + stockPortY;
      expect(Math.abs(combAtJoint - centerY)).toBeLessThanOrEqual(0.25);
      expect(def.ports.find((port) => port.id === 'front')?.pos).toEqual([0, 0, 0]);
      expect(rearFaceTopY - combAtJoint).toBeCloseTo(halfY, 5);
    });

    it(`${size}: wrist, grip station/depth, and comb slope stay in their landmark bounds`, () => {
      const { byId, solids, jointX, stockLength } = profile(size);
      const grip = byId('grip');
      const wristX = Math.max(...grip.profile.map(([x]) => x));
      const wrist = section(solids, wristX);
      expect((jointX - wristX) / stockLength).toBeGreaterThanOrEqual(0.1);
      expect((jointX - wristX) / stockLength).toBeLessThanOrEqual(0.25);
      expect(wrist.height / stockLength).toBeGreaterThanOrEqual(0.15);
      expect(wrist.height / stockLength).toBeLessThanOrEqual(0.22);

      const lowest = grip.profile.reduce((best, point) => (point[1] < best[1] ? point : best));
      const depth = section(solids, lowest[0]).max - lowest[1];
      expect((jointX - lowest[0]) / stockLength).toBeGreaterThanOrEqual(0.18);
      expect((jointX - lowest[0]) / stockLength).toBeLessThanOrEqual(0.3);
      expect(depth / stockLength).toBeGreaterThanOrEqual(0.24);
      expect(depth / stockLength).toBeLessThanOrEqual(0.32);
    });

    it(`${size}: belly, butt and recoil pad meet their bounds`, () => {
      const { byId, stockLength } = profile(size);
      const belly = byId('belly');
      const pad = byId('butt-pad');
      const toe = belly.profile[0]!;
      const bellyRear = belly.profile[1]!;
      const bellyAngle = degrees(toe[0] - bellyRear[0], toe[1] - bellyRear[1]);
      expect(bellyAngle).toBeGreaterThanOrEqual(10);
      expect(bellyAngle).toBeLessThanOrEqual(16);

      const padYs = pad.profile.map(([, y]) => y);
      const padMinY = Math.min(...padYs);
      const padMaxY = Math.max(...padYs);
      expect((padMaxY - padMinY) / stockLength).toBeGreaterThanOrEqual(0.3);
      expect((padMaxY - padMinY) / stockLength).toBeLessThanOrEqual(0.38);
      const rearBottom = pad.profile.filter(([, y]) => y === padMinY).sort((a, b) => a[0] - b[0])[0]!;
      const rearTop = pad.profile.filter(([, y]) => y === padMaxY).sort((a, b) => a[0] - b[0])[0]!;
      const rake =
        (Math.atan2(Math.abs(rearTop[0] - rearBottom[0]), Math.abs(rearTop[1] - rearBottom[1])) * 180) / Math.PI;
      expect(rake).toBeLessThanOrEqual(8);
      const bottomXs = pad.profile
        .filter(([, y]) => y === padMinY)
        .map(([x]) => x)
        .sort((a, b) => a - b);
      const topXs = pad.profile
        .filter(([, y]) => y === padMaxY)
        .map(([x]) => x)
        .sort((a, b) => a - b);
      const padThickness = Math.min(bottomXs[1]! - bottomXs[0]!, topXs[1]! - topXs[0]!) / stockLength;
      expect(padThickness).toBeGreaterThanOrEqual(0.05);
      expect(padThickness).toBeLessThanOrEqual(0.08);
    });
  }
});

describe('pump stock raised butt heel', () => {
  const baselineToeY = { M: -7.518_598_945_248, L: -10.351_249_252_97 } as const;
  const measure = (size: 'M' | 'L') => {
    const def = FAMILIES.stock!.build({ length: size, style: 'tapered' });
    const prism = def.solids.find((solid) => solid.id === 'belly');
    const pad = def.solids.find((solid) => solid.id === 'butt-pad');
    if (prism?.kind !== 'extruded-polygon' || pad?.kind !== 'extruded-polygon') {
      throw new Error('tapered stock must have a belly prism and recoil pad');
    }
    const padYs = pad.profile.map(([, y]) => y);
    const toeY = Math.min(...padYs);
    const topY = Math.max(...padYs);
    const rearBottom = prism.profile.find(([, y]) => y === toeY)!;
    const rearTop = prism.profile.find(([, y]) => y === topY)!;
    const [jointX] = def.ports.find((port) => port.id === 'front')!.pos;
    const stockLength = jointX - Math.min(...pad.profile.map(([x]) => x));
    return { pad, rearBottom, rearTop, stockLength, toeY, topY };
  };

  for (const size of ['M', 'L'] as const) {
    it(`${size}: raises only the rear top by 5% and preserves the rear toe`, () => {
      const result = measure(size);
      const oldHeight = 0.34 * result.stockLength;
      const newHeight = result.rearTop[1] - result.rearBottom[1];
      const ratio = newHeight / oldHeight;
      expect(ratio).toBeGreaterThanOrEqual(1.045);
      expect(ratio).toBeLessThanOrEqual(1.055);
      expect(Math.abs(result.rearBottom[1] - baselineToeY[size])).toBeLessThanOrEqual(1e-9);
      expect(result.topY).toBe(result.rearTop[1]);
      expect(result.toeY).toBe(result.rearBottom[1]);
    });
  }
});

describe('pump shotgun tube and barrel contact', () => {
  it('builds a watertight near-complete tubular forend with a narrow top slit', () => {
    const forend = FAMILIES.forend!.build({});
    expect(forend.solids).toHaveLength(7);
    for (const component of forend.solids) {
      if (component.kind !== 'extruded-polygon' || component.axis !== 'x') {
        throw new Error('pump forend shell facets must be X-axis polygon extrusions');
      }
      expect(component.z).toEqual([0, 9.6]);
      expect(component.profile).toHaveLength(4);
      expectWatertightMesh(meshForSolid(component), `forend ${component.id}`);
    }
    const topSlitFacets = forend.solids.filter(
      (component) => component.kind === 'extruded-polygon' && component.profile.some(([y, z]) => Math.abs(y - 1.45) < 1e-8 && Math.abs(Math.abs(z) - 0.1) < 1e-8),
    );
    expect(topSlitFacets).toHaveLength(2);
    const tube = FAMILIES['tube-magazine']!.build({ bore: 'L', barrelLength: 'M', lengthPercent: '75' });
    expect(tube.ports.find((port) => port.id === 'forend')?.pos).toEqual([8, 0, 0]);
    expect(tube.keepOuts.find(({ id }) => id === 'forend-travel')?.box.half[0]).toBe(2.75);
    expect(forend.motion).toMatchObject({ axis: [-1, 0, 0], end: [0, 0, 0] });
  });

  it('sizes tube reach as a percentage of the actual barrel and aligns its lug/support ports', () => {
    for (const [barrelClass, barrelEnd, supportX] of [
      ['S', 26, 17],
      ['M', 36, 23.5],
      ['L', 46, 30],
    ] as const) {
      for (const [lengthPercent, tubeEnd] of [
        ['50', barrelEnd / 2],
        ['75', (barrelEnd * 3) / 4],
        ['100', barrelEnd],
      ] as const) {
        const dimensions = pumpTubeDimensions({ bore: 'L', barrelClass, lengthPercent });
        expect(dimensions.tubeEnd).toBe(tubeEnd);
        expect(dimensions.tubeBodyEnd).toBe(tubeEnd - 0.5);
        expect(dimensions.tubeEnd).toBeLessThanOrEqual(barrelEnd);
        expect(dimensions.barrelLug).toBe(tubeEnd);
        expect(dimensions.barrelSupportLug).toBe(tubeEnd > supportX ? supportX : undefined);
        expect(dimensions.tubeSupport).toBe(tubeEnd > supportX ? supportX : undefined);
        expect(dimensions.tubeCap).toBe(tubeEnd);
        expect(dimensions.capBounds).toEqual([tubeEnd - 2.5, tubeEnd, -1.25, 1.25, -1.25, 1.25]);
      }
    }
  });

  it('keeps a 0.5u barrel-to-tube gap for every bore size', () => {
    for (const [bore, tubeDrop] of [
      ['S', 2.25],
      ['M', 2.5],
      ['L', 2.75],
    ] as const) {
      const dimensions = pumpTubeDimensions({ bore, barrelClass: 'M', lengthPercent: '75' });
      expect(dimensions.barrelLugY).toBe(-tubeDrop);
      expect(dimensions.capBounds.slice(2, 4)).toEqual([-1.25, 1.25]);

      const receiver = FAMILIES.receiver!.build({ action: 'pump', feed: 'tube', bore, rail: 'full' });
      expect(receiver.ports.find((port) => port.id === 'tube')?.pos[1]).toBe(-tubeDrop);
    }
  });

  it('keeps the bore centered while the receiver edges closely contain the barrel and tube', () => {
    const receiver = FAMILIES.receiver!.build({ action: 'pump', feed: 'tube', bore: 'L', rail: 'full' });
    const bodyY = receiver.solids.flatMap((solid) => {
      if (solid.kind !== 'box' || !solid.id.startsWith('receiver-shell-')) {
        return [];
      }
      return [solid.box.center[1] - solid.box.half[1], solid.box.center[1] + solid.box.half[1]];
    });
    const bodyBottom = Math.min(...bodyY);
    const bodyTop = Math.max(...bodyY);
    const barrelPort = receiver.ports.find((port) => port.id === 'barrel')!;
    const tubePort = receiver.ports.find((port) => port.id === 'tube')!;
    const tubeSeat = receiver.solids.find((solid) => solid.id === 'tube-seat');
    if (tubeSeat?.kind !== 'box') {
      throw new Error('pump receiver must provide a tube seat');
    }
    const tubeSeatBottom = tubeSeat.box.center[1] - tubeSeat.box.half[1];
    const lowerPort = receiver.ports.find((port) => port.id === 'lower')!;
    expect(barrelPort.pos[1]).toBe(0);
    expect(receiver.axes[0]?.origin[1]).toBe(0);
    expect(bodyTop - (barrelPort.pos[1] + 1.25)).toBeCloseTo(0.25);
    expect(tubePort.pos[1] - 1 - tubeSeatBottom).toBeCloseTo(0.25);
    expect(lowerPort.pos[1]).toBe(bodyBottom);
  });

  for (const bore of ['S', 'M', 'L']) {
    it(`bore ${bore}: the tube reaches the barrel lug without a contact gap`, () => {
      const assembly = variant('archetype-pump-shotgun', (draft) => {
        draft.parts.receiver!.params!.bore = bore;
      });
      const report = validate(assembly, gunDomain);
      expect(report.issues).toEqual([]);
      expect(report.ok).toBe(true);
    });
  }
});
