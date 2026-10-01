import { describe, expect, it } from 'vitest';
import { localSolidBounds } from '../src/core/geometry.ts';
import { resolve } from '../src/core/resolve.ts';
import type { PartDef, PartFamily, Solid } from '../src/core/schema.ts';
import { SHROUD_HALF_HEIGHT, SHROUD_HALF_WIDTH, SHROUD_LENGTH } from '../src/gun/antiMateriel/barrelShroud.ts';
import { BIPOD_LEG_LENGTH } from '../src/gun/antiMateriel/bipod.ts';
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

describe('registration', () => {
  it('gives the recoil stock the stock role, so the palette and the stock rules treat it as a stock', () => {
    expect(family('recoil-stock').build({}).family).toBe('stock');
  });
});

describe('muzzle brake', () => {
  // The brake rebuilds the barrel's flat radius from its params; the heavy profile rounds 1.5x up to the 0.25u grid.
  it.each([
    ['L', 'standard'],
    ['S', 'heavy'],
    ['L', 'heavy'],
  ])('shoulders a %s-bore %s barrel: the collar is 0.25u wider than the barrel section', (bore, profile) => {
    const barrel = family('barrel').build({ bore, length: 'M', profile });
    const brake = family('muzzle-brake').build({ bore, profile, length: 'M' });
    const [, tubeHalf] = bounds(barrel.solids[0]!).max;
    expect(bounds(solidById(brake, 'collar')).max[1]).toBeCloseTo(tubeHalf + 0.25);
  });

  it('has two chambers per wing, split by a 0.5u vent slot, ending at the core nose', () => {
    const brake = family('muzzle-brake').build({ bore: 'L', profile: 'standard', length: 'L' });
    const rear = bounds(solidById(brake, 'rear-chamber-right'));
    const front = bounds(solidById(brake, 'front-chamber-right'));
    expect(front.min[0] - rear.max[0]).toBeCloseTo(0.5);
    expect(bounds(solidById(brake, 'core')).max[0]).toBeCloseTo(front.max[0]);
  });

  it('is an arrowhead in plan: both wings are widest at the barrel and narrow toward the nose', () => {
    const brake = family('muzzle-brake').build({ bore: 'L', profile: 'standard', length: 'L' });
    const reach = (id: string) => bounds(solidById(brake, id)).max[2];
    expect(reach('rear-chamber-right')).toBeGreaterThan(reach('front-chamber-right'));
    expect(reach('front-chamber-right')).toBeGreaterThan(bounds(solidById(brake, 'core')).max[2]);
    expect(-bounds(solidById(brake, 'rear-chamber-left')).min[2]).toBeCloseTo(reach('rear-chamber-right'));
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

  it('refuses a pistol barrel: this is a rifle brake', () => {
    const assembly = variant('archetype-anti-materiel', (draft) => {
      draft.parts.barrel!.params!.profile = 'pistol';
    });
    const { issues } = resolve(assembly, gunDomain);
    expect(issues.map(({ message }) => message)).toContainEqual(expect.stringContaining('profile would come from'));
  });
});

describe('barrel shroud', () => {
  it('continues the receiver front face at the same height and width', () => {
    const receiver = family('receiver').build({ action: 'auto', feed: 'box', bore: 'L', section: 'standard' });
    const frontFace = receiver.solids.filter((solid) => localSolidBounds(solid)[1][0] === 0);
    const halfHeight = Math.max(...frontFace.map((solid) => localSolidBounds(solid)[1][1]));
    const halfWidth = Math.max(...frontFace.map((solid) => localSolidBounds(solid)[1][2]));
    expect([SHROUD_HALF_HEIGHT, SHROUD_HALF_WIDTH]).toEqual([halfHeight, halfWidth]);
    const shroud = family('barrel-shroud').build({ length: 'L' });
    const extent = (axis: 1 | 2) => Math.max(...shroud.solids.map((solid) => localSolidBounds(solid)[1][axis]));
    expect([extent(1), extent(2)]).toEqual([halfHeight, halfWidth]);
  });

  it('keeps the perforations out of the solids: they are dark panels in displaySolids only', () => {
    const shroud = family('barrel-shroud').build({ length: 'L' });
    const display = shroud.displaySolids ?? [];
    const panels = display.filter(({ id }) => id.startsWith('perforation-'));
    expect(shroud.solids.some(({ id }) => id.startsWith('perforation-'))).toBe(false);
    expect(display.filter(({ id }) => !id.startsWith('perforation-'))).toEqual(shroud.solids);
    // Two rows of holes on each side, one every 2u from 2.5u in from either end.
    expect(panels).toHaveLength(2 * 2 * (Math.floor((SHROUD_LENGTH.L! - 5) / 2) + 1));
    for (const panel of panels) {
      expect(panel).toMatchObject({ material: 'rubber-black', display: { bevel: false, outline: false } });
      const { min, max } = bounds(panel);
      expect(Math.min(Math.abs(min[2]), Math.abs(max[2]))).toBeCloseTo(SHROUD_HALF_WIDTH);
    }
  });

  it('extends the top rail forward and hangs the bipod mount on the underside near the front', () => {
    const shroud = family('barrel-shroud').build({ length: 'M' });
    expect(shroud.ports.find(({ id }) => id === 'rail')!.slots).toEqual({
      count: (SHROUD_LENGTH.M! - 4) / 2 + 1,
      pitch: 2,
    });
    const bipod = shroud.ports.find(({ id }) => id === 'bipod')!;
    expect([bipod.pos, bipod.normal]).toEqual([
      [SHROUD_LENGTH.M! - 3, -SHROUD_HALF_HEIGHT, 0],
      [0, -1, 0],
    ]);
  });
});

describe('bipod', () => {
  it('reaches its leg length below the mount when deployed, and lies back that far when folded', () => {
    const reach = BIPOD_LEG_LENGTH.M!;
    const lowest = (pose: string, axis: 0 | 1) =>
      Math.min(
        ...family('bipod')
          .build({ legs: 'M', pose })
          .solids.map((solid) => bounds(solid).min[axis]),
      );
    expect(lowest('deployed', 1)).toBeCloseTo(-reach);
    expect(lowest('folded', 0)).toBeCloseTo(-reach);
  });

  it.each(['folded', 'deployed'])('holds its %s legs inside the leg-sweep keep-out', (pose) => {
    const bipod = family('bipod').build({ legs: 'L', pose });
    const sweep = bipod.keepOuts.find(({ id }) => id === 'leg-sweep')!;
    const lo = sweep.box.center.map((c, axis) => c - sweep.box.half[axis]!);
    const hi = sweep.box.center.map((c, axis) => c + sweep.box.half[axis]!);
    for (const solid of bipod.solids.filter(({ id }) => id !== 'mount-block')) {
      const { min, max } = bounds(solid);
      // The sweep's top is the block's underside; a folded foot may rise a flare above it, so only the other faces bind.
      const inside = [min[0] >= lo[0]!, min[1] >= lo[1]!, min[2] >= lo[2]!, max[0] <= hi[0]!, max[2] <= hi[2]!];
      expect(inside, solid.id).toEqual([true, true, true, true, true]);
    }
  });
});

describe('carry handle', () => {
  it('stands its posts outside the line of sight and keeps its bar above it', () => {
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

  it('leaves its hand room empty of its own posts and bar', () => {
    const handle = family('carry-handle').build({});
    const room = handle.keepOuts.find(({ id }) => id === 'hand-room')!;
    for (const solid of handle.solids) {
      const { min, max } = bounds(solid);
      const overlaps = [0, 1, 2].every(
        (axis) =>
          Math.min(max[axis]!, room.box.center[axis]! + room.box.half[axis]!) -
            Math.max(min[axis]!, room.box.center[axis]! - room.box.half[axis]!) >
          1e-9,
      );
      expect(overlaps, solid.id).toBe(false);
    }
  });
});

describe('recoil stock and monopod', () => {
  it('has a flat pad much wider than the shared stock butt, and is not a firing grip', () => {
    const stock = family('recoil-stock').build({ length: 'L' });
    const pad = bounds(solidById(stock, 'recoil-pad'));
    const sharedButt = bounds(solidById(family('stock').build({ length: 'L', style: 'straight' }), 'butt'));
    expect(pad.max[2] - pad.min[2]).toBeGreaterThan(1.5 * (sharedButt.max[2] - sharedButt.min[2]));
    expect(stock.tags).toBeUndefined();
  });

  it('mounts the monopod on the underside; deployed it reaches below the pad, folded it does not', () => {
    const stock = family('recoil-stock').build({ length: 'L' });
    const mount = stock.ports.find(({ id }) => id === 'monopod')!;
    const [, bodyBottom] = bounds(solidById(stock, 'body')).min;
    expect(mount.pos[1]).toBe(bodyBottom);
    const [, padBottom] = bounds(solidById(stock, 'recoil-pad')).min;
    const tip = (pose: string) =>
      mount.pos[1] +
      Math.min(
        ...family('monopod')
          .build({ pose })
          .solids.map((solid) => bounds(solid).min[1]),
      );
    expect(tip('deployed')).toBeLessThan(padBottom);
    expect(tip('folded')).toBeGreaterThan(padBottom);
  });
});
