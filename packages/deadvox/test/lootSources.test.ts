// biome-ignore-all lint/suspicious/noMisplacedAssertion: Shared routing assertions are called only by tests.

import type { Registry } from '@skelly/engine/content';
import { AuthoredSite } from '@skelly/engine/internal/core/authoredSite.ts';
import { StressCity } from '@skelly/engine/internal/core/city.ts';
import { dropSpots } from '@skelly/engine/internal/core/inventory.ts';
// biome-ignore lint/performance/noNamespaceImport: The spy observes the actual site-to-selector handoff.
import * as selection from '@skelly/engine/internal/core/loot.ts';
import { placementLootIssues } from '@skelly/engine/internal/core/placementLoot.ts';
import { lootSourcesOf, type Site } from '@skelly/engine/internal/core/site.ts';
import { compileTemplate, placedPieces } from '@skelly/engine/internal/core/templates.ts';
import { PILE_GRID } from '@skelly/engine/inventory';
import { createSession, IDLE } from '@skelly/engine/session';
import { handlingMoveCompleteCue } from '@skelly/engine/sound';
import { CHUNK, makeScale, type Placement, toChunk, type Vec3, World } from '@skelly/engine/world';
import { describe, expect, it, vi } from 'vitest';
import { stackActorFigureFiles, withFixtureFigures } from './baseContentFiles.ts';
import { startupContent } from './baseRegistry.ts';
import { fixtureEconomy } from './economyFixtures.ts';

const content = startupContent();
const stock = 'fixture_economy_stock';
const CORPSE_FIXTURE = 'fixture_corpse';
const fixtureRegistry = (): Registry => {
  const base = content.registry;
  const registry = {
    ...base,
    items: new Map(base.items),
    itemEconomy: new Map(base.itemEconomy),
    loot: new Map(base.loot),
    furniture: new Map(base.furniture),
    templates: new Map(base.templates),
  };
  registry.items.set(stock, {
    id: stock,
    name: 'Fixture stock',
    category: 'misc',
    size: [1, 1],
    weight: 1,
    workInProgress: false,
  });
  registry.itemEconomy.set(stock, { id: stock, ...fixtureEconomy(), notLoot: false });
  for (const [id] of registry.loot) {
    registry.loot.set(id, { id, rolls: [1, 1], entries: [{ item: stock, weight: 1 }] });
  }
  registry.loot.set('fixture_source', { id: 'fixture_source', rolls: [1, 1], entries: [{ item: stock, weight: 1 }] });
  const container = [...base.furniture.values()].find((definition) => definition.container !== undefined)!;
  registry.furniture.set('fixture_container', { ...container, id: 'fixture_container', size: [1, 1, 1] });
  registry.templates.set('fixture_template', {
    id: 'fixture_template',
    lootContext: { usage: ['Residential'], tier: 'Tier1' },
    size: [1, 1, 1],
    palette: { F: { furniture: 'fixture_container', loot: 'fixture_source' } },
    layers: [['F']],
  });
  return registry;
};

const sourceColumn = (placements: readonly Placement[]) => {
  const piece = placements.flatMap(placedPieces).find((candidate) => candidate.loot !== undefined);
  if (!piece) {
    throw new Error('Source fixture needs one table-bearing furniture anchor');
  }
  return [toChunk(piece.pos[0]), toChunk(piece.pos[2])] as const;
};

const expectRoutedColumn = (site: Site, placements: readonly Placement[]) => {
  const [cx, cz] = sourceColumn(placements);
  const points = site.lootPointsIn(cx, cz);
  expect(points.length).toBeGreaterThan(0);
  const roll = vi.spyOn(selection, 'rollLootParts');
  const spawns = site.furnitureIn(cx, cz);
  expect(roll.mock.calls.map(([, point]) => point.id)).toEqual(expect.arrayContaining(points.map((point) => point.id)));
  roll.mockRestore();
  expect(spawns.flatMap((spawn) => [...spawn.loot, ...(spawn.surfaceLoot ?? [])]).length).toBeGreaterThan(0);
  for (const spawn of spawns) {
    for (const [channel, entries] of [
      ['container', spawn.loot],
      ['surface', spawn.surfaceLoot ?? []],
    ] as const) {
      for (const entry of entries) {
        const point = points.find(
          (candidate) =>
            candidate.channel === channel &&
            candidate.destination.every((value, axis) => value === spawn.spec.pos[axis]),
        );
        expect(point).toBeDefined();
        expect(entry.count).toBeGreaterThan(0);
      }
    }
  }
};

