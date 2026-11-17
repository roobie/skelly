import { describe, expect, it } from 'vitest';
import { buildRegistry, type ContentSource } from '../src/core/content.ts';

const TABLE = 'fixture_table';

const item = (id: string) => ({ id, name: id, category: 'misc', size: [1, 1], weight: 1, workInProgress: false });
const row = (id: string, drops = id) => ({ id, item: drops, weight: 1 });

const items: ContentSource = {
  source: 'items.json',
  data: { items: ['fixture_a', 'fixture_b', 'fixture_c'].map(item) },
};
const defines = (source: string, rows: object[], id = TABLE): ContentSource => ({
  source,
  data: { loot: [{ id, rolls: [1, 1], entries: rows }] },
});
const patches = (source: string, rows: object[]): ContentSource => ({
  source,
  data: { patches: [{ section: 'loot', id: TABLE, add: { entries: rows } }] },
});

const rowIds = (sources: ContentSource[]) =>
  buildRegistry(sources)
    .registry.loot.get(TABLE)
    ?.entries.map(({ id }) => id);

describe('loot patches', () => {
  it('add rows to the definition that wins, even one a later file sets', () => {
    const sources = [
      items,
      defines('first.json', [row('fixture_a')]),
      patches('patch.json', [row('fixture_c')]),
      defines('second.json', [row('fixture_b')]),
    ];
    expect(buildRegistry(sources).issues).toEqual([]);
    expect(rowIds(sources)).toEqual(['fixture_b', 'fixture_c']);
  });

  it('keep the distinct rows of every file, in file order', () => {
    const sources = [
      items,
      defines('base.json', [row('fixture_a')]),
      patches('one.json', [row('fixture_b')]),
      patches('two.json', [row('fixture_c')]),
    ];
    expect(buildRegistry(sources).issues).toEqual([]);
    expect(rowIds(sources)).toEqual(['fixture_a', 'fixture_b', 'fixture_c']);
  });

  it('apply once when a broken file is dropped and the rest merged again', () => {
    const sources = [
      items,
      defines('base.json', [row('fixture_a')]),
      patches('patch.json', [row('fixture_b')]),
      defines('broken.json', [row('fixture_missing')], 'fixture_other'),
    ];
    expect(buildRegistry(sources).issues.map(({ source }) => source)).toEqual(['broken.json']);
    expect(rowIds(sources)).toEqual(['fixture_a', 'fixture_b']);
  });

  it('report a target no file defines at the patch', () => {
    expect(buildRegistry([items, patches('patch.json', [row('fixture_a')])]).issues).toEqual([
      { source: 'patch.json', path: 'patches[0].id', message: expect.stringContaining(`"${TABLE}"`) },
    ]);
  });

  it('refuse a row whose id the table already has, leaving the table as defined', () => {
    const sources = [
      items,
      defines('base.json', [row('fixture_a')]),
      patches('patch.json', [row('fixture_c'), row('fixture_a', 'fixture_b')]),
    ];
    expect(buildRegistry(sources).issues).toEqual([
      {
        source: 'patch.json',
        path: 'patches[0].add.entries[1].id',
        message: expect.stringMatching(new RegExp(`"${TABLE}".*"fixture_a"`)),
      },
    ]);
    expect(rowIds(sources)).toEqual(['fixture_a']);
  });

  it('blame a nested-table loop an added row closes on that row, keeping the table', () => {
    const back = { id: 'self', table: TABLE, weight: 1 };
    const sources = [items, defines('base.json', [row('fixture_a')]), patches('patch.json', [back])];
    expect(buildRegistry(sources).issues).toEqual([
      { source: 'patch.json', path: 'patches[0].add.entries[0].table', message: expect.stringContaining('loop') },
    ]);
    expect(rowIds(sources)).toEqual(['fixture_a']);
  });

  it('blame a broken reference in an added row on the patch, not on the table', () => {
    const sources = [items, defines('base.json', [row('fixture_a')]), patches('patch.json', [row('fixture_missing')])];
    expect(buildRegistry(sources).issues).toEqual([
      { source: 'patch.json', path: 'patches[0].add.entries[0].item', message: 'no item "fixture_missing"' },
    ]);
  });
});
