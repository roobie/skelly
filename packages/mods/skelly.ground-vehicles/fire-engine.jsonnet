// The fire engine and its own parts. It is its own file because its lockers stow another pack's kit and no other
// vehicle in this file does, so a check that loads the other vehicles needs nothing from that pack. Parts it shares
// with other vehicles are in `vehicles.jsonnet`.
local vehicles = import 'packages/mods/skelly.ground-vehicles/vehicles.libsonnet';
local part = vehicles.part;
local opens = vehicles.opens;
local pileSize = vehicles.pileSize;
local lockers = ['fore', 'mid', 'wheel', 'aft'];
// A cab-over on a ladder chassis: the cab, the body, the axles and the running gear hang on the chassis; the body's
// lockers, gantry and pump hang on the body, and each door stripe rides its own door.
local fireEngineSites = (import 'packages/skelly-assets/built/skelly.ground-vehicles/vehicles/fire_engine.placements.json').sites;
local fireEngineSupports = {
  chassis: [],
  front_axle: ['chassis'],
  rear_axle: ['chassis'],
  cab: ['chassis'],
  windscreen: ['cab'],
  dashboard: ['cab'],
  front_panel: ['cab'],
  front_bumper: ['chassis'],
  rear_underrun: ['chassis'],
  engine: ['chassis'],
  gearbox: ['engine'],
  radiator: ['chassis'],
  fuel_tank: ['chassis'],
  exhaust: ['engine', 'chassis'],
  prop_shaft: ['gearbox', 'rear_axle_0'],
  steering_wheel: ['dashboard'],
  instrument_binnacle: ['dashboard'],
  gear_lever: ['cab'],
  seat_riser: ['cab'],
  seat: ['seat_riser'],
  crew_bench: ['cab'],
  door: ['cab'],
  crew_door: ['cab'],
  door_stripe: ['door'],
  crew_door_stripe: ['crew_door'],
  cab_stripe: ['cab'],
  mirror: ['cab'],
  headlamp: ['cab'],
  marker_lamp: ['cab'],
  marker_lamp_mid: ['cab'],
  cab_beacon: ['cab'],
  front_wheel: ['front_axle'],
  front_wheel_brake_disc: ['front_axle'],
  front_wheel_caliper: ['front_axle'],
  rear_wheel: ['rear_axle'],
  rear_inner_wheel: ['rear_axle'],
  rear_inner_wheel_0_brake_disc: ['rear_axle_0'],
  rear_inner_wheel_0_caliper: ['rear_axle_0'],
  battery_tray: ['chassis'],
  battery: ['battery_tray'],
  body: ['chassis'],
  rear_wall: ['body'],
  water_tank: ['chassis'],
  gantry: ['body'],
  roof_ladder: ['gantry'],
  pump_panel: ['body'],
  hose_reel: ['body'],
  rear_step: ['chassis'],
  tail_lamp: ['body'],
  rear_beacon: ['body'],
} + { ['locker_shutter_' + locker]: ['body'] for locker in lockers }
  + { ['locker_stowage_' + locker]: ['body'] for locker in lockers };
