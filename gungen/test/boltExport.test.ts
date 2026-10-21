import { readFileSync } from 'node:fs';
import { resolve } from '@skelly/engine/assembly/resolve.ts';
import type { Assembly } from '@skelly/engine/assembly/schema.ts';
import { validate } from '@skelly/engine/assembly/validate.ts';
import { applyDir, applyPoint, invert, length, sub } from '@skelly/engine/foundation/math.ts';
import { localSolidBounds } from '@skelly/engine/shapes/geometry.ts';
import { expect, it } from 'vitest';
import { buildRegistry } from '../../packages/deadvox/src/core/content.ts';
import { exportFileText } from '../src/cli/exportFile.ts';
import { readCartridge } from '../src/cli/readCartridge.ts';
import { resolveGunAction } from '../src/gun/actionDescription.ts';
import { BOLT_EXTRACTION_CLEARANCE_U, boltCartridge, boltStrokeUnits } from '../src/gun/boltCartridge.ts';
import { sweepBoltAction } from '../src/gun/boltSweep.ts';
import { loadGunDesign } from '../src/gun/designLoader.ts';
import { gunDomain } from '../src/gun/domain.ts';
import { exportGunGlb } from '../src/gun/exportGlb.ts';
import { internalMagazineCapacity } from '../src/gun/internalMagazine.ts';
import { loadDesigns } from './helpers.ts';

const designs = loadDesigns().filter(({ assembly }) =>
  Object.values(assembly.parts).some((part) => part.params?.pattern === 'bolt'),
);
const BOLT_CARTRIDGE = boltCartridge();
const hunting = JSON.parse(readFileSync('designs/hunting-rifle.json', 'utf8'));
const scoped: Assembly = {
  ...hunting.assembly,
  parts: { ...hunting.assembly.parts, sight: { family: 'sight', params: { type: 'hunting-3-9x' } } },
  connections: [...hunting.assembly.connections, { from: 'receiver.rail', to: 'sight.base', slot: 3 }],
};

it('exports every bolt pattern as a hand-only action with a shared bore-parallel turn', () => {
  expect(designs.length).toBeGreaterThan(0);
  for (const { assembly } of designs) {
    const resolved = resolve(assembly, gunDomain);
    const action = resolveGunAction(resolved)!;
    expect(action.kind).toBe('bolt');
    expect(Object.keys(action.parts).sort()).toEqual(['arm', 'carrier', 'knob']);
    expect(action.cycle.fire).toBeUndefined();
    const turns = Object.values(action.parts).map((part) => {
      const turn = part.def.motion!.turn!;
      return {
        pivot: applyPoint(part.placed, turn.pivot),
        axis: applyDir(part.placed, turn.axis),
        angle: turn.angleRadians,
      };
    });
    const envelope = resolved.defs.get(action.carrier.id)!.solids.find(({ id }) => id === 'carrier-body')!;
    const [min, max] = localSolidBounds(envelope);
    const centre = applyPoint(action.carrier.placed, [
      (min[0] + max[0]) / 2,
      (min[1] + max[1]) / 2,
      (min[2] + max[2]) / 2,
    ]);
    expect(length(sub(turns[0]!.pivot, centre))).toBeLessThan(1e-8);
    for (const turn of turns) {
      expect(Math.abs(turn.axis[0])).toBeCloseTo(1);
      expect(length(sub(turn.pivot, turns[0]!.pivot))).toBeLessThan(1e-8);
      expect(length(sub(turn.axis, turns[0]!.axis))).toBeLessThan(1e-8);
      expect(turn.angle).toBe(turns[0]!.angle);
    }
  }
});

it('preserves automatic and pump action kinds without adding turn phases', () => {
  for (const kind of ['ar', 'ak', 'pump'] as const) {
    const existing = loadDesigns().filter(({ assembly }) =>
      Object.values(assembly.parts).some((part) => part.params?.pattern === kind),
    );
    expect(existing.length).toBeGreaterThan(0);
    for (const { assembly } of existing) {
      const action = resolveGunAction(resolve(assembly, gunDomain))!;
      expect(action.kind).toBe(kind);
      expect(Object.values(action.parts).every((part) => part.def.motion?.turn === undefined)).toBe(true);
      expect(action.cycle.fire === undefined).toBe(kind === 'pump');
    }
  }
});

