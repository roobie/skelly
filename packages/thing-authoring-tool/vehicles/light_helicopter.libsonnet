local k = import 'kit.libsonnet';
local h = import 'helicopter-kit.libsonnet';
local s = import 'light_helicopter.spec.libsonnet';
local box = k.box;
local doorX = [s.doorRear, s.doorFront];
local dome = [-90, 90];
local trim = 'paint-charcoal';
local hingeRib(id, x) =
  local low = h.point(s.body, x, 88);
  local high = h.point(s.body, x, 66);
  box(id, 'frame', [x - 0.03, low[0], high[1] - 0.06], [x + 0.03, high[0], high[1]]);
// Stands proud of the fairing, so it never shares a surface with the wall beneath it.
local ventBody = [station + { half: station.half + 0.035, top: station.top + 0.035, bottom: station.bottom - 0.035 } for station in s.body];
[
  k.compound('light_helicopter_belly', s.shellMass,
             h.loft('belly', 'paint', s.body, x=[s.bulkhead, s.nose], arc=[90, 270]),
             { paint: s.paint }),
  k.compound('light_helicopter_rear_fairing', 18,
             h.shell('wall', 'paint', s.body, thick=0.0625, x=[-2.05, s.bulkhead])
             + h.loft('bulkhead', 'paint', s.body, x=[s.bulkhead - 0.05, s.bulkhead], step=0.05)
             + h.shell('vent', 'dark', ventBody, thick=0.05, x=[-1.0, -0.45], arc=[62, 118], sides=24)
             + [
               box('deck', 'dark', [-1.02, 0.85, -0.42], [0.1, 0.9, 0.42]),
               k.turned('pylon', 'paint', 'y', [[1.9, 0], [1.9, 0.3], [2.36, 0.12], [2.36, 0], [1.9, 0]]) + { sides: 12 },
             ],
             { paint: s.paint, dark: trim }),
  k.compound('light_helicopter_canopy', 10,
             h.shell('front', 'glass', s.body, x=[s.doorFront, s.nose], arc=dome)
             + h.shell('rear', 'glass', s.body, x=[s.bulkhead, s.doorRear], arc=dome)
             + h.shell('roof', 'glass', s.body, x=doorX, arc=[-s.doorArc, s.doorArc]),
             { glass: 'glass-clear' }),
  k.compound('light_helicopter_canopy_frame', 6,
             h.shell('front_bow', 'frame', s.body, x=[s.doorFront - 0.03, s.doorFront + 0.03], arc=dome, step=0.06)
             + h.shell('rear_bow', 'frame', s.body, x=[s.doorRear - 0.03, s.doorRear + 0.03], arc=dome, step=0.06)
             + h.shell('spine', 'frame', s.body, x=[s.bulkhead, s.doorFront], arc=[-5, 5], sides=32)
             + h.shell('rail_near', 'frame', s.body, x=doorX, arc=[s.doorArc - 3, s.doorArc + 3], sides=120)
             + h.shell('rail_far', 'frame', s.body, x=doorX, arc=[360 - s.doorArc - 3, 360 - s.doorArc + 3], sides=120),
             { frame: s.paint }),
  k.compound('light_helicopter_door', 7,
             h.shell('pane', 'glass', s.body, x=doorX, arc=[s.doorArc, 90])
             + h.shell('sill', 'frame', s.body, x=doorX, arc=[80, 90], sides=48)
             + h.shell('rear_rib', 'frame', s.body, x=[s.doorRear, s.doorRear + 0.05], arc=[s.doorArc, 90], step=0.05)
             + [hingeRib('hinge_rib', s.doorFront - 0.03)],
             { glass: 'glass-clear', frame: s.paint },
             { hinge_a: ['hinge_rib', [0.5, 0, 0.5]], hinge_b: ['hinge_rib', [0.5, 1, 0.5]] }),
  k.compound('light_helicopter_tail_boom', 12,
             h.boom('boom', 'paint', { x: -1.85, y: 1.38, r: 0.14 }, { x: s.tailRotor.x + 0.1, y: s.tailRotor.y, r: 0.06 })
             + [box('gearbox', 'dark', [s.tailRotor.x - 0.08, s.tailRotor.y - 0.07, -0.07], [s.tailRotor.x + 0.08, s.tailRotor.y + 0.07, 0.07])],
             { paint: s.boomPaint, dark: trim }),
  k.compound('light_helicopter_tail_surfaces', 3, [
    h.fin('fin', 'paint', [[-3.74, 1.6], [-4.16, 1.6], [-4.42, 2.3], [-4.14, 2.3]]),
    h.fin('ventral', 'paint', [[-3.92, 1.6], [-4.16, 1.6], [-4.3, 1.12], [-4.16, 1.12]]),
    box('stabiliser', 'paint', [-3.6, 1.53, -0.48], [-3.34, 1.57, 0.48]),
  ], { paint: s.paint }),
  h.tailRotor('light_helicopter_tail_rotor', 5, s.tailRotor.radius, shaft=s.tailRotor.z),
  h.mainRotor('light_helicopter_main_rotor', 40, s.rotorRadius),
  h.mast('light_helicopter_mast', 12, s.hub - s.mastFoot),
  k.compound('light_helicopter_main_gearbox', 30, [
    k.turned('case', 'steel', 'y', [[0, 0], [0, 0.2], [0.18, 0.13], [0.3, 0.09], [0.3, 0], [0, 0]]) + { sides: 12 },
    box('mount', 'dark', [-0.28, -0.05, -0.48], [0.28, 0, 0.48]),
  ] + k.bothSides([
    box('leg', 'dark', [-0.04, -0.65, 0.44], [0.04, -0.05, 0.48]),
  ]), { steel: 'steel-grey', dark: 'steel-spall-black' }),
  h.pistonEngine('light_helicopter_engine', 105),
  k.compound('light_helicopter_fuel_tank', 8, [
    box('tank', 'alu', [-0.15, 0, -0.42], [0.15, 0.5, 0.42]),
    k.turned('cap', 'dark', 'y', k.disc(0.04, 0.5, 0.54), [0, 0, 0.2]) + { sides: 8 },
  ], { alu: 'alu-bare', dark: trim }),
  h.skids('light_helicopter_skids', 20, [-1.05, 1.45], 0.74, [
    { x: 1.0, top: 0.54, root: 0.4 },
    { x: -0.45, top: 0.68, root: 0.34 },
  ]),
  k.compound('light_helicopter_seat', 7, [
    box('pan', 'dark', [-0.24, 0, -0.23], [0.22, 0.08, 0.23]),
    box('cushion', 'seat', [-0.24, 0.08, -0.23], [0.22, 0.18, 0.23]),
    k.prism('back', 'seat', [[-0.3, 0.14], [-0.2, 0.14], [-0.24, 0.78], [-0.33, 0.78]], [-0.23, 0.23]),
  ], { dark: trim, seat: 'cloth-seat' }),
  k.compound('light_helicopter_console', 6, [
    box('pedestal', 'dark', [-0.12, 0, -0.14], [0.12, 0.34, 0.14]),
    k.prism('panel', 'dark', [[-0.08, 0.34], [0.14, 0.34], [0.06, 0.62], [-0.08, 0.6]], [-0.36, 0.36]),
  ], { dark: 'plastic-black' }),
  k.compound('light_helicopter_beacon', 1, [
    k.turned('lens', 'lens', 'y', k.disc(0.05, 0, 0.08)) + { sides: 8 },
  ], { lens: 'plastic-red' }),
  k.compound('light_helicopter_landing_lamp', 1, [
    box('housing', 'dark', [-0.05, -0.05, -0.1], [0.04, 0.05, 0.1]),
    box('lens', 'lens', [0.04, -0.04, -0.09], [0.06, 0.04, 0.09]),
  ], { dark: trim, lens: 'plastic-frosted' }),
]
