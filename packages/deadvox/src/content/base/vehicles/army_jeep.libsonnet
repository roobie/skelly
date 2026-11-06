// Items and blueprint for the army jeep. Its panels fit at the origin; everything else is a shared part placed by its own frame.
local kit = import '../vehicle-kit.libsonnet';
local part = kit.part;
local fitting = kit.fitting;
local pair = kit.pair;
local on = kit.on;
local origin = kit.origin;
local pile = kit.pileSize;
local s = import 'packages/thing-authoring-tool/vehicles/army_jeep.spec.libsonnet';
{
  items: [
    part('army_jeep_frame', 'Army field car frame', pile, ['structure']),
    part('army_jeep_tub', 'Army field car tub', pile, ['structure', 'protection']),
    part('army_jeep_bonnet', 'Army field car bonnet', pile, ['protection']),
    part('army_jeep_grille', 'Army field car grille', pile, ['protection']),
    part('army_jeep_front_wing', 'Army field car front wing', pile, ['protection']),
    part('army_jeep_rear_fender', 'Army field car rear fender', pile, ['protection']),
    part('army_jeep_windscreen', 'Army field car windscreen', pile, ['glazing']),
    part('army_jeep_dashboard', 'Army field car dashboard', pile, ['structure']),
    part('army_jeep_seat', 'Canvas field seat', [5, 6], ['seat']),
    part('army_jeep_side_rail', 'Army field car side rail', pile, ['entry', 'protection']),
    part('army_jeep_steering_box', 'Army field car steering box', [4, 3], ['steered']),
    part('army_jeep_folded_canvas', 'Folded canvas top', pile, ['protection']),
  ],
  blueprint: {
    id: 'army_jeep',
    name: 'Army field car',
    fittings: [
      fitting('frame', 'army_jeep_frame', origin),
      fitting('tub', 'army_jeep_tub', origin, ['frame']),
      fitting('bonnet', 'army_jeep_bonnet', origin, ['tub']),
      fitting('grille', 'army_jeep_grille', origin, ['frame']),
      fitting('windscreen', 'army_jeep_windscreen', origin, ['tub']),
      fitting('dashboard', 'army_jeep_dashboard', origin, ['tub']),
      fitting('folded_canvas', 'army_jeep_folded_canvas', origin, ['tub']),
      fitting('steering_box', 'army_jeep_steering_box', origin, ['frame']),
      fitting('front_axle', 'beam_axle_light', [s.frontAxle, 0, 0], ['frame']),
      fitting('rear_axle', 'beam_axle_light', [s.rearAxle, 0, 0], ['frame']),
      fitting('engine', 'engine_i4_petrol', [0.66, 0.36, 0], ['frame']),
      fitting('gearbox', 'gearbox_inline', [0.14, 0.38, 0], ['engine']),
      fitting('prop_shaft', 'prop_shaft_short', [-0.42, 0.36, 0], ['gearbox', 'rear_axle']),
      fitting('radiator', 'radiator_small', [1.44, 0.58, 0], ['frame']),
      fitting('fuel_tank', 'fuel_tank_car', [-1.42, 0.35, 0], ['frame']),
      fitting('exhaust', 'exhaust_military', [s.rearAxle - 0.34, 0.44, 0.42], ['engine', 'frame']),
      fitting('spare_wheel', 'spare_wheel_carrier', [s.rear, 0.76, 0], ['tub']),
      fitting('tow_hitch', 'tow_hitch', [s.rear, 0.42, 0], ['frame']),
      fitting('steering_wheel', 'steering_wheel', [0.08, 0.98, -0.3], ['dashboard']),
      fitting('gear_lever', 'gear_lever', [0.02, s.floor + 0.1, 0], ['tub']),
    ]
    + pair('front_wheel', 'wheel_military_16', [s.frontAxle, s.hub, s.wheelZ], on(['front_axle']))
    + pair('rear_wheel', 'wheel_military_16', [s.rearAxle, s.hub, s.wheelZ], on(['rear_axle']))
    + pair('front_wing', 'army_jeep_front_wing', origin, on(['tub']))
    + pair('rear_fender', 'army_jeep_rear_fender', origin, on(['tub']))
    + pair('side_rail', 'army_jeep_side_rail', origin, on(['tub']))
    + pair('front_seat', 'army_jeep_seat', [-0.26, s.floor, 0.3], on(['tub']))
    + pair('rear_seat', 'army_jeep_seat', [-0.86, s.floor, 0.3], on(['tub']))
    + pair('mirror', 'door_mirror', [s.cowl - 0.03, s.bonnetBack + 0.18, 0.62], on(['windscreen']))
    + pair('tail_lamp', 'tail_lamp_small', [s.rear - 0.02, 0.76, 0.5], on(['tub']))
    + pair('headlamp', 'headlamp_military', [s.nose + 0.06, 0.595, 0.27], on(['grille']))
    + kit.batteryBay('hatchback_battery_tray', [0.72, 0.72, -0.3], ['frame']),
  },
}
