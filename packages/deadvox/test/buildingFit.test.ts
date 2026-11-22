import { authoringIssues, buildRegistry, type ContentIssue } from '@skelly/engine/content';
import type { ContentFile } from '@skelly/engine/internal/core/schema.ts';
import { simSeconds } from '@skelly/engine/internal/core/time.ts';
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

/**
 * A tiny hall whose only ground-storey opening is a south doorway two cells wide, with two cells of wall beyond
 * the walk on north and west, so the entrance walk reaches the south edge alone; `open: false` walls it shut.
 */
const frontHall = (id: string, open: boolean): Piece => {
  const doorway = open ? '==..==' : '======';
  const passage = open ? 'SSRRSS' : 'SSSSSS';
  const walls = ['======', '======', '==...=', '==...=', '==...=', doorway];
  const claims = ['SSSSSS', 'SSSSSS', 'SSRRRS', 'SSRRRS', 'SSRRRS', passage];
  return {
    id,
    style: roomA.style,
    size: [6, 5, 6],
    lootContext: roomA.lootContext,
    palette: { ...roomA.palette },
    layers: [['======', '======', '======', '======', '======', '======'], walls, walls, walls, walls],
    ownership: {
      layers: [['SSSSSS', 'SSSSSS', 'SSSSSS', 'SSSSSS', 'SSSSSS', 'SSSSSS'], claims, claims, claims, claims],
    },
    anchors: {},
    ports: [],
  };
};

/** The hall as an answer whose declared front edge is `front`, over the open or shut doorway piece. */
const frontAnswer = (front: 'n' | 'e' | 's' | 'w', open = true): Assembly => ({
  id: 'fixture_answer',
  brief: 'fixture_brief',
  eligibility: { settlementKinds: ['fixture_kind'] },
  lootContext: route.lootContext,
  size: [6, 5, 6],
  slots: [
    {
      id: 'hall',
      at: [0, 0, 0],
      size: [6, 5, 6],
      turn: 0,
      choices: [{ ref: { kind: 'piece', id: open ? 'front_hall' : 'front_hall_shut' }, weight: 1 }],
    },
  ],
  joins: [],
  anchors: { entry: { kind: 'standing', at: [3, 1, 4] }, objective: { kind: 'standing', at: [4, 1, 3] } },
  ports: [],
  access: { ground: 'ground', entrance: [3, 1, 4], storeys: [{ id: 'ground', floor: 1 }], stairs: [], front },
});

const frontContent = (): Partial<ContentFile> => ({
  mapPieces: [...KITS.mapPieces!, frontHall('front_hall', true), frontHall('front_hall_shut', false)],
});

const frontBrief = (): Brief => brief({ plot: { along: 6, depth: 6 } });

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
  const { registry, issues } = buildRegistry([{ source: 'fit-fixture.json', data: content }]);
  return [...issues, ...authoringIssues(registry)];
};

const fitIssues = (...args: Parameters<typeof contentIssues>): ContentIssue[] =>
  contentIssues(...args).filter(({ message }) => message.includes('brief "fixture_brief"'));

const RULE = /breaks the (\w+) rule/;

const rulesOf = (issues: readonly ContentIssue[]) =>
  issues.map(({ path, message }) => ({ path, rule: RULE.exec(message)?.[1] }));

