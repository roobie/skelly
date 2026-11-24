// The one-storey townhouse with its door slot held to the boarded variant and its room to the calm scene, so no
// barricade or shambler stands behind the door. The leaf starts worn most of the way to breaking, so a few blows
// force it: the check is the refusal, the blows and the broken leaf, not a long swing.
local city = import 'tools/jsonnet/lib/gauntlet-city-kits.libsonnet';
local support = (import 'tools/jsonnet/lib/boarded-look-support.libsonnet')('boarded_door_look');
local house = support.house;
local boarded = std.filter(function(piece) piece.id == 'gauntlet_city_door_boarded', city.mapPieces)[0];
local door = boarded + {
  id: 'boarded_door_look_door',
  palette: { D: boarded.palette.D + { wear: 0.8 } },
};
local only(id) = [{ ref: { kind: 'piece', id: id }, weight: 1 }];
{
  mapPieces: [door] + support.mapPieces,
  mapAssemblies: [support.shell, house + {
    id: 'boarded_door_look_house',
    slots: [
      if slot.id == 'door' then slot + { choices: only(door.id) }
      else slot
      for slot in house.slots
    ],
  }],
}