describe('loot source routing', () => {
  it('keeps exact anchor tiers local and gives fixed-loot tiers precedence in rolls and admission', () => {
    const registry = fixtureRegistry();
    registry.itemEconomy.set(stock, { id: stock, usage: ['Hunting'], tiers: ['Tier2'], notLoot: false });
    const template = compileTemplate(registry, {
      id: 'fixture_tiers',
      size: [3, 1, 1],
      lootContext: { usage: ['Hunting'], tier: 'Tier1', lowerTiers: true },
      palette: {
        A: { furniture: 'fixture_container', loot: 'fixture_source', lootTier: 'Tier2', items: [{ item: stock }] },
        B: { furniture: 'fixture_container', loot: 'fixture_source' },
        C: { furniture: 'fixture_container', loot: 'fixture_source', lootTier: 'Tier3' },
      },
      layers: [['ABC']],
    });
    const placement: Placement = { template, origin: [0, 0, 0], turn: 0 };
    const sources = lootSourcesOf(registry, 'fixture_site', placement);
    expect(sources.map(({ context }) => context.tier)).toEqual(['Tier2', 'Tier1', 'Tier3']);
    expect(sources[0]!.context.lowerTiers).toBeUndefined();
    expect(
      sources.map((source) => selection.economyEligible(registry.itemEconomy.get(stock)!, source.context)),
    ).toEqual([true, false, false]);
    const override = {
      at: [2, 0, 0] as [number, number, number],
      lootTier: 'Tier2' as const,
      items: [{ item: stock }],
    };
    const overridden = lootSourcesOf(registry, 'fixture_site', placement, [override]);
    expect(overridden[2]!.context).toEqual({ usage: ['Hunting'], tier: 'Tier2' });
    expect(selection.economyEligible(registry.itemEconomy.get(stock)!, overridden[2]!.context)).toBe(true);
    const input = { registry, context: template.lootContext };
    expect(placementLootIssues(input, template, [override], 'fixture')).toEqual([]);
    const { lootTier: _tier, ...withoutTier } = override;
    expect(placementLootIssues(input, template, [withoutTier], 'fixture').length).toBeGreaterThan(0);
    const refused = placementLootIssues(
      input,
      template,
      [{ ...override, at: [0, 0, 0], lootTier: 'Tier1' }],
      'fixture',
    );
    expect(refused.some(([path]) => path.includes('.pieces[0].items'))).toBe(true);
  });

  it('routes city and authored-layout sources through their enumerated points', () => {
    const registry = fixtureRegistry();
    const scale = makeScale(0.5);
    const city = new StressCity(17, registry, scale);
    expectRoutedColumn(city, city.placements);
    const authored = new AuthoredSite(17, registry, scale, {
      id: 'fixture_layout',
      lootContext: { usage: ['Residential'], tier: 'Tier1' },
      bounds: { x0: -16, z0: -16, x1: 16, z1: 16 },
      ground: 0,
      terrain: [],
      buildings: [
        {
          template: 'fixture_template',
          position: [0, 0, 0],
          rotation: 0,
          fixedLoot: [{ at: [0, 0, 0], items: [{ item: stock }, { item: stock, placement: 'surface' }] }],
        },
      ],
      player: { position: [4, 0, 4], bearing: 0 },
      actors: [],
      woodlands: [],
      tracks: [],
    });
    expectRoutedColumn(authored, authored.placements);
  });

  const actorDropWorld = (ground: boolean, block: number) => {
    const world = new World();
    if (ground) {
      for (let x = 2; x <= 6; x++) {
        for (let z = -1; z <= 1; z++) {
          world.setBlock(x, 0, z, block);
        }
      }
    }
    return world;
  };

  interface DropScene {
    session: ReturnType<typeof createSession>;
    world: World;
    block: number;
    pos: Vec3;
  }
  const actorDropScene = ({
    ground = true,
    full = false,
    drops = true,
    zombieReady: actorReady = true,
    prepare,
  }: {
    ground?: boolean;
    full?: boolean;
    drops?: boolean;
    zombieReady?: boolean;
    prepare?: (scene: DropScene) => void;
  } = {}) => {
    const registry = fixtureRegistry();
    const severed = 'fixture_severed_item';
    registry.items.set(severed, { ...registry.items.get(stock)!, id: severed });
    registry.itemEconomy.set(severed, { ...registry.itemEconomy.get(stock)!, id: severed });
    const bulk = 'fixture_bulk';
    registry.items.set(bulk, { ...registry.items.get(stock)!, id: bulk, size: [PILE_GRID.w, PILE_GRID.h] });
    registry.itemEconomy.set(bulk, { ...registry.itemEconomy.get(stock)!, id: bulk });
    const forbidden = 'fixture_forbidden';
    registry.items.set(forbidden, { ...registry.items.get(stock)!, id: forbidden });
    registry.itemEconomy.set(forbidden, { id: forbidden, usage: ['Military'], tiers: ['Tier2'], notLoot: false });
    const table = 'fixture_corpse_supply';
    registry.loot.set(table, {
      id: table,
      rolls: drops ? [1, 1] : [0, 0],
      entries: [
        { item: stock, weight: 1 },
        { item: forbidden, weight: 100 },
      ],
    });
    const block = registry.blocks.findIndex((entry) => entry.solid);
    const world = actorDropWorld(ground, block);
    const solid = (x: number, y: number, z: number) => registry.blocks[world.getBlock(x, y, z)]!.solid;
    const play = vi.fn();
    const notice = vi.fn();
    const moveSounds: string[] = [];
    const session: ReturnType<typeof createSession> = createSession({
      registry,
      actorFigureFiles: withFixtureFigures(stackActorFigureFiles(registry), {
        [CORPSE_FIXTURE]: [...registry.actors.keys()][0]!,
      }),
      world,
      isSolid: solid,
      isOpaque: () => false,
      scale: makeScale(0.5),
      seed: 17,
      start: 0,
      spawn: [0, 0, 0],
      ready: () => !actorReady,
      actorReady: () => actorReady,
      controls: {
        active: () => false,
        intent: () => IDLE,
        yaw: () => 0,
        pitch: () => 0,
        walking: () => false,
        descending: () => false,
      },
      audio: {
        play,
        onMoveComplete: (move) => {
          const cue = handlingMoveCompleteCue(move, registry, {
            blockIdAt: (x, y, z) => world.getBlock(x, y, z),
            entities: session.inventory.entities,
            vehicles: session.inventory.vehicles,
            blockSize: 0.5,
          });
          if (cue) {
            moveSounds.push(cue.event);
          }
        },
      },
      notice,
      onRead: () => undefined,
    });
    const pos: Vec3 = [4, 4, 0];
    if (full) {
      const landed = session.inventory.landing(pos);
      if (!landed) {
        throw new Error('Full-landing fixture needs ground');
      }
      expect(session.inventory.add(session.inventory.create(bulk), { kind: 'pile', pos: landed })).toBe(true);
    }
    prepare?.({ session, world, block, pos });
    const base = [...registry.actors.values()][0]!;
    const id = session.actors.add(
      {
        ...base,
        id: CORPSE_FIXTURE,
        loot: table,
        dismember: { chance: 0, headOnKillChance: 0 },
        severedItems: {
          head: null,
          torso: null,
          leftArm: drops ? severed : null,
          rightArm: null,
          leftLeg: null,
          rightLeg: null,
        },
      },
      pos,
    );
    session.actors.detonate({
      blast: { damageKind: 'blunt', radiusMetres: 6, damage: 1_000_000, impulse: 1 },
      fragments: { damageKind: 'pierce', origin: [0, 4, 0], directions: [], damage: 0, impulse: 0, rangeMetres: 0 },
    });
    return { session, registry, world, block, solid, id, pos, severed, forbidden, play, notice, moveSounds };
  };

  it.each([false, true])('lands admitted death and severing drops (first landing full: %s)', (full) => {
    const { session, solid, id, severed, forbidden } = actorDropScene({ full });
    expect(session.actorStore.get(id)).toBeUndefined();
    const items = [...session.inventory.items()].map(({ item }) => item);
    const dropped = items.filter((item) => item.type === stock);
    expect(dropped.length).toBeGreaterThan(0);
    expect(items.some((item) => item.type === forbidden)).toBe(false);
    expect(items.some((item) => item.type === severed)).toBe(true);
    const emissions = [...session.inventory.items()].filter(({ item }) => [stock, severed].includes(item.type));
    expect(
      emissions.every(
        ({ location }) =>
          location.kind === 'pile' && solid(location.pile.pos[0], location.pile.pos[1] - 1, location.pile.pos[2]),
      ),
    ).toBe(true);
  });

  it('lands zombie emissions beyond full first-ring piles on their connected level floor', () => {
    const ring: Vec3[] = [];
    const f = actorDropScene({
      ground: false,
      prepare: ({ session, world, block, pos }) => {
        const columnStart = toChunk(pos[0]) * CHUNK;
        for (let x = columnStart - CHUNK; x < columnStart + 2 * CHUNK; x++) {
          world.setBlock(x, 0, pos[2], block);
          if (toChunk(x) === toChunk(pos[0])) {
            expect(
              session.inventory.add(session.inventory.create('fixture_bulk'), { kind: 'pile', pos: [x, 1, pos[2]] }),
            ).toBe(true);
          }
        }
        for (const spot of dropSpots(pos)) {
          const landed = session.inventory.landing(spot);
          if (landed) {
            ring.push(landed);
          }
        }
      },
    });
    const emissions = [...f.session.inventory.items()].filter(({ item }) => [stock, f.severed].includes(item.type));
    expect(emissions.map(({ item }) => item.type)).toEqual(expect.arrayContaining([stock, f.severed]));
    for (const { location } of emissions) {
      expect(location.kind).toBe('pile');
      if (location.kind !== 'pile') {
        throw new Error('Zombie emission is not piled');
      }
      const [x, y, z] = location.pile.pos;
      expect(ring.some((cell) => cell.every((value, axis) => value === location.pile.pos[axis]))).toBe(false);
      expect(ring.some((cell) => cell[1] === y)).toBe(true);
      expect(f.solid(x, y - 1, z)).toBe(true);
      expect(toChunk(x)).not.toBe(toChunk(f.pos[0]));
      const columnStart = toChunk(f.pos[0]) * CHUNK;
      expect(Math.abs(x - f.pos[0])).toBe(Math.min(f.pos[0] - columnStart + 1, columnStart + CHUNK - f.pos[0]));
      expect(Math.abs(toChunk(x) - toChunk(f.pos[0])) <= 1 && Math.abs(toChunk(z) - toChunk(f.pos[2])) <= 1).toBe(true);
    }
  });

  it.each([true, false])(
    'silently loses all-full emissions without exceeding the body search (ready: %s)',
    (actorReady) => {
      let pilesBefore: string[] = [];
      const floorReads: Vec3[] = [];
      const prepare = ({ session, world, block, pos }: DropScene) => {
        const left = (toChunk(pos[0]) - 1) * CHUNK;
        const right = (toChunk(pos[0]) + 2) * CHUNK;
        for (let x = left - 1; x <= right; x++) {
          world.setBlock(x, 0, pos[2], block);
          if (
            actorReady ? x >= left && x < right : dropSpots(pos).some((spot) => spot[0] === x && spot[2] === pos[2])
          ) {
            expect(
              session.inventory.add(session.inventory.create('fixture_bulk'), { kind: 'pile', pos: [x, 1, pos[2]] }),
            ).toBe(true);
          }
        }
        pilesBefore = [...session.inventory.piles.keys()];
        const getBlock = world.getBlock.bind(world);
        vi.spyOn(world, 'getBlock').mockImplementation((x, y, z) => {
          if (y === 0) {
            floorReads.push([x, y, z]);
          }
          return getBlock(x, y, z);
        });
      };
      const withoutDrops = actorDropScene({ ground: false, drops: false, zombieReady: actorReady, prepare });
      const f = actorDropScene({ ground: false, zombieReady: actorReady, prepare });
      expect([...f.session.inventory.items()].filter(({ item }) => [stock, f.severed].includes(item.type))).toEqual([]);
      expect([...f.session.inventory.piles.keys()]).toEqual(pilesBefore);
      expect(f.notice).not.toHaveBeenCalled();
      expect(f.play.mock.calls).toEqual(withoutDrops.play.mock.calls);
      expect(floorReads.length).toBeGreaterThan(0);
      for (const [x, , z] of floorReads) {
        expect(Math.abs(toChunk(x) - toChunk(f.pos[0])) <= 1 && Math.abs(toChunk(z) - toChunk(f.pos[2])) <= 1).toBe(
          true,
        );
        if (!actorReady) {
          expect(dropSpots(f.pos).some((spot) => spot[0] === x && spot[2] === z)).toBe(true);
        }
      }
    },
  );

  it('silently loses death loot and severed items with no ground, leaving later hand moves safe', () => {
    const supported = actorDropScene();
    expect([...supported.session.inventory.items()].map(({ item }) => item.type)).toEqual(
      expect.arrayContaining([stock, supported.severed]),
    );
    const withoutDrops = actorDropScene({ ground: false, drops: false });
    const f = actorDropScene({ ground: false });
    for (const spot of dropSpots([4, 4, 0])) {
      expect(f.session.inventory.landing(spot)).toBeUndefined();
    }
    expect(f.session.actorStore.get(f.id)).toBeUndefined();
    expect(f.session.inventory.piles.size).toBe(0);
    expect([...f.session.inventory.items()]).toEqual([]);
    expect(f.notice).not.toHaveBeenCalled();
    expect(f.play.mock.calls).toEqual(withoutDrops.play.mock.calls);

    f.world.setBlock(1, 0, 0, f.block);
    const held = f.session.inventory.create(stock);
    expect(f.session.inventory.add(held, { kind: 'hand', side: 'right' })).toBe(true);
    const move = f.session.queue.enqueue(held, { kind: 'pile', pos: [1, 1, 0] });
    expect(move.ok).toBe(true);
    if (!move.ok) {
      throw new Error(move.reason);
    }
    expect(() => f.session.queue.tick(move.job.duration)).not.toThrow();
    expect(f.session.inventory.locate(held)).toMatchObject({ kind: 'pile' });
    expect(f.moveSounds).toHaveLength(1);
    expect(f.notice).not.toHaveBeenCalled();
  });
});
