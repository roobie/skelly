local h = import '../compound.libsonnet';
local box = h.box;
local turned = h.turned;
local disc = h.disc;
// A ring of wire turned about y, radius `r`, `t` thick, its underside at height `y`.
local wireLoop(id, slot, r, t, y) = turned(id, slot, 'y', [[0, r - t], [0, r], [t, r], [t, r - t], [0, r - t]], [0, y, 0]);
[
  // A hand mirror 280 mm long lying face up: a round walnut frame 140 mm across with a silvered glass face and a
  // flat handle running off along +x.
  h.compound('mirror', 0.21, [
    disc('frame', 'frame', 0.07, 0, 0.012),
    disc('glass', 'glass', 0.062, 0.012, 0.014),
    box('neck', 'frame', [0.062, 0, -0.016], [0.08, 0.012, 0.016]),
    box('handle', 'frame', [0.08, 0.001, -0.013], [0.21, 0.011, 0.013]),
    disc('knob', 'frame', 0.015, 0.001, 0.011, 0.205, 0),
  ], { frame: 'wood-walnut', glass: 'mirror-silver' })
  + { voxelGrain: 0.004, handling: h.gripOn('mirror', 'handle') },

  // A black builder's tub 140 mm across and 95 mm tall holding about a litre of mixed mortar, its top heaped and
  // rough. Lime and adobe mortar share it, recoloured.
  h.compound('mortar_build', 1.7, [
    turned('tub', 'tub', 'y', [[0, 0], [0, 0.06], [0.09, 0.068], [0.095, 0.072], [0.095, 0.066], [0.004, 0.057], [0.004, 0]]),
    turned('fill', 'mortar', 'y', [[0, 0], [0, 0.054], [0.078, 0.062], [0.08, 0.05], [0.082, 0]], [0, 0.004, 0]),
    h.ball('lump-a', 'mortar', 0.022, -0.02, 0.084, 0.01, 0.5),
    h.ball('lump-b', 'mortar', 0.016, 0.025, 0.084, -0.015, 0.55),
    h.ball('lump-c', 'mortar', 0.014, 0.01, 0.084, 0.03, 0.6),
  ], { tub: 'plastic-black', mortar: 'stone-grey' })
  + { voxelGrain: 0.004 },

  // A micro motor 25 mm across and 50 mm long with its shaft, lying along x: a steel can with flats top and bottom,
  // a white plastic end cap with two solder tabs and a bearing boss at the shaft end.
  h.compound('motor_micro', 0.052, [
    h.rod('can', 'can', 0.0125, -0.016, 0.014, 0.0125),
    h.rod('cap', 'cap', 0.0115, 0.014, 0.02, 0.0125),
    h.rod('boss', 'can', 0.004, -0.019, -0.016, 0.0125),
    h.rod('shaft', 'shaft', 0.0012, -0.03, -0.019, 0.0125),
    box('tab-a', 'tab', [0.02, 0.018, -0.002], [0.024, 0.02, 0.002]),
    box('tab-b', 'tab', [0.02, 0.005, -0.002], [0.024, 0.007, 0.002]),
    box('label', 'label', [-0.012, 0.0215, -0.006], [0.01, 0.0255, 0.006]),
  ], { can: 'steel-bright', cap: 'plastic-white', shaft: 'steel-stainless', tab: 'brass-polished', label: 'steel-grey' })
  + { voxelGrain: 0.002 },

  // A cluster of eleven grape-sized gas bladders about 70 mm across, bunched on a short stalk of torn tissue.
  local sacs = [
    [0, 0.012, 0, 0.012], [0.02, 0.011, 0.006, 0.011], [-0.019, 0.011, 0.008, 0.011], [0.004, 0.011, 0.022, 0.011],
    [0.006, 0.011, -0.021, 0.011], [-0.015, 0.01, -0.016, 0.01], [0.022, 0.01, -0.014, 0.01], [-0.006, 0.03, 0.006, 0.012],
    [0.012, 0.029, -0.006, 0.011], [-0.008, 0.028, -0.012, 0.01], [0.004, 0.046, 0, 0.01],
  ];
  h.compound('mutant_bug_hydrogen_sacs', 0.0054, [
    h.ball('sac-%d' % i, 'sac', sacs[i][3], sacs[i][0], sacs[i][1], sacs[i][2])
    for i in std.range(0, std.length(sacs) - 1)
  ] + [
    h.rod('stalk', 'stalk', 0.004, -0.04, -0.012, 0.012),
  ], { sac: 'flesh-membrane', stalk: 'body-gore' })
  + { voxelGrain: 0.002 },

  // A cut patch of wetsuit neoprene 120 by 50 mm and 4 mm thick, one corner curling up, a knit face on top.
  h.compound('neoprene', 0.0093, [
    box('foam', 'foam', [-0.06, 0, -0.025], [0.045, 0.004, 0.025]),
    h.prism('curl', 'foam', 'z', [[0.045, 0], [0.06, 0.006], [0.06, 0.01], [0.045, 0.004]], -0.025, 0.025),
    box('face', 'face', [-0.058, 0.004, -0.023], [0.044, 0.005, 0.023]),
  ], { foam: 'neoprene-black', face: 'nylon-black' })
  + { voxelGrain: 0.002 },

  // A standard 1219 by 1016 mm wooden pallet, 140 mm tall: seven top deck boards and three bottom boards across
  // three stringers, each stringer notched twice for fork tines.
  local deck(id, z0, z1, y0) = box(id, 'board', [-0.6095, y0, z0], [0.6095, y0 + 0.019, z1]);
  local stringer(i, z) = [
    box('stringer-%d-top' % i, 'stringer', [-0.6095, 0.07, z - 0.019], [0.6095, 0.121, z + 0.019]),
  ] + [
    box('stringer-%d-foot-%d' % [i, j], 'stringer', [x0, 0.019, z - 0.019], [x1, 0.07, z + 0.019])
    for j in [0, 1, 2]
    for x0 in [[-0.6095, -0.1, 0.4][j]]
    for x1 in [[-0.4, 0.1, 0.6095][j]]
  ];
  local tops = [-0.508, -0.345, -0.18, -0.045, 0.09, 0.255, 0.418];
  h.compound('pallet', 18, std.flattenArrays([stringer(i, [-0.489, 0, 0.489][i]) for i in [0, 1, 2]]) + [
    box('top-%d' % i, 'board', [-0.6095, 0.121, tops[i]], [0.6095, 0.14, tops[i] + 0.09])
    for i in std.range(0, 6)
  ] + [
    box('bottom-%d' % i, 'board', [[-0.6095, -0.045, 0.5095][i], 0, -0.508], [[-0.5095, 0.045, 0.6095][i], 0.019, 0.508])
    for i in [0, 1, 2]
  ], { board: 'wood-pine', stringer: 'wood-oak' })
  + { voxelGrain: 0.01 },

  // A packed cargo parachute about 900 by 420 by 380 mm: an olive nylon pack tray closed by four side flaps, bound
  // with dark webbing ties, a coiled static line and steel connector links on top and a white data card on the front.
  h.compound('parachute_mil', 55, [
    box('pack', 'nylon', [-0.45, 0.01, -0.21], [0.45, 0.37, 0.21]),
    box('tray', 'tray', [-0.455, 0, -0.215], [0.455, 0.06, 0.215]),
    box('flap-l', 'flap', [-0.46, 0.06, -0.2], [-0.44, 0.34, 0.2]),
    box('flap-r', 'flap', [0.44, 0.06, -0.2], [0.46, 0.34, 0.2]),
    box('flap-top', 'flap', [-0.43, 0.37, -0.2], [0.43, 0.38, 0.2]),
  ] + [
    box('tie-%d-top' % i, 'webbing', [x - 0.025, 0.38, -0.215], [x + 0.025, 0.386, 0.215])
    for i in [0, 1, 2]
    for x in [[-0.28, 0, 0.28][i]]
  ] + [
    box('tie-%d-%s' % [i, s], 'webbing', [x - 0.025, 0.06, z0], [x + 0.025, 0.386, z1])
    for i in [0, 1, 2]
    for x in [[-0.28, 0, 0.28][i]]
    for s in ['f', 'b']
    for z0 in [if s == 'f' then 0.21 else -0.216]
    for z1 in [if s == 'f' then 0.216 else -0.21]
  ] + [
    wireLoop('line-%d' % i, 'line', 0.09 - i * 0.012, 0.012, 0.386 + i * 0.006) + { origin: [-0.14, 0.386 + i * 0.006, 0] }
    for i in [0, 1, 2]
  ] + [
    box('link-a', 'steel', [0.1, 0.386, -0.05], [0.18, 0.398, -0.03]),
    box('link-b', 'steel', [0.1, 0.386, 0.03], [0.18, 0.398, 0.05]),
    box('card', 'card', [-0.2, 0.2, 0.216], [-0.06, 0.3, 0.22]),
  ], { nylon: 'cloth-olive-drab', tray: 'nylon-ranger-green', flap: 'cloth-olive-drab', webbing: 'webbing-olive-dark', line: 'webbing-olive-dark', steel: 'steel-grey', card: 'paper-white' })
  + { voxelGrain: 0.01 },

  // A stone eyeball 78 mm across resting on the ground, looking out along +z: a pale grey ball with a green stone iris
  // and a cross-shaped black pupil.
  h.compound('petrified_eye', 0.57, [
    h.ball('ball', 'stone', 0.039, 0, 0.039, 0),
    turned('iris', 'iris', 'z', [[0, 0], [0, 0.019], [0.004, 0.017], [0.006, 0]], [0, 0.039, 0.033]),
    box('pupil-v', 'pupil', [-0.0025, 0.027, 0.036], [0.0025, 0.051, 0.041]),
    box('pupil-h', 'pupil', [-0.012, 0.0365, 0.036], [0.012, 0.0415, 0.041]),
  ], { stone: 'stone-grey', iris: 'jade-green', pupil: 'obsidian' })
  + { voxelGrain: 0.002 },

  // A small coil of piano wire about 40 mm across, five loose turns held by a twist of the same wire.
  h.compound('piano_wire', 0.02, [
    wireLoop('turn-%d' % i, 'wire', [0.02, 0.021, 0.019, 0.0205, 0.0195][i], 0.002, i * 0.0015)
    for i in std.range(0, 4)
  ] + [
    box('twist', 'wire', [0.016, 0, -0.002], [0.024, 0.009, 0.002]),
    box('end', 'wire', [-0.019, 0.006, 0.008], [-0.003, 0.008, 0.01]),
  ], { wire: 'steel-bright' })
  + { voxelGrain: 0.002 },

  // A bed pillow rolled for carrying, 360 mm long and 180 mm across, its cotton case showing the spiral of the roll at
  // each end, the loose edge lying along the top, tied with cord in two places.
  h.compound('pillow', 0.7, [
    h.tube('outer', 'case', 0.074, 0.09, -0.18, 0.18, 0.09, 0),
    h.tube('middle', 'fill', 0.048, 0.07, -0.176, 0.176, 0.09, 0),
    h.rod('core', 'case', 0.044, -0.178, 0.178, 0.09),
    h.tube('gap-a', 'shadow', 0.07, 0.074, -0.17, 0.17, 0.09, 0),
    h.tube('gap-b', 'shadow', 0.044, 0.048, -0.17, 0.17, 0.09, 0),
    box('edge', 'case', [-0.18, 0.17, 0.012], [0.18, 0.181, 0.045]),
    h.tube('tie-a', 'cord', 0.09, 0.094, -0.11, -0.098, 0.09, 0),
    h.tube('tie-b', 'cord', 0.09, 0.094, 0.098, 0.11, 0.09, 0),
  ], { case: 'cloth-cream', fill: 'cloth-white', shadow: 'cloth-rag-shadow', cord: 'cord-cotton' })
  + { voxelGrain: 0.004 },

  // A piezo igniter 70 mm long lying along x: a black plastic body with a red push button at -x, an aluminium sleeve
  // with a lock nut, and a bare electrode wire bent at the tip.
  h.compound('pilot_light', 0.0053, [
    h.rod('button', 'button', 0.005, -0.03, -0.022, 0.007),
    h.rod('body', 'body', 0.007, -0.022, 0.008, 0.007),
    h.rod('sleeve', 'sleeve', 0.0035, 0.008, 0.03, 0.007),
    h.rod('nut', 'sleeve', 0.006, 0.012, 0.016, 0.007),
    h.rod('electrode', 'wire', 0.001, 0.03, 0.04, 0.007),
    box('tip', 'wire', [0.038, 0.007, -0.001], [0.04, 0.013, 0.001]),
  ], { button: 'plastic-red', body: 'plastic-black', sleeve: 'alu-bare', wire: 'steel-bright' })
  + { voxelGrain: 0.002 },

  // A twisted-wire bore brush 350 mm long lying along x: a steel finger loop at -x, a long twisted shaft and a cotton
  // brush head 100 mm long with a rounded tip.
  h.compound('pipe_cleaner', 0.043, [
    wireLoop('loop', 'wire', 0.02, 0.004, 0.006) + { origin: [-0.16, 0.006, 0] },
    h.rod('shaft', 'wire', 0.002, -0.141, 0.06, 0.009),
  ] + [
    h.rod('twist-%d' % i, 'wire', 0.003, -0.13 + i * 0.03, -0.124 + i * 0.03, 0.009)
    for i in std.range(0, 6)
  ] + [
    h.rod('brush', 'cotton', 0.009, 0.06, 0.16, 0.009),
    turned('tip', 'cotton', 'x', [[0, 0], [0, 0.009], [0.006, 0.007], [0.01, 0]], [0.16, 0.009, 0]),
  ], { wire: 'steel-galvanised', cotton: 'cloth-bright-white' })
  + { voxelGrain: 0.004, handling: h.gripOn('pipe_cleaner', 'shaft') },

  // A cheap plastic plant pot 180 mm across at the rim and 150 mm tall, tapering to 130 mm at the base, with a
  // rolled rim and a foot ring.
  h.compound('plastic_pot_flower', 0.11, [
    turned('pot', 'pot', 'y', [
      [0, 0], [0, 0.062], [0.006, 0.065], [0.14, 0.086], [0.15, 0.09], [0.15, 0.086], [0.136, 0.082], [0.006, 0.061],
      [0.006, 0],
    ]),
    turned('rim', 'pot', 'y', [[0, 0.084], [0, 0.092], [0.012, 0.092], [0.012, 0.084], [0, 0.084]], [0, 0.138, 0]),
  ], { pot: 'paint-terracotta' })
  + { voxelGrain: 0.004 },
]
