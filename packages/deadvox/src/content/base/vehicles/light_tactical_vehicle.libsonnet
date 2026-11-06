// Items and blueprint for the light tactical vehicle. Its panels fit at the origin; everything else is placed by its own frame.
local kit = import '../vehicle-kit.libsonnet';
local part = kit.part;
local fitting = kit.fitting;
local pair = kit.pair;
local on = kit.on;
local origin = kit.origin;
local pile = kit.pileSize;
local s = import 'packages/thing-authoring-tool/vehicles/light_tactical_vehicle.spec.libsonnet';
local id = 'light_tactical_vehicle';
local name = 'Light tactical vehicle';
local wheel = id + '_wheel';
{
  items: [
    part(wheel, name + ' wheel', [6, 6], ['wheel']) + { vehicle+: { mount: wheel } },
    part(id + '_portal_axle', name + ' portal axle', [12, 4], ['structure', 'driven']),
    part(id + '_rear_prop_shaft', name + ' rear prop shaft', [12, 2], ['driven']),
    part(id + '_frame', name + ' frame', pile, ['structure']),
    part(id + '_hull', name + ' hull', pile, ['structure', 'protection']),
    part(id + '_bed_floor', name + ' cargo floor', pile, ['structure', 'load_floor']),
    part(id + '_tailgate', name + ' tailgate', pile, ['protection']),
    part(id + '_bonnet', name + ' bonnet', pile, ['protection']),
    part(id + '_grille', name + ' grille', pile, ['protection']),
    part(id + '_headlamp', name + ' headlamp', [3, 3], ['light', 'glazing']),
    part(id + '_brush_guard', name + ' brush guard', pile, ['protection']),
    part(id + '_front_door', name + ' front door', pile, ['entry', 'glazing', 'protection']),
    part(id + '_rear_door', name + ' rear door', pile, ['entry', 'glazing', 'protection']),
    part(id + '_windscreen', name + ' windscreen', pile, ['glazing']),
    part(id + '_dashboard', name + ' dashboard', pile, ['structure']),
    part(id + '_roof_hatch', name + ' roof hatch', pile, ['protection']),
    part(id + '_steering_box', name + ' steering box', [5, 3], ['steered']),
  ],
  blueprint: {
    id: id,
    name: name,
    fittings: [
      fitting('frame', id + '_frame', origin),
      fitting('hull', id + '_hull', origin, ['frame']),
      fitting('bonnet', id + '_bonnet', origin, ['hull']),
      fitting('grille', id + '_grille', origin, ['bonnet']),
      fitting('brush_guard', id + '_brush_guard', origin, ['frame']),
      fitting('bed_floor', id + '_bed_floor', origin, ['frame']),
      fitting('tailgate', id + '_tailgate', origin, ['hull']),
      fitting('windscreen', id + '_windscreen', origin, ['hull']),
      fitting('dashboard', id + '_dashboard', origin, ['hull']),
      fitting('roof_hatch', id + '_roof_hatch', origin, ['hull']),
      fitting('steering_box', id + '_steering_box', origin, ['frame']),
      fitting('front_axle', id + '_portal_axle', [s.frontAxle, 0, 0], ['frame']),
      fitting('rear_axle', id + '_portal_axle', [s.rearAxle, 0, 0], ['frame']),
      fitting('engine', 'engine_i6_diesel', [1.38, 0.5, 0], ['frame']),
      fitting('gearbox', 'gearbox_truck', [0.59, 0.58, 0], ['engine']),
      fitting('rear_prop_shaft', id + '_rear_prop_shaft', [-0.72, 0.54, 0], ['gearbox', 'rear_axle']),
      fitting('front_prop_shaft', 'prop_shaft_short', [1.02, 0.55, 0.2], ['gearbox', 'front_axle']),
      fitting('radiator', 'radiator_van', [2.02, 0.62, 0], ['frame']),
      fitting('fuel_tank', 'fuel_tank_car', [-2.0, 0.62, 0], ['frame']),
      fitting('exhaust', 'exhaust_military', [-1.1, 0.52, 0.3], ['engine', 'frame']),
      fitting('steering_wheel', 'steering_wheel', [0.5, 1.32, -s.seatZ], ['dashboard']),
      fitting('gear_lever', 'gear_lever', [0.3, 1.0, 0], ['hull']),
      kit.cargoSpace('cargo', [-1.7, s.bedTop, 0], [8, 5, 14], 'bed_floor'),
    ]
    + pair('front_wheel', wheel, [s.frontAxle, s.hub, s.wheelZ], on(['front_axle']))
    + pair('rear_wheel', wheel, [s.rearAxle, s.hub, s.wheelZ], on(['rear_axle']))
    + pair('front_door', id + '_front_door', origin, on(['hull']))
    + pair('rear_door', id + '_rear_door', origin, on(['hull']))
    + pair('front_seat', 'front_seat', [0.24, s.floor, s.seatZ], on(['hull']))
    + pair('rear_seat', 'front_seat', [-0.6, s.floor, s.seatZ], on(['hull']))
    + pair('mirror', 'door_mirror', [s.topFront, s.waist + 0.04, s.upperSkin], on(['hull']))
    + pair('headlamp', id + '_headlamp', [s.nose, 0.86, 0.72], on(['bonnet']))
    + pair('side_lamp', 'marker_lamp', [s.nose + 0.02, 0.8, 0.94], on(['bonnet']))
    + pair('tail_lamp', 'tail_lamp_small', [s.rear, 0.92, 0.88], on(['hull']))
    + kit.batteryBay('truck_battery_tray', [1.25, 0.9, -0.5], ['hull']),
  },
}
