import { describe, expect, it } from 'vitest';
import { SIZE_CLASSES } from '../src/core/conventions.ts';
import { localSolidBounds, validateExtrudedPolygon } from '../src/core/geometry.ts';
import { resolve } from '../src/core/resolve.ts';
import type { PartDef, PartFamily, Solid } from '../src/core/schema.ts';
import { SHROUD_HALF_HEIGHT, SHROUD_HALF_WIDTH, SHROUD_LENGTH } from '../src/gun/antiMateriel/barrelShroud.ts';
import { BIPOD_LEG_LENGTH } from '../src/gun/antiMateriel/bipod.ts';
import { RECOIL_STOCK_LENGTH } from '../src/gun/antiMateriel/recoilStock.ts';
import { gunDomain } from '../src/gun/domain.ts';
import { FAMILIES } from '../src/gun/parts.ts';
import { variant } from './helpers.ts';

const family = (key: string): PartFamily => FAMILIES[key]!;
const solidById = (def: PartDef, id: string): Solid => {
  const found = def.solids.find((solid) => solid.id === id);
  if (!found) {
    throw new Error(`${def.family} has no solid ${id}`);
  }
  return found;
};
const bounds = (solid: Solid) => {
  const [min, max] = localSolidBounds(solid);
  return { min, max };
};
const PROFILES = ['standard', 'heavy', 'pistol', 'revolver'] as const;

describe('anti-materiel vocabulary', () => {
  it('registers each family under its own key; the recoil stock plays the stock role', () => {
    const roles = Object.fromEntries(
      ['muzzle-brake', 'barrel-shroud', 'bipod', 'carry-handle', 'recoil-stock', 'monopod'].map((key) => [
        key,
        family(key).build(
          Object.fromEntries(Object.entries(family(key).params).map(([name, spec]) => [name, spec.default])),
        ).family,
      ]),
    );
    expect(roles).toEqual({
      'muzzle-brake': 'muzzle-brake',
      'barrel-shroud': 'barrel-shroud',
      bipod: 'bipod',
      'carry-handle': 'carry-handle',
      'recoil-stock': 'stock',
      monopod: 'monopod',
    });
  });
});

describe('muzzle brake', () => {
  it('shoulders the barrel for every bore and profile', () => {
    for (const bore of SIZE_CLASSES) {
      for (const profile of PROFILES) {
        const barrel = family('barrel').build({ bore, length: 'M', profile });
        const brake = family('muzzle-brake').build({ bore, profile, length: 'M' });
        const [, tubeHalf] = bounds(barrel.solids[0]!).max;
        expect(bounds(solidById(brake, 'collar')).max[1], `${bore} ${profile}`).toBeCloseTo(tubeHalf + 0.25);
      }
    }
  });

  it('has a collar, a core and two chambers per wing, split by a 0.5u vent slot', () => {
    for (const length of SIZE_CLASSES) {
      const brake = family('muzzle-brake').build({ bore: 'L', profile: 'standard', length });
      expect(brake.solids.map(({ id }) => id).sort()).toEqual([
        'collar',
        'core',
        'front-chamber-left',
        'front-chamber-right',
        'rear-chamber-left',
        'rear-chamber-right',
      ]);
      const rear = bounds(solidById(brake, 'rear-chamber-right'));
      const front = bounds(solidById(brake, 'front-chamber-right'));
      expect(front.min[0] - rear.max[0], length).toBeCloseTo(0.5);
      expect(bounds(solidById(brake, 'core')).max[0]).toBeCloseTo(front.max[0]);
    }
  });

  it('is an arrowhead in plan: the wings are widest at the barrel and narrow toward the nose', () => {
    const brake = family('muzzle-brake').build({ bore: 'L', profile: 'standard', length: 'L' });
    const reach = (id: string) => bounds(solidById(brake, id)).max[2];
    expect(reach('rear-chamber-right')).toBeGreaterThan(reach('front-chamber-right'));
    expect(-bounds(solidById(brake, 'rear-chamber-left')).min[2]).toBeCloseTo(reach('rear-chamber-right'));
    expect(reach('front-chamber-right')).toBeGreaterThan(bounds(solidById(brake, 'core')).max[2]);
  });

  it('builds only valid convex extrusions', () => {
    for (const bore of SIZE_CLASSES) {
      for (const length of SIZE_CLASSES) {
        for (const solid of family('muzzle-brake').build({ bore, profile: 'heavy', length }).solids) {
          if (solid.kind === 'extruded-polygon') {
            expect(validateExtrudedPolygon(solid.profile, solid.z, solid.axis, solid.clip), solid.id).toBeUndefined();
          }
        }
      }
    }
  });

  it('takes its bore and profile from the barrel it is threaded on', () => {
    const assembly = variant('archetype-anti-materiel', (draft) => {
      draft.parts.receiver!.params!.bore = 'M';
      draft.parts.barrel!.params!.profile = 'heavy';
    });
    const { params } = resolve(assembly, gunDomain);
    expect(params.get('brake')!.bore).toMatchObject({ value: 'M', source: 'inherited', from: 'barrel.bore' });
    expect(params.get('brake')!.profile).toMatchObject({ value: 'heavy', source: 'inherited', from: 'barrel.profile' });
  });
});

