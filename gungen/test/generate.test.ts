import { generate, generateValid } from '@skelly/engine/assembly/generate.ts';
import type { ParamReference, Template } from '@skelly/engine/assembly/template.ts';
import { validate } from '@skelly/engine/assembly/validate.ts';
import { describe, expect, it } from 'vitest';
import { gunDomain } from '../src/gun/domain.ts';
import { TEMPLATES } from '../src/gun/templates.ts';
import { sweepGroup } from './sweeps.ts';

const SEEDS = 300;
const CHUNK = 25;

describe('generate', () => {
  it('is deterministic: same seed, same assembly', () => {
    for (const t of TEMPLATES) {
      expect(generate(t, gunDomain, 42)).toEqual(generate(t, gunDomain, 42));
    }
  });

  it('uses the seed to select authored parameter choices', () => {
    const fixture: Template = {
      name: 'seed-choice-fixture',
      description: '',
      root: 'receiver',
      slots: [{ id: 'receiver', family: 'receiver', params: { rail: ['full', 'none'] } }],
      connections: [],
    };
    const choices = new Set(
      Array.from({ length: 8 }, (_, seed) => generate(fixture, gunDomain, seed).parts.receiver!.params!.rail),
    );
    expect(choices.size).toBeGreaterThan(1);
  });

  it('includes conditional slots only when an earlier parameter matches', () => {
    // The source parameter is fixed per case, so no seed has to roll each value.
    for (const layout of ['pump', 'trigger'] as const) {
      const t: Template = {
        name: 'conditional-slot',
        description: '',
        root: 'receiver',
        slots: [
          { id: 'receiver', family: 'receiver' },
          { id: 'lower', family: 'lower', params: { layout } },
          {
            id: 'grip',
            family: 'grip',
            params: { length: 'M' },
            when: { part: 'lower', param: 'layout', equals: 'trigger' },
          },
        ],
        connections: [],
      };
      expect('grip' in generate(t, gunDomain, 0).parts, layout).toBe(layout === 'trigger');
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
        { from: 'receiver.rail', to: 'never.base', slot: 0, chance: 0 },
        // A chance-1 sibling proves the connection step runs at all, so the dropped chance-0 one is not a vacuous gap.
        { from: 'receiver.rail', to: 'always.base', slot: 1, chance: 0 },
        { from: 'receiver.rail', to: 'always.base', slot: 2 },
      ],
    };
    for (const seed of [0, 1]) {
      const a = generate(t, gunDomain, seed);
      expect(Object.keys(a.parts).sort()).toEqual(['always', 'receiver']);
      expect(a.connections.filter(({ to }) => to === 'always.base')).toHaveLength(1);
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
              if ('when' in choice) {
                const source = t.slots.find((candidate) => candidate.id === choice.when.part);
                expect(source, `${slot.id}.${name} condition slot`).toBeDefined();
                expect(t.slots.indexOf(source!), `${slot.id}.${name} condition is chosen first`).toBeLessThan(
                  t.slots.indexOf(slot),
                );
                expect(source!.params?.[choice.when.param], `${slot.id}.${name} condition param`).toBeDefined();
                for (const branch of [choice.onMatch, choice.onMismatch]) {
                  for (const value of Array.isArray(branch) ? branch : [branch]) {
                    expect(spec!.values).toContain(value);
                  }
                }
                continue;
              }
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

sweepGroup('templates', () => {
  for (const t of TEMPLATES) {
    const chunkSize = t.name === 'ar' || t.name === 'ak' ? 10 : CHUNK;
    describe(t.name, () => {
      // Chunked by seed range so each test stays well inside the default timeout; the sweep
      // runs only in CI (see sweeps.ts) and its timeouts are never raised. The AR and AK families
      // are costly, so they use smaller chunks. The half-valid floor is an aggregate over all SEEDS seeds, so chunks tally into a
      // memoized count and one final test asserts it (computing any chunk that has not run, e.g. under `-t`).
      // Each chunk test also records its valid count, so the final test is normally free.
      const validIn = new Map<number, number>();
      const countValid = (from: number) => {
        let count = validIn.get(from);
        if (count === undefined) {
          count = 0;
          for (let seed = from; seed < from + chunkSize; seed++) {
            if (validate(generate(t, gunDomain, seed), gunDomain).ok) {
              count += 1;
            }
          }
          validIn.set(from, count);
        }
        return count;
      };
      for (let from = 0; from < SEEDS; from += chunkSize) {
        it(`never produces a structurally broken file (seeds ${from}-${from + chunkSize - 1})`, () => {
          let count = 0;
          for (let seed = from; seed < from + chunkSize; seed++) {
            const { issues, ok } = validate(generate(t, gunDomain, seed), gunDomain);
            if (ok) {
              count += 1;
            }
            expect(
              issues.filter((i) => i.rule === 'structure'),
              `seed ${seed}`,
            ).toEqual([]);
          }
          validIn.set(from, count);
        });
      }

      it(`is valid at least half the time (${SEEDS} seeds)`, () => {
        let valid = 0;
        for (let from = 0; from < SEEDS; from += chunkSize) {
          valid += countValid(from);
        }
        expect(valid / SEEDS).toBeGreaterThanOrEqual(0.5);
      });
    });
  }
});
