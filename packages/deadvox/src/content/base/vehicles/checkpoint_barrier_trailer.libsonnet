// Items and blueprint for the checkpoint barrier trailer. Its panels fit at the origin (`packages/thing-authoring-tool/vehicles/checkpoint_barrier_trailer.libsonnet`).
local kit = import '../vehicle-kit.libsonnet';
local part = kit.part;
local fitting = kit.fitting;
local pair = kit.pair;
local on = kit.on;
local origin = kit.origin;
local pile = kit.pileSize;
local s = import 'packages/thing-authoring-tool/vehicles/checkpoint_barrier_trailer.spec.libsonnet';
{
  items: [
    part('checkpoint_barrier_trailer_chassis', 'Barrier trailer chassis', pile, ['structure']),
    part('checkpoint_barrier_trailer_floor', 'Barrier trailer floor', pile, ['structure']),
    part('checkpoint_barrier_trailer_side', 'Barrier trailer side rack', pile, ['protection']),
    part('checkpoint_barrier_trailer_headboard', 'Barrier trailer headboard', pile, ['protection']),
    part('checkpoint_barrier_trailer_tailgate', 'Barrier trailer tailgate', pile, ['protection']),
    part('checkpoint_barrier_trailer_mudguard', 'Barrier trailer mudguard', [8, 4], ['protection']),
    part('checkpoint_barrier_trailer_straps', 'Barrier trailer straps', pile, []),
    part('checkpoint_barrier_trailer_barrier', 'Folded road barrier', pile, []),
  ],
  blueprint: {
    id: 'checkpoint_barrier_trailer',
    name: 'Checkpoint barrier trailer',
    fittings: [
      fitting('chassis', 'checkpoint_barrier_trailer_chassis', origin),
      fitting('floor', 'checkpoint_barrier_trailer_floor', origin, ['chassis']),
      fitting('headboard', 'checkpoint_barrier_trailer_headboard', origin, ['floor']),
      fitting('tailgate', 'checkpoint_barrier_trailer_tailgate', origin, ['floor']),
      fitting('axle', 'trailer_axle_light', [s.axle, s.hub - 0.37, 0], ['chassis']),
      fitting('coupling', 'trailer_coupling', [s.tip - 0.03, s.frameLow, 0], ['chassis']),
      fitting('resting_leg', 'trailer_leg', [s.tip - 0.42, 0, 0.17], ['chassis']),
      fitting('straps', 'checkpoint_barrier_trailer_straps', origin, ['floor']),
    ] + [
      fitting('barrier_' + i, 'checkpoint_barrier_trailer_barrier', [0, s.deck, s.barrierZ[i]], ['floor'])
      for i in std.range(0, std.length(s.barrierZ) - 1)
    ]
    + pair('side', 'checkpoint_barrier_trailer_side', origin, on(['floor']))
    + pair('mudguard', 'checkpoint_barrier_trailer_mudguard', origin, on(paired=['side']))
    + pair('wheel', 'wheel_165_70r13', [s.axle, s.hub, s.wheelZ], on(['axle']))
    + pair('tail_lamp', 'tail_lamp_small', [s.rear - 0.03, s.frameLow - 0.05, 0.46], on(['chassis']))
    + pair('marker', 'marker_lamp', [s.front + 0.02, s.wall + 0.3, 0.46], on(['headboard'])),
  },
}
