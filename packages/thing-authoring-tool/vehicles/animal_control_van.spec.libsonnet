// An animal control van: a white box on a van cab, 5.7 m long, 2.2 m wide over the box and 2.5 m tall, with a 3.75 m
// wheelbase. The rail runs between the two tiers of cage hatches, which is why the box's waist sits at 1.6 m.
local van = import 'van-body.libsonnet';
van.cab + van.loadFloor + {
  rear: -3.0, rearAxle: -1.98, panLow: 0.42,
  slideRear: -0.82,
  shellMass: 950, paint: 'paint-white',
  bands: [{ finish: 'paint-green', y: [0.88, 1.02] }],
  box: {
    front: 0, slideFront: -0.12, mass: 1000,
    side: 1.1, skin: 1.04, glassOut: 1.1, glassIn: 1.02, roofSide: 0.98,
    sill: 0.5, floor: 0.88, panLow: 0.6, rearSill: 0.82, hatchSide: 0.94,
    waist: 1.6, windowTop: 2.0, doorTop: 2.25, canton: 2.42, roof: 2.52,
    windows: [],
    columns: [-2.8, -2.14, -1.48], width: 0.62, cageIn: 0.2, cageHeight: 0.68,
  },
}
