// Items and blueprint for the semi tractor, parked without a trailer. Its cab and chassis come from `packages/thing-authoring-tool/vehicles/truck-cab.libsonnet`.
local kit = import '../vehicle-kit.libsonnet';
local t = import 'packages/thing-authoring-tool/vehicles/truck-cab.libsonnet';
local s = t.spec(import 'packages/thing-authoring-tool/vehicles/semi_tractor.spec.libsonnet');
local part = kit.part;
local fitting = kit.fitting;
local origin = kit.origin;
local pile = kit.pileSize;
local truck = 'semi_tractor';
{
  items: t.items(kit, truck, 'Semi tractor', s) + [
    part('semi_tractor_sleeper', 'Semi tractor sleeper', pile, ['protection', 'glazing']),
    part('semi_tractor_fairing', 'Semi tractor roof fairing', pile, ['protection']),
    part('semi_tractor_fifth_wheel', 'Semi tractor fifth wheel', pile, ['structure']),
    part('semi_tractor_stack', 'Semi tractor exhaust stacks', pile, []),
    part('semi_tractor_catwalk', 'Semi tractor catwalk', pile, []),
  ],
  blueprint: {
    id: truck,
    name: 'Semi tractor',
    fittings: [f for f in t.fittings(kit, truck, s) if f.id != 'exhaust'] + [
      fitting('sleeper', 'semi_tractor_sleeper', origin, ['cab']),
      fitting('fairing', 'semi_tractor_fairing', origin, ['sleeper', 'cab']),
      fitting('fifth_wheel', 'semi_tractor_fifth_wheel', origin, ['chassis']),
      fitting('stack', 'semi_tractor_stack', origin, ['chassis']),
      fitting('catwalk', 'semi_tractor_catwalk', origin, ['chassis']),
      fitting('fuel_tank_far', 'fuel_tank_truck', [s.tankX, s.tankY, -(s.side - 0.34)], ['chassis']),
    ],
  },
}
