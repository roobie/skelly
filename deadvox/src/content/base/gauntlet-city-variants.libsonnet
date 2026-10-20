local decor = import 'gauntlet-city-decor.libsonnet';
local cellars = import 'gauntlet-city-cellars.libsonnet';
local yards = import 'gauntlet-city-yards.libsonnet';
function(kit)
local cellar = std.filter(function(building) building.id == 'gauntlet_city_2', kit.mapAssemblies)[0];
local only = function(id) [{ ref: { kind: 'piece', id: id }, weight: 1 }];
local cellarHouse = cellar + {
  id: 'gauntlet_city_cellar',
  slots: [
    if part.id == 'shell' then part + { choices: only('gauntlet_city_cellar_shell') }
    else if part.id == 'upper_shell' then part + { choices: only('gauntlet_city_shell') }
    else if part.id == 'floor_shell' then part + { choices: only('gauntlet_city_street_course') }
    else if part.id == 'door' then part + { at: [part.at[0], 9, part.at[2]] }
    else part
    for part in cellar.slots
  ],
  anchors: { entry: { kind: 'standing', at: [8, 9, 8] }, cellar: { kind: 'standing', at: [8, 1, 8] } },
  access: cellar.access + { ground: 'floor_1', entrance: [8, 9, 8] },
};
// The cellar house raised over its sub-cellar, whose layers set the depth.
local subCellar = std.filter(function(piece) piece.id == 'gauntlet_city_sub_cellar', cellars.mapPieces)[0];
local depth = subCellar.size[1];
local up = function(at) [at[0], at[1] + depth, at[2]];
local noted = kit.scenes.onDesk('room', '_noted', [{ item: 'gauntlet_cellar_note', placement: 'surface' }]);
// The rug lies over the secret hatch, which sits in the ground floor beneath the room's north-east corner.
local rugged = kit.scenes.lying('lower', '_rug', 'rug', 10, 0);
local secretHouse = cellarHouse + {
  id: 'gauntlet_city_cellar_secret',
  size: [cellarHouse.size[0], cellarHouse.size[1] + depth, cellarHouse.size[2]],
  slots: [{ id: 'sub_cellar', at: [0, 0, 0], size: subCellar.size, turn: 0, choices: only(subCellar.id) }] + [
    if part.id == 'ground' then part + { at: up(part.at), choices: only('gauntlet_city_secret_floor') }
    else if part.id == 'room' then rugged.slot(part.id, up(part.at))
    else if part.id == 'upper_room' then noted.slot(part.id, up(part.at))
    else part + { at: up(part.at) }
    for part in cellarHouse.slots
  ],
  anchors: { [id]: cellarHouse.anchors[id] + { at: up(cellarHouse.anchors[id].at) } for id in std.objectFields(cellarHouse.anchors) },
  access: cellarHouse.access + {
    entrance: up(cellarHouse.access.entrance),
    storeys: [storey + { floor: storey.floor + depth } for storey in cellarHouse.access.storeys],
  },
};
local buildings = kit.mapAssemblies + [cellarHouse, secretHouse];
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
  mapPieces: kit.mapPieces + cellars.mapPieces + noted.mapPieces + rugged.mapPieces + decor.mapPieces + yards.mapPieces,
  mapAssemblies: decor.mapAssemblies + [dressed(building) for building in buildings],
}