it('derives travel from the cartridge even beyond the old class stroke', () => {
  if (BOLT_CARTRIDGE.kind !== 'metallic') {
    throw new Error('metallic fixture required');
  }
  const longer = {
    ...BOLT_CARTRIDGE,
    overallLength: {
      ...BOLT_CARTRIDGE.overallLength,
      max: { ...BOLT_CARTRIDGE.overallLength.max, value: BOLT_CARTRIDGE.overallLength.max.value! * 2 },
    },
  };
  for (const cartridge of [BOLT_CARTRIDGE, longer]) {
    const envelope = cartridge.overallLength.max.value! / (gunDomain.units.metresPerUnit * 1000);
    expect(boltStrokeUnits(cartridge)).toBeGreaterThanOrEqual(envelope + BOLT_EXTRACTION_CLEARANCE_U);
  }
  for (const { assembly } of designs) {
    const action = resolveGunAction(resolve(assembly, gunDomain))!;
    expect(action.cycle.strokeUnits).toBeCloseTo(boltStrokeUnits(BOLT_CARTRIDGE));
  }
});

it('sizes a bolt design action and integral well from its selected calibre', () => {
  const selected = readCartridge('338-lapua-magnum');
  if (!(selected.ok && selected.cartridge)) {
    throw new Error('missing alternate cartridge fixture');
  }
  const loaded = loadGunDesign(JSON.stringify({ ...hunting, calibre: selected.cartridge.id }));
  if (!loaded.ok) {
    throw new Error(loaded.error.message);
  }
  expect(loaded.issues.filter(({ path }) => path === 'calibre')).toEqual([]);
  const resolved = resolve(loaded.design.assembly, gunDomain);
  const action = resolveGunAction(resolved)!;
  expect(action.cycle.strokeUnits).toBe(boltStrokeUnits(selected.cartridge));
  const original = resolve(hunting.assembly, gunDomain);
  const well = (value: typeof resolved) =>
    [...value.defs.values()].flatMap((def) => def.keepOuts).find(({ id }) => id === 'internal-magazine-well')!.box;
  expect(well(resolved).half[0]).toBeGreaterThan(well(original).half[0]);
  const exported = exportFileText(JSON.stringify({ ...hunting, calibre: selected.cartridge.id }), {
    id: 'alternate_bolt',
    file: 'assets/models/alternate_bolt.glb',
  });
  if (!exported.ok) {
    throw new Error(exported.message);
  }
});

it.each(['missing-test-cartridge', '12-gauge-00-buck'])(
  'reports unsupported bolt calibre %s at the design boundary',
  (calibre) => {
    const loaded = loadGunDesign(JSON.stringify({ ...hunting, calibre }));
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) {
      throw new Error(loaded.error.message);
    }
    expect(loaded.issues.some((issue) => issue.path === 'calibre' && issue.message.includes(calibre))).toBe(true);
    const out = exportFileText(JSON.stringify({ ...hunting, calibre }), {
      id: 'unsupported_bolt',
      file: 'assets/models/unsupported_bolt.glb',
    });
    expect(out.ok).toBe(false);
  },
);

// The sweep bisects every moving solid against every fixed solid, so its cost is the pair count.
const SWEEP_MS_PER_PAIR_BUDGET = 10;
const sweepPairs = (assembly: Assembly): number => {
  const resolved = resolve(assembly, gunDomain);
  const action = resolveGunAction(resolved)!;
  const moving = new Set(Object.values(action.parts).map(({ id }) => id));
  const movers = Object.values(action.parts).reduce((sum, part) => sum + part.def.solids.length, 0);
  const obstacles = [...resolved.defs]
    .filter(([id]) => !moving.has(id))
    .reduce((sum, [, def]) => sum + def.solids.length, 0);
  return movers * obstacles;
};

for (const assembly of [...designs.map((design) => design.assembly), { ...scoped, name: 'scoped hunting fixture' }]) {
  it(
    `certifies the whole handle arc and draw against fixed geometry: ${assembly.name}`,
    () => {
      expect(validate(assembly, gunDomain).issues).toEqual([]);
      expect(sweepBoltAction(resolve(assembly, gunDomain))).toEqual([]);
    },
    1000 + sweepPairs(assembly) * SWEEP_MS_PER_PAIR_BUDGET,
  );
}

