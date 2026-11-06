local h = import '../compound.libsonnet';
local box = h.box;
// A box from two opposite corners given in any order, for pieces mirrored across x.
local sbox(id, slot, a, b) = box(id, slot, [std.min(a[k], b[k]) for k in [0, 1, 2]], [std.max(a[k], b[k]) for k in [0, 1, 2]]);

// Helmet attachments: mail curtains, face masks, nape guards, a night-vision monocular, gas-mask lens outserts and
// jaw guards that clip, strap or lace onto a helmet or mask, each standing or lying as it is found loose, front on +z.

// A band curved round [0, cz] at radius r, thick t, from angle a0 to a1 (0 points to +z), in segments whose bottom
// and top heights `y0(ang)` and `y1(ang)` follow the angle at each segment's middle: masks, lenses, jaw guards.
local wrapBand(prefix, slot, r, t, a0, a1, steps, cz, y0, y1) = std.flattenArrays([
  local ang = a0 + (a1 - a0) * (i + 0.5) / steps;
  h.crescent('%s-%d' % [prefix, i], slot, r - t, r, a0 + (a1 - a0) * i / steps, a0 + (a1 - a0) * (i + 1) / steps, 1, y0(ang), y1(ang), 0, cz)
  for i in std.range(0, steps - 1)
]);
local sq(v) = v * v;
// The [x, z] point at angle `ang` degrees on a circle of radius r round [0, cz].
local onArc(r, ang, cz) = [r * std.sin(ang * std.pi / 180), cz + r * std.cos(ang * std.pi / 180)];

// A mail curtain laid out flat as it is found off the helmet: a broad crescent of rings round the head opening,
// open at the back where it ties, with rows of raised rings running round it and a leather band along the inner
// edge pierced with lacing holes. Slots: mail, band, hole.
local mailCurtain(id, mass, r0, r1, rows, mail) =
  local a0 = -150, a1 = 150, cz = -0.02;
  h.compound(id, mass, h.crescent('mail', 'mail', r0, r1, a0, a1, 30, 0, 0.004, 0, cz)
                       + std.flattenArrays([
                         h.crescent('row-%d' % i, 'mail', rr - 0.003, rr + 0.003, a0 + 2, a1 - 2, 30, 0.004, 0.007, 0, cz)
                         for i in std.range(0, rows - 1)
                         for rr in [r0 + 0.035 + (r1 - r0 - 0.045) * i / std.max(1, rows - 1)]
                       ])
                       + h.crescent('band', 'band', r0 - 0.006, r0 + 0.022, a0 - 4, a1 + 4, 30, 0, 0.008, 0, cz)
                       + [
                         local p = onArc(r0 + 0.008, a, cz);
                         h.disc('hole-%d' % i, 'hole', 0.004, 0.008, 0.0095, p[0], p[1])
                         for i in std.range(0, 12)
                         for a in [a0 + 4 + (a1 - a0 - 8) * i / 12]
                       ]
                       + [
                         // The tie thongs at the open back.
                         local p = onArc(r0 + 0.008, s * 152, cz);
                         sbox('tie-%d' % (s + 1), 'band', [p[0] - 0.003, 0, p[1]], [p[0] + 0.003, 0.009, p[1] - 0.09])
                         for s in [-1, 1]
                       ],
             { mail: mail, band: 'leather-brown', hole: 'steel-bright' })
  + { voxelGrain: 0.004 };

