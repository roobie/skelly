// A box-bodied ambulance on a van cab: 5.7 m long, 2.24 m wide over the box, 2.82 m tall, with a 3.75 m wheelbase.
// The box sits on the chassis with its floor above the rear wheels and carries the sliding door and the stretcher.
local van = import 'van-body.libsonnet';
van.cab + van.loadFloor + {
  rear: -3.0, rearAxle: -1.98, panLow: 0.42,
  rearWheel: 'wheel_twin_225_75r16c', rearTubIn: 0.62,
  slideRear: -1.1, bulkhead: false, rearGlass: true, slideGlass: true,
  shellMass: 880, paint: 'paint-white',
  bands: [{ finish: 'paint-red', y: [0.88, 1.02] }],
  box: {
    front: 0, slideFront: -0.12, mass: 1300,
    side: 1.12, skin: 1.06, glassOut: 1.1, glassIn: 1.04, roofSide: 1.0,
    sill: 0.5, floor: 0.88, panLow: 0.6, rearSill: 0.82, hatchSide: 0.96,
    waist: 1.6, windowTop: 2.2, doorTop: 2.4, canton: 2.72, roof: 2.82,
    windows: [[-2.5, -1.9]],
  },
}
