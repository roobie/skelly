// A cement mixer on the tipper truck's chassis: a 6 m3 drum lying level over the rails, charged through a hopper at its rear mouth.
(import 'tipper_truck.spec.libsonnet') + {
  apex: [1.9, 2.6],
  stations: [[0, 0.5], [0.95, 1.1], [3.55, 1.1], [4.95, 0.46]],
  beamY: 1.2, beamTop: 1.35, hopperX: -3.2, headY: 3.0, rimY: 3.9, platformY: 3.2,
}
