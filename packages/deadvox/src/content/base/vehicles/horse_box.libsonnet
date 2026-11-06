// Items and blueprint for the horse box. Its panels fit at the origin (`packages/thing-authoring-tool/vehicles/horse_box.libsonnet`);
// everything else is a shared part placed by its own frame.
local kit = import '../vehicle-kit.libsonnet';
local part = kit.part;
local fitting = kit.fitting;
local pair = kit.pair;
local on = kit.on;
local origin = kit.origin;
local pile = kit.pileSize;
local s = import 'packages/thing-authoring-tool/vehicles/horse_box.spec.libsonnet';
local axleIds = std.range(0, std.length(s.axles) - 1);
{
  items: [
    part('horse_box_chassis', 'Horse box chassis', pile, ['structure']),
    part('horse_box_floor', 'Horse box floor', pile, ['structure', 'load_floor']),
    part('horse_box_wall_door', 'Horse box door-side wall', pile, ['structure', 'protection']),
    part('horse_box_wall_plain', 'Horse box wall', pile, ['structure', 'protection']),
    part('horse_box_door', 'Horse box groom door', pile, ['entry', 'protection']),
    part('horse_box_vent', 'Horse box louvred vent', [6, 3], ['protection']),
    part('horse_box_roof', 'Horse box roof', pile, ['protection']),
    part('horse_box_nose', 'Horse box nose', pile, ['protection']),
    part('horse_box_ramp', 'Horse box ramp', pile, ['entry', 'protection']),
    part('horse_box_top_door', 'Horse box top door', pile, ['protection']),
    part('horse_box_partition', 'Horse box partition', pile, ['structure']),
    part('horse_box_breast_bar', 'Horse box breast bar', pile, ['structure']),
    part('horse_box_mudguard', 'Horse box mudguard', pile, ['protection']),
  ],
  blueprint: {
    id: 'horse_box',
    name: 'Horse box',
    fittings: [
      fitting('chassis', 'horse_box_chassis', origin),
      fitting('floor', 'horse_box_floor', origin, ['chassis']),
      fitting('wall_door', 'horse_box_wall_door', origin, ['floor']),
      fitting('wall_plain', 'horse_box_wall_plain', origin, ['floor']),
      fitting('door', 'horse_box_door', origin, ['wall_door']),
      fitting('roof', 'horse_box_roof', origin, ['wall_door', 'wall_plain']),
      fitting('nose', 'horse_box_nose', origin, ['floor']),
      fitting('ramp', 'horse_box_ramp', origin, ['floor']),
      fitting('partition', 'horse_box_partition', origin, ['floor']),
      fitting('breast_bar', 'horse_box_breast_bar', origin, ['partition']),
      fitting('vent_near_rear', 'horse_box_vent', [s.rearVent, s.ventLow, 0], ['wall_door']),
      fitting('vent_near_mid', 'horse_box_vent', [s.midVent, s.ventLow, 0], ['wall_door']),
      fitting('vent_far_rear', 'horse_box_vent', [s.rearVent, s.ventLow, 0], ['wall_plain']) + { mirror: true },
      fitting('vent_far_mid', 'horse_box_vent', [s.midVent, s.ventLow, 0], ['wall_plain']) + { mirror: true },
      fitting('coupling', 'trailer_coupling', [s.tip, s.frameLow, 0], ['chassis']),
      fitting('jockey_wheel', 'trailer_jockey_wheel', [s.tip - 0.42, 0, 0.2], ['chassis']),
      kit.cargoSpace('stall_near', [-0.4, s.floor, 0.4], [26, 14, 6], 'floor'),
      kit.cargoSpace('stall_far', [-0.4, s.floor, -0.4], [26, 14, 6], 'floor'),
    ]
    + [fitting('axle_' + i, 'trailer_axle_van', [s.axles[i], s.hub - 0.37, 0], ['chassis']) for i in axleIds]
    + std.flattenArrays([pair('wheel_' + i, 'wheel_185r14', [s.axles[i], s.hub, s.wheelZ], on(['axle_' + i])) for i in axleIds])
    + pair('top_door', 'horse_box_top_door', origin, on(['roof']))
    + pair('mudguard', 'horse_box_mudguard', origin, on(['chassis']))
    + pair('tail_lamp', 'tail_lamp_small', [s.rear - 0.11, s.frameLow, 0.66], on(['chassis']))
    + pair('marker', 'marker_lamp', [s.noseFace, s.ventLow + 0.14, 0.74], on(['nose'])),
  },
}
