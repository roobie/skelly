// A bonneted armoured response truck: 6.15 m long, 2.44 m wide, 2.75 m high, 3.5 m wheelbase, about 9 t at the kerb.
// A slab-sided crew box with slit windows and rear doors, a shallow windowed cab and a ram bar. Metres in the vehicle frame.
{
  rear: -3.1, front: 2.72, side: 1.2, face: 1.1, cabBack: -0.25, doorRear: -0.17, doorFront: 0.94,
  floor: 0.96, waist: 1.75, roof: 2.36, lean: 0.14,
  frontAxle: 1.75, frontAxlePart: 'steered_axle_medium', frontAxleY: 0, rearAxles: [-1.75],
  wheel: 'wheel_8r19_5', r: 0.43, wheelW: 0.21,
  railBottom: 0.6, railTop: 0.84,
  engine: 'engine_i6_diesel', engineLength: 0.86, gearbox: 'gearbox_truck', radiator: 'radiator_truck',
  paint: 'paint-police-blue',
  chassisMass: 2600, shellMass: 1150,
  bonnet: { nose: 2.6, back: 1.68, front: 1.52, z: 0.62 },
  engineX: 1.75, engineY: 0.5, radiatorX: 2.42, radiatorY: 0.55,
  bumperLow: 0.48, bumperTop: 0.84, tankX: -0.45, batteryX: -0.45, exhaustX: -1.0, exhaustY: 0.56,
  lampX: 2.66, lampY: 0.9, lampZ: 0.9,
  guard: false,
  // The bonnet leaves a short, low cab: a shallow dash, the seat back against the box and no room to raise it.
  seatX: 0.27, dashDepth: 0.3, raisedSeat: false,
  // The armoured box.
  body: {
    side: 1.22, wall: 0.06, floorLow: 0.88, floorTop: 0.96, top: 2.72, front: -0.25,
    slit: { y: [1.82, 2.12], x: [[-2.35, -1.75], [-1.35, -0.75]] },
    skirt: { y: [0.54, 0.88], x: [[-3.05, -2.28], [-1.22, -0.25]], chamfer: 0.2 },
    strake: [1.62, 1.72],
    doorWindow: { y: [1.72, 2.02], z: [0.42, 0.82] },
    stepY: [0.58, 0.64],
    apron: [0.64, 0.96],
  },
  benchX: -1.2, benchZ: 0.88,
  ram: { x: 2.9, plate: 0.14, low: 0.56, mid: 0.82, high: 1.42, half: 1.16, postZ: 0.46 },
}
