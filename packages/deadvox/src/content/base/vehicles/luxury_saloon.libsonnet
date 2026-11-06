// Items and blueprint for the long-wheelbase saloon. `carOn` lays out any body from `car-body.libsonnet` from its spec,
// with no repeated fitting list; it lives here because every other file in this folder is indexed as a vehicle.
local kit = import '../vehicle-kit.libsonnet';
local part = kit.part;
local fitting = kit.fitting;
local pair = kit.pair;
local on = kit.on;
local origin = kit.origin;
local pile = kit.pileSize;
local s = import 'packages/thing-authoring-tool/vehicles/luxury_saloon.spec.libsonnet';
// Hub height and width of each road wheel a spec's `tyre` may name, which set where the wheels and their axles sit.
local tyres = {
  wheel_205_55r16: { hub: 0.316, width: 0.21 },
  wheel_225_60r17: { hub: 0.351, width: 0.225 },
};
// `o.over` merges fields into a fitting by id, `o.drop` removes fittings and `o.items` and `o.fittings` add them.
local carOn(id, name, s, o={}) =
  local boot = std.get(s, 'boot', false);
  local twoDoor = std.get(s, 'twoDoor', false);
  local door(suffix, label) = part(id + suffix, name + label, pile, ['entry', 'glazing', 'protection']);
  local over = std.get(o, 'over', {});
  local drop = std.get(o, 'drop', []);
  local tyre = std.get(s, 'tyre', 'wheel_205_55r16');
  local hub = tyres[tyre].hub;
  local wheelZ = s.side - tyres[tyre].width / 2;
  local fittings = [
    fitting('shell', id + '_shell', origin),
    fitting('windscreen', id + '_windscreen', origin, ['shell']),
    if boot then fitting('boot_lid', id + '_boot_lid', origin, ['shell']) else fitting('tailgate', id + '_tailgate', origin, ['shell']),
    fitting('bonnet', id + '_bonnet', origin, ['shell']),
    fitting('front_bumper', id + '_front_bumper', origin, ['shell']),
    fitting('rear_bumper', id + '_rear_bumper', origin, ['shell']),
    fitting('dashboard', id + '_dashboard', origin, ['shell']),
    fitting('engine', 'engine_i4_petrol', [s.frontAxle - 0.02, 0.28, 0], ['shell']),
    fitting('gearbox', 'gearbox_transaxle', [s.frontAxle - 0.02, 0.3, -0.36], ['engine']),
    fitting('radiator', 'radiator_car', [s.front - 0.3, 0.32, 0], ['shell']),
    fitting('fuel_tank', 'fuel_tank_car', [s.rearAxle + 0.65, s.sill, 0], ['shell']),
    fitting('exhaust', 'exhaust_car', [s.rear + 0.46, 0.2, 0.42], ['engine', 'shell']),
    fitting('rear_axle', 'twist_beam', [s.rearAxle, hub - 0.316, 0], ['shell']),
    fitting('steering_wheel', 'steering_wheel', [s.cowl - 0.4, s.waist - 0.2, -0.37], ['dashboard']),
    fitting('gear_lever', 'gear_lever', [s.cowl - 0.4, 0.55, 0], ['dashboard']),
    fitting('rear_bench', 'bench_seat_3', [-0.55, s.floor, 0], ['shell']),
  ]
  + pair('front_wing', id + '_front_wing', origin, on(['shell']))
  + pair('front_door', id + '_front_door', origin, on(['shell']))
  + (if twoDoor then [] else pair('rear_door', id + '_rear_door', origin, on(['shell'])))
  + pair('tail_lamp', id + '_tail_lamp', origin, on(['shell']))
  + pair('front_strut', 'front_strut', [s.frontAxle, hub - 0.036, wheelZ - 0.05], on(['shell']))
  + pair('front_wheel', tyre, [s.frontAxle, hub, wheelZ], on(paired=['front_strut']))
  + pair('rear_wheel', tyre, [s.rearAxle, hub, wheelZ], on(['rear_axle']))
  + pair('front_seat', 'front_seat', [0.05, s.floor, 0.37], on(['shell']))
  + pair('door_mirror', 'door_mirror', [s.cowl - 0.04, s.waist, s.side - 0.03], on(['shell']))
  + kit.headlamps(s.front - 0.07, 0.66, 0.62, ['front_bumper'])
  + kit.batteryBay('hatchback_battery_tray', [s.aPost + 0.25, 0.5, -0.44], ['shell']);
  {
    items: [
      part(id + '_shell', name + ' body shell', pile, ['structure', 'protection', 'storage']),
      part(id + '_windscreen', name + ' windscreen', pile, ['glazing']),
      if boot then part(id + '_boot_lid', name + ' boot lid', pile, ['entry', 'protection'])
      else part(id + '_tailgate', name + ' tailgate', pile, ['entry', 'glazing']),
      part(id + '_bonnet', name + ' bonnet', pile, ['protection']),
      part(id + '_front_wing', name + ' front wing', pile, ['protection']),
      part(id + '_front_bumper', name + ' front bumper', pile, ['protection']),
      part(id + '_rear_bumper', name + ' rear bumper', pile, ['protection']),
      part(id + '_tail_lamp', name + ' tail lamp', [3, 3], ['light']),
      part(id + '_dashboard', name + ' dashboard', pile, ['structure']),
      door('_front_door', ' front door'),
    ] + (if twoDoor then [] else [door('_rear_door', ' rear door')]) + std.get(o, 'items', []),
    blueprint: {
      id: id,
      name: name,
      fittings: [f + std.get(over, f.id, {}) for f in fittings if !std.member(drop, f.id)] + std.get(o, 'fittings', []),
    },
  };
carOn('luxury_saloon', 'Luxury saloon', s, {
  over: {
    engine: { part: 'engine_v8_petrol' },
    gearbox: { part: 'gearbox_inline', at: [s.frontAxle - 0.7, 0.26, 0] },
    rear_bench: { at: [-0.75, s.floor, 0] },
  },
  fittings: [
    fitting('grille', 'luxury_saloon_grille', origin, ['bonnet']),
    fitting('brightwork', 'luxury_saloon_brightwork', origin, ['shell']),
  ],
  items: [
    part('luxury_saloon_grille', 'Luxury saloon grille', pile, ['protection']),
    part('luxury_saloon_brightwork', 'Luxury saloon brightwork', pile, []),
  ],
}) + { carOn:: carOn }
