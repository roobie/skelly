local k = import 'kit.libsonnet';
local h = import 'helicopter-kit.libsonnet';
local m = import 'machine-kit.libsonnet';
local s = import 'military_transport_helicopter.spec.libsonnet';
local box = k.box;
local dome = [-90, 90];
local finishes = { paint: s.paint, dark: s.trim, glass: 'glass-clear' };
local wall(id, slot, x, arc, step=0.125, sides=32) = h.shell(id, slot, s.body, x=x, arc=arc, step=step, sides=sides);
local hingeRib(id, x, high, low=88) =
  local bottom = h.point(s.body, x, low);
  local top = h.point(s.body, x, high);
  box(id, 'dark', [x - 0.03, bottom[0], top[1] - 0.05], [x + 0.03, top[0], top[1]]);
local proud = [station + { half: station.half + 0.04, top: station.top + 0.04 } for station in s.body];
local door = s.cabinDoor;
local pane = s.cabinPane;
local paneX = s.cabinPaneX;
local cockpit = s.cockpitDoor;
local gun = s.gunWindow;
local gunArc = s.gunWindowArc;
local e = s.engine;
[
  k.compound('military_transport_helicopter_belly', s.shellMass,
             h.loft('nose', 'paint', s.body, x=[3.3, s.nose], arc=[90, 270], sides=24)
             + h.loft('middle', 'paint', s.body, x=[s.bulkhead, 2.6], arc=[90, 270], step=4.2, sides=24)
             + h.loft('shoulder', 'paint', s.body, x=[2.6, 3.3], arc=[90, 270], step=0.125, sides=24),
             finishes),
  k.compound('military_transport_helicopter_tail_cone', 160,
             wall('wall', 'paint', [s.tailEnd, s.bulkhead], [-180, 180], sides=24)
             + h.loft('cap', 'paint', s.body, x=[s.tailEnd, s.tailEnd + 0.06], step=0.06, sides=24),
             finishes),
  k.compound('military_transport_helicopter_roof', 260,
             h.loft('nose_top', 'paint', s.body, x=[s.windscreen[1], s.nose], arc=dome, sides=24)
             + wall('screen_post', 'paint', s.windscreen, [-3, 3], sides=120)
             + wall('screen_sill_near', 'paint', s.windscreen, [s.windscreenArc, 90])
             + wall('screen_sill_far', 'paint', s.windscreen, [-90, -s.windscreenArc])
             + wall('cockpit_roof', 'paint', cockpit, [-s.cockpitArc, s.cockpitArc])
             + wall('pillar_front', 'paint', [gun[1], cockpit[0]], dome, step=0.2)
             + wall('pillar_rear', 'paint', [door[1], gun[0]], dome, step=0.2)
             + wall('gun_roof', 'paint', gun, [-gunArc[0], gunArc[0]], step=0.7)
             + wall('gun_sill_near', 'paint', gun, [gunArc[1], 90], step=0.7)
             + wall('gun_sill_far', 'paint', gun, [-90, -gunArc[1]], step=0.7)
             + wall('cabin_roof', 'paint', door, [-s.cabinArc, s.cabinArc], step=0.7)
             + wall('cabin_rear', 'paint', [s.bulkhead, door[0]], dome, step=0.25)
             + h.loft('bulkhead', 'paint', s.body, x=[s.bulkhead, s.bulkhead + 0.05], arc=dome, step=0.05, sides=24)
             + h.shell('rail_near', 'dark', proud, x=[door[0], door[1] + 0.6], arc=[s.cabinArc - 3, s.cabinArc], step=0.9, sides=120)
             + h.shell('rail_far', 'dark', proud, x=[door[0], door[1] + 0.6], arc=[-s.cabinArc, -s.cabinArc + 3], step=0.9, sides=120),
             finishes),
  k.compound('military_transport_helicopter_windscreen', 30,
             wall('near', 'glass', s.windscreen, [3, s.windscreenArc])
             + wall('far', 'glass', s.windscreen, [-s.windscreenArc, -3]),
             finishes),
  k.compound('military_transport_helicopter_cockpit_door', 28,
             wall('pane', 'glass', [cockpit[0] + 0.12, cockpit[1] - 0.07], [s.cockpitArc + 4, s.cockpitPane])
             + wall('lower', 'paint', cockpit, [s.cockpitPane, 90])
             + wall('top', 'paint', cockpit, [s.cockpitArc, s.cockpitArc + 4], sides=120)
             + wall('front', 'paint', [cockpit[1] - 0.07, cockpit[1]], [s.cockpitArc, s.cockpitPane], step=0.07)
             + wall('rear', 'paint', [cockpit[0], cockpit[0] + 0.12], [s.cockpitArc, s.cockpitPane], step=0.12)
             + [hingeRib('hinge_rib', cockpit[1] - 0.03, s.cockpitPane)],
             finishes,
             { hinge_a: ['hinge_rib', [0.5, 0, 0.5]], hinge_b: ['hinge_rib', [0.5, 1, 0.5]] }),
  k.compound('military_transport_helicopter_cabin_door', 65,
             wall('pane', 'glass', paneX, pane, step=0.45)
             + wall('lower', 'paint', door, [pane[1], 90], step=0.7)
             + wall('upper', 'paint', door, [s.cabinArc, pane[0]], step=0.7)
             + wall('fore', 'paint', [paneX[1], door[1]], pane, step=0.6)
             + wall('aft', 'paint', [door[0], paneX[0]], pane, step=0.6)
             + wall('edge_fore', 'dark', [door[1] - 0.04, door[1]], [s.cabinArc, 90], step=0.04)
             + wall('edge_aft', 'dark', [door[0], door[0] + 0.04], [s.cabinArc, 90], step=0.04)
             + [hingeRib('hinge_rib', door[0] + 0.03, 58)],
             finishes,
             { hinge_a: ['hinge_rib', [0.5, 0, 0.5]], hinge_b: ['hinge_rib', [0.5, 1, 0.5]] }),
  k.compound('military_transport_helicopter_side_window', 6,
             wall('pane', 'glass', gun, gunArc, step=0.7),
             finishes),
  k.compound('military_transport_helicopter_engine_cowling', 150,
             h.loft('hump', 'paint', [
               { x: 1.75, top: 2.9, bottom: 2.5, half: 0.2, waist: 2.6 },
               { x: 1.0, top: 3.25, bottom: 2.5, half: 0.75, waist: 2.6 },
               { x: -1.9, top: 3.22, bottom: 2.5, half: 0.72, waist: 2.6 },
               { x: -3.0, top: 2.8, bottom: 2.45, half: 0.22, waist: 2.5 },
             ], arc=dome, step=0.125)
             + k.bothSides([
               k.turned('nacelle', 'paint', 'x', k.annulus(e.radius + 0.01, e.radius + 0.08, e.x - e.length / 2, e.x + e.length / 2), [0, e.y, e.z]) + { sides: 16 },
             ]),
             finishes),
  k.compound('military_transport_helicopter_tail_boom', 240,
             h.boom('boom', 'paint', { x: s.tailEnd + 0.2, y: 2.27, r: 0.31 }, { x: -8.7, y: 2.85, r: 0.15 })
             + [box('tail_gearbox', 'dark', [s.tailRotor.x - 0.12, s.tailRotor.y - 0.12, -0.1], [s.tailRotor.x + 0.12, s.tailRotor.y + 0.12, 0.1])],
             finishes),
  k.compound('military_transport_helicopter_tail_surfaces', 60, [
    h.fin('fin', 'paint', [[-7.95, 2.72], [-8.85, 2.72], [-9.35, 4.35], [-8.9, 4.4]], half=0.06),
    h.fin('ventral', 'paint', [[-7.95, 2.8], [-8.5, 2.8], [-8.62, 2.34], [-8.32, 2.34]], half=0.05),
    box('stabiliser', 'paint', [-7.55, 2.62, -1.7], [-6.95, 2.69, 1.7]),
  ], finishes),
  h.tailRotor('military_transport_helicopter_tail_rotor', 60, s.tailRotor.radius, blades=4, chord=0.22, shaft=s.tailRotor.z, phase=15),
  h.mainRotor('military_transport_helicopter_main_rotor', 450, s.rotorRadius, blades=4, chord=0.52, droop=0.4, phase=20, hub=0.28, segments=14),
  h.mast('military_transport_helicopter_mast', 80, s.hub - s.mastFoot, radius=0.08),
  k.compound('military_transport_helicopter_main_gearbox', 500, [
    k.turned('case', 'steel', 'y', [[0, 0], [0, 0.42], [0.2, 0.3], [0.34, 0.18], [0.34, 0], [0, 0]]) + { sides: 16 },
  ], { steel: 'steel-grey' }),
  h.turbine('military_transport_helicopter_turbine', 210, e.length, e.radius),
  k.compound('military_transport_helicopter_fuel_tank', 110, [
    box('tank', 'alu', [-0.45, 0, -0.5], [0.45, 0.9, 0.5]),
  ], { alu: 'alu-bare' }),
  h.mainGear('military_transport_helicopter_main_gear', 150, s.mainGear.x, s.mainGear.radius, s.mainGear.width, s.mainGear.z, s.mainGear.top, s.mainGear.root),
  m.wheel('military_transport_helicopter_main_wheel', 48, s.mainGear.width, 0.2, s.mainGear.radius),
  h.tailGear('military_transport_helicopter_tail_gear', 45, s.tailGear.x, s.tailGear.radius, s.tailGear.width, s.tailGear.top, s.tailGear.rake, s.tailGear.brace),
  m.wheel('military_transport_helicopter_tail_wheel', 14, s.tailGear.width, 0.14, s.tailGear.radius),
  k.compound('military_transport_helicopter_crew_seat', 22, [
    box('pan', 'dark', [-0.26, 0, -0.26], [0.24, 0.3, 0.26]),
    box('cushion', 'seat', [-0.26, 0.3, -0.25], [0.24, 0.4, 0.25]),
    k.prism('back', 'seat', [[-0.34, 0.34], [-0.24, 0.34], [-0.26, 1.0], [-0.36, 1.0]], [-0.25, 0.25]),
  ], { dark: s.trim, seat: 'cloth-seat' }),
  k.compound('military_transport_helicopter_troop_bench', 30, [
    box('frame', 'dark', [door[0], 0, 0.1], [door[1], 0.36, 0.5]),
    box('cushion', 'seat', [door[0], 0.36, 0.1], [door[1], 0.44, 0.52]),
    box('back', 'seat', [door[0], 0.36, 0.02], [door[1], 1.05, 0.1]),
  ], { dark: s.trim, seat: 'cloth-seat' }),
  k.compound('military_transport_helicopter_console', 18, [
    box('pedestal', 'dark', [-0.2, 0, -0.16], [0.2, 0.4, 0.16]),
    k.prism('panel', 'dark', [[-0.12, 0.4], [0.2, 0.4], [0.1, 0.72], [-0.12, 0.7]], [-0.75, 0.75]),
  ], { dark: 'plastic-black' }),
  k.compound('military_transport_helicopter_beacon', 1, [
    k.turned('lens', 'lens', 'y', k.disc(0.06, 0, 0.1)) + { sides: 8 },
  ], { lens: 'plastic-red' }),
  k.compound('military_transport_helicopter_landing_lamp', 4, [
    box('housing', 'dark', [-0.12, -0.1, -0.12], [0.12, 0.1, 0.12]),
    box('lens', 'lens', [-0.1, -0.13, -0.1], [0.1, -0.1, 0.1]),
  ], { dark: s.trim, lens: 'plastic-frosted' }),
]
