local k = import 'kit.libsonnet';
local h = import 'helicopter-kit.libsonnet';
local m = import 'machine-kit.libsonnet';
local s = import 'crashed_light_helicopter.spec.libsonnet';
local box = k.box;
local dome = [-90, 90];
local trim = 'paint-charcoal';
// Stands proud of the skin, so a fold shows as a dark line over the paint beneath it.
local proud = [station + { half: station.half + 0.04, top: station.top + 0.04, bottom: station.bottom } for station in s.body];
local crease(id, x, arc) = h.shell(id, 'crease', proud, thick=0.05, x=x, arc=arc, step=0.05, sides=32);
local ventBody = [station + { half: station.half + 0.035, top: station.top + 0.035, bottom: station.bottom } for station in s.body];
[
  k.compound('crashed_light_helicopter_belly', s.shellMass,
             h.loft('belly', 'paint', s.body, x=[s.bulkhead, s.nose], arc=[90, 270])
             // The crushed hood over the nose, burst open on the near side.
             + h.shell('hood', 'paint', s.body, thick=0.0625, x=[1.28, s.nose], arc=[80, 385])
             + h.shell('hood_near', 'paint', s.body, thick=0.0625, x=[1.45, s.nose], arc=[25, 80])
             + crease('fold_0', [1.42, 1.5], [60, 300])
             + crease('fold_1', [1.24, 1.32], [70, 140])
             + crease('fold_2', [1.24, 1.32], [220, 290])
             + crease('fold_3', [1.06, 1.13], [90, 125])
             + crease('fold_4', [1.5, 1.6], [120, 240])
             + crease('fold_5', [0.82, 0.92], [105, 130])
             + [
               m.bar('torn_0', 'paint', [1.42, 0.86], [1.7, 1.0], 0.05, [0.12, 0.34]),
               m.bar('torn_1', 'crease', [1.55, 0.3], [1.78, 0.42], 0.05, [-0.3, -0.06]),
             ],
             { paint: s.paint, crease: s.crease }),
  k.compound('crashed_light_helicopter_rear_fairing', 18,
             h.shell('wall', 'paint', s.body, thick=0.0625, x=[-2.05, s.bulkhead])
             + h.loft('bulkhead', 'paint', s.body, x=[s.bulkhead - 0.05, s.bulkhead], step=0.05)
             + h.shell('vent', 'dark', ventBody, thick=0.05, x=[-1.0, -0.45], arc=[62, 118], sides=24)
             + crease('scrape_0', [-0.9, -0.3], [150, 170])
             + crease('scrape_1', [-0.3, 0.1], [140, 158])
             + [
               box('deck', 'dark', [-1.02, 0.4, -0.42], [0.1, 0.45, 0.42]),
               k.turned('pylon', 'paint', 'y', [[1.45, 0], [1.45, 0.3], [1.91, 0.12], [1.91, 0], [1.45, 0]]) + { sides: 12 },
             ],
             { paint: s.paint, dark: trim, crease: s.crease }),
  k.compound('crashed_light_helicopter_canopy', 8,
             // Only the far and rear panes are left; the front of the bubble went with the nose.
             h.shell('far', 'glass', s.body, x=[s.doorRear, s.doorFront], arc=[270, 345])
             + h.shell('far_shard', 'glass', s.body, x=[s.doorFront, 1.28], arc=[280, 320])
             + h.shell('rear', 'glass', s.body, x=[s.bulkhead, s.doorRear], arc=dome)
             + h.shell('near_shard', 'glass', s.body, x=[s.doorRear, 0.6], arc=[20, 62]),
             { glass: 'glass-clear' }),
  k.compound('crashed_light_helicopter_canopy_frame', 6,
             h.shell('front_bow', 'frame', s.body, x=[s.doorFront - 0.04, s.doorFront + 0.04], arc=dome, step=0.08)
             + h.shell('rear_bow', 'frame', s.body, x=[s.doorRear - 0.04, s.doorRear + 0.04], arc=dome, step=0.08)
             + h.shell('spine', 'frame', s.body, x=[s.bulkhead, 1.28], arc=[-5, 5], sides=32)
             + h.shell('rail_near', 'frame', s.body, x=[s.doorRear, s.doorFront], arc=[s.doorArc - 3, s.doorArc + 3], sides=120)
             + h.shell('rail_far', 'frame', s.body, x=[s.doorRear, s.doorFront], arc=[360 - s.doorArc - 3, 360 - s.doorArc + 3], sides=120),
             { frame: s.paint }),
  k.compound('crashed_light_helicopter_door', 7, [
    box('frame', 'frame', [-0.3, 0, 1.05], [0.5, 0.05, 1.75]),
    box('pane', 'glass', [-0.22, 0.05, 1.13], [0.42, 0.075, 1.67]),
  ], { glass: 'glass-clear', frame: s.paint }),
  k.compound('crashed_light_helicopter_tail_boom', 12,
             h.boom('boom', 'paint', { x: -1.85, y: 0.93, r: 0.14 }, { x: -2.85, y: 0.72, r: 0.11 })
             + h.boom('sagged', 'paint', { x: -2.85, y: 0.7, r: 0.11 }, { x: s.tail.x + 0.1, y: s.tail.y, r: 0.06 })
             + [
               k.turned('buckle', 'dark', 'x', k.disc(0.14, -2.92, -2.78), [0, 0.71, 0]) + { sides: 8 },
               box('gearbox', 'dark', [s.tail.x - 0.08, s.tail.y - 0.07, -0.07], [s.tail.x + 0.08, s.tail.y + 0.07, 0.07]),
             ],
             { paint: s.boomPaint, dark: trim }),
  k.compound('crashed_light_helicopter_tail_surfaces', 3, [
    h.fin('fin', 'paint', [[-3.84, 0.36], [-4.16, 0.32], [-4.42, 0.98], [-4.14, 0.98]]),
    h.fin('ventral', 'paint', [[-3.92, 0.32], [-4.16, 0.32], [-4.3, 0.0], [-4.1, 0.0]]),
    box('stabiliser', 'paint', [-3.74, 0.46, -0.48], [-3.48, 0.5, 0.48]),
  ], { paint: s.paint }),
  k.compound('crashed_light_helicopter_tail_rotor', 5, [
    k.turned('hub', 'head', 'z', k.disc(0.05, 0, 0.14), [s.tail.x, s.tail.y, 0]) + { sides: 8 },
    m.bar('up', 'blade', [s.tail.x, s.tail.y], [s.tail.x + 0.12, s.tail.y + 0.4], 0.11, [0.1, 0.15]),
    m.bar('up_tip', 'tip', [s.tail.x + 0.12, s.tail.y + 0.4], [s.tail.x + 0.2, s.tail.y + 0.5], 0.11, [0.1, 0.15]),
    m.bar('down', 'blade', [s.tail.x, s.tail.y], [s.tail.x - 0.38, s.tail.y - 0.22], 0.1, [0.1, 0.15]),
    m.bar('down_tip', 'tip', [s.tail.x - 0.38, s.tail.y - 0.22], [s.tail.x - 0.5, s.tail.y - 0.24], 0.1, [0.1, 0.15]),
  ], { blade: 'paint-charcoal', tip: 'paint-crane-yellow', head: 'steel-grey' }),
  k.compound('crashed_light_helicopter_main_rotor', 40,
             [
               k.turned('hub', 'head', 'y', k.disc(0.14, s.hub - 0.08, s.hub + 0.04)) + { sides: 12 },
               k.turned('cap', 'head', 'y', k.disc(0.07, s.hub + 0.04, s.hub + 0.1)) + { sides: 8 },
             ]
             // Struck the ground on the near side and folded down to it.
             + h.ribbon('a', 'blade', [[0.03, s.hub, 0.1], [0.45, 2.1, 1.05], [0.72, 1.55, 1.6], [0.95, 0.75, 2.05], [1.2, 0.2, 2.45], [1.65, 0.07, 3.0]], 0.2, thick=0.0625, step=0.1)
             + h.ribbon('a_tip', 'tip', [[1.65, 0.07, 3.0], [2.0, 0.07, 3.35]], 0.2, thick=0.0625, step=0.1)
             // Whipped up and back on the far side, kinked where it hit the boom.
             + h.ribbon('b', 'blade', [[-0.03, s.hub, -0.1], [-0.5, 2.3, -1.0], [-0.95, 2.62, -1.65], [-1.55, 2.5, -2.15], [-2.35, 2.05, -2.45]], 0.2, thick=0.0625, step=0.1)
             + h.ribbon('b_tip', 'tip', [[-2.35, 2.05, -2.45], [-2.8, 1.72, -2.55]], 0.2, thick=0.0625, step=0.1),
             { blade: 'paint-charcoal', tip: 'paint-crane-yellow', head: 'steel-grey' }),
  h.mast('crashed_light_helicopter_mast', 12, s.hub - s.mastFoot),
  k.compound('crashed_light_helicopter_skids', 20,
             // Each leg is splayed flat and each skid snapped, so the pieces lie on the ground beside the belly.
             h.ribbon('leg_front_near', 'tube', [[0.72, 0.1, 0.5], [0.74, 0.1, 1.2]], 0.1, thick=0.1)
             + h.ribbon('leg_rear_near', 'tube', [[-0.45, 0.1, 0.5], [-0.45, 0.1, 1.04]], 0.1, thick=0.1)
             + h.ribbon('leg_rear_far', 'tube', [[-0.45, 0.1, -0.5], [-0.45, 0.1, -1.12]], 0.1, thick=0.1)
             + h.ribbon('near_front', 'tube', [[0.2, 0.1, 1.08], [0.7, 0.1, 1.2], [1.1, 0.1, 1.38], [1.32, 0.28, 1.48]], 0.1, thick=0.1)
             + h.ribbon('near_rear', 'tube', [[-0.04, 0.1, 1.0], [-1.05, 0.1, 1.08], [-1.3, 0.18, 1.1]], 0.1, thick=0.1)
             + h.ribbon('far_rear', 'tube', [[0.28, 0.1, -1.22], [-0.55, 0.1, -1.12], [-1.05, 0.1, -0.95], [-1.3, 0.18, -0.88]], 0.1, thick=0.1)
             + h.ribbon('far_front', 'tube', [[0.62, 0.1, -1.05], [1.45, 0.1, -1.18], [1.9, 0.1, -0.98], [2.12, 0.28, -0.84]], 0.1, thick=0.1),
             { tube: trim }),
  k.compound('crashed_light_helicopter_seat_frame', 7, [
    box('pan', 'dark', [-0.24, 0, -0.23], [0.22, 0.08, 0.23]),
    box('cushion', 'seat', [-0.24, 0.08, -0.23], [0.22, 0.18, 0.23]),
    k.prism('back', 'seat', [[-0.3, 0.14], [-0.2, 0.14], [-0.24, 0.78], [-0.33, 0.78]], [-0.23, 0.23]),
  ], { dark: trim, seat: 'cloth-seat' }),
]
