local decor = import 'gauntlet-city-decor.libsonnet';
local cellars = import 'gauntlet-city-cellars.libsonnet';
local yards = import 'gauntlet-city-yards.libsonnet';
function(kit)
local only = function(id) [{ ref: { kind: 'piece', id: id }, weight: 1 }];
local find = function(id, list) std.filter(function(entry) entry.id == id, list)[0];
// The cellar flight climbs under the house flight, in the same stairwell: its top course carries the
// house flight's landing, and the house flight over a cellar is open treads, so a body on the cellar
// flight keeps its headroom under them.
local flight = find('gauntlet_city_stairs_east', kit.mapPieces);
local landing = ['pp.......pp', 'pp.......pp'];
local cellarFlight = flight + {
  id: 'gauntlet_city_cellar_stairs',
  layers: flight.layers[0:7] + [landing],
  ownership: { layers: flight.ownership.layers[0:7] + [['SSRRRRRRRSS', 'SSRRRRRRRSS']] },
};
local tread(layer, x) = x == layer + 2 || (layer == 7 && x > 8);
local treads(mark, air) = [
  [std.join('', [if tread(layer, x) then mark else air for x in std.range(0, 10)]) for _ in [0, 1]]
  for layer in std.range(0, 7)
];
local openFlight = flight + {
  id: 'gauntlet_city_stairs_open', layers: treads('p', '.'), ownership: { layers: treads('S', 'R') },
};
// Where no house flight rises, the stairwell over the cellar flight is kept air a body climbs through,
// as high as the storey under the roof.
local wellHeight = flight.size[1] - 1;
local stairwell = flight + {
  id: 'gauntlet_city_stairwell',
  size: [flight.size[0], wellHeight, flight.size[2]],
  layers: [['...........', '...........'] for _ in std.range(1, wellHeight)],
  ownership: { layers: [['RRRRRRRRRRR', 'RRRRRRRRRRR'] for _ in std.range(1, wellHeight)] },
};
// A house over a cellar: every storey rises one storey, so the street storey keeps the front door, its
// windows, the kitchen and the bathroom, and the cellar under them gets its fitted corner beneath the
// kitchen. The street storey's room gives way to the stairwell down, as the room under a stair does.
local storey = 8;
local up = function(at, by) [at[0], at[1] + by, at[2]];
local withCellar = function(building) building + {
  id: building.id + '_cellar',
  size: up(building.size, storey),
  slots: [
    if part.id == 'ground' then part
    else if part.id == 'stairs' then part + { at: up(part.at, storey), choices: only(openFlight.id) }
    else if part.id == 'room' then kit.scenes.slot(part.id, up(part.at, storey), 'lower')
    else part + { at: up(part.at, storey) }
    for part in building.slots
  ] + (
    if std.member([part.id for part in building.slots], 'stairs') then []
    else [{ id: 'stairs', at: [1, storey + 1, 5], size: stairwell.size, turn: 0, choices: only(stairwell.id) }]
  ) + [
    { id: 'cellar_shell', at: [0, 1, 0], size: [18, 7, 16], turn: 0, choices: only('gauntlet_city_cellar_shell') },
    kit.scenes.slot('cellar_room', [1, 1, 3], 'cellar'),
    { id: 'cellar_stairs', at: [1, 1, 5], size: cellarFlight.size, turn: 0, choices: only(cellarFlight.id) },
    { id: 'street_course', at: [0, storey, 0], size: [18, 1, 16], turn: 0, choices: only('gauntlet_city_street_course') },
    { id: 'cellar_ceiling', at: [1, storey, 3], size: [14, 1, 12], turn: 0, choices: only('gauntlet_city_floor_lower') },
  ] + kit.services.cellarSlots(1),
  anchors: { [id]: building.anchors[id] + { at: up(building.anchors[id].at, storey) } for id in std.objectFields(building.anchors) }
           + { cellar: { kind: 'standing', at: [8, 1, 8] } },
  access: building.access + {
    ground: 'floor_1',
    entrance: up(building.access.entrance, storey),
    storeys: [{ id: 'floor_0', floor: 1 }] + std.mapWithIndex(
      function(index, level) level + { id: 'floor_' + (index + 1), floor: level.floor + storey },
      building.access.storeys,
    ),
  },
};
local townhouse = function(id) find(id, kit.mapAssemblies);
local cellared = [withCellar(townhouse(id)) for id in ['gauntlet_city_1', 'gauntlet_city_2', 'gauntlet_city_3']];
local cellarHouse = cellared[0];
// The cellar house raised over its sub-cellar, whose layers set the depth.
local subCellar = std.filter(function(piece) piece.id == 'gauntlet_city_sub_cellar', cellars.mapPieces)[0];
local depth = subCellar.size[1];
local noted = kit.scenes.onDesk('lower', '_noted', [{ item: 'gauntlet_cellar_note', placement: 'surface' }]);
// The rug lies over the secret hatch, which sits in the ground floor beneath the room's north-east corner.
local rugged = kit.scenes.lying('cellar', '_rug', 'rug', 10, 0);
local secretHouse = cellarHouse + {
  id: 'gauntlet_city_cellar_secret',
  size: up(cellarHouse.size, depth),
  slots: [{ id: 'sub_cellar', at: [0, 0, 0], size: subCellar.size, turn: 0, choices: only(subCellar.id) }] + [
    if part.id == 'ground' then part + { at: up(part.at, depth), choices: only('gauntlet_city_secret_floor') }
    else if part.id == 'cellar_room' then rugged.slot(part.id, up(part.at, depth))
    else if part.id == 'room' then noted.slot(part.id, up(part.at, depth))
    else part + { at: up(part.at, depth) }
    for part in cellarHouse.slots
  ],
  anchors: { [id]: cellarHouse.anchors[id] + { at: up(cellarHouse.anchors[id].at, depth) } for id in std.objectFields(cellarHouse.anchors) },
  access: cellarHouse.access + {
    entrance: up(cellarHouse.access.entrance, depth),
    storeys: [level + { floor: level.floor + depth } for level in cellarHouse.access.storeys],
  },
};
local briefed = kit.mapAssemblies + cellared;
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
  mapPieces: kit.mapPieces + [cellarFlight, openFlight, stairwell] + cellars.mapPieces + noted.mapPieces + rugged.mapPieces + decor.mapPieces + yards.mapPieces,
  // The secret house answers no brief: it is the scenario's one-off stash, placed once and in brick
  // only, not a pathway building.
  mapAssemblies: decor.mapAssemblies + kit.shells
                 + [dressed(building) + { brief: 'city_townhouse' } for building in briefed] + [dressed(secretHouse)],
}
