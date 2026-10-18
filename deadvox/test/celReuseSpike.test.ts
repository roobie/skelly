import { Environment } from '@marcbachmann/cel-js';
import { describe, expect, it, vi } from 'vitest';
import {
  compileModExpression,
  engineLibraryIdentity,
  type ModDef,
  ModHarness,
  modLimits,
} from '../src/spikes/expressions/celMods.ts';
import { ModLoadError } from '../src/spikes/expressions/modLoadError.ts';
import authored from './fixtures/mods/cel-reuse-spike.json' with { type: 'json' };

const mods = (): ModDef[] => structuredClone(authored);
const input = { intellect: 12, level: 3, flags: [], target: {} };
const budget = modLimits.magnitude;
const library = () => mods().find((m) => m.id === 'bandsv1')!;
function compile(source: string, schema: Record<string, string>, result: string) {
  const h = new ModHarness(mods());
  return compileModExpression(source, {
    schema,
    result,
    functions: h.functionScope('plain'),
    states: new Set(),
  });
}

describe('CEL reuse evidence (not adoption)', () => {
  it('keeps a dependent replacement out of its library and independent sibling scopes', () => {
    const defs = mods();
    const h = new ModHarness(defs);
    expect(library().state).toEqual([]);
    expect(library().rules).toEqual([]);
    const original = h.functions.get('bandsv1_score')!;
    const replacement = h.functions.get('changed_score')!;
    expect(h.functionScope('bandsv1').get('bandsv1_score')).toBe(original);
    expect(h.functionScope('plain').get('bandsv1_score')).toBe(original);
    expect(h.functionScope('changed').get('bandsv1_score')).toBe(replacement);
    const result = h.tick('cast', input, budget);
    expect(result.issues).toEqual([]);
    const damages = result.effects.filter((effect) => effect.kind === 'damage');
    expect(damages).toHaveLength(3);
    expect(damages[0]!.amount).not.toBe(damages[1]!.amount);
    const reversed = new ModHarness(defs.reverse());
    expect(reversed.tick('cast', input, budget)).toEqual(result);
  });

  it('reports a missing library identity and a breaking signature rather than solving versions', () => {
    const defs = mods();
    defs.find((m) => m.id === 'bandsv1')!.id = 'bandsv2';
    try {
      expect(new ModHarness(defs)).toBeDefined();
      expect.fail('missing dependency must fail');
    } catch (error) {
      expect(error).toBeInstanceOf(ModLoadError);
      expect((error as ModLoadError).issue).toMatchObject({
        source: 'changed',
        path: 'dependencies',
        message: 'unknown dependency bandsv1',
      });
    }
    for (const mod of defs) {
      mod.dependencies = mod.dependencies.map((dep) => (dep === 'bandsv1' ? 'bandsv2' : dep));
      for (const fn of mod.functions) {
        fn.expression = fn.expression.replaceAll('bandsv1_', 'bandsv2_');
        if (fn.replaces) {
          fn.replaces = fn.replaces.replaceAll('bandsv1_', 'bandsv2_');
        }
      }
      for (const rule of mod.rules) {
        rule.effects = rule.effects.replaceAll('bandsv1_', 'bandsv2_');
      }
    }
    expect(new ModHarness(defs).tick('cast', input, budget).issues).toEqual([]);
    const breaking = mods().filter((m) => m.id !== 'changed');
    breaking.find((m) => m.id === 'bandsv1')!.functions.find((fn) => fn.name === 'table')!.params = [
      { name: 'bands', type: 'map<string, double>' },
    ];
    breaking.find((m) => m.id === 'bandsv1')!.functions.find((fn) => fn.name === 'table')!.expression = 'bands';
    expect(() => new ModHarness(breaking)).toThrow('plain:rules.plain:use');
  });

  it('lets CEL check typed collection arguments and results through named bodies', () => {
    const values = [1, 4];
    const list = compile('bandsv1_copy(bands)', { bands: 'list<double>' }, 'list<double>');
    expect(list.run({ bands: values })).toEqual(values);
    const table = compile('bandsv1_table(bands)', { bands: 'list<double>' }, 'map<string, double>');
    expect(table.run({ bands: values })).toEqual(
      new Map([
        ['low', values[0]],
        ['high', values[1]],
      ]),
    );
    expect(() => compile('bandsv1_table(["wrong"])', {}, 'map<string, double>')).toThrow('overload');
    const defs = mods();
    defs[0]!.functions.find((fn) => fn.name === 'copy')!.expression = 'true';
    expect(() => new ModHarness(defs)).toThrow('expected list<double>, got bool');
  });

  it('reserves bounded collection traversal and reachable body work before evaluation', () => {
    const direct = compile('bands.all(x, x > 0.0)', { bands: 'list<double>' }, 'bool');
    const named = compile('bandsv1_copy(bands).all(x, x > 0.0)', { bands: 'list<double>' }, 'bool');
    expect(named.cost).toBeGreaterThan(direct.cost);
    const defs = mods();
    const plain = defs.find((m) => m.id === 'plain')!;
    plain.rules[0]!.when = 'bandsv1_copy([1.0, 4.0]).all(x, x > 0.0)';
    const h = new ModHarness(defs.filter((m) => ['bandsv1', 'plain'].includes(m.id)));
    const rule = h.rules.get('plain:use')!;
    const reserved = rule.when.cost + rule.effects.cost;
    expect(h.tick('cast', input, reserved).issues).toEqual([]);
    expect(h.tick('cast', input, reserved - 1).issues[0]?.message).toContain('tick cost limit');
    const call = compile('bandsv1_copy(bands)', { bands: 'list<double>' }, 'list<double>');
    expect(() => call.run({ bands: new Array(modLimits.collection + 1).fill(1) })).toThrow('invalid bounded');
  });

  it('requires explicit snapshots even for record-returning functions', () => {
    const defs = mods();
    defs[0]!.state = [{ key: 'bandsv1:counter', min: 0, max: 2, initial: 1, bands: [] }];
    defs[0]!.functions.find((fn) => fn.name === 'table')!.expression = '{"low": state["bandsv1:counter"]}';
    expect(() => new ModHarness(defs)).toThrow('unknown state');
  });

  it('uses the public native bind extension once without leaking its local name', () => {
    const env = new Environment({ unlistedVariablesAreDyn: false });
    let calls = 0;
    env.registerFunction('sample(): double', () => {
      calls += 1;
      return 2;
    });
    const native = env.parse('cel.bind(x, sample(), x + x)');
    expect(native.check().valid).toBe(true);
    expect(native({})).toBe(4);
    expect(calls).toBe(1);
    const h = new ModHarness(mods());
    const body = vi.spyOn(h.functions.get('bandsv1_table')!.program, 'run');
    expect(h.tick('cast', input, budget).issues).toEqual([]);
    expect(body).toHaveBeenCalledTimes(2);
    body.mockRestore();
    expect(() => compile('cel.bind(x, 1.0, x) + x', {}, 'double')).toThrow();
    const once = compile('cel.bind(x, bandsv1_score({"low": 1.0, "high": 4.0}, 3.0), x + x)', {}, 'double');
    const twice = compile(
      'bandsv1_score({"low": 1.0, "high": 4.0}, 3.0) + bandsv1_score({"low": 1.0, "high": 4.0}, 3.0)',
      {},
      'double',
    );
    expect(once.run({})).toBe(twice.run({}));
    expect(once.cost).toBeLessThan(twice.cost);
    expect(() => compile('cel.bind(x, 1.0 / 0.0, x > 0.0 || true)', {}, 'bool').run({})).toThrow('division by zero');
  });

  it('rejects alias-built nested aggregates before reserving equality or membership work', () => {
    const tree = (comparison: string): string => {
      let source = comparison;
      for (let i = 4; i >= 0; i--) {
        const a = i ? `[${new Array(modLimits.collection).fill(`a${i - 1}`).join(',')}]` : '[0.0]';
        const b = i ? `[${new Array(modLimits.collection).fill(`b${i - 1}`).join(',')}]` : '[0.0]';
        source = `cel.bind(a${i}, ${a}, cel.bind(b${i}, ${b}, ${source}))`;
      }
      return source;
    };
    for (const comparison of ['a4 == b4', 'a4 in [b4]']) {
      expect(() => compile(tree(comparison), {}, 'bool')).toThrow('nested aggregate construction');
    }
    for (const value of [
      '[flags]',
      '[true ? flags : flags]',
      '[cel.bind(flags, flags, flags)]',
      '{"nested": flags}',
      '[bandsv1_copy([1.0])]',
    ]) {
      expect(() => compile(`${value} == ${value}`, { flags: 'list<string>' }, 'bool')).toThrow(
        'nested aggregate construction',
      );
    }
    const flat = compile('cel.bind(a, [1.0], cel.bind(b, [1.0], a == b && 1.0 in b))', {}, 'bool');
    expect(flat.run({})).toBe(true);
    expect(compile('[cel.bind(flags, 1.0, flags)]', { flags: 'list<string>' }, 'list<double>').run({})).toEqual([1]);
  });

  it('exposes checked engine helpers without dependencies and namespaces a same-name mod helper', () => {
    const standalone = mods().filter((m) => m.id === 'standalone');
    expect(standalone[0]!.dependencies).toEqual([]);
    const h = new ModHarness(standalone);
    const result = h.tick('cast', input, budget);
    expect(result.issues).toEqual([]);
    expect(result.effects.map((effect) => effect.kind)).toEqual(['damage', 'overload', 'spend']);
    expect(h.functions.has('standalone_clamp')).toBe(true);
    expect(h.functions.has('clamp')).toBe(false);
    standalone[0]!.functions[0]!.replaces = 'clamp';
    expect(() => new ModHarness(standalone)).toThrow('invalid replacement');
    expect(() => compile('lerp(0.0, 1.0, "wrong")', {}, 'double')).toThrow('overload');
    expect(() => compile(`lerp(0.0, ${modLimits.magnitude}.0, 2.0)`, {}, 'double').run({})).toThrow('bounded finite');
  });

  it('rejects ambiguous visible replacements and replacement signature changes', () => {
    const defs = mods();
    const changed = defs.find((m) => m.id === 'changed')!;
    const second = structuredClone(changed);
    second.id = 'second';
    second.rules = [];
    defs.push(second, { id: 'both', dependencies: ['changed', 'second'], functions: [], state: [], rules: [] });
    expect(() => new ModHarness(defs)).toThrow('conflicting replacement bandsv1_score');
    changed.functions[0]!.params = ['table'];
    expect(
      () =>
        new ModHarness(
          mods()
            .filter((m) => m.id !== 'changed')
            .concat(changed),
        ),
    ).toThrow('invalid replacement');
  });

  it('includes engine library semantics in strict save and replay identity', () => {
    const h = new ModHarness(mods());
    const saved = JSON.parse(h.save()) as { identity: string };
    const identity = JSON.parse(saved.identity) as { engineLibrary: string };
    expect(identity.engineLibrary).toBe(engineLibraryIdentity);
    identity.engineLibrary = 'different-engine-semantics';
    saved.identity = JSON.stringify(identity);
    expect(() => h.restore(JSON.stringify(saved))).toThrow('mod identity mismatch');
    const changed = mods();
    changed[0]!.functions.find((fn) => fn.name === 'score')!.expression = 'value';
    expect(() => new ModHarness(changed).restore(h.save())).toThrow('mod identity mismatch');
  });
});
