local h = import '../compound.libsonnet';
// Sawn square stock lying along x on the ground, edges eased by a chamfer `c`, end grain capped in `endFinish` slot.
local post(id, massKg, length, side, c, wood, extras=[], extraFinish={}) =
  local half = side / 2, end = 0.003;
  local outline = [[-half + c, 0], [half - c, 0], [half, c], [half, side - c], [half - c, side], [-half + c, side], [-half, side - c], [-half, c]];
  h.compound(id, massKg, [
    h.prism('body', 'body', 'x', [[p[1], p[0]] for p in outline], -length / 2 + end, length / 2 - end),
    h.prism('end-a', 'end', 'x', [[p[1], p[0]] for p in outline], -length / 2, -length / 2 + end),
    h.prism('end-b', 'end', 'x', [[p[1], p[0]] for p in outline], length / 2 - end, length / 2),
  ] + extras, { body: wood, end: 'wood-birch' } + extraFinish);
[
  // A 3.05 m round pole 40 mm across, darkened with oil soaking into it.
  h.compound('soaking_long_pole', 2.6, [
    h.rod('pole', 'pole', 0.020, -1.525, 1.525, 0.020),
  ], { pole: 'wood-walnut' }) + {
    handling: h.gripOn('soaking_long_pole', 'pole'),
  },
  // A 610 x 200 x 25 mm air-dried billet for an instrument top, ends sealed with wax against checking, a grade mark pencilled on.
  h.compound('tonewood', 1.5, [
    h.box('billet', 'wood', [-0.300, 0, -0.100], [0.300, 0.025, 0.100]),
    h.box('seal-a', 'seal', [-0.305, 0, -0.100], [-0.300, 0.025, 0.100]),
    h.box('seal-b', 'seal', [0.300, 0, -0.100], [0.305, 0.025, 0.100]),
    h.box('mark-a', 'mark', [-0.220, 0.025, -0.040], [-0.216, 0.026, 0.040]),
    h.box('mark-b', 'mark', [-0.200, 0.025, -0.040], [-0.196, 0.026, 0.040]),
  ], { wood: 'wood-pine', seal: 'beeswax', mark: 'paint-charcoal' }) + { voxelGrain: 0.004 },
  // A friction tuning peg 45 mm long: a thin oval thumb tab, a bone collar ring and a long, sharply tapered shaft with its string hole.
  h.compound('tuning_pegs', 0.0015, [
    h.prism('head', 'peg', 'y', [
      local t = std.pi * k / 8;
      [0.008 - 0.008 * std.cos(t), 0.0075 * std.sin(t)]
      for k in std.range(0, 15)
    ], 0.0055, 0.0085),
    h.turned('collar', 'collar', 'z', [[0, 0], [0, 0.0040], [0.003, 0.0040], [0.003, 0]], [0, 0.007, 0.0155]),
    h.turned('shaft', 'peg', 'z', [[0, 0], [0, 0.0032], [0.003, 0.0028], [0.026, 0.0012], [0.026, 0]], [0, 0.007, 0.0185]),
    h.box('hole', 'hole', [-0.0017, 0.0062, 0.036], [0.0017, 0.0078, 0.038]),
  ], { peg: 'wood-walnut', collar: 'bone', hole: 'void-black' }) + { voxelGrain: 0.002 },
  // An 8 x 8 inch timber, 184 mm square and 2.44 m long, with a long drying check down one face.
  post('wood_beam', 41, 2.440, 0.184, 0.004, 'wood-pine', [
    h.box('check-a', 'check', [-0.700, 0.184, -0.003], [0.350, 0.186, 0.003]),
    h.box('check-b', 'check', [0.400, 0.184, 0.010], [0.800, 0.186, 0.014]),
  ], { check: 'void-black' }),
  // A 2 x 2 x 5 inch carving block, 51 x 51 x 127 mm.
  post('wood_block', 0.17, 0.127, 0.051, 0.002, 'wood-pine') + { voxelGrain: 0.004 },
  // A 4 x 8 foot plywood sheet, 1.22 x 2.44 m and 12 mm thick: birch faces round a pine core ply that shows at the edges.
  h.compound('wood_sheet', 21, [
    h.box('back', 'face', [-1.220, 0, -0.610], [1.220, 0.004, 0.610]),
    h.box('core', 'core', [-1.220, 0.004, -0.610], [1.220, 0.008, 0.610]),
    h.box('front', 'face', [-1.220, 0.008, -0.610], [1.220, 0.012, 0.610]),
  ], { face: 'wood-birch', core: 'wood-pine' }) + { voxelGrain: 0.004 },
  // A 4 x 4 post, 89 mm square and 1.22 m long.
  post('wooden_post', 4.8, 1.220, 0.089, 0.003, 'wood-pine'),
  // A 4 x 4 post, 89 mm square and 2.44 m long.
  post('wooden_post_long', 9.6, 2.440, 0.089, 0.003, 'wood-pine'),
  // A 4 x 4 post, 89 mm square and 0.61 m long.
  post('wooden_post_short', 2.4, 0.610, 0.089, 0.003, 'wood-pine'),
]
