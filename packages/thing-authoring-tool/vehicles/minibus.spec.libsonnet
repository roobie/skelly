// A long-wheelbase crew minibus on the high-roof van's platform: 5.9 m long, 2.0 m wide, 2.45 m tall, with a
// 3.75 m wheelbase. Windows run the length of both sides, with the near side's sliding door between them.
local van = import 'van-body.libsonnet';
van.cab + van.saloonFloor + {
  rear: -3.2, rearAxle: -1.98, panLow: 0.42,
  roof: 2.45, canton: 2.33, doorTop: 2.1, windowTop: 1.95,
  shellMass: 1680, paint: 'paint-cream',
  bulkhead: false, slideGlass: true, rearGlass: true,
  windows: [[-3.0, -2.45], [-2.35, -1.8], [-1.7, -1.14], [-1.04, -0.56], [-0.46, -0.04]],
  bands: [{ finish: 'paint-green', y: [0.86, 0.97] }],
  seatRows: [-0.38, -1.1, -1.82, -2.54],
}
