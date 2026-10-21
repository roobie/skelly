import { resolve } from '@skelly/engine/assembly/resolve.ts';
import type { Domain, PartDef } from '@skelly/engine/assembly/schema.ts';
import { expect, it } from 'vitest';
import { gunModelParts, type PartMassRow } from '../src/gun/physical.ts';

const MASS_CONTEXT = /mass-fixture.*body.*fixture.*plain.*matched/;
const AMBIGUOUS_ROWS = /plain-body, second-body/;

it('refuses export with no matching authored mass row or several matching rows', () => {
  const part: PartDef = { family: 'fixture', solids: [], ports: [], axes: [], keepOuts: [] };
  const domain: Domain = {
    name: 'fixture',
    units: { metresPerUnit: 1, grid: 1, bevel: 0 },
    axisRules: [],
    families: {
      fixture: { name: 'fixture', params: { style: { values: ['plain'], default: 'plain' } }, build: () => part },
    },
  };
  const resolved = resolve(
    { name: 'mass-fixture', root: 'body', parts: { body: { family: 'fixture' } }, connections: [] },
    domain,
  );
  expect(resolved.issues).toEqual([]);
  const row: PartMassRow = { id: 'plain-body', family: 'fixture', match: { style: 'plain' }, massKg: 1 };
  expect(gunModelParts(resolved, new Set(), [row]).body?.massKg).toBe(row.massKg);
  const ambiguous = [row, { ...row, id: 'second-body', match: {} }];
  for (const rows of [[], ambiguous]) {
    expect(() => gunModelParts(resolved, new Set(), rows)).toThrow(MASS_CONTEXT);
  }
  expect(() => gunModelParts(resolved, new Set(), ambiguous)).toThrow(AMBIGUOUS_ROWS);
});
