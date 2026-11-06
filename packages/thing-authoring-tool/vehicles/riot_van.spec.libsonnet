// A public-order van on the long van: 5.9 m long, 2.0 m wide, 2.6 m tall, with a 3.75 m wheelbase, windowed for a crew
// and with its glass behind steel grilles.
local van = import 'van-body.libsonnet';
van.cab + van.saloonFloor + {
  rear: -3.2, rearAxle: -1.98, panLow: 0.42,
  roof: 2.6, canton: 2.48, doorTop: 2.2,
  shellMass: 1550, paint: 'paint-white',
  bulkhead: false, slideGlass: true, rearGlass: true,
  windows: [[-3.0, -2.4], [-2.3, -1.7], [-1.6, -1.1], [-1.0, -0.1]],
  bands: [{ finish: 'paint-police-blue', y: [0.86, 0.92] }],
}
