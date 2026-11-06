// Items and blueprint for the golf cart. Its pressings fit at the origin (`packages/thing-authoring-tool/vehicles/golf_cart.libsonnet`).
local kit = import '../vehicle-kit.libsonnet';
local part = kit.part;
local fitting = kit.fitting;
local pair = kit.pair;
local on = kit.on;
local origin = kit.origin;
local pile = kit.pileSize;
local s = import 'packages/thing-authoring-tool/vehicles/golf_cart.spec.libsonnet';
{
  items: [
    part('golf_cart_frame', 'Golf cart frame', pile, ['structure']),
    part('golf_cart_front_cowl', 'Golf cart front cowl', pile, ['protection']),
    part('golf_cart_rear_body', 'Golf cart rear body', pile, ['protection', 'structure']),
    part('golf_cart_canopy', 'Golf cart canopy', pile, ['protection', 'structure']),
    part('golf_cart_windscreen', 'Golf cart windscreen', pile, ['glazing']),
    part('golf_cart_bag_rack', 'Golf cart bag rack', [10, 6], ['structure']),
    part('golf_cart_front_axle', 'Golf cart front axle', pile, ['structure', 'steered']),
    part('golf_cart_rear_axle', 'Golf cart rear axle', pile, ['structure', 'driven']),
    part('golf_cart_steering_column', 'Golf cart steering column', [4, 2], ['structure']),
    part('golf_cart_step', 'Golf cart side step', [8, 2], ['entry', 'structure']),
  ],
  blueprint: {
    id: 'golf_cart',
    name: 'Golf cart',
    fittings: [
      fitting('frame', 'golf_cart_frame', origin),
      fitting('front_cowl', 'golf_cart_front_cowl', origin, ['frame']),
      fitting('rear_body', 'golf_cart_rear_body', origin, ['frame']),
      fitting('canopy', 'golf_cart_canopy', origin, ['front_cowl', 'rear_body']),
      fitting('windscreen', 'golf_cart_windscreen', origin, ['canopy']),
      fitting('bag_rack', 'golf_cart_bag_rack', origin, ['rear_body']),
      fitting('front_axle', 'golf_cart_front_axle', origin, ['frame']),
      fitting('rear_axle', 'golf_cart_rear_axle', origin, ['frame']),
      fitting('motor', 'traction_motor_light', [s.rearAxle + 0.2, s.hub, 0], ['rear_axle']),
      fitting('inverter', 'inverter_car', [-0.72, 0.42, 0], ['rear_body']),
      fitting('pack', 'traction_pack_light', [-0.23, s.floor, 0], ['rear_body']),
      fitting('charge_port', 'charge_port', [-0.2, 0.37, s.side], ['rear_body']),
      fitting('seat', 'bench_seat_low', [-0.2, 0.6, 0], ['rear_body']),
      fitting('steering_column', 'golf_cart_steering_column', origin, ['front_cowl']),
      fitting('steering_wheel', 'steering_wheel_raked', [0.38, 1.1, -0.22], ['steering_column']),
    ]
    + pair('step', 'golf_cart_step', origin, on(['frame']))
    + pair('front_wheel', 'wheel_145r10', [s.frontAxle, s.hub, s.wheelZ], on(['front_axle']))
    + pair('rear_wheel', 'wheel_145r10', [s.rearAxle, s.hub, s.wheelZ], on(['rear_axle']))
    + pair('tail_lamp', 'tail_lamp_small', [s.tail - 0.03, 0.4, 0.32], on(['rear_body']))
    + kit.headlamps(s.nose + 0.03, 0.42, 0.3, ['front_cowl']),
  },
}
