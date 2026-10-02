import { describe, expect, it } from 'vitest';
import { MAIN_AXIS, TOLERANCE } from '../src/core/conventions.ts';
import {
  distanceWorld,
  localSolidBounds,
  penetrationWorld,
  validateExtrudedPolygon,
  worldSolid,
} from '../src/core/geometry.ts';
import {
  angleBetween,
  applyDir,
  applyPoint,
  compose,
  invert,
  length,
  sub,
  type Transform,
  translation,
  type Vec3,
} from '../src/core/math.ts';
import { resolve } from '../src/core/resolve.ts';
import type { PartDef, PartFamily, Solid } from '../src/core/schema.ts';
import { validate } from '../src/core/validate.ts';
import {
  SHROUD_HALF_HEIGHT,
  SHROUD_HALF_WIDTH,
  SHROUD_LENGTH,
  TRUNNION_SETBACK,
} from '../src/gun/antiMateriel/barrelShroud.ts';
import { BIPOD_LEG_LENGTH } from '../src/gun/antiMateriel/bipod.ts';
import {
  BAR_FLAT_RADIUS,
  BAR_HALF_LENGTH,
  STRUT_LEFT,
  STRUT_LENGTH,
  STRUT_TILT_DEGREES,
  STRUT_UP,
} from '../src/gun/antiMateriel/carryHandle.ts';
import { BMG_BASE_DIAMETER_U, BMG_CASE_LENGTH_U, BMG_OVERALL_LENGTH_U } from '../src/gun/antiMateriel/cartridge.ts';
import { HEAVY_CARRIER_ENVELOPE, HEAVY_HANDLE_SCALE } from '../src/gun/antiMateriel/heavyBoltCarrier.ts';
import { HEAVY_GRIP_MOUNT_PROFILE, HEAVY_TRIGGER_GUARD } from '../src/gun/antiMateriel/heavyLower.ts';
import {
  HEAVY_MAGAZINE_DEPTH,
  HEAVY_MAGAZINE_LENGTH,
  HEAVY_MAGAZINE_ROUNDS,
  HEAVY_MAGAZINE_SLANT_DEGREES,
} from '../src/gun/antiMateriel/heavyMagazine.ts';
import { HEAVY_RECEIVER_LENGTH } from '../src/gun/antiMateriel/heavyReceiver.ts';
import { STAND_IN_SCOPE_ENVELOPE } from '../src/gun/antiMateriel/scopeEnvelope.ts';
import { gunDomain } from '../src/gun/domain.ts';
import { EJECTION_PORT_MARGIN_U, FAMILIES, GRIP_MOUNT_PROFILE, TRIGGER_GUARD } from '../src/gun/parts.ts';
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
  it.each([
    ['recoil-stock', 'stock'],
    ['heavy-receiver', 'receiver'],
    ['heavy-lower', 'lower'],
    ['heavy-magazine', 'magazine'],
    ['heavy-bolt-carrier', 'bolt-carrier'],
  ])('gives %s the %s role, so the palette and the rules that look for that role treat it as one', (key, role) => {
    expect(family(key).build({}).family).toBe(role);
  });
});

