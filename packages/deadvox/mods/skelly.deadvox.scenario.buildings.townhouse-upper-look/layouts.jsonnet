// The townhouse streets with the body spawned on the top storey of the near street's three-storey house, so a
// look starts on the slab floors the support rule proves, under the roof deck, beside the stair down.
local streets = (import '../skelly.deadvox.scenario.buildings.townhouse-look/layouts.jsonnet').layouts[0];
local assemblies = (import '../skelly.deadvox.scenario.gauntlet.city/gauntlet.json').mapAssemblies;
local house = std.filter(function(b) b.template == 'gauntlet_city_3' && b.style == 'brick_townhouse', streets.buildings)[0];
local upper = std.filter(function(a) a.id == house.template, assemblies)[0].anchors.upper.at;
// Layout positions are metres and template cells half a metre; the body stands at the middle of its cell.
local metres(cell, centred) = cell / 2 + (if centred then 0.25 else 0);
{
  layouts: [streets + {
    id: 'townhouseUpperLook',
    player: {
      position: [
        house.position[0] + metres(upper[0], true),
        house.position[1] + metres(upper[1], false),
        house.position[2] + metres(upper[2], true),
      ],
      bearing: 0,
    },
  }],
}
