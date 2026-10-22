local base = import 'map-kits.jsonnet';
local air = ['........', '........', '........', '........', '........', '........', '........', '........'];
local reserved = ['RRRRRRRR', 'RRRRRRRR', 'RRRRRRRR', 'RRRRRRRR', 'RRRRRRRR', 'RRRRRRRR', 'RRRRRRRR', 'RRRRRRRR'];
local ladder = ['........', '........', '........', '....L...', '....L...', '........', '........', '........'];
local ladderClaims = ['RRRRRRRR', 'RRRRRRRR', 'RRRRRRRR', 'RRRRSRRR', 'RRRRSRRR', 'RRRRRRRR', 'RRRRRRRR', 'RRRRRRRR'];
local floor = ['========', '========', '========', '========', '========', '========', '========', '========'];
local floorClaims = ['SSSSSSSS', 'SSSSSSSS', 'SSSSSSSS', 'SSSSSSSS', 'SSSSSSSS', 'SSSSSSSS', 'SSSSSSSS', 'SSSSSSSS'];
base + {
  furniture: [{
    id: 'fixture_ladder', name: 'Ladder', color: '#808080', size: [2, 1, 1],
    solid: false, climbable: { speedMetresPerSimSecond: 1.5 },
    breach: { minimumStrength: 1, durability: 1 }, material: 'fixture_material',
  }],
  furnitureMaterials: [{ id: 'fixture_material' }],
  mapPieces: [{
    id: 'fixture_descent', size: [8, 11, 8], style: 'fixture_style',
    lootContext: { usage: [], tier: 'Tier1' },
    palette: {
      '=': { role: 'support', material: 'floor' },
      '.': { role: 'opening', material: 'air' },
      L: { furniture: 'fixture_ladder', facing: 'w' },
    },
    layers: [
      floor, ladder, ladder, ladder, ladder, ladder,
      ['========', '========', '========', '===...==', '===...==', '========', '========', '========'],
      air, air, air, air,
    ],
    ownership: { layers: [
      floorClaims, ladderClaims, ladderClaims, ladderClaims, ladderClaims, ladderClaims,
      ['SSSSSSSS', 'SSSSSSSS', 'SSSSSSSS', 'SSSRRRSS', 'SSSRRRSS', 'SSSSSSSS', 'SSSSSSSS', 'SSSSSSSS'],
      reserved, reserved, reserved, reserved,
    ] },
    anchors: {}, ports: [],
  }],
  mapAssemblies: [{
    id: 'fixture_climb', size: [8, 11, 8], lootContext: { usage: [], tier: 'Tier1' },
    slots: [{ id: 'descent', at: [0, 0, 0], size: [8, 11, 8], turn: 0,
      choices: [{ ref: { kind: 'piece', id: 'fixture_descent' }, weight: 1 }] }],
    joins: [], ports: [],
    anchors: { upper: { kind: 'standing', at: [6.5, 7, 4] }, lower: { kind: 'standing', at: [3, 1, 4] } },
  }],
  mapSites: [{
    id: 'fixture_climb_site', assembly: 'fixture_climb', origin: [11, 20, -7], turn: 0,
    routes: [{ from: 'upper', to: 'lower', traversal: 'climb', return: true }],
  }],
}
