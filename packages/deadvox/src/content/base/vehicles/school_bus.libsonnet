// Items and blueprint for the school bus. Its panels and layout come from its spec through the bus body helper.
local kit = import '../vehicle-kit.libsonnet';
local bus = import 'packages/thing-authoring-tool/vehicles/bus-body.libsonnet';
local s = import 'packages/thing-authoring-tool/vehicles/school_bus.spec.libsonnet';
local fitting = kit.fitting;
local pair = kit.pair;
local on = kit.on;
local origin = kit.origin;
local headerX(y) = bus.layout(s).xf(y) + 0.03;
{
  items: bus.items(kit, 'school_bus', 'School bus', s) + [
    kit.part('school_bus_rear_door', 'School bus rear door', kit.pileSize, ['entry', 'glazing', 'protection']),
    kit.part('school_bus_stop_arm', 'Stop arm', [6, 5], []),
  ],
  blueprint: {
    id: 'school_bus',
    name: 'School bus',
    fittings: bus.fittings(kit, 'school_bus', s) + [
      fitting('rear_door', 'school_bus_rear_door', origin, ['shell']),
      fitting('stop_arm', 'school_bus_stop_arm', [2.95, 1.5, -s.side - 0.03], ['shell']),
    ]
    + pair('warning_red', 'tail_lamp_small', [headerX(2.66), 2.66, 0.98], on(['shell']))
    + pair('warning_amber', 'marker_lamp', [headerX(2.66), 2.7, 0.72], on(['shell']))
    + pair('warning_red_rear', 'tail_lamp_small', [s.rear - 0.03, 2.56, 0.98], on(['shell']))
    + pair('warning_amber_rear', 'marker_lamp', [s.rear - 0.02, 2.6, 0.72], on(['shell'])),
  },
}
