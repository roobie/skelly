import { readFileSync } from 'node:fs';
import { localSolidBounds, penetrationWorld, worldSolid } from '@skelly/engine/core/geometry.ts';
import { IDENTITY, sub } from '@skelly/engine/core/math.ts';
import { resolve } from '@skelly/engine/core/resolve.ts';
import type { Assembly, Solid } from '@skelly/engine/core/schema.ts';
import { validate } from '@skelly/engine/core/validate.ts';
import { expect, it } from 'vitest';
import { parseCartridgeJson } from '../src/ammo/parseCartridge.ts';
import { exportFileText } from '../src/cli/exportFile.ts';
import { resolveGunAction } from '../src/gun/actionDescription.ts';
import { gunDomain } from '../src/gun/domain.ts';
import { PUMP_ACTION_TRAVEL_U, PUMP_LOADING_PORT_X } from '../src/gun/pumpShell.ts';
import { tubeMagazineCapacity } from '../src/gun/tubeCapacity.ts';
import { loadDesigns } from './helpers.ts';

const { assembly } = loadDesigns().find((entry) => entry.assembly.name === 'archetype-pump-shotgun')!;
const parsed = parseCartridgeJson(readFileSync('cartridges/12-gauge-00-buck.json', 'utf8'));
if (!parsed.ok || parsed.cartridge.kind !== 'shotshell') {
  throw new Error('missing shell fixture');
}
const shell = parsed.cartridge;

it('exports a hand-only coupled 12-gauge action and an integral tube without box round poses', () => {
  const out = exportFileText(
    readFileSync('designs/archetype-pump-shotgun.json', 'utf8'),
    { id: 'shotgun_pump', file: 'assets/models/shotgun_pump.glb' },
    { cartridge: shell },
  );
  if (!out.ok) {
    throw new Error(out.message);
  }
  expect(out.warnings).toEqual([]);
  expect(out.modelEntry.calibre).toBe(shell.id);
  expect(out.modelEntry.tube).toEqual({ capacity: 4 });
  expect(out.modelEntry.capacity).toBeUndefined();
  expect(out.modelEntry.rounds).toBeUndefined();
  const action = out.modelEntry.action!;
  expect(action.fire).toBeUndefined();
  expect(action.roundsPerSimMinute).toBeUndefined();
  expect(action.parts.carrier).toMatchObject({
    node: 'bolt-carrier:bolt-carrier',
    strokeMetres: 0.063_25,
    modes: ['hand'],
  });
  expect(action.parts.forend).toMatchObject({ node: 'forend:forend', strokeMetres: 0.063_25, modes: ['hand'] });
  expect(action.ejectAt).toBeGreaterThan(0);
  expect(action.ejectAt).toBeLessThan(1);
  expect(Math.hypot(...action.ejectDirection)).toBeCloseTo(1, 9);
  expect(action.ejectDirection[2]).toBeGreaterThan(0);
  expect(out.modelEntry.anchors!.ejection).toEqual([-0.033_062, 0, 0.017_25]);
  expect(out.modelEntry.anchors!.loading_port).toEqual([-0.0575, -0.040_25, 0]);
  const description = resolveGunAction(resolve(assembly, gunDomain))!;
  const { hand } = description.cycle;
  expect(hand.at(hand.rearwardSeconds / 2)).toBeCloseTo(0.5, 9);
  expect(hand.at(hand.rearwardSeconds)).toBe(1);
  expect(hand.at(hand.rearwardSeconds + hand.dwellSeconds + hand.forwardSeconds / 2)).toBeCloseTo(0.5, 9);
  expect(hand.at(hand.rearwardSeconds + hand.dwellSeconds + hand.forwardSeconds)).toBe(0);
});

