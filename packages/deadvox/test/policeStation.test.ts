import { expect, it } from 'vitest';
import { BlockEntities } from '../src/core/blockEntities.ts';
import { buildCityPlan, cityGridOf } from '../src/core/cityPlan.ts';
import type { Registry } from '../src/core/content.ts';
import type { Vec3 } from '../src/core/coords.ts';
import { ladderOutward } from '../src/core/ladders.ts';
import { makeScale } from '../src/core/scale.ts';
import type { MapAssemblyDef } from '../src/core/schema.ts';
import { STAIR_BODY_HALF_WIDTH, STAIR_BODY_HEIGHT } from '../src/core/stairFlight.ts';
import { templateReachableStandingPositions, templateWalkingRoute } from '../src/core/templateSpatial.ts';
import {
  type CompiledTemplate,
  cellsOf,
  compileAssembly,
  compileTemplate,
  type PlacedPiece,
} from '../src/core/templates.ts';
import { World } from '../src/core/world.ts';
import { createSession, IDLE } from '../src/game/session.ts';
import { startupContent } from './baseRegistry.ts';
import { FIXTURE_MATERIAL, fixtureBreach } from './economyFixtures.ts';

const content = startupContent();
const authoredAssemblies = (registry: Registry): MapAssemblyDef[] =>
  [...registry.scenarios.values()].flatMap(({ city }) =>
    (city.lots ?? []).flatMap(({ source }) =>
      source?.kind === 'assembly' ? [registry.mapAssemblies.get(source.id)!] : [],
    ),
  );
const near = (positions: Vec3[], piece: PlacedPiece) =>
  positions.some(
    ([x, y, z]) =>
      y === piece.pos[1] &&
      Math.hypot(
        Math.max(piece.pos[0] - x, 0, x - piece.pos[0] - piece.size[0]),
        Math.max(piece.pos[2] - z, 0, z - piece.pos[2] - piece.size[2]),
      ) <=
        STAIR_BODY_HALF_WIDTH + 0.5,
  );
const doorApproachIssues = (registry: Registry, station: CompiledTemplate, occupied: Map<string, string>) => {
  const issues: string[] = [];
  for (const door of station.pieces.filter(
    ({ furniture, size }) => registry.furniture.get(furniture)?.door && size[1] >= STAIR_BODY_HEIGHT,
  )) {
    const across = door.facing === 'e' || door.facing === 'w' ? 0 : 2;
    const faceSize: Vec3 = [...door.size];
    faceSize[across] = 1;
    for (const offset of cellsOf(faceSize)) {
      for (const side of [-1, door.size[across]]) {
        const point = door.pos.map((value, axis) => value + (axis === across ? side : offset[axis]!));
        if (occupied.has(point.join(','))) {
          issues.push(`${door.furniture} blocked approach at ${point}`);
        }
      }
    }
  }
  return issues;
};
const furnitureClearanceIssues = (registry: Registry, station: CompiledTemplate) => {
  const issues: string[] = [];
  const occupied = new Map<string, string>();
  for (const piece of station.pieces) {
    for (const offset of cellsOf(piece.size)) {
      const [x, y, z] = piece.pos.map((value, axis) => value + offset[axis]!) as Vec3;
      const key = [x, y, z].join(',');
      if (
        occupied.has(key) ||
        registry.blocks[station.blocks[x + station.size[0] * (z + station.size[2] * y)]!]!.solid
      ) {
        issues.push(`${piece.furniture} intersects ${occupied.get(key) ?? 'wall'} at ${key}`);
      }
      occupied.set(key, piece.furniture);
    }
  }
  return issues.concat(doorApproachIssues(registry, station, occupied));
};
const stationOf = (registry: Registry) =>
  authoredAssemblies(registry)
    .map((assembly) => compileAssembly(registry, assembly, { seed: 1, siteId: 'police_contract' }))
    .find((template) => template.pieces.some(({ lock }) => lock?.locked))!;

const assemblyClosure = (registry: Registry, roots: MapAssemblyDef[]): MapAssemblyDef[] => {
  const pending = [...roots];
  const seen = new Map<string, MapAssemblyDef>();
  for (const assembly of pending) {
    if (seen.has(assembly.id)) {
      continue;
    }
    seen.set(assembly.id, assembly);
    for (const { ref } of assembly.slots.flatMap((slot) => slot.choices ?? [])) {
      if (ref.kind === 'assembly') {
        pending.push(registry.mapAssemblies.get(ref.id)!);
      }
    }
  }
  return [...seen.values()];
};

