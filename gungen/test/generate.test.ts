import { describe, expect, it } from 'vitest';
import { generate, generateValid } from '../src/core/generate.ts';
import { seededRng } from '../src/core/random.ts';
import type { ParamReference, Template } from '../src/core/template.ts';
import { validate } from '../src/core/validate.ts';
import { gunDomain } from '../src/gun/domain.ts';
import { TEMPLATES } from '../src/gun/templates.ts';
import { sweepGroup } from './sweeps.ts';

const SEEDS = 300;

describe('seededRng', () => {
  // mulberry32's published sequence for seed 1.
  it('is stable across runs and machines', () => {
    const rng = seededRng(1);
    expect([rng(), rng(), rng()].map((x) => x.toFixed(6))).toEqual(['0.627074', '0.002736', '0.527447']);
  });
});

describe('generate', () => {
  it('is deterministic: same seed, same assembly', () => {
    for (const t of TEMPLATES) {
      expect(generate(t, gunDomain, 42)).toEqual(generate(t, gunDomain, 42));
    }
  });

  sweepGroup('varies with the seed', () => {
    it('passes', () => {
      for (const t of TEMPLATES) {
        const keys = new Set(
          Array.from({ length: 50 }, (_, seed) => JSON.stringify(generate(t, gunDomain, seed).parts)),
        );
        expect(keys.size).toBeGreaterThan(5);
      }
    });
  });

  it('includes conditional slots only when an earlier parameter matches', () => {
    const t: Template = {
      name: 'conditional-slot',
      description: '',
      root: 'receiver',
      slots: [
        { id: 'receiver', family: 'receiver' },
        { id: 'lower', family: 'lower', params: { layout: ['pump', 'trigger'] } },
        {
          id: 'grip',
          family: 'grip',
          params: { length: 'M' },
          when: { part: 'lower', param: 'layout', equals: 'trigger' },
        },
      ],
      connections: [],
    };
    for (let seed = 0; seed < 100; seed++) {
      const assembly = generate(t, gunDomain, seed);
      expect('grip' in assembly.parts, `seed ${seed}`).toBe(assembly.parts.lower?.params?.layout === 'trigger');
    }
  });

  it('honours chance 0 and chance 1', () => {
    const t: Template = {
      name: 'probe',
      description: '',
      root: 'receiver',
      slots: [
        { id: 'receiver', family: 'receiver' },
        { id: 'never', family: 'sight', chance: 0 },
        { id: 'always', family: 'sight', chance: 1 },
      ],
      connections: [
        { from: 'receiver.rail', to: 'never.base', slot: 0 },
        { from: 'receiver.rail', to: 'always.base', slot: 1, chance: 0 },
      ],
    };
    for (let seed = 0; seed < 20; seed++) {
      const a = generate(t, gunDomain, seed);
      expect(Object.keys(a.parts).sort()).toEqual(['always', 'receiver']);
      expect(a.connections).toEqual([]);
    }
  });
});

describe('templates', () => {
  for (const t of TEMPLATES) {
    describe(t.name, () => {
      // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: predates the complexity limit; split it up when next changed
      it('only chooses families and param values that exist', () => {
        for (const slot of t.slots) {
          const family = gunDomain.families[slot.family];
          expect(family, slot.family).toBeDefined();
          for (const [name, choice] of Object.entries(slot.params ?? {})) {
            const spec = family!.params[name];
            expect(spec, `${slot.id}.${name}`).toBeDefined();
            if (typeof choice === 'object' && !Array.isArray(choice)) {
              const reference = choice as ParamReference;
              const source = t.slots.find((candidate) => candidate.id === reference.fromSlot);
              expect(source, `${slot.id}.${name} source slot`).toBeDefined();
              expect(source!.params?.[reference.param], `${slot.id}.${name} source param`).toBeDefined();
              continue;
            }
            for (const v of Array.isArray(choice) ? choice : [choice]) {
              expect(spec!.values).toContain(v);
            }
          }
        }
      });

      it('generateValid finds a passing build', () => {
        const found = generateValid(t, gunDomain, 1000)!;
        expect(found.report.ok).toBe(true);
        expect(found.seed).toBe(1000 + found.attempts - 1);
        expect(found.assembly).toEqual(generate(t, gunDomain, found.seed));
      });
    });
  }
});

// Same describe names as above so the snapshot keys stay `templates > <name> > known-good seeds`.
sweepGroup('templates', () => {
  for (const t of TEMPLATES) {
    describe(t.name, () => {
      it(`never produces a structurally broken file (${SEEDS} seeds)`, () => {
        for (let seed = 0; seed < SEEDS; seed++) {
          const { issues } = validate(generate(t, gunDomain, seed), gunDomain);
          expect(
            issues.filter((i) => i.rule === 'structure'),
            `seed ${seed}`,
          ).toEqual([]);
        }
      });

      it(`is valid at least half the time (${SEEDS} seeds)`, () => {
        let valid = 0;
        for (let seed = 0; seed < SEEDS; seed++) {
          if (validate(generate(t, gunDomain, seed), gunDomain).ok) {
            valid += 1;
          }
        }
        expect(valid / SEEDS).toBeGreaterThanOrEqual(0.5);
      });

      // Known-good seeds. A snapshot change means generation changed: check
      // the new builds in the viewer before updating (vitest -u).
      it('known-good seeds', () => {
        const gallery = [1, 2, 3].map((seed) => generateValid(t, gunDomain, seed * 100)!.assembly);
        expect(gallery).toMatchSnapshot();
      });
    });
  }
});
