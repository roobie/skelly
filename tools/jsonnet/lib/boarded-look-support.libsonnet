// The boarded-door and boarded-window looks share a bearing frame without changing the choices each
// fixes for its check. Posts leave the entry and the walk to the service corner open.
function(prefix)
local city = import 'gauntlet-city-kits.libsonnet';
local assembly(id) = std.filter(function(a) a.id == id, city.mapAssemblies)[0];
local piece(id) = std.filter(function(p) p.id == id, city.mapPieces)[0];
local only(id, kind='piece') = [{ ref: { kind: kind, id: id }, weight: 1 }];
local walls = piece('gauntlet_city_shell_walls') + {
  id: prefix + '_bearing_walls',
  palette+: { t: { role: 'support', material: 'bearing_lintel' } },
  layers: super.layers[:5] + [[
    '..................', '..................', '################P.', '#..............#..',
    '#..............#..', '#..............#..', '#..............#..', '#..............#..',
    '#..............#..', '#..............#..', '#..............#H.', '#..............#H.',
    '#..............#..', '#..............#..', '#..............#..', '#####tttttt#####P.',
  ]] + super.layers[6:],
};
local low = [
  '______________', '______________', '_____j________', '______________',
  '______________', '______________', '_____jc_------', '________------',
  '________------', '________------', 'aa___j__------', 'aa____bb------',
];
local high = [
  '______________', '______________', '_____j________', '______________',
  '______________', '______________', '_____j__------', '________------',
  '________------', '________------', '_____j__------', '________------',
];
local ceiling = [
  '______________', '______________', 'jjjjjjjjjjjjjj', '______________',
  '______________', '______________', 'jjjjjjjj------', '________------',
  '________------', '________------', 'jjjjjjjj------', '________------',
];
local layers = [low, low, high, high, high, high, ceiling];
local room = piece('gauntlet_city_ground_calm') + {
  id: prefix + '_bearing_room',
  palette+: {
    '_': { role: 'opening', material: 'opening' },
    '-': { role: 'opening', material: 'opening' },
    j: { role: 'support', material: 'joists' },
  },
  layers: layers,
  ownership: { layers: [
    [std.join('', [std.get({ '_': 'R', '-': '.', '.': 'A' }, mark, 'S') for mark in std.stringChars(row)]) for row in layer]
    for layer in layers
  ] },
};
local kitchen = piece('gauntlet_city_kitchen') + {
  id: prefix + '_bearing_kitchen',
  palette+: { j: { role: 'support', material: 'joists' } },
  layers: super.layers[:6] + [['jjjjjj', 'jjjjjj']],
  ownership: { layers: piece('gauntlet_city_kitchen').ownership.layers[:6] + [['SSSSSS', 'SSSSSS']] },
};
local shell = assembly('gauntlet_city_shell') + {
  id: prefix + '_bearing_shell',
  slots: [if s.id == 'walls' then s + { choices: only(walls.id) } else s for s in super.slots],
};
{
  mapPieces: [walls, room, kitchen],
  shell: shell,
  house: assembly('gauntlet_city_1') + {
    slots: [
      if s.id == 'shell' then s + { choices: only(shell.id, 'assembly') }
      else if s.id == 'room' then s + { choices: only(room.id) }
      else if s.id == 'kitchen' then s + { choices: only(kitchen.id) }
      else s
      for s in super.slots
    ],
  },
}
