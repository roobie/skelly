// A rigid car transporter stretched from the tipper's running gear: two open decks, the upper running over the cab.
(import 'tipper_truck.spec.libsonnet') + {
  rear: -5.5, front: 5.5, face: 5.42, cabBack: 3.6, doorRear: 3.68,
  roof: 2.62, frontAxle: 4.5, rearAxles: [-2.6, -3.95],
  paint: 'paint-oxblood',
  chassisMass: 4800,
  lowerTop: 1.19, lowerBottom: 1.1, lowerFront: 3.45,
  upperTop: 2.885, upperBottom: 2.8, upperRear: -4.3, upperFront: 3.5,
  deckSide: 1.2, postIn: 1.13, postOut: 1.24,
  headTip: [5.15, 3.2], tailTip: [-5.62, 2.48],
}
