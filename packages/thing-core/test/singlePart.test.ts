import type { PartDef } from '@skelly/engine/assembly/schema.ts';
import { validate } from '@skelly/engine/assembly/validate.ts';
import { expect, it } from 'vitest';
import { singlePart } from '../src/singlePart.ts';

it('wraps an authored part without losing its mass or engine validity', () => {
  const part: PartDef = {
    family: 'fixture',
    material: 'fixture-material',
    ports: [],
    axes: [],
    keepOuts: [],
    solids: [{ id: 'fixture-solid', kind: 'box', box: { center: [0, 0, 0], half: [1, 1, 1] } }],
  };
  const input = { id: 'fixture-part', part, massKg: 0.37, units: { metresPerUnit: 1, grid: 0.001, bevel: 0 } };
  const wrapped = singlePart(input);
  const report = validate(wrapped.assembly, wrapped.domain);
  expect(report.issues).toEqual([]);
  expect(report.resolved.defs.get(input.id)).toEqual(input.part);
  expect(Object.values(wrapped.masses).reduce((sum, mass) => sum + mass, 0)).toBe(input.massKg);
});
