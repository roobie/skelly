// Items and blueprint for the animal control van; its panels fit at the origin (`packages/thing-authoring-tool/vehicles/van-body.libsonnet`).
local kit = import '../vehicle-kit.libsonnet';
local van = import 'packages/thing-authoring-tool/vehicles/van-body.libsonnet';
local s = import 'packages/thing-authoring-tool/vehicles/animal_control_van.spec.libsonnet';
local b = s.box;
local part(suffix, name, capabilities) = kit.part('animal_control_van_' + suffix, 'Animal control van ' + name, kit.pileSize, capabilities);
local cages(tag, y, on) = std.flattenArrays([
  kit.pair(tag + i, 'animal_control_van_cage', [b.columns[i], y, b.cageIn], on(i))
  for i in [0, 1, 2]
]);
{
  items: van.items(kit, 'animal_control_van', 'Animal control van', s) + [
    part('cage', 'cage box', ['storage']),
    part('hatches', 'cage hatches', ['protection']),
    part('rear_hatches', 'rear cage hatches', ['protection']),
  ],
  blueprint: {
    id: 'animal_control_van',
    name: 'Animal control van',
    fittings: van.fittings(kit, 'animal_control_van', s) + [
      kit.fitting('roof_vent', 'roof_vent', [-1.4, b.roof, 0], ['box']),
      kit.fitting('beacon', 'beacon_amber', [-0.3, b.roof, 0], ['box']),
      // The aisle between the two rows of cages, in from the rear doors.
      kit.cargoSpace('aisle', [-1.8, b.floor, 0], [18, 14, 4], 'load_floor'),
    ]
    + cages('cage_low', b.floor, function(i) kit.on(['load_floor']))
    + cages('cage_high', b.floor + b.cageHeight, function(i) kit.on(paired=['cage_low' + i]))
    + kit.pair('hatches', 'animal_control_van_hatches', kit.origin, kit.on(['box']))
    + kit.pair('rear_hatches', 'animal_control_van_rear_hatches', kit.origin, kit.on(paired=['rear_door'])),
  },
}
