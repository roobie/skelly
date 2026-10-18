local decor = import 'gauntlet-city-decor.libsonnet';
local cellars = import 'gauntlet-city-cellars.libsonnet';
local yards = import 'gauntlet-city-yards.libsonnet';
function(kit)
local cellar = std.filter(function(building) building.id == 'gauntlet_city_2', kit.mapAssemblies)[0];
local buildings = kit.mapAssemblies + [cellar + {
  id: 'gauntlet_city_cellar',
  slots: [
    if part.id == 'shell' then part + { choices: [{ ref: { kind: 'piece', id: 'gauntlet_city_cellar_shell' }, weight: 1 }] }
    else if part.id == 'upper_shell' then part + { choices: [{ ref: { kind: 'piece', id: 'gauntlet_city_shell' }, weight: 1 }] }
    else if part.id == 'floor_shell' then part + { choices: [{ ref: { kind: 'piece', id: 'gauntlet_city_street_course' }, weight: 1 }] }
    else if part.id == 'door' then part + { at: [part.at[0], 9, part.at[2]] }
    else part
    for part in cellar.slots
  ],
  anchors: { entry: { kind: 'standing', at: [8, 9, 8] }, cellar: { kind: 'standing', at: [8, 1, 8] } },
  access: cellar.access + { ground: 'floor_1', entrance: [8, 9, 8] },
}];
local roof = decor.roofs[0].assembly;
local ground = function(building) std.filter(function(storey) storey.id == building.access.ground, building.access.storeys)[0].floor;
local dressed = function(building) building + {
  eligibility: { settlementKinds: ['city'] },
  size: [building.size[0], building.size[1] + 4, building.size[2]],
  slots: [
    if part.id == 'roof' then part + {
      size: roof.size,
      choices: [{ ref: { kind: 'assembly', id: entry.assembly.id }, weight: entry.weight } for entry in decor.roofs],
    } else part
    for part in building.slots
  ] + [yards.slot + { at: [0, ground(building), 0] }],
  anchors: building.anchors + { street: { kind: 'standing', at: [8, ground(building), 1] } },
};
{
  loot: kit.loot,
  mapPools: decor.mapPools,
  furniture: kit.furniture + decor.furniture + yards.furniture,
  mapPieces: kit.mapPieces + cellars.mapPieces + decor.mapPieces + yards.mapPieces,
  mapAssemblies: decor.mapAssemblies + [dressed(building) for building in buildings],
}
