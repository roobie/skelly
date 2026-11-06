local h = import '../compound.libsonnet';
local box = h.box;
local turned = h.turned;
local disc = h.disc;
// A ring of round stock turned about y: centre radius `R`, stock radius `t`, its underside at `y`.
local torus(id, slot, R, t, y, x=0, z=0, n=10) = turned(id, slot, 'y', [
  [t + t * std.sin(2 * std.pi * i / n), R + t * std.cos(2 * std.pi * i / n)]
  for i in std.range(0, n)
], [x, y, z]);
[
  // A signal repeater module, 120 by 80 mm and 26 mm tall: an aluminium tray carrying a green board with a shield can,
  // chips and a coax socket on its front edge.
  h.compound('transponder', 0.28, [
    box('tray', 'tray', [-0.060, 0, -0.040], [0.060, 0.008, 0.040]),
    box('wall-l', 'tray', [-0.060, 0.008, -0.040], [-0.056, 0.016, 0.040]),
    box('wall-r', 'tray', [0.056, 0.008, -0.040], [0.060, 0.016, 0.040]),
    box('wall-b', 'tray', [-0.056, 0.008, -0.040], [0.056, 0.016, -0.036]),
    box('wall-f', 'tray', [-0.056, 0.008, 0.036], [0.056, 0.016, 0.040]),
    box('board', 'board', [-0.056, 0.010, -0.036], [0.056, 0.012, 0.036]),
    box('shield', 'shield', [-0.048, 0.012, -0.030], [-0.004, 0.024, 0.010]),
    box('chip-a', 'chip', [0.008, 0.012, -0.028], [0.030, 0.016, -0.010]),
    box('chip-b', 'chip', [0.036, 0.012, -0.028], [0.050, 0.016, -0.016]),
    box('chip-c', 'chip', [0.010, 0.012, 0.002], [0.022, 0.015, 0.014]),
    disc('cap-a', 'cap', 0.004, 0.012, 0.024, 0.036, 0.008),
    disc('cap-b', 'cap', 0.004, 0.012, 0.024, 0.046, 0.008),
    box('header', 'chip', [-0.040, 0.012, 0.020], [-0.010, 0.020, 0.026]),
    turned('socket', 'socket', 'z', [[0, 0], [0, 0.005], [0.006, 0.005], [0.006, 0.0035], [0.014, 0.0035], [0.014, 0]], [0.030, 0.014, 0.034]),
    box('led', 'led', [0.044, 0.012, 0.026], [0.048, 0.015, 0.030]),
  ], { tray: 'metal-silver', board: 'circuit-green', shield: 'steel-galvanised', chip: 'plastic-matte-black', cap: 'plastic-blue', socket: 'brass-polished', led: 'plastic-red' }) + { voxelGrain: 0.002 },

  // A sap spile: a steel tube 80 mm long, 12 mm across at the head, tapering to a 7 mm spout, with a bucket hook.
  h.compound('tree_spile', 0.018, [
    turned('tube', 'tube', 'x', [[0, 0.003], [0, 0.006], [0.012, 0.006], [0.014, 0.0045], [0.060, 0.0045], [0.080, 0.0035], [0.080, 0.002], [0, 0.002], [0, 0.003]], [-0.040, 0.008, 0]),
    turned('collar', 'tube', 'x', [[0, 0.0045], [0, 0.008], [0.003, 0.008], [0.003, 0.0045], [0, 0.0045]], [-0.026, 0.008, 0]),
    box('hook-stem', 'hook', [-0.022, 0, -0.001], [-0.018, 0.004, 0.001]),
    box('hook-foot', 'hook', [-0.022, 0, -0.001], [-0.010, 0.002, 0.001]),
    box('hook-tip', 'hook', [-0.012, 0, -0.001], [-0.010, 0.004, 0.001]),
  ], { tube: 'steel-galvanised', hook: 'steel-grey' }) + h.inHand('tree_spile', 'tube') + { voxelGrain: 0.002 },

  // A crushproof thumb drive: a 62 mm knurled steel capsule, 17 mm across, its cap screwed on over a rubber seal, with
  // a small split ring through the tail.
  h.compound('usb_drive_nano', 0.062, [
    turned('body', 'body', 'x', [[0, 0], [0, 0.0075], [0.004, 0.0085], [0.036, 0.0085], [0.036, 0]], [-0.030, 0.0085, 0]),
    turned('knurl-a', 'knurl', 'x', [[0, 0], [0, 0.0086], [0.004, 0.0086], [0.004, 0]], [-0.020, 0.0085, 0]),
    turned('knurl-b', 'knurl', 'x', [[0, 0], [0, 0.0086], [0.004, 0.0086], [0.004, 0]], [-0.012, 0.0085, 0]),
    turned('seal', 'seal', 'x', [[0, 0], [0, 0.0088], [0.002, 0.0088], [0.002, 0]], [0.006, 0.0085, 0]),
    turned('cap', 'cap', 'x', [[0, 0], [0, 0.0085], [0.020, 0.0085], [0.024, 0.0065], [0.024, 0]], [0.008, 0.0085, 0]),
    turned('lug', 'body', 'x', [[0, 0], [0, 0.003], [0.004, 0.003], [0.004, 0]], [-0.034, 0.0085, 0]),
    turned('ring', 'ring', 'z', [[0, 0.0045], [0, 0.0065], [0.002, 0.0065], [0.002, 0.0045], [0, 0.0045]], [-0.039, 0.0085, -0.001]),
  ], { body: 'steel-stainless', knurl: 'steel-grey', seal: 'rubber-black', cap: 'steel-stainless', ring: 'steel-bright' }) + { voxelGrain: 0.002 },

  // A curled sheet of willow bark about 260 by 90 mm and 7 mm thick, grey furrowed outside up over a pale inner layer.
  local outline = [[-0.130, -0.040], [-0.090, -0.046], [0.020, -0.044], [0.125, -0.036], [0.132, 0.030], [0.060, 0.045], [-0.060, 0.044], [-0.128, 0.034]];
  local r = 0.07;
  h.compound('willowbark', 0.097,
    h.curvedPlate('inner', 'inner', [[p[1], p[0]] for p in outline], 0, 0.002, r, 6)
    + h.curvedPlate('outer', 'bark', [[p[1], p[0]] for p in outline], 0.002, 0.005, r, 6)
    + [
      h.onCurvedFace('furrow-%d' % i, 'furrow', [[p[1], p[0]] for p in outline], 0.002, 0.005, r, [z, -0.110 + i * 0.012], [z + 0.004, 0.105 - i * 0.010], 0.004)
      for i in std.range(0, 4)
      for z in [[-0.028, -0.012, 0.002, 0.016, 0.030][i]]
    ], { inner: 'wood-birch', bark: 'bark', furrow: 'coal-black' }) + { voxelGrain: 0.002 },

  // About 6 m of 2 mm steel wire in a loose 150 mm coil, twist-tied in two places, one end sticking out.
  h.compound('wire', 0.17, [
    torus('turn-%d' % i, 'wire', 0.070 + (i % 3) * 0.002, 0.0015, i * 0.0025, (i % 2) * 0.002 - 0.001, ((i + 1) % 3) * 0.0015 - 0.0015)
    for i in std.range(0, 5)
  ] + [
    box('tie-a', 'tie', [-0.078, 0, -0.004], [-0.064, 0.019, 0.004]),
    box('tie-b', 'tie', [0.064, 0, -0.004], [0.078, 0.019, 0.004]),
    box('end', 'wire', [-0.003, 0.012, 0.068], [0.003, 0.015, 0.110]),
  ], { wire: 'steel-bright', tie: 'steel-grey' }) + { voxelGrain: 0.002 },

  // A short coil of barbed wire, 220 mm across: two twisted strands with four-point barbs every 50 mm or so.
  h.compound('wire_barbed', 0.18, [
    torus('strand-%d' % i, 'wire', 0.108 + i * 0.003, 0.0016, i * 0.006)
    for i in std.range(0, 2)
  ] + std.flattenArrays([
    local a = 2 * std.pi * k / 14;
    local x = 0.110 * std.sin(a);
    local z = 0.110 * std.cos(a);
    local y = (k % 3) * 0.006 + 0.0016;
    [
      box('barb-x-%d' % k, 'barb', [x - 0.011, y - 0.001, z - 0.0015], [x + 0.011, y + 0.003, z + 0.0015]),
      box('barb-z-%d' % k, 'barb', [x - 0.0015, y - 0.001, z - 0.011], [x + 0.0015, y + 0.003, z + 0.011]),
      box('barb-y-%d' % k, 'barb', [x - 0.0015, y - 0.006, z - 0.0015], [x + 0.0015, y + 0.008, z + 0.0015]),
    ]
    for k in std.range(0, 13)
  ]), { wire: 'steel-galvanised', barb: 'steel-grey' }) + { voxelGrain: 0.002 },

  // A 152 mm square of woven steel mesh, drawn as wires every 10 mm with open squares between, the weft lying on the warp.
  h.compound('wire_mesh', 0.03, [
    box('warp-%d' % i, 'mesh', [-0.076 + i * 0.01, 0, -0.076], [-0.074 + i * 0.01, 0.002, 0.076])
    for i in std.range(0, 15)
  ] + [
    box('weft-%d' % i, 'mesh', [-0.076, 0.002, -0.076 + i * 0.01], [0.076, 0.004, -0.074 + i * 0.01])
    for i in std.range(0, 15)
  ], { mesh: 'steel-bright' }) + { voxelGrain: 0.002 },

  // A corn husk parcel of cooked rice, 140 mm long and 55 mm across, tied at both ends, split along the top where the
  // rice inside has grown white and yellow-green mould.
  h.compound('young_koji_done', 0.2, [
    turned('husk', 'husk', 'x', [[0, 0], [0, 0.008], [0.015, 0.016], [0.035, 0.026], [0.070, 0.028], [0.105, 0.026], [0.125, 0.016], [0.140, 0.008], [0.140, 0]], [-0.070, 0.028, 0]),
    turned('tail-a', 'husk', 'x', [[0, 0], [0, 0.012], [0.018, 0.005], [0.018, 0]], [-0.088, 0.028, 0]),
    turned('tail-b', 'husk', 'x', [[0, 0], [0, 0.005], [0.018, 0.012], [0.018, 0]], [0.070, 0.028, 0]),
    turned('tie-a', 'tie', 'x', [[0, 0], [0, 0.0095], [0.004, 0.0095], [0.004, 0]], [-0.070, 0.028, 0]),
    turned('tie-b', 'tie', 'x', [[0, 0], [0, 0.0095], [0.004, 0.0095], [0.004, 0]], [0.066, 0.028, 0]),
    box('rice', 'rice', [-0.040, 0.044, -0.012], [0.040, 0.057, 0.012]),
    box('vein-a', 'vein', [-0.050, 0.044, -0.020], [0.050, 0.056, -0.017]),
    box('vein-b', 'vein', [-0.050, 0.044, 0.017], [0.050, 0.056, 0.020]),
    h.ball('mould-a', 'mould', 0.010, -0.022, 0.056, 0.002, 0.5),
    h.ball('mould-b', 'mould', 0.008, 0.012, 0.057, -0.004, 0.5),
    h.ball('mould-c', 'mould', 0.007, 0.030, 0.056, 0.005, 0.5),
    h.ball('spore-a', 'spore', 0.005, -0.006, 0.058, 0.005, 0.5),
    h.ball('spore-b', 'spore', 0.004, 0.024, 0.059, -0.003, 0.5),
  ], { husk: 'straw-pale', tie: 'jute', rice: 'cloth-cream', vein: 'plant-dried', mould: 'fleece-pale', spore: 'cloth-sage' }) + { voxelGrain: 0.002 },
]
