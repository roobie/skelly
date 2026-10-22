import { resolve } from '@skelly/engine/assembly/resolve.ts';
import type { Domain, PartDef } from '@skelly/engine/assembly/schema.ts';
import { expect, it } from 'vitest';
import { gunDomain } from '../src/gun/domain.ts';
import physical from '../src/gun/physical.json' with { type: 'json' };
import { gunModelParts, type PartMassRow } from '../src/gun/physical.ts';

const MASS_CONTEXT = /mass-fixture.*body.*fixture.*plain.*matched/;
const AMBIGUOUS_ROWS = /plain-body, second-body/;
// Choices found without a mass row beyond the AK-74 brake; each needs an authored mass, so delete the entry when its row lands.
const KNOWN_UNMASSED = new Set([
  'receiver.section=ak',
  'lower.layout=bullpup',
  'lower.layout=trigger',
  'stock.style=dropped',
  'stock.style=tapered-sawed',
  'magazine.integral=no',
]);

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

it('gives every choice of every param a mass row that admits it', () => {
  const rows = physical.partMasses as readonly PartMassRow[];
  const unmassed: string[] = [];
  for (const family of new Set(rows.map((row) => row.family))) {
    const familyRows = rows.filter((row) => row.family === family);
    for (const [name, param] of Object.entries(gunDomain.families[family]!.params)) {
      for (const value of param.values) {
        if (!familyRows.some((row) => row.match[name] === undefined || row.match[name] === value)) {
          unmassed.push(`${family}.${name}=${value}`);
        }
      }
    }
  }
  expect(unmassed.filter((choice) => !KNOWN_UNMASSED.has(choice))).toEqual([]);
});
