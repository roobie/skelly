import { expect, it } from 'vitest';
import { loadDesignValue } from '../src/assembly/designLoader.ts';
import { generate } from '../src/assembly/generate.ts';
import type { Assembly, Domain } from '../src/assembly/schema.ts';
import type { Template } from '../src/assembly/template.ts';

const domain: Domain = {
  name: 'fixture',
  units: { metresPerUnit: 1, grid: 0.001, bevel: 0 },
  families: {
    block: {
      name: 'block',
      params: {
        mode: { values: ['x', 'y'], default: 'x' },
        size: { values: ['big', 'small'], default: 'small' },
      },
      build: () => ({ family: 'block', ports: [], solids: [], keepOuts: [], axes: [] }),
    },
  },
  axisRules: [],
};

// `a` leaves mode unset, so both of `b`'s choices read a.mode's family default.
const template: Template = {
  name: 'fixture',
  description: 'Choices that read an unset param.',
  root: 'a',
  slots: [
    { id: 'a', family: 'block' },
    {
      id: 'b',
      family: 'block',
      params: {
        size: { when: { part: 'a', param: 'mode', equals: 'x' }, onMatch: 'big', onMismatch: 'small' },
        mode: { fromSlot: 'a', param: 'mode' },
      },
    },
  ],
  connections: [],
};

const templateChoiceIssues = (assembly: Assembly) => {
  const loaded = loadDesignValue(
    { format: 1, template: template.name, status: 'draft', locks: { params: {}, optionalParts: [] }, assembly },
    { domain, template, prefabs: [] },
  );
  if (!loaded.ok) {
    throw new Error(loaded.error.message);
  }
  return loaded.issues.filter(({ code }) => code === 'template-choice');
};

it('reads an unset param as its family default in both the generator and the design loader', () => {
  const generated = generate(template, domain, 1);
  expect(generated.parts.a?.params?.mode).toBeUndefined();
  expect(templateChoiceIssues(generated)).toEqual([]);

  const b = generated.parts.b!;
  const offDefault = { ...generated, parts: { ...generated.parts, b: { ...b, params: { ...b.params, mode: 'y' } } } };
  expect(templateChoiceIssues(offDefault).map(({ path }) => path)).toEqual(['assembly.parts.b.params.mode']);
});
