import { describe, expect, it } from 'vitest';
import { BundleAdmission, bundleSourceHash } from '../src/core/bundleAdmission.ts';
import { resolveCastRule } from '../src/core/castRules.ts';
import { buildRegistry } from '../src/core/content.ts';
import { admitPacks, type PackInput, packContentHash } from '../src/core/packAdmission.ts';

const effect = {
  verb: 'projectileVolley',
  count: 'min(8, 1 + abilityLevel / 2)',
  damage: '3.0 + double(abilityLevel)',
  intervalSimSeconds: '0.1',
  speedMetresPerSimSecond: '12.0',
  rangeMetres: '30.0',
  damageKind: 'fixture_arcane',
};
const rule = { id: 'fixture_rule', trigger: { event: 'cast' }, condition: 'abilityLevel > 0', effects: [effect] };
const source = (data: unknown) => ({ source: 'fixture.json', data });
const damageKinds = [{ id: 'fixture_arcane', class: 'non-melee' }];
const cast = {
  casterId: 'fixture_caster',
  abilityId: 'fixture_ability',
  sourceItemUid: 71,
  hand: 'left' as const,
  abilityLevel: 4,
  origin: { x: 1, y: 2, z: 3 },
  aim: { x: 0, y: 0, z: -1 },
};
const fixture = (rules: readonly unknown[] = [rule]) => buildRegistry([source({ rules, damageKinds })]);
const pack = (id: string, data: unknown, dependencies: string[] = []): PackInput => ({
  source: id,
  manifest: {
    id,
    version: 'fixture',
    tier: 'theme',
    product: false,
    dependencies,
    overrides: [],
    files: [{ path: 'rules.json', kind: 'content' }],
  },
  files: [{ source: 'rules.json', data }],
});

describe('cast rule admission and resolution', () => {
  it('resolves typed scaling without touching the event and skips a false condition', () => {
    const { registry, issues } = fixture();
    expect(issues).toEqual([]);
    const before = structuredClone(cast);
    const low = resolveCastRule(registry, rule.id, cast);
    const high = resolveCastRule(registry, rule.id, { ...cast, abilityLevel: 10 });
    expect(low).toMatchObject([{ verb: 'projectileVolley', count: 3, damage: 7, damageKind: 'fixture_arcane' }]);
    expect(high[0]!.count).toBeGreaterThan(low[0]!.count);
    expect(high[0]!.damage).toBeGreaterThan(low[0]!.damage);
    expect(resolveCastRule(registry, rule.id, { ...cast, abilityLevel: 0 })).toEqual([]);
    expect(cast).toEqual(before);
    expect(() => resolveCastRule(registry, 'missing', cast)).toThrow();
    expect(() => resolveCastRule(registry, rule.id, { ...cast, abilityLevel: 1.5 })).toThrow();
    expect(() => resolveCastRule(registry, rule.id, { ...cast, aim: { x: 0, y: 0, z: 0 } })).toThrow();
  });

  it('rejects an invalid expression or damage reference with source and field attribution, dropping the whole file', () => {
    for (const [patch, field] of [
      [{ count: 'abilityLevell' }, 'count'],
      [{ damage: 'true' }, 'damage'],
      [{ damageKind: 'missing' }, 'damageKind'],
    ] as const) {
      const { registry, issues } = fixture([{ ...rule, effects: [{ ...effect, ...patch }] }]);
      expect(issues).toContainEqual(
        expect.objectContaining({ source: 'fixture.json', path: `rules[0].effects[0].${field}` }),
      );
      expect(registry.rules.size).toBe(0);
      expect(registry.damageKinds.size).toBe(0);
    }
  });

  it('resolves every effect before publishing a request, including errors recovered by predicates', () => {
    const { registry, issues } = fixture([
      { ...rule, effects: [effect, { ...effect, count: '1 / (abilityLevel - 4)' }] },
    ]);
    expect(issues).toEqual([]);
    let published: unknown[] = [];
    expect(() => {
      published = resolveCastRule(registry, rule.id, cast);
    }).toThrow();
    expect(published).toEqual([]);
    const overflow = fixture([{ ...rule, condition: '(1 / (abilityLevel - 4) == 0) || true' }]);
    expect(overflow.issues).toEqual([]);
    expect(() => resolveCastRule(overflow.registry, rule.id, cast)).toThrow();
    const oversized = fixture([{ ...rule, effects: [{ ...effect, count: '9223372036854775807' }] }]);
    expect(oversized.issues).toEqual([]);
    expect(() => resolveCastRule(oversized.registry, rule.id, cast)).toThrow();
  });

  it('admits rule references only from declared dependencies and keeps overrides explicit', async () => {
    const base = pack('fixture.damage', { damageKinds });
    const magic = pack('fixture.magic', { rules: [rule] });
    expect(admitPacks([base, magic]).issues).toContainEqual(
      expect.objectContaining({ source: 'fixture.magic', path: 'dependencies' }),
    );
    magic.manifest.dependencies.push(base.manifest.id);
    const admitted = admitPacks([magic, base]);
    expect(admitted.issues).toEqual([]);
    expect(buildRegistry(admitted.sources).issues).toEqual([]);
    const override = pack('fixture.override', { rules: [{ ...rule, condition: 'false' }] }, ['fixture.magic']);
    expect(admitPacks([base, magic, override]).issues.length).toBeGreaterThan(0);
    override.manifest.overrides.push({ pack: 'fixture.magic', entry: 'rules:fixture_rule' });
    const overridden = admitPacks([base, magic, override]);
    expect(overridden.issues).toEqual([]);
    const replacement = buildRegistry(overridden.sources);
    expect(replacement.issues).toEqual([]);
    expect(resolveCastRule(replacement.registry, rule.id, cast)).toEqual([]);
    const changed = structuredClone(magic);
    changed.files[0]!.data = { rules: [{ ...rule, condition: 'false' }] };
    expect(await packContentHash(changed)).not.toBe(await packContentHash(magic));
  });

  it('compiles executable rules even when a matching bundle stamp skips reference proofs', async () => {
    const sources = [source({ rules: [rule], damageKinds })];
    const proofHash = '1'.repeat(64);
    const bundle = await BundleAdmission.prepare(
      sources,
      { sourceHash: await bundleSourceHash(sources), proofHash },
      proofHash,
    );
    expect(bundle).toBeDefined();
    const { registry, issues } = buildRegistry(sources, { bundle });
    expect(issues).toEqual([]);
    expect(resolveCastRule(registry, rule.id, cast)).toHaveLength(1);
  });

  it('bounds total rule work and rejects unsupported rule shape before dispatch', () => {
    const huge = { ...rule, effects: Array.from({ length: 17 }, () => effect) };
    expect(fixture([huge]).issues.length).toBeGreaterThan(0);
    const expensive = {
      ...rule,
      effects: Array.from({ length: 16 }, () => ({ ...effect, count: `${' '.repeat(5000)}1` })),
    };
    expect(fixture([expensive]).issues).toContainEqual(
      expect.objectContaining({
        source: 'fixture.json',
        path: 'rules[0]',
        message: 'rule exceeds total expression work reservation',
      }),
    );
    expect(fixture([{ ...rule, trigger: { event: 'tick' } }]).issues.length).toBeGreaterThan(0);
  });
});
