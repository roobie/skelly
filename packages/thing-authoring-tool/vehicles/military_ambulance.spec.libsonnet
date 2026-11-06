// The cargo truck chassis under a tall box body: 6.9 m long, 2.42 m wide, 3.05 m tall, about 9.5 t.
(import 'military_cargo_truck.spec.libsonnet') + {
  boxTop: 3.0, boxSide: 1.2, boxMass: 1000, boxFloorMass: 250, doorMass: 45, rackMass: 40,
}