// The answer assembly is appended after the fixture kit's own assemblies, so its index follows the fixture's list.
const ANSWER = `mapAssemblies[${KITS.mapAssemblies!.length}]`;

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

  it('reports an entrance that reaches no opening on the front edge it defaults to', () => {
    // Two empty rows on the north side leave the entrance no floor to walk to the north edge, which is the front an
    // answer without `access.front` declares.
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

  it('accepts an entrance on the edge the building declares as its front', () => {
    // The hall's walk reaches only its south edge, and that is the edge it declares.
    expect(contentIssues(frontAnswer('s'), frontBrief(), frontContent())).toEqual([]);
  });

  it('reports an entrance that reaches no opening on the declared front edge', () => {
    const issues = fitIssues(frontAnswer('n'), frontBrief(), frontContent());
    expect(rulesOf(issues)).toEqual([{ path: `${ANSWER}.access.entrance`, rule: 'entrance' }]);
    expect(issues[0]!.message).toContain('front (n) edge');
  });

  it('reports a front entrance the building itself obstructs', () => {
    const issues = fitIssues(frontAnswer('s', false), frontBrief(), frontContent());
    expect(rulesOf(issues)).toEqual([{ path: `${ANSWER}.access.entrance`, rule: 'entrance' }]);
  });

  it('reports a program room without a standing anchor', () => {
    const issues = fitIssues(
      answer(),
      brief({ program: { entry: { purpose: 'In.' }, objective: { purpose: 'Far.' }, cellar: { purpose: 'Down.' } } }),
    );
    expect(rulesOf(issues)).toEqual([{ path: `${ANSWER}.anchors.cellar`, rule: 'program' }]);
  });

  describe('cellar rooms', () => {
    const CellarProgram: Brief['program'] = {
      entry: { purpose: 'In.' },
      objective: { purpose: 'Far.' },
      down: { purpose: 'Below.', cellar: true, serves: [SERVICE] },
    };
    // By default the cellar storey is declared at the floor the fixture has and the ground storey a layer over it: only
    // the declared storeys decide whether an answer has a cellar, and on which storey the fixture's floor lies.
    const cellared = (anchors: Assembly['anchors'] = route.anchors, cellar = 1): Assembly =>
      answer({
        size: [route.size[0], route.size[1] + cellar, route.size[2]],
        anchors,
        access: {
          ground: 'ground',
          entrance: [1, 1, 2],
          storeys: [
            { id: 'cellar', floor: cellar },
            { id: 'ground', floor: cellar + 1 },
          ],
          stairs: [],
        },
      });
    const cellarBrief = () => brief({ storeys: [1, 2], program: CellarProgram });
    const ruled = (issues: readonly ContentIssue[], rule: string) =>
      issues.filter(({ message }) => RULE.exec(message)?.[1] === rule);

    it('leaves a cellar room and its services out of an answer without a cellar', () => {
      expect(fitIssues(answer(), cellarBrief(), serviceContent())).toEqual([]);
    });

    it('counts no cellar storey against the brief storeys', () => {
      const issues = fitIssues(cellared(), brief({ storeys: [1, 1], program: CellarProgram }), serviceContent());
      expect(ruled(issues, 'storeys')).toEqual([]);
    });

    it('requires a cellar room and its services of an answer with a cellar storey', () => {
      const issues = fitIssues(cellared(), cellarBrief(), serviceContent());
      expect(rulesOf(ruled(issues, 'program'))).toEqual([{ path: `${ANSWER}.anchors.down`, rule: 'program' }]);
      expect(ruled(issues, 'services')[0]?.message).toContain(`no piece serves "${SERVICE}"`);
    });

    it('reports a cellar room whose anchor stands on no cellar storey', () => {
      const down: Assembly['anchors'] = { ...route.anchors, down: { kind: 'standing', at: [9, 1, 2] } };
      expect(ruled(fitIssues(cellared(down), cellarBrief(), serviceContent()), 'program')).toEqual([]);
      // The anchor stays on the fixture's supported floor, now below the declared cellar storey.
      const belowCellar = cellared(down, 2);
      const messages = ruled(fitIssues(belowCellar, cellarBrief(), serviceContent()), 'program').map(
        ({ message }) => message,
      );
      expect(messages).toContainEqual(expect.stringContaining('cellar room "down" stands on no cellar storey'));
    });
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

const [, , DOOR_AT] = route.size;
const BACK_AT = DOOR_AT + 1;

/** A doorway alternative two cells wide and four high, from its layers and claims, bottom up. */
const doorPiece = (id: string, layers: string[], claims: string[], palette: Piece['palette'] = {}): Piece => ({
  id,
  style: roomA.style,
  size: [2, 4, 1],
  lootContext: roomA.lootContext,
  palette: { ...roomA.palette, ...palette },
  layers: layers.map((row) => [row]),
  ownership: { layers: claims.map((row) => [row]) },
  anchors: {},
  ports: [],
});

const LEAF = ['DD', 'DD', 'DD', 'DD'];
const CLAIMED = ['SS', 'SS', 'SS', 'SS'];
const OPEN = ['..', '..', '..', '..'];
const AIR = ['AA', 'AA', 'AA', 'AA'];
const leafPiece = (id: string, door: Piece['palette'][string]) => doorPiece(id, LEAF, CLAIMED, { D: door });

const doorContent = (): Partial<ContentFile> => {
  const furniture = fixtureFurniture('fixture_door');
  const door = {
    ...furniture,
    size: [2, 4, 1] as typeof furniture.size,
    door: { handlingSimSeconds: simSeconds(0.5), methods: {} },
  };
  return {
    furnitureMaterials: fixtureMaterials(),
    furniture: [door, fixtureFurniture('fixture_crate')],
    items: [
      {
        id: 'fixture_key',
        name: 'Key',
        category: 'tool',
        weight: 10,
        size: [1, 1],
        workInProgress: false,
        key: { lock: 'fixture_lock' },
      },
    ],
    boardings: [
      {
        id: 'fixture_boards',
        name: 'Boards',
        fits: 'door',
        color: '#808080',
        thicknessBlocks: 0.1,
        boards: [{ from: 0, height: 1 }],
      },
    ],
    mapPieces: [
      ...KITS.mapPieces!,
      { ...structuredClone(roomA), id: 'back_room', ports: [] },
      { ...doorPiece('sill', ['=='], ['SS']), size: [2, 1, 1] },
      leafPiece('leaf_door', { furniture: 'fixture_door', facing: 's' }),
      leafPiece('locked_door', { furniture: 'fixture_door', facing: 's', lock: { id: 'fixture_lock', locked: true } }),
      leafPiece('boarded_door', {
        furniture: 'fixture_door',
        facing: 's',
        boarding: { type: 'fixture_boards', side: 'front' },
      }),
      doorPiece('missing_door', OPEN, AIR),
      doorPiece('crated_door', ['C.', '..', '..', '..'], ['SA', 'AA', 'AA', 'AA'], {
        C: { furniture: 'fixture_crate' },
      }),
      doorPiece('walled_door', ['==', '==', '==', '=='], CLAIMED),
      doorPiece('unclaimed_door', OPEN, ['..', '..', '..', '..']),
    ],
  };
};

/**
 * The route answer with a portless back room behind its front room, joined to it only through a two-cell gap in an
 * unclaimed wall. The gap is a slot built from `choices`, over a sill of its own.
 */
const doorAnswer = (choices: readonly string[], doorway = true): Assembly =>
  answer({
    size: [route.size[0], route.size[1], BACK_AT + roomA.size[2]],
    slots: [
      ...structuredClone(route.slots),
      {
        id: 'sill',
        at: [1, 0, DOOR_AT],
        size: [2, 1, 1],
        turn: 0,
        choices: [{ ref: { kind: 'piece', id: 'sill' }, weight: 1 }],
      },
      {
        id: 'door',
        at: [1, 1, DOOR_AT],
        size: [2, 4, 1],
        turn: 0,
        choices: choices.map((id) => ({ ref: { kind: 'piece', id }, weight: 1 })),
        ...(doorway ? { doorway: true as const } : {}),
      },
      {
        id: 'back',
        at: [0, 0, BACK_AT],
        size: [...roomA.size],
        turn: 0,
        choices: [{ ref: { kind: 'piece', id: 'back_room' }, weight: 1 }],
      },
    ],
    anchors: { ...route.anchors, back: { kind: 'standing', at: [1, 1, BACK_AT + 2] } },
  });

const doorBrief = (): Brief =>
  brief({
    plot: { along: route.size[0], depth: BACK_AT + roomA.size[2] },
    program: { entry: { purpose: 'In.' }, objective: { purpose: 'Far.' }, back: { purpose: 'Through the door.' } },
  });

describe('building doorway contract', () => {
  it('walks through a doorway whose alternatives are a leaf, a locked leaf, a boarded leaf and no door', () => {
    expect(
      contentIssues(
        doorAnswer(['leaf_door', 'locked_door', 'boarded_door', 'missing_door']),
        doorBrief(),
        doorContent(),
      ),
    ).toEqual([]);
  });

  it('walks through no door leaf in a slot not declared a doorway', () => {
    const issues = fitIssues(doorAnswer(['leaf_door'], false), doorBrief(), doorContent());
    expect(rulesOf(issues)).toEqual([{ path: `${ANSWER}.anchors.back`, rule: 'program' }]);
  });

  it.each([
    ['crated_door', 'holds "fixture_crate", which is not a door leaf that opens'],
    ['walled_door', 'fills cell [0,0,0] with a solid block'],
    ['unclaimed_door', 'leaves cell [0,0,0] unclaimed'],
  ])('reports a doorway alternative %s that closes the way', (blocked, reason) => {
    // A closed doorway may also cut the program walk; only the doorway report is this case's contract.
    const issues = fitIssues(doorAnswer([blocked]), doorBrief(), doorContent()).filter(
      ({ message }) => RULE.exec(message)?.[1] === 'doorways',
    );
    expect(issues.map(({ path }) => path)).toEqual([`${ANSWER}.slots`]);
    expect(issues[0]!.message).toContain(`door=piece:${blocked}`);
    expect(issues[0]!.message).toContain(reason);
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

  describe('a serving piece hung from the ceiling', () => {
    const LampHeight = roomA.size[1] + 3;
    /**
     * Room A three layers taller under a ceiling, a serving lamp hung from it over the north-east corner, a layer above
     * the head of a body standing there. With a `slab`, a solid block fills that layer under the lamp.
     */
    const lampRoom = (id: string, slab: boolean): Piece => {
      const rows = (row: string) => [row, row, row, row];
      const corner = (mark: string, rest: string) => [`${rest.repeat(3)}${mark}`, ...rows(rest.repeat(4)).slice(1)];
      const room = roomA.layers.slice(1).map(() => rows('....'));
      const reserved = roomA.layers.slice(1).map(() => rows('RRRR'));
      return {
        id,
        style: roomA.style,
        size: [4, LampHeight, 4],
        lootContext: roomA.lootContext,
        palette: { ...roomA.palette, L: { furniture: 'fixture_lamp' } },
        layers: [rows('===='), ...room, slab ? corner('=', '.') : rows('....'), corner('L', '.'), rows('====')],
        ownership: {
          layers: [rows('SSSS'), ...reserved, slab ? corner('S', 'A') : rows('AAAA'), corner('S', 'A'), rows('SSSS')],
        },
        anchors: {},
        ports: roomA.ports,
      };
    };
    const lampContent = (): Partial<ContentFile> => {
      const content = serviceContent();
      content.furniture!.push({
        ...fixtureFurniture('fixture_lamp', [SERVICE]),
        mount: 'ceiling',
        solid: false,
        shape: [{ position: [0.4, 0.5, 0.4], size: [0.2, 0.5, 0.2] }],
      });
      content.mapPieces!.push(lampRoom('lamp_room', false), lampRoom('slab_lamp_room', true));
      return content;
    };
    const lampAnswer = (room: string): Assembly => {
      const assembly = answer({ size: [route.size[0], LampHeight, route.size[2]] });
      assembly.slots[0] = {
        ...assembly.slots[0]!,
        size: [4, LampHeight, 4],
        choices: [{ ref: { kind: 'piece', id: room }, weight: 1 }],
      };
      return assembly;
    };

    it('serves from under it, where a body stands on open floor', () => {
      expect(fitIssues(lampAnswer('lamp_room'), brief({ program: SERVICED_PROGRAM }), lampContent())).toEqual([]);
    });

    it('serves no body under it through a solid block', () => {
      const issues = fitIssues(lampAnswer('slab_lamp_room'), brief({ program: SERVICED_PROGRAM }), lampContent());
      expect(rulesOf(issues)).toEqual([{ path: `${ANSWER}.slots`, rule: 'services' }]);
      expect(issues[0]!.message).toContain(`no piece serving "${SERVICE}" stands beside a walk from the entrance`);
    });
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
