local h = import '../compound.libsonnet';
local box = h.box;
// A sheet of cloth folded into a square pad `w` across and `d` deep, `folds` layers stacked `ht` tall, folded edges
// to -z. Slot cloth.
local folded(w, d, ht, folds) = h.foldedGarment(w, d, ht, folds);
// A darker band laid along the open edge (+z) of a folded pad's top layer: a selvedge, hem or facing. Slot `slot`.
local edgeBand(slot, w, d, ht, band=0.008) = [box('band', slot, [-w / 2, ht - 0.0005, d / 2 - band], [w / 2, ht + 0.001, d / 2])];
// Patches sewn over a folded pad's top face, a grid `cols` by `rows` alternating the slots `slots`, each patch a hair
// proud of the next so the seams read. Slots: the names in `slots`, plus seam.
local patches(w, d, ht, cols, rows, slots) =
  local pw = w / cols, pd = d / rows;
  [
    box('patch-%d-%d' % [i, j], slots[(i + j * 2) % std.length(slots)],
        [-w / 2 + i * pw + 0.002, ht, -d / 2 + j * pd + 0.002], [-w / 2 + (i + 1) * pw - 0.002, ht + 0.001 + ((i + j) % 2) * 0.001, -d / 2 + (j + 1) * pd - 0.002])
    for i in std.range(0, cols - 1)
    for j in std.range(0, rows - 1)
  ] + [
    box('seam-x-%d' % i, 'seam', [-w / 2 + i * pw - 0.0015, ht, -d / 2], [-w / 2 + i * pw + 0.0015, ht + 0.0015, d / 2])
    for i in std.range(1, cols - 1)
  ] + [
    box('seam-z-%d' % j, 'seam', [-w / 2, ht, -d / 2 + j * pd - 0.0015], [w / 2, ht + 0.0015, -d / 2 + j * pd + 0.0015])
    for j in std.range(1, rows - 1)
  ];
