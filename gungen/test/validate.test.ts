import { describe, expect, it } from 'vitest';
import type { Assembly, Domain, PartDef, Rule } from '../src/core/schema.ts';
import { validate } from '../src/core/validate.ts';
import { GUN_UNITS } from '../src/gun/units.ts';

const emptyPart: PartDef = { family: 'empty', ports: [], solids: [], keepOuts: [], axes: [] };
const assembly: Assembly = {
  name: 'disconnected',
  root: 'root',
  parts: { root: { family: 'empty' }, detached: { family: 'empty' } },
  connections: [],
};

const domain = (rules: readonly Rule[] = []): Domain => ({
  name: 'test',
  families: { empty: { name: 'empty', params: {}, build: () => emptyPart } },
  axisRules: [],
  units: GUN_UNITS,
  rules,
});

describe('validate', () => {
  it('reports each disconnected part without required ports as one structure issue', () => {
    const report = validate(assembly, domain());
    expect(report.issues.filter((issue) => issue.rule === 'structure' && issue.parts.includes('detached'))).toEqual([
      expect.objectContaining({ rule: 'structure', parts: ['detached'] }),
    ]);
  });

  it('turns a throwing rule into exactly one Rule crashed issue', () => {
    const crashingRule: Rule = {
      id: 'test-crash',
      title: 'Crashing test rule',
      check: () => {
        throw new Error('deliberate failure');
      },
    };
    expect(validate(assembly, domain([crashingRule])).issues.filter((issue) => issue.rule === 'test-crash')).toEqual([
      { rule: 'test-crash', message: 'Rule crashed: deliberate failure', parts: [] },
    ]);
  });
});
