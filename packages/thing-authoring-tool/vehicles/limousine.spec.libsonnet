// A saloon stretched by 1.9 m between its doors: 6.6 m long, 1.8 m wide, with a 4.7 m wheelbase and tinted side
// glass. Metres in the vehicle frame.
(import 'saloon.spec.libsonnet') + {
  rear: -3.3, front: 3.3,
  rearAxle: -2.3, frontAxle: 2.4, arch: 0.4, archTop: 0.74, tyre: 'wheel_225_60r17',
  cowl: 1.85, aPost: 1.95,
  bRear: 0.75, bFront: 0.85, rearDoor: -2.15, rearDoorArch: -1.9, rearDoorFront: -1.1,
  hoodBack: 0.96, hoodFall: 0.05,
  cWaist: -2.09, tailWaist: -2.05, deckFront: -2.45, rearFloorFront: -1.93,
  grilleHalf: 0.34, bumperPaint: 'steel-bright', bumperLow: 0.36, bumperTop: 0.5, sideGlass: 'lens-smoke',
  shellMass: 2150, paint: 'paint-white',
}
