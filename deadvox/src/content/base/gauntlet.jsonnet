local shape = import 'furniture-shape.libsonnet';
local look = import 'gauntlet-look.jsonnet';
local city = import 'gauntlet-city.libsonnet';
local kits = import 'gauntlet-city-kits.libsonnet';
local types = import 'gauntlet-city-building-types.libsonnet';
local authored = import 'gauntlet-authored-sites.libsonnet';
local medical = import 'gauntlet-medical.libsonnet';
local perimeter = import 'gauntlet-city-perimeter.libsonnet';
local rooms = import 'gauntlet-lab-rooms.libsonnet';
local descents = import 'gauntlet-lab-descents.libsonnet';
local lab = import 'gauntlet-lab.libsonnet';
local service = import 'gauntlet-service.libsonnet';
local sewer = import 'gauntlet-sewer.libsonnet';
local metal = '#707b7e';
local button = std.filter(function(f) f.id == 'gauntlet_look_button', look.furniture)[0];
local deadOfficer = std.filter(function(f) f.id == 'dead_officer_body', (import 'rural-police.jsonnet').furniture)[0];
local note = function(id, title, text) {
  id: id, name: title, size: [2, 2, 1], color: '#dfd6b9', solid: false,
  shape: [{ position: [0.1, 0.1, 0.8], size: [1.8, 1.8, 0.1] }],
  readable: { title: title, text: text },
};
local emptyLoot = { usage: [], tier: 'Tier1' };
local paper = function(id, title, model, text) {
  id: id, name: title, category: 'note', weight: 5, size: [1, 1],
  model: model, economy: { usage: ['Industrial'], tiers: ['Tier1'] },
  readable: { title: title, text: text },
};
local publicNotes = [
  paper('gauntlet_public_memo', 'Maintenance route', 'paper_sheet', |||
    The service store is on the block with the square raised water tank. Go around the low brick building to the rear apron. The two tall, narrow exhausts stand together there; the inspection hatch beside them opens onto the maintenance ladder. The office is not the basement access.

    Square raised water tank → low brick store
                               rear apron → paired exhausts → hatch
  |||),
  paper('gauntlet_public_directions', 'Delivery instructions', 'folded_note', |||
    Deliver instruments to the low brick service store beside the yellow loading frame. Do not leave them at a utility cabinet or a lone duct riser. Walk around to the rear apron, find the pair of narrow exhausts, and use the inspection hatch beside them. The lid is unlocked; the ladder below reaches the intake floor. Return by the same hatch when the shift ends.
  |||),
  paper('gauntlet_maintenance_memo', 'Ventilation invoice', 'paper_sheet', |||
    Accounts queried the extra ducting again. The low brick service building beside the square water tank and yellow delivery frame has paired narrow exhausts on its rear apron, rather more ventilation than a stores room needs. The inspection hatch beside them has a ladder under the lid. Please use that access, not the office door.

    Street → service building → rear apron
                               paired exhausts → hatch
  |||),
];
local utilities = [
  {
    id: 'gauntlet_public_memo', size: [2, 3, 2], lootContext: { usage: ['Industrial'], tier: 'Tier1' },
    palette: { '=': { ground: true }, F: { furniture: 'crate', loot: 'd41_empty' } },
    layers: [['==', '=='], ['FF', 'FF'], ['FF', 'FF']],
  },
  {
    id: 'gauntlet_public_directions', size: [2, 3, 2], lootContext: { usage: ['Industrial'], tier: 'Tier1' },
    palette: { '=': { ground: true }, F: { furniture: 'crate', loot: 'd41_empty' } },
    layers: [['==', '=='], ['FF', 'FF'], ['FF', 'FF']],
  },
  {
    id: 'gauntlet_special_ops_event', size: [6, 2, 4], lootContext: { usage: ['Military'], tier: 'Tier2' },
    palette: { '.': 'air', '=': { ground: true }, B: { furniture: 'gauntlet_dead_special_ops' }, Z: { spawn: 'shambler', chance: 0.8 } },
    layers: [['======', '======', '======', '======'], ['Z.....', '.BBBB.', '.BBBB.', '.....Z']],
  },
  {
    id: 'gauntlet_water_tank', size: [6, 13, 6], lootContext: emptyLoot,
    palette: { '=': 'concrete', F: { furniture: 'gauntlet_water_tank' } },
    layers: [
      ['======', '======', '======', '======', '======', '======'],
      ['FFFFFF', 'FFFFFF', 'FFFFFF', 'FFFFFF', 'FFFFFF', 'FFFFFF'],
      ['FFFFFF', 'FFFFFF', 'FFFFFF', 'FFFFFF', 'FFFFFF', 'FFFFFF'],
      ['FFFFFF', 'FFFFFF', 'FFFFFF', 'FFFFFF', 'FFFFFF', 'FFFFFF'],
      ['FFFFFF', 'FFFFFF', 'FFFFFF', 'FFFFFF', 'FFFFFF', 'FFFFFF'],
      ['FFFFFF', 'FFFFFF', 'FFFFFF', 'FFFFFF', 'FFFFFF', 'FFFFFF'],
      ['FFFFFF', 'FFFFFF', 'FFFFFF', 'FFFFFF', 'FFFFFF', 'FFFFFF'],
      ['FFFFFF', 'FFFFFF', 'FFFFFF', 'FFFFFF', 'FFFFFF', 'FFFFFF'],
      ['FFFFFF', 'FFFFFF', 'FFFFFF', 'FFFFFF', 'FFFFFF', 'FFFFFF'],
      ['FFFFFF', 'FFFFFF', 'FFFFFF', 'FFFFFF', 'FFFFFF', 'FFFFFF'],
      ['FFFFFF', 'FFFFFF', 'FFFFFF', 'FFFFFF', 'FFFFFF', 'FFFFFF'],
      ['FFFFFF', 'FFFFFF', 'FFFFFF', 'FFFFFF', 'FFFFFF', 'FFFFFF'],
      ['FFFFFF', 'FFFFFF', 'FFFFFF', 'FFFFFF', 'FFFFFF', 'FFFFFF'],
    ],
  },
  {
    id: 'gauntlet_loading_frame', size: [6, 9, 2], lootContext: emptyLoot,
    palette: { '=': 'concrete', F: { furniture: 'gauntlet_loading_frame' } },
    layers: [
      ['======', '======'],
      ['FFFFFF', 'FFFFFF'], ['FFFFFF', 'FFFFFF'], ['FFFFFF', 'FFFFFF'], ['FFFFFF', 'FFFFFF'],
      ['FFFFFF', 'FFFFFF'], ['FFFFFF', 'FFFFFF'], ['FFFFFF', 'FFFFFF'], ['FFFFFF', 'FFFFFF'],
    ],
  },
  {
    id: 'gauntlet_incidental_bollard', size: [2, 5, 2], lootContext: emptyLoot,
    palette: { '=': { ground: true }, F: { furniture: 'gauntlet_look_bollard' } },
    layers: [['==', '=='], ['FF', 'FF'], ['FF', 'FF'], ['FF', 'FF'], ['FF', 'FF']],
  },
  {
    id: 'gauntlet_incidental_cabinet', size: [4, 4, 2], lootContext: emptyLoot,
    palette: { '=': 'concrete', F: { furniture: 'gauntlet_look_cabinet' } },
    layers: [['====', '===='], ['FFFF', 'FFFF'], ['FFFF', 'FFFF'], ['FFFF', 'FFFF']],
  },
  {
    id: 'gauntlet_incidental_riser', size: [3, 6, 3], lootContext: emptyLoot,
    palette: { '=': 'concrete', F: { furniture: 'gauntlet_look_riser' } },
    layers: [
      ['===', '===', '==='], ['FFF', 'FFF', 'FFF'], ['FFF', 'FFF', 'FFF'],
      ['FFF', 'FFF', 'FFF'], ['FFF', 'FFF', 'FFF'], ['FFF', 'FFF', 'FFF'],
    ],
  },
];
shape.colliding({
  items: types.items + publicNotes + lab.items,
  mapPools: kits.mapPools + city.mapPools,
  blocks: types.blocks,
  loot: types.loot + medical.loot + kits.loot + authored.loot + sewer.loot + service.loot + lab.loot,
  mapStyles: rooms.mapStyles + [{ id: 'service_brick', bindings: {
    air: { role: 'opening', block: 'air' }, concrete: { role: 'interior_floor', block: 'concrete' },
    brick: { role: 'shell', block: 'brick' }, galvanized: { role: 'shell', block: 'galvanized' },
  } }] + types.mapStyles + authored.mapStyles + sewer.mapStyles,
  mapPieces: kits.mapPieces + rooms.mapPieces + descents.mapPieces + lab.mapPieces + service.mapPieces + types.mapPieces + authored.mapPieces + sewer.mapPieces,
  mapAssemblies: kits.mapAssemblies + lab.mapAssemblies + service.mapAssemblies + types.mapAssemblies + authored.mapAssemblies + sewer.mapAssemblies,
  furniture: city.furniture + kits.furniture + types.furniture + authored.furniture + service.furniture + [
    { [k]: button[k] for k in std.objectFields(button) if k != 'readable' } + {
      id: 'gauntlet_button', name: 'Nuclear objective button', scenarioGoal: true,
    },
    { [k]: deadOfficer[k] for k in std.objectFields(deadOfficer) if k != 'id' && k != 'name' && k != 'container' } + {
      id: 'gauntlet_dead_special_ops', name: 'Dead special operations soldier',
      container: { pockets: [{ grid: [6, 6], handlingSimSeconds: 1.2 }] },
    },
    note('gauntlet_perimeter_notice', 'Notice', 'QUARANTINE ZONE'),
    note('gauntlet_perimeter_gate_notice', 'Notice', 'NO ENTRY'),
    {
      id: 'gauntlet_water_tank', name: 'Square raised water tank', size: [6, 12, 6], color: metal,
      shape: [
        { position: [0, 0, 0], size: [6, 0.5, 6] },
        { position: [0.5, 0.5, 0.5], size: [0.5, 7.5, 0.5] },
        { position: [5, 0.5, 0.5], size: [0.5, 7.5, 0.5] },
        { position: [0.5, 0.5, 5], size: [0.5, 7.5, 0.5] },
        { position: [5, 0.5, 5], size: [0.5, 7.5, 0.5] },
        { position: [0, 8, 0], size: [6, 4, 6] },
      ],
    },
    {
      id: 'gauntlet_loading_frame', name: 'Yellow loading frame', size: [6, 8, 2], color: '#c7b16d',
      shape: [
        { position: [0, 0, 0], size: [1, 8, 2] },
        { position: [5, 0, 0], size: [1, 8, 2] },
        { position: [1, 6, 0], size: [4, 2, 2] },
      ],
    },
  ],
  templates: city.templates + perimeter.templates + utilities,
})
