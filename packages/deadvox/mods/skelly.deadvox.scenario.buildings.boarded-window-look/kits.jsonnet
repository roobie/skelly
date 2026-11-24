// Two one-storey townhouses whose front bays are held to each window the shared slot can draw: the
// west house whole and broken, the east house boarded twice. The east house's second boarding starts
// worn most of the way to breaking, so a few blows beat it in, while the first shows the boards
// untouched. Both doors are held intact and both rooms calm, so nothing but the windows draws the eye.
local city = import 'tools/jsonnet/lib/gauntlet-city-kits.libsonnet';
local support = (import 'tools/jsonnet/lib/boarded-look-support.libsonnet')('boarded_window_look');
local piece(id) = std.filter(function(piece) piece.id == id, city.mapPieces)[0];
local boarded = piece('gauntlet_city_window_n_boarded');
local worn = boarded + {
  id: 'boarded_window_look_worn',
  palette: { W: boarded.palette.W + { wear: 0.8 } },
};
local only(id, kind='piece') = [{ ref: { kind: kind, id: id }, weight: 1 }];
local shell(id, west, east) = support.shell + {
  id: id,
  slots: [
    if slot.id == 'front_west' then slot + { choices: only(west) }
    else if slot.id == 'front_east' then slot + { choices: only(east) }
    else slot
    for slot in super.slots
  ],
};
local house(id, shellId) = support.house + {
  id: id,
  slots: [
    if slot.id == 'shell' then slot + { choices: only(shellId, 'assembly') }
    else if slot.id == 'door' then slot + { choices: only('gauntlet_city_door_intact') }
    else slot
    for slot in super.slots
  ],
};
{
  mapPieces: [worn] + support.mapPieces,
  mapAssemblies: [
    shell('boarded_window_look_glass_shell', 'gauntlet_city_window_n_clear', 'gauntlet_city_window_n_broken'),
    shell('boarded_window_look_boards_shell', boarded.id, worn.id),
    house('boarded_window_look_glass', 'boarded_window_look_glass_shell'),
    house('boarded_window_look_boards', 'boarded_window_look_boards_shell'),
  ],
}
