// Items and blueprint for the car transporter, two open decks and no cars. Its cab and chassis come from `packages/thing-authoring-tool/vehicles/truck-cab.libsonnet`.
local kit = import '../vehicle-kit.libsonnet';
local t = import 'packages/thing-authoring-tool/vehicles/truck-cab.libsonnet';
local s = t.spec(import 'packages/thing-authoring-tool/vehicles/car_transporter.spec.libsonnet');
local part = kit.part;
local fitting = kit.fitting;
local pair = kit.pair;
local on = kit.on;
local origin = kit.origin;
local pile = kit.pileSize;
local truck = 'car_transporter';
{
  items: t.items(kit, truck, 'Car transporter', s) + [
    part('car_transporter_lower_deck', 'Car transporter lower deck', pile, ['structure', 'load_floor']),
    part('car_transporter_upper_deck', 'Car transporter upper deck', pile, ['structure', 'load_floor']),
    part('car_transporter_head_rack', 'Car transporter head rack', pile, ['structure']),
    part('car_transporter_tail_slope', 'Car transporter tail slope', pile, ['structure']),
    part('car_transporter_deck_posts', 'Car transporter deck posts', pile, ['structure']),
    part('car_transporter_ramp', 'Car transporter loading ramp', pile, ['structure']),
    part('car_transporter_side_guard', 'Car transporter side guards', pile, ['structure']),
  ],
  blueprint: {
    id: truck,
    name: 'Car transporter',
    fittings: t.fittings(kit, truck, s) + [
      fitting('lower_deck', 'car_transporter_lower_deck', origin, ['chassis']),
      fitting('deck_posts', 'car_transporter_deck_posts', origin, ['lower_deck']),
      fitting('upper_deck', 'car_transporter_upper_deck', origin, ['deck_posts']),
      fitting('head_rack', 'car_transporter_head_rack', origin, ['upper_deck']),
      fitting('tail_slope', 'car_transporter_tail_slope', origin, ['upper_deck']),
      fitting('side_guard', 'car_transporter_side_guard', origin, ['lower_deck']),
      // The tail slope closes the rear of the lower deck, so its cargo stops short of it.
      kit.cargoSpace('lower_cargo', [-0.45, s.lowerTop, 0], [77, 15, 22], 'lower_deck'),
      // A cargo space must lie on one solid, so each wheel track carries its own.
      kit.cargoSpace('upper_cargo_near', [-0.45, s.upperTop, 0.8], [77, 15, 6], 'upper_deck'),
      kit.cargoSpace('upper_cargo_far', [-0.45, s.upperTop, -0.8], [77, 15, 6], 'upper_deck'),
    ] + pair('ramp', 'car_transporter_ramp', origin, on(['lower_deck'])),
  },
}