// A steel half mask for the lower face standing on its chin edge: a plate curving round the jaw, rising to a nose
// ridge at the front, with breathing slots across the mouth and hinged hooks at both upper corners for the helmet.
// `rivets` adds a row of domed rivets along the brow and jaw and a raised cheek band each side, the little
// ornament a better smith gives it. Slots: plate, ridge, vent, hook, and trim with `rivets`.
local faceMask(id, mass, rivets, fin) =
  local r = 0.095, cz = -r, span = 80, t = 0.004;
  local top(a) = 0.1 + 0.035 * std.max(0, 1 - std.abs(a) / 18) - 0.02 * sq(a / span);
  local foot(a) = 0.01 * sq(a / span);
  h.compound(id, mass, wrapBand('plate', 'plate', r, t, -span, span, 24, cz, foot, top)
                       // A rolled edge along the top and the chin.
                       + wrapBand('roll-top', 'ridge', r + 0.002, t + 0.002, -span, span, 24, cz, function(a) top(a) - 0.006, top)
                       + wrapBand('roll-chin', 'ridge', r + 0.002, t + 0.002, -span, span, 24, cz, foot, function(a) foot(a) + 0.006)
                       // The nose ridge down the middle of the upper plate.
                       + wrapBand('nose', 'ridge', r + 0.006, 0.008, -6, 6, 2, cz, function(a) 0.075, top)
                       // Breathing slots across the mouth.
                       + [
                         local p = onArc(r + 0.0005, a, cz);
                         sbox('vent-%d' % i, 'vent', [p[0] - 0.003, 0.045, p[1] - 0.004], [p[0] + 0.003, 0.068, p[1] + 0.0015])
                         for i in std.range(0, 6)
                         for a in [-27 + 9 * i]
                       ]
                       // Hinged hooks at the upper corners that catch the helmet's rim.
                       + std.flattenArrays([
                         local p = onArc(r - 0.002, s * (span - 4), cz);
                         [
                           h.disc('hinge-%d' % (s + 1), 'hook', 0.007, 0.07, 0.096, p[0], p[1]),
                           sbox('hook-%d' % (s + 1), 'hook', [p[0] - 0.003, 0.09, p[1]], [p[0] + 0.003, 0.13, p[1] - 0.012]),
                           sbox('hook-tip-%d' % (s + 1), 'hook', [p[0] - 0.003, 0.12, p[1] - 0.012], [p[0] + 0.003, 0.13, p[1] - 0.026]),
                         ]
                         for s in [-1, 1]
                       ])
                       + (if rivets then
                            [
                              local p = onArc(r + 0.004, a, cz);
                              sbox('rivet-%s-%d' % [row[0], i], 'trim', [p[0] - 0.003, row[1](a) - 0.003, p[1] - 0.003], [p[0] + 0.003, row[1](a) + 0.003, p[1] + 0.003])
                              for row in [['jaw', function(a) foot(a) + 0.016], ['brow', function(a) top(a) - 0.016]]
                              for i in std.range(0, 8)
                              for a in [-66 + 16.5 * i]
                              if std.abs(a) > 10
                            ]
                            + std.flattenArrays([
                              wrapBand('cheek-%d' % (s + 1), 'trim', r + 0.004, 0.004, std.min(s * 36, s * 60), std.max(s * 36, s * 60), 4, cz, function(a) 0.05, function(a) 0.058)
                              for s in [-1, 1]
                            ])
                          else []),
             fin)
  + { voxelGrain: 0.004 };

