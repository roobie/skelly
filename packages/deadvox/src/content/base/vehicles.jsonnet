// Vehicle parts are items whose exported models carry mass, baked collision and datums; blueprints
// place them by item id in the vehicle frame (metres; x forward, y up, z toward the near side).
local part(id, name, size, capabilities, description=null) = {
  id: id,
  name: name,
  category: 'misc',
  model: id,
  size: size,
  vehicle: {
    capabilities: capabilities,
    obstruction: {
      // Glazing retains body collision but admits sight and light.
      sight: !std.member(capabilities, 'glazing'),
      light: !std.member(capabilities, 'glazing'),
      // Sound and combat remain explicit rather than inferred from a part name or model.
      sound: true,
      combat: true,
    },
  },
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
// The crane truck's parts are authored where they sit on it, near-side ones for their `pair`; the
// crossmembers and wheels repeat, so they are placed by their own frames.
local rails = ['frame_rail_near', 'frame_rail_far'];
local hoist = pair('frame_rail', 'hoist_frame_rail', origin, on()) + [
  fitting('crossmember_rear', 'hoist_crossmember', [-2.875, 0.40625, -0.4375], rails),
  fitting('crossmember_mid', 'hoist_crossmember', [-2.125, 0.40625, -0.4375], rails),
  fitting('crossmember_gearbox', 'hoist_crossmember', [0.8125, 0.40625, -0.4375], rails),
  fitting('crossmember_front', 'hoist_crossmember', [2.6875, 0.40625, -0.4375], rails),
  fitting('front_axle', 'hoist_front_axle', origin, rails),
  fitting('rear_axle', 'hoist_rear_axle', origin, rails),
  fitting('engine', 'hoist_engine', origin, rails),
  fitting('gearbox', 'hoist_gearbox', origin, ['engine', 'crossmember_gearbox']),
  fitting('prop_shaft', 'hoist_prop_shaft', origin, ['gearbox', 'rear_axle']),
  fitting('fuel_tank', 'hoist_fuel_tank', origin, ['frame_rail_far']),
  fitting('exhaust', 'hoist_exhaust', origin, ['frame_rail_near']),
  fitting('radiator', 'hoist_radiator', origin, ['crossmember_front']),
  fitting('cab_floor', 'hoist_cab_floor', origin, rails),
  fitting('cab_back', 'hoist_cab_back', origin, ['cab_floor']),
  fitting('front_panel', 'hoist_front_panel', origin, ['cab_floor']),
  fitting('windscreen', 'hoist_windscreen', origin, ['a_post_near', 'a_post_far', 'front_panel']),
  fitting('roof', 'hoist_roof', origin, ['a_post_near', 'a_post_far', 'cab_back']),
  fitting('front_bumper', 'hoist_front_bumper', origin, rails),
  fitting('dashboard', 'hoist_dashboard', origin, ['front_panel']),
  fitting('steering_wheel', 'steering_wheel', [2.51, 1.55, 0.4375], ['dashboard']),
  fitting('engine_cover', 'hoist_engine_cover', origin, ['cab_floor']),
  fitting('gear_lever', 'gear_lever', [2.09375, 1.25, 0], ['engine_cover']),
  fitting('bench', 'hoist_bench', origin, ['cab_floor']),
  fitting('deck_floor', 'hoist_deck_floor', origin, rails),
  fitting('headboard', 'hoist_headboard', origin, ['deck_floor']),
  fitting('rear_underrun', 'hoist_rear_underrun', origin, rails),
  fitting('crane_base', 'hoist_crane_base', origin, rails),
  fitting('crane_column', 'hoist_crane_column', origin, ['crane_base']),
  fitting('boom_rest', 'hoist_boom_rest', origin, ['deck_floor']),
  fitting('boom', 'hoist_boom', origin, ['crane_column']),
  fitting('boom_extension', 'hoist_boom_extension', origin, ['boom', 'boom_rest']),
  fitting('luff_ram', 'hoist_luff_ram', origin, ['crane_column']),
  fitting('winch', 'hoist_winch', origin, ['crane_column']),
  fitting('hook_block', 'hoist_hook_block', origin, ['boom_extension']),
] + pair('rear_wheel', 'hoist_wheel', [-1.5, 0.375, 0.703125], on(['rear_axle']))
  + pair('front_wheel', 'hoist_wheel', [1.90625, 0.375, 0.703125], on(['front_axle']))
  + pair('cab_skirt', 'hoist_cab_skirt', origin, on(['cab_floor']))
  + pair('a_post', 'hoist_a_post', origin, on(['front_panel']))
  + pair('door', 'hoist_door', origin, on(paired=['a_post']))
  + pair('mudguard', 'hoist_mudguard', origin, on(['deck_floor']))
  + pair('tail_lamp', 'hoist_tail_lamp', origin, on(['rear_underrun']))
  + pair('stabiliser', 'hoist_stabiliser', origin, on(['crane_base']))
  + headlamps(2.88, 1.125, 0.64, ['front_panel'])
  + batteryBay('pickup_battery_tray', [1.3125, 0.40625, 0.6825], ['frame_rail_near']);
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
    import 'things/hoist_frame_rail.model.json',
    import 'things/hoist_crossmember.model.json',
    import 'things/hoist_wheel.model.json',
    import 'things/hoist_front_axle.model.json',
    import 'things/hoist_rear_axle.model.json',
    import 'things/hoist_engine.model.json',
    import 'things/hoist_gearbox.model.json',
    import 'things/hoist_prop_shaft.model.json',
    import 'things/hoist_fuel_tank.model.json',
    import 'things/hoist_exhaust.model.json',
    import 'things/hoist_radiator.model.json',
    import 'things/hoist_cab_floor.model.json',
    import 'things/hoist_cab_skirt.model.json',
    import 'things/hoist_cab_back.model.json',
    import 'things/hoist_front_panel.model.json',
    import 'things/hoist_a_post.model.json',
    import 'things/hoist_windscreen.model.json',
    import 'things/hoist_roof.model.json',
    import 'things/hoist_door.model.json',
    import 'things/hoist_front_bumper.model.json',
    import 'things/hoist_dashboard.model.json',
    import 'things/hoist_engine_cover.model.json',
    import 'things/hoist_bench.model.json',
    import 'things/hoist_deck_floor.model.json',
    import 'things/hoist_headboard.model.json',
    import 'things/hoist_mudguard.model.json',
    import 'things/hoist_rear_underrun.model.json',
    import 'things/hoist_tail_lamp.model.json',
    import 'things/hoist_crane_base.model.json',
    import 'things/hoist_stabiliser.model.json',
    import 'things/hoist_crane_column.model.json',
    import 'things/hoist_boom.model.json',
    import 'things/hoist_boom_extension.model.json',
    import 'things/hoist_luff_ram.model.json',
    import 'things/hoist_winch.model.json',
    import 'things/hoist_hook_block.model.json',
    import 'things/hoist_boom_rest.model.json',
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
    part('hoist_frame_rail', 'Truck frame rail', pileSize, ['structure']),
    part('hoist_crossmember', 'Truck crossmember', [4, 2], ['structure']),
    part('hoist_wheel', 'Truck wheel', [6, 6], ['wheel']),
    part('hoist_front_axle', 'Truck front axle', [12, 4], ['steered', 'structure']),
    part('hoist_rear_axle', 'Truck rear axle', [12, 4], ['driven', 'structure']),
    part('hoist_engine', 'Truck diesel engine', [8, 6], ['power']),
    part('hoist_gearbox', 'Truck gearbox', [4, 3], ['driven']),
    part('hoist_prop_shaft', 'Truck prop shaft', [12, 1], []),
    part('hoist_fuel_tank', 'Truck fuel tank', [8, 4], ['fuel']),
    part('hoist_exhaust', 'Truck exhaust', [8, 2], []),
    part('hoist_radiator', 'Truck radiator', [6, 6], []),
    part('hoist_cab_floor', 'Truck cab floor', pileSize, ['structure']),
    part('hoist_cab_skirt', 'Truck cab skirt', [8, 2], ['protection']),
    part('hoist_cab_back', 'Truck cab back', pileSize, ['structure']),
    part('hoist_front_panel', 'Truck front panel', pileSize, ['structure']),
    part('hoist_a_post', 'Truck A-post', [2, 6], ['structure']),
    part('hoist_windscreen', 'Truck windscreen', pileSize, ['glazing']),
    part('hoist_roof', 'Truck cab roof', pileSize, ['protection']),
    part('hoist_door', 'Truck cab door', pileSize, ['entry', 'glazing', 'protection']),
    part('hoist_front_bumper', 'Truck front bumper', pileSize, ['protection']),
    part('hoist_dashboard', 'Truck dashboard', pileSize, ['structure']),
    part('hoist_engine_cover', 'Truck engine cover', [6, 3], []),
    part('hoist_bench', 'Truck bench seat', pileSize, ['seat']),
    part('hoist_deck_floor', 'Truck flat deck', pileSize, ['structure']),
    part('hoist_headboard', 'Truck headboard', pileSize, ['protection']),
    part('hoist_mudguard', 'Truck mudguard', [4, 3], ['protection']),
    part('hoist_rear_underrun', 'Truck rear underrun bar', [12, 2], ['structure']),
    part('hoist_tail_lamp', 'Truck tail lamp', [3, 2], ['light']),
    part('hoist_crane_base', 'Crane base', [8, 6], ['structure']),
    part('hoist_stabiliser', 'Crane stabiliser leg', [4, 8], ['stabiliser']),
    // One rating rather than a chart over reach; the reason is in `docs/vehicle-spike.md`, "The crane truck from content".
    part('hoist_crane_column', 'Crane column', [4, 8], ['lift']) + { vehicle+: { ratedLoadKg: 850 } },
    part('hoist_boom', 'Crane boom', [12, 2], ['structure']),
    part('hoist_boom_extension', 'Crane boom extension', [12, 2], ['structure']),
    part('hoist_luff_ram', 'Crane luffing ram', [6, 2], []),
    part('hoist_winch', 'Crane winch', [4, 3], []),
    part('hoist_hook_block', 'Crane hook block', [2, 3], []),
    part('hoist_boom_rest', 'Crane boom rest', [3, 4], ['structure']),
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
    { id: 'hoist', name: 'Crane truck', fittings: hoist },
  ],
})
