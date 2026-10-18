import { Environment } from '@marcbachmann/cel-js';
import { describe, expect, it } from 'vitest';
import {
  type Effect,
  type ModDef,
  ModHarness,
  modLimits,
  type Snapshot,
  type TickResult,
} from '../src/spikes/expressions/celMods.ts';
import { ModLoadError } from '../src/spikes/expressions/modLoadError.ts';
import authored from './fixtures/mods/cel-mod-spike.json' with { type: 'json' };

const input: Snapshot = { intellect: 12, level: 3, flags: ['focused'], target: { distance: 2 } };
const mods = (): ModDef[] => structuredClone(authored);
const harness = (defs = mods()) => new ModHarness(defs, 41);
const budget = modLimits.magnitude;
function fixture(expression: string, when = 'true'): ModDef[] {
  return [
    {
      id: 'fixture',
      dependencies: [],
      functions: [],
      state: [],
      rules: [{ id: 'fixture:rule', event: 'cast', when, effects: expression }],
    },
  ];
}

describe('restricted CEL mod harness (not shipped)', () => {
  it('runs a typed power from Jsonnet through bounded effects on the engine-bound target', () => {
    const h = harness(mods().filter((m) => m.id === 'mom'));
    const before = h.save();
    const result = h.tick('cast', input, budget);
    expect(result.issues).toEqual([]);
    expect(result.fired).toContain('mom:power');
    expect(result.effects.some((effect) => effect.kind === 'spend' && effect.amount > 0)).toBe(true);
    expect(result.effects.some((effect) => ['damage', 'overload'].includes(effect.kind))).toBe(true);
    expect(
      result.effects.every(
        (effect) => Number.isFinite(effect.amount) && (effect.kind === 'change' || effect.key === 'bound-target'),
      ),
    ).toBe(true);
    expect(h.applied().spend).toBeGreaterThan(0);
    expect(h.state('mom:uses')).toBeGreaterThan(0);
    expect(h.save()).not.toBe(before);
    const skipped = h.tick('cast', { ...input, flags: [] }, budget);
    expect(skipped.effects).toEqual([]);
  });

  it('bounds attunement, gates consequences by rank and decays on engine events', () => {
    const h = harness(mods().filter((m) => m.id !== 'resonance'));
    const declaration = h.declarations.get('attune:drain')!;
    const results: TickResult[] = [];
    const castsToCap = Math.ceil(declaration.max - declaration.min) + 1;
    for (let i = 0; i < castsToCap; i++) {
      const result = h.tick('cast', input, budget);
      expect(result.issues).toEqual([]);
      expect(h.state(declaration.key)).toBeGreaterThanOrEqual(declaration.min);
      expect(h.state(declaration.key)).toBeLessThanOrEqual(declaration.max);
      results.push(result);
    }
    expect(h.rank(declaration.key)).toBeGreaterThan(0);
    expect(results.some((r) => r.fired.includes('attune:quiet'))).toBe(true);
    expect(results.some((r) => r.fired.includes('attune:consequence'))).toBe(true);
    const beforeDecay = h.state(declaration.key);
    expect(h.tick('decay', input, budget).issues).toEqual([]);
    expect(h.state(declaration.key)).toBeLessThan(beforeDecay);
  });

  it('replays seeded weighted choices and resumes the same stream after save round-trip', () => {
    const left = harness();
    const right = harness();
    const choices: Effect[] = [];
    for (let i = 0; i < 8; i++) {
      const event = i % 3 === 0 ? 'decay' : 'cast';
      const result = left.tick(event, input, budget);
      expect(result.issues).toEqual([]);
      expect(right.tick(event, input, budget)).toEqual(result);
      choices.push(...result.effects.filter((effect) => ['overload', 'damage'].includes(effect.kind)));
    }
    expect(choices.length).toBeGreaterThan(0);
    const restored = harness();
    restored.restore(left.save());
    expect(restored.tick('cast', input, budget)).toEqual(left.tick('cast', input, budget));
    expect(restored.save()).toBe(left.save());
    expect(restored.applied()).toEqual(left.applied());
  });

  it('selects only positive-weight consequences and permits an empty eligible set', () => {
    const h = harness(fixture('weighted(roll, [0.0, 2.0], [damage(1.0), overload(1.0)])'));
    const result = h.tick('cast', input, budget);
    expect(result.issues).toEqual([]);
    expect(result.effects).toEqual([{ kind: 'overload', key: 'bound-target', amount: 1 }]);
    const empty = harness(fixture('weighted(roll, [0.0], [damage(1.0)])')).tick('cast', input, budget);
    expect(empty.issues).toEqual([]);
    expect(empty.effects).toEqual([]);
  });

  it('orders dependencies and same-event rules independently of input order', () => {
    const normal = harness();
    const reversed = harness(
      mods()
        .reverse()
        .map((mod) => ({ ...mod, rules: mod.rules.reverse() })),
    );
    const a = normal.tick('cast', input, budget);
    expect(a.issues).toEqual([]);
    expect(reversed.tick('cast', input, budget)).toEqual(a);
    expect(a.fired.indexOf('mom:power')).toBeLessThan(a.fired.indexOf('resonance:echo'));
    expect(a.fired).toContain('resonance:echo');
    const absent = harness(mods().filter((m) => m.id !== 'attune'));
    expect(absent.tick('cast', input, budget).fired).not.toContain('resonance:echo');
  });

  it('shares the tick budget across event rules and both chain branches, rolling back all state and randomness', () => {
    const h = harness();
    const first = h.rules.get('mom:power')!;
    const firstCost = first.when.cost + first.effects.cost;
    const before = h.save();
    const result = h.tick('cast', input, firstCost);
    expect(result.issues).toEqual([
      { source: 'attune', path: 'rules.attune:gain', message: expect.stringContaining('tick cost limit') },
    ]);
    expect(result.spent).toBeLessThanOrEqual(firstCost);
    expect(result.effects).toEqual([]);
    expect(h.save()).toBe(before);
    const full = h.tick('cast', input, budget);
    const under = harness().tick('cast', input, full.spent - 1);
    expect(under.issues[0]?.message).toContain('tick cost limit');
    expect(under.spent).toBeLessThan(full.spent);
    const again = harness().tick('cast', input, full.spent);
    expect(again).toEqual(full);
    const chained = fixture('[overload(1.0)]');
    chained[0]!.rules[0]!.onFalse = 'fixture:tail';
    chained[0]!.rules[0]!.when = 'false';
    chained[0]!.rules.push({ id: 'fixture:tail', when: 'true', effects: '[damage(1.0)]' });
    const branch = harness(chained);
    const head = branch.rules.get('fixture:rule')!;
    expect(branch.tick('cast', input, head.when.cost + head.effects.cost).issues[0]?.message).toContain(
      'tick cost limit',
    );
  });

  it('stops cyclic rule chains and rejects recursive named functions', () => {
    const defs = fixture('[overload(1.0)]');
    defs[0]!.rules[0]!.onTrue = 'fixture:rule';
    const h = harness(defs);
    const before = h.save();
    expect(h.tick('cast', input, budget).issues[0]?.message).toContain('chain depth');
    expect(h.save()).toBe(before);
    defs[0]!.functions = [{ name: 'loop', params: ['n'], expression: 'fixture_loop(n)' }];
    expect(() => harness(defs)).toThrow('recursive function');
  });

  it.each([
    ['unknown effect', '[teleport(1.0)]', 'true'],
    ['unknown function', '[damage(missing(1.0))]', 'true'],
    ['unknown state read', '[damage(state["other:missing"])]', 'true'],
    ['unknown state write', '[change("other:missing", 1.0)]', 'true'],
    ['bad argument type', '[damage("wrong")]', 'true'],
    ['undeclared input', '[damage(missing)]', 'true'],
    ['host traversal', '[damage(target.constructor)]', 'true'],
    ['nested comprehension', '[damage(1.0)]', 'flags.all(x, flags.exists(y, y == x))'],
    ['nested traversal through indexing', '[damage(1.0)]', 'flags.all(x, [flags.exists(y, y == x)][0])'],
    ['dynamic map reference', '[damage(state[flags[0]])]', 'true'],
  ])('reports %s at the mod/rule load boundary', (_label, expression, when) => {
    try {
      harness(fixture(expression!, when!));
      expect.fail('must reject');
    } catch (error) {
      expect(error).toBeInstanceOf(ModLoadError);
      expect((error as ModLoadError).issue).toMatchObject({ source: 'fixture', path: 'rules.fixture:rule' });
      expect((error as Error).message.length).toBeGreaterThan(0);
    }
  });

  it('enforces source and aggregate bounds before evaluating rules or discovering named calls', () => {
    const oversized = `[${new Array<string>(modLimits.collection + 1).fill('damage(1.0)').join(',')}]`;
    expect(() => harness(fixture(oversized))).toThrow(ModLoadError);
    const defs = fixture('[damage(1.0)]');
    defs[0]!.functions.push({ name: 'large', params: [], expression: `${' '.repeat(modLimits.source + 1)}1.0` });
    expect(() => harness(defs)).toThrow('source limit');
    const states = fixture('[damage(1.0)]');
    states[0]!.state = Array.from({ length: modLimits.collection + 1 }, (_, i) => ({
      key: `fixture:s${i}`,
      min: 0,
      max: 1,
      initial: 0,
      bands: [],
    }));
    expect(() => harness(states)).toThrow('state collection limit');
  });

  it('checks event, rule, dependency and cross-mod visibility references before a tick', () => {
    for (const kind of ['event', 'rule', 'dependency', 'visibility']) {
      const defs = fixture('[damage(1.0)]');
      if (kind === 'event') {
        defs[0]!.rules[0]!.event = 'unknown';
      }
      if (kind === 'rule') {
        defs[0]!.rules[0]!.onTrue = 'unknown:rule';
      }
      if (kind === 'dependency') {
        defs[0]!.dependencies = ['unknown'];
      }
      if (kind === 'visibility') {
        defs.push(mods()[0]!);
        defs[0]!.rules[0]!.effects = '[damage(mom_strength(1.0, 1.0, 1.0))]';
      }
      expect(() => harness(defs), kind).toThrow(ModLoadError);
    }
  });

  it.each(['"owner:counter" in state', 'state == {"owner:counter": 1.0}'])(
    'hides foreign state from aggregate reads unless a dependency grants visibility: %s',
    (when) => {
      const defs = fixture('[damage(1.0)]', when);
      defs.push({
        id: 'owner',
        dependencies: [],
        functions: [],
        state: [{ key: 'owner:counter', min: 0, max: 2, initial: 1, bands: [] }],
        rules: [],
      });
      const hidden = harness(defs).tick('cast', input, budget);
      expect(hidden.issues).toEqual([]);
      expect(hidden.fired).toEqual([]);
      defs[0]!.dependencies = ['owner'];
      const visible = harness(defs).tick('cast', input, budget);
      expect(visible.issues).toEqual([]);
      expect(visible.fired).toContain('fixture:rule');
    },
  );

  it.each([
    ['1.0 / level > 0.0 || true', '[damage(1.0)]', false],
    ['exp(intellect) > 0.0 || true', '[damage(1.0)]', false],
    ['1.0 / level > 0.0 && false', '[damage(1.0)]', false],
    ['[0.0, 1.0].exists(x, 1.0 / x > 0.0)', '[damage(1.0)]', false],
    ['[0.0, 1.0].exists(x, fixture_risky(x) > 0.0)', '[damage(1.0)]', true],
    ['true', '[damage((fixture_risky(level) > 0.0 || true) ? 1.0 : 0.0)]', true],
  ])('rejects evaluated callback failures even when CEL suppresses them: %s / %s', (when, effects, named) => {
    const defs = fixture(effects, when);
    defs[0]!.functions.push({ name: 'risky', params: ['n'], expression: '1.0 / n' });
    defs[0]!.state.push({ key: 'fixture:counter', min: 0, max: 2, initial: 0, bands: [] });
    defs[0]!.rules.unshift({
      id: 'fixture:a_commit',
      event: 'cast',
      when: 'true',
      effects: '[change("fixture:counter", 1.0), overload(1.0)]',
    });
    const h = harness(defs);
    const before = h.save();
    const result = h.tick('cast', { ...input, intellect: 1000, level: 0 }, budget);
    expect(result.issues).toEqual([
      {
        source: 'fixture',
        path: `rules.fixture:rule.${when === 'true' ? 'effects' : 'when'}`,
        message: expect.stringContaining('offset'),
      },
    ]);
    if (named) {
      expect(result.issues[0]!.message).toContain('fixture:functions.risky');
    }
    expect(result.effects).toEqual([]);
    expect(result.fired).toEqual([]);
    expect(h.save()).toBe(before);
  });

  it.each([
    'true || 1.0 / level > 0.0',
    '!(false && 1.0 / level > 0.0)',
    '[1.0, 0.0].exists(x, 1.0 / x > 0.0)',
    'true ? true : exp(intellect) > 0.0',
  ])('does not fail for checked callbacks in branches never evaluated: %s', (when) => {
    const h = harness(fixture('[damage(1.0)]', when));
    const result = h.tick('cast', { ...input, intellect: 1000, level: 0 }, budget);
    expect(result.issues).toEqual([]);
    expect(result.fired).toContain('fixture:rule');
  });

  it('clears a suppressed callback failure before the next evaluation of the same program', () => {
    const h = harness(fixture('[damage(1.0)]', '1.0 / level > 0.0 || true'));
    expect(h.tick('cast', { ...input, level: 0 }, budget).issues.length).toBeGreaterThan(0);
    const success = h.tick('cast', input, budget);
    expect(success.issues).toEqual([]);
    expect(success.fired).toContain('fixture:rule');
  });

  it('admits bounded maps, list membership and all/exists without unbounded macros', () => {
    const h = harness(
      fixture(
        '[damage(pow(2.0, 3.0)), spend(exp(0.0))]',
        'flags.all(x, x in ["focused", "safe"]) && "key" in {"key": 1.0}',
      ),
    );
    expect(h.tick('cast', input, budget).issues).toEqual([]);
    expect(h.applied().damage).toBeGreaterThan(0);
    const before = h.save();
    expect(
      h.tick('cast', { ...input, flags: new Array<string>(modLimits.collection + 1).fill('focused') }, budget).issues[0]
        ?.message,
    ).toContain('flags limit');
    expect(h.save()).toBe(before);
    let accessed = false;
    const hostile = {
      ...input,
      get intellect() {
        accessed = true;
        return 1;
      },
    };
    expect(h.tick('cast', hostile, budget).issues[0]?.message).toContain('accessors');
    expect(accessed).toBe(false);
  });

  it.each(['[damage(1.0 / level)]', '[damage(exp(intellect))]', '[damage(target["missing"])]'])(
    'turns runtime math or input errors into located issues and rolls the tick back: %s',
    (expression) => {
      const h = harness(fixture(expression));
      const before = h.save();
      const result = h.tick('cast', { ...input, intellect: 1000, level: 0 }, budget);
      expect(result.issues).toEqual([
        { source: 'fixture', path: 'rules.fixture:rule.effects', message: expect.stringContaining('offset') },
      ]);
      expect(h.save()).toBe(before);
      expect(result.effects).toEqual([]);
    },
  );

  it('rejects out-of-range writes and malformed or mismatched saves without partial restore', () => {
    const defs = mods();
    defs.find((m) => m.id === 'attune')!.rules.find((r) => r.id === 'attune:gain')!.effects =
      '[change("attune:drain", 1000.0)]';
    const h = harness(defs);
    const before = h.save();
    expect(h.tick('cast', input, budget).issues[0]?.message).toContain('outside bounds');
    expect(h.save()).toBe(before);
    const saved = JSON.parse(before) as { identity: string; values: Record<string, number>; rng: number };
    for (const bad of [
      { ...saved, identity: 'other' },
      { ...saved, values: { ...saved.values, 'attune:drain': 1e9 } },
      { ...saved, values: {} },
      { ...saved, rng: 0 },
    ]) {
      expect(() => h.restore(JSON.stringify(bad))).toThrow();
      expect(h.save()).toBe(before);
    }
  });

  it('records the native CEL arithmetic hazard that the checked math profile excludes', () => {
    const env = new Environment();
    expect(Number.isFinite(env.evaluate('1.0 / 0.0'))).toBe(false);
    expect(harness(fixture('[damage(1.0 / 0.0)]')).tick('cast', input, budget).issues[0]?.message).toContain(
      'division by zero',
    );
  });
});
