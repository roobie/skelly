// Items and blueprint for the articulated bus. Two sections of the bus body helper share one blueprint; the rear
// section takes its windows, doors and fittings from the fore section's rows.
local kit = import '../vehicle-kit.libsonnet';
local bus = import 'packages/thing-authoring-tool/vehicles/bus-body.libsonnet';
local s = import 'packages/thing-authoring-tool/vehicles/articulated_bus.spec.libsonnet';
local fitting = kit.fitting;
local startsWith(id, prefixes) = std.length([1 for prefix in prefixes if std.startsWith(id, prefix)]) > 0;
local foreDropped = ['engine', 'gearbox', 'radiator', 'fuel_tank', 'exhaust', 'prop_shaft_', 'rear_bumper', 'tail_lamp_'];
local aftDropped = [
  'windscreen', 'front_bumper', 'dashboard', 'driver_seat', 'driver_plinth', 'steering_', 'instruments', 'gear_lever', 'front_axle', 'bonnet',
  'grille', 'front_wing_', 'destination_sign', 'front_wheel_', 'door_mirror_', 'headlamp_', 'battery',
];
local rename(id) =
  local tail = std.substr(id, std.length('articulated_bus_aft'), std.length(id));
  if std.startsWith(id, 'articulated_bus_aft') && !std.member(['_shell', '_rear_bumper', '_rear_panel', '_rear_window'], tail)
  then 'articulated_bus' + tail
  else id;
local inAft(f) = f {
  id: 'aft_' + f.id,
  part: rename(f.part),
  supportedBy: if f.id == 'shell' then ['joint'] else ['aft_' + support for support in f.supportedBy],
};
local midAxle(f) = if f.id == 'rear_axle' then f { part: 'trailer_axle_truck' } else f;
local pole(id, x, z) = fitting(id, 'grab_pole', [x, s.fore.floor, z], ['shell']);
{
  items: [
    item
    for item in bus.items(kit, 'articulated_bus', 'Articulated bus', s.fore)
    if item.id != 'articulated_bus_rear_bumper'
  ] + [
    item
    for item in bus.items(kit, 'articulated_bus_aft', 'Articulated bus rear section', s.aft)
    if std.member(['_shell', '_rear_bumper', '_rear_panel', '_rear_window'], std.substr(item.id, std.length('articulated_bus_aft'), std.length(item.id)))
  ] + [
    kit.part('articulated_bus_bellows', 'Articulated bus bellows', kit.pileSize, ['structure', 'protection']),
    kit.part('articulated_bus_aft_end_panel', 'Articulated bus rear section end panel', kit.pileSize, ['protection']),
    kit.part('articulated_bus_joint', 'Articulated bus turntable joint', kit.pileSize, ['structure']),
  ],
  blueprint: {
    id: 'articulated_bus',
    name: 'Articulated bus',
    fittings: [
      midAxle(f)
      for f in bus.fittings(kit, 'articulated_bus', s.fore)
      if !startsWith(f.id, foreDropped)
    ] + [
      fitting('joint', 'articulated_bus_joint', kit.origin, ['shell']),
      fitting('bellows', 'articulated_bus_bellows', kit.origin, ['shell', 'aft_shell']),
    ] + [
      inAft(f)
      for f in bus.fittings(kit, 'articulated_bus_aft', s.aft)
      if !startsWith(f.id, aftDropped)
    ] + [
      pole('pole_front', 6.9, 0.3),
      pole('pole_door_fwd', 4.6, 0.3),
      pole('pole_door_aft', 2.9, 0.3),
      fitting('aft_end_panel', 'articulated_bus_aft_end_panel', kit.origin, ['aft_shell']),
      fitting('aft_pole_door', 'grab_pole', [-3.2, s.aft.floor, 0.3], ['aft_shell']),
      fitting('roof_unit', 'city_bus_roof_unit', [3.2, s.fore.roof, 0], ['shell']),
      fitting('aft_roof_unit', 'city_bus_roof_unit', [-5.6, s.aft.roof, 0], ['aft_shell']),
    ],
  },
}
