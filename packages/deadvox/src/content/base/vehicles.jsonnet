// Vehicle parts are items whose exported models carry mass, baked collision and datums; blueprints
// place them by item id in the vehicle frame (metres; x forward, y up, z toward the near side).
local part(id, name, size, capabilities, description=null) = {
  id: id,
  name: name,
  category: 'misc',
  model: id,
  size: size,
  vehicle: { capabilities: capabilities },
} + (if description == null then {} else { description: description });
local fitting(id, part, at, supportedBy=[]) = { id: id, part: part, at: at, supportedBy: supportedBy };
// A near-side fitting and its far-side twin, reflected across the centre plane. `0 - z` rather than `-z`
// keeps a centred twin at 0: -0 doesn't survive a JSON round trip, so the admitted registry would differ.
local pair(id, part, at, supportedBy) = [
  fitting(id + '_near', part, at, [support + '_near' for support in supportedBy.paired] + supportedBy.shared),
  fitting(id + '_far', part, [at[0], at[1], 0 - at[2]], [support + '_far' for support in supportedBy.paired] + supportedBy.shared) + { mirror: true },
];
local on(shared=[], paired=[]) = { shared: shared, paired: paired };
local batteryBay(tray, at, supportedBy=[]) = [
  fitting('battery_tray', tray, at, supportedBy),
  fitting('battery', 'car_battery', [at[0], at[1] + 0.03, at[2]], ['battery_tray']),
];
local headlamps(x, y, z, supportedBy=[]) = pair('headlamp', 'car_headlamp', [x, y, z], on(supportedBy));
// A factory cargo space: `at` is the centre of its footprint on the load floor, `cells` its size in inventory
// cells along x, y and z (`src/core/cargoSpace.ts`).
local cargoSpace(id, at, cells, floor) = fitting(id, 'cargo_space', at, [floor]) + { cargo: cells };
// The hatchback's own panels are pressed for its body and authored where they sit on it, so they fit at
// its origin; shared parts are placed by their own frames.
local origin = [0, 0, 0];
// `src/core/inventoryScale.ts`, `PILE_GRID`. A body panel is larger than a floor pile; the cap costs
// nothing until a carrying design gives oversized parts their own class.
local pileSize = [12, 6];
local hatchback = [
  fitting('shell', 'hatchback_shell', origin),
  fitting('windscreen', 'hatchback_windscreen', origin, ['shell']),
  fitting('tailgate', 'hatchback_tailgate', origin, ['shell']),
  fitting('bonnet', 'hatchback_bonnet', origin, ['shell']),
  fitting('front_bumper', 'hatchback_front_bumper', origin, ['shell']),
  fitting('rear_bumper', 'hatchback_rear_bumper', origin, ['shell']),
  fitting('rear_axle', 'hatchback_rear_axle', origin, ['shell']),
  fitting('engine', 'hatchback_engine', origin, ['shell']),
  fitting('gearbox', 'hatchback_gearbox', origin, ['engine']),
  fitting('radiator', 'hatchback_radiator', origin, ['shell']),
  fitting('fuel_tank', 'hatchback_fuel_tank', origin, ['shell']),
  fitting('exhaust', 'hatchback_exhaust', origin, ['engine', 'shell']),
  fitting('dashboard', 'hatchback_dashboard', origin, ['shell']),
  fitting('steering_wheel', 'steering_wheel', [0.3, 0.78, 0.37], ['dashboard']),
  fitting('gear_lever', 'gear_lever', [0.3, 0.55, 0], ['dashboard']),
  fitting('rear_seat', 'hatchback_rear_seat', origin, ['shell']),
] + pair('front_door', 'hatchback_front_door', origin, on(['shell']))
  + pair('rear_door', 'hatchback_rear_door', origin, on(['shell']))
  + pair('front_wing', 'hatchback_front_wing', origin, on(['shell']))
  + pair('tail_lamp', 'hatchback_tail_lamp', origin, on(['shell']))
  + pair('front_strut', 'hatchback_front_strut', origin, on(['shell']))
  + pair('front_wheel', 'wheel_205_55r16', [1.24, 0.316, 0.75], on(paired=['front_strut']))
  + pair('rear_wheel', 'wheel_205_55r16', [-1.27, 0.316, 0.75], on(['rear_axle']))
  + pair('front_seat', 'front_seat', [0, 0.3, 0.37], on(['shell']))
  + pair('door_mirror', 'door_mirror', [0.66, 0.98, 0.8675], on(['shell']))
  + headlamps(1.95, 0.64, 0.56, ['shell'])
  + batteryBay('hatchback_battery_tray', [1.54, 0.55, 0.42], ['shell']);
