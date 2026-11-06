local k = import 'kit.libsonnet';
local h = import 'helicopter-kit.libsonnet';
local m = import 'machine-kit.libsonnet';
local s = import 'heavy_cargo_helicopter.spec.libsonnet';
local box = k.box;
local dome = [-90, 90];
local square = 3.5;
local finishes = { paint: s.paint, dark: s.trim, glass: 'glass-clear' };
local wall(id, slot, x, arc, step=0.125, sides=32) = h.shell(id, slot, s.body, thick=0.0875, x=x, arc=arc, step=step, sides=sides, square=square);
// A wall step this long reaches past the constant cabin into the tapers, which would thicken it inward, so its stations stop at the cabin.
local cabin = [s.body[4] + { x: s.floorRear }, s.body[4] + { x: 5.5 }];
local cabinWall(id, arc, sides=32) = h.shell(id, 'paint', cabin, thick=0.0875, x=[s.floorRear, s.door[0]], arc=arc, step=10.9, sides=sides, square=square);
local door = s.door;
local paneArc = s.doorPane;
local paneX = s.doorPaneX;
local e = s.engine;
local sp = s.sponson;
local hingeRib(id, x, high, low=86) =
  local bottom = h.point(s.body, x, low, square);
  local top = h.point(s.body, x, high, square);
  box(id, 'dark', [x - 0.03, bottom[0], top[1] - 0.05], [x + 0.03, top[0], top[1]]);
