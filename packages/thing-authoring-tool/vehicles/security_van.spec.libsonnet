// An armoured cash van: a steel box on a van cab, 5.7 m long, 2.2 m wide over the box and 2.7 m tall, with a 3.67 m
// wheelbase. The box's windows sit in a high narrow strip above its armoured lower wall.
local van = import 'van-body.libsonnet';
van.cab + van.loadFloor + {
  rear: -2.9, rearAxle: -1.9, panLow: 0.42,
  slideRear: -0.92, bulkhead: false, bumper: 'steel-grey',
  rearWheel: 'wheel_twin_225_75r16c', rearTubIn: 0.62,
  shellMass: 1100, paint: 'paint-charcoal',
  bands: [{ finish: 'reflective-yellow', y: [0.9, 1.02] }],
  box: {
    front: 0, slideFront: -0.12, mass: 2300,
    side: 1.1, skin: 1.04, glassOut: 1.08, glassIn: 1.02, roofSide: 0.98,
    sill: 0.5, floor: 0.88, panLow: 0.6, rearSill: 0.82, hatchSide: 0.94,
    waist: 1.78, windowTop: 2.0, doorTop: 2.3, canton: 2.6, roof: 2.7,
    windows: [[-2.3, -2.0], [-1.6, -1.3]],
  },
}
