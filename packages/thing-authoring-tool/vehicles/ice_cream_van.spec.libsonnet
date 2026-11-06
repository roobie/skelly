// An ice cream van: a white box on a van cab, 5.4 m long, 2.2 m wide over the box and 2.46 m tall to the roof, with a
// 3.67 m wheelbase. Its waist is low so the serving window reaches down to a counter a customer can lean on.
local van = import 'van-body.libsonnet';
van.cab + van.loadFloor + {
  rear: -2.7, rearAxle: -1.9, panLow: 0.42,
  slideRear: -0.8, rearGlass: true,
  shellMass: 850, paint: 'paint-white',
  bands: [{ finish: 'plastic-pink', y: [0.88, 1.03] }],
  box: {
    front: 0, slideFront: -0.12, mass: 650,
    side: 1.1, skin: 1.04, glassOut: 1.08, glassIn: 1.02, roofSide: 0.98,
    sill: 0.5, floor: 0.88, panLow: 0.6, rearSill: 0.82, hatchSide: 0.94,
    waist: 1.28, windowTop: 2.0, doorTop: 2.12, canton: 2.36, roof: 2.46,
    windows: [[-2.4, -1.0]],
  },
}
