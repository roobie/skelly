// An 18 m low-floor articulated bus: 2.55 m wide, 3 m high, about 17 t at the kerb. Two rigid city bus sections on
// one blueprint, parked straight: a fore section with the driver and a pusher rear section with the engine, each
// open at the end that meets the bellows. Metres in the vehicle frame.
local city = import 'city_bus.spec.libsonnet';
local seat(x, y, sides) = { part: 'bus_seat_pair', x: x, y: y, z: 0.72, sides: sides };
local single(x, sides) = { part: 'bus_seat_single', x: x, y: 0.36, z: 0.62, sides: sides };
local portalTop = 2.6;
local common = std.foldl(std.objectRemoveKey, ['floorRear', 'floorStep', 'engineDeck', 'engineHatch', 'sign'], city) + {
  paint: 'paint-white', band: 'paint-green', bumperFinish: 'paint-green',
  power: {
    engine: 'engine_i6_heavy_diesel', engineAt: [-8.15, 0.32, 0],
    gearbox: 'gearbox_heavy', gearboxAt: [-7.13, 0.37, 0],
    shafts: [{ part: 'prop_shaft_short', at: [-6.1, 0.55, 0] }],
    radiator: 'radiator_truck', radiatorAt: [-8.8, 0.32, 0],
    tank: 'fuel_tank_truck', tankAt: [-6.75, 0.32, 0.86],
    exhaust: 'exhaust_long', exhaustAt: [-8.2, 0.48, -0.56],
    batteryAt: [8.4, 0.42, -0.9],
  },
};
{
  bellowsX: [-1.6, -0.4],
  fore: common {
    rear: -0.4, front: 9,
    decks: [{ waist: 1.15, top: 2.55, bayFront: 8.6, pitch: 1.4, bays: 6 }],
    frontAxle: 6.3, rearAxle: 0.4,
    doors: [{ bay: 0 }, { bay: 3 }],
    rearHoles: [{ y: [0.36, portalTop], z: 1.0, door: true }],
    sign: city.sign,
    driver: { x: 7.72, y: 0.7, z: 0.72 },
    mirrorAt: [8.72, 2.74, 1.27], headlampAt: [9, 0.72, 0.95],
    shellMass: 6500,
    seats: [
      single(7.05, 'far'),
      single(6.45, 'both'),
      single(5.75, 'both'),
      seat(5.25, 0.36, 'both'),
      seat(4.4, 0.36, 'far'),
      seat(3.6, 0.36, 'far'),
      seat(2.8, 0.36, 'far'),
      seat(2.0, 0.36, 'far'),
      seat(2.55, 0.36, 'near'),
      seat(1.75, 0.36, 'near'),
      seat(0.4, 1.18, 'both'),
    ],
  },
  // No windscreen or front wheels: the helper's bonneted layout leaves no front arch, and its cowl stops at the floor.
  aft: common {
    rear: -9, front: -1.6,
    bonnet: { cowl: -1.6, cowlY: 1.7, noseY: 1.5, flankY: 0.7, halfWidth: 0.9 },
    lean: 0, screens: [[0.36, portalTop]],
    floorRear: 0.82, floorStep: -4.72, engineDeck: { x: -7.25, y: 1.28 },
    decks: [{ waist: 1.15, top: 2.55, bayFront: -1.85, pitch: 1.4, bays: 4 }],
    rearAxle: -5.6,
    doors: [{ bay: 1 }],
    rearHoles: city.rearHoles, engineHatch: city.engineHatch,
    tailLampAt: [-9.03, 0.95, 1.1],
    shellMass: 5300,
    seats: [
      seat(-2.1, 0.36, 'both'),
      seat(-2.9, 0.36, 'both'),
      seat(-3.7, 0.36, 'far'),
      seat(-4.4, 0.36, 'far'),
      seat(-5.6, 1.18, 'both'),
      seat(-6.5, 0.82, 'both'),
      seat(-7.65, 1.28, 'both'),
      seat(-8.4, 1.28, 'both'),
    ],
  },
}