local podSlice(id, x, outer) = {
  id: id,
  kind: 'prism',
  slot: 'paint',
  axis: 'x',
  start: x[0],
  end: x[1],
  profile: [[sp.low, sp.inner], [sp.high, sp.inner], [sp.high, sp.inner + (outer - sp.inner) * 0.6], [sp.high - 0.27, outer], [sp.low + 0.23, outer], [sp.low, sp.inner + (outer - sp.inner) * 0.65]],
};
local taper = [
  local u = (i + 0.5) / 8;
  sp.inner + 0.1 + (sp.outer - sp.inner - 0.1) * std.sqrt(1 - (1 - u) * (1 - u))
  for i in std.range(0, 7)
];
local windows = [-4.4, -3.2, -2.0, -0.8, 0.4, 1.6, 2.8];
local gearbox(id, massKg) = k.compound(id, massKg, [
  k.turned('case', 'steel', 'y', [[0, 0], [0, 0.56], [0.25, 0.42], [0.42, 0.24], [0.42, 0], [0, 0]]) + { sides: 16 },
], { steel: 'steel-grey' });
[
  k.compound('heavy_cargo_helicopter_belly', s.shellMass,
             h.loft('nose', 'paint', s.body, x=[5.5, s.nose], arc=[90, 270], sides=32, square=square)
             + h.loft('middle', 'paint', s.body, x=[s.floorRear, 5.5], arc=[90, 270], step=11.5, sides=32, square=square),
             finishes),
  k.compound('heavy_cargo_helicopter_load_floor', 620, [
    box('deck', 'deck', [s.floorRear, s.floorBase, -s.floorHalf], [s.floorFront, s.floorTop, s.floorHalf]),
  ], { deck: 'steel-grey' }),
  k.compound('heavy_cargo_helicopter_fuselage', 1500,
             cabinWall('side_near', [20, 90])
             + cabinWall('side_far', [-90, -20])
             + cabinWall('roof', [-20, 20], sides=48)
             + wall('door_roof', 'paint', door, [-s.doorArc, s.doorArc], step=0.19)
             + wall('cockpit_wall', 'paint', [door[1], s.windscreen[0]], dome, step=0.14)
             + wall('screen_post', 'paint', s.windscreen, [-3, 3], sides=120)
             + wall('screen_sill_near', 'paint', s.windscreen, [s.screenArc, 90])
             + wall('screen_sill_far', 'paint', s.windscreen, [-90, -s.screenArc])
             + h.loft('nose_top', 'paint', s.body, x=[s.windscreen[1], s.nose], arc=dome, sides=32, square=square),
             finishes),
  k.compound('heavy_cargo_helicopter_tail_section', 700,
             wall('wall', 'paint', [s.tail, s.floorRear], dome, step=0.09)
             + h.loft('lintel', 'paint', [
               { x: s.tail + 0.08, top: 3.78, bottom: 3.0, half: 1.62, waist: 3.0 },
               { x: s.tail, top: 3.78, bottom: 3.0, half: 1.62, waist: 3.0 },
             ], arc=dome, step=0.08, sides=32, square=square),
             finishes),
  k.compound('heavy_cargo_helicopter_cockpit_bulkhead', 70,
             h.loft('plate', 'dark', s.body, x=[s.floorFront - 0.12, s.floorFront - 0.04], arc=dome, step=0.08, sides=32, square=square),
             finishes),
  k.compound('heavy_cargo_helicopter_ramp', 280, [
    k.prism('deck', 'dark', [[s.rampTip, 0], [s.rampTip + 0.1, 0], [s.floorRear, s.floorTop - 0.09], [s.floorRear, s.floorTop]], [-1.45, 1.45]),
    box('hinge_bar', 'dark', [s.floorRear - 0.06, s.floorTop - 0.12, -1.45], [s.floorRear + 0.02, s.floorTop, 1.45]),
  ] + k.bothSides([
    m.bar('side', 'paint', [s.rampTip + 0.02, 0.1], [s.floorRear, s.floorTop + 0.1], 0.1, [1.35, 1.45]),
  ]), finishes, { hinge_a: ['hinge_bar', [0.5, 0.5, 0.1]], hinge_b: ['hinge_bar', [0.5, 0.5, 0.9]] }),
  k.compound('heavy_cargo_helicopter_windscreen', 60,
             wall('near', 'glass', s.windscreen, [3, s.screenArc])
             + wall('far', 'glass', s.windscreen, [-s.screenArc, -3]),
             finishes),
  k.compound('heavy_cargo_helicopter_crew_door', 40,
             wall('pane', 'glass', paneX, paneArc, step=0.13)
             + wall('lower', 'paint', door, [paneArc[1], 90], step=0.19)
             + wall('upper', 'paint', door, [s.doorArc, paneArc[0]], step=0.19)
             + wall('fore', 'paint', [paneX[1], door[1]], paneArc, step=0.15)
             + wall('aft', 'paint', [door[0], paneX[0]], paneArc, step=0.15)
             + wall('edge', 'dark', [door[1] - 0.04, door[1]], [s.doorArc, 90], step=0.04)
             + [hingeRib('hinge_rib', door[0] + 0.03, 66)],
             finishes,
             { hinge_a: ['hinge_rib', [0.5, 0, 0.5]], hinge_b: ['hinge_rib', [0.5, 1, 0.5]] }),
  k.compound('heavy_cargo_helicopter_cabin_windows', 12,
             std.flattenArrays([
               [box('pane_' + x, 'glass', [x, 2.3, 1.7], [x + 0.5, 2.8, 1.85]), box('frame_' + x, 'dark', [x - 0.04, 2.26, 1.7], [x + 0.54, 2.84, 1.83])]
               for x in windows
             ]),
             { glass: 'glass-grey', dark: s.trim }),
  k.compound('heavy_cargo_helicopter_sponson', 340,
             [podSlice('tank', [sp.rear + sp.taper, sp.front - sp.taper], sp.outer)]
             + [podSlice('nose_' + i, [sp.front - sp.taper + (7 - i) * sp.taper / 8, sp.front - sp.taper + (8 - i) * sp.taper / 8], taper[i]) for i in std.range(0, 7)]
             + [podSlice('tail_' + i, [sp.rear + i * sp.taper / 8, sp.rear + (i + 1) * sp.taper / 8], taper[i]) for i in std.range(0, 7)],
             finishes),
  k.compound('heavy_cargo_helicopter_front_pylon', 260,
             h.loft('fairing', 'paint', [
               { x: 6.62, top: 3.72, bottom: 3.3, half: 0.2, waist: 3.4 },
               { x: 6.25, top: 4.35, bottom: 3.3, half: 0.62, waist: 3.45 },
               { x: 5.3, top: 4.55, bottom: 3.3, half: 0.68, waist: 3.45 },
               { x: 4.4, top: 3.95, bottom: 3.3, half: 0.3, waist: 3.45 },
             ], arc=dome, step=0.09),
             finishes),
  k.compound('heavy_cargo_helicopter_rear_pylon', 520,
             h.loft('fairing', 'paint', [
               { x: -4.1, top: 3.9, bottom: 3.5, half: 0.22, waist: 3.6 },
               { x: -5.0, top: 5.0, bottom: 3.5, half: 0.56, waist: 3.6 },
               { x: -6.9, top: 5.3, bottom: 3.5, half: 0.58, waist: 3.6 },
               { x: -7.95, top: 4.4, bottom: 3.5, half: 0.3, waist: 3.6 },
             ], arc=dome, step=0.09)
             + k.bothSides([
               k.turned('nacelle', 'paint', 'x', k.annulus(e.radius + 0.01, e.radius + 0.08, e.x - e.length / 2, e.x + e.length / 2), [0, e.y, e.z]) + { sides: 16 },
               box('nacelle_foot', 'paint', [e.x - 0.8, 3.55, 0.5], [e.x + 0.8, 3.92, e.z]),
             ]),
             finishes),
  h.mainRotor('heavy_cargo_helicopter_front_rotor', 900, s.rotorRadius, blades=3, chord=0.72, droop=0.45, phase=0, hub=0.34, segments=14),
  h.mainRotor('heavy_cargo_helicopter_rear_rotor', 900, s.rotorRadius, blades=3, chord=0.72, droop=0.45, phase=180, hub=0.34, segments=14),
  h.mast('heavy_cargo_helicopter_mast', 110, 0.62, radius=0.1),
  gearbox('heavy_cargo_helicopter_gearbox', 420),
  h.turbine('heavy_cargo_helicopter_turbine', 300, e.length, e.radius),
  k.compound('heavy_cargo_helicopter_fuel_tank', 140, [
    box('tank', 'alu', [-2.4, 0.02, -0.2], [2.4, 0.92, 0.2]),
  ], { alu: 'alu-bare' }),
  h.mainGear('heavy_cargo_helicopter_front_gear', 200, s.frontGear.x, s.frontGear.radius, s.frontGear.width, s.frontGear.z, s.frontGear.top, s.frontGear.root),
  h.mainGear('heavy_cargo_helicopter_rear_gear', 220, s.rearGear.x, s.rearGear.radius, s.rearGear.width, s.rearGear.z, s.rearGear.top, s.rearGear.root),
  m.wheel('heavy_cargo_helicopter_wheel', 62, s.frontGear.width, 0.22, s.frontGear.radius),
  k.compound('heavy_cargo_helicopter_crew_seat', 24, [
    box('pan', 'dark', [-0.26, 0, -0.26], [0.24, 0.3, 0.26]),
    box('cushion', 'seat', [-0.26, 0.3, -0.25], [0.24, 0.4, 0.25]),
    k.prism('back', 'seat', [[-0.34, 0.34], [-0.24, 0.34], [-0.26, 1.0], [-0.36, 1.0]], [-0.25, 0.25]),
  ], { dark: s.trim, seat: 'cloth-seat' }),
  k.compound('heavy_cargo_helicopter_console', 24, [
    box('pedestal', 'dark', [-0.2, 0, -0.16], [0.2, 0.42, 0.16]),
    k.prism('panel', 'dark', [[-0.12, 0.42], [0.2, 0.42], [0.1, 0.8], [-0.12, 0.76]], [-0.9, 0.9]),
  ], { dark: 'plastic-black' }),
  k.compound('heavy_cargo_helicopter_cockpit_floor', 90, [
    box('deck', 'dark', [s.floorFront, s.floorBase, -1.4], [6.85, s.floorTop, 1.4]),
  ], { dark: s.trim }),
  k.compound('heavy_cargo_helicopter_beacon', 1, [
    k.turned('lens', 'lens', 'y', k.disc(0.06, 0, 0.1)) + { sides: 8 },
  ], { lens: 'plastic-red' }),
  k.compound('heavy_cargo_helicopter_landing_lamp', 5, [
    box('housing', 'dark', [-0.14, -0.1, -0.14], [0.14, 0.1, 0.14]),
    box('lens', 'lens', [-0.12, -0.13, -0.12], [0.12, -0.1, 0.12]),
  ], { dark: s.trim, lens: 'plastic-frosted' }),
]
