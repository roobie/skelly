// Items and blueprint for the ambulance; its panels fit at the origin (`packages/thing-authoring-tool/vehicles/van-body.libsonnet`).
local kit = import '../vehicle-kit.libsonnet';
local van = import 'packages/thing-authoring-tool/vehicles/van-body.libsonnet';
local s = import 'packages/thing-authoring-tool/vehicles/ambulance.spec.libsonnet';
local tail = van.tail(s);
{
  items: van.items(kit, 'ambulance', 'Ambulance', s) + [
    kit.part('ambulance_locker', 'Ambulance locker', kit.pileSize, ['storage']),
    kit.part('ambulance_markings', 'Ambulance side markings', kit.pileSize, []),
    kit.part('ambulance_door_markings', 'Ambulance door markings', kit.pileSize, []),
    kit.part('ambulance_rear_markings', 'Ambulance rear markings', kit.pileSize, []),
  ],
  blueprint: {
    id: 'ambulance',
    name: 'Ambulance',
    fittings: van.fittings(kit, 'ambulance', s) + [
      kit.fitting('locker', 'ambulance_locker', kit.origin, ['load_floor']),
      // In from the rear doors between the locker and the near wall, the attendant at its head.
      kit.fitting('stretcher', 'stretcher', [-1.8, s.box.floor, 0.1], ['load_floor']),
      kit.fitting('attendant_seat', 'attendant_seat', [-0.55, s.box.floor, -0.35], ['load_floor']),
      kit.fitting('light_bar', 'light_bar_blue', [0.3, s.roof, 0], ['shell']),
      kit.fitting('rear_step', 'rear_step_tread', [s.rear + 0.12, 0.6, 0], ['rear_bumper']),
      kit.fitting('markings', 'ambulance_markings', kit.origin, ['box']),
      kit.fitting('door_markings', 'ambulance_door_markings', kit.origin, ['side_door']),
    ]
    + kit.pair('rear_markings', 'ambulance_rear_markings', kit.origin, kit.on(paired=['rear_door']))
    + kit.pair('box_beacon_rear', 'beacon_blue', [tail + 0.25, s.box.roof, 0.75], kit.on(['box'])),
  },
}