local stowageModels = {
  fore: import 'packages/skelly-assets/built/skelly.ground-vehicles/things/fire_engine_locker_stowage_fore.model.json',
  mid: import 'packages/skelly-assets/built/skelly.ground-vehicles/things/fire_engine_locker_stowage_mid.model.json',
  wheel: import 'packages/skelly-assets/built/skelly.ground-vehicles/things/fire_engine_locker_stowage_wheel.model.json',
  aft: import 'packages/skelly-assets/built/skelly.ground-vehicles/things/fire_engine_locker_stowage_aft.model.json',
};
// The factory load-out, from the hand tools this pack depends on; the release's own kit is not in the game yet, so
// the other slots come empty.
local fireEngineStowed = {
  locker_stowage_mid: { hook_c: 'sledgehammer', hook_d: 'crowbar' },
};
(import 'tools/jsonnet/lib/item-presentation.libsonnet')(
  import 'presentation/item-materials.json',
).pack((import 'tools/jsonnet/lib/item-policy.libsonnet').itemPack({
  models: [
    import 'packages/skelly-assets/built/skelly.ground-vehicles/things/fire_engine_chassis.model.json',
    import 'packages/skelly-assets/built/skelly.ground-vehicles/things/fire_engine_cab.model.json',
    import 'packages/skelly-assets/built/skelly.ground-vehicles/things/fire_engine_windscreen.model.json',
    import 'packages/skelly-assets/built/skelly.ground-vehicles/things/fire_engine_dashboard.model.json',
    import 'packages/skelly-assets/built/skelly.ground-vehicles/things/fire_engine_front_panel.model.json',
    import 'packages/skelly-assets/built/skelly.ground-vehicles/things/fire_engine_front_bumper.model.json',
    import 'packages/skelly-assets/built/skelly.ground-vehicles/things/fire_engine_rear_underrun.model.json',
    import 'packages/skelly-assets/built/skelly.ground-vehicles/things/fire_engine_door.model.json',
    import 'packages/skelly-assets/built/skelly.ground-vehicles/things/fire_engine_crew_door.model.json',
    import 'packages/skelly-assets/built/skelly.ground-vehicles/things/fire_engine_door_stripe.model.json',
    import 'packages/skelly-assets/built/skelly.ground-vehicles/things/fire_engine_crew_door_stripe.model.json',
    import 'packages/skelly-assets/built/skelly.ground-vehicles/things/fire_engine_cab_stripe.model.json',
    import 'packages/skelly-assets/built/skelly.ground-vehicles/things/fire_engine_body.model.json',
    import 'packages/skelly-assets/built/skelly.ground-vehicles/things/fire_engine_rear_wall.model.json',
    import 'packages/skelly-assets/built/skelly.ground-vehicles/things/fire_engine_water_tank.model.json',
    import 'packages/skelly-assets/built/skelly.ground-vehicles/things/fire_engine_gantry.model.json',
    import 'packages/skelly-assets/built/skelly.ground-vehicles/things/fire_engine_roof_ladder.model.json',
    import 'packages/skelly-assets/built/skelly.ground-vehicles/things/fire_engine_pump_panel.model.json',
    import 'packages/skelly-assets/built/skelly.ground-vehicles/things/fire_engine_hose_reel.model.json',
    import 'packages/skelly-assets/built/skelly.ground-vehicles/things/fire_engine_rear_step.model.json',
    import 'packages/skelly-assets/built/skelly.ground-vehicles/things/fire_engine_locker_shutter_fore.model.json',
    import 'packages/skelly-assets/built/skelly.ground-vehicles/things/fire_engine_locker_shutter_mid.model.json',
    import 'packages/skelly-assets/built/skelly.ground-vehicles/things/fire_engine_locker_shutter_wheel.model.json',
    import 'packages/skelly-assets/built/skelly.ground-vehicles/things/fire_engine_locker_shutter_aft.model.json',
  ] + [stowageModels[locker] for locker in lockers],
  items: [
    part('fire_engine_chassis', 'Fire engine chassis', pileSize, ['structure']),
    part('fire_engine_cab', 'Fire engine crew cab', pileSize, ['structure', 'protection']),
    part('fire_engine_windscreen', 'Fire engine windscreen', pileSize, ['glazing']),
    part('fire_engine_dashboard', 'Fire engine dashboard', pileSize, ['structure']),
    part('fire_engine_front_panel', 'Fire engine front panel', pileSize, ['protection']),
    part('fire_engine_front_bumper', 'Fire engine front bumper', pileSize, ['protection']),
    part('fire_engine_rear_underrun', 'Fire engine rear underrun bar', [12, 3], ['structure']),
    part('fire_engine_door', 'Fire engine cab door', pileSize, ['entry', 'glazing', 'protection'], opening=opens.door),
    part('fire_engine_crew_door', 'Fire engine crew door', pileSize, ['entry', 'glazing', 'protection'], opening=opens.door),
    part('fire_engine_door_stripe', 'Fire engine door stripe', [12, 1], []),
    part('fire_engine_crew_door_stripe', 'Fire engine crew door stripe', [12, 1], []),
    part('fire_engine_cab_stripe', 'Fire engine cab stripe', [12, 1], []),
    part('fire_engine_body', 'Fire engine body', pileSize, ['structure', 'protection']),
    part('fire_engine_rear_wall', 'Fire engine body rear wall', pileSize, ['protection']),
    part('fire_engine_water_tank', 'Fire engine water tank', pileSize, []),
    part('fire_engine_gantry', 'Fire engine roof gantry', pileSize, ['structure']),
    part('fire_engine_roof_ladder', 'Fire engine roof ladder', pileSize, []),
    part('fire_engine_pump_panel', 'Fire pump panel', pileSize, []),
    part('fire_engine_hose_reel', 'Hose reel', [12, 5], []),
    part('fire_engine_rear_step', 'Fire engine rear step', [12, 3], ['structure']),
  ] + [
    part('fire_engine_locker_shutter_' + locker, 'Fire engine %s locker shutter' % locker, pileSize, ['protection'], opening=opens.shutter)
    for locker in lockers
  ] + [
    part('fire_engine_locker_stowage_' + locker, 'Fire engine %s locker stowage' % locker, pileSize, ['storage'])
    + { container: vehicles.stowageContainer(stowageModels[locker]) }
    for locker in lockers
  ],
  vehicleBlueprints: [
    { id: 'fire_engine', name: 'Fire engine', fittings: vehicles.releasedFittings(fireEngineSites, fireEngineSupports, 'paint-red', ['front_wheel', 'rear_wheel', 'rear_inner_wheel', 'front_wheel_brake_disc', 'rear_inner_wheel_0_brake_disc'], fireEngineStowed) },
  ],
}))
