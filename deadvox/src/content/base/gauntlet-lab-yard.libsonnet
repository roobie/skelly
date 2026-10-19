local kit = import 'authored-site-kit.libsonnet';
local fences = import 'gauntlet-yard-fences.libsonnet';
local dressing = import 'gauntlet-authored-dressing.libsonnet';
local disorder = import 'aftermath.libsonnet';
local fallenChairs = [pose for pose in disorder.poses if std.member(['back', 'side'], pose.id)];
local context = { usage: ['Industrial', 'Medical'], tier: 'Tier1' };
local base = kit.piece(fences.front);
local empty72 = '........................................................................';
local solid72 = 'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff';
local edges72 = 'f......................................................................f';
local gate72 = 'fffffffffffffffffffffffff' + fences.front.layers[1][0] + 'ffffffffffffffffffffffffff';
local empty58 = '..........................................................';
local west58 = 'fffffffffffffff....fffffffffffffffffffffffffffffffffffffff';
local east58 = 'fffffffff....fffffffffffffffffffffffffffffffffffffffffffff';
local fence(id, width, empty, rows) = base + {
  id: id, size: [width, fences.front.size[1], 3], lootContext: context,
  palette+: { '.': { role: 'opening', material: 'opening' } },
  layers: [[empty, empty, empty]] + [rows for y in std.range(1, fences.front.size[1] - 1)],
  ownership: { layers: [[empty, empty, empty]] + [
    [std.strReplace(std.strReplace(row, 'f', 'S'), '.', 'R') for row in rows]
    for y in std.range(1, fences.front.size[1] - 1)
  ] },
};
local north = fence('gauntlet_lab_yard_north', 72, empty72, [solid72, edges72, edges72]);
local south = fence('gauntlet_lab_yard_south', 72, empty72, [edges72, edges72, gate72]);
local west = fence('gauntlet_lab_yard_west', 58, empty58, [empty58, empty58, west58]);
local east = fence('gauntlet_lab_yard_east', 58, empty58, [empty58, empty58, east58]);
local weeds = {
  id: 'lab_yard_weeds', size: [3, 2, 3], lootContext: context,
  palette: { g: { ground: true }, '.': 'air', w: { furniture: 'weed_tuft' } },
  layers: [['ggg', 'ggg', 'ggg'], ['w..', '..w', '.w.']],
};
local shrub = {
  id: 'lab_yard_shrub', size: [2, 4, 2], lootContext: context,
  palette: { g: { ground: true }, '.': 'air', S: { furniture: 'shrub_tall' } },
  layers: [['gg', 'gg'], ['SS', 'SS'], ['SS', 'SS'], ['SS', 'SS']],
};
local creeper = {
  id: 'lab_yard_creeper', size: [2, 3, 1], lootContext: context,
  palette: { g: { ground: true }, i: { furniture: 'creeper_strip' } },
  layers: [['gg'], ['ii'], ['ii']],
};
local crate = {
  id: 'lab_yard_overturned_crate', size: [2, 3, 2], lootContext: context,
  palette: { g: { ground: true }, F: { furniture: 'crate_overturned' } },
  layers: [['gg', 'gg'], ['FF', 'FF'], ['FF', 'FF']],
};
local weedBays = [[13, 40, 8], [19, 40, 16], [7, 40, 30], [18, 40, 34], [12, 40, 43], [24, 40, 51], [43, 40, 53], [56, 40, 44], [61, 40, 35], [53, 40, 24], [54, 40, 7], [34, 40, 12]];
local shrubBays = [[6, 40, 5], [63, 40, 6], [6, 40, 53], [61, 40, 57], [48, 40, 13], [18, 40, 54]];
local creepBays = [[9, 40, 3], [51, 40, 3], [18, 40, 60], [52, 40, 60]];
local rubbleBays = [[8, 40, 10], [56, 40, 16], [17, 40, 48], [59, 40, 53]];
{
  mapPieces: [north, south, west, east] + [kit.piece(t) for t in [weeds, shrub, creeper, crate]],
  slots: [
    { id: 'yard_north', at: [0, 40, 0], size: north.size, turn: 0, choices: [{ ref: { kind: 'piece', id: north.id }, weight: 1 }] },
    { id: 'yard_south_gate', at: [0, 40, 61], size: south.size, turn: 0, choices: [{ ref: { kind: 'piece', id: south.id }, weight: 1 }] },
    { id: 'yard_west_gap', at: [0, 40, 3], size: [3, west.size[1], 58], turn: 1, choices: [{ ref: { kind: 'piece', id: west.id }, weight: 1 }] },
    { id: 'yard_east_gap', at: [69, 40, 3], size: [3, east.size[1], 58], turn: 3, choices: [{ ref: { kind: 'piece', id: east.id }, weight: 1 }] },
    kit.slot('west_fallen_panel', dressing.panel, [4, 40, 16], 1),
    kit.slot('east_fallen_panel', dressing.panel, [63, 40, 49]),
    kit.slot('abandoned_crate_a', crate, [14, 40, 12]),
    kit.slot('abandoned_crate_b', crate, [54, 40, 57]),
    disorder.slot('yard_chair_a', 'gauntlet_authored_chair', [20, 41, 10], fallenChairs),
    disorder.slot('yard_chair_b', 'gauntlet_authored_chair', [54, 41, 39], fallenChairs),
    disorder.slot('yard_chair_c', 'gauntlet_authored_chair', [26, 41, 47], fallenChairs),
  ] + [kit.slot('weeds_' + i, weeds, weedBays[i]) for i in std.range(0, std.length(weedBays) - 1)] +
          [kit.slot('shrub_' + i, shrub, shrubBays[i]) for i in std.range(0, std.length(shrubBays) - 1)] +
          [kit.slot('creeper_' + i, creeper, creepBays[i]) for i in std.range(0, std.length(creepBays) - 1)] +
          [kit.slot('rubble_' + i, dressing.rubble, rubbleBays[i], i % 4) for i in std.range(0, std.length(rubbleBays) - 1)],
  routes: [
    { id: 'yard_gate', inside: [35.5, 41, 61], outside: [35.5, 41, 66] },
    { id: 'yard_west_breach', inside: [3, 41, 20], outside: [-2, 41, 20] },
    { id: 'yard_east_breach', inside: [69, 41, 50], outside: [74, 41, 50] },
  ],
}
