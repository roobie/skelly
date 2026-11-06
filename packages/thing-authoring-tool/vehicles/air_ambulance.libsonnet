local k = import 'kit.libsonnet';
local h = import 'helicopter-kit.libsonnet';
local s = import 'air_ambulance.spec.libsonnet';
local box = k.box;
local turned = k.turned;
local dome = [-90, 90];
local trim = 'paint-charcoal';
local skin(id, slot, x, arc, sides=120) = h.shell(id, slot, s.body, thick=0.0625, x=x, arc=arc, sides=sides);
local flanks(id, slot, x, arc) = skin(id + '_near', slot, x, arc) + skin(id + '_far', slot, x, [360 - arc[1], 360 - arc[0]]);
local core = [
  station + { top: station.top - 0.05, bottom: station.bottom + 0.05, half: std.max(station.half - 0.05, 0.03) }
  for station in s.body
];
local hingeRib(id, stations, x, from, to) =
  local low = h.point(stations, x, to);
  local high = h.point(stations, x, from);
  box(id, 'frame', [x - 0.03, low[0], high[1] - 0.06], [x + 0.03, high[0], high[1]]);
local hinges = { hinge_a: ['hinge_rib', [0.5, 0, 0.5]], hinge_b: ['hinge_rib', [0.5, 1, 0.5]] };
local bow(id, x) = h.shell(id, 'paint', s.body, x=[x - 0.035, x + 0.035], arc=dome, step=0.07);
local proudCowl = [station + { half: station.half + 0.035, top: station.top + 0.035 } for station in s.cowl];
local boomAt(x) =
  local u = (s.boom.root.x - x) / (s.boom.root.x - s.boom.tip.x);
  { x: x, y: s.boom.root.y + u * (s.boom.tip.y - s.boom.root.y), r: s.boom.root.r + u * (s.boom.tip.r - s.boom.root.r) };
// A green cross on a white field in the lower band behind the sliding door, below the rear window. Skin tiles follow the
// curved flank, so the field and the plus are laid edge to edge instead of stacked.
local cross = { field: [-1.8125, -1.1875], bar: [-1.6875, -1.3125], post: [-1.5625, -1.4375], barArc: [79, 83.5], postArc: [74, 88] };
local crossPanel =
  flanks('field_aft', 'paint', [cross.field[0], cross.bar[0]], [72, 90])
  + flanks('field_fore', 'paint', [cross.bar[1], cross.field[1]], [72, 90])
  + std.flattenArrays([
    flanks('field_' + band.n + '_high', 'paint', band.x, [72, cross.barArc[0]])
    + flanks('field_' + band.n + '_low', 'paint', band.x, [cross.barArc[1], 90])
    for band in [{ n: 'bar_aft', x: [cross.bar[0], cross.post[0]] }, { n: 'bar_fore', x: [cross.post[1], cross.bar[1]] }]
  ])
  + flanks('field_post_high', 'paint', cross.post, [72, cross.postArc[0]])
  + flanks('field_post_low', 'paint', cross.post, [cross.postArc[1], 90])
  + flanks('cross_bar', 'cross', cross.bar, cross.barArc)
  + flanks('cross_post_high', 'cross', cross.post, [cross.postArc[0], cross.barArc[0]])
  + flanks('cross_post_low', 'cross', cross.post, [cross.barArc[1], cross.postArc[1]]);