describe('barrel shroud', () => {
  it('continues the receiver front face at the same height and width', () => {
    const receiver = family('receiver').build({ action: 'auto', feed: 'box', bore: 'L', section: 'standard' });
    const frontFace = receiver.solids.filter((solid) => localSolidBounds(solid)[1][0] === 0);
    const halfHeight = Math.max(...frontFace.map((solid) => localSolidBounds(solid)[1][1]));
    const halfWidth = Math.max(...frontFace.map((solid) => localSolidBounds(solid)[1][2]));
    expect([SHROUD_HALF_HEIGHT, SHROUD_HALF_WIDTH]).toEqual([halfHeight, halfWidth]);
    for (const length of SIZE_CLASSES) {
      const shroud = family('barrel-shroud').build({ length });
      const extent = (axis: 1 | 2) => Math.max(...shroud.solids.map((solid) => localSolidBounds(solid)[1][axis]));
      expect([extent(1), extent(2)]).toEqual([halfHeight, halfWidth]);
    }
  });

  it('keeps the perforations out of the solids: they are dark panels in displaySolids only', () => {
    for (const length of SIZE_CLASSES) {
      const shroud = family('barrel-shroud').build({ length });
      const display = shroud.displaySolids ?? [];
      const panels = display.filter(({ id }) => id.startsWith('perforation-'));
      expect(shroud.solids.some(({ id }) => id.startsWith('perforation-'))).toBe(false);
      expect(display.filter(({ id }) => !id.startsWith('perforation-'))).toEqual(shroud.solids);
      // Two rows of holes on each side, one every 2u from 2.5u in from either end.
      expect(panels).toHaveLength(2 * 2 * (Math.floor((SHROUD_LENGTH[length] - 5) / 2) + 1));
      for (const panel of panels) {
        expect(panel).toMatchObject({ material: 'rubber-black', display: { bevel: false, outline: false } });
        const { min, max } = bounds(panel);
        expect(Math.min(Math.abs(min[2]), Math.abs(max[2]))).toBeCloseTo(SHROUD_HALF_WIDTH);
        expect(max[0]).toBeLessThan(SHROUD_LENGTH[length]);
      }
    }
  });

  it('extends the top rail and hangs the bipod mount near the front', () => {
    for (const length of SIZE_CLASSES) {
      const shroud = family('barrel-shroud').build({ length });
      const rail = shroud.ports.find(({ id }) => id === 'rail')!;
      expect(rail.slots).toEqual({ count: (SHROUD_LENGTH[length] - 4) / 2 + 1, pitch: 2 });
      const bipod = shroud.ports.find(({ id }) => id === 'bipod')!;
      expect(bipod.pos).toEqual([SHROUD_LENGTH[length] - 3, -SHROUD_HALF_HEIGHT, 0]);
      expect(bipod.normal).toEqual([0, -1, 0]);
    }
  });
});

