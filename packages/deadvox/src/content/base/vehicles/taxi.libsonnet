// The saloon in cab yellow with a roof sign and a dark side band. Its panels are the saloon's, repainted, so its
// fittings come from the saloon's blueprint.
local kit = import '../vehicle-kit.libsonnet';
local saloon = import 'saloon.libsonnet';
local retag(id) = if std.startsWith(id, 'saloon_') then 'taxi_' + id[7:] else id;
{
  items: [
    item + { id: retag(item.id), model: retag(item.id), name: 'Taxi' + item.name[6:] }
    for item in saloon.items
  ] + [
    kit.part('taxi_roof_sign', 'Taxi roof sign', [6, 3], ['light']),
    kit.part('taxi_side_band', 'Taxi side band', kit.pileSize, []),
  ],
  blueprint: saloon.blueprint + {
    id: 'taxi',
    name: 'Taxi',
    fittings: [fitting + { part: retag(fitting.part) } for fitting in saloon.blueprint.fittings] + [
      kit.fitting('roof_sign', 'taxi_roof_sign', kit.origin, ['shell']),
      kit.fitting('side_band', 'taxi_side_band', kit.origin, ['shell']),
    ],
  },
}