local seat(id, massKg, half) = k.compound(id, massKg, [
  box('pan', 'dark', [-0.24, 0, -half], [0.22, 0.08, half]),
  box('cushion', 'seat', [-0.24, 0.08, -half], [0.22, 0.18, half]),
  k.prism('back', 'seat', [[-0.3, 0.14], [-0.2, 0.14], [-0.24, 0.82], [-0.33, 0.82]], [-half, half]),
], { dark: trim, seat: 'cloth-seat' });
[
  k.compound('air_ambulance_belly', s.shellMass,
             h.loft('core', 'floor', core, x=[s.tail, s.noseCap], arc=[90, 270])
             + skin('keel', 'accent', [s.tail, s.nose - 0.02], [90, 270], 32),
             { accent: s.accent, floor: trim }),
  k.compound('air_ambulance_cabin_floor', 45, [
    box('deck', 'mat', [s.floorRear, s.floor - 0.0625, -0.72], [s.floorFront, s.floor, 0.72]),
  ], { mat: 'rubber-black' }),
  k.compound('air_ambulance_nose_cap', 9,
             h.loft('cap', 'accent', s.body, x=[s.noseCap, s.nose], arc=dome, step=0.04),
             { accent: s.accent }),
  k.compound('air_ambulance_windscreen', 28,
             h.shell('screen', 'glass', s.body, x=[s.doorFront + 0.035, s.noseCap], arc=dome)
             + h.shell('post', 'frame', s.body, x=[s.doorFront + 0.035, s.noseCap], arc=[-4, 4], sides=48),
             { glass: 'glass-clear', frame: s.paint }),
  k.compound('air_ambulance_roof', 70,
             skin('roof', 'paint', [s.doorRear, s.doorFront + 0.035], [-s.roofArc, s.roofArc], 32)
             + bow('front_bow', s.doorFront)
             + bow('mid_bow', s.doorMid)
             + bow('rear_bow', s.doorRear),
             { paint: s.paint }),
  k.compound('air_ambulance_cabin_rear', 90,
             skin('roof', 'paint', [s.tail, s.doorRear - 0.035], [-48, 48], 32)
             + flanks('lower', 'accent', [s.tail, cross.field[0]], [72, 90])
             + flanks('lower_fore', 'accent', [cross.field[1], s.doorRear - 0.035], [72, 90])
             + crossPanel
             + flanks('mid', 'paint', [s.tail, s.doorRear - 0.035], [68, 72])
             + flanks('window', 'glass', [-1.8, -1.2], [48, 68])
             + flanks('stile_rear', 'paint', [s.tail, -1.8], [48, 68])
             + flanks('stile_front', 'paint', [-1.2, s.doorRear - 0.035], [48, 68])
             + h.shell('ring', 'paint', s.body, thick=0.14, x=[s.tail, s.tail + 0.04], step=0.04, sides=32)
             + h.loft('lintel', 'paint', s.body, x=[s.tail, s.tail + 0.04], arc=[-50, 50], step=0.04),
             { paint: s.paint, accent: s.accent, glass: 'glass-clear', cross: 'paint-green' }),
  k.compound('air_ambulance_front_door', 20,
             skin('pane', 'glass', [s.doorMid + 0.035, s.doorFront - 0.035], [s.roofArc + 5, 72], 48)
             + skin('sill', 'accent', [s.doorMid + 0.035, s.doorFront - 0.035], [72, 90])
             + skin('head', 'frame', [s.doorMid + 0.035, s.doorFront - 0.035], [s.roofArc, s.roofArc + 5])
             + [hingeRib('hinge_rib', s.body, s.doorFront - 0.065, s.roofArc + 4, 88)],
             { glass: 'glass-clear', frame: s.paint, accent: s.accent },
             hinges),
  k.compound('air_ambulance_sliding_door', 38,
             skin('head', 'paint', [s.doorRear + 0.035, s.doorMid - 0.035], [s.roofArc, 40])
             + skin('pane', 'glass', [s.doorRear + 0.14, s.doorMid - 0.14], [40, 62], 48)
             + skin('stile_rear', 'paint', [s.doorRear + 0.035, s.doorRear + 0.14], [40, 62])
             + skin('stile_front', 'paint', [s.doorMid - 0.14, s.doorMid - 0.035], [40, 62])
             + skin('mid', 'paint', [s.doorRear + 0.035, s.doorMid - 0.035], [62, 72])
             + skin('lower', 'accent', [s.doorRear + 0.035, s.doorMid - 0.035], [72, 90])
             + [
               hingeRib('hinge_rib', s.body, s.doorMid - 0.065, s.roofArc + 4, 88),
               box('handle', 'dark', [s.doorMid - 0.3, 1.34, 0.86], [s.doorMid - 0.14, 1.38, 0.92]),
             ],
             { glass: 'glass-clear', paint: s.paint, frame: s.paint, accent: s.accent, dark: trim },
             hinges),
  k.compound('air_ambulance_door_track', 5, [
    box('sill_track', 'dark', [-1.85, 0.8, 0.84], [s.doorRear, 0.84, 0.92]),
  ], { dark: trim }),
  k.compound('air_ambulance_clamshell_door', 26,
             h.shell('wall', 'paint', s.clamshell, thick=0.06, x=[-2.19, s.tail - 0.0], arc=[3, 177], sides=32)
             + h.loft('plate', 'paint', s.clamshell, x=[-2.25, -2.19], arc=[3, 177], step=0.06, sides=32)
             + [
               box('band', 'accent', [-2.27, 0.84, 0.03], [-2.25, 1.02, 0.42]),
               box('window', 'tint', [-2.27, 1.2, 0.1], [-2.25, 1.58, 0.46]),
               box('handle', 'dark', [-2.28, 1.1, 0.04], [-2.25, 1.14, 0.18]),
               hingeRib('hinge_rib', s.clamshell, s.tail - 0.03, 40, 140),
             ],
             { paint: s.paint, accent: s.accent, tint: 'glass-grey', dark: trim, frame: s.paint },
             hinges),
  k.compound('air_ambulance_engine_cowl', 38,
             h.loft('cowl', 'paint', s.cowl)
             + h.shell('intake_near', 'dark', proudCowl, thick=0.05, x=[-1.05, -0.65], arc=[50, 100], sides=24)
             + h.shell('intake_far', 'dark', proudCowl, thick=0.05, x=[-1.05, -0.65], arc=[260, 310], sides=24)
             + [
               turned('pylon', 'paint', 'y', [[2.36, 0], [2.36, 0.44], [2.92, 0.17], [2.92, 0], [2.36, 0]]) + { sides: 12 },
             ]
             + k.bothSides([
               turned('exhaust', 'dark', 'x', k.annulus(0.04, 0.13, -2.24, -1.98), [0, 2.36, 0.2]) + { sides: 12 },
             ]),
             { paint: s.paint, dark: trim }),
  k.compound('air_ambulance_tail_boom', 62,
             h.boom('boom_fore', 'paint', s.boom.root, boomAt(s.boom.band[0]))
             + h.boom('boom_band', 'accent', boomAt(s.boom.band[0]), boomAt(s.boom.band[1]))
             + h.boom('boom_aft', 'paint', boomAt(s.boom.band[1]), s.boom.tip)
             + [box('gearbox', 'dark', [s.tailRotor.x - 0.1, s.tailRotor.y - 0.09, -0.09], [s.tailRotor.x + 0.1, s.tailRotor.y + 0.09, 0.09])],
             { paint: s.paint, accent: s.accent, dark: trim }),
  k.compound('air_ambulance_tail_surfaces', 14, [
    h.fin('fin', 'accent', [[-6.2, 2.12], [-6.85, 2.12], [-7.16, 3.25], [-6.8, 3.25]]),
    h.fin('ventral', 'accent', [[-6.35, 2.2], [-6.82, 2.2], [-7.02, 1.36], [-6.76, 1.36]]),
    box('stabiliser', 'paint', [-5.24, 2.14, -1.1], [-4.84, 2.2, 1.1]),
  ] + k.bothSides([
    h.fin('finlet', 'accent', [[-5.3, 2.0], [-4.82, 2.0], [-4.82, 2.36], [-5.3, 2.36]]) + { start: 1.1, end: 1.15 },
  ]), { paint: s.paint, accent: s.accent }),
  h.tailRotor('air_ambulance_tail_rotor', 12, s.tailRotor.radius, chord=0.16, shaft=s.tailRotor.z),
  h.mainRotor('air_ambulance_main_rotor', 190, s.rotorRadius, blades=4, chord=0.3, droop=0.3, phase=30, hub=0.18),
  h.mast('air_ambulance_mast', 35, s.hub - s.mastFoot, radius=0.07),
  k.compound('air_ambulance_main_gearbox', 130, [
    turned('case', 'steel', 'y', [[0, 0], [0, 0.26], [0.2, 0.18], [0.36, 0.11], [0.36, 0], [0, 0]]) + { sides: 12 },
  ], { steel: 'steel-grey' }),
  h.turbine('air_ambulance_turbine', 125, 1.0, 0.2),
  k.compound('air_ambulance_fuel_tank', 25, [
    box('tank', 'alu', [-0.9, 0, -0.5], [0.4, 0.2, 0.5]),
  ], { alu: 'alu-bare' }),
  h.skids('air_ambulance_skids', 65, [-1.35, 1.75], 1.12, [
    { x: 1.15, top: 0.6, root: 0.55 },
    { x: -0.9, top: 0.62, root: 0.55 },
  ]),
  seat('air_ambulance_seat', 9, 0.25),
  k.compound('air_ambulance_locker', 30, [
    box('carcass', 'unit', [-0.2, 0, -0.3], [0.2, 0.95, 0.3]),
    box('door', 'door', [0.2, 0.05, -0.27], [0.22, 0.9, 0.27]),
    box('stripe', 'band', [0.22, 0.6, -0.27], [0.23, 0.68, 0.27]),
  ], { unit: 'paint-white', door: 'plastic-gloss-white', band: 'paint-red' }),
  k.compound('air_ambulance_console', 12, [
    box('pedestal', 'dark', [-0.12, 0, -0.18], [0.12, 0.36, 0.18]),
    k.prism('panel', 'dark', [[-0.08, 0.36], [0.14, 0.36], [0.06, 0.66], [-0.08, 0.64]], [-0.56, 0.56]),
  ], { dark: 'plastic-black' }),
  k.compound('air_ambulance_beacon', 1, [
    turned('lens', 'lens', 'y', k.disc(0.07, 0, 0.11)) + { sides: 8 },
  ], { lens: 'plastic-red' }),
  k.compound('air_ambulance_landing_lamp', 2, [
    box('housing', 'dark', [-0.05, -0.07, -0.14], [0.04, 0.07, 0.14]),
    box('lens', 'lens', [0.04, -0.06, -0.12], [0.07, 0.06, 0.12]),
  ], { dark: trim, lens: 'plastic-frosted' }),
]
