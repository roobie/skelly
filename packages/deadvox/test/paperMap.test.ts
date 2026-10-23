import { createHash } from 'node:crypto';
import { gunzipSync, gzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { canonicalJsonBytes } from '../src/core/canonicalJson.ts';
import type { ItemDef } from '../src/core/content.ts';
import { Inventory } from '../src/core/inventory.ts';
import { ItemFactory, restoreItem, snapshotItem } from '../src/core/items.ts';
import { paperMapAt, paperMapBounds } from '../src/core/paperMap.ts';
import { decodeSave } from '../src/core/saveFormat.ts';
import { WORLD_REGION_METRES } from '../src/core/worldRegion.ts';
import { buildFixtureRegistry } from './economyFixtures.ts';
import {
  capture,
  contentLookup,
  createRuntime,
  encodeFixture,
  formatVersion,
  registry,
} from './snapshotTestSupport.ts';

const PAPER_MAP_ERROR = /paper.map/i;
const sheet: ItemDef = {
  id: 'fixture_sheet',
  name: 'Fixture sheet',
  category: 'book',
  weight: 1,
  size: [1, 1],
  economy: { usage: [], tiers: [] },
  workInProgress: false,
  notLoot: true,
  paperMap: true,
};
const bag: ItemDef = {
  ...registry.items.get('school_backpack')!,
  id: 'fixture_bag',
  size: [2, 2],
  container: {
    rigid: true,
    pockets: [{ ...registry.items.get('school_backpack')!.container!.pockets[0]!, grid: [2, 2] }],
  },
};
const content = { ...registry, items: new Map([...registry.items, [sheet.id, sheet], [bag.id, bag]]) };
const createSheet = (inventory: Inventory, x: number, z: number) =>
  inventory.factory.create(content, sheet.id, 1, { paperMap: { x, z } });

it('partitions positive and negative metre-space points into half-open grid sheets', () => {
  for (const x of [-2, -1, 0, 1]) {
    for (const z of [-2, -1, 0, 1]) {
      const bounds = paperMapBounds({ x, z });
      expect(bounds.x1 - bounds.x0).toBe(WORLD_REGION_METRES);
      expect(bounds.z1 - bounds.z0).toBe(WORLD_REGION_METRES);
      expect(paperMapAt(bounds.x0, bounds.z0)).toEqual({ x, z });
      expect(paperMapAt(bounds.x1 - WORLD_REGION_METRES / 4, bounds.z1 - WORLD_REGION_METRES / 4)).toEqual({ x, z });
      expect(paperMapAt(bounds.x1, bounds.z0)).toEqual({ x: x + 1, z });
      expect(paperMapAt(bounds.x0, bounds.z1)).toEqual({ x, z: z + 1 });
      expect(paperMapBounds({ x: x + 1, z }).x0).toBe(bounds.x1);
      expect(paperMapBounds({ x, z: z + 1 }).z0).toBe(bounds.z1);
    }
  }
  expect(() => paperMapAt(Number.NaN, 0)).toThrow();
  expect(() => paperMapAt(0, Number.POSITIVE_INFINITY)).toThrow();
});

it('admits a reusable paper-map capability but rejects stacks and competing reading capabilities', () => {
  const build = (override: object) =>
    buildFixtureRegistry([{ source: 'sheet-fixture.json', data: { items: [{ ...sheet, ...override }] } }]);
  expect(build({}).issues).toEqual([]);
  expect(build({ paperMap: false }).issues).toEqual(
    expect.arrayContaining([expect.objectContaining({ path: 'items[0].paperMap' })]),
  );
  for (const override of [
    { stack: 2 },
    { readable: { title: 'Fixture', text: 'Words' } },
    { book: { title: 'Fixture', recipes: ['fixture_recipe'], readingGameMinutes: 1 } },
  ]) {
    expect(build(override).issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: 'items[0].paperMap',
          message: 'paper maps cannot stack or declare another reading capability',
        }),
      ]),
    );
  }
});

it('ordinary inventory moves keep distinct-region sheets as separate objects', () => {
  const inventory = new Inventory(content);
  const a = createSheet(inventory, -1, 0);
  const b = createSheet(inventory, 0, 0);
  const pile = { kind: 'pile', pos: [0, 0, 0] as [number, number, number] } as const;
  expect(inventory.add(a, pile)).toBe(true);
  expect(inventory.add(b, { kind: 'hand', side: 'right' })).toBe(true);
  expect(inventory.move(b, pile).ok).toBe(true);
  expect(inventory.piles.get('0,0,0')!.items.map(({ item }) => item.uid)).toEqual([a.uid, b.uid]);
  expect(a.count).toBe(1);
  expect(b.count).toBe(1);
  expect(a.paperMap).not.toEqual(b.paperMap);
  expect(() => inventory.factory.split(a, 1)).toThrow();
});

const malformed = [
  null,
  {},
  { x: 0 },
  { x: 0.5, z: 0 },
  { x: 0, z: Number.MAX_SAFE_INTEGER + 1 },
  { x: Number.NaN, z: 0 },
  { x: 0, z: Number.POSITIVE_INFINITY },
  { x: 0, z: 0, extra: 1 },
];

