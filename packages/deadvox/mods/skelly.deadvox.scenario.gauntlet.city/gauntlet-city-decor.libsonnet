local context = { usage: [], tier: 'Tier1' };
local air = ['....', '....', '....', '....'];
local emptyClaims = ['AAAA', 'AAAA', 'AAAA', 'AAAA'];
local machine = ['FFFF', 'FFFF', 'FFFF', 'FFFF'];
local machineClaims = ['SSSS', 'SSSS', 'SSSS', 'SSSS'];
local equipment = {
  id: 'gauntlet_roof_empty', size: [4, 4, 4], style: 'brick_townhouse', lootContext: context,
  palette: { '.': { role: 'opening', material: 'opening' } },
  layers: [air, air, air, air],
  ownership: { layers: [emptyClaims, emptyClaims, emptyClaims, emptyClaims] },
  anchors: {}, ports: [],
};
local roofAir = [
  '..................', '..................', '..................', '..................',
  '..................', '..................', '..................', '..................',
  '..................', '..................', '..................', '..................',
  '..................', '..................', '..................', '..................',
];
local circulation = [
  'AAAAAAAAAAAAAAAAAA', 'AAAAAAAAAAAAAAAAAA', 'RRRRRRRRRRRRRRRRAA', 'RRRRRRRRRRRRRRRRAA',
  'RRRRRRRRRRRRRRRRAA', 'RRRRRRRRRRRRRRRRAA', 'RRRR....RRRRRRRRAA', 'RRRR....RRRRRRRRAA',
  'RRRR....RRRRRRRRAA', 'RRRR....RRRRRRRRAA', 'RRRRRRRRRRRRRRRRAA', 'RRRRRRRRRRRRRRRRAA',
  'RRRRRRRRRRRRRRRRAA', 'RRRRRRRRRRRRRRRRAA', 'RRRRRRRRRRRRRRRRAA', 'RRRRRRRRRRRRRRRRAA',
];
local wallAt = function(z, x)
  (z == 2 && x <= 9) || (x == 0 && z >= 3 && z <= 10) || (z == 15 && (x <= 5 || (x >= 10 && x <= 14)));
