// biome-ignore-all lint/correctness/noNodejsModules: This exercises a Node-only CLI.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildRegistry } from '../src/core/content.ts';
import { runReport } from './site-never-spawn-report.mjs';

const fixture = () => {
  const { registry } = buildRegistry([]);
  const site = 'fixture_site';
  registry.layouts.set(site, { id: site, buildings: [], shamblers: [] });
  for (const id of ['fixture_default_stock', 'fixture_alternate_stock']) {
    registry.items.set(id, {
      id,
      name: id,
      category: 'material',
      weight: 1,
      size: [1, 1],
      notLoot: false,
    });
  }
  const normal = {
    id: 'fixture_default',
    site,
    defaultForSite: true,
    kit: [{ id: 'stock', item: 'fixture_default_stock', destination: { kind: 'hand', role: 'dominant' } }],
    wounds: [],
    skills: {},
    recipes: [],
  };
  const alternate = {
    ...normal,
    id: 'fixture_alternate',
    defaultForSite: false,
    kit: [{ id: 'stock', item: 'fixture_alternate_stock', destination: { kind: 'hand', role: 'dominant' } }],
  };
  // The non-default row comes first so selection cannot accidentally mean first row.
  registry.starts = new Map([alternate, normal].map((row) => [row.id, row]));
  return { registry, normal, alternate };
};

test('never-spawn CLI uses the site default or explicit start as both comparisons’ roots', () => {
  const { registry, normal, alternate } = fixture();
  for (const [args, selected, other] of [
    [[normal.site], normal, alternate],
    [['--site', normal.site, '--start', alternate.id], alternate, normal],
  ]) {
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
    assert.ok(!output.includes(`(${selected.kit[0].item})`), 'selected kit is reachable, not a never-spawn gap');
    assert.ok(output.includes(`(${other.kit[0].item})`), 'another start must not supply roots');
    assert.ok(output.includes('gap is 0 of'));
  }
});
