local h = import '../compound.libsonnet';
local box = h.box;
local turned = h.turned;
local disc = h.disc;
// A flat ring standing on y at height `y`, from radius `r0` to `r1`, `t` thick, centred on the axis.
local ring(id, slot, r0, r1, y, t) = turned(id, slot, 'y', [[0, r0], [0, r1], [t, r1], [t, r0], [0, r0]], [0, y, 0]);
// A round rail along z from `z0` to `z1`, at (x, y).
local railZ(id, slot, radius, x, y, z0, z1) = turned(id, slot, 'z', [[0, 0], [0, radius], [z1 - z0, radius], [z1 - z0, 0]], [x, y, z0]);
// Four square legs `side` thick standing at (±x, ±z) from the floor to `top`.
local legs(slot, x, z, side, top) = [
  box('leg-%s' % c.id, slot, [c.sx * x - side / 2, 0, c.sz * z - side / 2], [c.sx * x + side / 2, top, c.sz * z + side / 2])
  for c in [{ id: 'fl', sx: -1, sz: -1 }, { id: 'fr', sx: 1, sz: -1 }, { id: 'bl', sx: -1, sz: 1 }, { id: 'br', sx: 1, sz: 1 }]
];
[
  // An upholstered armchair, 900 mm wide, 850 mm deep and 960 mm tall: a deep fabric body on four short wooden
  // feet, a loose seat cushion between two padded arms with rolled tops, and a back cushion leaning against a
  // raked back.
  h.compound('armchair', 19, legs('foot', 0.4, 0.37, 0.06, 0.1) + [
    box('base', 'cloth', [-0.45, 0.1, -0.42], [0.45, 0.4, 0.42]),
    box('seat', 'cushion', [-0.3, 0.4, -0.42], [0.3, 0.52, 0.24]),
    box('piping', 'piping', [-0.3, 0.45, -0.426], [0.3, 0.47, -0.42]),
  ] + std.flattenArrays([
    [
      box('arm-%s' % s.id, 'cloth', [s.x0, 0.4, -0.42], [s.x0 + 0.15, 0.62, 0.42]),
      railZ('arm-roll-%s' % s.id, 'cloth', 0.08, s.x0 + 0.075, 0.62, -0.43, 0.42),
    ]
    for s in [{ id: 'left', x0: -0.45 }, { id: 'right', x0: 0.3 }]
  ]) + [
    h.prism('back', 'cloth', 'x', [[0.4, 0.3], [0.4, 0.42], [0.96, 0.45], [0.96, 0.33]], -0.45, 0.45),
    h.prism('back-cushion', 'cushion', 'x', [[0.52, 0.16], [0.52, 0.31], [0.92, 0.33], [0.92, 0.2]], -0.3, 0.3),
  ], { cloth: 'cloth-shirt-faded', cushion: 'cloth-shirt-faded', piping: 'cloth-rag-shadow', foot: 'wood-walnut' })
  + { voxelGrain: 0.01 },

  // A bar stool, 800 mm tall: a padded round leather seat 380 mm across on a steel column, with a round foot
  // ring on four spokes and a weighted round base plate.
  h.compound('barstool', 7.3, [
    turned('base', 'base', 'y', [[0, 0], [0, 0.2], [0.012, 0.2], [0.03, 0.12], [0.03, 0]]),
    disc('column', 'steel', 0.025, 0.03, 0.7),
    ring('foot-ring', 'steel', 0.16, 0.18, 0.3, 0.014),
  ] + [
    box('spoke-%d' % i, 'steel', [s.x0, 0.3, s.z0], [s.x1, 0.312, s.z1])
    for i in [0, 1, 2, 3]
    for s in [[{ x0: 0.02, x1: 0.165, z0: -0.006, z1: 0.006 }, { x0: -0.165, x1: -0.02, z0: -0.006, z1: 0.006 }, { x0: -0.006, x1: 0.006, z0: 0.02, z1: 0.165 }, { x0: -0.006, x1: 0.006, z0: -0.165, z1: -0.02 }][i]]
  ] + [
    disc('pan', 'steel', 0.15, 0.69, 0.71),
    turned('seat', 'seat', 'y', [[0, 0], [0, 0.17], [0.015, 0.19], [0.07, 0.19], [0.09, 0.17], [0.09, 0]], [0, 0.71, 0]),
  ], { base: 'steel-stainless', steel: 'steel-stainless', seat: 'leather-brown' })
  + { voxelGrain: 0.006 },

  // A bean bag, 900 mm across and 700 mm tall: a slumped round nylon sack full of foam beads, pressed low in
  // front into a seat and bunched high at the back, with a seam band round its widest part and a carry loop.
  h.compound('beanbag', 5.2, [
    turned('sack', 'sack', 'y', [[0, 0], [0, 0.4], [0.06, 0.45], [0.2, 0.46], [0.32, 0.42], [0.4, 0.3], [0.42, 0]]),
    turned('back', 'sack', 'y', [[0, 0], [0, 0.26], [0.2, 0.3], [0.36, 0.27], [0.46, 0.18], [0.5, 0]], [0, 0.2, 0.17]),
    turned('seam', 'seam', 'y', [[0, 0.458], [0, 0.466], [0.02, 0.466], [0.02, 0.458], [0, 0.458]], [0, 0.18, 0]),
    box('loop', 'seam', [-0.06, 0.69, 0.155], [0.06, 0.72, 0.185]),
  ], { sack: 'cloth-navy', seam: 'plastic-charcoal' })
  + { voxelGrain: 0.01 },

  // A stacking school chair, 420 mm wide, 480 mm deep and 800 mm tall: a moulded plywood seat and backrest on a
  // round steel tube frame, with side rails under the seat and rubber caps on the feet.
  h.compound('chair_plywood', 4.1, [
    disc('leg-%s' % c.id, 'frame', 0.011, 0.012, c.top, c.x, c.z)
    for c in [{ id: 'fl', x: -0.2, z: -0.2, top: 0.43 }, { id: 'fr', x: 0.2, z: -0.2, top: 0.43 }, { id: 'bl', x: -0.2, z: 0.2, top: 0.8 }, { id: 'br', x: 0.2, z: 0.2, top: 0.8 }]
  ] + [
    disc('cap-%s' % c.id, 'cap', 0.013, 0, 0.012, c.x, c.z)
    for c in [{ id: 'fl', x: -0.2, z: -0.2 }, { id: 'fr', x: 0.2, z: -0.2 }, { id: 'bl', x: -0.2, z: 0.2 }, { id: 'br', x: 0.2, z: 0.2 }]
  ] + [
    railZ('rail-left', 'frame', 0.011, -0.2, 0.42, -0.21, 0.21),
    railZ('rail-right', 'frame', 0.011, 0.2, 0.42, -0.21, 0.21),
    h.rod('rail-front', 'frame', 0.009, -0.2, 0.2, 0.2) + { origin: [-0.2, 0.2, -0.2] },
    box('seat', 'ply', [-0.215, 0.431, -0.24], [0.215, 0.447, 0.22]),
    box('seat-lip', 'ply', [-0.215, 0.425, -0.245], [0.215, 0.447, -0.235]),
    h.prism('back', 'ply', 'x', [[0.58, 0.19], [0.58, 0.206], [0.79, 0.218], [0.79, 0.202]], -0.188, 0.188),
  ], { frame: 'steel-grey', cap: 'rubber-black', ply: 'wood-birch' })
  + { voxelGrain: 0.006 },

  // A plain wooden kitchen chair, 440 mm wide, 460 mm deep and 950 mm tall: a solid seat on four square legs with
  // low stretchers, back legs running up into a backrest with a broad top rail, a lower rail and three spindles.
  h.compound('chair_wood', 7.1, legs('wood', 0.19, 0.19, 0.036, 0.45) + [
    box('back-leg-left', 'wood', [-0.208, 0.45, 0.172], [-0.172, 0.95, 0.208]),
    box('back-leg-right', 'wood', [0.172, 0.45, 0.172], [0.208, 0.95, 0.208]),
    box('seat', 'seat', [-0.22, 0.43, -0.235], [0.22, 0.46, 0.225]),
    box('apron-front', 'wood', [-0.172, 0.36, -0.2], [0.172, 0.43, -0.185]),
    box('apron-left', 'wood', [-0.2, 0.36, -0.172], [-0.185, 0.43, 0.172]),
    box('apron-right', 'wood', [0.185, 0.36, -0.172], [0.2, 0.43, 0.172]),
    railZ('stretcher-left', 'wood', 0.011, -0.19, 0.15, -0.172, 0.172),
    railZ('stretcher-right', 'wood', 0.011, 0.19, 0.15, -0.172, 0.172),
    h.rod('stretcher-front', 'wood', 0.011, -0.172, 0.172, 0.18) + { origin: [-0.172, 0.18, -0.19] },
    h.rod('stretcher-back', 'wood', 0.011, -0.172, 0.172, 0.18) + { origin: [-0.172, 0.18, 0.19] },
    box('top-rail', 'wood', [-0.172, 0.83, 0.176], [0.172, 0.93, 0.204]),
    box('low-rail', 'wood', [-0.172, 0.58, 0.18], [0.172, 0.62, 0.2]),
  ] + [
    disc('spindle-%d' % i, 'wood', 0.011, 0.62, 0.83, x, 0.19)
    for i in [0, 1, 2]
    for x in [[-0.08, 0, 0.08][i]]
  ], { wood: 'wood-oak', seat: 'wood-oak' })
  + { voxelGrain: 0.006 },

  // A log stool, 300 mm across and 420 mm tall: a short round of trunk in rough bark, its top sawn flat and
  // smoothed, showing pale wood and a darker heart.
  h.compound('stool_log', 19, [
    turned('bark', 'bark', 'y', [[0, 0], [0, 0.155], [0.05, 0.15], [0.15, 0.153], [0.26, 0.148], [0.36, 0.152], [0.414, 0.15], [0.414, 0]]),
    disc('face', 'face', 0.138, 0.414, 0.42),
    disc('heart', 'heart', 0.04, 0.42, 0.421),
    ring('growth', 'heart', 0.085, 0.09, 0.42, 0.001),
  ], { bark: 'wood-walnut', face: 'wood-pine', heart: 'wood-oak' })
  + { voxelGrain: 0.006 },

  // A small four-legged wooden stool, 320 mm square and 450 mm tall: a square seat over a shallow apron, on
  // four square legs joined by round stretchers.
  h.compound('stool_wood', 2.3, legs('wood', 0.13, 0.13, 0.03, 0.43) + [
    box('seat', 'seat', [-0.16, 0.43, -0.16], [0.16, 0.45, 0.16]),
  ] + [
    box('apron-%s' % a.id, 'wood', a.min, a.max)
    for a in [
      { id: 'front', min: [-0.115, 0.37, -0.14], max: [0.115, 0.43, -0.125] },
      { id: 'back', min: [-0.115, 0.37, 0.125], max: [0.115, 0.43, 0.14] },
      { id: 'left', min: [-0.14, 0.37, -0.115], max: [-0.125, 0.43, 0.115] },
      { id: 'right', min: [0.125, 0.37, -0.115], max: [0.14, 0.43, 0.115] },
    ]
  ] + [
    railZ('stretcher-left', 'wood', 0.009, -0.13, 0.14, -0.115, 0.115),
    railZ('stretcher-right', 'wood', 0.009, 0.13, 0.14, -0.115, 0.115),
    h.rod('stretcher-front', 'wood', 0.009, -0.115, 0.115, 0.18) + { origin: [-0.115, 0.18, -0.13] },
    h.rod('stretcher-back', 'wood', 0.009, -0.115, 0.115, 0.18) + { origin: [-0.115, 0.18, 0.13] },
  ], { wood: 'wood-pine', seat: 'wood-pine' })
  + { voxelGrain: 0.006 },

  // An aluminium foot locker, 690 mm long, 360 mm deep and 300 mm tall: a ribbed aluminium box under a lid, with
  // steel corner caps, a folding handle at each end, two catches and a small locking hasp at the front.
  h.compound('foot_locker_aluminum', 7, [
    box('body', 'shell', [-0.34, 0.005, -0.175], [0.34, 0.235, 0.175]),
    box('runner-a', 'trim', [-0.32, 0, -0.15], [0.32, 0.005, -0.12]),
    box('runner-b', 'trim', [-0.32, 0, 0.12], [0.32, 0.005, 0.15]),
    box('seam', 'trim', [-0.343, 0.225, -0.178], [0.343, 0.24, 0.178]),
    box('lid', 'shell', [-0.343, 0.24, -0.178], [0.343, 0.3, 0.178]),
    box('rib-a', 'shell', [-0.3, 0.07, -0.18], [0.3, 0.085, 0.18]),
    box('rib-b', 'shell', [-0.3, 0.15, -0.18], [0.3, 0.165, 0.18]),
    box('lid-rib', 'shell', [-0.3, 0.3, -0.14], [0.3, 0.305, 0.14]),
  ] + [
    box('corner-%s-%s' % [cx.id, cy.id], 'trim', [cx.x - 0.025, cy.y0, -0.181], [cx.x + 0.025, cy.y1, 0.181])
    for cx in [{ id: 'l', x: -0.322 }, { id: 'r', x: 0.322 }]
    for cy in [{ id: 'low', y0: 0, y1: 0.04 }, { id: 'high', y0: 0.265, y1: 0.304 }]
  ] + std.flattenArrays([
    [
      box('handle-plate-%s' % s.id, 'trim', [s.x0, 0.17, -0.06], [s.x0 + 0.012, 0.21, 0.06]),
      box('handle-%s' % s.id, 'handle', [s.x1, 0.15, -0.055], [s.x1 + 0.012, 0.165, 0.055]),
    ]
    for s in [{ id: 'left', x0: -0.352, x1: -0.364 }, { id: 'right', x0: 0.34, x1: 0.352 }]
  ]) + [
    box('catch-%s' % c.id, 'trim', [c.x - 0.025, 0.2, -0.186], [c.x + 0.025, 0.26, -0.178])
    for c in [{ id: 'left', x: -0.2 }, { id: 'right', x: 0.2 }]
  ] + [
    box('hasp', 'trim', [-0.02, 0.2, -0.186], [0.02, 0.27, -0.178]),
    box('lock', 'lock', [-0.015, 0.19, -0.2], [0.015, 0.225, -0.186]),
  ], { shell: 'alu-bare', trim: 'steel', handle: 'plastic-black', lock: 'brass' })
  + { voxelGrain: 0.006 },
]