// Tufts of pile standing on a pad's top face in a staggered grid, `n` by `n`, `t` tall. Slot pile.
local pile(w, d, ht, n, t) = [
  local px = -w / 2 + (i + 0.5 + (j % 2) * 0.25) * w / (n + 0.5), pz = -d / 2 + (j + 0.5) * d / n, r = w / n * 0.45;
  box('tuft-%d-%d' % [i, j], 'pile', [px - r, ht, pz - r], [px + r, ht + t * (0.7 + 0.3 * ((i * 7 + j * 3) % 3) / 2), pz + r])
  for i in std.range(0, n - 1)
  for j in std.range(0, n - 1)
];
// A sheet rolled along x, `len` long, outer radius `r`, the last turn's edge lying along the top, tied near each end
// with a thong. Slots: roll, edge, tie.
local rolled(len, r, t) = [
  h.tube('roll', 'roll', r * 0.35, r, -len / 2, len / 2),
  box('edge', 'edge', [-len / 2, r - t, -0.004], [len / 2, r + t * 0.6, r * 0.5]),
  h.tube('tie-a', 'tie', r - 0.0005, r + 0.0025, -len / 2 + 0.04, -len / 2 + 0.048),
  h.tube('tie-b', 'tie', r - 0.0005, r + 0.0025, len / 2 - 0.048, len / 2 - 0.04),
  box('tail-a', 'tie', [-len / 2 + 0.042, 0, r], [-len / 2 + 0.046, 0.002, r + 0.03]),
  box('tail-b', 'tie', [len / 2 - 0.046, 0, r], [len / 2 - 0.042, 0.002, r + 0.034]),
];
// A tanned hide laid flat as convex [x, z] pieces: a body, four leg flaps, a neck and a tail stub.
local hidePieces = {
  body: [[-0.13, -0.17], [0.13, -0.17], [0.145, 0], [0.13, 0.13], [-0.13, 0.13], [-0.145, 0]],
  'leg-fr': [[0.1, 0.1], [0.135, 0.1], [0.185, 0.16], [0.165, 0.2], [0.09, 0.13]],
  'leg-fl': [[-0.135, 0.1], [-0.1, 0.1], [-0.09, 0.13], [-0.165, 0.2], [-0.185, 0.16]],
  'leg-hr': [[0.08, -0.15], [0.135, -0.15], [0.185, -0.22], [0.165, -0.25], [0.09, -0.19]],
  'leg-hl': [[-0.135, -0.15], [-0.08, -0.15], [-0.09, -0.19], [-0.165, -0.25], [-0.185, -0.22]],
  neck: [[-0.05, 0.12], [0.05, 0.12], [0.04, 0.245], [-0.04, 0.245]],
  tail: [[-0.02, -0.16], [0.02, -0.16], [0.012, -0.26], [-0.012, -0.26]],
};
local zx(poly) = [[p[1], p[0]] for p in poly];
[
  // A 300 by 600 mm sheet of plain cotton cloth folded to a pad 150 mm square and 5 mm tall, a hemmed band along
  // its open edge.
  h.compound('sheet_cotton', 0.02, folded(0.15, 0.15, 0.005, 3) + edgeBand('hem', 0.15, 0.15, 0.005),
    { cloth: 'cloth-cream', hem: 'cloth-cotton' })
  + { voxelGrain: 0.002 },

  // A 300 by 600 mm sheet of blue denim folded to a pad 150 mm square and 10 mm tall, its white selvedge edge on top.
  h.compound('sheet_denim', 0.07, folded(0.15, 0.15, 0.01, 4) + edgeBand('selvedge', 0.15, 0.15, 0.01, 0.006),
    { cloth: 'cloth-denim', selvedge: 'cloth-cream' })
  + { voxelGrain: 0.002 },

  // A 300 by 600 mm sheet sewn from mismatched denim scraps, folded to a pad 150 mm square and 10 mm tall, its top
  // face showing the patches and their seams.
  h.compound('sheet_denim_patchwork', 0.045, folded(0.15, 0.15, 0.01, 4) + patches(0.15, 0.15, 0.01, 3, 3, ['a', 'b', 'c']),
    { cloth: 'cloth-denim', a: 'cloth-denim', b: 'cloth-denim-faded', c: 'cloth-navy', seam: 'cloth-cream' })
  + { voxelGrain: 0.002 },

  // A 300 by 600 mm sheet of thick faux fur folded to a pad 160 mm square and 18 mm tall: a woven backing with
  // shaggy pile tufted over its top.
  h.compound('sheet_faux_fur', 0.1, folded(0.16, 0.16, 0.012, 2) + pile(0.16, 0.16, 0.012, 6, 0.008),
    { cloth: 'cloth-cream', pile: 'fur-pale' })
  + { voxelGrain: 0.002 },

  // A 300 by 600 mm sheet of grey wool felt folded to a pad 150 mm square and 6 mm tall.
  h.compound('sheet_felt', 0.024, folded(0.15, 0.15, 0.006, 3), { cloth: 'felt-grey' })
  + { voxelGrain: 0.002 },

  // A 300 by 600 mm sheet sewn from scraps of fur, folded to a pad 160 mm square and 18 mm tall, mismatched pelts
  // on top and stitched seams between them.
  h.compound('sheet_fur_patchwork', 0.33,
    folded(0.16, 0.16, 0.014, 2) + patches(0.16, 0.16, 0.014, 3, 2, ['a', 'b', 'c']) + [
      box('pile-%d' % i, ['a', 'b', 'c'][i % 3], [-0.07 + i * 0.028, 0.016, -0.06 + (i % 2) * 0.06], [-0.05 + i * 0.028, 0.019, -0.03 + (i % 2) * 0.06])
      for i in std.range(0, 4)
    ],
    { cloth: 'skin-rawhide', a: 'fur-brown', b: 'fur-pale', c: 'leather-chestnut', seam: 'skin-rawhide' })
  + { voxelGrain: 0.002 },

  // A 300 by 600 mm sheet of loose-woven aramid cloth folded to a pad 150 mm square and 6 mm tall, the weave
  // showing as ridges across its top.
  h.compound('sheet_kevlar', 0.025, folded(0.15, 0.15, 0.006, 4) + [
    box('weave-%d' % i, 'weave', [-0.075, 0.006, -0.07 + i * 0.016], [0.075, 0.007, -0.066 + i * 0.016])
    for i in std.range(0, 8)
  ], { cloth: 'aramid-gold', weave: 'aramid-gold' })
  + { voxelGrain: 0.002 },

  // A rigid ballistic panel 250 by 300 mm and 11 mm thick: sixteen layers of tight-woven aramid bonded into a stack,
  // stitched round its border and with its corners cut back.
  h.compound('sheet_kevlar_layered', 0.35, [
    h.prism('panel', 'layer', 'y', zx([
      [-0.125, -0.13], [-0.105, -0.15], [0.105, -0.15], [0.125, -0.13], [0.125, 0.13], [0.105, 0.15], [-0.105, 0.15], [-0.125, 0.13],
    ]), 0, 0.011),
  ] + [
    box('line-%d-%s' % [i, e[0]], 'line', e[1], e[2])
    for i in std.range(1, 4)
    for y in [i * 0.0022]
    for e in [
      ['l', [-0.1256, y, -0.13], [-0.1245, y + 0.0006, 0.13]],
      ['r', [0.1245, y, -0.13], [0.1256, y + 0.0006, 0.13]],
      ['b', [-0.105, y, -0.1506], [0.105, y + 0.0006, -0.1495]],
      ['f', [-0.105, y, 0.1495], [0.105, y + 0.0006, 0.1506]],
    ]
  ] + [
    box('stitch-x0', 'stitch', [-0.112, 0.011, -0.138], [0.112, 0.0118, -0.135]),
    box('stitch-x1', 'stitch', [-0.112, 0.011, 0.135], [0.112, 0.0118, 0.138]),
    box('stitch-z0', 'stitch', [-0.114, 0.011, -0.135], [-0.111, 0.0118, 0.135]),
    box('stitch-z1', 'stitch', [0.111, 0.011, -0.135], [0.114, 0.0118, 0.135]),
    box('label', 'label', [-0.04, 0.011, 0.09], [0.04, 0.0116, 0.12]),
  ], { layer: 'aramid-gold', line: 'cloth-brown', stitch: 'nylon-black', label: 'cloth-white' })
  + { voxelGrain: 0.002 },

  // A 300 by 600 mm sheet of brown leather rolled into a 300 mm roll 44 mm across, tied near each end with a thong.
  h.compound('sheet_leather', 0.34, rolled(0.3, 0.022, 0.0016),
    { roll: 'leather-brown', edge: 'leather-chestnut', tie: 'skin-rawhide' })
  + { voxelGrain: 0.002 },

  // A sheet of shiny stretch fabric folded to a pad 150 mm square and 8 mm tall.
  h.compound('sheet_lycra', 0.032, folded(0.15, 0.15, 0.008, 4), { cloth: 'lycra-blue' })
  + { voxelGrain: 0.002 },

  // A 300 by 600 mm sheet of 1 mm black neoprene folded to a pad 150 mm square and 8 mm tall, the blue nylon
  // facing showing along its open edge.
  h.compound('sheet_neoprene', 0.08, folded(0.15, 0.15, 0.008, 4) + edgeBand('facing', 0.15, 0.15, 0.008, 0.012),
    { cloth: 'neoprene-black', facing: 'lycra-blue' })
  + { voxelGrain: 0.002 },

  // A sheet of tan flame-resistant aramid cloth folded to a pad 150 mm square and 8 mm tall, a hem along its edge.
  h.compound('sheet_nomex', 0.032, folded(0.15, 0.15, 0.008, 4) + edgeBand('hem', 0.15, 0.15, 0.008),
    { cloth: 'cloth-turnout', hem: 'knit-fr' })
  + { voxelGrain: 0.002 },

  // A sheet of thin red synthetic fabric folded to a pad 150 mm square and 6 mm tall.
  h.compound('sheet_nylon', 0.015, folded(0.15, 0.15, 0.006, 4), { cloth: 'nylon-red' })
  + { voxelGrain: 0.002 },

  // A cotton webbing strap 1070 mm long and 38 mm wide laid out as a flat loop 480 mm long, a steel slide buckle
  // threaded on the near run and its sewn-back ends overlapping on the far run.
  h.compound('strap_cotton', 0.065,
    h.strapLoop('strap', 'strap', 0.38, 0.05, 0.038, 0.002) + [
      box('buckle-frame', 'buckle', [-0.024, 0, 0.026], [0.024, 0.006, 0.074]),
      box('buckle-bar', 'bar', [-0.0025, 0.006, 0.028], [0.0025, 0.008, 0.072]),
      box('end-a', 'strap', [0.04, 0.002, -0.069], [0.1, 0.004, -0.031]),
      box('end-b', 'strap', [-0.1, 0.002, -0.069], [-0.04, 0.004, -0.031]),
      box('stitch-a', 'stitch', [0.088, 0.004, -0.066], [0.091, 0.0045, -0.034]),
      box('stitch-b', 'stitch', [-0.091, 0.004, -0.066], [-0.088, 0.0045, -0.034]),
    ],
    { strap: 'cloth-khaki', buckle: 'steel-bright', bar: 'steel-grey', stitch: 'cloth-cream' })
  + { voxelGrain: 0.002 },

  // A whole tanned hide about 370 by 500 mm laid out flat, 5 mm thick: hair side up, the pale flesh side showing as a
  // rim round its uneven edge.
  h.compound('tanned_hide', 0.5, [
    h.prism('flesh-' + k, 'flesh', 'y', zx(hidePieces[k]), 0, 0.002)
    for k in std.objectFields(hidePieces)
  ] + [
    h.prism('grain-' + k, 'hide', 'y', zx([[q[0] * 0.96, q[1] * 0.96] for q in hidePieces[k]]), 0.002, 0.005)
    for k in std.objectFields(hidePieces)
  ], { hide: 'leather-tan', flesh: 'skin-rawhide' })
  + { voxelGrain: 0.004 },
]
