local k = import 'kit.libsonnet';
local box = k.box;
local s = import 'crew_pickup.spec.libsonnet';
local shape = (import 'car-shape.libsonnet')(s);
local finish = { paint: s.paint, trim: 'plastic-black' };
(import 'car-body.libsonnet')('crew_pickup', s) + [
  k.compound('crew_pickup_frame', 260, k.bothSides([
    box('rail', 'steel', [s.bedRear + 0.05, 0.42, 0.42], [s.frontAxle + 0.5, 0.58, 0.5]),
    box('tall_rear', 'steel', [s.bedRear + 0.1, 0.58, 0.44], [s.bedFront, s.bedFloorTop - 0.06, 0.48]),
  ]) + [
    box('cross_rear', 'steel', [s.bedRear + 0.05, 0.42, -0.42], [s.bedRear + 0.13, 0.58, 0.42]),
    box('cross_mid', 'steel', [-1.0, 0.42, -0.42], [-0.92, 0.58, 0.42]),
    box('cross_front', 'steel', [s.frontAxle + 0.4, 0.42, -0.42], [s.frontAxle + 0.5, 0.58, 0.42]),
  ], { steel: 'paint-charcoal' }),
  k.compound('crew_pickup_bed_floor', 45, [
    box('floor', 'paint', [s.bedRear, s.bedFloorTop - 0.05, -s.bedInner], [s.bedFront, s.bedFloorTop, s.bedInner]),
  ], finish),
  k.compound('crew_pickup_bed_front', 22, [
    box('wall', 'paint', [s.bedFront - 0.04, s.bedFloorTop, -s.bedInner], [s.bedFront, s.bedSideTop, s.bedInner]),
  ], finish),
  k.compound('crew_pickup_bed_side', 42, [
    box('rear', 'paint', [s.bedRear, s.bedSideBottom, s.bedInner], [s.rearAxle - s.arch, s.bedSideTop, s.side]),
    box('over_arch', 'paint', [s.rearAxle - s.arch, s.archTop, s.bedInner], [s.rearAxle + s.arch, s.bedSideTop, s.side]),
    box('fore', 'paint', [s.rearAxle + s.arch, s.bedSideBottom, s.bedInner], [s.bedFront, s.bedSideTop, s.side]),
    box('rear_post', 'paint', [s.bedRear - 0.03125, s.bedSideBottom, s.tailgateHalf], [s.bedRear + 0.09375, s.bedSideTop, s.bedInner]),
    box('rail', 'trim', [s.bedRear, s.bedSideTop, s.bedInner - 0.03], [s.bedFront, s.bedSideTop + 0.03, s.side + 0.01]),
    box('tub', 'paint', [s.rearAxle - s.arch, s.bedFloorTop, s.tubInner], [s.rearAxle + s.arch, s.archTop + 0.16, s.bedInner]),
    shape.aftCorner('corner_aft', 'paint', s.rearAxle, [s.bedInner, s.side]),
    shape.foreCorner('corner_fore', 'paint', s.rearAxle, [s.bedInner, s.side]),
  ] + shape.liner('liner', 'trim', s.rearAxle, s.bedSideBottom, [s.tubInner, s.bedInner], [s.tubInner, s.tubInner + 0.04]), finish),
  k.compound('crew_pickup_bed_tailgate', 24, [
    box('skin', 'paint', [s.bedRear - 0.05, s.bedFloorTop - 0.03, -s.tailgateHalf], [s.bedRear - 0.01, s.bedSideTop, s.tailgateHalf]),
    box('handle', 'trim', [s.bedRear - 0.06, s.bedSideTop - 0.12, -0.12], [s.bedRear - 0.05, s.bedSideTop - 0.07, 0.12]),
  ], finish, { hinge_a: ['skin', [0, 0, 1]], hinge_b: ['skin', [0, 0, 0]] }),
  k.compound('crew_pickup_rear_bumper', 16, [
    box('bar', 'steel', [s.bedRear - 0.12, 0.5, -s.side + 0.02], [s.bedRear, 0.72, s.side - 0.02]),
  ], { steel: 'steel-bright' }),
]
