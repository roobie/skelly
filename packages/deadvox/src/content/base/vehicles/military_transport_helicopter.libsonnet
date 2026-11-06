// Items and blueprint for the military transport helicopter. Its pressings fit at the origin (`packages/thing-authoring-tool/vehicles/military_transport_helicopter.libsonnet`).
local kit = import '../vehicle-kit.libsonnet';
local part = kit.part;
local fitting = kit.fitting;
local pair = kit.pair;
local on = kit.on;
local origin = kit.origin;
local pile = kit.pileSize;
local s = import 'packages/thing-authoring-tool/vehicles/military_transport_helicopter.spec.libsonnet';
local id = 'military_transport_helicopter';
{
  items: [
    part(id + '_belly', 'Military helicopter belly', pile, ['structure', 'protection']),
    part(id + '_tail_cone', 'Military helicopter tail cone', pile, ['structure', 'protection']),
    part(id + '_roof', 'Military helicopter cabin roof', pile, ['structure', 'protection']),
    part(id + '_windscreen', 'Military helicopter windscreen', pile, ['glazing']),
    part(id + '_cockpit_door', 'Military helicopter cockpit door', pile, ['entry', 'glazing', 'protection']),
    part(id + '_cabin_door', 'Military helicopter cabin door', pile, ['entry', 'glazing', 'protection']),
    part(id + '_side_window', 'Military helicopter side window', [8, 6], ['glazing']),
    part(id + '_engine_cowling', 'Military helicopter engine cowling', pile, ['protection', 'structure']),
    part(id + '_tail_boom', 'Military helicopter tail boom', pile, ['structure']),
    part(id + '_tail_surfaces', 'Military helicopter tail fin', pile, ['structure']),
    part(id + '_tail_rotor', 'Military helicopter tail rotor', pile, ['structure']),
    part(id + '_main_rotor', 'Military helicopter main rotor', pile, ['structure']),
    part(id + '_mast', 'Military helicopter mast', [10, 4], ['structure']),
    part(id + '_main_gearbox', 'Military helicopter main gearbox', [8, 6], ['structure']),
    part(id + '_turbine', 'Military helicopter turbine', pile, ['power']),
    part(id + '_fuel_tank', 'Military helicopter fuel tank', pile, ['fuel']),
    part(id + '_main_gear', 'Military helicopter main gear', pile, ['structure']),
    part(id + '_main_wheel', 'Military helicopter main wheel', [9, 6], ['wheel']),
    part(id + '_tail_gear', 'Military helicopter tail wheel strut', pile, ['structure']),
    part(id + '_tail_wheel', 'Military helicopter tail wheel', [5, 3], ['wheel']),
    part(id + '_crew_seat', 'Military helicopter crew seat', [7, 6], ['seat']),
    part(id + '_troop_bench', 'Military helicopter troop bench', pile, ['seat']),
    part(id + '_console', 'Military helicopter instrument console', pile, ['structure']),
    part(id + '_beacon', 'Military helicopter beacon', [2, 2], ['light']),
    part(id + '_landing_lamp', 'Military helicopter landing lamp', [3, 3], ['light']),
  ],
  blueprint: {
    id: id,
    name: 'Military transport helicopter',
    fittings: [
      fitting('belly', id + '_belly', origin),
      fitting('tail_cone', id + '_tail_cone', origin, ['belly']),
      fitting('roof', id + '_roof', origin, ['belly']),
      fitting('windscreen', id + '_windscreen', origin, ['roof']),
      fitting('engine_cowling', id + '_engine_cowling', origin, ['roof']),
      fitting('tail_boom', id + '_tail_boom', origin, ['tail_cone']),
      fitting('tail_surfaces', id + '_tail_surfaces', origin, ['tail_boom']),
      fitting('tail_rotor', id + '_tail_rotor', [s.tailRotor.x, s.tailRotor.y, s.tailRotor.z], ['tail_boom']),
      fitting('main_gearbox', id + '_main_gearbox', [0, 3.1, 0], ['engine_cowling']),
      fitting('mast', id + '_mast', [0, s.mastFoot, 0], ['main_gearbox']),
      fitting('main_rotor', id + '_main_rotor', [0, s.hub, 0], ['mast']),
      fitting('fuel_tank', id + '_fuel_tank', [-2.45, 1.45, 0], ['tail_cone']),
      fitting('main_gear', id + '_main_gear', origin, ['belly']),
      fitting('tail_gear', id + '_tail_gear', origin, ['tail_cone']),
      fitting('tail_wheel', id + '_tail_wheel', [s.tailGear.x, s.tailGear.radius, 0], ['tail_gear']),
      fitting('console', id + '_console', [3.85, s.floor, 0], ['belly']),
      fitting('beacon', id + '_beacon', [-9.12, 4.38, 0], ['tail_surfaces']),
      fitting('landing_lamp', id + '_landing_lamp', [5.0, 0.86, 0], ['belly']),
    ]
    + pair('turbine', id + '_turbine', [s.engine.x, s.engine.y, s.engine.z], on(['engine_cowling']))
    + pair('cockpit_door', id + '_cockpit_door', origin, on(['belly', 'roof']))
    + pair('cabin_door', id + '_cabin_door', origin, on(['belly', 'roof']))
    + pair('side_window', id + '_side_window', origin, on(['roof']))
    + pair('main_wheel', id + '_main_wheel', [s.mainGear.x, s.mainGear.radius, s.mainGear.z], on(['main_gear']))
    + pair('crew_seat', id + '_crew_seat', [2.95, s.floor, 0.56], on(['belly']))
    + pair('control_stick', 'control_stick', [3.3, s.floor, 0.56], on(['belly']))
    + pair('troop_bench', id + '_troop_bench', [0, s.floor, 0], on(['belly'])),
  },
}
