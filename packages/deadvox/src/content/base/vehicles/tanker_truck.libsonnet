// Items and blueprint for the tanker truck. Its cab and chassis come from `packages/thing-authoring-tool/vehicles/truck-cab.libsonnet`.
local kit = import '../vehicle-kit.libsonnet';
local t = import 'packages/thing-authoring-tool/vehicles/truck-cab.libsonnet';
local s = import 'packages/thing-authoring-tool/vehicles/tanker_truck.spec.libsonnet';
local part = kit.part;
local fitting = kit.fitting;
local origin = kit.origin;
local pile = kit.pileSize;
local truck = 'tanker_truck';
{
  items: t.items(kit, truck, 'Tanker truck', s) + [
    part('tanker_truck_barrel', 'Tanker truck barrel', pile, ['storage', 'structure']),
    part('tanker_truck_saddle', 'Tanker truck barrel saddles', pile, ['structure']),
    part('tanker_truck_walkway', 'Tanker truck walkway', pile, []),
    part('tanker_truck_ladder', 'Tanker truck ladder', pile, []),
    part('tanker_truck_valve_gear', 'Tanker truck valve gear', pile, []),
  ],
  blueprint: {
    id: truck,
    name: 'Tanker truck',
    fittings: t.fittings(kit, truck, s) + [
      fitting('saddle', 'tanker_truck_saddle', origin, ['chassis']),
      fitting('barrel', 'tanker_truck_barrel', origin, ['saddle']),
      fitting('walkway', 'tanker_truck_walkway', origin, ['barrel']),
      fitting('ladder', 'tanker_truck_ladder', origin, ['barrel', 'chassis']),
      fitting('valve_gear', 'tanker_truck_valve_gear', origin, ['barrel', 'chassis']),
    ],
  },
}
