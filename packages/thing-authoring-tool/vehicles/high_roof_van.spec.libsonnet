// A long high-roof van of the common European 3.5-tonne class: 5.9 m long, 2.0 m wide, 2.75 m tall, with a 3.75 m
// wheelbase. The cab keeps the low van's roofline and the body rises behind it.
local van = import 'van-body.libsonnet';
van.cab + van.loadFloor + {
  rear: -3.2, rearAxle: -1.98, panLow: 0.42,
  roof: 2.75, canton: 2.63, doorTop: 2.3,
  shellMass: 1350, paint: 'paint-drum-blue',
}
