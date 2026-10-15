import { expect, it } from 'vitest';
import type { Registry } from '../src/core/content.ts';
import type { Vec3 } from '../src/core/coords.ts';
import { STAIR_BODY_HALF_WIDTH } from '../src/core/stairFlight.ts';
import { templateReachableStandingPositions } from '../src/core/templateSpatial.ts';
import {
  type CompiledTemplate,
  cellsOf,
  compileAssembly,
  compileMapPiece,
  type PlacedPiece,
} from '../src/core/templates.ts';
import { buildBundledContent } from '../src/game/bundledContent.ts';

const content = buildBundledContent();

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

const doorApproachIssues = (registry: Registry, station: CompiledTemplate, occupied: Map<string, string>) => {
  const issues: string[] = [];
  for (const door of station.pieces.filter(({ furniture }) => registry.furniture.get(furniture)?.door)) {
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

it('keeps every furniture disorder alternative clear of walls, furniture and door approaches with every room reachable', () => {
  expect(content.issues).toEqual([]);
  const { registry } = content;
  const assembly = registry.mapAssemblies.get('gauntlet_police_station')!;
  const alternatives = assembly.slots.filter(({ choices }) => choices.length > 1);
  expect(alternatives.length).toBeGreaterThan(0);
  // Each bay is disjoint and outside reserved circulation; cover each local pose without a seed sweep.
  const variants = Math.max(...alternatives.map(({ choices }) => choices.length));
  for (let variant = 0; variant < variants; variant++) {
    const station = compileAssembly(
      registry,
      {
        ...assembly,
        slots: assembly.slots.map((slot) => ({ ...slot, choices: [slot.choices[variant % slot.choices.length]!] })),
      },
      { seed: 1, siteId: 'police_contract' },
    );
    const reached = new Set(templateReachableStandingPositions(registry, station).map((point) => point.join(',')));
    for (const role of ['reception', 'office', 'holding', 'armoury']) {
      expect(reached.has(station.anchors![role]!.at.join(',')), role).toBe(true);
    }
    const cells = Object.entries(station.anchors!).filter(([id]) => id.startsWith('cell_'));
    expect(cells.length).toBeGreaterThan(1);
    for (const [id, anchor] of cells) {
      expect(reached.has(anchor.at.join(',')), id).toBe(true);
    }
    expect(furnitureClearanceIssues(registry, station)).toEqual([]);
    const furnishings = new Set(station.pieces.map(({ furniture }) => furniture));
    for (const furniture of ['desk', 'chair', 'bed', 'gauntlet_cell_bars', 'gauntlet_cell_door']) {
      expect(furnishings.has(furniture), furniture).toBe(true);
    }
    const poseFurniture = alternatives.flatMap(({ choices }) => {
      const { ref } = choices[variant % choices.length]!;
      return compileMapPiece(registry, registry.mapPieces.get(ref.id)!).pieces.map(
        ({ furniture }) => registry.furniture.get(furniture)!,
      );
    });
    expect(poseFurniture.some(({ rest }) => rest === undefined)).toBe(true);
    expect(poseFurniture.some(({ rest }) => rest !== undefined)).toBe(true);
  }
});

it('has no wooden-plank structural surfaces in the police station', () => {
  const { registry } = content;
  const station = compileAssembly(registry, registry.mapAssemblies.get('gauntlet_police_station')!, {
    seed: 1,
    siteId: 'police_material_contract',
  });
  const structural = [...new Set(station.blocks)].map((id) => registry.blocks[id]!).filter(({ solid }) => solid);
  expect(structural.length).toBeGreaterThan(0);
  expect(structural.filter(({ pattern }) => pattern === 'planks')).toEqual([]);
});

it('keeps the office key outside the locked armoury and police weapons and ammunition inside it', () => {
  const { registry } = content;
  const station = compileAssembly(registry, registry.mapAssemblies.get('gauntlet_police_station')!, {
    seed: 1,
    siteId: 'police_contract',
  });
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
    }),
  };
  const sealed = {
    ...station,
    pieces: station.pieces.map((piece) => (piece.lock?.locked ? { ...piece, furniture: sealedId } : piece)),
  };
  const beforeUnlock = templateReachableStandingPositions(sealedRegistry, sealed);
  const afterUnlock = templateReachableStandingPositions(registry, station);
  const officeOnly = templateReachableStandingPositions(
    sealedRegistry,
    {
      ...station,
      pieces: station.pieces.map((piece) =>
        registry.furniture.get(piece.furniture)?.door ? { ...piece, furniture: sealedId } : piece,
      ),
    },
    { entrance: station.anchors!.office!.at },
  );
  const supplies = station.pieces.filter(({ loot }) => loot);
  const secured = supplies.filter((piece) => !near(beforeUnlock, piece));
  expect(secured.length).toBeGreaterThan(0);
  for (const table of ['gauntlet_civilian_guns', 'gauntlet_ammunition', 'gauntlet_police_gear']) {
    const sources = supplies.filter(({ loot }) => loot === table);
    expect(sources.length, table).toBeGreaterThan(0);
    for (const source of sources) {
      expect(secured.includes(source), table).toBe(true);
      expect(near(afterUnlock, source), table).toBe(true);
    }
  }
  const keyDesks = supplies.filter(
    (piece) =>
      piece.furniture === 'desk' &&
      registry.loot
        .get(piece.loot!)!
        .entries.some(({ item }) => item && locks.some(({ lock }) => registry.items.get(item)?.key?.lock === lock!.id)),
  );
  expect(keyDesks.length).toBeGreaterThan(0);
  for (const desk of keyDesks) {
    expect(near(beforeUnlock, desk)).toBe(true);
    expect(near(officeOnly, desk)).toBe(true);
    expect(
      registry.loot
        .get(desk.loot!)!
        .entries.every(
          ({ item }) => item && locks.some(({ lock }) => registry.items.get(item)?.key?.lock === lock!.id),
        ),
    ).toBe(true);
  }
  expect(secured.length).toBeGreaterThan(supplies.length - secured.length);
  for (const lock of locks) {
    expect(registry.furniture.get(lock.furniture)?.door?.prying).toBeDefined();
  }
});
