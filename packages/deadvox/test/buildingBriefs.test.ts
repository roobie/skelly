import { buildRegistry, type ContentIssue } from '@skelly/engine/content';
import { describe, expect, it } from 'vitest';
import { fixtureLootContext } from './economyFixtures.ts';

const SOURCE = 'briefs-fixture.json';

const brief = (id: string, overrides: Record<string, unknown> = {}) => ({
  id,
  setting: 'fixture_setting',
  eligibility: { settlementKinds: ['fixture_kind'] },
  plot: { along: 8, depth: 6 },
  styles: ['fixture_style'],
  storeys: [1, 2],
  program: { room: 'Where the fixture stands.' },
  references: ['A fixture reference.'],
  facade: 'A fixture facade.',
  cover: 'Fixture cover.',
  ...overrides,
});

const briefIssues = (data: Record<string, unknown>): ContentIssue[] =>
  buildRegistry([
    {
      source: SOURCE,
      data: {
        worldSettings: [
          {
            id: 'fixture_setting',
            region: 'Here.',
            era: 'Now.',
            buildingCulture: 'Plain.',
            settlementKinds: ['fixture_kind'],
          },
        ],
        mapStyles: [{ id: 'fixture_style', bindings: {} }],
        ...data,
      },
    },
  ]).issues.filter(({ path }) => path.startsWith('buildingBriefs') || path.endsWith('.brief'));

describe('building briefs', () => {
  it('reports a malformed brief as a schema issue', () => {
    const issues = briefIssues({ buildingBriefs: [brief('fixture_brief', { storeys: [0, 1], program: {} })] });
    expect(issues.map(({ path }) => path)).toEqual(['buildingBriefs[0].storeys', 'buildingBriefs[0].program']);
  });

  it('reports each brief reference that does not resolve and accepts one that does', () => {
    const issues = briefIssues({
      buildingBriefs: [
        brief('fixture_brief'),
        brief('fixture_unknown_setting', { setting: 'fixture_missing' }),
        brief('fixture_unknown_refs', {
          eligibility: { settlementKinds: ['fixture_other'] },
          styles: ['fixture_missing'],
        }),
      ],
      mapAssemblies: [
        {
          id: 'fixture_answer',
          lootContext: fixtureLootContext(),
          brief: 'fixture_missing',
          size: [1, 1, 1],
          slots: [],
          joins: [],
          anchors: {},
          ports: [],
        },
      ],
    });
    expect(issues).toEqual([
      { source: SOURCE, path: 'buildingBriefs[1].setting', message: 'no world setting "fixture_missing"' },
      {
        source: SOURCE,
        path: 'buildingBriefs[2].eligibility.settlementKinds[0]',
        message: 'world setting "fixture_setting" has no settlement kind "fixture_other"',
      },
      { source: SOURCE, path: 'buildingBriefs[2].styles[0]', message: 'no map style "fixture_missing"' },
      { source: SOURCE, path: 'mapAssemblies[0].brief', message: 'no building brief "fixture_missing"' },
    ]);
  });
});