// The bed's factory cargo space runs between the wheel tubs; the strips beside them stay free floor.
local pickup = batteryBay('pickup_battery_tray', [1.9, 0.8, 0.35]) + headlamps(2.35, 0.85, 0.65) + [
  fitting('bed_floor', 'pickup_bed_floor', origin),
  fitting('bed_front', 'pickup_bed_front', origin, ['bed_floor']),
  cargoSpace('bed_cargo', [-1.15, 0.85, 0], [21, 4, 12], 'bed_floor'),
] + pair('bed_side', 'pickup_bed_side', origin, on(['bed_floor']));
// The van's cargo box: its factory cargo space covers the whole floor up to the roof.
local boxVan = [
  fitting('box_floor', 'box_van_floor', origin),
  fitting('box_front', 'box_van_front', origin, ['box_floor']),
  fitting('box_roof', 'box_van_roof', origin, ['box_front', 'box_side_near', 'box_side_far']),
  cargoSpace('box_cargo', [-0.9, 1, 0], [42, 20, 20], 'box_floor'),
] + pair('box_side', 'box_van_side', origin, on(['box_floor']));
(import 'economy.libsonnet').pack({
  models: [
    import 'things/car_battery.model.json',
    import 'things/car_headlamp.model.json',
    import 'things/hatchback_battery_tray.model.json',
    import 'things/pickup_battery_tray.model.json',
    import 'things/wheel_205_55r16.model.json',
    import 'things/front_seat.model.json',
    import 'things/door_mirror.model.json',
    import 'things/steering_wheel.model.json',
    import 'things/gear_lever.model.json',
    import 'things/hatchback_shell.model.json',
    import 'things/hatchback_front_door.model.json',
    import 'things/hatchback_rear_door.model.json',
    import 'things/hatchback_tailgate.model.json',
    import 'things/hatchback_windscreen.model.json',
    import 'things/hatchback_bonnet.model.json',
    import 'things/hatchback_front_wing.model.json',
    import 'things/hatchback_front_bumper.model.json',
    import 'things/hatchback_rear_bumper.model.json',
    import 'things/hatchback_tail_lamp.model.json',
    import 'things/hatchback_front_strut.model.json',
    import 'things/hatchback_rear_axle.model.json',
    import 'things/hatchback_engine.model.json',
    import 'things/hatchback_gearbox.model.json',
    import 'things/hatchback_radiator.model.json',
    import 'things/hatchback_fuel_tank.model.json',
    import 'things/hatchback_exhaust.model.json',
    import 'things/hatchback_dashboard.model.json',
    import 'things/hatchback_rear_seat.model.json',
    import 'things/cargo_space.model.json',
    import 'things/pickup_bed_floor.model.json',
    import 'things/pickup_bed_side.model.json',
    import 'things/pickup_bed_front.model.json',
    import 'things/box_van_floor.model.json',
    import 'things/box_van_side.model.json',
    import 'things/box_van_front.model.json',
    import 'things/box_van_roof.model.json',
  ],
  items: [
    part('car_battery', 'Car battery', [3, 2], ['electricity'], 'Twelve volts, if it still holds a charge.'),
    part('car_headlamp', 'Headlamp unit', [2, 2], ['light', 'glazing'], 'A sealed lamp and its lens.'),
    part('hatchback_battery_tray', 'Hatchback battery tray', [3, 2], ['structure'], 'A pressed steel shelf for a battery.'),
    part('pickup_battery_tray', 'Pickup battery tray', [4, 3], ['structure'], 'A heavy steel shelf for a battery.'),
    part('wheel_205_55r16', 'Wheel 205/55 R16', [6, 6], ['wheel']),
    part('front_seat', 'Front seat', [5, 10], ['seat']),
    part('door_mirror', 'Door mirror', [2, 2], []),
    part('steering_wheel', 'Steering wheel', [4, 4], ['steered']),
    part('gear_lever', 'Gear lever', [1, 3], []),
    // A body panel is larger than a floor pile; until carrying one is designed, panels take the pile's whole size.
    part('hatchback_shell', 'Hatchback body shell', pileSize, ['structure', 'protection', 'storage']),
    part('hatchback_front_door', 'Hatchback front door', pileSize, ['entry', 'glazing', 'protection']),
    part('hatchback_rear_door', 'Hatchback rear door', pileSize, ['entry', 'glazing', 'protection']),
    part('hatchback_tailgate', 'Hatchback tailgate', pileSize, ['entry', 'glazing']),
    part('hatchback_windscreen', 'Hatchback windscreen', pileSize, ['glazing']),
    part('hatchback_bonnet', 'Hatchback bonnet', pileSize, ['protection']),
    part('hatchback_front_wing', 'Hatchback front wing', pileSize, ['protection']),
    part('hatchback_front_bumper', 'Hatchback front bumper', pileSize, ['protection']),
    part('hatchback_rear_bumper', 'Hatchback rear bumper', pileSize, ['protection']),
    part('hatchback_tail_lamp', 'Hatchback tail lamp', [3, 2], ['light']),
    part('hatchback_front_strut', 'Hatchback front strut', [4, 6], ['structure']),
    part('hatchback_rear_axle', 'Hatchback rear axle', [12, 4], ['structure']),
    part('hatchback_engine', 'Hatchback engine', [6, 5], ['power']),
    part('hatchback_gearbox', 'Hatchback gearbox', [3, 3], ['driven']),
    part('hatchback_radiator', 'Hatchback radiator', [10, 4], []),
    part('hatchback_fuel_tank', 'Hatchback fuel tank', [5, 4], ['fuel']),
    part('hatchback_exhaust', 'Hatchback exhaust', [12, 2], []),
    part('hatchback_dashboard', 'Hatchback dashboard', pileSize, ['structure']),
    part('hatchback_rear_seat', 'Hatchback rear seat', pileSize, ['seat']),
    part('cargo_space', 'Cargo space', [1, 1], ['storage'], 'Room marked out on a load floor for what the vehicle carries.') + {
      vehicle+: {
        cargoSpace: {
          handlingSimSeconds: 1.2,
          openClearanceCells: 20,
          wideReason: 'A cargo space is as wide as the floor it covers, not a carried bag.',
        },
      },
    },
    part('pickup_bed_floor', 'Pickup bed floor', pileSize, ['structure', 'load_floor']),
    part('pickup_bed_side', 'Pickup bed side', pileSize, ['protection']),
    part('pickup_bed_front', 'Pickup headboard', pileSize, ['protection']),
    part('box_van_floor', 'Box van floor', pileSize, ['structure', 'load_floor']),
    part('box_van_side', 'Box van side wall', pileSize, ['protection']),
    part('box_van_front', 'Box van front wall', pileSize, ['protection']),
    part('box_van_roof', 'Box van roof', pileSize, ['protection']),
  ],
  vehicleBlueprints: [
    { id: 'hatchback', name: 'Hatchback', fittings: hatchback },
    { id: 'pickup', name: 'Pickup', fittings: pickup },
    { id: 'box_van', name: 'Box van', fittings: boxVan },
  ],
})
