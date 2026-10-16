local look = import 'gauntlet-look.jsonnet';
local city = import 'gauntlet-city.libsonnet';
local kits = import 'gauntlet-city-kits.libsonnet';
local types = import 'gauntlet-city-building-types.libsonnet';
local tents = import 'gauntlet-city-medical.libsonnet';
local rooms = import 'gauntlet-lab-rooms.libsonnet';
local descents = import 'gauntlet-lab-descents.libsonnet';
local lab = import 'gauntlet-lab.libsonnet';
local service = import 'gauntlet-service.libsonnet';
local memo = std.filter(function(f) f.id == 'gauntlet_look_memo', look.furniture)[0];
local metal = '#707b7e';
local button = std.filter(function(f) f.id == 'gauntlet_look_button', look.furniture)[0];
local note = function(id, title, text) memo + {
  id: id, name: title, readable: { title: title, text: text },
};
local emptyLoot = { usage: [], tier: 'Tier1' };
local utilities = [
  {
    id: 'gauntlet_public_memo', size: [2, 3, 1], lootContext: emptyLoot,
    palette: { '=': 'concrete', F: { furniture: 'gauntlet_public_memo' } },
    layers: [['=='], ['FF'], ['FF']],
  },
  {
    id: 'gauntlet_public_directions', size: [2, 3, 1], lootContext: emptyLoot,
    palette: { '=': 'concrete', F: { furniture: 'gauntlet_public_directions' } },
    layers: [['=='], ['FF'], ['FF']],
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
    palette: { '=': 'concrete', F: { furniture: 'gauntlet_look_bollard' } },
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
{
  mapPools: kits.mapPools,
  blocks: tents.blocks,
  loot: types.loot + tents.loot,
  mapStyles: rooms.mapStyles + [{ id: 'service_brick', bindings: {
    air: { role: 'opening', block: 'air' }, concrete: { role: 'interior_floor', block: 'concrete' },
    brick: { role: 'shell', block: 'brick' }, galvanized: { role: 'shell', block: 'galvanized' },
  } }] + types.mapStyles + tents.mapStyles,
  mapPieces: kits.mapPieces + rooms.mapPieces + descents.mapPieces + lab.mapPieces + service.mapPieces + types.mapPieces + tents.mapPieces,
  mapAssemblies: kits.mapAssemblies + lab.mapAssemblies + service.mapAssemblies + types.mapAssemblies + tents.mapAssemblies,
  furniture: city.furniture + kits.furniture + [
    { [k]: button[k] for k in std.objectFields(button) if k != 'readable' } + {
      id: 'gauntlet_button', name: 'Nuclear objective button', scenarioGoal: true,
    },
    note('gauntlet_maintenance_memo', 'Ventilation invoice', |||
      Accounts queried the extra ducting again. The low brick service building beside the square water tank and yellow delivery frame has paired narrow exhausts on its rear apron, rather more ventilation than a stores room needs. The inspection hatch beside them has a ladder under the lid. Please use that access, not the office door.

      Street → service building → rear apron
                                 paired exhausts → hatch
    |||),
    note('gauntlet_public_memo', 'Maintenance route', |||
      The service store is on the block with the square raised water tank. Go around the low brick building to the rear apron. The two tall, narrow exhausts stand together there; the inspection hatch beside them opens onto the maintenance ladder. The office is not the basement access.

      Square raised water tank → low brick store
                                 rear apron → paired exhausts → hatch
    |||),
    note('gauntlet_public_directions', 'Delivery instructions', |||
      Deliver instruments to the low brick service store beside the yellow loading frame. Do not leave them at a utility cabinet or a lone duct riser. Walk around to the rear apron, find the pair of narrow exhausts, and use the inspection hatch beside them. The lid is unlocked; the ladder below reaches the intake floor. Return by the same hatch when the shift ends.
    |||),
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
  templates: city.templates + utilities,
}
