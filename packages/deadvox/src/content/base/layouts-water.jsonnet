// The debug lake: a basin under a water body, for looking at the shore, the surface and the bed from below.
(import 'economy.libsonnet').pack({
  layouts: [
    {
      id: 'lake_demo',
      demo: true,
      bounds: { x0: 0, z0: 0, x1: 96, z1: 96 },
      ground: 21,
      terrain: [{ kind: 'basin', centre: [48, 44], radii: [18, 14], depth: 4 }],
      water: [{ level: 21, polygon: [[26, 26], [70, 26], [70, 62], [26, 62]], shore: 1.5 }],
      buildings: [],
      player: { position: [48, 21.5, 72], bearing: 0 },
      shamblers: [],
      woodlands: [],
      tracks: [],
    },
  ],
})
