import { buildRegistry, type ContentIssue } from '@skelly/engine/content';
import type { ContentFile } from '@skelly/engine/internal/core/schema.ts';
import { describe, expect, it } from 'vitest';
import { compileJsonnetFile } from '../../../tools/jsonnet/index.mjs';
import { FIXTURE_MATERIAL, fixtureBreach, fixtureMaterials } from './economyFixtures.ts';

// The map kit fixture's route assembly answers a fixture brief; each case breaks one fit rule.
const KITS = JSON.parse(compileJsonnetFile('packages/deadvox/test/fixtures/jsonnet/map-kits.jsonnet')) as ContentFile;

type Assembly = NonNullable<ContentFile['mapAssemblies']>[number];
type Brief = NonNullable<ContentFile['buildingBriefs']>[number];
type Setting = NonNullable<ContentFile['worldSettings']>[number];
type Piece = NonNullable<ContentFile['mapPieces']>[number];

const route = KITS.mapAssemblies!.find(({ id }) => id === 'fixture_route')!;
const roomA = KITS.mapPieces!.find(({ id }) => id === 'room_a')!;

const SERVICE = 'fixture_service';

/**
 * Room A with its north-east column taken out of reserved circulation, so a fixture may stand there. Fitted and bare
 * rooms claim the same cells, so they are variants of one slot; the fixture stands beside the reserved floor.
 */
const serviceRoom = (id: string, fitted: boolean, style = roomA.style): Piece => {
  const piece = structuredClone(roomA);
  piece.id = id;
  piece.style = style;
  piece.ownership.layers.forEach((layer, y) => {
    if (y > 0) {
      layer[0] = y === 1 && fitted ? 'RRRS' : 'RRRA';
    }
  });
  if (fitted) {
    piece.layers[1]![0] = '...F';
    piece.palette.F = { furniture: 'fixture_fixture' };
  }
  return piece;
};

/**
 * A portless nook behind room A, two rows deep and with no reserved cells, its fixture in the far east corner. Only the
 * floor the nook leaves free reaches the fixture; a boxed nook puts crates on the cells west and north of it.
 */
const freeFloorNook = (id: string, boxed: boolean): Piece => {
  const crate = boxed ? 'S' : 'A';
  const air = ['AAAA', 'AAAA'];
  const open = ['....', '....'];
  return {
    id,
    style: roomA.style,
    size: [4, 5, 2],
    lootContext: roomA.lootContext,
    palette: { ...roomA.palette, F: { furniture: 'fixture_fixture' }, C: { furniture: 'fixture_crate' } },
    layers: [['====', '===='], boxed ? ['...C', '..CF'] : ['....', '...F'], open, open, open],
    ownership: { layers: [['SSSS', 'SSSS'], [`AAA${crate}`, `AA${crate}S`], air, air, air] },
    anchors: {},
    ports: [],
  };
};

const [, , NOOK_AT] = route.size;

/** The route answer with a nook slot behind its front room, built from `choices`. */
const nookAnswer = (choices: readonly string[]): Assembly =>
  answer({
    size: [route.size[0], route.size[1], NOOK_AT + 2],
    slots: [
      ...structuredClone(route.slots),
      {
        id: 'nook',
        at: [0, 0, NOOK_AT],
        size: [4, 5, 2],
        turn: 0,
        choices: choices.map((id) => ({ ref: { kind: 'piece', id }, weight: 1 })),
      },
    ],
  });

const nookBrief = (): Brief => brief({ plot: { along: route.size[0], depth: NOOK_AT + 2 }, program: SERVICED_PROGRAM });

const fixtureFurniture = (id: string, serves?: string[]): NonNullable<ContentFile['furniture']>[number] => ({
  id,
  name: id,
  size: [1, 1, 1],
  color: '#808080',
  massKg: 1,
  breach: fixtureBreach(),
  material: FIXTURE_MATERIAL,
  ...(serves ? { serves } : {}),
});

const serviceContent = (): Partial<ContentFile> => ({
  furnitureMaterials: fixtureMaterials(),
  furniture: [fixtureFurniture('fixture_fixture', [SERVICE]), fixtureFurniture('fixture_crate')],
  mapPieces: [
    ...KITS.mapPieces!,
    serviceRoom('fitted_room', true),
    serviceRoom('fitted_other_room', true, 'fixture_other'),
    serviceRoom('bare_other_room', false, 'fixture_other'),
    freeFloorNook('open_nook', false),
    freeFloorNook('boxed_nook', true),
  ],
});

/** The route answer with its front slot built from `choices`. */
const servicedAnswer = (choices: readonly string[], overrides: Partial<Assembly> = {}): Assembly => {
  const assembly = answer(overrides);
  assembly.slots[0]!.choices = choices.map((id) => ({ ref: { kind: 'piece', id }, weight: 1 }));
  return assembly;
};

const SERVICED_PROGRAM: Brief['program'] = {
  entry: { purpose: 'Where a body comes in.', serves: [SERVICE] },
  objective: { purpose: 'The far room.' },
};

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
  tags: ['fixture'],
  eligibility: { settlementKinds: ['fixture_kind'] },
  plot: { along: route.size[0], depth: route.size[2] },
  styles: ['fixture_style', 'fixture_other'],
  storeys: [1, 1],
  program: { entry: { purpose: 'Where a body comes in.' }, objective: { purpose: 'The far room.' } },
  references: ['A fixture reference.'],
  facade: 'A fixture facade.',
  cover: 'Fixture cover.',
  ...overrides,
});

