// The objective console: the one equipment piece the rebuilt levels place directly, rather than through a dressing
// bay. Its button is the lab scenario's goal, and it fills the whole bay it replaces, so its face row stays owned air.
// `packages/deadvox/DESIGN.md`, "Gauntlet".
local context = { usage: [], tier: 'Tier1' };
local empty = ['....', '....', '....', '....'];
local emptyClaims = ['AAAA', 'AAAA', 'AAAA', 'AAAA'];
local two = ['FFFF', 'FFFF', '....', '....'];
local twoClaims = ['SSSS', 'SSSS', 'AAAA', 'AAAA'];
{
  mapPieces: [{
    id: 'gauntlet_lab_equipment_objective', size: [4, 5, 4], style: 'concrete_lab', lootContext: context,
    palette: { '.': { role: 'opening', material: 'air' }, F: { furniture: 'gauntlet_look_console' }, B: { furniture: 'gauntlet_button' } },
    layers: [two, two, ['.B..', '....', '....', '....'], empty, empty],
    ownership: { layers: [twoClaims, twoClaims, ['ASAA', 'AAAA', 'AAAA', 'AAAA'], emptyClaims, emptyClaims] },
    anchors: {}, ports: [],
  }],
}
