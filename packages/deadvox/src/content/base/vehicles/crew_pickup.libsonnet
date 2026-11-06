// Items and blueprint for the crew pickup. Its panels fit at the origin; everything else is a shared part placed by its own frame.
local kit = import '../vehicle-kit.libsonnet';
local part = kit.part;
local fitting = kit.fitting;
local pair = kit.pair;
local on = kit.on;
local origin = kit.origin;
local pile = kit.pileSize;
local s = import 'packages/thing-authoring-tool/vehicles/crew_pickup.spec.libsonnet';
local door(id, name) = part(id, name, pile, ['entry', 'glazing', 'protection']);
{
  items: [
    part('crew_pickup_shell', 'Crew pickup body shell', pile, ['structure', 'protection', 'storage']),
    part('crew_pickup_windscreen', 'Crew pickup windscreen', pile, ['glazing']),
    part('crew_pickup_bonnet', 'Crew pickup bonnet', pile, ['protection']),
    part('crew_pickup_front_wing', 'Crew pickup front wing', pile, ['protection']),
    part('crew_pickup_front_bumper', 'Crew pickup front bumper', pile, ['protection']),
    part('crew_pickup_dashboard', 'Crew pickup dashboard', pile, ['structure']),
    door('crew_pickup_front_door', 'Crew pickup front door'),
    door('crew_pickup_rear_door', 'Crew pickup rear door'),
    part('crew_pickup_frame', 'Crew pickup frame', pile, ['structure']),
    part('crew_pickup_bed_floor', 'Crew pickup bed floor', pile, ['structure', 'load_floor']),
    part('crew_pickup_bed_front', 'Crew pickup bed front', pile, ['structure']),
    part('crew_pickup_bed_side', 'Crew pickup bed side', pile, ['protection']),
    part('crew_pickup_bed_tailgate', 'Crew pickup bed tailgate', pile, ['entry', 'protection']),
    part('crew_pickup_rear_bumper', 'Crew pickup rear bumper', pile, ['protection']),
  ],
  blueprint: {
    id: 'crew_pickup',
    name: 'Crew pickup',
    fittings: [
      fitting('shell', 'crew_pickup_shell', origin),
      fitting('windscreen', 'crew_pickup_windscreen', origin, ['shell']),
      fitting('bonnet', 'crew_pickup_bonnet', origin, ['shell']),
      fitting('front_bumper', 'crew_pickup_front_bumper', origin, ['shell']),
      fitting('dashboard', 'crew_pickup_dashboard', origin, ['shell']),
      fitting('engine', 'engine_i4_diesel', [1.47, 0.48, 0], ['shell']),
      fitting('gearbox', 'gearbox_inline', [0.93, 0.45, 0], ['engine']),
      fitting('rear_axle', 'beam_axle_light', [s.rearAxle, 0.032, 0], ['shell']),
      fitting('prop_shaft', 'prop_shaft_short', [0, 0.42, 0], ['gearbox', 'rear_axle']),
      fitting('radiator', 'radiator_van', [s.front - 0.3, 0.58, 0], ['shell']),
      fitting('fuel_tank', 'fuel_tank_van', [-2.25, 0.38, -0.04], ['shell']),
      fitting('steering_wheel', 'steering_wheel', [s.cowl - 0.4, s.waist - 0.2, -0.37], ['dashboard']),
      fitting('gear_lever', 'gear_lever', [s.cowl - 0.4, 0.8, 0], ['dashboard']),
      fitting('rear_bench', 'bench_seat_3', [-0.42, s.floor, 0], ['shell']),
      fitting('frame', 'crew_pickup_frame', origin, ['shell']),
      fitting('bed_floor', 'crew_pickup_bed_floor', origin, ['frame']),
      fitting('bed_front', 'crew_pickup_bed_front', origin, ['bed_floor']),
      fitting('bed_tailgate', 'crew_pickup_bed_tailgate', origin, ['bed_floor']),
      fitting('rear_bumper', 'crew_pickup_rear_bumper', origin, ['frame']),
      fitting('rear_prop_shaft', 'prop_shaft_short', [-0.9, 0.42, 0], ['prop_shaft', 'rear_axle']),
      fitting('exhaust', 'exhaust_long', [s.rear - 0.12 + 0.58, 0.4, 0.5], ['engine', 'frame']),
      fitting('tow_hitch', 'tow_hitch', [s.rear, 0.42, 0], ['frame']),
      fitting('spare_wheel', 'spare_wheel_carrier', [s.bedFront - 0.04, s.bedFloorTop + 0.367, 0], ['bed_front']),
      kit.cargoSpace('bed_cargo', [-1.9, s.bedFloorTop, 0], [12, 4, 12], 'bed_floor'),
    ]
    + pair('front_wing', 'crew_pickup_front_wing', origin, on(['shell']))
    + pair('front_door', 'crew_pickup_front_door', origin, on(['shell']))
    + pair('rear_door', 'crew_pickup_rear_door', origin, on(['shell']))
    + pair('bed_side', 'crew_pickup_bed_side', origin, on(['bed_floor']))
    + pair('tail_lamp', 'tail_lamp_tall', [s.rear - 0.03, 0.78, 0.84], on(paired=['bed_side']))
    + pair('front_strut', 'front_strut', [s.frontAxle, 0.366, s.side - 0.1325 - 0.05], on(['shell']))
    + pair('front_wheel', 'wheel_265_75r16', [s.frontAxle, 0.402, s.side - 0.1325], on(paired=['front_strut']))
    + pair('rear_wheel', 'wheel_265_75r16', [s.rearAxle, 0.402, s.side - 0.1325], on(['rear_axle']))
    + pair('front_seat', 'front_seat', [0.3, s.floor, 0.37], on(['shell']))
    + pair('door_mirror', 'door_mirror', [s.cowl - 0.04, s.waist, s.side - 0.03], on(['shell']))
    + kit.headlamps(s.front - 0.07, 0.97, 0.62, ['front_bumper'])
    + kit.batteryBay('hatchback_battery_tray', [s.aPost + 0.25, 0.75, -0.44], ['shell']),
  },
}