describe('.50 BMG magazine, well and action', () => {
  const magazine = family('heavy-magazine').build({});
  const lower = family('heavy-lower').build({});
  const receiver = family('heavy-receiver').build({ action: 'auto', feed: 'box', bore: 'L' });
  const extent = (solid: Solid, axis: 0 | 1 | 2) => bounds(solid).max[axis]! - bounds(solid).min[axis]!;
  const carrier = family('heavy-bolt-carrier').build({});
  const carrierExtent = (axis: 0 | 1 | 2) => {
    const body = solidById(carrier, 'carrier-body');
    return { min: bounds(body).min[axis]!, max: bounds(body).max[axis]! };
  };
  const receiverKeepOutBounds = (id: string) => {
    const { box } = receiver.keepOuts.find((keepOut) => keepOut.id === id)!;
    return {
      min: box.center.map((c, axis) => c - box.half[axis]!) as [number, number, number],
      max: box.center.map((c, axis) => c + box.half[axis]!) as [number, number, number],
    };
  };

  it('sizes the magazine from the round: deeper than the round is long, in two columns, shorter than ten cases stacked', () => {
    const body = solidById(magazine, 'body');
    expect(extent(body, 0)).toBeGreaterThan(BMG_OVERALL_LENGTH_U);
    expect(extent(body, 0) - BMG_OVERALL_LENGTH_U).toBeLessThan(1);
    expect(extent(body, 2)).toBeGreaterThan(1.8 * BMG_BASE_DIAMETER_U);
    expect(extent(body, 1)).toBeLessThan(HEAVY_MAGAZINE_ROUNDS * BMG_BASE_DIAMETER_U);
    expect(extent(body, 1)).toBeGreaterThan((HEAVY_MAGAZINE_ROUNDS / 2) * BMG_BASE_DIAMETER_U);
  });

  it('slants the bottom up toward the front by about 8 degrees, with the back face, top and depth unchanged', () => {
    const body = solidById(magazine, 'body');
    if (body.kind !== 'extruded-polygon') {
      throw new Error('the heavy magazine body must be a convex extrusion');
    }
    expect(validateExtrudedPolygon(body.profile, body.z)).toBeUndefined();
    const ys = body.profile.map(([, y]) => y);
    const [backBottom, frontBottom] = ys as [number, number];
    const degrees = (Math.atan((frontBottom - backBottom) / HEAVY_MAGAZINE_DEPTH) * 180) / Math.PI;
    expect(Math.abs(degrees - HEAVY_MAGAZINE_SLANT_DEGREES)).toBeLessThan(0.5);
    // Back face keeps the full height; the front face is the shorter one.
    expect(bounds(body).max[1]! - backBottom).toBe(HEAVY_MAGAZINE_LENGTH);
    expect(bounds(body).max[1]! - frontBottom).toBeLessThan(HEAVY_MAGAZINE_LENGTH);
    expect(extent(body, 0)).toBe(HEAVY_MAGAZINE_DEPTH);
  });

  it('is deeper and wider than the rifle-cartridge magazine, and shorter than its L length (the review feedback)', () => {
    const standard = solidById(family('magazine').build({ length: 'L' }), 'body');
    const heavy = solidById(magazine, 'body');
    expect(extent(heavy, 0)).toBeGreaterThan(2 * extent(standard, 0));
    expect(extent(heavy, 2)).toBeGreaterThan(extent(standard, 2));
    expect(extent(heavy, 1)).toBeLessThan(extent(standard, 1));
  });

  it('opens a well 0.25u larger than the magazine on each side, in front of the magazine port', () => {
    const body = bounds(solidById(magazine, 'body'));
    const port = lower.ports.find(({ id }) => id === 'magazine')!;
    const path = lower.keepOuts.find(({ id }) => id === 'magazine-path')!;
    const lo = path.box.center.map((c, axis) => c - path.box.half[axis]!);
    const hi = path.box.center.map((c, axis) => c + path.box.half[axis]!);
    expect([port.pos[0] + body.min[0] - lo[0]!, hi[0]! - (port.pos[0] + body.max[0])]).toEqual([0.25, 0.25]);
    expect([body.min[2] - lo[2]!, hi[2]! - body.max[2]]).toEqual([0.25, 0.25]);
  });

  it("keeps the well's front face where the shared conventional lower has it, so the bipod swing clears as before", () => {
    const front = (def: PartDef) => bounds(solidById(def, 'frame-front')).min[0];
    expect(front(lower)).toBe(front(family('lower').build({ layout: 'conventional' })));
  });

  it("repeats the shared lower's trigger-guard and grip numbers, which it cannot import", () => {
    expect(HEAVY_TRIGGER_GUARD).toEqual({ ...TRIGGER_GUARD, innerXClearance: 0.5 });
    expect(HEAVY_GRIP_MOUNT_PROFILE).toEqual(GRIP_MOUNT_PROFILE);
  });

  it('puts the action over the magazine: bolt face and ejection port front at its front face, breech at the bolt', () => {
    const [barrelX] = receiver.ports.find(({ id }) => id === 'barrel')!.pos;
    const [wellX] = lower.ports.find(({ id }) => id === 'magazine')!.pos;
    const magazineFront = wellX + HEAVY_MAGAZINE_DEPTH / 2;
    const [restX] = receiver.ports.find(({ id }) => id === 'bolt-carrier')!.pos;
    const ejection = receiverKeepOutBounds('ejection');
    expect(restX + carrierExtent(0).max).toBe(magazineFront);
    expect(barrelX).toBe(magazineFront);
    expect(ejection.max[0] - magazineFront).toBeCloseTo(0.25);
  });

  it("derives the ejection port from the carrier's face bounds plus the margin every receiver uses", () => {
    const [restX, carrierY] = receiver.ports.find(({ id }) => id === 'bolt-carrier')!.pos;
    const ejection = receiverKeepOutBounds('ejection');
    expect(EJECTION_PORT_MARGIN_U).toBe(0.25);
    expect(ejection.min[0]).toBeCloseTo(restX + carrierExtent(0).min - EJECTION_PORT_MARGIN_U);
    expect(ejection.max[0]).toBeCloseTo(restX + carrierExtent(0).max + EJECTION_PORT_MARGIN_U);
    expect(ejection.min[1]).toBeCloseTo(carrierY + carrierExtent(1).min - EJECTION_PORT_MARGIN_U);
    expect(ejection.max[1]).toBeCloseTo(carrierY + carrierExtent(1).max + EJECTION_PORT_MARGIN_U);
    // As long as the magazine, so the 8.64u case passes with room to spare.
    expect(ejection.max[0] - ejection.min[0]).toBeCloseTo(HEAVY_MAGAZINE_DEPTH);
    expect(ejection.max[0] - ejection.min[0]).toBeGreaterThan(BMG_CASE_LENGTH_U);
  });

  it('parks the carrier behind the magazine so the next round can rise, inside the receiver', () => {
    const travel = receiverKeepOutBounds('bolt-travel');
    const magazineRearWall = lower.ports.find(({ id }) => id === 'magazine')!.pos[0] - HEAVY_MAGAZINE_DEPTH / 2;
    expect(travel.min[0] + carrierExtent(0).max).toBeLessThan(magazineRearWall);
    expect(travel.min[0] + carrierExtent(0).min).toBeGreaterThanOrEqual(-HEAVY_RECEIVER_LENGTH);
  });
});

