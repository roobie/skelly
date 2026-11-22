// The front-edge look's fixture content: one shell, one brief, two answers. The north hall declares its front north;
// the south hall is the same shell turned within its own frame and declares its front south, so the look compares a
// rotated witness with a north-front building over one contract. Both doors must read on the road side after the
// layout turns the south hall's front toward it.
local context = { usage: [], tier: 'Tier1' };
local palette = {
  '#': { role: 'shell', material: 'wall' },
  '=': { role: 'support', material: 'floor' },
  '^': { role: 'roof', material: 'roofing' },
  '.': { role: 'opening', material: 'air' },
};
// One shell: a single-storey hall whose only opening is a two-cell doorway in its north wall, four cells high under
// the roof course, so a body stands in the doorway itself and the front edge is truly reached.
local shell = {
  id: 'front_hall_shell', style: 'front_hall_style', size: [6, 6, 6], lootContext: context,
  palette: palette,
  layers: [
    ['======', '======', '======', '======', '======', '======'],
    ['==..==', '#....#', '#....#', '#....#', '#....#', '######'],
    ['==..==', '#....#', '#....#', '#....#', '#....#', '######'],
    ['==..==', '#....#', '#....#', '#....#', '#....#', '######'],
    ['==..==', '#....#', '#....#', '#....#', '#....#', '######'],
    ['^^^^^^', '^^^^^^', '^^^^^^', '^^^^^^', '^^^^^^', '^^^^^^'],
  ],
  ownership: { layers: [
    ['SSSSSS', 'SSSSSS', 'SSSSSS', 'SSSSSS', 'SSSSSS', 'SSSSSS'],
    ['SSRRSS', 'SRRRRS', 'SRRRRS', 'SRRRRS', 'SRRRRS', 'SSSSSS'],
    ['SSRRSS', 'SRRRRS', 'SRRRRS', 'SRRRRS', 'SRRRRS', 'SSSSSS'],
    ['SSRRSS', 'SRRRRS', 'SRRRRS', 'SRRRRS', 'SRRRRS', 'SSSSSS'],
    ['SSRRSS', 'SRRRRS', 'SRRRRS', 'SRRRRS', 'SRRRRS', 'SSSSSS'],
    ['SSSSSS', 'SSSSSS', 'SSSSSS', 'SSSSSS', 'SSSSSS', 'SSSSSS'],
  ] },
  anchors: {}, ports: [],
};
// The south hall nests the same shell turned a half turn, so its doorway lands on its south edge; its access mirrors
// with it and declares that south edge as its front.
local hall(id, front, turn, entrance, standing) = {
  id: id, lootContext: context, size: shell.size,
  brief: 'front_hall_brief', eligibility: { settlementKinds: ['front_edge_look'] },
  slots: [{
    id: 'hall', at: [0, 0, 0], size: shell.size, turn: turn,
    choices: [{ ref: { kind: 'piece', id: shell.id }, weight: 1 }],
  }],
  joins: [], anchors: { hall: { kind: 'standing', at: standing } }, ports: [],
  access: {
    ground: 'ground', entrance: entrance, storeys: [{ id: 'ground', floor: 1 }], stairs: [], front: front,
  },
};
{
  worldSettings: [{
    id: 'front_edge_look', region: 'Fixture yard.', era: 'Unspecified.',
    buildingCulture: 'Small single-storey halls, one doorway each.',
    settlementKinds: ['front_edge_look'], tags: { fixture: 'Front-edge orientation comparison.' },
  }],
  buildingBriefs: [{
    id: 'front_hall_brief', setting: 'front_edge_look', tags: ['fixture'],
    eligibility: { settlementKinds: ['front_edge_look'] }, plot: { along: 6, depth: 6 },
    styles: ['front_hall_style'], storeys: [1, 1],
    program: { hall: { purpose: 'A single sheltered room entered through its front door.' } },
    references: ['A small brick utility hall with one doorway in its front wall.'],
    facade: 'A plain doorway in the front wall.', cover: 'Brick walls and a felt roof enclose the room.',
  }],
  mapStyles: [{
    id: 'front_hall_style',
    bindings: {
      wall: { role: 'shell', block: 'brick' }, floor: { role: 'support', block: 'concrete' },
      roofing: { role: 'roof', block: 'bitumen_felt' }, air: { role: 'opening', block: 'air' },
    },
  }],
  mapPieces: [shell],
  mapAssemblies: [
    hall('front_hall_north', 'n', 0, [3, 1, 1], [3, 1, 3]),
    hall('front_hall_south', 's', 2, [2, 1, 4], [2, 1, 2]),
  ],
}
