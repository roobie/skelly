local decor = import 'gauntlet-city-decor.libsonnet';
local cellars = import 'gauntlet-city-cellars.libsonnet';
local yards = import 'gauntlet-city-yards.libsonnet';
function(kit)
local cellar = std.filter(function(building) building.id == 'gauntlet_city_2', kit.mapAssemblies)[0];
local only = function(id) [{ ref: { kind: 'piece', id: id }, weight: 1 }];
local groundShell = std.filter(function(part) part.id == 'shell', cellar.slots)[0];
// The cellar takes the ground storey's place, so the storey over it gets the front door, its windows,
// the kitchen and the bathroom, and the cellar gets its fitted corner beneath them.
local street = 9;
local raised = std.set([part.id for part in kit.services.slots(1)] + ['door']);
local cellarHouse = cellar + {
  id: 'gauntlet_city_cellar',
  slots: [
    if part.id == 'shell' then part + { choices: only('gauntlet_city_cellar_shell') }
    else if part.id == 'upper_shell' then part + { choices: groundShell.choices }
    else if part.id == 'floor_shell' then part + { choices: only('gauntlet_city_street_course') }
    else if part.id == 'room' then kit.scenes.slot(part.id, part.at, 'cellar')
    else if part.id == 'upper_room' then kit.scenes.slot(part.id, part.at, 'ground')
    else if std.setMember(part.id, raised) then part + { at: [part.at[0], street, part.at[2]] }
    else part
    for part in cellar.slots
  ] + kit.services.cellarSlots(1),
  anchors: kit.services.anchors(street) + {
    entry: { kind: 'standing', at: [8, street, 8] }, cellar: { kind: 'standing', at: [8, 1, 8] },
  },
  access: cellar.access + { ground: 'floor_1', entrance: [8, street, 8] },
};
// The cellar house raised over its sub-cellar, whose layers set the depth.
local subCellar = std.filter(function(piece) piece.id == 'gauntlet_city_sub_cellar', cellars.mapPieces)[0];
local depth = subCellar.size[1];
local up = function(at) [at[0], at[1] + depth, at[2]];
local noted = kit.scenes.onDesk('ground', '_noted', [{ item: 'gauntlet_cellar_note', placement: 'surface' }]);
// The rug lies over the secret hatch, which sits in the ground floor beneath the room's north-east corner.
local rugged = kit.scenes.lying('cellar', '_rug', 'rug', 10, 0);
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
local briefed = kit.mapAssemblies + [cellarHouse];
local roof = decor.roofs[0].assembly;
local ground = function(building) std.filter(function(storey) storey.id == building.access.ground, building.access.storeys)[0].floor;
local roofSlot = function(building) std.filter(function(part) part.id == 'roof', building.slots)[0];
local dressed = function(building) building + {
  eligibility: { settlementKinds: ['city'] },
  size: [building.size[0], building.size[1] - roofSlot(building).size[1] + roof.size[1], building.size[2]],
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
  furniture: decor.furniture + yards.furniture,
  mapPieces: kit.mapPieces + cellars.mapPieces + noted.mapPieces + rugged.mapPieces + decor.mapPieces + yards.mapPieces,
  // The secret house answers no brief: it is the scenario's one-off stash, placed once and in brick
  // only, not a pathway building.
  mapAssemblies: decor.mapAssemblies + kit.shells
                 + [dressed(building) + { brief: 'city_townhouse' } for building in briefed] + [dressed(secretHouse)],
}
