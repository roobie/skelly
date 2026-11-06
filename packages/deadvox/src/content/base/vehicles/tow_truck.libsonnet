// Items and blueprint for the tow truck, derived from the box truck with its box removed. Its added rows are in `packages/thing-authoring-tool/vehicles/tow_truck.libsonnet`.
local kit = import '../vehicle-kit.libsonnet';
local base = (import 'box_truck.libsonnet').blueprint;
local s = (import 'packages/thing-authoring-tool/vehicles/truck-cab.libsonnet').spec(import 'packages/thing-authoring-tool/vehicles/tow_truck.spec.libsonnet');
local part = kit.part;
local fitting = kit.fitting;
local pair = kit.pair;
local on = kit.on;
local origin = kit.origin;
local pile = kit.pileSize;
local boxFittings = ['box_floor', 'box_front', 'box_roof', 'box_cargo', 'box_side_near', 'box_side_far', 'rear_door_near', 'rear_door_far'];
{
  items: [
    part('tow_truck_deck', 'Tow truck deck', pile, ['structure']),
    part('tow_truck_locker', 'Tow truck side locker', pile, ['storage', 'protection']),
    part('tow_truck_cab_guard', 'Tow truck cab guard', pile, ['protection']),
    part('tow_truck_mast', 'Tow truck boom mast', pile, ['structure']),
    part('tow_truck_boom', 'Tow truck boom', pile, ['structure', 'lift']) + { vehicle+: { ratedLoadKg: 4000 } },
    part('tow_truck_boom_stage', 'Tow truck boom extension', pile, ['structure']),
    part('tow_truck_boom_ram', 'Tow truck boom ram', pile, []),
    part('tow_truck_winch', 'Tow truck winch', pile, []),
    part('tow_truck_line', 'Tow truck winch line', pile, []),
    part('tow_truck_sling', 'Tow truck sling', pile, []),
    part('tow_truck_stabiliser', 'Tow truck stabiliser leg', pile, ['structure', 'stabiliser']),
  ],
  blueprint: base + {
    id: 'tow_truck',
    name: 'Tow truck',
    fittings: [f for f in base.fittings if !std.member(boxFittings, f.id)] + [
      fitting('deck', 'tow_truck_deck', origin, ['chassis']),
      fitting('cab_guard', 'tow_truck_cab_guard', origin, ['deck']),
      fitting('mast', 'tow_truck_mast', origin, ['deck']),
      fitting('boom', 'tow_truck_boom', origin, ['mast']),
      fitting('boom_stage', 'tow_truck_boom_stage', origin, ['boom']),
      fitting('boom_ram', 'tow_truck_boom_ram', origin, ['deck', 'boom']),
      fitting('winch', 'tow_truck_winch', origin, ['deck']),
      fitting('line', 'tow_truck_line', origin, ['winch', 'boom_stage']),
      fitting('sling', 'tow_truck_sling', origin, ['boom_stage']),
    ] + pair('locker', 'tow_truck_locker', origin, on(['deck']))
    + pair('stabiliser', 'tow_truck_stabiliser', origin, on(['deck']))
    + pair('cab_beacon', 'beacon_amber', [s.face - s.lean - 0.6, s.roof + 0.15, 0.6], on(['cab'])),
  },
}
