// Items and blueprint for the electric crossover. Its panels fit at the origin; everything else is a shared part
// placed by its own frame. It was never built with an engine, so the powertrain helper has nothing to drop.
local kit = import '../vehicle-kit.libsonnet';
local powertrain = import '../vehicle-powertrain.libsonnet';
local part = kit.part;
local fitting = kit.fitting;
local pair = kit.pair;
local on = kit.on;
local origin = kit.origin;
local pile = kit.pileSize;
local s = import 'packages/thing-authoring-tool/vehicles/electric_crossover.spec.libsonnet';
local door(id, name) = part(id, name, pile, ['entry', 'glazing', 'protection']);
local base = {
  fittings: [
    fitting('shell', 'electric_crossover_shell', origin),
    fitting('windscreen', 'electric_crossover_windscreen', origin, ['shell']),
    fitting('tailgate', 'electric_crossover_tailgate', origin, ['shell']),
    fitting('bonnet', 'electric_crossover_bonnet', origin, ['shell']),
    fitting('front_bumper', 'electric_crossover_front_bumper', origin, ['shell']),
    fitting('rear_bumper', 'electric_crossover_rear_bumper', origin, ['shell']),
    fitting('dashboard', 'electric_crossover_dashboard', origin, ['shell']),
    fitting('rear_axle', 'twist_beam', [s.rearAxle, 0.05, 0], ['shell']),
    fitting('steering_wheel', 'steering_wheel', [s.cowl - 0.4, s.waist - 0.2, -0.37], ['dashboard']),
    fitting('gear_lever', 'gear_lever', [s.cowl - 0.4, 0.65, 0], ['dashboard']),
    fitting('rear_bench', 'bench_seat_3', [-0.62, s.floor, 0], ['shell']),
  ]
  + pair('front_wing', 'electric_crossover_front_wing', origin, on(['shell']))
  + pair('front_door', 'electric_crossover_front_door', origin, on(['shell']))
  + pair('rear_door', 'electric_crossover_rear_door', origin, on(['shell']))
  + pair('tail_lamp', 'electric_crossover_tail_lamp', origin, on(['shell']))
  + pair('cladding', 'electric_crossover_cladding', origin, on(['shell']))
  + pair('front_strut', 'front_strut', [s.frontAxle, 0.331, s.side - 0.1175 - 0.05], on(['shell']))
  + pair('front_wheel', 'wheel_235_75r15', [s.frontAxle, 0.367, s.side - 0.1175], on(paired=['front_strut']))
  + pair('rear_wheel', 'wheel_235_75r15', [s.rearAxle, 0.367, s.side - 0.1175], on(['rear_axle']))
  + pair('front_seat', 'front_seat', [0.08, s.floor, 0.37], on(['shell']))
  + pair('door_mirror', 'door_mirror', [s.cowl - 0.04, s.waist, s.side - 0.03], on(['shell']))
  + kit.headlamps(s.front - 0.07, 0.8, 0.62, ['front_bumper'])
  + kit.batteryBay('hatchback_battery_tray', [s.aPost + 0.25, 0.55, -0.44], ['shell']),
};
{
  items: [
    part('electric_crossover_shell', 'Electric crossover body shell', pile, ['structure', 'protection', 'storage']),
    part('electric_crossover_windscreen', 'Electric crossover windscreen', pile, ['glazing']),
    part('electric_crossover_tailgate', 'Electric crossover tailgate', pile, ['entry', 'glazing']),
    part('electric_crossover_bonnet', 'Electric crossover bonnet', pile, ['protection']),
    part('electric_crossover_front_wing', 'Electric crossover front wing', pile, ['protection']),
    part('electric_crossover_front_bumper', 'Electric crossover front bumper', pile, ['protection']),
    part('electric_crossover_rear_bumper', 'Electric crossover rear bumper', pile, ['protection']),
    part('electric_crossover_tail_lamp', 'Electric crossover tail lamp', [3, 3], ['light']),
    part('electric_crossover_dashboard', 'Electric crossover dashboard', pile, ['structure']),
    door('electric_crossover_front_door', 'Electric crossover front door'),
    door('electric_crossover_rear_door', 'Electric crossover rear door'),
    part('electric_crossover_cladding', 'Electric crossover wheel arch cladding', pile, ['protection']),
  ],
  blueprint: powertrain.electric(base, {
    id: 'electric_crossover',
    name: 'Electric crossover',
    motor: { part: 'traction_motor_car', at: [s.frontAxle - 0.02, 0.3, 0] },
    inverter: { part: 'inverter_car', at: [s.frontAxle - 0.05, 0.64, 0.05], on: ['motor'] },
    pack: { part: 'traction_pack_car', at: [(s.rearFloorFront + s.cowl) / 2, s.sill, 0] },
    port: { part: 'charge_port', at: [s.rearAxle - 0.15, s.archTop + 0.05, s.side] },
  }),
}