it('connects authored compound standing anchors to their entrance', () => {
  expect(content.issues).toEqual([]);
  let checked = 0;
  for (const assembly of authoredAssemblies(content.registry)) {
    const compiled = compileAssembly(content.registry, assembly, { seed: 1, siteId: 'compound_room_routes' });
    for (const [id, anchor] of Object.entries(compiled.anchors ?? {})) {
      if (anchor.kind !== 'standing') {
        continue;
      }
      checked += 1;
      expect(compiled.access, assembly.id).toBeDefined();
      expect(
        templateWalkingRoute(content.registry, compiled, compiled.access!.entrance, anchor.at),
        `${assembly.id} entrance to ${id}`,
      ).toBe(true);
    }
  }
  expect(checked).toBeGreaterThan(0);
});

it('keeps every authored building furnishing pose clear of walls, furniture and door approaches', () => {
  expect(content.issues).toEqual([]);
  const { registry } = content;
  const buildings = authoredAssemblies(registry);
  expect(buildings.length).toBeGreaterThan(0);
  const nested = assemblyClosure(registry, buildings);
  const alternatives = nested.flatMap(({ slots }) =>
    slots.flatMap(({ choices }) => (choices && choices.length > 1 ? [choices] : [])),
  );
  expect(alternatives.length).toBeGreaterThan(0);
  const variants = Math.max(...alternatives.map((choices) => choices.length));
  for (let variant = 0; variant < variants; variant++) {
    const own = {
      ...registry,
      mapAssemblies: new Map([
        ...registry.mapAssemblies,
        ...nested.map(
          (assembly) =>
            [
              assembly.id,
              {
                ...assembly,
                slots: assembly.slots.map((slot) =>
                  slot.choices ? { ...slot, choices: [slot.choices[variant % slot.choices.length]!] } : slot,
                ),
              },
            ] as const,
        ),
      ]),
    };
    for (const assembly of buildings) {
      const compiled = compileAssembly(own, own.mapAssemblies.get(assembly.id)!, {
        seed: 1,
        siteId: 'furnishing_contract',
      });
      expect(furnitureClearanceIssues(own, compiled), assembly.id).toEqual([]);
    }
  }
});

it('places exactly one police armoury in each gauntlet plan', () => {
  const { registry } = content;
  const station = stationOf(registry);
  expect(station).toBeDefined();
  const locks = new Set(station.pieces.flatMap(({ lock }) => (lock ? [lock.id] : [])));
  expect(locks.size).toBeGreaterThan(0);
  const scenarios = [...registry.scenarios.values()];
  expect(scenarios.length).toBeGreaterThan(0);
  for (const scenario of scenarios) {
    const plan = buildCityPlan({ seed: 1, registry, floor: 0, grid: cityGridOf(registry, scenario.city), scenario });
    expect(
      plan.placements.filter(({ template }) => template.pieces.some(({ lock }) => lock && locks.has(lock.id))),
    ).toHaveLength(1);
  }
});

it('has no wooden-plank structural surfaces in the police station', () => {
  const { registry } = content;
  const station = stationOf(registry);
  expect(station).toBeDefined();
  const structural = [...new Set(station.blocks)].map((id) => registry.blocks[id]!).filter(({ solid }) => solid);
  expect(structural.length).toBeGreaterThan(0);
  expect(structural.filter(({ pattern }) => pattern === 'planks')).toEqual([]);
});

const lootItems = (registry: Registry, table: string, seen = new Set<string>()): string[] => {
  if (seen.has(table)) {
    return [];
  }
  seen.add(table);
  return registry.loot.get(table)!.entries.flatMap((entry) => {
    if (entry.item) {
      return [entry.item];
    }
    return entry.table ? lootItems(registry, entry.table, seen) : [];
  });
};

it('keeps police weapons and ammunition behind the armoury lock', () => {
  const { registry } = content;
  const station = stationOf(registry);
  expect(station).toBeDefined();
  const locks = station.pieces.filter(({ lock }) => lock?.locked);
  expect(locks.length).toBeGreaterThan(0);
  const sealedId = 'fixture_sealed_door';
  const sealedRegistry: Registry = {
    ...registry,
    furniture: new Map(registry.furniture).set(sealedId, {
      id: sealedId,
      name: 'Sealed door',
      size: [2, 4, 1],
      color: '#444444',
      breach: fixtureBreach(),
      material: FIXTURE_MATERIAL,
    }),
  };
  const sealed = {
    ...station,
    pieces: station.pieces.map((piece) => (piece.lock?.locked ? { ...piece, furniture: sealedId } : piece)),
  };
  const beforeUnlock = templateReachableStandingPositions(sealedRegistry, sealed);
  const afterUnlock = templateReachableStandingPositions(registry, station);
  const supplies = station.pieces.filter(({ loot }) => loot);
  const secured = supplies.filter((piece) => !near(beforeUnlock, piece));
  expect(secured.length).toBeGreaterThan(0);
  for (const capability of ['firearm', 'ammo'] as const) {
    const sources = supplies.filter(({ loot }) =>
      lootItems(registry, loot!).some((item) => {
        const definition = registry.items.get(item)!;
        const payload = definition.unpack ? registry.items.get(definition.unpack.item) : definition;
        return Boolean(payload?.[capability]);
      }),
    );
    expect(sources.length, capability).toBeGreaterThan(0);
    for (const source of sources) {
      expect(secured.includes(source), source.loot).toBe(true);
      expect(near(afterUnlock, source), source.loot).toBe(true);
    }
  }
});

