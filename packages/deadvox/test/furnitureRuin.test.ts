import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { safeParse } from 'valibot';
import { expect, it } from 'vitest';
import type { BashOutcome, BlockEntity } from '../src/core/blockEntities.ts';
import type { Vec3 } from '../src/core/coords.ts';
import { type FurnitureMover, ruinFurniture } from '../src/core/furnitureMove.ts';
import { Inventory } from '../src/core/inventory.ts';
import type { Body } from '../src/core/physics.ts';
import { ContentFileSchema } from '../src/core/schema.ts';
import { buildFixtureRegistry, FIXTURE_MATERIAL } from './economyFixtures.ts';
import { createRuntime } from './snapshotTestSupport.ts';

const base = readdirSync('src/content/base')
  .filter((file) => file.endsWith('.json'))
  .sort()
  .map((file) => ({
    source: file,
    data: JSON.parse(readFileSync(join('src/content/base', file), 'utf8')) as unknown,
  }));
const BREACH = { minimumStrength: 1, durability: 3 };
const DEBRIS = { item: 'ruin_fixture_debris', count: 5 };
const box = (id: string, size: Vec3) => ({
  id,
  name: 'Fixture box',
  size,
  color: '#888888',
  breach: BREACH,
  container: { pockets: [{ grid: [4, 4], handlingSimSeconds: 0.5 }] },
  ruin: { debris: [DEBRIS] },
});
const DOOR_LEAF = {
  name: 'Fixture door',
  size: [2, 4, 1],
  color: '#777777',
  material: FIXTURE_MATERIAL,
  breach: BREACH,
  door: { handlingSimSeconds: 0.5, methods: {} },
};
const { registry, issues } = buildFixtureRegistry([
  ...base,
  {
    source: 'ruin-fixture',
    data: {
      furniture: [
        box('ruin_fixture_box', [1, 1, 1]),
        box('ruin_fixture_plank', [2, 1, 1]),
        { id: 'ruin_fixture_door', ...DOOR_LEAF },
      ],
      items: [
        { id: 'ruin_fixture_item', name: 'Fixture item', category: 'material', size: [1, 1], weight: 1 },
        { id: DEBRIS.item, name: 'Fixture debris', category: 'material', size: [1, 1], weight: 1, stack: 2 },
      ],
    },
  },
]);
if (issues.length > 0) {
  throw new Error(JSON.stringify(issues));
}

const FLOOR = 1;
const terrainSolid = (_x: number, y: number) => y < FLOOR;
const mover = (inventory: Inventory, others: Body[] = []): FurnitureMover => ({
  inventory,
  terrainSolid,
  blockSize: 0.5,
  player: { pos: [30, FLOOR, 30], vel: [0, 0, 0], halfWidth: 0.4, height: 3.6, onGround: true },
  others,
  stamina: 100,
});
const piece = (inventory: Inventory, type: string, pos: Vec3, stock = 0) => {
  const size = [...registry.furniture.get(type)!.size] as Vec3;
  const loot = Array.from({ length: stock }, () => ({ type: 'ruin_fixture_item', count: 1, condition: 1 }));
  return inventory.furnish({ type, pos, size, facing: 'n' }, loot)!;
};
const piled = (inventory: Inventory) => [...inventory.piles.values()].flatMap((pile) => pile.items);
/** Brings a piece to its durability in whole blows of its minimum strength, as the last of them ruins it. */
const ruinBlows = (inventory: Inventory, entity: BlockEntity) => {
  const outcomes: (BashOutcome | undefined)[] = [];
  for (let dealt = 0; dealt < BREACH.durability; dealt += BREACH.minimumStrength) {
    outcomes.push(inventory.entities.bash(entity, BREACH.minimumStrength));
  }
  return outcomes;
};
/** A standing piece rests when anything fills a cell under its bottom layer. */
const floating = (inventory: Inventory) =>
  [...inventory.entities.all].filter((entity) => {
    const [x0, y0, z0] = entity.pos;
    const under: Vec3[] = [];
    for (let x = x0; x < x0 + entity.size[0]; x++) {
      for (let z = z0; z < z0 + entity.size[2]; z++) {
        under.push([x, y0 - 1, z]);
      }
    }
    return !under.some(([x, y, z]) => terrainSolid(x, y) || inventory.entities.filling(x, y, z) !== undefined);
  });
/** Piles lying in a cell a standing piece fills, which the game never allows. */
const buried = (inventory: Inventory) =>
  [...inventory.piles.values()].filter(({ pos: [x, y, z] }) => inventory.entities.filling(x, y, z) !== undefined);

it('reports a ruin only on the blow that brings a piece to its durability', () => {
  const inventory = new Inventory(registry);
  const target = piece(inventory, 'ruin_fixture_box', [0, FLOOR, 0]);
  const outcomes = ruinBlows(inventory, target);
  expect(outcomes.at(-1)).toBe('ruined');
  expect(outcomes.slice(0, -1).every((outcome) => outcome === 'damaged')).toBe(true);
});

