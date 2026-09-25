import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { searchTime } from '../src/core/blockEntities.ts';
import { Chunk } from '../src/core/chunk.ts';
import { buildRegistry, type TemplateDef } from '../src/core/content.ts';
import { HandlingQueue } from '../src/core/handling.ts';
import { HANDLING, Inventory } from '../src/core/inventory.ts';
import { cellsOf, compileTemplate, placedPieces, stampPlacement, type Turn } from '../src/core/templates.ts';

const BASE = 'src/content/base';
const { registry } = buildRegistry(
  readdirSync(BASE)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((f) => ({ source: f, data: JSON.parse(readFileSync(join(BASE, f), 'utf8')) as unknown })),
);

/** A cupboard next to a player in a hoodie, and a can of beans in the cupboard. */
const kitchen = () => {
  const inv = new Inventory(registry);
  const hoodie = inv.create('hoodie');
  inv.worn.torso = hoodie;
  const cupboard = inv.furnish({ type: 'kitchen_cupboard', pos: [0, 0, 0], size: [2, 2, 1], facing: 'n' }, [
    { type: 'canned_beans', count: 1, condition: 1 },
  ])!;
  const [beans] = cupboard.pockets![0]!.map((p) => p.item);
  return { inv, hoodie, cupboard, beans: beans! };
};

describe('furniture', () => {
  it('holds what worldgen rolled for it, once', () => {
    const { inv, cupboard, beans } = kitchen();
    expect(inv.locate(beans)).toMatchObject({ kind: 'furniture', entity: cupboard, pocket: 0 });
    expect(inv.furnish({ type: 'kitchen_cupboard', pos: [0, 0, 0], size: [2, 2, 1], facing: 'n' })).toBeUndefined();
    expect([...inv.entities.all]).toHaveLength(1);
    expect(inv.entities.at(1, 1, 0)).toBe(cupboard);
    expect(inv.entities.at(2, 0, 0)).toBeUndefined();
  });

  it('has to be searched before anything moves in or out', () => {
    const { inv, hoodie, cupboard, beans } = kitchen();
    const toPocket = { kind: 'pocket', owner: hoodie, pocket: 0 } as const;
    expect(inv.plan(beans, toPocket)).toEqual({ ok: false, reason: 'Search it first' });
    const matches = inv.create('matches');
    inv.add(matches, toPocket);
    expect(inv.plan(matches, { kind: 'furniture', entity: cupboard, pocket: 0 })).toMatchObject({ ok: false });
    inv.entities.markSearched(cupboard);
    const plan = inv.plan(beans, toPocket);
    expect(plan.ok).toBe(true);
    const def = registry.furniture.get('kitchen_cupboard')!;
    const [w, h] = registry.items.get('canned_beans')!.size;
    const cells = w * h;
    const expected = def.container!.pockets[0]!.handling + inv.pocketHandling(hoodie, 0) + 2 * HANDLING.perCell * cells;
    expect(plan.ok && plan.time).toBeCloseTo(expected);
  });

  it('is out of reach when the game says so', () => {
    const { inv, hoodie, cupboard, beans } = kitchen();
    inv.entities.markSearched(cupboard);
    inv.canReachEntity = () => false;
    expect(inv.plan(beans, { kind: 'pocket', owner: hoodie, pocket: 0 })).toEqual({
      ok: false,
      reason: 'Too far away',
    });
  });

  it('searching takes a moment, longer for bigger containers', () => {
    const { inv, cupboard } = kitchen();
    const queue = new HandlingQueue(inv);
    const time = searchTime(registry.furniture.get('kitchen_cupboard')!);
    expect(time).toBeGreaterThanOrEqual(1);
    expect(time).toBeLessThan(searchTime(registry.furniture.get('wardrobe')!));
    expect(searchTime(registry.furniture.get('wardrobe')!)).toBeLessThanOrEqual(3);
    queue.enqueueAction('Search', time, () => {
      inv.entities.markSearched(cupboard);
    });
    queue.tick(time - 0.1);
    expect(cupboard.searched).toBe(false);
    const { done } = queue.tick(0.2);
    expect(done).toHaveLength(1);
    expect(cupboard.searched).toBe(true);
  });

  it('doors stop you only while closed', () => {
    const inv = new Inventory(registry);
    const door = inv.furnish({ type: 'wood_door', pos: [4, 0, 0], size: [2, 4, 1], facing: 'n' })!;
    expect(inv.entities.isSolid(5, 3, 0)).toBe(true);
    inv.entities.setOpen(door, true);
    expect(inv.entities.isSolid(5, 3, 0)).toBe(false);
    const bed = inv.furnish({ type: 'bed', pos: [0, 0, 4], size: [2, 1, 4], facing: 'n' })!;
    expect(inv.entities.isSolid(0, 0, 4)).toBe(true);
    expect(bed.pockets).toBeUndefined();
  });
});

describe('templates', () => {
  /** An asymmetric template: an L of blocks, and a wardrobe facing east. */
  const template: TemplateDef = {
    id: 'l_shape',
    size: [3, 5, 2],
    palette: { '#': 'brick', '.': 'air', R: { furniture: 'wardrobe', facing: 'e' } },
    layers: [
      ['##.', '#..'],
      ['R..', 'R..'],
      ['R..', 'R..'],
      ['R..', 'R..'],
      ['R..', 'R..'],
    ],
  };

  it('turns by quarter turns: stamped blocks and pieces agree', () => {
    const compiled = compileTemplate(registry, template);
    expect(compiled.pieces).toEqual([
      { furniture: 'wardrobe', loot: 'wardrobe', facing: 'e', pos: [0, 1, 0], size: [1, 4, 2] },
    ]);
    const brick = registry.blockIds.get('brick')!;
    const facings = ['e', 's', 'w', 'n'];
    for (const turn of [0, 1, 2, 3] as Turn[]) {
      const chunk = new Chunk(0, 0, 0);
      const placement = { template: compiled, origin: [4, 2, 4] as [number, number, number], turn };
      stampPlacement(chunk, placement);
      const bricks = [...cellsOf([12, 1, 12])]
        .filter(([x, , z]) => chunk.get(x, 2, z) === brick)
        .map(([x, , z]) => [x, z] as const);
      // Three bricks in an L inside the turned 3 × 2 (or 2 × 3) footprint.
      expect(bricks).toHaveLength(3);
      const [piece] = placedPieces(placement);
      expect(piece!.facing).toBe(facings[turn]);
      const size = turn % 2 === 0 ? [1, 4, 2] : [2, 4, 1];
      expect(piece!.size).toEqual(size);
      // The wardrobe stands on the column where the template's corner brick is.
      const { pos } = piece!;
      const corner = bricks.find(
        ([x, z]) => x >= pos[0] && x < pos[0] + size[0]! && z >= pos[2] && z < pos[2] + size[2]!,
      );
      expect(corner, `turn ${turn}`).toBeDefined();
    }
  });
});
