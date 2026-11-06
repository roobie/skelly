local kit = import '../vehicle-kit.libsonnet';
local part = kit.part;
local fitting = kit.fitting;
local pair = kit.pair;
local on = kit.on;
local origin = kit.origin;
local pile = kit.pileSize;
local s = import 'packages/thing-authoring-tool/vehicles/abandoned_ambulance.spec.libsonnet';
{
  items: [
    part('abandoned_ambulance_chassis', 'Rusted ambulance chassis', pile, ['structure']),
    part('abandoned_ambulance_cab', 'Faded ambulance cab', pile, ['structure', 'protection']),
    part('abandoned_ambulance_box', 'Faded ambulance box', pile, ['structure', 'protection']),
    part('abandoned_ambulance_bonnet', 'Sprung ambulance bonnet', pile, ['protection']),
    part('abandoned_ambulance_bumper', 'Sagging ambulance bumper', pile, ['structure']),
    part('abandoned_ambulance_lamp', 'Clouded ambulance headlamp', [4, 3], ['structure']),
    part('abandoned_ambulance_mirror', 'Dangling ambulance mirror', [4, 3], ['structure']),
    part('abandoned_ambulance_engine', 'Seized ambulance engine', pile, ['structure']),
    part('abandoned_ambulance_cab_door', 'Faded ambulance cab door', pile, ['protection']),
    part('abandoned_ambulance_cab_door_ajar', 'Sprung ambulance cab door', pile, ['protection']),
    part('abandoned_ambulance_sliding_door', 'Stuck ambulance sliding door', pile, ['protection']),
    part('abandoned_ambulance_rear_door_near', 'Hanging ambulance rear door', pile, ['protection']),
    part('abandoned_ambulance_rear_door_far', 'Sagging ambulance rear door', pile, ['protection']),
    part('abandoned_ambulance_stretcher', 'Broken stretcher frame', pile, ['structure']),
    part('abandoned_ambulance_seat', 'Ragged ambulance seat', [6, 6], ['structure']),
    part('abandoned_ambulance_beacon', 'Cracked ambulance beacon', [3, 3], ['structure']),
    part('abandoned_ambulance_wheel', 'Flat ambulance wheel', [6, 6], ['structure']),
  ],
  blueprint: {
    id: 'abandoned_ambulance',
    name: 'Abandoned ambulance',
    fittings: [
      fitting('chassis', 'abandoned_ambulance_chassis', origin, ['wheel_front_near', 'wheel_front_far', 'wheel_rear_near', 'wheel_rear_far']),
      fitting('cab', 'abandoned_ambulance_cab', origin, ['chassis']),
      fitting('box', 'abandoned_ambulance_box', origin, ['chassis']),
      fitting('bonnet', 'abandoned_ambulance_bonnet', origin, ['cab']),
      fitting('bumper', 'abandoned_ambulance_bumper', origin, ['cab']),
      fitting('lamp', 'abandoned_ambulance_lamp', origin, ['cab']),
      fitting('mirror', 'abandoned_ambulance_mirror', origin, ['cab']),
      fitting('engine', 'abandoned_ambulance_engine', origin, ['chassis']),
      fitting('cab_door_near', 'abandoned_ambulance_cab_door', origin, ['cab']),
      fitting('cab_door_far', 'abandoned_ambulance_cab_door_ajar', origin, ['cab']),
      fitting('sliding_door', 'abandoned_ambulance_sliding_door', origin, ['box']),
      fitting('rear_door_near', 'abandoned_ambulance_rear_door_near', origin, ['box']),
      fitting('rear_door_far', 'abandoned_ambulance_rear_door_far', origin, ['box']),
      fitting('stretcher', 'abandoned_ambulance_stretcher', origin, ['box']),
      fitting('beacon_front_far', 'abandoned_ambulance_beacon', [-0.2, s.boxRoof, -0.75], ['box']),
      fitting('beacon_rear_near', 'abandoned_ambulance_beacon', [-2.75, s.boxRoof, 0.75], ['box']),
      fitting('beacon_rear_far', 'abandoned_ambulance_beacon', [-2.75, s.boxRoof, -0.75], ['box']),
    ]
    + pair('seat', 'abandoned_ambulance_seat', [0.75, s.floor, 0.5], on(['cab']))
    + pair('wheel_front', 'abandoned_ambulance_wheel', [s.frontAxle, s.hubY, s.wheelZ], on())
    + pair('wheel_rear', 'abandoned_ambulance_wheel', [s.rearAxle, s.hubY, s.wheelZ], on()),
  },
}
