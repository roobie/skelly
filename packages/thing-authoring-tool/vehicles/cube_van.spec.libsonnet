// A cube van: a tall box wider than a van cab, 6.1 m long, 2.36 m wide over the box and 3.0 m tall, with a 3.67 m
// wheelbase and a long rear overhang.
local van = import 'van-body.libsonnet';
van.cab + van.loadFloor + {
  rear: -3.4, rearAxle: -1.9, panLow: 0.42,
  slideRear: -0.9, rearShutter: true,
  rearWheel: 'wheel_twin_225_75r16c', rearWheelZ: 0.93, rearTubIn: 0.69,
  shellMass: 900, paint: 'paint-white',
  bands: [{ finish: 'paint-drum-blue', y: [0.88, 1.02] }],
  box: {
    front: 0, slideFront: -0.12, mass: 800,
    side: 1.18, skin: 1.12, glassOut: 1.16, glassIn: 1.1, roofSide: 1.06,
    sill: 0.5, floor: 0.88, panLow: 0.6, rearSill: 0.82, hatchSide: 1.02,
    waist: 1.6, windowTop: 2.2, doorTop: 2.6, canton: 2.9, roof: 3.0,
    windows: [],
  },
}