// A nape curtain laid out flat, outside up: a crescent of cloth that hangs from the back of a helmet, its inner edge a
// hook-and-loop strip and its outer edges bound. With `mesh` the curtain is an open lattice of arcs and ribs instead
// of solid cloth. Slots: cloth, binding, strip.
local napeCurtain(id, mass, mesh, fin) =
  local cz = 0.18, r0 = 0.13, r1 = 0.25, a0 = 128, a1 = 232;
  h.compound(id, mass, (if mesh then
                          std.flattenArrays([
                            h.crescent('arc-%d' % i, 'cloth', rr - 0.002, rr + 0.002, a0, a1, 12, 0, 0.003, 0, cz)
                            for i in std.range(0, 9)
                            for rr in [r0 + 0.02 + 0.01 * i]
                          ])
                          + std.flattenArrays([
                            local a = a0 + 2 + (a1 - a0 - 4) * i / 16;
                            h.crescent('rib-%d' % i, 'cloth', r0 + 0.01, r1 - 0.01, a - 0.6, a + 0.6, 1, 0, 0.003, 0, cz)
                            for i in std.range(0, 16)
                          ])
                        else
                          h.crescent('curtain', 'cloth', r0, r1, a0, a1, 12, 0, 0.004, 0, cz)
                          + [
                            // Two stitched seams running down the curtain.
                            local p = onArc(0.19, 180, cz);
                            sbox('seam-%d' % i, 'binding', [-0.09 + 0.06 * i - 0.0015, 0.004, p[1] - 0.04], [-0.09 + 0.06 * i + 0.0015, 0.0055, p[1] + 0.04])
                            for i in std.range(1, 2)
                          ])
                       + h.crescent('hem', 'binding', r1 - 0.01, r1 + 0.005, a0, a1, 12, 0, 0.005, 0, cz)
                       + h.crescent('strip', 'strip', r0 - 0.005, r0 + 0.02, a0 + 2, a1 - 2, 12, 0, 0.006, 0, cz)
                       + std.flattenArrays([
                         local a = if s > 0 then a1 else a0;
                         h.crescent('edge-%d' % (s + 1), 'binding', r0, r1, std.min(a, a - s * 3), std.max(a, a - s * 3), 1, 0, 0.005, 0, cz)
                         for s in [-1, 1]
                       ]),
             fin)
  + { voxelGrain: if mesh then 0.002 else 0.004 };

// A lens outsert for a full-face gas mask standing on its lower edge, front on +z: a thin curved sheet shaped to the
// mask's single eyepiece, with a clip tab at each end and at the top and bottom middle. Slots: lens, clip.
local outsert(id, mass, lens) =
  local r = 0.11, cz = -r, span = 50, t = 0.003;
  local foot(a) = 0.012 * sq(a / span);
  local top(a) = 0.085 - 0.025 * sq(a / span);
  h.compound(id, mass, wrapBand('lens', 'lens', r, t, -span, span, 18, cz, foot, top)
                       + std.flattenArrays([
                         local p = onArc(r - 0.001, s * (span - 2), cz);
                         [sbox('clip-%d' % (s + 1), 'clip', [p[0] - 0.004, 0.025, p[1] - 0.008], [p[0] + 0.004, 0.06, p[1] + 0.003])]
                         for s in [-1, 1]
                       ])
                       + [
                         sbox('clip-top', 'clip', [-0.012, top(0) - 0.006, -0.008], [0.012, top(0) + 0.004, 0.002]),
                         sbox('clip-foot', 'clip', [-0.012, 0, -0.008], [0.012, 0.008, 0.002]),
                       ],
             { lens: lens, clip: 'plastic-matte-black' })
  + { voxelGrain: 0.002 };