it('lets a player climb to the fixed matching key beside the roof corpse in the base station and gauntlet', () => {
  const { registry } = content;
  const compound = stationOf(registry);
  const lockIds = new Set(compound.pieces.flatMap(({ lock }) => (lock ? [lock.id] : [])));
  const bases = [...registry.templates.values()]
    .filter(({ palette }) =>
      Object.values(palette).some((entry) => typeof entry === 'object' && entry.lock && lockIds.has(entry.lock.id)),
    )
    .map((definition) => compileTemplate(registry, definition));
  expect(bases.length).toBeGreaterThan(0);
  for (const station of [...bases, compound]) {
    const key = station.groundLoot?.find(
      ({ supply }) => supply.kind === 'fixed' && supply.items.some(({ item }) => lockIds.has(registry.items.get(item)?.key?.lock ?? '')),
    );
    expect(key, station.id).toBeDefined();
    if (!key) {
      throw new Error(`${station.id}: matching roof key is missing`);
    }
    const corpses = station.pieces.filter((piece) => near([key.pos], piece));
    expect(corpses.length, station.id).toBeGreaterThan(0);
    for (const corpse of corpses) {
      const definition = registry.furniture.get(corpse.furniture)!;
      expect(definition.container).toBeDefined();
      expect(definition.solid).toBe(false);
      expect(corpse.pos[1]).toBeGreaterThan(station.access!.entrance[1]);
      const ladders = station.pieces.filter(({ furniture }) => registry.furniture.get(furniture)?.climbable);
      expect(ladders.length).toBeGreaterThan(0);
      const bottom = ladders.reduce((lowest, piece) => (piece.pos[1] < lowest.pos[1] ? piece : lowest));
      const [ox, oz] = ladderOutward(bottom.facing);
      const spawn: Vec3 = [
        bottom.pos[0] + bottom.size[0] / 2 + ox * 2,
        bottom.pos[1],
        bottom.pos[2] + bottom.size[2] / 2 + oz * 2,
      ];
      const entities = new BlockEntities(registry);
      for (const piece of station.pieces) {
        entities.add({
          type: piece.furniture,
          pos: piece.pos,
          size: piece.size,
          facing: piece.facing,
          ...(piece.lock ? { lock: piece.lock } : {}),
        });
      }
      const [sx, sy, sz] = station.size;
      const solid = (x: number, y: number, z: number) =>
        entities.isSolid(x, y, z) ||
        (x >= 0 &&
          x < sx &&
          y >= 0 &&
          y < sy &&
          z >= 0 &&
          z < sz &&
          registry.blocks[station.blocks[x + sx * (z + sz * y)]!]!.solid);
      const scale = makeScale(0.5);
      const session = createSession({
        registry,
        world: new World(),
        entities,
        isSolid: solid,
        isOpaque: solid,
        scale,
        seed: 1,
        start: 43_200,
        spawn,
        ready: () => true,
        controls: {
          active: () => true,
          intent: () => ({ ...IDLE, forward: 1, walk: true }),
          readyHeld: () => false,
          consumeStanceToggle: () => undefined,
          yaw: () => Math.atan2(ox, oz),
          pitch: () => 0,
          walking: () => true,
          descending: () => false,
          useDominant: () => undefined,
        },
        audio: { play: () => undefined },
        notice: () => undefined,
        onRead: () => undefined,
      });
      expect(session.grabLadder(entities.at(...bottom.pos)!)).toBeUndefined();
      const speed = registry.furniture.get(bottom.furniture)!.climbable!.speedMetresPerSimSecond;
      const frames = Math.ceil((((corpse.pos[1] - spawn[1]) * scale.blockSize) / speed + 3) * 60);
      for (let frame = 0; frame < frames && !(session.body.onGround && session.body.pos[1] >= corpse.pos[1]); frame++) {
        session.frame(1 / 60);
      }
      expect(session.body.pos[1], station.id).toBeCloseTo(corpse.pos[1], 3);
      expect(session.body.onGround, station.id).toBe(true);
      expect(session.ladderHold.on, station.id).toBe(false);
      const landing = session.body.pos.map((value) => Math.round(value * 2) / 2) as Vec3;
      const roof = templateReachableStandingPositions(registry, station, { entrance: landing });
      expect(near(roof, corpse), station.id).toBe(true);
    }
  }
});