describe('bipod', () => {
  it('reaches its leg length below the mount when deployed, and lies back that far when folded', () => {
    for (const legs of SIZE_CLASSES) {
      const reach = BIPOD_LEG_LENGTH[legs];
      const deployed = family('bipod').build({ legs, pose: 'deployed' });
      const folded = family('bipod').build({ legs, pose: 'folded' });
      expect(Math.min(...deployed.solids.map((s) => bounds(s).min[1]))).toBeCloseTo(-reach);
      expect(Math.min(...folded.solids.map((s) => bounds(s).min[0]))).toBeCloseTo(-reach);
    }
  });

  it('sweeps its legs through a keep-out that holds both poses', () => {
    for (const legs of SIZE_CLASSES) {
      for (const pose of ['folded', 'deployed']) {
        const bipod = family('bipod').build({ legs, pose });
        const sweep = bipod.keepOuts.find(({ id }) => id === 'leg-sweep')!;
        const lo = sweep.box.center.map((c, axis) => c - sweep.box.half[axis]!);
        const hi = sweep.box.center.map((c, axis) => c + sweep.box.half[axis]!);
        for (const solid of bipod.solids.filter(({ id }) => id !== 'mount-block')) {
          const { min, max } = bounds(solid);
          expect([min[0] >= lo[0]!, min[1] >= lo[1]!, min[2] >= lo[2]!, max[0] <= hi[0]!, max[2] <= hi[2]!]).toEqual([
            true,
            true,
            true,
            true,
            true,
          ]);
        }
      }
    }
  });
});

describe('carry handle', () => {
  it('stands outside the line of sight and keeps its bar above it', () => {
    const sightline = family('sight')
      .build({})
      .keepOuts.find(({ id }) => id === 'sightline')!;
    const [, , sightHalfWidth] = sightline.box.half;
    const sightTop = sightline.box.center[1] + sightline.box.half[1];
    const handle = family('carry-handle').build({});
    for (const post of handle.solids.filter(({ id }) => id.startsWith('post-'))) {
      const { min, max } = bounds(post);
      expect(Math.min(Math.abs(min[2]), Math.abs(max[2]))).toBeGreaterThan(sightHalfWidth);
    }
    expect(bounds(solidById(handle, 'grip-bar')).min[1]).toBeGreaterThanOrEqual(sightTop);
  });

  it('keeps room for a hand between the posts', () => {
    const handle = family('carry-handle').build({});
    const room = handle.keepOuts.find(({ id }) => id === 'hand-room')!;
    expect(room.box.half[0]).toBeGreaterThanOrEqual(2.5);
    for (const solid of handle.solids) {
      const { min, max } = bounds(solid);
      const inside = [0, 1, 2].every(
        (axis) =>
          Math.min(max[axis]!, room.box.center[axis]! + room.box.half[axis]!) -
            Math.max(min[axis]!, room.box.center[axis]! - room.box.half[axis]!) >
          1e-9,
      );
      expect(inside, solid.id).toBe(false);
    }
  });
});

describe('recoil stock and monopod', () => {
  it('has a flat pad wider than the shared stock butt, and is not a firing grip', () => {
    for (const length of SIZE_CLASSES) {
      const stock = family('recoil-stock').build({ length });
      const pad = bounds(solidById(stock, 'recoil-pad'));
      const sharedButt = bounds(solidById(family('stock').build({ length, style: 'straight' }), 'butt'));
      expect(pad.max[2] - pad.min[2]).toBeGreaterThan(1.5 * (sharedButt.max[2] - sharedButt.min[2]));
      expect(pad.max[0]).toBeCloseTo(-RECOIL_STOCK_LENGTH[length]);
      expect(stock.tags).toBeUndefined();
      expect(solidById(stock, 'recoil-pad')).toMatchObject({ material: 'rubber-black', slot: 'accent' });
    }
  });

  it('mounts the monopod on its underside, and a deployed monopod reaches below the pad', () => {
    const stock = family('recoil-stock').build({ length: 'L' });
    const mount = stock.ports.find(({ id }) => id === 'monopod')!;
    const [, bodyBottom] = bounds(solidById(stock, 'body')).min;
    expect(mount.pos[1]).toBe(bodyBottom);
    const [, padBottom] = bounds(solidById(stock, 'recoil-pad')).min;
    const reach = (pose: string) =>
      Math.min(
        ...family('monopod')
          .build({ pose })
          .solids.map((solid) => bounds(solid).min[1]),
      );
    expect(mount.pos[1] + reach('deployed')).toBeLessThan(padBottom);
    expect(mount.pos[1] + reach('folded')).toBeGreaterThan(padBottom);
  });
});
