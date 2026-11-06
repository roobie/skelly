// A recovery truck on the box truck's chassis: a deck with side lockers, a boom raked over the tail and a sling hung from its tip.
(import 'box_truck.spec.libsonnet') + {
  chassisMass: 3000,
  deckRear: -3.7, deckFront: 1.87, deckBottom: 1.0, deckTop: 1.09375, lockerTop: 1.84, lockerIn: 0.72,
  pivot: [-0.15, 1.98], stageEnd: [-2.31, 2.88], tip: [-3.75, 3.48],
  slingX: -3.86,
}
