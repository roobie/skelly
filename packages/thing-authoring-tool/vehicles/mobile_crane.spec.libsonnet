// A four-axle road crane on the tipper's running gear: 12 m long, outriggers stowed, its telescopic boom laid forward along the carrier over the cab.
(import 'tipper_truck.spec.libsonnet') + {
  rear: -6.0, front: 6.0, face: 5.92, cabBack: 4.15, doorRear: 4.23,
  frontAxle: 5.0, secondAxle: 3.5, rearAxles: [-2.0, -3.4],
  tankX: 1.68, batteryX: 1.68,
  chassisMass: 3500, shellMass: 1680,
  deckLow: 1.16, deckTop: 1.36, deckRear: -5.9, deckFront: 4.05,
  ringX: -3.4, ringTop: 1.52, turretTop: 1.72, turretRear: -5.6, turretFront: -1.6, turretSide: 1.15,
  boomY: 3.4, boomButt: -3.6,
  rearRiggerX: -5.2, frontRiggerX: 2.4, restX: 3.85,
}
