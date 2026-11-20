import { authoringIssues, buildRegistry, type ContentIssue } from '@skelly/engine/content';
import { describe, expect, it } from 'vitest';
import { fixtureLootContext } from './economyFixtures.ts';

const SOURCE = 'briefs-fixture.json';

const brief = (id: string, overrides: Record<string, unknown> = {}) => ({
  id,
  setting: 'fixture_setting',
  tags: ['fixture'],
  eligibility: { settlementKinds: ['fixture_kind'] },
  plot: { along: 8, depth: 6 },
  styles: ['fixture_style'],
  storeys: [1, 2],
  program: { room: { purpose: 'Where the fixture stands.' } },
  references: ['A fixture reference.'],
  facade: 'A fixture facade.',
  cover: 'Fixture cover.',
  ...overrides,
});

const briefIssues = (data: Record<string, unknown>, setting: Record<string, unknown> = {}): ContentIssue[] => {
  const { registry, issues } = buildRegistry([
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
            tags: { fixture: 'A fixture tag.' },
            ...setting,
          },
        ],
        mapStyles: [{ id: 'fixture_style', bindings: {} }],
        ...data,
      },
    },
  ]);
  return [...issues, ...authoringIssues(registry)].filter(
    ({ path }) => path.startsWith('buildingBriefs') || path.startsWith('worldSettings') || path.endsWith('.brief'),
  );
};

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

  it('reports tags and services that do not resolve against the setting and the furniture', () => {
    const issues = briefIssues(
      {
        buildingBriefs: [
          brief('fixture_brief', {
            tags: ['fixture_missing'],
            program: { room: { purpose: 'Where nothing serves.', serves: ['fixture_service'] } },
          }),
        ],
      },
      { standards: [{ settlementKind: 'fixture_other', usage: 'Residential', serves: ['fixture_service'] }] },
    );
    expect(issues).toEqual([
      {
        source: SOURCE,
        path: 'worldSettings[0].standards[0].settlementKind',
        message: 'world setting "fixture_setting" has no settlement kind "fixture_other"',
      },
      {
        source: SOURCE,
        path: 'worldSettings[0].standards[0].serves[0]',
        message: 'no furniture serves "fixture_service"',
      },
      {
        source: SOURCE,
        path: 'buildingBriefs[0].tags[0]',
        message: 'world setting "fixture_setting" has no tag "fixture_missing"',
      },
      {
        source: SOURCE,
        path: 'buildingBriefs[0].program.room.serves[0]',
        message: 'no furniture serves "fixture_service"',
      },
    ]);
  });
});
