local k = import 'kit.libsonnet';
local h = import 'helicopter-kit.libsonnet';
local s = import 'police_helicopter.spec.libsonnet';
local box = k.box;
local turned = k.turned;
local dome = [-90, 90];
local trim = 'paint-charcoal';
local skin(id, slot, x, arc, sides=16) = h.shell(id, slot, s.body, thick=0.0625, x=x, arc=arc, sides=sides);
local core = [
  station + { top: station.top - 0.05, bottom: station.bottom + 0.05, half: std.max(station.half - 0.05, 0.03) }
  for station in s.body
];
// The high-visibility chequer: two rows along each flank, offset by one block, ending clean at the row's far end.
local chequer(id, x) =
  local blocks = std.max(1, std.floor((x[1] - x[0]) / s.check));
  local width = (x[1] - x[0]) / blocks;
  std.flattenArrays([
    local span = [x[0] + i * width, x[0] + (i + 1) * width];
    local upper = if i % 2 == 0 then 'band' else 'paint';
    local under = if i % 2 == 0 then 'paint' else 'band';
    skin(id + '_a_' + i, upper, span, [s.bandTop, s.bandMid], 48)
    + skin(id + '_b_' + i, under, span, [s.bandMid, s.bandLow], 48)
    + skin(id + '_c_' + i, upper, span, [360 - s.bandMid, 360 - s.bandTop], 48)
    + skin(id + '_d_' + i, under, span, [360 - s.bandLow, 360 - s.bandMid], 48)
    for i in std.range(0, blocks - 1)
  ]);
local keel(id, x) = skin(id, 'paint', x, [s.bandLow, 360 - s.bandLow], 16);
local hingeRib(id, x) =
  local low = h.point(s.body, x, 88);
  local high = h.point(s.body, x, s.roofArc + 4);
  box(id, 'frame', [x - 0.03, low[0], high[1] - 0.06], [x + 0.03, high[0], high[1]]);
local door(id, massKg, rear, front) =
  local pane = [rear + 0.035, front - 0.035];
  k.compound(id, massKg,
             h.shell('pane', 'glass', s.body, x=pane, arc=[s.roofArc, 90])
             + h.shell('sill', 'frame', s.body, x=pane, arc=[82, 90], sides=48)
             + h.shell('head', 'frame', s.body, x=pane, arc=[s.roofArc, s.roofArc + 5], sides=120)
             + [hingeRib('hinge_rib', front - 0.065)],
             { glass: 'glass-clear', frame: s.paint },
             { hinge_a: ['hinge_rib', [0.5, 0, 0.5]], hinge_b: ['hinge_rib', [0.5, 1, 0.5]] });
local bow(id, x) = h.shell(id, 'paint', s.body, x=[x - 0.035, x + 0.035], arc=dome, step=0.07);
local proudCowl = [station + { half: station.half + 0.035, top: station.top + 0.035 } for station in s.cowl];
local boomAt(x) =
  local u = (s.boom.root.x - x) / (s.boom.root.x - s.boom.tip.x);
  { x: x, y: s.boom.root.y + u * (s.boom.tip.y - s.boom.root.y), r: s.boom.root.r + u * (s.boom.tip.r - s.boom.root.r) };
