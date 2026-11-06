// A mid-engined body: the engine sits behind a firewall under the rear screen, with its radiator and tank in the nose.
local kit = import '../vehicle-kit.libsonnet';
local s = import 'packages/thing-authoring-tool/vehicles/sports_car.spec.libsonnet';
local seatX = s.cowl - 0.55;
local wheel(x, z) = { part: 'sports_car_wheel', at: [x, s.hubHeight, z] };
local pile = kit.pileSize;
(import 'luxury_saloon.libsonnet').carOn('sports_car', 'Sports car', s, {
  drop: ['rear_bench'],
  over: {
    engine: { part: 'engine_v6_petrol', at: [-0.9, 0.3, 0] },
    gearbox: { at: [-1.4, 0.3, 0] },
    radiator: { part: 'radiator_small', at: [s.front - 0.32, 0.26, 0] },
    fuel_tank: { at: [s.frontAxle - 0.05, 0.24, 0] },
    exhaust: { at: [s.rear + 0.46, 0.13, 0.42] },
    rear_axle: { at: [s.rearAxle, s.hubHeight - 0.316, 0] },
    steering_wheel: { at: [s.cowl - 0.4, s.waist - 0.16, -0.37] },
    front_strut_near: { part: 'sports_car_wishbone', at: [s.frontAxle, s.hubHeight, s.wheelZ - 0.1] },
    front_strut_far: { part: 'sports_car_wishbone', at: [s.frontAxle, s.hubHeight, 0.1 - s.wheelZ] },
    front_wheel_near: wheel(s.frontAxle, s.wheelZ),
    front_wheel_far: wheel(s.frontAxle, 0 - s.wheelZ),
    rear_wheel_near: wheel(s.rearAxle, s.wheelZ),
    rear_wheel_far: wheel(s.rearAxle, 0 - s.wheelZ),
    front_seat_near: { part: 'sports_car_bucket_seat', at: [seatX, s.floor, 0.4] },
    front_seat_far: { part: 'sports_car_bucket_seat', at: [seatX, s.floor, -0.4] },
    headlamp_near: { at: [s.front - 0.07, 0.53, 0.66] },
    headlamp_far: { at: [s.front - 0.07, 0.53, -0.66] },
  },
  fittings: [
    kit.fitting('firewall', 'sports_car_firewall', kit.origin, ['shell']),
    kit.fitting('front_skirt', 'sports_car_front_skirt', kit.origin, ['shell']),
    kit.fitting('side_intake', 'sports_car_side_intake', kit.origin, ['shell']),
    kit.fitting('spoiler', 'sports_car_spoiler', kit.origin, ['boot_lid']),
  ],
  items: [
    kit.part('sports_car_wheel', 'Wheel 245/40 R18', [6, 6], ['wheel']),
    kit.part('sports_car_bucket_seat', 'Low bucket seat', [5, 10], ['seat']),
    kit.part('sports_car_wishbone', 'Double wishbone suspension', [6, 6], ['structure', 'steered']),
    kit.part('sports_car_firewall', 'Sports car firewall', pile, ['structure']),
    kit.part('sports_car_front_skirt', 'Sports car front skirt', pile, ['protection']),
    kit.part('sports_car_side_intake', 'Sports car side intakes', pile, ['protection']),
    kit.part('sports_car_spoiler', 'Sports car spoiler', pile, []),
  ],
})
