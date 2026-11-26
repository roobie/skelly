local context = { usage: [], tier: 'Tier1' };
local condition(mean, spread=0) = { mean: mean, spread: spread, paneThreshold: 0.5 };
local shell = {
  id: 'condition_pavilion_shell', style: 'condition_pavilion_style', size: [8, 7, 7], lootContext: context,
  palette: {
    '#': { role: 'shell', material: 'wall' }, '.': { role: 'opening', material: 'air' },
    b: { role: 'support', material: 'beam' },
  },
  layers: [
    ['########', '########', '########', '########', '########', '########', '########'],
    ['#####..#', '#......#', '#......#', '#......#', '#......#', '#......#', '########'],
    ['#...#..#', '#......#', '#......#', '#......#', '#......#', '#......#', '########'],
    ['#...#..#', '#......#', '#......#', '#......#', '#......#', '#......#', '########'],
    ['#...#..#', '#......#', '#......#', '#......#', '#......#', '#......#', '########'],
    ['########', '#......#', '#......#', '#bbbbbb#', '#......#', '#......#', '########'],
    ['########', '########', '########', '########', '########', '########', '########'],
  ],
  ownership: { layers: [
    ['SSSSSSSS', 'SSSSSSSS', 'SSSSSSSS', 'SSSSSSSS', 'SSSSSSSS', 'SSSSSSSS', 'SSSSSSSS'],
    ['SSSSSRRS', 'SRRRRRRS', 'SRRRRRRS', 'SRRRRRRS', 'SRRRRRRS', 'SRRRRRRS', 'SSSSSSSS'],
    ['S...SRRS', 'SRRRRRRS', 'SRRRRRRS', 'SRRRRRRS', 'SRRRRRRS', 'SRRRRRRS', 'SSSSSSSS'],
    ['S...SRRS', 'SRRRRRRS', 'SRRRRRRS', 'SRRRRRRS', 'SRRRRRRS', 'SRRRRRRS', 'SSSSSSSS'],
    ['S...SRRS', 'SRRRRRRS', 'SRRRRRRS', 'SRRRRRRS', 'SRRRRRRS', 'SRRRRRRS', 'SSSSSSSS'],
    ['SSSSSSSS', 'SAAAAAAS', 'SAAAAAAS', 'SSSSSSSS', 'SAAAAAAS', 'SAAAAAAS', 'SSSSSSSS'],
    ['SSSSSSSS', 'SSSSSSSS', 'SSSSSSSS', 'SSSSSSSS', 'SSSSSSSS', 'SSSSSSSS', 'SSSSSSSS'],
  ] },
  anchors: {}, ports: [],
};
local window = {
  id: 'condition_pavilion_window', style: shell.style, lootContext: context, size: [3, 3, 1],
  palette: { W: { furniture: 'clear_casement_window', fixed: true } },
  layers: [['WWW'], ['WWW'], ['WWW']],
  ownership: { layers: [['SSS'], ['SSS'], ['SSS']] }, anchors: {}, ports: [],
};
local slot(id, at, size, kind, ref) = {
  id: id, at: at, size: size, turn: 0, choices: [{ ref: { kind: kind, id: ref }, weight: 1 }],
};
local windowOwner = {
  id: 'condition_pavilion_window_owner', lootContext: context, size: window.size,
  condition: condition(1), slots: [slot('frame', [0, 0, 0], window.size, 'piece', window.id)],
  joins: [], anchors: {}, ports: [],
};
local building(id, policy, nested=false) = {
  id: id, lootContext: context, size: shell.size,
  brief: 'condition_pavilion', eligibility: { settlementKinds: ['condition_fixture'] }, condition: policy,
  slots: [
    slot('shell', [0, 0, 0], shell.size, 'piece', shell.id),
    slot('window', [1, 2, 0], window.size, if nested then 'assembly' else 'piece', if nested then windowOwner.id else window.id),
  ],
  joins: [], anchors: { room: { kind: 'standing', at: [6, 1, 3] } }, ports: [],
  access: { ground: 'ground', entrance: [6, 1, 1], storeys: [{ id: 'ground', floor: 1 }], stairs: [] },
};
{
  worldSettings: [{
    id: 'condition_fixture', region: 'Fixture yard.', era: 'Unspecified.', buildingCulture: 'Windowed pavilion.',
    settlementKinds: ['condition_fixture'], tags: { fixture: 'Condition comparison.' },
  }],
  buildingBriefs: [{
    id: 'condition_pavilion', setting: 'condition_fixture', tags: ['fixture'],
    eligibility: { settlementKinds: ['condition_fixture'] }, plot: { along: 8, depth: 7 },
    styles: [shell.style], storeys: [1, 1], program: { room: { purpose: 'A sheltered standing space.' } },
    references: ['A small windowed masonry pavilion, used to compare condition without changing geometry.'],
    facade: 'One window and an open entrance.', cover: 'Masonry walls and a slab roof enclose the room.',
  }],
  mapStyles: [{ id: shell.style, bindings: {
    wall: { role: 'shell', block: 'brick' }, air: { role: 'opening', block: 'air' },
    beam: { role: 'support', block: 'planks' },
  } }],
  mapPieces: [shell, window],
  mapAssemblies: [windowOwner,
    building('condition_pavilion_intact', condition(1)),
    building('condition_pavilion_worn', condition(0.2, 0.1)),
    building('condition_pavilion_nested', condition(0), true),
  ],
}
