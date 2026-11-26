// The townhouse streets with the body just inside the street door of the near street's two-storey house over a
// cellar, facing west along the front band, so a look starts beside the spandrel under the house flight's treads.
local streets = (import '../skelly.deadvox.scenario.buildings.townhouse-look/layouts.jsonnet').layouts[0];
local assemblies = (import '../skelly.deadvox.scenario.gauntlet.city/gauntlet.json').mapAssemblies;
local house = std.filter(function(b) b.template == 'gauntlet_city_2_cellar' && b.style == 'brick_townhouse', streets.buildings)[0];
local twin = std.filter(function(a) a.id == house.template, assemblies)[0];
local door = std.filter(function(slot) slot.id == 'door', twin.slots)[0].at;
// The cell inside the door's eastern leaf, one cell over the ground storey's support layer, which the layout sets at
// the house's height. Layout positions are metres and template cells half a metre; the body stands at the middle of
// its cell.
local inside = [door[0] + 1, 1, door[2] + 1];
local metres(cell, centred) = cell / 2 + (if centred then 0.25 else 0);
{
  layouts: [streets + {
    id: 'townhouseTwinDoorLook',
    player: {
      position: [
        house.position[0] + metres(inside[0], true),
        house.position[1] + metres(inside[1], false),
        house.position[2] + metres(inside[2], true),
      ],
      bearing: 270,
    },
  }],
}
