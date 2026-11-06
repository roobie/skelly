local k = import 'kit.libsonnet';
local s = import 'coach.spec.libsonnet';
(import 'bus-body.libsonnet').rows('coach', s) + [
  k.compound('coach_hold_floor', 180, [
    k.box('deck', 'floor', [s.hold.rear, s.hold.y - 0.06, -s.skin], [s.hold.front, s.hold.y, s.skin]),
  ], { floor: 'plastic-charcoal' }),
  // Lifts on its top edge, so the skin reads as a door against the skirt.
  k.compound('coach_luggage_door', 32, [
    k.box('seam', 'seam', [-0.75, 0, -0.006], [0.75, 0.69, 0.004]),
    k.box('skin', 'skin', [-0.73, 0.02, 0], [0.73, 0.67, 0.016]),
    k.box('handle', 'seam', [-0.1, 0.1, 0.016], [0.1, 0.14, 0.028]),
  ], { seam: 'plastic-black', skin: s.band }),
  k.compound('coach_parcel_rack', 26, [
    k.box('shelf', 'rack', [-4.6, 0, -0.17], [4.6, 0.04, 0.17]),
    k.box('lip', 'rack', [-4.6, 0, -0.2], [4.6, 0.1, -0.17]),
  ], { rack: 'plastic-grey' }),
]