const contentIssues = (
  assembly: Assembly,
  answered: Brief,
  data: Partial<ContentFile> = {},
  setting: Partial<Setting> = {},
): ContentIssue[] => {
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
        tags: { fixture: 'A fixture tag.' },
        ...setting,
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
    const issues = fitIssues(
      answer(),
      brief({ program: { entry: { purpose: 'In.' }, objective: { purpose: 'Far.' }, cellar: { purpose: 'Down.' } } }),
    );
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
        program: { entry: { purpose: 'In.' }, objective: { purpose: 'Far.' }, island: { purpose: 'Cut off.' } },
      }),
      { mapPieces: [...KITS.mapPieces!, { ...structuredClone(room), id: 'island_room', ports: [] }] },
    );
    expect(rulesOf(issues)).toEqual([{ path: `${ANSWER}.anchors.island`, rule: 'program' }]);
  });
});

describe('building services check', () => {
  it('accepts a required service every front variant places beside the walk', () => {
    const issues = contentIssues(
      servicedAnswer(['fitted_room', 'fitted_other_room']),
      brief({ program: SERVICED_PROGRAM }),
      serviceContent(),
    );
    expect(issues).toEqual([]);
  });

  it('reports a required service no variant places', () => {
    const issues = fitIssues(answer(), brief({ program: SERVICED_PROGRAM }), serviceContent());
    expect(rulesOf(issues)).toEqual([{ path: `${ANSWER}.slots`, rule: 'services' }]);
    expect(issues[0]!.message).toContain(`no piece serves "${SERVICE}"`);
  });

  it('reports a required service placed only where no walk from the entrance reaches', () => {
    // The fitted room stands behind an empty gap without ports: its fixture is beside reserved floor no walk joins.
    const gap = 2;
    const islandAt = route.size[2] + gap;
    const content = serviceContent();
    content.mapPieces!.push({ ...serviceRoom('fitted_island', true), ports: [] });
    content.mapPieces!.push({ ...serviceRoom('fitted_other_island', true, 'fixture_other'), ports: [] });
    const issues = fitIssues(
      answer({
        size: [route.size[0], route.size[1], islandAt + roomA.size[2]],
        slots: [
          ...structuredClone(route.slots),
          {
            id: 'island',
            at: [0, 0, islandAt],
            size: [...roomA.size],
            turn: 0,
            choices: [
              { ref: { kind: 'piece', id: 'fitted_island' }, weight: 1 },
              { ref: { kind: 'piece', id: 'fitted_other_island' }, weight: 1 },
            ],
          },
        ],
      }),
      brief({ plot: { along: route.size[0], depth: islandAt + roomA.size[2] }, program: SERVICED_PROGRAM }),
      content,
    );
    expect(rulesOf(issues)).toEqual([{ path: `${ANSWER}.slots`, rule: 'services' }]);
    expect(issues[0]!.message).toContain(`no piece serving "${SERVICE}" stands beside a walk from the entrance`);
  });

  it('reports a slot variant that drops the required service', () => {
    const issues = fitIssues(
      servicedAnswer(['fitted_room', 'bare_other_room']),
      brief({ program: SERVICED_PROGRAM }),
      serviceContent(),
    );
    expect(rulesOf(issues)).toEqual([{ path: `${ANSWER}.slots`, rule: 'services' }]);
    expect(issues[0]!.message).toContain('front=piece:bare_other_room');
  });

  it('accepts a fixture reached through the floor its own variant leaves free', () => {
    expect(contentIssues(nookAnswer(['open_nook']), nookBrief(), serviceContent())).toEqual([]);
  });

  it('reports a fixture its own variant boxes in with furniture', () => {
    const issues = fitIssues(nookAnswer(['boxed_nook']), nookBrief(), serviceContent());
    expect(rulesOf(issues)).toEqual([{ path: `${ANSWER}.slots`, rule: 'services' }]);
    expect(issues[0]!.message).toContain(`no piece serving "${SERVICE}" stands beside a walk from the entrance`);
  });

  it('reports the one variant of a slot that boxes its fixture in, without borrowing its sibling variant free floor', () => {
    const issues = fitIssues(nookAnswer(['open_nook', 'boxed_nook']), nookBrief(), serviceContent());
    expect(rulesOf(issues)).toEqual([{ path: `${ANSWER}.slots`, rule: 'services' }]);
    expect(issues[0]!.message).toContain('nook=piece:boxed_nook');
  });

  it('requires a standard of its settlement kind of an answer with its usage', () => {
    const standards = [{ settlementKind: 'fixture_kind', usage: 'Residential' as const, serves: [SERVICE] }];
    const residential = { lootContext: { usage: ['Residential' as const], tier: 'Tier1' as const } };
    const issues = fitIssues(answer(residential), brief(), serviceContent(), { standards });
    expect(rulesOf(issues)).toEqual([{ path: `${ANSWER}.slots`, rule: 'services' }]);
    expect(issues[0]!.message).toContain(`no piece serves "${SERVICE}"`);
  });

  it('leaves an answer without the standard usage to its brief rooms', () => {
    const standards = [{ settlementKind: 'fixture_kind', usage: 'Residential' as const, serves: [SERVICE] }];
    expect(fitIssues(answer(), brief(), serviceContent(), { standards })).toEqual([]);
  });
});
