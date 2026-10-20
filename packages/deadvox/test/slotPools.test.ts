import { readdirSync, readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { compileJsonnetFile } from '../../../tools/jsonnet/index.mjs';
import { scenarioPlanIssues } from '../src/core/cityPlan.ts';
import { buildRegistry } from '../src/core/content.ts';
import type { ContentFile } from '../src/core/schema.ts';
import { compileAssembly, kitSlotChoices } from '../src/core/templates.ts';
import { startupContent } from './baseRegistry.ts';
import { fixtureScenario } from './fixtures/scenario.ts';

const BUNDLED_CONTENT = startupContent();

const fixture = (): ContentFile =>
  JSON.parse(compileJsonnetFile('packages/deadvox/test/fixtures/jsonnet/map-kits.jsonnet')) as ContentFile;
const pooledFixture = () => {
  const data = fixture();
  const slot = data.mapAssemblies![0]!.slots[0]!;
  data.mapPools = [{ id: 'fixture_slot_pool', choices: slot.choices! }];
  slot.choices = undefined;
  slot.pool = data.mapPools[0]!.id;
  return data;
};
const build = (data: ContentFile) => buildRegistry([{ source: 'slot-fixture.json', data }]);
const context = { seed: 31, siteId: 'pool_equivalence' };
const UNKNOWN_POOL = /slot-fixture\.json:mapAssemblies\[0\]\.slots\[0\].*unknown map pool missing_fixture_pool/;

it('resolves pool alternatives with the same seeded choice and style as inline alternatives', () => {
  const inline = fixture();
  inline.mapAssemblies![0]!.slots[0]!.choices![0]!.ref.style = inline.mapStyles![1]!.id;
  const pooled = structuredClone(inline);
  const slot = pooled.mapAssemblies![0]!.slots[0]!;
  pooled.mapPools = [{ id: 'styled_pool', choices: [...slot.choices!].reverse() }];
  slot.choices = undefined;
  slot.pool = pooled.mapPools[0]!.id;
  const a = build(inline);
  const b = build(pooled);
  expect(a.issues).toEqual([]);
  expect(b.issues).toEqual([]);
  const compiled = (result: typeof a, data: ContentFile) =>
    compileAssembly(result.registry, data.mapAssemblies![0]!, context);
  const left = compiled(a, inline);
  const right = compiled(b, pooled);
  expect(right.blocks).toEqual(left.blocks);
  expect(right.provenance).toEqual(left.provenance);
});

it('compiles assembly refs from a slot pool with inherited style and nested provenance', () => {
  const data = fixture();
  const inner = data.mapAssemblies![0]!;
  const style = data.mapStyles![1]!.id;
  data.mapPools = [{ id: 'nested_pool', choices: [{ ref: { kind: 'assembly', id: inner.id, style }, weight: 1 }] }];
  const outer = {
    id: 'fixture_outer',
    size: inner.size,
    lootContext: inner.lootContext,
    slots: [
      {
        id: 'nested',
        at: [0, 0, 0] as [number, number, number],
        size: inner.size,
        turn: 0 as const,
        pool: data.mapPools[0]!.id,
      },
    ],
    joins: [],
    anchors: {},
    ports: inner.ports.map(({ id }) => ({ id, slot: 'nested', port: id })),
  };
  data.mapAssemblies!.push(outer);
  const { registry, issues } = build(data);
  expect(issues).toEqual([]);
  const compiled = compileAssembly(registry, outer, context);
  expect(compiled.blocks).toEqual(compileAssembly(registry, inner, { ...context, style }).blocks);
  const owners = compiled.provenance!.filter((owner) => owner !== undefined);
  expect(owners.length).toBeGreaterThan(0);
  expect(owners.every((owner) => owner.slotPath.startsWith('fixture_outer/nested/'))).toBe(true);
});

it('reports an unknown pool at its slot source path and throws with that path when compiling', () => {
  const data = pooledFixture();
  const { registry, issues } = build(data);
  expect(issues).toEqual([]);
  const assembly = structuredClone(data.mapAssemblies![0]!);
  assembly.slots[0]!.pool = 'missing_fixture_pool';
  data.mapAssemblies![0] = assembly;
  expect(build(data).issues).toContainEqual(
    expect.objectContaining({
      source: 'slot-fixture.json',
      path: 'mapAssemblies[0].slots[0]',
      message: 'unknown map pool missing_fixture_pool',
    }),
  );
  expect(() => compileAssembly(registry, assembly, context)).toThrow(UNKNOWN_POOL);
});

it.each(['atLeast', 'atMost'] as const)('rejects %s in a slot pool at the slot source path', (quota) => {
  const data = pooledFixture();
  data.mapPools![0]!.choices[0]![quota] = 1;
  expect(build(data).issues).toContainEqual(
    expect.objectContaining({
      path: 'mapAssemblies[0].slots[0]',
      message: expect.stringContaining('cannot carry atLeast or atMost'),
    }),
  );
});

it('rejects literal template refs in slot pools and piece refs in city pools', () => {
  const data = pooledFixture();
  data.mapPools![0]!.choices[0]!.ref = { kind: 'template', id: 'fixture_template' };
  expect(build(data).issues).toContainEqual(
    expect.objectContaining({
      path: 'mapAssemblies[0].slots[0]',
      message: expect.stringContaining('needs a piece or assembly'),
    }),
  );
  const valid = pooledFixture();
  const { registry } = build(valid);
  const scenario = fixtureScenario();
  scenario.city.pool = valid.mapPools![0]!.id;
  expect(scenarioPlanIssues(registry, scenario)).toContainEqual([
    '.city.pool.choices[0].ref',
    expect.stringContaining('needs a template or assembly'),
  ]);
});

it.each(['both', 'neither'])('rejects a slot with %s alternative sources', (mode) => {
  const data = pooledFixture();
  const slot = data.mapAssemblies![0]!.slots[0]!;
  if (mode === 'both') {
    slot.choices = fixture().mapAssemblies![0]!.slots[0]!.choices;
  } else {
    slot.pool = undefined;
  }
  expect(build(data).issues.some(({ message }) => message.includes('exactly one of choices or pool'))).toBe(true);
});

it('revalidates retained slot consumers after a pool override changes their spatial contract', () => {
  const data = pooledFixture();
  const baseline = build(data);
  expect(baseline.issues).toEqual([]);
  const alternative = structuredClone(data.mapPieces![0]!);
  alternative.anchors.moved = { kind: 'point', at: [1, 1, 1] };
  alternative.id = 'fixture_moved_anchor';
  const override = {
    mapPieces: [alternative],
    mapPools: [
      {
        ...data.mapPools![0]!,
        choices: [data.mapPools![0]!.choices[0]!, { ref: { kind: 'piece', id: alternative.id }, weight: 1 }],
      },
    ],
  };
  const result = buildRegistry([
    { source: 'slot-fixture.json', data },
    { source: 'pool-override.json', data: override },
  ]);
  expect(result.issues).toContainEqual(
    expect.objectContaining({
      source: 'slot-fixture.json',
      path: 'mapAssemblies[0]',
      message: expect.stringContaining('anchors'),
    }),
  );
});

it('a pool-only Jsonnet mod changes real slot candidate weights without overriding assemblies', () => {
  const mod = JSON.parse(
    compileJsonnetFile('packages/deadvox/test/fixtures/jsonnet/roof-equipment-mod.jsonnet'),
  ) as ContentFile;
  expect(Object.keys(mod)).toEqual(['mapPools']);
  const sources = readdirSync('src/content/base')
    .filter((file) => file.endsWith('.json'))
    .sort()
    .map((file) => ({
      source: file,
      data: JSON.parse(readFileSync(`src/content/base/${file}`, 'utf8')) as unknown,
    }));
  const baseline = BUNDLED_CONTENT;
  const changed = buildRegistry([...sources, { source: 'roof-equipment-mod.json', data: mod }]);
  expect(baseline.issues).toEqual([]);
  expect(changed.issues).toEqual([]);
  const pool = mod.mapPools![0]!;
  const consumers = [...baseline.registry.mapAssemblies.values()].flatMap((assembly) =>
    assembly.slots.filter((slot) => slot.pool === pool.id).map((slot) => ({ assembly, slot })),
  );
  expect(consumers.length).toBeGreaterThan(0);
  for (const { assembly, slot } of consumers) {
    expect(changed.registry.mapAssemblies.get(assembly.id)).toEqual(assembly);
    const before = kitSlotChoices(baseline.registry, slot);
    const after = kitSlotChoices(changed.registry, slot);
    expect(after).toEqual(pool.choices);
    expect(after.map(({ ref }) => ref)).toEqual(before.map(({ ref }) => ref));
    expect(after.map(({ weight }) => weight)).not.toEqual(before.map(({ weight }) => weight));
    expect(() => compileAssembly(changed.registry, assembly, context)).not.toThrow();
  }
});
