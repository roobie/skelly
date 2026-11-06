local h = import '../compound.libsonnet';
local box = h.box;
local turned = h.turned;
local disc = h.disc;
// A solid or hollow cylinder segment on `axis` ('x' lying, 'y' standing) from `t0` to `t1`, radii `r0` to `r1`.
// Lying segments run at height `c`. A hollow one ends its outline on its first point so the hole stays open.
local seg(id, slot, axis, r0, r1, t0, t1, c=0) = turned(
  id,
  slot,
  axis,
  if r0 == 0 then [[0, 0], [0, r1], [t1 - t0, r1], [t1 - t0, 0]]
  else [[0, r0], [0, r1], [t1 - t0, r1], [t1 - t0, r0], [0, r0]],
  if axis == 'y' then [0, t0, 0] else [t0, c, 0],
);
// A flat ring standing on y from `y0` to `y1`, radii `r0` to `r1`.
local ring(id, slot, r0, r1, y0, y1) = seg(id, slot, 'y', r0, r1, y0, y1);
// A military fibreboard round container on `axis`, `length` long and `radius` across its steel end caps:
// a black tube, caps at both ends, tape over the lid seam and a yellow marking band at `band`.
local fibreTube(axis, length, radius, band) =
  local cap = 0.014, body = radius - 0.002, t0 = if axis == 'y' then 0 else -length / 2, c = radius;
  [
    seg('cap-foot', 'cap', axis, 0, radius, t0, t0 + cap, c),
    seg('tube', 'tube', axis, 0, body, t0 + cap, t0 + length - cap, c),
    seg('cap-top', 'cap', axis, 0, radius, t0 + length - cap, t0 + length, c),
    seg('tape', 'tape', axis, body, radius, t0 + length - cap - 0.014, t0 + length - cap, c),
    seg('band', 'band', axis, body, radius, t0 + band, t0 + band + 0.008, c),
  ];
