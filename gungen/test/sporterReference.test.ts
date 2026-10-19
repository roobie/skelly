import { readFileSync } from 'node:fs';
import { distanceWorld, obbPolyhedron, penetrationWorld, worldSolid } from '@skelly/engine/core/geometry.ts';
import { add, applyDir, applyPoint, IDENTITY, type Vec3 } from '@skelly/engine/core/math.ts';
import { meshForSolidGroup } from '@skelly/engine/core/mesh.ts';
import { resolve } from '@skelly/engine/core/resolve.ts';
import type { BoxSolid, PartFamily, Resolved } from '@skelly/engine/core/schema.ts';
import { expect, it } from 'vitest';
import { GUN_ANCHORS } from '../src/gun/anchorData.ts';
import { boltCartridge } from '../src/gun/boltCartridge.ts';
import { sweepBoltAction } from '../src/gun/boltSweep.ts';
import { loadGunDesign } from '../src/gun/designLoader.ts';
import { gunDomain } from '../src/gun/domain.ts';
import { internalMagazineLayout } from '../src/gun/internalMagazine.ts';
import { FAMILIES } from '../src/gun/parts.ts';
import { expectWatertightMesh, type MutableAssembly } from './helpers.ts';

const loaded = loadGunDesign(readFileSync(new URL('../designs/hunting-rifle.json', import.meta.url), 'utf8'));
if (!loaded.ok) {
  throw new Error(JSON.stringify(loaded.error));
}
const hunting = loaded.design.assembly;
const owner = (resolved: Resolved, family: string): string => {
  const entry = [...resolved.defs].find(([, def]) => def.family === family);
  if (!entry) {
    throw new Error(`Fixture needs ${family}`);
  }
  return entry[0];
};
const furnitureVertices = (resolved: Resolved, id: string): Vec3[] =>
  resolved.defs
    .get(id)!
    .solids.filter((solid) => solid.slot === 'furniture')
    .flatMap((solid) => {
      const shape = worldSolid(resolved.placed.get(id)!, solid);
      return [...('vertices' in shape ? shape : obbPolyhedron(shape)).vertices];
    });

it.each(['stock', 'handguard'])('keeps the carved sporter wood watertight: %s', (family) => {
  const resolved = resolve(hunting, gunDomain);
  const wood = resolved.defs.get(owner(resolved, family))!.solids.filter((solid) => solid.slot === 'furniture');
  expect(wood.length).toBeGreaterThan(0);
  expectWatertightMesh(meshForSolidGroup(wood), `carved ${family}`);
});

it('keeps the plain wood bed mount without advertising absent accessory rails', () => {
  const resolved = resolve(hunting, gunDomain);
  const { ports } = resolved.defs.get(owner(resolved, 'handguard'))!;
  expect(ports.some(({ mount }) => mount === 'handguard')).toBe(true);
  expect(ports.filter(({ mount }) => mount.startsWith('rail-'))).toEqual([]);
});

it('fits the staggered stack through the stock aperture clear of the full bolt sweep', () => {
  const resolved = resolve(hunting, gunDomain);
  const layout = internalMagazineLayout(resolved, boltCartridge())!;
  expect(layout.column.rounds.length).toBeGreaterThan(1);
  const { well, diameter, roundLength, placed, column } = layout;
  const packed: BoxSolid[] = column.rounds.map((round, index) => {
    const centre: Vec3 = [round.position[0], round.position[1], well.center[2] + round.z];
    const half: Vec3 = [roundLength / 2, diameter / 2, diameter / 2];
    for (const axis of [0, 1, 2]) {
      expect(Math.abs(centre[axis]! - well.center[axis]!) + half[axis]!).toBeLessThanOrEqual(well.half[axis]! + 1e-8);
    }
    return { id: `packed-${index}`, kind: 'box', box: { center: applyPoint(placed, centre), half } };
  });
  for (let index = 0; index < column.rounds.length; index++) {
    for (const other of column.rounds.slice(index + 1)) {
      const round = column.rounds[index]!;
      expect(Math.hypot(round.position[1] - other.position[1], round.z - other.z)).toBeGreaterThanOrEqual(
        diameter - 1e-8,
      );
    }
  }
  const fixed = [...resolved.defs]
    .filter(([id]) => id !== layout.owner)
    .flatMap(([id, def]) => def.solids.map((solid) => worldSolid(resolved.placed.get(id)!, solid)));
  for (const round of packed) {
    for (const obstacle of fixed) {
      expect(penetrationWorld(worldSolid(IDENTITY, round), obstacle)).toBeLessThan(1e-8);
    }
  }
  const receiver = owner(resolved, 'receiver');
  const rail = resolved.defs.get(receiver)!.ports.find(({ id }) => id === 'rail')!;
  const transform = resolved.placed.get(receiver)!;
  const family: PartFamily = {
    name: 'packed-fixture',
    params: {},
    build: () => ({
      family: 'packed-fixture',
      solids: packed,
      keepOuts: [],
      axes: [],
      ports: [
        {
          id: 'base',
          mount: rail.mount,
          gender: 'male',
          pos: applyPoint(transform, rail.pos),
          normal: applyDir(transform, rail.normal).map((value) => -value) as unknown as Vec3,
          up: applyDir(transform, rail.up),
        },
      ],
    }),
  };
  const fixture = {
    ...hunting,
    parts: { ...hunting.parts, packed: { family: family.name } },
    connections: [...hunting.connections, { from: `${receiver}.rail`, to: 'packed.base', slot: 0 }],
  };
  expect(
    sweepBoltAction(resolve(fixture, { ...gunDomain, families: { ...gunDomain.families, [family.name]: family } })),
  ).toEqual([]);
});