it('keeps the sporting front post tip centred and visible between the rear notch cheeks from its eye', () => {
  const resolved = resolve(hunting.assembly, gunDomain);
  const rear = resolved.defs.get('rear-sight')!;
  const front = resolved.defs.get('front-sight')!;
  const axis = rear.axes.find(({ kind }) => kind === 'sight')!;
  const eye = axis.origin.map((value, i) => value - axis.dir[i]! * axis.referenceDistanceU!);
  const [, leftMax] = localSolidBounds(rear.solids.find(({ id }) => id === 'leaf-left')!);
  const [rightMin] = localSolidBounds(rear.solids.find(({ id }) => id === 'leaf-right')!);
  const [postMin, postMax] = localSolidBounds(front.solids.find(({ id }) => id === 'post')!);
  const rearInverse = invert(resolved.placed.get('rear-sight')!);
  for (const z of [postMin[2], postMax[2]]) {
    const tip = applyPoint(
      rearInverse,
      applyPoint(resolved.placed.get('front-sight')!, [(postMin[0] + postMax[0]) / 2, postMax[1], z]),
    );
    const fraction = (axis.origin[0] - eye[0]!) / (tip[0] - eye[0]!);
    expect(fraction).toBeGreaterThan(0);
    expect(fraction).toBeLessThan(1);
    const projectedY = eye[1]! + (tip[1] - eye[1]!) * fraction;
    const projectedZ = eye[2]! + (tip[2] - eye[2]!) * fraction;
    expect(projectedY).toBeCloseTo(axis.origin[1], 8);
    expect(projectedZ).toBeGreaterThan(leftMax[2]);
    expect(projectedZ).toBeLessThan(rightMin[2]);
  }
});

it('removes a design-excluded attachment from both single and pair certificates', () => {
  const asset = { id: 'exclusion_fixture', file: 'assets/models/exclusion_fixture.glb' as const };
  const baseline = exportFileText(JSON.stringify({ ...hunting, excludedAttachments: [] }), asset);
  if (!baseline.ok) {
    throw new Error(baseline.message);
  }
  const excluded = baseline.modelEntry.gun.compatibilityPairs?.[0]?.[0][1];
  if (!excluded) {
    throw new Error('Exclusion fixture needs an accepted attachment pair');
  }
  const restricted = exportFileText(JSON.stringify({ ...hunting, excludedAttachments: [excluded] }), asset);
  if (!restricted.ok) {
    throw new Error(restricted.message);
  }
  expect(Object.values(restricted.modelEntry.gun.compatibility ?? {}).flat()).not.toContain(excluded);
  expect(restricted.modelEntry.gun.compatibilityPairs?.some((pair) => pair.some(([, id]) => id === excluded))).toBe(
    false,
  );
});

it('exports integral capacity from the well, iron or fitted-optic sights, and a validated phased action', () => {
  const out = exportFileText(readFileSync('designs/hunting-rifle.json', 'utf8'), {
    id: 'fixture_hunting',
    file: 'assets/models/fixture_hunting.glb',
  });
  if (!out.ok) {
    throw new Error(out.message);
  }
  const model = out.modelEntry;
  const resolved = resolve(hunting.assembly, gunDomain);
  expect(model.gun.internalMagazine?.capacity).toBeDefined();
  expect(model.gun.internalMagazine?.capacity).toBe(internalMagazineCapacity(resolved, BOLT_CARTRIDGE));
  expect(model.gun.slots?.magazine).toBeUndefined();
  expect(Object.values(model.gun.compatibility ?? {}).some((allowed) => allowed.includes('optic-hunting-3-9x'))).toBe(
    true,
  );
  expect(model.gun.sight?.kind).toBe('iron');
  expect(Object.values(model.gun.compatibility ?? {}).flat()).not.toContain('optic-digital-thermal');
  expect(model.anchors?.loading_port).toBeDefined();
  const optic = exportGunGlb(
    scoped,
    { id: 'fixture_scoped', file: 'assets/models/fixture_scoped.glb' },
    { appearanceProfile: 'hunting-rifle' },
    { cartridge: BOLT_CARTRIDGE },
  );
  if (!optic.ok) {
    throw new Error(JSON.stringify(optic.error));
  }
  expect(optic.modelEntry.gun.sight?.kind).toBe('optic');
  expect(buildRegistry([{ source: 'fixture', data: { models: [model, optic.modelEntry] } }]).issues).toEqual([]);
  const { hand } = model.gun.action!;
  expect(
    hand.unlockSimSeconds! +
      hand.rearwardSimSeconds +
      hand.dwellSimSeconds +
      hand.forwardSimSeconds +
      hand.lockSimSeconds!,
  ).toBeLessThanOrEqual(hand.durationSimSeconds);
  for (const phase of ['unlockSimSeconds', 'lockSimSeconds'] as const) {
    const bad = structuredClone(model);
    delete bad.gun.action!.hand[phase];
    expect(buildRegistry([{ source: 'fixture', data: { models: [bad] } }]).issues.length).toBeGreaterThan(0);
  }
});