[
  k.compound('police_helicopter_belly', s.shellMass,
             h.loft('core', 'floor', core, x=[s.doorRear, s.noseCap], arc=[90, 270])
             + chequer('check', [s.doorRear, s.nose - 0.02])
             + keel('keel', [s.doorRear, s.nose - 0.02])
             + skin('top_near', 'paint', [s.doorRear, s.nose - 0.02], [90, s.bandTop], 120)
             + skin('top_far', 'paint', [s.doorRear, s.nose - 0.02], [360 - s.bandTop, 270], 120),
             { paint: s.paint, band: s.band, floor: trim }),
  k.compound('police_helicopter_rear_fairing', 40,
             h.shell('top', 'paint', s.body, thick=0.0625, x=[s.checkEnd, s.doorRear], arc=dome)
             + chequer('check', [s.checkEnd, s.doorRear])
             + keel('keel', [s.checkEnd, s.doorRear])
             + skin('top_near', 'paint', [s.checkEnd, s.doorRear], [90, s.bandTop], 120)
             + skin('top_far', 'paint', [s.checkEnd, s.doorRear], [360 - s.bandTop, 270], 120)
             + skin('aft', 'paint', [s.tail, s.checkEnd], [-180, 180])
             + h.loft('bulkhead', 'floor', s.body, x=[s.doorRear - 0.05, s.doorRear], step=0.05)
             + h.loft('tail_end', 'paint', s.body, x=[s.tail, s.tail + 0.05], step=0.05),
             { paint: s.paint, band: s.band, floor: trim }),
  k.compound('police_helicopter_nose_cap', 8,
             h.loft('cap', 'paint', s.body, x=[s.noseCap, s.nose], arc=dome, step=0.04),
             { paint: s.paint }),
  k.compound('police_helicopter_windscreen', 22,
             h.shell('screen', 'glass', s.body, x=[s.doorFront + 0.035, s.noseCap], arc=dome)
             + h.shell('post', 'frame', s.body, x=[s.doorFront + 0.035, s.noseCap], arc=[-4, 4], sides=48),
             { glass: 'glass-clear', frame: s.paint }),
  k.compound('police_helicopter_roof', 45,
             h.shell('roof', 'paint', s.body, x=[s.doorRear, s.doorFront + 0.035], arc=[-s.roofArc, s.roofArc])
             + bow('front_bow', s.doorFront)
             + bow('mid_bow', s.doorMid)
             + bow('rear_bow', s.doorRear + 0.035),
             { paint: s.paint }),
  door('police_helicopter_front_door', 18, s.doorMid, s.doorFront),
  door('police_helicopter_rear_door', 18, s.doorRear, s.doorMid),
  k.compound('police_helicopter_engine_cowl', 30,
             h.loft('cowl', 'paint', s.cowl)
             + h.shell('intake_near', 'dark', proudCowl, thick=0.05, x=[-1.0, -0.6], arc=[45, 100], sides=24)
             + h.shell('intake_far', 'dark', proudCowl, thick=0.05, x=[-1.0, -0.6], arc=[260, 315], sides=24)
             + [
               turned('pylon', 'paint', 'y', [[2.25, 0], [2.25, 0.42], [2.78, 0.16], [2.78, 0], [2.25, 0]]) + { sides: 12 },
               turned('exhaust', 'dark', 'x', k.annulus(0.05, 0.14, -2.42, -2.15), [0, 2.1, 0]) + { sides: 12 },
             ],
             { paint: s.paint, dark: trim }),
  k.compound('police_helicopter_tail_boom', 45,
             h.boom('boom_fore', 'paint', s.boom.root, boomAt(s.boom.band[0]))
             + h.boom('boom_band', 'band', boomAt(s.boom.band[0]), boomAt(s.boom.band[1]))
             + h.boom('boom_aft', 'paint', boomAt(s.boom.band[1]), s.boom.tip)
             + [box('gearbox', 'dark', [s.tailRotor.x - 0.1, s.tailRotor.y - 0.08, -0.08], [s.tailRotor.x + 0.1, s.tailRotor.y + 0.08, 0.08])],
             { paint: s.paint, band: s.band, dark: trim }),
  k.compound('police_helicopter_tail_surfaces', 10, [
    h.fin('fin', 'band', [[-5.6, 1.85], [-6.2, 1.85], [-6.55, 2.95], [-6.15, 2.95]]),
    h.fin('ventral', 'paint', [[-5.75, 1.92], [-6.2, 1.92], [-6.42, 1.15], [-6.15, 1.15]]),
    box('stabiliser', 'band', [-4.72, 1.79, -1.02], [-4.36, 1.85, 1.02]),
  ] + k.bothSides([
    h.fin('finlet', 'paint', [[-4.76, 1.68], [-4.34, 1.68], [-4.34, 2.0], [-4.76, 2.0]]) + { start: 1.02, end: 1.06 },
  ]), { paint: s.paint, band: s.band }),
  h.tailRotor('police_helicopter_tail_rotor', 8, s.tailRotor.radius, chord=0.15, shaft=s.tailRotor.z),
  h.mainRotor('police_helicopter_main_rotor', 130, s.rotorRadius, blades=3, chord=0.3, droop=0.3, phase=40),
  h.mast('police_helicopter_mast', 25, s.hub - s.mastFoot),
  k.compound('police_helicopter_main_gearbox', 85, [
    turned('case', 'steel', 'y', [[0, 0], [0, 0.24], [0.2, 0.16], [0.36, 0.1], [0.36, 0], [0, 0]]) + { sides: 12 },
  ], { steel: 'steel-grey' }),
  h.turbine('police_helicopter_turbine', 115, 1.1, 0.24),
  k.compound('police_helicopter_fuel_tank', 15, [
    box('tank', 'alu', [-0.3, 0, -0.5], [0.3, 0.6, 0.5]),
  ], { alu: 'alu-bare' }),
  h.skids('police_helicopter_skids', 45, [-1.15, 1.5], 1.05, [
    { x: 1.05, top: 0.6, root: 0.5 },
    { x: -0.4, top: 0.62, root: 0.5 },
  ]),
  k.compound('police_helicopter_seat', 8, [
    box('pan', 'dark', [-0.24, 0, -0.24], [0.22, 0.08, 0.24]),
    box('cushion', 'seat', [-0.24, 0.08, -0.24], [0.22, 0.18, 0.24]),
    k.prism('back', 'seat', [[-0.3, 0.14], [-0.2, 0.14], [-0.24, 0.8], [-0.33, 0.8]], [-0.24, 0.24]),
  ], { dark: trim, seat: 'cloth-seat' }),
  k.compound('police_helicopter_rear_bench', 14, [
    box('pan', 'dark', [-0.24, 0, -0.66], [0.22, 0.08, 0.66]),
    box('cushion', 'seat', [-0.24, 0.08, -0.66], [0.22, 0.18, 0.66]),
    k.prism('back', 'seat', [[-0.3, 0.14], [-0.2, 0.14], [-0.24, 0.8], [-0.33, 0.8]], [-0.66, 0.66]),
  ], { dark: trim, seat: 'cloth-seat' }),
  k.compound('police_helicopter_console', 10, [
    box('pedestal', 'dark', [-0.12, 0, -0.16], [0.12, 0.34, 0.16]),
    k.prism('panel', 'dark', [[-0.08, 0.34], [0.14, 0.34], [0.06, 0.64], [-0.08, 0.62]], [-0.5, 0.5]),
  ], { dark: 'plastic-black' }),
  k.compound('police_helicopter_searchlight', 32, [
    turned('drum', 'drum', 'x', [[-0.2, 0], [-0.2, 0.11], [-0.08, 0.18], [0.2, 0.18], [0.2, 0], [-0.2, 0]]) + { sides: 16 },
    turned('lens', 'lens', 'x', k.disc(0.15, 0.2, 0.235)) + { sides: 16 },
    box('yoke_near', 'drum', [-0.05, -0.05, 0.18], [0.05, 0.26, 0.22]),
    box('yoke_far', 'drum', [-0.05, -0.05, -0.22], [0.05, 0.26, -0.18]),
    box('yoke_top', 'drum', [-0.05, 0.22, -0.22], [0.05, 0.26, 0.22]),
    turned('stem', 'drum', 'y', k.disc(0.05, 0.26, 0.5)) + { sides: 8 },
  ], { drum: trim, lens: 'plastic-frosted' }),
  k.compound('police_helicopter_beacon', 1, [
    turned('lens', 'lens', 'y', k.disc(0.07, 0, 0.11)) + { sides: 8 },
  ], { lens: 'plastic-blue' }),
  k.compound('police_helicopter_landing_lamp', 1, [
    box('housing', 'dark', [-0.05, -0.06, -0.12], [0.04, 0.06, 0.12]),
    box('lens', 'lens', [0.04, -0.05, -0.1], [0.07, 0.05, 0.1]),
  ], { dark: trim, lens: 'plastic-frosted' }),
]
