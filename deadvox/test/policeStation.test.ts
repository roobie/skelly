import { expect, it } from 'vitest';
import type { Registry } from '../src/core/content.ts';
import type { Vec3 } from '../src/core/coords.ts';
import { STAIR_BODY_HALF_WIDTH } from '../src/core/stairFlight.ts';
import { templateReachableStandingPositions } from '../src/core/templateSpatial.ts';
import { compileAssembly, type PlacedPiece } from '../src/core/templates.ts';
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

it('connects the police reception, office, holding cells and armoury without sealing off their furniture', () => {
  expect(content.issues).toEqual([]);
  const { registry } = content;
  const assembly = registry.mapAssemblies.get('gauntlet_police_station')!;
  const station = compileAssembly(registry, assembly, { seed: 1, siteId: 'police_contract' });
  const reached = new Set(templateReachableStandingPositions(registry, station).map((point) => point.join(',')));
  for (const role of ['reception', 'office', 'holding', 'armoury']) {
    const anchor = station.anchors![role]!;
    expect(anchor, role).toBeDefined();
    expect(reached.has(anchor.at.join(',')), role).toBe(true);
  }
  const cells = Object.entries(station.anchors!).filter(([id]) => id.startsWith('cell_'));
  expect(cells.length).toBeGreaterThan(1);
  for (const [id, anchor] of cells) {
    expect(reached.has(anchor.at.join(',')), id).toBe(true);
  }
  const furnishings = new Set(station.pieces.map(({ furniture }) => furniture));
  for (const furniture of ['desk', 'chair', 'bed', 'gauntlet_cell_bars', 'gauntlet_cell_door']) {
    expect(furnishings.has(furniture), furniture).toBe(true);
  }
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
