// A tall one-box body with a sliding rear door on visible tracks and a third row on the raised rear floor.
local kit = import '../vehicle-kit.libsonnet';
local s = import 'packages/thing-authoring-tool/vehicles/minivan.spec.libsonnet';
(import 'luxury_saloon.libsonnet').carOn('minivan', 'Minivan', s, {
  over: {
    front_seat_near: { at: [s.cowl - 0.57, s.floor, 0.42] },
    front_seat_far: { at: [s.cowl - 0.57, s.floor, -0.42] },
    rear_bench: { at: [-0.5, s.floor, 0] },
    exhaust: { at: [s.rear + 0.46, s.sill, 0.42] },
    headlamp_near: { at: [s.front - 0.07, 0.72, 0.62] },
    headlamp_far: { at: [s.front - 0.07, 0.72, -0.62] },
    battery_tray: { at: [s.aPost + 0.25, 0.56, -0.44] },
    battery: { at: [s.aPost + 0.25, 0.59, -0.44] },
  },
  fittings: [
    kit.fitting('third_row', 'bench_seat_3', [-1.5, 0.56, 0], ['shell']),
    kit.fitting('door_track', 'minivan_door_track', kit.origin, ['shell']),
  ],
  items: [
    kit.part('minivan_door_track', 'Minivan sliding door tracks', kit.pileSize, ['structure']),
  ],
})