local rows = function(cell) [std.join('', [cell(z, x) for x in std.range(0, 17)]) for z in std.range(0, 15)];
local wallRows = rows(function(z, x) if wallAt(z, x) then 'W' else '.');
local wallClaims = function(mark) rows(function(z, x) if wallAt(z, x) then mark else circulation[z][x]);
local openClaims = wallClaims('A');
local solidClaims = wallClaims('S');
local equipmentSlot = {
  id: 'equipment', at: [4, 1, 6], size: [4, 4, 4], turn: 0,
  pool: 'gauntlet_roof_equipment',
};
local rooftop = function(id, deck, walls) {
  id: id, size: [18, 5, 16], lootContext: context,
  slots: [
    { id: 'deck', at: [0, 0, 0], size: [18, 1, 16], turn: 0,
      choices: [{ ref: { kind: 'piece', id: deck }, weight: 1 }] },
    { id: 'circulation', at: [0, 1, 0], size: [18, 4, 16], turn: 0,
      choices: [{ ref: { kind: 'piece', id: if walls then 'gauntlet_roof_circulation_walled' else 'gauntlet_roof_circulation' }, weight: 1 }] },
    equipmentSlot,
  ],
  anchors: {
    landing: { kind: 'standing', at: [14, 1, 11] },
    north: { kind: 'standing', at: [8, 1, 4] },
    west: { kind: 'standing', at: [2, 1, 11] },
    south: { kind: 'standing', at: [8, 1, 14] },
  },
  joins: [], ports: [],
};
{
  mapPools: [{
    id: equipmentSlot.pool,
    choices: [
      { ref: { kind: 'piece', id: 'gauntlet_roof_empty' }, weight: 3 },
      { ref: { kind: 'piece', id: 'gauntlet_roof_ac' }, weight: 2 },
      { ref: { kind: 'piece', id: 'gauntlet_roof_vent' }, weight: 1 },
      { ref: { kind: 'piece', id: 'gauntlet_roof_hunting' }, weight: 1 },
    ],
  }],
  furniture: [
    {
      id: 'gauntlet_roof_parapet', name: 'Parapet wall', size: [1, 2, 1], color: '#8d8f8a',
      shape: [{ position: [0, 0, 0], size: [1, 2, 1] }],
    },
    {
      id: 'gauntlet_roof_ac', name: 'Air conditioner', size: [4, 3, 4], color: '#a7aa9f',
      shape: [
        { position: [0.2, 0, 0.2], size: [3.6, 0.4, 3.6] },
        { position: [0.4, 0.4, 0.4], size: [3.2, 2.2, 3.2] },
        { position: [0.1, 2.6, 0.1], size: [3.8, 0.4, 3.8] },
        { position: [0.6, 0.8, 0.2], size: [2.8, 0.2, 0.2] },
        { position: [0.6, 1.3, 0.2], size: [2.8, 0.2, 0.2] },
        { position: [0.6, 1.8, 0.2], size: [2.8, 0.2, 0.2] },
      ],
    },
    {
      id: 'gauntlet_roof_vent', name: 'Roof vent', size: [4, 3, 4], color: '#747c79',
      shape: [
        { position: [0, 0, 0], size: [4, 0.3, 4] },
        { position: [1, 0.3, 1], size: [2, 2.1, 2] },
        { position: [0.3, 2.4, 0.3], size: [3.4, 0.6, 3.4] },
      ],
    },
  ],
  mapPieces: [
    equipment,
    equipment + {
      id: 'gauntlet_roof_hunting',
      palette: equipment.palette + {
        H: { furniture: 'hunting_crate', loot: 'hunting_cache', lootUsage: ['Hunting'], lootTier: 'Tier2' },
      },
      layers: [['HHH.', 'HHH.', '....', '....'], ['HHH.', 'HHH.', '....', '....'], air, air],
      ownership: { layers: [['SSSA', 'SSSA', 'AAAA', 'AAAA'], ['SSSA', 'SSSA', 'AAAA', 'AAAA'], emptyClaims, emptyClaims] },
    },
    equipment + {
      id: 'gauntlet_roof_ac', palette: equipment.palette + { F: { furniture: 'gauntlet_roof_ac' } },
      layers: [machine, machine, machine, air],
      ownership: { layers: [machineClaims, machineClaims, machineClaims, emptyClaims] },
    },
    equipment + {
      id: 'gauntlet_roof_vent', palette: equipment.palette + { F: { furniture: 'gauntlet_roof_vent' } },
      layers: [machine, machine, machine, air],
      ownership: { layers: [machineClaims, machineClaims, machineClaims, emptyClaims] },
    },
    {
      id: 'gauntlet_roof_circulation', size: [18, 4, 16], style: 'brick_townhouse', lootContext: context,
      palette: { '.': { role: 'opening', material: 'opening' } },
      layers: [roofAir, roofAir, roofAir, roofAir],
      ownership: { layers: [openClaims, openClaims, openClaims, openClaims] },
      anchors: {}, ports: [],
    },
    {
      id: 'gauntlet_roof_circulation_walled', size: [18, 4, 16], style: 'brick_townhouse', lootContext: context,
      palette: { '.': { role: 'opening', material: 'opening' }, W: { furniture: 'gauntlet_roof_parapet' } },
      layers: [wallRows, wallRows, roofAir, roofAir],
      ownership: { layers: [solidClaims, solidClaims, openClaims, openClaims] },
      anchors: {}, ports: [],
    },
  ],
  roofs: [
    { assembly: rooftop('gauntlet_city_roof_sheet_fitted', 'gauntlet_city_roof_sheet', false), weight: 3 },
    { assembly: rooftop('gauntlet_city_roof_walled_fitted', 'gauntlet_city_roof_slab', true), weight: 2 },
  ],
  mapAssemblies: [entry.assembly for entry in self.roofs],
}
