// Items and blueprint for the army cargo truck: the family chassis (`packages/thing-authoring-tool/vehicles/military-kit.libsonnet`) under a tilted bed.
local kit = import '../vehicle-kit.libsonnet';
local part = kit.part;
local fitting = kit.fitting;
local origin = kit.origin;
local pile = kit.pileSize;
local m = import 'packages/thing-authoring-tool/vehicles/military-kit.libsonnet';
local s = import 'packages/thing-authoring-tool/vehicles/military_cargo_truck.spec.libsonnet';
local id = 'military_cargo_truck';
{
  items: m.truckItems(kit, id, 'Army truck', s) + [
    part(id + '_bed_floor', 'Army truck bed floor', pile, ['structure', 'load_floor']),
    part(id + '_bed', 'Army truck bed sides', pile, ['structure']),
    part(id + '_tailgate', 'Army truck tailgate', pile, ['entry', 'protection']),
    part(id + '_tilt', 'Canvas tilt', pile, ['protection']),
  ],
  blueprint: {
    id: id,
    name: 'Army cargo truck',
    fittings: m.truckFittings(kit, id, s) + [
      fitting('bed_floor', id + '_bed_floor', origin, ['chassis']),
      fitting('bed', id + '_bed', origin, ['bed_floor']),
      fitting('tailgate', id + '_tailgate', origin, ['bed_floor']),
      fitting('tilt', id + '_tilt', origin, ['bed_floor']),
      kit.cargoSpace('bed_cargo', [-1.6, s.deckTop, 0], [34, 12, 22], 'bed_floor'),
    ],
  },
}
