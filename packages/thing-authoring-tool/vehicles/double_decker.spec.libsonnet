// A two-deck city bus of 10.5 m: 2.55 m wide, 4.3 m high, 4.95 m wheelbase, about 12.5 t at the kerb, rear-engined
// with a low lower deck. Stairs climb rearward along the far side behind the driver. Metres in the vehicle frame.
local seat(x, y, sides) = { part: 'bus_seat_pair', x: x, y: y, z: 0.72, sides: sides };
// Singles stand inboard of the front wheelhouse, where a pair would not fit.
local single(x, sides) = { part: 'bus_seat_single', x: x, y: 0.38, z: 0.62, sides: sides };
local upper = 2.45;
{
  rear: -5.25, front: 5.25, side: 1.275, skin: 1.2, sill: 0.3,
  floor: 0.38, floorRear: 0.82, floorStep: -1.3, engineDeck: { x: -3.75, y: 1.28 },
  roofBase: 4.12, roof: 4.3,
  decks: [
    { waist: 1.15, top: 2.15, bayFront: 4.85, pitch: 1.3, bays: 7 },
    { floor: upper, waist: 3.05, top: 3.88, bayFront: 4.85, pitch: 1.3, bays: 7 },
  ],
  stairWell: { x: [1.55, 3.45], z: -0.2 },
  stairs: { low: 3.4, high: 1.6, inner: -0.25 },
  upperFloorMass: 420,
  frontAxle: 2.85, frontAxlePart: 'steered_axle_drop', rearAxle: -2.1, arch: 0.62, archTop: 1.12, frontWell: 0.86, rearWell: 0.6,
  wheel: 'wheel_295_80r22_5', wheelR: 0.522, wheelZ: 1.1, wheelTwin: 0.3,
  lean: 0.1, screens: [[0.95, 2.15], [3.05, 3.88]], pillar: 0.1,
  doors: [{ bay: 0 }], doorSill: 0.3, doorKick: 0.28, doorFinish: 'plastic-black',
  rearHoles: [{ y: [1.6, 2.15], z: 0.85 }, { y: [3.05, 3.88], z: 0.85 }], engineHatch: [0.5, 1.45],
  sign: { y: [2.2, 2.62], z: 0.9 },
  stripes: [{ y: [2.68, 2.9], slot: 'accent', wrap: true }],
  paint: 'paint-red', accent: 'paint-cream', pillarFinish: 'plastic-black',
  bumperFinish: 'plastic-black',
  driver: { x: 3.95, y: 0.72, z: 0.72 },
  dashTop: 1.32,
  shellMass: 8320,
  mirrorAt: [4.97, 2.7, 1.27], tailLampAt: [-5.28, 0.95, 1.1], headlampAt: [5.25, 0.72, 0.95],
  seats:
    [single(x, 'near') for x in [3.05, 2.5]]
    + [seat(x, 0.38, 'near') for x in [2.0, 1.2, 0.4, -0.4]]
    + [seat(x, 0.38, 'far') for x in [1.2, 0.4, -0.4]]
    + [seat(-2.1, 1.18, 'both'), seat(-3.0, 0.82, 'both'), seat(-4.3, 1.28, 'both')]
    + [seat(4.3, upper, 'both')]
    + [seat(x, upper, 'near') for x in [3.5, 2.7, 1.9]]
    + [seat(x, upper, 'both') for x in [1.1, 0.3, -0.5, -1.3, -2.1, -2.9, -3.7, -4.5]],
  power: {
    engine: 'engine_i6_heavy_diesel', engineAt: [-4.4, 0.32, 0],
    gearbox: 'gearbox_heavy', gearboxAt: [-3.38, 0.37, 0],
    shafts: [{ part: 'prop_shaft_short', at: [-2.6, 0.55, 0] }],
    radiator: 'radiator_truck', radiatorAt: [-5.05, 0.32, 0],
    tank: 'fuel_tank_truck', tankAt: [-3.2, 0.32, 0.86],
    exhaust: 'exhaust_bus_rear', exhaustAt: [-4.47, 0.34, -0.62],
    batteryAt: [4.5, 0.42, -0.9],
  },
}
