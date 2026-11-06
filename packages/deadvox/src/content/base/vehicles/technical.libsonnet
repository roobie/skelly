// Items and blueprint for the technical: a worn pickup with a bare pedestal in the bed. Its panels fit at the origin; everything else is a shared part placed by its own frame.
local kit = import '../vehicle-kit.libsonnet';
local part = kit.part;
local fitting = kit.fitting;
local pair = kit.pair;
local on = kit.on;
local origin = kit.origin;
local pile = kit.pileSize;
local s = import 'packages/thing-authoring-tool/vehicles/technical.spec.libsonnet';
local wheel = 'wheel_235_75r15';
{
  items: [
    part('technical_frame', 'Worn pickup frame', pile, ['structure']),
    part('technical_cab', 'Worn pickup cab', pile, ['structure', 'protection']),
    part('technical_door', 'Worn pickup door', pile, ['entry', 'glazing', 'protection']),
    part('technical_windows', 'Worn pickup windows', pile, ['glazing']),
    part('technical_dashboard', 'Worn pickup dashboard', pile, ['structure']),
    part('technical_bonnet', 'Mismatched pickup bonnet', pile, ['protection']),
    part('technical_wing', 'Worn pickup wing', pile, ['protection']),
    part('technical_grille', 'Worn pickup grille', pile, ['protection']),
    part('technical_bull_bar', 'Scrap bull bar', pile, ['protection']),
    part('technical_bed_floor', 'Worn pickup bed floor', pile, ['structure', 'load_floor']),
    part('technical_bed', 'Worn pickup bed', pile, ['structure']),
    part('technical_tailgate', 'Worn pickup tailgate', pile, ['protection']),
    part('technical_roll_hoop', 'Welded roll hoop', pile, ['structure']),
    part('technical_pedestal', 'Bed pedestal mount', [6, 6], ['structure']),
    part('technical_steering_box', 'Worn pickup steering box', [4, 3], ['steered']),
  ],
  blueprint: {
    id: 'technical',
    name: 'Technical',
    fittings: [
      fitting('frame', 'technical_frame', origin),
      fitting('cab', 'technical_cab', origin, ['frame']),
      fitting('windows', 'technical_windows', origin, ['cab']),
      fitting('dashboard', 'technical_dashboard', origin, ['cab']),
      fitting('bonnet', 'technical_bonnet', origin, ['cab']),
      fitting('grille', 'technical_grille', origin, ['frame']),
      fitting('bull_bar', 'technical_bull_bar', origin, ['frame']),
      fitting('bed_floor', 'technical_bed_floor', origin, ['frame']),
      fitting('bed', 'technical_bed', origin, ['bed_floor']),
      fitting('tailgate', 'technical_tailgate', origin, ['bed_floor']),
      fitting('roll_hoop', 'technical_roll_hoop', origin, ['bed_floor']),
      fitting('pedestal', 'technical_pedestal', [s.pedestalX, s.deckTop, 0], ['bed_floor']),
      fitting('steering_box', 'technical_steering_box', origin, ['frame']),
      fitting('front_axle', 'beam_axle_light', [s.frontAxle, s.hub - 0.37, 0], ['frame']),
      fitting('rear_axle', 'beam_axle_light', [s.rearAxle, s.hub - 0.37, 0], ['frame']),
      fitting('engine', 'engine_i4_petrol', [1.65, 0.48, 0], ['frame']),
      fitting('gearbox', 'gearbox_inline', [1.1, 0.44, 0], ['engine']),
      fitting('prop_shaft', 'prop_shaft_long', [-0.1, 0.4, 0], ['gearbox', 'rear_axle']),
      fitting('radiator', 'radiator_car', [2.32, 0.6, 0], ['frame']),
      fitting('fuel_tank', 'fuel_tank_car', [-2.04, 0.42, 0], ['frame']),
      fitting('exhaust', 'exhaust_rusted', [-1.92, 0.22, 0.44], ['engine', 'frame']),
      fitting('tow_hitch', 'tow_hitch', [s.rear - 0.06, 0.46, 0], ['frame']),
      fitting('bench', 'bench_seat_3', [0.17, s.floor + 0.04, 0], ['cab']),
      fitting('steering_wheel', 'steering_wheel', [s.cowl - 0.36, s.floor + 0.68, -0.38], ['dashboard']),
      fitting('gear_lever', 'gear_lever', [0.5, s.floor + 0.18, 0], ['cab']),
      kit.cargoSpace('bed_cargo', [-1.95, s.deckTop, 0], [11, 3, 12], 'bed_floor'),
    ]
    + pair('front_wheel', wheel, [s.frontAxle, s.hub, s.wheelZ], on(['front_axle']))
    + pair('rear_wheel', wheel, [s.rearAxle, s.hub, s.wheelZ], on(['rear_axle']))
    + pair('door', 'technical_door', origin, on(['cab']))
    + pair('wing', 'technical_wing', origin, on(['frame']))
    + pair('mirror', 'door_mirror', [0.62, s.waist + 0.12, s.skin], on(['cab']))
    + pair('tail_lamp', 'tail_lamp_small', [s.rear - 0.02, 1.0, 0.76], on(['bed']))
    + pair('headlamp', 'car_headlamp', [s.nose + 0.05, 0.78, 0.62], on(['grille']))
    + kit.batteryBay('hatchback_battery_tray', [2.0, 0.76, 0.42], ['frame']),
  },
}
