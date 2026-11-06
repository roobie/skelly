// Items and blueprint for the heavy cargo helicopter. Its pressings fit at the origin (`packages/thing-authoring-tool/vehicles/heavy_cargo_helicopter.libsonnet`).
local kit = import '../vehicle-kit.libsonnet';
local part = kit.part;
local fitting = kit.fitting;
local pair = kit.pair;
local on = kit.on;
local origin = kit.origin;
local pile = kit.pileSize;
local s = import 'packages/thing-authoring-tool/vehicles/heavy_cargo_helicopter.spec.libsonnet';
local id = 'heavy_cargo_helicopter';
{
  items: [
    part(id + '_belly', 'Cargo helicopter belly', pile, ['structure', 'protection']),
    part(id + '_load_floor', 'Cargo helicopter load floor', pile, ['structure', 'load_floor']),
    part(id + '_fuselage', 'Cargo helicopter fuselage', pile, ['structure', 'protection']),
    part(id + '_tail_section', 'Cargo helicopter tail section', pile, ['structure', 'protection']),
    part(id + '_cockpit_bulkhead', 'Cargo helicopter cockpit bulkhead', pile, ['structure']),
    part(id + '_ramp', 'Cargo helicopter loading ramp', pile, ['entry', 'structure']),
    part(id + '_windscreen', 'Cargo helicopter windscreen', pile, ['glazing']),
    part(id + '_crew_door', 'Cargo helicopter crew door', pile, ['entry', 'glazing', 'protection']),
    part(id + '_cabin_windows', 'Cargo helicopter cabin windows', pile, ['glazing']),
    part(id + '_sponson', 'Cargo helicopter sponson', pile, ['structure', 'protection']),
    part(id + '_front_pylon', 'Cargo helicopter front pylon', pile, ['structure']),
    part(id + '_rear_pylon', 'Cargo helicopter rear pylon', pile, ['structure']),
    part(id + '_front_rotor', 'Cargo helicopter front rotor', pile, ['structure']),
    part(id + '_rear_rotor', 'Cargo helicopter rear rotor', pile, ['structure']),
    part(id + '_mast', 'Cargo helicopter mast', [10, 4], ['structure']),
    part(id + '_gearbox', 'Cargo helicopter gearbox', pile, ['structure']),
    part(id + '_turbine', 'Cargo helicopter turbine', pile, ['power']),
    part(id + '_fuel_tank', 'Cargo helicopter fuel tank', pile, ['fuel']),
    part(id + '_front_gear', 'Cargo helicopter front gear', pile, ['structure']),
    part(id + '_rear_gear', 'Cargo helicopter rear gear', pile, ['structure']),
    part(id + '_wheel', 'Cargo helicopter wheel', [10, 6], ['wheel']),
    part(id + '_crew_seat', 'Cargo helicopter crew seat', [7, 6], ['seat']),
    part(id + '_console', 'Cargo helicopter instrument console', pile, ['structure']),
    part(id + '_cockpit_floor', 'Cargo helicopter cockpit floor', pile, ['structure']),
    part(id + '_beacon', 'Cargo helicopter beacon', [2, 2], ['light']),
    part(id + '_landing_lamp', 'Cargo helicopter landing lamp', [3, 3], ['light']),
  ],
  blueprint: {
    id: id,
    name: 'Heavy cargo helicopter',
    fittings: [
      fitting('belly', id + '_belly', origin),
      fitting('load_floor', id + '_load_floor', origin, ['belly']),
      fitting('cockpit_floor', id + '_cockpit_floor', origin, ['belly']),
      fitting('fuselage', id + '_fuselage', origin, ['belly']),
      fitting('tail_section', id + '_tail_section', origin, ['fuselage']),
      fitting('cockpit_bulkhead', id + '_cockpit_bulkhead', origin, ['fuselage']),
      fitting('ramp', id + '_ramp', origin, ['load_floor']),
      fitting('windscreen', id + '_windscreen', origin, ['fuselage']),
      fitting('front_pylon', id + '_front_pylon', origin, ['fuselage']),
      fitting('rear_pylon', id + '_rear_pylon', origin, ['fuselage']),
      fitting('front_gearbox', id + '_gearbox', [s.frontHub.x, s.frontMastFoot - 0.3, 0], ['front_pylon']),
      fitting('rear_gearbox', id + '_gearbox', [s.rearHub.x, s.rearMastFoot - 0.3, 0], ['rear_pylon']),
      fitting('front_mast', id + '_mast', [s.frontHub.x, s.frontMastFoot, 0], ['front_gearbox']),
      fitting('rear_mast', id + '_mast', [s.rearHub.x, s.rearMastFoot, 0], ['rear_gearbox']),
      fitting('front_rotor', id + '_front_rotor', [s.frontHub.x, s.frontHub.y, 0], ['front_mast']),
      fitting('rear_rotor', id + '_rear_rotor', [s.rearHub.x, s.rearHub.y, 0], ['rear_mast']),
      fitting('front_gear', id + '_front_gear', origin, ['belly']),
      fitting('rear_gear', id + '_rear_gear', origin, ['belly']),
      fitting('console', id + '_console', [6.75, s.floorTop, 0], ['cockpit_floor']),
      fitting('beacon', id + '_beacon', [-6.0, 5.1, 0.3], ['rear_pylon']),
      fitting('landing_lamp', id + '_landing_lamp', [6.4, 0.53, 0], ['belly']),
      kit.cargoSpace('hold', [s.cargo.at[0], s.floorTop, s.cargo.at[1]], s.cargo.cells, 'load_floor'),
    ]
    + pair('crew_door', id + '_crew_door', origin, on(['belly', 'fuselage']))
    + pair('cabin_windows', id + '_cabin_windows', origin, on(['fuselage']))
    + pair('sponson', id + '_sponson', origin, on(['belly']))
    + pair('fuel_tank', id + '_fuel_tank', [0, 0.72, 2.05], on([], ['sponson']))
    + pair('turbine', id + '_turbine', [s.engine.x, s.engine.y, s.engine.z], on(['rear_pylon']))
    + pair('front_wheel', id + '_wheel', [s.frontGear.x, s.frontGear.radius, s.frontGear.z], on(['front_gear']))
    + pair('rear_wheel', id + '_wheel', [s.rearGear.x, s.rearGear.radius, s.rearGear.z], on(['rear_gear']))
    + pair('crew_seat', id + '_crew_seat', [6.0, s.floorTop, 0.62], on(['cockpit_floor']))
    + pair('control_stick', 'control_stick', [6.35, s.floorTop, 0.62], on(['cockpit_floor'])),
  },
}
