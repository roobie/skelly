// A bonneted school bus of about 11 m: 2.44 m wide, 3.05 m high, 6.6 m wheelbase, about 11 t at the kerb, with a
// high floor over the prop shaft and paired benches either side of a narrow aisle. Metres in the vehicle frame.
local bench(x) = { part: 'bench_seat_2', x: x, y: 0.95, z: 0.65, sides: 'both' };
// Over the rear wheel wells, sunk onto the well tops.
local benchOverWell(x) = bench(x) { y: 1.15, riser: 0.38 };
{
  rear: -5.5, front: 5.5, side: 1.22, skin: 1.15, sill: 0.5,
  floor: 0.95, floorFinish: 'rubber-black',
  roofBase: 2.72, roof: 3.05,
  decks: [{ waist: 1.75, top: 2.42, bayFront: 3.6, pitch: 0.8, bays: 11 }],
  frontAxle: 4.4, rearAxle: -2.2, arch: 0.62, archTop: 1.14, frontWell: 0.86, rearWell: 0.56,
  wheel: 'wheel_295_80r22_5', wheelR: 0.522, wheelZ: 1.05, wheelTwin: 0.3,
  bonnet: { cowl: 3.75, cowlY: 1.72, noseY: 1.5, flankY: 0.72, halfWidth: 0.88 },
  lean: 0.2, screens: [[1.72, 2.62]], screenPost: true, pillar: 0.1,
  doors: [{ bay: 0 }], doorLeaves: 1, doorSill: 0.5, doorKick: 0.42, doorSteps: 2, doorFinish: 'paint-signal-yellow',
  rearHoles: [{ y: [1.0, 2.42], z: 0.5, door: true }],
  rearFlank: { y: [1.8, 2.36], z: [0.62, 1.06] },
  stripes: [
    { y: [1.08, 1.14], slot: 'rail' },
    { y: [1.38, 1.44], slot: 'rail' },
    { y: [1.72, 1.76], slot: 'rail' },
  ],
  paneSash: true,
  paint: 'paint-signal-yellow',
  bumperFinish: 'plastic-black', bumperY: [0.55, 0.8],
  driver: { x: 2.95, y: 0.95, z: 0.62 },
  dashTop: 1.68,
  chassisRail: [0.62, 0.8],
  shellMass: 8400,
  mirrorAt: [3.45, 2.62, 1.215], tailLampAt: [-5.53, 1.18, 0.95], headlampAt: [5.36, 1.14, 0.71],
  seats: [bench(x) for x in [2.1, 1.35, 0.6, -0.15, -0.9]]
         + [benchOverWell(x) for x in [-1.65, -2.4]]
         + [bench(x) for x in [-3.15, -3.9, -4.65]],
  power: {
    engine: 'engine_i6_diesel', engineAt: [4.35, 0.72, 0],
    gearbox: 'gearbox_truck', gearboxAt: [3.4, 0.46, 0],
    shafts: [{ part: 'prop_shaft_long', at: [1.74, 0.56, 0] }, { part: 'prop_shaft_long', at: [-0.86, 0.56, 0] }],
    radiator: 'radiator_truck', radiatorAt: [5.2, 0.52, 0],
    tank: 'fuel_tank_truck', tankAt: [0.4, 0.34, 0.76],
    exhaust: 'exhaust_long', exhaustAt: [-3.3, 0.56, -0.53],
    batteryAt: [1.8, 0.5, -0.8],
  },
}