[
  // A cardboard carton for three stripper clips of rifle rounds, 92 mm long, 60 mm deep and 42 mm tall,
  // open on top with a thumb notch cut into its front wall and a black stencil strip below it.
  h.compound('ammo_box_army_3_clips', 0.012, [
    box('floor', 'board', [-0.046, 0, -0.03], [0.046, 0.002, 0.03]),
    box('back', 'board', [-0.046, 0.002, -0.03], [0.046, 0.042, -0.028]),
    box('left', 'board', [-0.046, 0.002, -0.028], [-0.044, 0.042, 0.028]),
    box('right', 'board', [0.044, 0.002, -0.028], [0.046, 0.042, 0.028]),
    box('front-left', 'board', [-0.046, 0.002, 0.028], [-0.012, 0.042, 0.03]),
    box('front-right', 'board', [0.012, 0.002, 0.028], [0.046, 0.042, 0.03]),
    box('front-low', 'board', [-0.012, 0.002, 0.028], [0.012, 0.026, 0.03]),
    box('stencil', 'stencil', [-0.036, 0.008, 0.03], [0.036, 0.016, 0.032]),
  ], { board: 'paperboard-brown', stencil: 'paint-charcoal' })
  + { voxelGrain: 0.002 },

  // A fibreboard container for one hand grenade, standing on end: 75 mm across its steel caps and 135 mm
  // tall, black with tape over the lid seam and a yellow band.
  h.compound('ammunition_box_grenade', 0.14, fibreTube('y', 0.135, 0.0375, 0.05), {
    tube: 'paint-charcoal',
    cap: 'steel-grey',
    tape: 'cloth-olive-drab',
    band: 'plastic-yellow',
  })
  + h.inHand('ammunition_box_grenade', 'tube') + { voxelGrain: 0.004 },

  // A fibreboard container for one 60 mm mortar round, lying down: 400 mm long and 76 mm across its steel
  // caps, black with tape over the lid seam and a yellow band.
  h.compound('ammunition_tube_mortar', 0.22, fibreTube('x', 0.4, 0.038, 0.15), {
    tube: 'paint-charcoal',
    cap: 'steel-grey',
    tape: 'cloth-olive-drab',
    band: 'plastic-yellow',
  })
  + { voxelGrain: 0.004 },
]
+ (
  // A two-round container for 84 mm recoilless rifle rounds, lying down: two olive steel tubes side by side,
  // 950 mm long and 240 mm across both, with tapered nose caps at +x, flat end caps at -x, two clamp bands
  // tying the tubes together, a carry handle on top and a yellow round marking on each tube.
  local r = 0.058, cap = 0.064, len = 0.95, x0 = -len / 2, nose = 0.11, zs = [-0.062, 0.062];
  local tube(i, z) = [
    turned('end-%d' % i, 'cap', 'x', [[0, 0], [0, cap], [0.05, cap], [0.05, 0]], [x0, cap, z]),
    turned('tube-%d' % i, 'tube', 'x', [[0, 0], [0, r], [len - 0.05 - nose, r], [len - 0.05 - nose, 0]], [x0 + 0.05, cap, z]),
    turned('nose-%d' % i, 'cap', 'x', [[0, 0], [0, cap], [0.04, cap], [nose, 0.042], [nose, 0]], [x0 + len - nose, cap, z]),
    turned('mark-%d' % i, 'mark', 'x', [[0, r], [0, r + 0.002], [0.03, r + 0.002], [0.03, r], [0, r]], [0.2, cap, z]),
  ];
  [
    h.compound('ammunition_can_carlgustav', 2.5, tube(0, zs[0]) + tube(1, zs[1]) + [
      box('clamp-a', 'clamp', [-0.25, 0.002, -0.124], [-0.21, 0.126, 0.124]),
      box('clamp-b', 'clamp', [0.15, 0.002, -0.124], [0.19, 0.126, 0.124]),
      box('handle-post-a', 'handle', [-0.12, 0.118, -0.008], [-0.1, 0.15, 0.008]),
      box('handle-post-b', 'handle', [0.04, 0.118, -0.008], [0.06, 0.15, 0.008]),
      box('handle', 'handle', [-0.12, 0.15, -0.012], [0.06, 0.166, 0.012]),
    ], { tube: 'paint-olive', cap: 'paint-charcoal', mark: 'plastic-yellow', clamp: 'steel', handle: 'plastic-black' }),
  ]
)
+ [
  // A microwave oven magnetron, 120 mm by 104 mm and 112 mm tall: a steel yoke round a stack of aluminium
  // cooling fins, a square mounting flange on top under a ceramic insulator and the domed antenna cap, and a
  // filter box underneath with two terminal tabs.
  h.compound('magnetron', 0.96, [
    box('filter', 'box', [-0.034, 0, -0.03], [0.034, 0.03, 0.03]),
    box('terminal-a', 'terminal', [0.034, 0.012, -0.016], [0.048, 0.016, -0.008]),
    box('terminal-b', 'terminal', [0.034, 0.012, 0.008], [0.048, 0.016, 0.016]),
    box('yoke-foot', 'yoke', [-0.05, 0.03, -0.034], [0.05, 0.034, 0.034]),
    box('yoke-left', 'yoke', [-0.05, 0.034, -0.034], [-0.046, 0.078, 0.034]),
    box('yoke-right', 'yoke', [0.046, 0.034, -0.034], [0.05, 0.078, 0.034]),
    disc('magnet-low', 'magnet', 0.026, 0.034, 0.036),
    box('core', 'yoke', [-0.016, 0.036, -0.016], [0.016, 0.078, 0.016]),
  ] + [
    box('fin-%d' % i, 'fin', [-0.044, 0.038 + 0.006 * i, -0.052], [0.044, 0.04 + 0.006 * i, 0.052])
    for i in std.range(0, 6)
  ] + [
    box('flange', 'flange', [-0.06, 0.078, -0.036], [0.06, 0.082, 0.036]),
    disc('insulator', 'insulator', 0.011, 0.082, 0.096),
    turned('antenna', 'cap', 'y', [[0, 0], [0, 0.013], [0.008, 0.013], [0.013, 0.008], [0.016, 0]], [0, 0.096, 0]),
  ], {
    box: 'steel-galvanised',
    terminal: 'brass',
    insulator: 'ceramic-white',
    yoke: 'steel-grey',
    magnet: 'paint-charcoal',
    fin: 'alu-bare',
    flange: 'steel-galvanised',
    cap: 'steel-stainless',
  })
  + { voxelGrain: 0.002 },

  // A golden platter from a supercomputer's storage, lying flat: 400 mm across and 8 mm thick, with copper
  // circuit rings and radial traces on its face and a steel clamp hub round its spindle hole.
  h.compound('melchior_platter', 2.6, [
    ring('disc', 'gold', 0.024, 0.2, 0, 0.008),
    ring('hub', 'hub', 0.024, 0.05, 0.008, 0.014),
  ] + [
    ring('trace-%d' % i, 'trace', 0.06 + 0.028 * i, 0.064 + 0.028 * i, 0.008, 0.01)
    for i in std.range(0, 4)
  ] + [
    local a = std.pi / 4 * k, r0 = 0.05, r1 = 0.18;
    h.prism('spoke-%d' % k, 'trace', 'y', [
      [r0 * std.cos(a) - 0.002 * std.sin(a), r0 * std.sin(a) + 0.002 * std.cos(a)],
      [r1 * std.cos(a) - 0.002 * std.sin(a), r1 * std.sin(a) + 0.002 * std.cos(a)],
      [r1 * std.cos(a) + 0.002 * std.sin(a), r1 * std.sin(a) - 0.002 * std.cos(a)],
      [r0 * std.cos(a) + 0.002 * std.sin(a), r0 * std.sin(a) - 0.002 * std.cos(a)],
    ], 0.008, 0.01)
    for k in std.range(0, 7)
  ], { gold: 'foil-gold', hub: 'steel-stainless', trace: 'copper' })
  + { voxelGrain: 0.004 },

  // A full-length dressing mirror, 500 mm wide and 1650 mm tall, its glass in a slim aluminium frame
  // standing on two short feet, the rear stand leg folded flat against its back.
  h.compound('bigmirror', 13, [
    box('glass', 'glass', [-0.23, 0.05, -0.006], [0.23, 1.63, 0.006]),
    box('frame-foot', 'frame', [-0.25, 0.03, -0.015], [0.25, 0.05, 0.015]),
    box('frame-head', 'frame', [-0.25, 1.63, -0.015], [0.25, 1.65, 0.015]),
    box('frame-left', 'frame', [-0.25, 0.05, -0.015], [-0.23, 1.63, 0.015]),
    box('frame-right', 'frame', [0.23, 0.05, -0.015], [0.25, 1.63, 0.015]),
    box('back', 'frame', [-0.23, 0.05, -0.012], [0.23, 1.63, -0.006]),
    box('foot-left', 'stand', [-0.24, 0, -0.12], [-0.2, 0.03, 0.12]),
    box('foot-right', 'stand', [0.2, 0, -0.12], [0.24, 0.03, 0.12]),
    box('hinge', 'stand', [-0.04, 1.36, -0.03], [0.04, 1.4, -0.015]),
    box('leg', 'stand', [-0.02, 0.2, -0.025], [0.02, 1.36, -0.015]),
  ], { glass: 'glass-grey', frame: 'alu-bare', stand: 'alu-anodized-black' }),
]
+ (
  // An upright piano, 1500 mm wide, 1230 mm tall and 600 mm deep: a walnut case with its fallboard open on
  // 88 keys, a music desk above them, front legs on toe blocks and three brass pedals.
  local w = 1.222 / 52, x0 = -0.611;
  local edge(b) = x0 + b * w;
  local blacks = [1] + std.flattenArrays([[s + 1, s + 2, s + 4, s + 5, s + 6] for s in [2 + 7 * k for k in std.range(0, 6)]]);
  [
    h.compound('piano', 200, [
      box('case', 'case', [-0.75, 0, -0.3], [0.75, 1.2, 0.02]),
      box('top', 'case', [-0.76, 1.2, -0.31], [0.76, 1.23, 0.04]),
      box('cheek-left', 'case', [-0.75, 0.6, 0.02], [-0.69, 0.8, 0.3]),
      box('cheek-right', 'case', [0.69, 0.6, 0.02], [0.75, 0.8, 0.3]),
      box('keybed', 'case', [-0.69, 0.6, 0.02], [0.69, 0.68, 0.3]),
      box('felt', 'felt', [-0.69, 0.68, 0.12], [0.69, 0.69, 0.13]),
      box('whites', 'white', [x0, 0.68, 0.13], [-x0, 0.7, 0.3]),
      box('fallboard', 'case', [-0.69, 0.68, 0.02], [0.69, 0.78, 0.07]),
      box('desk', 'case', [-0.42, 0.82, 0.02], [0.42, 1.0, 0.05]),
      box('desk-ledge', 'case', [-0.42, 0.82, 0.05], [0.42, 0.84, 0.08]),
      box('leg-left', 'case', [-0.74, 0.05, 0.22], [-0.7, 0.6, 0.28]),
      box('leg-right', 'case', [0.7, 0.05, 0.22], [0.74, 0.6, 0.28]),
      box('toe-left', 'case', [-0.75, 0, 0.02], [-0.69, 0.05, 0.3]),
      box('toe-right', 'case', [0.69, 0, 0.02], [0.75, 0.05, 0.3]),
    ] + [
      box('black-%d' % b, 'black', [edge(b) - 0.006, 0.7, 0.13], [edge(b) + 0.006, 0.714, 0.23])
      for b in blacks
    ] + [
      box('pedal-%d' % i, 'pedal', [0.07 * i - 0.012, 0.06, 0.02], [0.07 * i + 0.012, 0.072, 0.12])
      for i in [-1, 0, 1]
    ], { case: 'wood-walnut', felt: 'paint-oxblood', white: 'wax-ivory', black: 'plastic-black', pedal: 'brass' }),
  ]
)