describe('paper-map instance admission', () => {
  it('requires explicit safe-integer coverage on exactly one declared sheet', () => {
    const factory = new ItemFactory();
    expect(() => factory.create(content, sheet.id)).toThrow(PAPER_MAP_ERROR);
    expect(() => factory.create(content, sheet.id, 2, { paperMap: { x: 0, z: 0 } })).toThrow(PAPER_MAP_ERROR);
    expect(() => factory.create(content, 'rag', 1, { paperMap: { x: 0, z: 0 } })).toThrow(PAPER_MAP_ERROR);
    for (const paperMap of malformed) {
      expect(() => factory.create(content, sheet.id, 1, { paperMap } as never)).toThrow(PAPER_MAP_ERROR);
    }
  });

  it('isolates coverage across creation, frozen snapshots and restoration', () => {
    const paperMap = { x: -3, z: 4 };
    const item = new ItemFactory().create(content, sheet.id, 1, { paperMap });
    paperMap.x += 1;
    expect(item.paperMap).toEqual({ x: -3, z: 4 });
    const saved = snapshotItem(item);
    const restored = restoreItem(content, saved);
    restored.paperMap!.z += 1;
    expect(saved.paperMap).toEqual({ x: -3, z: 4 });
    expect(item.paperMap).toEqual(saved.paperMap);
    expect(Object.isFrozen(saved.paperMap)).toBe(true);
    for (const coverage of [undefined, ...malformed]) {
      expect(() => restoreItem(content, { ...saved, paperMap: coverage } as never)).toThrow(PAPER_MAP_ERROR);
    }
    expect(() => restoreItem(content, { ...saved, count: 2 })).toThrow(PAPER_MAP_ERROR);
    expect(() => restoreItem(content, { ...saved, type: 'rag' })).toThrow(PAPER_MAP_ERROR);
  });
});

it('save round-trip preserves sheet UIDs and coverage in a hand, nested pocket and dropped pile without saved terrain', async () => {
  const runtime = createRuntime(undefined, false, undefined, { registry: content });
  const { inventory } = runtime;
  const backpack = inventory.hands.right!;
  const held = createSheet(inventory, -1, 2);
  const nested = createSheet(inventory, 2, -1);
  const dropped = createSheet(inventory, 3, 4);
  const inner = inventory.create(bag.id);
  const pos = runtime.session.body.pos.map(Math.floor) as [number, number, number];
  expect(inventory.move(backpack, { kind: 'pile', pos }).ok).toBe(true);
  expect(inventory.add(inner, { kind: 'pocket', owner: backpack, pocket: 0 })).toBe(true);
  expect(inventory.add(nested, { kind: 'pocket', owner: inner, pocket: 0 })).toBe(true);
  expect(inventory.add(held, { kind: 'hand', side: 'right' })).toBe(true);
  expect(inventory.move(inventory.hands.left!, { kind: 'pile', pos }).ok).toBe(true);
  expect(inventory.add(dropped, { kind: 'hand', side: 'left' })).toBe(true);
  expect(inventory.move(dropped, { kind: 'pile', pos }).ok).toBe(true);
  const snapshot = structuredClone(capture(runtime));
  snapshot.world.columns = [];
  const bytes = await encodeFixture(snapshot);
  const options = {
    version: formatVersion,
    contentLookup: (kind: Parameters<typeof contentLookup>[0], id: string) =>
      (kind === 'item' && content.items.has(id)) || contentLookup(kind, id),
  };
  const decoded = await decodeSave(bytes, options);
  expect(decoded.snapshot.world.columns).toEqual([]);
  const loaded = Inventory.restoreState(content, decoded.snapshot.character.inventory);
  expect(loaded.hands.right?.uid).toBe(held.uid);
  expect(loaded.piles.get(pos.join(','))!.items.some(({ item }) => item.uid === dropped.uid)).toBe(true);
  const restoredInner = loaded.itemByUid(inner.uid)!;
  expect(restoredInner.pockets![0]![0]!.item.uid).toBe(nested.uid);
  for (const original of [held, nested, dropped]) {
    expect(loaded.itemByUid(original.uid)?.paperMap).toEqual(original.paperMap);
  }
  await Promise.all(
    malformed.map(async (paperMap) => {
      const invalid = structuredClone(snapshot);
      invalid.character.inventory.hands.right!.paperMap = paperMap as never;
      await expect(encodeFixture(invalid)).rejects.toThrow();
    }),
  );
  const envelope = JSON.parse(gunzipSync(bytes).toString('utf8'));
  const invalidWire = structuredClone(envelope);
  invalidWire.payload.character.inventory.hands.right.paperMap = { x: 0.5, z: 0 };
  const payload = canonicalJsonBytes(invalidWire.payload, { acceptTaggedNegativeZero: true });
  invalidWire.payloadByteLength = payload.byteLength;
  invalidWire.checksum = createHash('sha256').update(payload).digest('hex');
  const invalidBytes = gzipSync(canonicalJsonBytes(invalidWire, { acceptTaggedNegativeZero: true }));
  await expect(decodeSave(invalidBytes, options)).rejects.toThrow('paperMap.x');
});
