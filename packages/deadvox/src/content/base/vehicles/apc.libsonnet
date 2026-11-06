// Items and blueprint for the armoured personnel carrier. Its armour fits at the origin; everything else is placed by its own frame.
local kit = import '../vehicle-kit.libsonnet';
local part = kit.part;
local fitting = kit.fitting;
local pair = kit.pair;
local on = kit.on;
local origin = kit.origin;
local pile = kit.pileSize;
local s = import 'packages/thing-authoring-tool/vehicles/apc.spec.libsonnet';
local wheelPair(i) = pair('wheel_' + i, 'wheel_military_22_5', [s.axles[i], s.hub, s.wheelZ], on(['axle_' + i]));
local axlePart(i) = if i < 2 then 'apc_axle_steered' else 'apc_axle_driven';
{
  items: [
    part('apc_hull_belly', 'APC hull belly', pile, ['structure', 'protection']),
    part('apc_hull_side', 'APC hull side', pile, ['structure', 'protection']),
    part('apc_hull_nose', 'APC hull nose', pile, ['structure', 'protection']),
    part('apc_hull_roof', 'APC hull roof', pile, ['structure', 'protection']),
    part('apc_hull_rear', 'APC hull rear', pile, ['structure', 'protection']),
    part('apc_ramp', 'APC rear ramp', pile, ['entry', 'protection']),
    part('apc_applique', 'APC armour plate', pile, ['protection']),
    part('apc_fuel_tank', 'APC armoured fuel tank', [5, 8], ['fuel']),
    part('apc_axle_steered', 'APC steered axle', pile, ['structure', 'steered', 'driven']),
    part('apc_axle_driven', 'APC driven axle', pile, ['structure', 'driven']),
    part('apc_stowage_bin', 'APC stowage bin', [6, 6], ['storage']),
    part('apc_turret_ring', 'APC turret ring', pile, ['structure']),
    part('apc_turret', 'APC turret', pile, ['protection']),
    part('apc_cupola', 'APC cupola', [6, 6], ['protection']),
    part('apc_hatch', 'APC roof hatch', [5, 5], ['protection']),
    part('apc_periscope', 'APC periscope', [2, 2], ['glazing']),
    part('apc_engine_deck', 'APC engine deck', pile, ['protection']),
    part('apc_bench', 'APC troop bench', pile, ['seat']),
    part('apc_wall_locker', 'APC wall locker', [6, 6], ['storage']),
    part('apc_rifle_rack', 'APC rifle rack', pile, ['storage']),
    part('apc_ammo_rack', 'APC ammunition rack', [6, 6], ['storage']),
    part('apc_driver_panel', 'APC driver panel', [6, 6], ['structure']),
  ],
  blueprint: {
    id: 'apc',
    name: 'Armoured personnel carrier',
    fittings: [
      fitting('belly', 'apc_hull_belly', origin),
      fitting('nose', 'apc_hull_nose', origin, ['belly']),
      fitting('roof', 'apc_hull_roof', origin, ['side_near', 'side_far']),
      fitting('rear', 'apc_hull_rear', origin, ['belly']),
      fitting('ramp', 'apc_ramp', origin, ['rear']),
      fitting('turret_ring', 'apc_turret_ring', [s.turretX, s.roofTop, 0], ['roof']),
      fitting('turret', 'apc_turret', [s.turretX, s.roofTop + 0.1, 0], ['turret_ring']),
      fitting('cupola', 'apc_cupola', [-1.2, s.roofTop, 0.6], ['roof']),
      fitting('driver_hatch', 'apc_hatch', [s.driverX, s.roofTop, s.driverZ], ['roof']),
      fitting('engine_deck', 'apc_engine_deck', origin, ['roof']),
      fitting('engine', 'engine_i6_heavy_diesel', [1.95, 0.85, 0.47], ['belly']),
      fitting('gearbox', 'gearbox_heavy', [0.95, 0.85, 0.47], ['engine']),
      fitting('radiator', 'radiator_truck', [2.6, 1.0, 0.47], ['nose']),
      fitting('exhaust', 'exhaust_military', [1.4, 1.85, 0.6], ['engine']),
      fitting('driver_seat', 'front_seat', [s.driverX, s.floor, s.driverZ], ['belly']),
      fitting('steering_wheel', 'steering_wheel', [s.driverX + 0.43, s.floor + 0.52, s.driverZ], ['driver_panel']),
      fitting('driver_panel', 'apc_driver_panel', origin, ['belly']),
      fitting('rifle_rack', 'apc_rifle_rack', origin, ['side_near']),
      fitting('ammo_rack', 'apc_ammo_rack', origin, ['belly']),
      fitting('tow_hitch', 'tow_hitch', [s.rear - 0.125, 0.68, 0], ['rear']),
    ]
    + [fitting('axle_' + i, axlePart(i), [s.axles[i], s.hub, 0], ['belly']) for i in std.range(0, 3)]
    + std.flattenArrays([wheelPair(i) for i in std.range(0, 3)])
    + pair('side', 'apc_hull_side', origin, on(['belly']))
    + std.flattenArrays([
      pair('plate_' + i, 'apc_applique', [s.plateFirst + s.platePitch * i, s.shelf + 0.1, s.side], on(paired=['side']))
      for i in std.range(0, 4)
    ])
    + pair('stowage_bin', 'apc_stowage_bin', origin, on(paired=['side']))
    + pair('squad_hatch', 'apc_hatch', [-2.2, s.roofTop, 0.72], on(['roof']))
    + pair('periscope_rear', 'apc_periscope', [-0.95, s.roofTop, 1.05], on(['roof']))
    + pair('bench', 'apc_bench', origin, on(['belly']))
    + pair('wall_locker', 'apc_wall_locker', origin, on(paired=['side']))
    + pair('headlamp', 'headlamp_military', [s.nose + 0.03, 1.0, 0.95], on(['nose']))
    + pair('fuel_tank', 'apc_fuel_tank', [s.rear - 0.14, 0.86, 0.94], on(['rear']))
    + pair('tail_lamp', 'tail_lamp_small', [s.rear - 0.14, 1.85, 0.95], on(['rear']))
    + [
      fitting('driver_periscope_' + i, 'apc_periscope', [s.driverX + 0.42, s.roofTop, s.driverZ + (i - 1) * 0.32], ['roof'])
      for i in std.range(0, 2)
    ]
    + kit.batteryBay('truck_battery_tray', [-2.75, s.floor + 0.3, 0.5], ['belly']),
  },
}