it("drops every item a ruined container held, and its content's debris, as piles, none lost or doubled", () => {
  const inventory = new Inventory(registry);
  const target = piece(inventory, 'ruin_fixture_box', [0, FLOOR, 0], 12);
  const held = target.pockets!.flat().map(({ item }) => item.uid);
  expect(held.length, 'the fixture container must be stocked').toBeGreaterThan(0);
  expect(ruinBlows(inventory, target).at(-1)).toBe('ruined');

  expect(ruinFurniture(mover(inventory), target)).toEqual([target]);

  expect(inventory.entities.byUid(target.uid)).toBeUndefined();
  expect(inventory.entities.at(0, FLOOR, 0)).toBeUndefined();
  const items = piled(inventory);
  const uids = items.map(({ item }) => item.uid);
  expect(new Set(uids).size).toBe(uids.length);
  expect(uids).toEqual(expect.arrayContaining(held));
  const debris = items.filter(({ item }) => item.type === DEBRIS.item);
  expect(debris.reduce((sum, { item }) => sum + item.count, 0)).toBe(DEBRIS.count);
  expect(uids.length).toBe(held.length + debris.length);
  expect([...inventory.piles.values()].every((pile) => terrainSolid(pile.pos[0], pile.pos[1] - 1))).toBe(true);
  expect(buried(inventory)).toEqual([]);
});

it('lets what rested on a ruined piece fall, destroys what cannot come down clear, and leaves nothing floating', () => {
  const inventory = new Inventory(registry);
  const struck = piece(inventory, 'ruin_fixture_box', [0, FLOOR, 0], 1);
  // The plank overhangs the struck box onto air where someone stands, so it can't come down clear.
  const plank = piece(inventory, 'ruin_fixture_plank', [0, FLOOR + 1, 0], 1);
  const top = piece(inventory, 'ruin_fixture_box', [0, FLOOR + 2, 0], 1);
  const bystander: Body = { pos: [1.5, FLOOR, 0.5], vel: [0, 0, 0], halfWidth: 0.4, height: 0.9, onGround: true };
  const held = [struck, plank].flatMap((entity) => entity.pockets!.flat().map(({ item }) => item.uid));
  expect(held.length, 'both destroyed pieces must be stocked').toBe(2);
  expect(floating(inventory)).toEqual([]);
  expect(ruinBlows(inventory, struck).at(-1)).toBe('ruined');

  expect(ruinFurniture(mover(inventory, [bystander]), struck)).toEqual([struck, plank]);

  expect(inventory.entities.byUid(plank.uid)).toBeUndefined();
  expect(inventory.entities.byUid(top.uid)).toBe(top);
  expect(top.pos[1]).toBe(FLOOR);
  expect(floating(inventory)).toEqual([]);
  expect(buried(inventory)).toEqual([]);
  expect(piled(inventory).map(({ item }) => item.uid)).toEqual(expect.arrayContaining(held));
});

it('cancels the work that names a ruined piece', () => {
  const runtime = createRuntime(undefined, false, undefined, { registry, spawn: [0, FLOOR, 0] });
  const floor = registry.blockIds.get(registry.blocks.find((block) => block.solid)!.id)!;
  for (let x = -4; x <= 4; x++) {
    for (let z = -4; z <= 4; z++) {
      runtime.world.setBlock(x, 0, z, floor);
    }
  }
  const { session, inventory } = runtime;
  const target = piece(inventory, 'ruin_fixture_box', [-2, FLOOR, -2], 1);
  expect(session.search(target)).toBeUndefined();
  expect(session.queue.jobs.length).toBeGreaterThan(0);

  expect(session.bashFurniture(target, BREACH.durability)).toBe(true);

  expect(runtime.entities.byUid(target.uid)).toBeUndefined();
  expect(session.queue.jobs).toEqual([]);
});

it('breaks a door leaf at its durability and keeps it standing broken, never destroyed', () => {
  const runtime = createRuntime(undefined, false, undefined, { registry, spawn: [0, FLOOR, 0] });
  const door = piece(runtime.inventory, 'ruin_fixture_door', [0, FLOOR, 2]);

  expect(runtime.session.bashFurniture(door, BREACH.durability)).toBe(true);

  expect(runtime.entities.byUid(door.uid)).toBe(door);
  expect(door.broken).toBe(true);
  expect(runtime.session.bashFurniture(door, BREACH.durability)).toBe(false);
  expect(runtime.entities.byUid(door.uid)).toBe(door);
});

it('refuses debris naming no item', () => {
  const { issues: refused } = buildFixtureRegistry([
    {
      source: 'ruin-fixture',
      data: {
        furniture: [
          { ...box('ruin_fixture_unknown_debris', [1, 1, 1]), ruin: { debris: [{ item: 'no_such', count: 1 }] } },
        ],
      },
    },
  ]);
  // Only the fixture's own content is loaded, so the registry builds quickly and reports nothing else.
  expect(refused.map(({ path }) => path)).toEqual(['furniture[0].ruin.debris[0].item']);
});

it('refuses debris on a door leaf, which breaks rather than being ruined', () => {
  // The schema alone decides this, so no registry is built; the bare leaf parsing shows nothing else fails.
  const leaf = { id: 'ruin_fixture_leaf', ...DOOR_LEAF };
  expect(safeParse(ContentFileSchema, { furniture: [leaf] }).success).toBe(true);
  expect(safeParse(ContentFileSchema, { furniture: [{ ...leaf, ruin: { debris: [DEBRIS] } }] }).success).toBe(false);
});
