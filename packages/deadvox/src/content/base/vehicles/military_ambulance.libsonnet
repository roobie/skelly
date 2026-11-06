// Items and blueprint for the army ambulance: the family chassis (`packages/thing-authoring-tool/vehicles/military-kit.libsonnet`) under a box body.
local kit = import '../vehicle-kit.libsonnet';
local part = kit.part;
local fitting = kit.fitting;
local pair = kit.pair;
local on = kit.on;
local origin = kit.origin;
local pile = kit.pileSize;
local m = import 'packages/thing-authoring-tool/vehicles/military-kit.libsonnet';
local s = import 'packages/thing-authoring-tool/vehicles/military_ambulance.spec.libsonnet';
local id = 'military_ambulance';
{
  items: m.truckItems(kit, id, 'Army ambulance', s) + [
    part(id + '_box_floor', 'Army ambulance box floor', pile, ['structure', 'load_floor']),
    part(id + '_box', 'Army ambulance box body', pile, ['structure', 'protection']),
    part(id + '_rear_door', 'Army ambulance rear door', pile, ['entry', 'protection']),
    part(id + '_rear_step', 'Army ambulance rear step', pile, ['structure']),
    part(id + '_stretcher_rack', 'Stretcher rack', pile, ['structure']),
  ],
  blueprint: {
    id: id,
    name: 'Army ambulance',
    fittings: m.truckFittings(kit, id, s) + [
      fitting('box_floor', id + '_box_floor', origin, ['chassis']),
      fitting('box', id + '_box', origin, ['box_floor']),
      fitting('rear_step', id + '_rear_step', origin, ['box']),
      fitting('beacon', 'beacon_blue', [0.08, s.boxTop + 0.05, 0], ['box']),
      kit.cargoSpace('aisle_cargo', [-1.7, s.deckTop, 0], [30, 10, 6], 'box_floor'),
    ]
    + pair('rear_door', id + '_rear_door', origin, on(['box']))
    + pair('stretcher_rack', id + '_stretcher_rack', origin, on(['box']))
    + pair('roof_marker', 'marker_lamp', [s.bedRear + 0.04, s.boxTop + 0.05, 1.1], on(['box']))
    + pair('roof_marker_front', 'marker_lamp', [s.bedFront - 0.04, s.boxTop + 0.05, 1.1], on(['box'])),
  },
}