describe('anti-materiel charging handle', () => {
  const design = () =>
    variant('archetype-anti-materiel', (draft) => {
      draft.parts.trunnion!.params = { pose: 'stowed' };
    });
  const resolved = resolve(design(), gunDomain);
  const carrier = resolved.defs.get('bolt-carrier')!;
  const receiver = resolved.defs.get('receiver')!;
  const carrierTransform = resolved.placed.get('bolt-carrier')!;
  const handleParts = carrier.solids.filter(({ id }) => id === 'heavy-handle-stick' || id === 'charging-handle');
  const sideShell = receiver.solids.filter(({ id }) => id.startsWith('receiver-shell-side-near-rear'));
  const receiverShells = receiver.solids.filter(({ id }) => id.startsWith('receiver-shell'));
  const handleTravel = carrier.keepOuts.find(({ id }) => id === 'charging-handle')!;
  const handleReceiverGap = (transform: Transform) =>
    Math.min(
      ...handleParts.flatMap((handle) =>
        receiverShells.map((shell) =>
          distanceWorld(worldSolid(transform, handle), worldSolid(resolved.placed.get('receiver')!, shell)),
        ),
      ),
    );
  const noReceiverContact = (transform: Transform) => handleReceiverGap(transform) >= 0.25 - 1e-6;

  it('mounts an enlarged AK-style metal stick and clipped paddle on the carrier', () => {
    const ak = family('bolt-carrier').build({ action: 'bolt', bore: 'M', pattern: 'ak', handleStyle: 'ak' });
    const akPaddle = solidById(ak, 'charging-handle');
    const heavyStick = solidById(carrier, 'heavy-handle-stick');
    const heavyPaddle = solidById(carrier, 'charging-handle');
    expect(heavyPaddle.kind).toBe('extruded-polygon');
    expect(heavyPaddle.slot).toBe('metal');
    expect(heavyPaddle.kind === 'extruded-polygon' && heavyPaddle.clip).toHaveLength(4);
    expect(HEAVY_HANDLE_SCALE).toBe(1.4);
    expect(HEAVY_CARRIER_ENVELOPE.x[0]).toBeLessThan(0);
    for (const axis of [0, 1, 2] as const) {
      const akSize = bounds(akPaddle).max[axis]! - bounds(akPaddle).min[axis]!;
      const heavySize = bounds(heavyPaddle).max[axis]! - bounds(heavyPaddle).min[axis]!;
      expect(heavySize / akSize, `paddle axis ${axis}`).toBeGreaterThanOrEqual(1.3);
      expect(heavySize / akSize, `paddle axis ${axis}`).toBeLessThanOrEqual(1.5);
    }
    expect(
      penetrationWorld(
        worldSolid(carrierTransform, heavyStick),
        worldSolid(carrierTransform, solidById(carrier, 'carrier-body')),
      ),
    ).toBeGreaterThan(0);
    expect(
      distanceWorld(worldSolid(carrierTransform, heavyStick), worldSolid(carrierTransform, heavyPaddle)),
    ).toBeLessThanOrEqual(1e-6);
    expect(carrier.motion).toMatchObject({ kind: 'linear', axis: [1, 0, 0] });
  });

  it('cuts a narrow slot through the ejection-port-side receiver wall and preserves the surrounding metal', () => {
    const slot = receiver.keepOuts.find(({ id }) => id === 'charging-handle')!.box;
    const [, y, z] = slot.center;
    const slotMinX = slot.center[0] - slot.half[0]!;
    const shellContains = (point: Vec3) =>
      sideShell.some((shell) => {
        const { min, max } = bounds(shell);
        return point.every((coordinate, axis) => coordinate > min[axis]! && coordinate < max[axis]!);
      });
    expect(shellContains([slotMinX + 1, y, 1.75])).toBe(false);
    expect(shellContains([slotMinX - 0.5, y, 1.75])).toBe(true);
    expect(sideShell.map(({ id }) => id)).toEqual([
      'receiver-shell-side-near-rear-back',
      'receiver-shell-side-near-rear-lower',
      'receiver-shell-side-near-rear-upper',
    ]);
    expect(z).toBeGreaterThan(2);
  });

  it('clears the receiver shell through every sampled point of its full bolt travel', () => {
    const [end] = carrier.motion!.end;
    for (let sample = 0; sample <= 32; sample++) {
      const progress = (end * sample) / 32;
      const transform = compose(carrierTransform, translation([progress, 0, 0]));
      expect(handleReceiverGap(transform), `travel sample ${sample}/32`).toBeGreaterThanOrEqual(0.25 - 1e-6);
    }
  });

  it('fails the displaced-handle canary beyond the rear end of the metal slot', () => {
    const [travel] = carrier.motion!.end;
    const displaced = compose(carrierTransform, translation([travel + 1, 0, 0]));
    expect(noReceiverContact(compose(carrierTransform, translation([travel, 0, 0])))).toBe(true);
    expect(noReceiverContact(displaced)).toBe(false);
  });

  it('leaves a matching rest keep-out for the generic action-handle-rest rule', () => {
    expect(handleTravel.kind).toBe('charging-handle');
    expect(validate(design(), gunDomain).issues).toEqual([]);
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
    const receiver = family('heavy-receiver').build({ action: 'auto', feed: 'box', bore: 'L' });
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

/** The anti-materiel fixture with the handle in one pose and the bipod in one pose (its legs L, as published). */
const withHandlePose = (pose: 'carry' | 'stowed', bipodPose = 'folded') =>
  variant('archetype-anti-materiel', (draft) => {
    draft.parts.trunnion!.params = { pose };
    draft.parts.bipod!.params!.pose = bipodPose;
  });

describe.each(['carry', 'stowed'] as const)('carry handle, %s pose', (pose) => {
  // +1 when the strut rises (carry), -1 when it hangs (stowed).
  const sign = pose === 'stowed' ? -1 : 1;
  const resolved = resolve(withHandlePose(pose), gunDomain);
  const placed = (id: string) => resolved.placed.get(id)!;
  const def = (id: string) => resolved.defs.get(id)!;
  const onGrid = (n: number) => Math.abs(n / 0.25 - Math.round(n / 0.25)) < 1e-9;
  const XAxis: Vec3 = [1, 0, 0];
  /** A world point as seen from the shroud's own frame, where the design's numbers are on the 0.25u grid. */
  const inShroud = (point: Vec3): Vec3 => applyPoint(invert(placed('shroud')), point);
  /** World coordinates along one axis of a solid's corner points (a box's eight, or a prism's vertices). */
  const worldCoords = (solid: Solid, transform: Transform, axis: 0 | 1 | 2): number[] => {
    const world = worldSolid(transform, solid);
    if ('vertices' in world) {
      return world.vertices.map((point) => point[axis]);
    }
    if (solid.kind !== 'box') {
      throw new Error(`${solid.id} has no corner points`);
    }
    const { center, half } = solid.box;
    return [-1, 1].flatMap((sx) =>
      [-1, 1].flatMap((sy) =>
        [-1, 1].map(
          (sz) =>
            applyPoint(transform, [center[0] + sx * half[0], center[1] + sy * half[1], center[2] + sz * half[2]])[axis],
        ),
      ),
    );
  };
  const extent = (solid: Solid, transform: Transform, axis: 0 | 1 | 2): number => {
    const values = worldCoords(solid, transform, axis);
    return Math.max(...values) - Math.min(...values);
  };

  it('passes the pose to the strut and the bar from the trunnion alone', () => {
    for (const id of ['strut', 'bar']) {
      expect(resolved.params.get(id)!.pose).toMatchObject({ value: pose, source: 'inherited' });
    }
  });

  it('has a diagonal strut: up (carry) or down (stowed) and to the left at the stated angle, not vertical or horizontal', () => {
    const axis = applyDir(placed('strut'), XAxis);
    expect(axis[0]).toBeCloseTo(0);
    expect(sign * axis[1]).toBeGreaterThan(0);
    expect(axis[2]).toBeLessThan(0);
    expect(angleBetween(axis, [0, sign, 0])).toBeCloseTo(STRUT_TILT_DEGREES, 6);
    expect(STRUT_TILT_DEGREES).toBeCloseTo(36.87, 2);
  });

  it('lands the strut end on the bar and on the grid: the bar is at the stated place, to the left of the shroud wall', () => {
    const end = applyPoint(placed('strut'), [STRUT_LENGTH, 0, 0]);
    const barPort = applyPoint(placed('bar'), def('bar').ports.find(({ id }) => id === 'base')!.pos);
    expect(length(sub(end, barPort))).toBeLessThan(0.01);
    expect(inShroud(end).map((n) => Math.round(n * 1e6) / 1e6)).toEqual([TRUNNION_SETBACK, sign * 7.5, -7.5]);
    expect(inShroud(applyPoint(placed('bar'), [0, 0, 0])).every(onGrid)).toBe(true);
    // It overhangs the shroud's wall by more than a fist's width of 4u.
    expect(inShroud(end)[2]).toBeLessThan(-(SHROUD_HALF_WIDTH + 4));
  });

  it('sinks both strut ends into their neighbours, within the nesting allowance, so no joint or gap shows', () => {
    const strut = def('strut').solids[0]!;
    const block = def('trunnion').solids[0]!;
    const grip = def('bar').solids[0]!;
    const strutWorld = worldSolid(placed('strut'), strut);
    if (!('vertices' in strutWorld)) {
      throw new Error('the strut must be a prism');
    }
    const ringSize = strutWorld.vertices.length / 2;
    const baseCap = strutWorld.vertices.slice(0, ringSize);
    const topCap = strutWorld.vertices.slice(ringSize);
    for (const [neighbour, nested] of [
      ['trunnion', block],
      ['bar', grip],
    ] as const) {
      const depth = penetrationWorld(strutWorld, worldSolid(placed(neighbour), nested));
      expect(depth, neighbour).toBeGreaterThan(0.25);
      expect(depth, neighbour).toBeLessThanOrEqual(TOLERANCE.interface);
    }
    // The base cap lies inside the trunnion's section, below its top face (which is square to the strut).
    for (const point of baseCap) {
      const [, y, z] = applyPoint(invert(placed('trunnion')), point);
      expect(sign * y, 'base y').toBeLessThanOrEqual(2.25);
      expect(z, 'base z').toBeGreaterThanOrEqual(-2);
      expect(z, 'base z').toBeLessThanOrEqual(0);
      expect(STRUT_UP * sign * y - STRUT_LEFT * z, 'below the top face').toBeLessThanOrEqual(1.8 + 1e-9);
    }
    // The top cap lies inside the bar's octagonal section.
    for (const point of topCap) {
      const [, y, z] = applyPoint(invert(placed('bar')), point);
      expect(Math.max(Math.abs(y), Math.abs(z)), 'top cap').toBeLessThanOrEqual(BAR_FLAT_RADIUS + 1e-9);
      expect(Math.abs(y) + Math.abs(z), 'top cap').toBeLessThanOrEqual(BAR_FLAT_RADIUS * Math.SQRT2 + 1e-9);
    }
  });

  it('keeps the bar level and parallel to the bore, with its flats horizontal', () => {
    const bar = placed('bar');
    expect(angleBetween(applyDir(bar, XAxis), MAIN_AXIS.dir)).toBeLessThan(TOLERANCE.angle);
    const [grip] = def('bar').solids;
    expect(extent(grip!, bar, 1)).toBeCloseTo(2 * BAR_FLAT_RADIUS);
    expect(extent(grip!, bar, 2)).toBeCloseTo(2 * BAR_FLAT_RADIUS);
  });

  it('reaches back from the strut toward the stock: most of the bar and all of the hand room lie behind the strut', () => {
    const [strutX] = applyPoint(placed('strut'), [STRUT_LENGTH, 0, 0]);
    const [grip] = def('bar').solids;
    const bar = worldCoords(grip!, placed('bar'), 0);
    expect(strutX - Math.min(...bar)).toBeGreaterThan(Math.max(...bar) - strutX);
    const room = def('bar').keepOuts.find(({ id }) => id === 'hand-room')!;
    const [roomFront] = applyPoint(placed('bar'), [room.box.center[0] + room.box.half[0], 0, 0]);
    expect(roomFront).toBeLessThan(strutX);
  });

  it('stands wholly to the left of the line of sight', () => {
    const sightline = family('sight')
      .build({})
      .keepOuts.find(({ id }) => id === 'sightline')!;
    const [, , sightHalfWidth] = sightline.box.half;
    for (const id of ['trunnion', 'strut', 'bar']) {
      for (const solid of def(id).solids) {
        expect(Math.max(...worldCoords(solid, placed(id), 2)), `${id} ${solid.id}`).toBeLessThan(-sightHalfWidth);
      }
    }
  });

  it('clears a full-size scope mounted where the sight is, by at least 0.25u (stand-in envelope)', () => {
    const sight = placed('sight');
    const volumes = ['trunnion', 'strut', 'bar'].flatMap((id) => {
      const room = def(id).keepOuts.find(({ id: keepOutId }) => keepOutId === 'hand-room');
      const solids: Solid[] = [
        ...def(id).solids,
        ...(room ? [{ id: room.id, kind: 'box' as const, box: room.box }] : []),
      ];
      return solids.map((solid) => ({ label: `${id} ${solid.id}`, solid, transform: placed(id) }));
    });
    for (const part of STAND_IN_SCOPE_ENVELOPE) {
      for (const { label, solid, transform } of volumes) {
        const gap = distanceWorld(worldSolid(sight, part), worldSolid(transform, solid));
        expect(gap, `${part.id} to ${label}`).toBeGreaterThanOrEqual(0.25 - 1e-9);
      }
    }
  });

  it('gives a gloved hand room: the free stretch of bar is longer than a hand and the room is empty of other parts', () => {
    const room = def('bar').keepOuts.find(({ id }) => id === 'hand-room')!;
    // About 100 mm (8.7u) of gloved palm breadth is an assumption, not a measured figure.
    expect(room.box.half[0] * 2).toBeGreaterThanOrEqual(8.7);
    expect(room.box.half[0] * 2).toBeLessThanOrEqual(2 * BAR_HALF_LENGTH);
    // The room reaches 2u beyond the bar's surface on every side.
    expect(room.box.half[1] - BAR_FLAT_RADIUS).toBeCloseTo(2);
    expect(room.box.half[2] - BAR_FLAT_RADIUS).toBeCloseTo(2);
    expect(validate(withHandlePose(pose), gunDomain).issues).toEqual([]);
  });

  it.each(['folded', 'deployed'])(
    'clears the magazine, lower, grip, bolt carrier and the %s bipod by at least 0.25u, and the shroud but for its wall',
    (bipodPose) => {
      const other = resolve(withHandlePose(pose, bipodPose), gunDomain);
      expect(validate(withHandlePose(pose, bipodPose), gunDomain).issues).toEqual([]);
      const handleVolumes = ['trunnion', 'strut', 'bar'].flatMap((id) => {
        const room = other.defs.get(id)!.keepOuts.find(({ id: keepOutId }) => keepOutId === 'hand-room');
        const solids: Solid[] = [
          ...other.defs.get(id)!.solids,
          ...(room ? [{ id: room.id, kind: 'box' as const, box: room.box }] : []),
        ];
        return solids.map((solid) => ({ solid, transform: other.placed.get(id)! }));
      });
      for (const partId of ['magazine', 'lower', 'grip', 'bolt-carrier', 'bipod']) {
        for (const theirs of other.defs.get(partId)!.solids) {
          for (const { solid, transform } of handleVolumes) {
            const gap = distanceWorld(worldSolid(other.placed.get(partId)!, theirs), worldSolid(transform, solid));
            expect(gap, `${partId} ${theirs.id} to ${solid.id}`).toBeGreaterThanOrEqual(0.25 - 1e-9);
          }
        }
      }
    },
  );
});

describe('carry handle, stowed pose', () => {
  const resolved = resolve(withHandlePose('stowed'), gunDomain);
  const inShroud = (id: string, point: Vec3): Vec3 =>
    applyPoint(invert(resolved.placed.get('shroud')!), applyPoint(resolved.placed.get(id)!, point));

  it('keeps the bar below the bore line and left of centre, out of the first-person view above the bore', () => {
    const [grip] = resolved.defs.get('bar')!.solids;
    const corners = (axis: 1 | 2) => {
      const world = worldSolid(resolved.placed.get('bar')!, grip!);
      if (!('vertices' in world)) {
        throw new Error('the bar must be a prism');
      }
      return world.vertices.map((point) => point[axis]);
    };
    expect(Math.max(...corners(1))).toBeLessThan(0);
    expect(Math.max(...corners(2))).toBeLessThan(0);
    // The hand room hangs below the bore line too.
    const room = resolved.defs.get('bar')!.keepOuts.find(({ id }) => id === 'hand-room')!;
    expect(inShroud('bar', [0, room.box.center[1] + room.box.half[1], 0])[1]).toBeLessThan(0);
  });

  it('has the same trunnion block in both poses, symmetric about the horizontal plane: only its port differs', () => {
    const carryBlock = family('handle-trunnion').build({ pose: 'carry' });
    const stowedBlock = family('handle-trunnion').build({ pose: 'stowed' });
    expect(stowedBlock.solids).toEqual(carryBlock.solids);
    const [block] = stowedBlock.solids;
    if (block?.kind !== 'extruded-polygon') {
      throw new Error('the trunnion block must be a convex extrusion');
    }
    expect(validateExtrudedPolygon(block.profile, block.z, block.axis)).toBeUndefined();
    const mirrored = block.profile.map(([y, z]) => `${-y},${z}`).sort();
    expect(block.profile.map(([y, z]) => `${y},${z}`).sort()).toEqual(mirrored);
    const strutPort = (pose: string) =>
      family('handle-trunnion')
        .build({ pose })
        .ports.find(({ id }) => id === 'strut')!;
    expect(strutPort('carry').normal).toEqual([0, 0.8, -0.6]);
    expect(strutPort('stowed').normal).toEqual([0, -0.8, -0.6]);
  });

  it('is the carry pose mirrored about the horizontal plane: the trunnion and the strut and bar ends flip in y only', () => {
    const carry = resolve(withHandlePose('carry'), gunDomain);
    const point = (r: typeof carry, id: string, local: Vec3) =>
      applyPoint(invert(r.placed.get('shroud')!), applyPoint(r.placed.get(id)!, local));
    for (const [id, local] of [
      ['strut', [0, 0, 0]],
      ['strut', [STRUT_LENGTH, 0, 0]],
      ['bar', [0, 0, 0]],
    ] as const) {
      const [cx, cy, cz] = point(carry, id, local);
      const [sx, sy, sz] = point(resolved, id, local);
      expect([sx, sy, sz].map((n) => Math.round(n * 1e6) / 1e6)).toEqual(
        [cx, -cy, cz].map((n) => Math.round(n * 1e6) / 1e6),
      );
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
