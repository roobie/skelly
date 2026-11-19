import { buildRegistry, type ContentIssue } from '@skelly/engine/content';
import type { ContentFile } from '@skelly/engine/internal/core/schema.ts';
import { describe, expect, it } from 'vitest';
import { compileJsonnetFile } from '../../../tools/jsonnet/index.mjs';

// The map kit fixture's route assembly answers a fixture brief; each case breaks one fit rule.
const KITS = JSON.parse(compileJsonnetFile('packages/deadvox/test/fixtures/jsonnet/map-kits.jsonnet')) as ContentFile;

type Assembly = NonNullable<ContentFile['mapAssemblies']>[number];
type Brief = NonNullable<ContentFile['buildingBriefs']>[number];

const route = KITS.mapAssemblies!.find(({ id }) => id === 'fixture_route')!;

const answer = (overrides: Partial<Assembly> = {}): Assembly => ({
  ...structuredClone(route),
  id: 'fixture_answer',
  brief: 'fixture_brief',
  eligibility: { settlementKinds: ['fixture_kind'] },
  access: { ground: 'ground', entrance: [1, 1, 2], storeys: [{ id: 'ground', floor: 1 }], stairs: [] },
  ...overrides,
});

const brief = (overrides: Partial<Brief> = {}): Brief => ({
  id: 'fixture_brief',
  setting: 'fixture_setting',
  eligibility: { settlementKinds: ['fixture_kind'] },
  plot: { along: route.size[0], depth: route.size[2] },
  styles: ['fixture_style', 'fixture_other'],
  storeys: [1, 1],
  program: { entry: 'Where a body comes in.', objective: 'The far room.' },
  references: ['A fixture reference.'],
  facade: 'A fixture facade.',
  cover: 'Fixture cover.',
  ...overrides,
});

const contentIssues = (assembly: Assembly, answered: Brief, data: Partial<ContentFile> = {}): ContentIssue[] => {
  const kits = structuredClone(KITS);
  const content: ContentFile = {
    ...kits,
    ...data,
    mapAssemblies: [...kits.mapAssemblies!, assembly],
    worldSettings: [
      {
        id: 'fixture_setting',
        region: 'Here.',
        era: 'Now.',
        buildingCulture: 'Plain.',
        settlementKinds: ['fixture_kind'],
      },
    ],
    buildingBriefs: [answered],
  };
  return buildRegistry([{ source: 'fit-fixture.json', data: content }]).issues;
};

const fitIssues = (...args: Parameters<typeof contentIssues>): ContentIssue[] =>
  contentIssues(...args).filter(({ message }) => message.includes('brief "fixture_brief"'));

const RULE = /breaks the (\w+) rule/;

const rulesOf = (issues: readonly ContentIssue[]) =>
  issues.map(({ path, message }) => ({ path, rule: RULE.exec(message)?.[1] }));

const ANSWER = 'mapAssemblies[1]';

describe('building fit check', () => {
  it('accepts an assembly that fits its brief over every slot variant', () => {
    expect(contentIssues(answer(), brief())).toEqual([]);
  });

  it('reports a footprint larger than the plot', () => {
    const issues = fitIssues(answer(), brief({ plot: { along: route.size[0] - 1, depth: route.size[2] } }));
    expect(rulesOf(issues)).toEqual([{ path: `${ANSWER}.size`, rule: 'plot' }]);
  });

  it('reports declared storeys outside the brief range', () => {
    const issues = fitIssues(answer(), brief({ storeys: [2, 3] }));
    expect(rulesOf(issues)).toEqual([{ path: `${ANSWER}.access.storeys`, rule: 'storeys' }]);
  });

  it('reports a style that only one slot variant builds in', () => {
    const issues = fitIssues(answer(), brief({ styles: ['fixture_style'] }));
    expect(rulesOf(issues)).toEqual([{ path: `${ANSWER}.slots`, rule: 'styles' }]);
    expect(issues[0]!.message).toContain('front=piece:room_b');
  });

  it('reports a style a pool places the whole assembly in', () => {
    const issues = fitIssues(answer(), brief({ styles: ['fixture_style', 'fixture_other'] }), {
      mapPools: [
        {
          id: 'fixture_pool',
          choices: [{ ref: { kind: 'assembly', id: 'fixture_answer', style: 'fixture_third' }, weight: 1 }],
        },
      ],
      mapStyles: [...KITS.mapStyles!, { ...KITS.mapStyles![0]!, id: 'fixture_third' }],
    });
    expect(rulesOf(issues)).toEqual([{ path: `${ANSWER}.slots`, rule: 'styles' }]);
    expect(issues[0]!.message).toContain('style "fixture_third"');
  });

  it('reports an entrance that reaches no opening on the street edge', () => {
    // Two empty rows on the north side leave the entrance no floor to walk to the street edge.
    const setback = 2;
    const shifted = structuredClone(route);
    const issues = fitIssues(
      answer({
        size: [route.size[0], route.size[1], route.size[2] + setback],
        slots: shifted.slots.map((slot) => ({ ...slot, at: [slot.at[0], slot.at[1], slot.at[2] + setback] })),
        joins: shifted.joins.map((join) => ({
          ...join,
          seam: { ...join.seam, at: [join.seam.at[0], join.seam.at[1], join.seam.at[2] + setback] },
        })),
        anchors: Object.fromEntries(
          Object.entries(shifted.anchors).map(([id, anchor]) => [
            id,
            { ...anchor, at: [anchor.at[0], anchor.at[1], anchor.at[2] + setback] },
          ]),
        ),
        access: { ground: 'ground', entrance: [1, 1, 2 + setback], storeys: [{ id: 'ground', floor: 1 }], stairs: [] },
      }),
      brief({ plot: { along: route.size[0], depth: route.size[2] + setback } }),
    );
    expect(rulesOf(issues)).toEqual([{ path: `${ANSWER}.access.entrance`, rule: 'entrance' }]);
  });

  it('reports a program room without a standing anchor', () => {
    const issues = fitIssues(answer(), brief({ program: { entry: 'In.', objective: 'Far.', cellar: 'Down.' } }));
    expect(rulesOf(issues)).toEqual([{ path: `${ANSWER}.anchors.cellar`, rule: 'program' }]);
  });

  it('reports a program room no walk from the entrance reaches', () => {
    // A portless room behind an empty gap: its anchor stands, but no floor joins it to the entrance.
    const gap = 2;
    const room = KITS.mapPieces!.find(({ id }) => id === 'room_a')!;
    const islandAt = route.size[2] + gap;
    const issues = fitIssues(
      answer({
        size: [route.size[0], route.size[1], islandAt + room.size[2]],
        slots: [
          ...structuredClone(route.slots),
          {
            id: 'island',
            at: [0, 0, islandAt],
            size: [...room.size],
            turn: 0,
            choices: [{ ref: { kind: 'piece', id: 'island_room' }, weight: 1 }],
          },
        ],
        anchors: { ...route.anchors, island: { kind: 'standing', at: [1, 1, islandAt + 2] } },
      }),
      brief({
        plot: { along: route.size[0], depth: islandAt + room.size[2] },
        program: { entry: 'In.', objective: 'Far.', island: 'Cut off.' },
      }),
      { mapPieces: [...KITS.mapPieces!, { ...structuredClone(room), id: 'island_room', ports: [] }] },
    );
    expect(rulesOf(issues)).toEqual([{ path: `${ANSWER}.anchors.island`, rule: 'program' }]);
  });
});
