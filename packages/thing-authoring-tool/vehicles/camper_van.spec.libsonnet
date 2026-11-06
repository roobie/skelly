// A short-wheelbase camper conversion of the low-roof van: 5.3 m long, 2.0 m wide, 2.3 m tall with the roof down.
local van = import 'van-body.libsonnet';
van.cab + van.saloonFloor + {
  rear: -2.6, rearAxle: -1.53, panLow: 0.42,
  shellMass: 1400, paint: 'paint-cream',
  bulkhead: false, slideGlass: true, rearGlass: true,
  windows: [[-2.4, -1.3], [-1.2, -0.1]],
  bands: [{ finish: 'paint-green', y: [0.86, 1.02] }],
}
