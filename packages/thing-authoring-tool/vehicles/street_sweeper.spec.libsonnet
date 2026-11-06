// A short-wheelbase street sweeper on the box truck's measures: gutter brushes behind the front axle, a main broom ahead of the rear axle, and a rounded hopper with a water tank ahead of it.
(import 'box_truck.spec.libsonnet') + {
  rear: -3.1, front: 3.1, face: 3.02, cabBack: 1.25, doorRear: 1.33,
  frontAxle: 2.02, rearAxles: [-1.25],
  tankX: 0.1, batteryX: 0.1,
  paint: 'paint-white',
  chassisMass: 1250, shellMass: 1100,
  bodyLow: 0.98, bodyTop: 2.7, bodySide: 1.16, bodyRear: -3.02, bodyFront: 1.15, hopperFront: -0.5,
  brushX: 1.1, brushZ: 1.0, brushR: 0.4, broomX: -0.62,
}
