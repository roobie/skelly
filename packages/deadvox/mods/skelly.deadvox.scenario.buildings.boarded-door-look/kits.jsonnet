// The one-storey townhouse with its door slot held to the boarded variant and its room to the calm scene, so no
// barricade or shambler stands behind the door. The leaf starts worn most of the way to breaking, so a few blows
// force it: the check is the refusal, the blows and the broken leaf, not a long swing.
local city = import 'tools/jsonnet/lib/gauntlet-city-kits.libsonnet';
local house = std.filter(function(assembly) assembly.id == 'gauntlet_city_1', city.mapAssemblies)[0];
local boarded = std.filter(function(piece) piece.id == 'gauntlet_city_door_boarded', city.mapPieces)[0];
local door = boarded + {
  id: 'boarded_door_look_door',
  palette: { D: boarded.palette.D + { wear: 0.8 } },
};
local only(id) = [{ ref: { kind: 'piece', id: id }, weight: 1 }];
{
  mapPieces: [door],
  mapAssemblies: [house + {
    id: 'boarded_door_look_house',
    slots: [
      if slot.id == 'door' then slot + { choices: only(door.id) }
      else if slot.id == 'room' then slot + {
        choices: [choice + { weight: 1 } for choice in slot.choices if std.endsWith(choice.ref.id, '_calm')],
      }
      else slot
      for slot in house.slots
    ],
  }],
}
