// A 12 m low-floor rear-engined city bus: 2.55 m wide, 3 m high, 5.9 m wheelbase, about 11.5 t at the kerb.
// Metres in the vehicle frame.
local seat(x, y, sides) = { part: 'bus_seat_pair', x: x, y: y, z: 0.72, sides: sides };
// Singles stand inboard of the front wheelhouses, where a pair would not fit.
local single(x, sides) = { part: 'bus_seat_single', x: x, y: 0.36, z: 0.62, sides: sides };
{
  rear: -6, front: 6, side: 1.275, skin: 1.2, sill: 0.3,
  floor: 0.36, floorRear: 0.82, floorStep: -1.4, engineDeck: { x: -4.25, y: 1.28 },
  roofBase: 2.82, roof: 3.0,
  decks: [{ waist: 1.15, top: 2.55, bayFront: 5.6, pitch: 1.35, bays: 8 }],
  frontAxle: 3.3, frontAxlePart: 'steered_axle_drop', rearAxle: -2.6, arch: 0.62, archTop: 1.12, frontWell: 0.86, rearWell: 0.6,
  wheel: 'wheel_295_80r22_5', wheelR: 0.522, wheelZ: 1.1, wheelTwin: 0.3,
  lean: 0.14, screens: [[0.92, 2.5]], pillar: 0.1,
  doors: [{ bay: 0 }, { bay: 3 }], doorSill: 0.3, doorKick: 0.28, doorFinish: 'plastic-black',
  rearHoles: [{ y: [1.55, 2.5], z: 0.95 }], engineHatch: [0.5, 1.4],
  sign: { y: [2.5, 2.76], z: 0.95 },
  paint: 'paint-white', band: 'paint-drum-blue', pillarFinish: 'plastic-black',
  bumperFinish: 'paint-drum-blue',
  driver: { x: 4.72, y: 0.7, z: 0.72 },
  dashTop: 1.3,
  shellMass: 7920,
  mirrorAt: [5.72, 2.74, 1.27], tailLampAt: [-6.03, 0.95, 1.1], headlampAt: [6.0, 0.72, 0.95],
  seats: [
    single(4.05, 'far'),
    single(3.45, 'both'),
    single(2.75, 'both'),
    seat(2.25, 0.36, 'both'),
    seat(1.45, 0.36, 'far'),
    seat(0.65, 0.36, 'far'),
    seat(-0.15, 0.36, 'far'),
    seat(-0.95, 0.36, 'far'),
    seat(-0.2, 0.36, 'near'),
    seat(-1.0, 0.36, 'near'),
    seat(-1.7, 0.82, 'both'),
    seat(-2.6, 1.18, 'both'),
    seat(-3.5, 0.82, 'both'),
    seat(-4.65, 1.28, 'both'),
    seat(-5.4, 1.28, 'both'),
  ],
  power: {
    engine: 'engine_i6_heavy_diesel', engineAt: [-5.15, 0.32, 0],
    gearbox: 'gearbox_heavy', gearboxAt: [-4.13, 0.37, 0],
    shafts: [{ part: 'prop_shaft_short', at: [-3.1, 0.55, 0] }],
    radiator: 'radiator_truck', radiatorAt: [-5.8, 0.32, 0],
    tank: 'fuel_tank_truck', tankAt: [-3.75, 0.32, 0.86],
    exhaust: 'exhaust_bus_rear', exhaustAt: [-5.22, 0.34, -0.62],
    batteryAt: [5.4, 0.42, -0.9],
  },
}