[
  // A mild steel mail aventail laid out flat, 640 mm across: a broad curtain of dull rings that hangs from a cap
  // helmet's rim over the face, neck and shoulders, its inner edge sewn to a leather band pierced for lacing and its
  // open back tied with thongs.
  mailCurtain('lc_chainmail_aventail', 2.4, 0.1, 0.3, 8, 'steel-mail'),

  // A mild steel partial aventail laid out flat, 400 mm across: a narrower ring of the same mail on a laced leather
  // band, reaching only the face and neck.
  mailCurtain('lc_chainmail_face', 0.83, 0.1, 0.19, 4, 'steel-mail'),

  // A crude mild steel half mask for a cap helmet, 190 mm across and 135 mm tall at the nose: a plain jaw plate with
  // a nose ridge, breathing slots and hinged hooks, and no ornament.
  faceMask('lc_steel_facemask', 1.1, false, { plate: 'steel-bright', ridge: 'steel-bright', vent: 'plastic-matte-black', hook: 'steel-grey' }),

  // A medium steel half mask, the same 190 mm plate in grey steel with domed rivets along the brow and jaw and a
  // raised band across each cheek.
  faceMask('mc_steel_facemask', 1.1, true, { plate: 'steel-grey', ridge: 'steel-grey', vent: 'plastic-matte-black', hook: 'steel-bright', trim: 'steel-bright' }),

  // A mesh nape guard laid out flat, 330 mm across and 120 mm deep: an open cotton lattice that hangs from the back
  // of a hard hat, bound at its edges, with a hook-and-loop strip along the top edge.
  napeCurtain('mesh_nape_protector', 0.02, true, { cloth: 'cloth-cream', binding: 'cloth-khaki', strip: 'hook-loop-grey' }),

  // A cotton nape guard laid out flat, 330 mm across and 120 mm deep: a khaki curtain that hangs from the back of a
  // hard hat, bound in brown, with a hook-and-loop strip along the top edge.
  napeCurtain('nape_protector', 0.04, false, { cloth: 'cloth-khaki', binding: 'cloth-brown', strip: 'hook-loop-grey' }),

  // A single-tube night-vision monocular switched on, 60 mm wide, 75 mm tall and 200 mm long with its mount: a
  // dark tube with a wide objective at the front, a rubber eyecup at the back glowing green, a lit green lamp on top, a battery tube along
  // the right side and a J-arm over the top ending in the dovetail shoe that locks into a helmet mount.
  h.compound('military_nvg_on', 0.42, [
    h.turned('tube', 'housing', 'z', [[0, 0], [0, 0.021], [0.1, 0.021], [0.1, 0]], [0, 0.026, -0.06]),
    h.turned('objective', 'housing', 'z', [[0, 0], [0, 0.023], [0.01, 0.025], [0.045, 0.025], [0.045, 0]], [0, 0.026, 0.03]),
    h.turned('focus-ring', 'knob', 'z', [[0, 0], [0, 0.027], [0.012, 0.027], [0.012, 0]], [0, 0.026, 0.05]),
    h.turned('glass', 'objective', 'z', [[0, 0], [0, 0.021], [0.002, 0.021], [0.002, 0]], [0, 0.026, 0.075]),
    h.turned('eyepiece', 'housing', 'z', [[0, 0], [0, 0.019], [0.025, 0.019], [0.025, 0]], [0, 0.026, -0.085]),
    h.turned('eyecup', 'eyecup', 'z', [[0, 0.012], [0, 0.021], [0.015, 0.021], [0.015, 0.012], [0, 0.012]], [0, 0.026, -0.1]),
    h.turned('display', 'display', 'z', [[0, 0], [0, 0.012], [0.002, 0.012], [0.002, 0]], [0, 0.026, -0.091]),
    // The battery tube along the right side and its cap.
    h.turned('battery', 'housing', 'z', [[0, 0], [0, 0.011], [0.07, 0.011], [0.07, 0]], [0.026, 0.02, -0.04]),
    h.turned('battery-cap', 'knob', 'z', [[0, 0], [0, 0.012], [0.012, 0.012], [0.012, 0]], [0.026, 0.02, 0.03]),
    h.disc('lamp', 'display', 0.005, 0.044, 0.052, 0.012, 0.018),
    h.turned('switch', 'knob', 'y', [[0, 0], [0, 0.007], [0.008, 0.007], [0.008, 0]], [-0.012, 0.045, -0.03]),
    // The J-arm rising from the top and running back to the dovetail shoe.
    sbox('arm-post', 'mount', [-0.009, 0.044, -0.01], [0.009, 0.066, 0.012]),
    sbox('arm', 'mount', [-0.009, 0.058, -0.075], [0.009, 0.068, 0.012]),
    h.turned('arm-pivot', 'mount', 'x', [[0, 0], [0, 0.007], [0.024, 0.007], [0.024, 0]], [-0.012, 0.062, 0.002]),
    h.prism('shoe', 'mount', 'z', [[-0.015, 0.068], [0.015, 0.068], [0.02, 0.084], [-0.02, 0.084]], -0.09, -0.06),
  ], { housing: 'plastic-charcoal', objective: 'screen-black', eyecup: 'vinyl-black', display: 'lcd-green', knob: 'plastic-matte-black', mount: 'steel-parkerized' })
  + { voxelGrain: 0.004 },

  // A clear lens outsert, 175 mm round the curve and 85 mm tall: a thin flexible shield shaped to a gas mask's single
  // eyepiece, with black clip tabs at its ends, top and foot.
  outsert('outsert_clear', 0.054, 'plastic-clear'),

  // A breaching outsert, the same 175 mm shield in green shade plastic, for cutting-torch work.
  outsert('outsert_breach', 0.054, 'glass-lens-green'),

  // A sunlight outsert, the same 175 mm shield tinted smoke grey against glare and flashes.
  outsert('outsert_sunlight', 0.054, 'lens-smoke'),

  // A plastic chin cup standing on its edge, 70 mm across the cup, 40 mm tall and 25 mm deep: a shallow moulded cup with a
  // strap slot at each end and a short stub of chin strap through each slot.
  local r = 0.035, cz = -r, span = 72;
  h.compound('plastic_chin_guard', 0.02, wrapBand('cup', 'cup', r, 0.003, -span, span, 14, cz, function(a) 0.006 * sq(a / span), function(a) 0.04 - 0.006 * sq(a / span))
                                          + std.flattenArrays([
                                            local p = onArc(r, s * (span + 4), cz);
                                            [
                                              sbox('slot-bar-%d' % (s + 1), 'cup', [p[0] - s * 0.003, 0.008, p[1] + 0.002], [p[0] + s * 0.004, 0.032, p[1] - 0.006]),
                                              sbox('strap-%d' % (s + 1), 'strap', [p[0], 0.012, p[1] - 0.004], [p[0] + s * 0.02, 0.028, p[1] - 0.006]),
                                            ]
                                            for s in [-1, 1]
                                          ]),
             { cup: 'plastic-charcoal', strap: 'webbing-black' })
  + { voxelGrain: 0.002 },

  // A costume jaw guard standing on its lower edge, 230 mm across and 90 mm tall: a grey moulded shell curving
  // round the lower face like a skull's jaw, a row of sculpted teeth along its upper edge, and a strap with a
  // buckle at each end to tie it to a helmet.
  local r = 0.1, cz = -r, span = 80;
  local top(a) = 0.07 - 0.03 * sq(a / span);
  h.compound('plastic_mandible_guard', 0.15, wrapBand('shell', 'shell', r, 0.005, -span, span, 22, cz, function(a) 0, top)
                                             + wrapBand('lip', 'shell', r + 0.003, 0.008, -span, span, 22, cz, function(a) 0, function(a) 0.01)
                                             + [
                                               local p = onArc(r + 0.002, a, cz);
                                               sbox('tooth-%d' % i, 'teeth', [p[0] - 0.006, top(a) - 0.002, p[1] - 0.006], [p[0] + 0.006, top(a) + 0.018, p[1] + 0.002])
                                               for i in std.range(0, 8)
                                               for a in [-44 + 11 * i]
                                             ]
                                             + std.flattenArrays([
                                               local p = onArc(r - 0.002, s * (span - 2), cz);
                                               [
                                                 sbox('strap-%d' % (s + 1), 'strap', [p[0] - 0.002, 0.02, p[1]], [p[0] + 0.002, 0.045, p[1] - 0.09]),
                                                 sbox('buckle-%d' % (s + 1), 'buckle', [p[0] - 0.004, 0.016, p[1] - 0.06], [p[0] + 0.004, 0.049, p[1] - 0.068]),
                                               ]
                                               for s in [-1, 1]
                                             ]),
             { shell: 'plastic-charcoal', teeth: 'bone', strap: 'webbing-black', buckle: 'plastic-matte-black' })
  + { voxelGrain: 0.004 },
]
