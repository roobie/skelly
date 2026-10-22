import { resolve } from '@skelly/engine/assembly/resolve.ts';
import type { Domain, PartDef } from '@skelly/engine/assembly/schema.ts';
import { expect, it } from 'vitest';
import { ATTACHMENT_IDS, attachmentInstanceForId } from '../src/gun/attachments.ts';
import { gunDomain } from '../src/gun/domain.ts';
import physical from '../src/gun/physical.json' with { type: 'json' };
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

it('gives every choice of every body family param a mass row that admits it', () => {
  const rows = physical.partMasses as readonly PartMassRow[];
  // Fitted attachments and the magazine are replaceable items; gunModelParts takes their mass from the item.
  const replaceable = new Set(['magazine', ...ATTACHMENT_IDS.map((id) => attachmentInstanceForId(id).family)]);
  const unmassed: string[] = [];
  for (const family of new Set(rows.map((row) => row.family))) {
    if (replaceable.has(family)) {
      continue;
    }
    const familyRows = rows.filter((row) => row.family === family);
    for (const [name, param] of Object.entries(gunDomain.families[family]!.params)) {
      for (const value of param.values) {
        if (!familyRows.some((row) => row.match[name] === undefined || row.match[name] === value)) {
          unmassed.push(`${family}.${name}=${value}`);
        }
      }
    }
  }
  expect(unmassed).toEqual([]);
});
