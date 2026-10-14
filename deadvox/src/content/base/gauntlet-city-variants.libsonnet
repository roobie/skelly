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
    else part
    for part in cellar.slots
  ],
  anchors: { entry: { kind: 'standing', at: [8, 9, 8] }, cellar: { kind: 'standing', at: [8, 1, 8] } },
  access: cellar.access + { ground: 'floor_1', entrance: [8, 9, 8] },
}];
local pieces = kit.mapPieces + cellars.mapPieces;
local facadePieces = ['gauntlet_city_shell', 'gauntlet_city_upper_shell', 'gauntlet_city_floor_shell', 'gauntlet_city_roof', 'gauntlet_city_cellar_shell', 'gauntlet_city_street_course'];
local ground = function(building) std.filter(function(storey) storey.id == building.access.ground, building.access.storeys)[0].floor;
local dressed = function(building, concrete) building + {
  id: building.id + (if concrete then '_concrete' else '_brick'),
  size: [building.size[0], building.size[1] + 4, building.size[2]],
  slots: [
    if part.id == 'roof' then part + {
      size: [18, 5, 16],
      choices: [{ ref: { kind: 'assembly', id: 'gauntlet_city_roof_fitted' + (if concrete then '_concrete' else '') }, weight: 1 }],
    } else if concrete then part + {
      choices: [choice + {
        ref: choice.ref + { id: choice.ref.id + (if std.member(facadePieces, choice.ref.id) then '_concrete' else '') },
      } for choice in part.choices],
    } else part
    for part in building.slots
  ] + [yards.slot + { at: [0, ground(building), 0] }],
  anchors: building.anchors + { street: { kind: 'standing', at: [8, ground(building), 1] } },
};
{
  furniture: decor.furniture + yards.furniture,
  mapPieces: pieces + [
    piece + { id: piece.id + '_concrete', style: 'concrete_townhouse' }
    for piece in pieces if std.member(facadePieces, piece.id)
  ] + decor.mapPieces + yards.mapPieces,
  mapAssemblies: decor.mapAssemblies + [
    dressed(building, concrete) for building in buildings for concrete in [false, true]
  ] + [
    building + {
      size: dressed(building, false).size,
      anchors: dressed(building, false).anchors,
      slots: [{ id: 'style', at: [0, 0, 0], size: dressed(building, false).size, turn: 0,
        choices: [
          { ref: { kind: 'assembly', id: building.id + '_brick' }, weight: 3 },
          { ref: { kind: 'assembly', id: building.id + '_concrete' }, weight: 1 },
        ] }],
    } for building in buildings
  ],
}
