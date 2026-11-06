local k = import 'kit.libsonnet';
local box = k.box;
local s = import 'suv.spec.libsonnet';
local shape = (import 'car-shape.libsonnet')(s);
local flare(id, axle) = shape.flare(id, 'trim', axle, s.sill, [s.side - 0.01, s.side + 0.03], 0.06, 0.02);
local body = import 'car-body.libsonnet';
body('suv', s) + [
  // The hybrid's nose: this file is what the thing tool indexes for a vehicle derived from this one.
  row
  for row in body('hybrid_suv', s + { grilleShut: 0.45, noseAccent: 'plastic-green' })
  if row.id == 'hybrid_suv_front_bumper'
] + [
  k.compound('suv_arch_flare', 3, flare('front_flare', s.frontAxle) + flare('rear_flare', s.rearAxle), { trim: 'plastic-black' }),
  k.compound('suv_side_step', 9, [
    box('step', 'steel', [s.rearDoorArch, 0.33, s.side - 0.1], [s.aPost - 0.1, 0.37, s.side + 0.03]),
  ], { steel: 'steel-stainless' }),
  k.compound('suv_roof_rails', 6, k.bothSides([
    box('rail', 'steel', [s.tailWaist + 0.2, s.roof + 0.08, 0.6], [s.aPost - s.aLean - 0.1, s.roof + 0.12, 0.65]),
    box('foot_rear', 'steel', [s.tailWaist + 0.2, s.roof + 0.04, 0.6], [s.tailWaist + 0.3, s.roof + 0.08, 0.65]),
    box('foot_front', 'steel', [s.aPost - s.aLean - 0.2, s.roof + 0.04, 0.6], [s.aPost - s.aLean - 0.1, s.roof + 0.08, 0.65]),
  ]), { steel: 'steel-stainless' }),
]
