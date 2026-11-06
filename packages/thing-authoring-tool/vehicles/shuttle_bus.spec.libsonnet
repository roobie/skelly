// A 7.85 m low-floor airport or hotel shuttle: 2.4 m wide, 2.8 m high, 3.65 m wheelbase, about 7 t at the kerb, with
// two wide doors on the near side and a luggage rack over the front wheel between them. Metres in the vehicle frame.
local seat(x, y, sides) = { part: 'bus_seat_pair', x: x, y: y, z: 0.68, sides: sides };
local single(x, sides) = { part: 'bus_seat_single', x: x, y: 0.36, z: 0.58, sides: sides };
{
  rear: -3.95, front: 3.9, side: 1.2, skin: 1.13, sill: 0.3,
  floor: 0.36, floorRear: 0.8, floorStep: -1.3, engineDeck: { x: -2.75, y: 1.1 },
  roofBase: 2.62, roof: 2.8,
  decks: [{ waist: 1.1, top: 2.32, bayFront: 3.6, pitch: 1.35, bays: 5 }],
  frontAxle: 1.65, frontAxlePart: 'steered_axle_drop', rearAxle: -2.0, arch: 0.52, archTop: 0.98, frontWell: 0.82, rearWell: 0.64,
  wheel: 'wheel_8r19_5', wheelR: 0.43, wheelZ: 1.03, wheelTwin: 0.23,
  lean: 0.12, screens: [[0.92, 2.32]], pillar: 0.1,
  doors: [{ bay: 0 }, { bay: 2 }], doorSill: 0.3, doorKick: 0.28, doorFinish: 'plastic-black',
  rearHoles: [{ y: [1.5, 2.3], z: 0.88 }], engineHatch: [0.5, 1.3],
  sign: { y: [2.36, 2.58], z: 0.8 },
  stripes: [{ y: [2.36, 2.5], slot: 'accent' }],
  paint: 'paint-white', band: 'paint-police-blue', accent: 'paint-police-blue', pillarFinish: 'plastic-black',
  bumperFinish: 'paint-police-blue',
  driver: { x: 2.72, y: 0.7, z: 0.68 },
  dashTop: 1.3,
  shellMass: 4560,
  mirrorAt: [3.62, 2.52, 1.195], tailLampAt: [-3.98, 0.9, 1.03], headlampAt: [3.9, 0.72, 0.85],
  seats: [
    single(1.95, 'far'),
    single(1.35, 'far'),
    seat(0.75, 0.36, 'far'),
    seat(-0.05, 0.36, 'far'),
    seat(-0.85, 0.36, 'both'),
    seat(-2.0, 1.04, 'both'),
    seat(-2.85, 1.1, 'both'),
    seat(-3.55, 1.1, 'both'),
  ],
  rack: { x: 1.65, half: 0.42, z: [0.6, 1.1], y: [1.04, 2.2], shelves: 3 },
  power: {
    engine: 'engine_i4_diesel', engineAt: [-3.05, 0.3, 0],
    gearbox: 'gearbox_truck', gearboxAt: [-2.44, 0.36, 0],
    shafts: [],
    radiator: 'radiator_van', radiatorAt: [-3.72, 0.32, 0],
    tank: 'fuel_tank_van', tankAt: [-3.0, 0.32, 0.72],
    exhaust: 'exhaust_car', exhaustAt: [-3.55, 0.32, -0.62],
    batteryAt: [3.25, 0.42, -0.85],
  },
}
