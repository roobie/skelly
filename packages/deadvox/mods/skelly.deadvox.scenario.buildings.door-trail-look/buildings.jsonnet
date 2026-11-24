// The door-trail look's fixture content: one shell, one brief, two answers. The trail hall declares a trodden dirt
// trail from the road connection to its door; the steps hall, standing the same shell on a hill, declares dressed
// stone steps climbing to its raised door. Same brief, same front, so the look compares the two declared kinds over
// one contract.
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
  id: 'door_trail_hall_shell', style: 'door_trail_hall_style', size: [6, 6, 6], lootContext: context,
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
// Each hall declares its door's own way from the road connection: the kind alone differs between them.
local hall(id, approach) = {
  id: id, lootContext: context, size: shell.size,
  brief: 'door_trail_hall_brief', eligibility: { settlementKinds: ['door_trail_look'] },
  slots: [{
    id: 'hall', at: [0, 0, 0], size: shell.size, turn: 0,
    choices: [{ ref: { kind: 'piece', id: shell.id }, weight: 1 }],
  }],
  joins: [], anchors: { hall: { kind: 'standing', at: [3, 1, 3] } }, ports: [],
  access: {
    ground: 'ground', entrance: [3, 1, 1], front: 'n', approach: approach,
    storeys: [{ id: 'ground', floor: 1 }], stairs: [],
  },
};
{
  worldSettings: [{
    id: 'door_trail_look', region: 'Fixture yard.', era: 'Unspecified.',
    buildingCulture: 'Small single-storey halls, one doorway each, on a road and a hill.',
    settlementKinds: ['door_trail_look'], tags: { fixture: 'Door-trail and door-steps comparison.' },
  }],
  buildingBriefs: [{
    id: 'door_trail_hall_brief', setting: 'door_trail_look', tags: ['fixture'],
    eligibility: { settlementKinds: ['door_trail_look'] }, plot: { along: 6, depth: 6 },
    styles: ['door_trail_hall_style'], storeys: [1, 1],
    program: { hall: { purpose: 'A single sheltered room entered through its front door.' } },
    references: ['A small brick utility hall with one doorway in its front wall.'],
    facade: 'A plain doorway in the front wall.', cover: 'Brick walls and a felt roof enclose the room.',
  }],
  mapStyles: [{
    id: 'door_trail_hall_style',
    bindings: {
      wall: { role: 'shell', block: 'brick' }, floor: { role: 'support', block: 'concrete' },
      roofing: { role: 'roof', block: 'bitumen_felt' }, air: { role: 'opening', block: 'air' },
    },
  }],
  mapPieces: [shell],
  mapAssemblies: [
    hall('door_trail_hall', { kind: 'trail', surface: 'dirt' }),
    hall('door_steps_hall', { kind: 'steps', surface: 'dressed_stone' }),
  ],
}
