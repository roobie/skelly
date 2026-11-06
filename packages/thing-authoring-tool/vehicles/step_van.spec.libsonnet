// A walk-in delivery van: 6.0 m long, 2.0 m wide and 2.95 m tall, with a 3.67 m wheelbase. The whole cab stands 0.65 m
// further forward than on the other vans, over the front axle, so the body runs on square to a short nose.
local van = import 'van-body.libsonnet';
van.cab + van.loadFloor + {
  rear: -2.7, front: 3.3, rearAxle: -1.25, panLow: 0.42,
  frontAxle: 2.42, aPost: 2.40625, aLean: 0.6, cowl: 1.94, bRear: 0.65, bFront: 0.75, fire: 2.27, dash: 1.77,
  waist: 1.3, windowTop: 2.1, doorTop: 2.6, canton: 2.85, roof: 2.95, cabRoof: 2.95,
  slideRear: -0.1, bulkhead: false, slideGlass: true, rearShutter: true,
  windows: [[-0.05, 0.6]],
  shellMass: 2300, paint: 'paint-green',
  bands: [{ finish: 'paint-cream', y: [0.88, 1.08] }],
  frontSeatX: 1.1,
  // A walk-in body's 19.5 in wheels; the arch stops short of the front door's leading edge, and the floor stands
  // above the rear differential they lift.
  floor: 0.625,
  wheel: 'wheel_8r19_5', hub: 0.43, arch: 0.46, archTop: 0.95,
}