const stock = FAMILIES.stock!.params;
const stockOptions = [
  { length: stock.length!.values[0]!, combDegrees: stock.combDegrees!.values[0]! },
  { length: stock.length!.values.at(-1)!, combDegrees: stock.combDegrees!.values.at(-1)! },
];
it.each(stockOptions)(
  'keeps the stock and action-bed underside and width joined when the stock changes: $length/$combDegrees',
  (options) => {
    const assembly = structuredClone(hunting) as MutableAssembly;
    const part = Object.values(assembly.parts).find(({ family }) => family === 'stock')!;
    part.params = { ...part.params, ...options };
    const resolved = resolve(assembly, gunDomain);
    const stockId = owner(resolved, 'stock');
    const bedId = owner(resolved, 'handguard');
    const front = resolved.defs.get(stockId)!.ports.find(({ id }) => id === 'front')!;
    const joint = applyPoint(resolved.placed.get(stockId)!, front.pos);
    const section = (id: string) => furnitureVertices(resolved, id).filter(([x]) => Math.abs(x - joint[0]) < 1e-7);
    const stockSection = section(stockId);
    const bedSection = section(bedId);
    expect(stockSection.length).toBeGreaterThan(0);
    expect(bedSection.length).toBeGreaterThan(0);
    expect(Math.min(...stockSection.map((point) => point[1]))).toBeCloseTo(
      Math.min(...bedSection.map((point) => point[1])),
      7,
    );
    expect(Math.max(...stockSection.map((point) => Math.abs(point[2] - joint[2])))).toBeCloseTo(
      Math.max(...bedSection.map((point) => Math.abs(point[2] - joint[2]))),
      7,
    );
  },
);

it.each([FAMILIES.barrel!.params.length!.values[0]!, FAMILIES.barrel!.params.length!.values.at(-1)!])(
  'keeps the support palm on the sloping fore-end skin as barrel length changes: %s',
  (length) => {
    const assembly = structuredClone(hunting) as MutableAssembly;
    const barrel = Object.values(assembly.parts).find(({ family }) => family === 'barrel')!;
    barrel.params = { ...barrel.params, length };
    const resolved = resolve(assembly, gunDomain);
    const id = owner(resolved, 'handguard');
    const def = resolved.defs.get(id)!;
    const params = Object.fromEntries(
      Object.entries(resolved.params.get(id)!).map(([key, param]) => [key, param.value]),
    );
    const anchor = GUN_ANCHORS.handguard!.anchors(params, def).support;
    expect(anchor).toBeDefined();
    const point = applyPoint(resolved.placed.get(id)!, anchor!.position);
    const solids = def.solids.map((solid) => worldSolid(resolved.placed.get(id)!, solid));
    const distance = (position: Vec3) =>
      Math.min(...solids.map((solid) => distanceWorld({ center: position, half: [0, 0, 0], r: IDENTITY.r }, solid)));
    expect(distance(point)).toBeLessThan(1e-7);
    expect(distance(add(point, [0, -1e-3, 0]))).toBeGreaterThan(1e-7);
    expect(distance(add(point, [0, 1e-3, 0]))).toBeLessThan(1e-7);
  },
);
