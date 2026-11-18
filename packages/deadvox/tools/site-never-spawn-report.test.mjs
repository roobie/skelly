// biome-ignore-all lint/correctness/noNodejsModules: This exercises a Node-only CLI.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildRegistry } from '@skelly/engine/content';
import { runReport } from './site-never-spawn-report.mjs';

/** @typedef {import('@skelly/engine/content').StartDef} StartDef */

const site = 'fixture_site';

/**
 * @param {string} id
 * @param {string} item
 * @returns {StartDef}
 */
const startRow = (id, item) => ({
  id,
  site,
  kit: [{ id: 'stock', item, destination: { kind: 'hand', role: 'dominant' } }],
  wounds: [],
  skills: {},
  recipes: [],
  abilities: [],
  pools: [],
});

/** @param {StartDef} start */
const stockOf = (start) => {
  const [stock] = start.kit;
  if (!stock) {
    throw new Error(`Fixture start ${start.id} carries no stock item`);
  }
  return stock.item;
};

const fixture = () => {
  const { registry } = buildRegistry([]);
  registry.layouts.set(site, {
    id: site,
    lootContext: { usage: ['Residential'], tier: 'Tier1' },
    bounds: { x0: -1, z0: -1, x1: 1, z1: 1 },
    ground: 0,
    terrain: [],
    buildings: [],
    player: { position: [0, 1, 0], bearing: 0 },
    actors: [],
    woodlands: [],
    tracks: [],
  });
  for (const id of ['fixture_default_stock', 'fixture_alternate_stock']) {
    registry.items.set(id, {
      id,
      workInProgress: false,
      name: id,
      category: 'material',
      weight: 1,
      size: [1, 1],
    });
    registry.itemEconomy.set(id, { id, usage: [], tiers: [], notLoot: false });
  }
  const normal = {
    ...startRow('fixture_default', 'fixture_default_stock'),
    defaultForSite: /** @type {const} */ (true),
  };
  const alternate = startRow('fixture_alternate', 'fixture_alternate_stock');
  // The non-default row comes first so selection cannot accidentally mean first row.
  registry.starts = new Map([alternate, normal].map((row) => [row.id, row]));
  return { registry, normal, alternate };
};

test('never-spawn CLI uses the site default or explicit start as both comparisons’ roots', () => {
  const { registry, normal, alternate } = fixture();
  /** @type {[string[], StartDef, StartDef][]} */
  const cases = [
    [[normal.site], normal, alternate],
    [['--site', normal.site, '--start', alternate.id], alternate, normal],
  ];
  for (const [args, selected, other] of cases) {
    let output = '';
    const errors = [];
    const status = runReport(
      args,
      (text) => {
        output += text;
      },
      (text) => errors.push(text),
      () => registry,
    );
    assert.equal(status, 0);
    assert.deepEqual(errors, []);
    assert.ok(output.includes(`(start ${selected.id})`));
    assert.ok(!output.includes(`(${stockOf(selected)})`), 'selected kit is reachable, not a never-spawn gap');
    assert.ok(output.includes(`(${stockOf(other)})`), 'another start must not supply roots');
    assert.ok(output.includes('gap is 0 of'));
  }
});