it('fits capacity from the loaded envelope and changes it with actual tube geometry', () => {
  const resolved = resolve(assembly, gunDomain);
  const baseCapacity = tubeMagazineCapacity(resolved, shell);
  const tubeLength = (result: ReturnType<typeof resolve>) => {
    const tube = result.defs.get('tube')!.solids.find(({ id }) => id === 'tube')!;
    const [min, max] = localSolidBounds(tube);
    return max[0] - min[0];
  };
  const loadedLengthUnits = shell.length.loaded.value! / (resolved.domain.units.metresPerUnit * 1000);
  if (baseCapacity === undefined) {
    throw new Error('The generated base tube must fit at least one loaded shell.');
  }
  expect(baseCapacity).toBeGreaterThan(0);
  expect(baseCapacity * loadedLengthUnits).toBeLessThanOrEqual(tubeLength(resolved));
  const longer: Assembly = {
    ...assembly,
    parts: { ...assembly.parts, tube: { family: 'tube-magazine', params: { lengthPercent: '100' } } },
  };
  const longerResolved = resolve(longer, gunDomain);
  const longerCapacity = tubeMagazineCapacity(longerResolved, shell);
  if (longerCapacity === undefined) {
    throw new Error('The longer generated tube must fit at least one loaded shell.');
  }
  expect(longerCapacity).toBeGreaterThan(baseCapacity);
  expect(longerCapacity * loadedLengthUnits).toBeLessThanOrEqual(tubeLength(longerResolved));
  const nominalLengthCapacity = tubeMagazineCapacity(resolved, {
    ...shell,
    length: { ...shell.length, loaded: shell.length.nominal },
  });
  expect(nominalLengthCapacity).toBeLessThan(baseCapacity);
  expect(() =>
    tubeMagazineCapacity(resolved, {
      ...shell,
      head: { ...shell.head, rimDiameter: { ...shell.head.rimDiameter, value: 24 } },
    }),
  ).toThrow('rim');
});

it('opens a source-sized single-shell mouth rather than placing its loading anchor on solid metal', () => {
  const resolved = resolve(assembly, gunDomain);
  const receiver = resolved.defs.get('receiver')!;
  const mouth = receiver.keepOuts.find((volume) => volume.id === 'loading-port')!.box;
  expect(2 * mouth.half[0] * 11.5).toBeGreaterThan(shell.length.loaded.value!);
  expect(2 * mouth.half[2] * 11.5).toBeGreaterThan(shell.head.rimDiameter.value!);
  expect(PUMP_LOADING_PORT_X).toEqual([-8, -2]);
  const point: Solid = {
    id: 'probe',
    kind: 'box',
    box: { center: [mouth.center[0], mouth.center[1] + mouth.half[1] + 0.125, 0], half: [0.05, 0.05, 0.05] },
  };
  for (const solid of receiver.solids) {
    expect(penetrationWorld(worldSolid(IDENTITY, solid), worldSolid(IDENTITY, point)), solid.id).toBeLessThanOrEqual(
      1e-7,
    );
  }
});

it('clears every fixed solid over the exact whole coupled stroke, without keep-out exemptions', () => {
  const report = validate(assembly, gunDomain);
  expect(report.issues).toEqual([]);
  const { resolved } = report;
  const action = resolveGunAction(resolved)!;
  const moving = new Set(Object.values(action.parts).map((part) => part.id));
  const fixed = [...resolved.defs]
    .filter(([id]) => !moving.has(id))
    .flatMap(([id, def]) =>
      def.solids.map((solid) => ({ id: `${id}.${solid.id}`, shape: worldSolid(resolved.placed.get(id)!, solid) })),
    );
  for (const part of Object.values(action.parts)) {
    expect(part.travel).toEqual([-PUMP_ACTION_TRAVEL_U, 0, 0].map((value) => expect.closeTo(value, 9)));
    const [delta] = sub(part.def.motion!.end, part.def.motion!.start);
    for (const solid of part.def.solids) {
      let swept: Solid;
      if (solid.kind === 'box') {
        const [min, max] = localSolidBounds(solid);
        swept = {
          ...solid,
          box: {
            center: [solid.box.center[0] + delta / 2, solid.box.center[1], solid.box.center[2]],
            half: [(max[0] - min[0] + Math.abs(delta)) / 2, solid.box.half[1], solid.box.half[2]],
          },
        };
      } else if (solid.kind === 'extruded-polygon' && solid.axis === 'x' && !solid.clip) {
        swept = { ...solid, z: [solid.z[0] + Math.min(0, delta), solid.z[1] + Math.max(0, delta)] };
      } else {
        throw new Error('exact axial sweep needs boxes or unclipped axial prisms');
      }
      const shape = worldSolid(part.placed, swept);
      for (const obstacle of fixed) {
        expect(penetrationWorld(shape, obstacle.shape), `${part.id}.${solid.id} vs ${obstacle.id}`).toBeLessThanOrEqual(
          1e-7,
        );
      }
    }
  }
});
