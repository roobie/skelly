import { readFileSync } from 'node:fs';
import { boxFromMinMax } from '@skelly/engine/core/geometry.ts';
import { parseAssemblyOrThrow } from '@skelly/engine/core/parseAssembly.ts';
import type { Domain, PartFamily } from '@skelly/engine/core/schema.ts';
import { validate } from '@skelly/engine/core/validate.ts';
import { describe, expect, it } from 'vitest';
import { GUN_UNITS } from '../src/gun/units.ts';

const sourceFamily: PartFamily = {
  name: 'test-source',
  params: {},
  build: () => ({
    family: 'test-source',
    solids: [{ id: 'body', kind: 'box', box: boxFromMinMax([-1, -0.5, -0.5], [0, 0.5, 0.5]) }],
    ports: [{ id: 'mate', mount: 'test', gender: 'female', pos: [0, 0, 0], normal: [1, 0, 0], up: [0, 1, 0] }],
    keepOuts: [],
    axes: [],
  }),
};

const targetFamily: PartFamily = {
  name: 'test-target',
  params: {},
  build: () => ({
    family: 'test-target',
    solids: [{ id: 'body', kind: 'box', box: boxFromMinMax([4, -0.5, -0.5], [5, 0.5, 0.5]) }],
    ports: [{ id: 'mate', mount: 'test', gender: 'male', pos: [0, 0, 0], normal: [-1, 0, 0], up: [0, 1, 0] }],
    keepOuts: [],
    axes: [],
  }),
};

const brokenContactFixture = parseAssemblyOrThrow(
  readFileSync(new URL('./fixtures/synthetic-connection-contact-gap.json', import.meta.url), 'utf8'),
  'synthetic-connection-contact-gap.json',
);

const testDomain: Domain = {
  name: 'connection-contact-test',
  families: { 'test-source': sourceFamily, 'test-target': targetFamily },
  axisRules: [],
  units: GUN_UNITS,
};

describe('connection-contact', () => {
  it('reports the gap between two synthetic parts', () => {
    const { issues } = validate(brokenContactFixture, testDomain);
    expect(issues.map(({ rule, message }) => ({ rule, message }))).toEqual([
      {
        rule: 'connection-contact',
        message: 'source.mate and target.mate have a 4u gap between their solids (maximum: 0.25u).',
      },
    ]);
  });
});
