// Items and blueprint for the coach. Its panels and layout come from its spec through the bus body helper.
local kit = import '../vehicle-kit.libsonnet';
local bus = import 'packages/thing-authoring-tool/vehicles/bus-body.libsonnet';
local s = import 'packages/thing-authoring-tool/vehicles/coach.spec.libsonnet';
local fitting = kit.fitting;
local pair = kit.pair;
local on = kit.on;
local origin = kit.origin;
{
  items: bus.items(kit, 'coach', 'Coach', s) + [
    kit.part('coach_hold_floor', 'Coach luggage hold floor', kit.pileSize, ['load_floor', 'structure']),
    kit.part('coach_luggage_door', 'Coach luggage door', kit.pileSize, ['storage', 'protection']),
    kit.part('coach_parcel_rack', 'Coach parcel rack', kit.pileSize, ['storage']),
  ],
  blueprint: {
    id: 'coach',
    name: 'Coach',
    fittings: bus.fittings(kit, 'coach', s) + [
      fitting('hold_floor', 'coach_hold_floor', origin, ['shell']),
      kit.cargoSpace('hold_cargo', [0.1, s.hold.y, 0], [46, 8, 22], 'hold_floor'),
    ]
    + std.flattenArrays([
      pair('luggage_door_' + i, 'coach_luggage_door', [s.luggageDoors[i], 0.48, s.side], on(['shell']))
      for i in std.range(0, std.length(s.luggageDoors) - 1)
    ])
    + [fitting('roof_vent_' + i, 'roof_vent', [[2.0, -2.5][i], s.roof, 0], ['shell']) for i in [0, 1]]
    + pair('parcel_rack', 'coach_parcel_rack', [-0.65, 2.78, 0.98], on(['shell'])),
  },
}
