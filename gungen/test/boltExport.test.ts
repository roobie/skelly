import { readFileSync } from 'node:fs';
import { localSolidBounds } from '@skelly/engine/core/geometry.ts';
import { applyDir, applyPoint, invert, length, sub } from '@skelly/engine/core/math.ts';
import { resolve } from '@skelly/engine/core/resolve.ts';
import type { Assembly } from '@skelly/engine/core/schema.ts';
import { validate } from '@skelly/engine/core/validate.ts';
import { expect, it } from 'vitest';
import { buildRegistry } from '../../deadvox/src/core/content.ts';
import { exportFileText } from '../src/cli/exportFile.ts';
import { resolveGunAction } from '../src/gun/actionDescription.ts';
import { BOLT_CARTRIDGE, BOLT_EXTRACTION_CLEARANCE_U, boltStrokeUnits } from '../src/gun/boltCartridge.ts';
import { sweepBoltAction } from '../src/gun/boltSweep.ts';
import { gunDomain } from '../src/gun/domain.ts';
import { exportGunGlb } from '../src/gun/exportGlb.ts';
import { internalMagazineCapacity } from '../src/gun/internalMagazine.ts';
import { loadDesigns } from './helpers.ts';

const designs = loadDesigns().filter(({ assembly }) =>
  Object.values(assembly.parts).some((part) => part.params?.pattern === 'bolt'),
);
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
    const receiver = resolved.defs.get(action.receiverId)!;
    const port = receiver.keepOuts.find(({ id }) => id === 'ejection')!;
    const home = applyPoint(invert(resolved.placed.get(action.receiverId)!), action.carrier.placed.t);
    expect(action.cycle.ejectAt * action.cycle.strokeUnits).toBeCloseTo(
      home[0] - (port.box.center[0] - port.box.half[0]),
      8,
    );
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

it('certifies the whole handle arc and draw against fixed geometry including the hunting scope', () => {
  for (const assembly of [...designs.map((design) => design.assembly), scoped]) {
    expect(validate(assembly, gunDomain).issues, assembly.name).toEqual([]);
    expect(sweepBoltAction(resolve(assembly, gunDomain)), assembly.name).toEqual([]);
  }
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
  const well = [...resolved.defs.values()]
    .flatMap((def) => def.keepOuts)
    .find(({ id }) => id === 'internal-magazine-well')!;
  if (BOLT_CARTRIDGE.kind !== 'metallic') {
    throw new Error('metallic fixture required');
  }
  const diameter = BOLT_CARTRIDGE.case.rim.diameter.value! / (gunDomain.units.metresPerUnit * 1000);
  expect(model.internalMagazine?.capacity).toBe(Math.floor((2 * well.box.half[1]) / diameter));
  expect(model.internalMagazine?.capacity).toBe(internalMagazineCapacity(resolved, BOLT_CARTRIDGE));
  expect(model.slots?.magazine).toBeUndefined();
  expect(Object.values(model.compatibility ?? {}).some((allowed) => allowed.includes('optic-hunting-3-9x'))).toBe(true);
  expect(model.sight?.kind).toBe('iron');
  expect(model.anchors?.loading_port).toBeDefined();
  const optic = exportGunGlb(
    scoped,
    { id: 'fixture_scoped', file: 'assets/models/fixture_scoped.glb' },
    { variant: 'hunting-rifle' },
    { cartridge: BOLT_CARTRIDGE },
  );
  if (!optic.ok) {
    throw new Error(JSON.stringify(optic.error));
  }
  expect(optic.modelEntry.sight?.kind).toBe('optic');
  expect(buildRegistry([{ source: 'fixture', data: { models: [model, optic.modelEntry] } }]).issues).toEqual([]);
  const { hand } = model.action!;
  expect(
    hand.unlockSimSeconds! +
      hand.rearwardSimSeconds +
      hand.dwellSimSeconds +
      hand.forwardSimSeconds +
      hand.lockSimSeconds!,
  ).toBeLessThanOrEqual(hand.durationSimSeconds);
  for (const phase of ['unlockSimSeconds', 'lockSimSeconds'] as const) {
    const bad = structuredClone(model);
    delete bad.action!.hand[phase];
    expect(buildRegistry([{ source: 'fixture', data: { models: [bad] } }]).issues.length).toBeGreaterThan(0);
  }
});
