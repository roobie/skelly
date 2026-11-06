// A short-wheelbase low-roof panel van of the common European 3.5-tonne class: 5.3 m long, 2.0 m wide, 2.3 m tall,
// with a 3.3 m wheelbase. Metres in the vehicle frame.
local van = import 'van-body.libsonnet';
van.cab + van.loadFloor + {
  rear: -2.6, rearAxle: -1.53, panLow: 0.42,
  shellMass: 1080, paint: 'paint-white',
}
