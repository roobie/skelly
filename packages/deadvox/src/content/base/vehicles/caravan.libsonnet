// Items and blueprint for the caravan. Its panels fit at the origin (`packages/thing-authoring-tool/vehicles/caravan.libsonnet`);
// everything else is a shared part placed by its own frame.
local kit = import '../vehicle-kit.libsonnet';
local part = kit.part;
local fitting = kit.fitting;
local pair = kit.pair;
local on = kit.on;
local origin = kit.origin;
local pile = kit.pileSize;
local s = import 'packages/thing-authoring-tool/vehicles/caravan.spec.libsonnet';
local windowY = s.windowLow;
local sideZ = 0;
{
  items: [
    part('caravan_chassis', 'Caravan chassis', pile, ['structure']),
    part('caravan_floor', 'Caravan floor', pile, ['structure']),
    part('caravan_wall_door', 'Caravan door-side wall', pile, ['structure', 'protection']),
    part('caravan_wall_plain', 'Caravan wall', pile, ['structure', 'protection']),
    part('caravan_door', 'Caravan door', pile, ['entry', 'glazing', 'protection']),
    part('caravan_window_small', 'Small caravan window', [7, 6], ['glazing']),
    part('caravan_window_large', 'Large caravan window', pile, ['glazing']),
    part('caravan_roof', 'Caravan roof', pile, ['protection']),
    part('caravan_nose_cap', 'Caravan nose', pile, ['protection']),
    part('caravan_tail_cap', 'Caravan tail', pile, ['protection']),
    part('caravan_front_window', 'Caravan front window', pile, ['glazing']),
    part('caravan_rear_window', 'Caravan rear window', pile, ['glazing']),
    part('caravan_gas_locker', 'Gas locker', pile, ['storage']),
    part('caravan_furniture', 'Caravan fittings', pile, ['storage']),
    part('caravan_steady', 'Corner steady', [2, 6], ['structure', 'stabiliser']),
  ],
  blueprint: {
    id: 'caravan',
    name: 'Caravan',
    fittings: [
      fitting('chassis', 'caravan_chassis', origin),
      fitting('floor', 'caravan_floor', origin, ['chassis']),
      fitting('wall_door', 'caravan_wall_door', origin, ['floor']),
      fitting('wall_plain', 'caravan_wall_plain', origin, ['floor']),
      fitting('door', 'caravan_door', origin, ['wall_door']),
      fitting('roof', 'caravan_roof', origin, ['wall_door', 'wall_plain']),
      fitting('nose_cap', 'caravan_nose_cap', origin, ['floor']),
      fitting('tail_cap', 'caravan_tail_cap', origin, ['floor']),
      fitting('front_window', 'caravan_front_window', origin, ['nose_cap']),
      fitting('rear_window', 'caravan_rear_window', origin, ['tail_cap']),
      fitting('gas_locker', 'caravan_gas_locker', origin, ['chassis']),
      fitting('furniture', 'caravan_furniture', origin, ['floor']),
      fitting('roof_vent', 'roof_vent', [0.6, s.roof, 0], ['roof']),
      fitting('roof_vent_rear', 'roof_vent', [-1.4, s.roof, 0], ['roof']),
      fitting('window_near_rear', 'caravan_window_small', [s.smallRear + s.smallWindow / 2, windowY, sideZ], ['wall_door']),
      fitting('window_near_front', 'caravan_window_large', [s.largeFront + s.largeWindow / 2, windowY, sideZ], ['wall_door']),
      fitting('window_far_rear', 'caravan_window_large', [s.farRear + s.largeWindow / 2, windowY, sideZ], ['wall_plain']) + { mirror: true },
      fitting('window_far_front', 'caravan_window_large', [s.largeFront + s.largeWindow / 2, windowY, sideZ], ['wall_plain']) + { mirror: true },
      fitting('axle', 'trailer_axle_van', [s.axle, s.hub - 0.37, 0], ['chassis']),
      fitting('coupling', 'trailer_coupling', [s.tip, s.drawLow, 0], ['chassis']),
      fitting('jockey_wheel', 'trailer_jockey_wheel', [s.tip - 0.42, 0, 0.17], ['chassis']),
    ]
    + pair('wheel', 'wheel_235_75r15', [s.axle, s.hub, s.wheelZ], on(['axle']))
    + pair('steady_rear', 'caravan_steady', [s.rear + 0.25, 0, 0.6], on(['chassis']))
    + pair('steady_front', 'caravan_steady', [s.front + 0.1, 0, 0.6], on(['chassis']))
    + pair('tail_lamp', 'tail_lamp_small', [s.rear - 0.17, 0.62, 0.86], on(['tail_cap']))
    + pair('rear_indicator', 'marker_lamp', [s.rear - 0.17, 0.78, 0.86], on(['tail_cap']))
    + pair('marker', 'marker_lamp', [s.front + 0.14, 2.14, 0.95], on(['nose_cap'])),
  },
}
