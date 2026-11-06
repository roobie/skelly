local k = import 'kit.libsonnet';
local s = import 'school_bus.spec.libsonnet';
(import 'bus-body.libsonnet').rows('school_bus', s) + [
  // The rear exit swings on its far edge, in the centre of the rear wall.
  k.compound('school_bus_rear_door', 42, [
    k.box('skin', 'paint', [s.rear - 0.01, 1.0, -0.5], [s.rear + 0.07, 1.72, 0.5]),
    k.box('head', 'paint', [s.rear - 0.01, 2.36, -0.5], [s.rear + 0.07, 2.42, 0.5]),
    k.box('stile_far', 'paint', [s.rear - 0.01, 1.72, -0.5], [s.rear + 0.07, 2.36, -0.44]),
    k.box('stile_near', 'paint', [s.rear - 0.01, 1.72, 0.44], [s.rear + 0.07, 2.36, 0.5]),
    k.box('glass', 'glass', [s.rear + 0.01, 1.72, -0.44], [s.rear + 0.05, 2.36, 0.44]),
    k.box('handle', 'trim', [s.rear - 0.03, 1.56, 0.24], [s.rear - 0.01, 1.62, 0.42]),
  ], { paint: s.paint, glass: 'glass-clear', trim: 'plastic-black' }, {
    hinge_a: ['stile_far', [0.5, 0.05, 0]],
    hinge_b: ['stile_far', [0.5, 0.95, 0]],
  }),
  k.compound('school_bus_stop_arm', 3, [
    k.box('arm', 'frame', [-0.03, -0.03, -0.02], [0.2, 0.03, 0.02]),
    k.prism('sign', 'face', [[-0.34, -0.09], [-0.2, -0.23], [-0.06, -0.23], [0.08, -0.09], [0.08, 0.09], [-0.06, 0.23], [-0.2, 0.23], [-0.34, 0.09]], [-0.015, 0.015]),
  ], { frame: 'steel-grey', face: 'plastic-red' }),
]
