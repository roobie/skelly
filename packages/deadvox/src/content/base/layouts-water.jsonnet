// The debug lake: a basin under a water body, for looking at the shore, the surface and the bed from below.
// It is hundreds of metres across, the scale of the haven's lake; the polygon only bounds it, and the basin's slope
// and the ground noise draw the shore.
(import 'economy.libsonnet').pack({
  layouts: [
    {
      id: 'lake_demo',
      demo: true,
      bounds: { x0: 0, z0: 0, x1: 512, z1: 448 },
      ground: 21,
      terrain: [{ kind: 'basin', centre: [256, 224], radii: [200, 150], depth: 6 }],
      water: [{
        level: 21,
        polygon: [[40, 224], [100, 60], [256, 40], [412, 60], [472, 224], [412, 388], [256, 408], [100, 388]],
        shore: 1.5,
      }],
      buildings: [],
      player: { position: [256, 21.5, 392], bearing: 0 },
      shamblers: [],
      woodlands: [],
      tracks: [],
    },
  ],
})
