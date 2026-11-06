local h = import '../compound.libsonnet';
local box = h.box;
// A box from two opposite corners given in any order, for pieces mirrored across x.
local sbox(id, slot, a, b) = box(id, slot, [std.min(a[k], b[k]) for k in [0, 1, 2]], [std.max(a[k], b[k]) for k in [0, 1, 2]]);

// Helmet attachments: ear muffs, visors, jaw guards, mail curtains, face masks and pouches that clip or lace onto a
// helmet, each standing or lying as it is found loose, front on +z.

// A band curved round [0, cz] at radius r, thick t, from angle a0 to a1 (0 points to +z), in segments whose bottom
// and top heights `y0(ang)` and `y1(ang)` follow the angle at each segment's middle: visors, jaw guards, masks.
local wrapBand(prefix, slot, r, t, a0, a1, steps, cz, y0, y1) = std.flattenArrays([
  local ang = a0 + (a1 - a0) * (i + 0.5) / steps;
  h.crescent('%s-%d' % [prefix, i], slot, r - t, r, a0 + (a1 - a0) * i / steps, a0 + (a1 - a0) * (i + 1) / steps, 1, y0(ang), y1(ang), 0, cz)
  for i in std.range(0, steps - 1)
]);
local sq(v) = v * v;
// The [x, z] point at angle `ang` degrees on a circle of radius r round [0, cz].
local onArc(r, ang, cz) = [r * std.sin(ang * std.pi / 180), cz + r * std.cos(ang * std.pi / 180)];

// A helmet slot clip: a flat blade pointing back along -z from [x, y, z], with a grip tab. Slot: clip.
local clip(id, x, y, z, s) = [
  sbox(id + '-blade', 'clip', [x - s * 0.004, y - 0.012, z], [x + s * 0.004, y + 0.012, z - 0.045]),
  sbox(id + '-tab', 'clip', [x - s * 0.004, y - 0.018, z - 0.005], [x + s * 0.012, y + 0.018, z + 0.006]),
];

// A face shield standing on its lower edge: a visor arcing round the face, a brow bracket along its top and an arm
// at each end reaching back to a helmet clip. `frame` adds a moulded rim down both sides and along the bottom, as a
// thick blast visor has. Slots: visor, bracket, clip, and rim with `frame`.
local faceShield(id, mass, r, span, ht, t, frame, fin) =
  local cz = -r;
  h.compound(id, mass, wrapBand('visor', 'visor', r, t, -span, span, 14, cz, function(a) 0, function(a) ht - 0.01 * sq(a / span))
                       + wrapBand('brow', 'bracket', r + 0.004, 0.014, -span - 2, span + 2, 14, cz, function(a) ht - 0.012 - 0.01 * sq(a / span), function(a) ht + 0.022 - 0.01 * sq(a / span))
                       + std.flattenArrays([
                         local p = onArc(r + 0.004, s * (span + 2), cz);
                         [
                           sbox('arm-%d' % (s + 1), 'bracket', [p[0] - s * 0.012, ht - 0.02, p[1] + 0.01], [p[0] + s * 0.002, ht + 0.012, p[1] - 0.05]),
                           h.disc('pivot-%d' % (s + 1), 'clip', 0.012, ht - 0.016, ht + 0.016, p[0] - s * 0.005, p[1] - 0.025),
                         ] + clip('clip-%d' % (s + 1), p[0] - s * 0.005, ht - 0.004, p[1] - 0.05, s)
                         for s in [-1, 1]
                       ])
                       + (if frame then
                            wrapBand('rim-foot', 'rim', r + 0.003, t + 0.006, -span, span, 14, cz, function(a) 0, function(a) 0.018)
                            + std.flattenArrays([
                              wrapBand('rim-side-%d' % (s + 1), 'rim', r + 0.003, t + 0.006, s * span - (if s > 0 then 8 else 0), s * span + (if s < 0 then 8 else 0), 2, cz, function(a) 0, function(a) ht - 0.012 - 0.01)
                              for s in [-1, 1]
                            ])
                          else []),
             fin)
  + { voxelGrain: 0.004 };

// A mail curtain laid out flat as it is found off the helmet: a broad crescent of rings round the head opening,
// open at the back where it ties, with rows of raised rings running round it and a leather band along the inner
// edge pierced with lacing holes. Slots: mail, band, hole.
local mailCurtain(id, mass, r0, r1, rows) =
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
                         sbox('tie-%d' % (s + 1), 'band', [onArc(r0 + 0.008, s * 152, cz)[0] - 0.003, 0, onArc(r0 + 0.008, s * 152, cz)[1]], [onArc(r0 + 0.008, s * 152, cz)[0] + 0.003, 0.009, onArc(r0 + 0.008, s * 152, cz)[1] - 0.09])
                         for s in [-1, 1]
                       ],
             { mail: 'steel-mail-dark', band: 'leather-brown', hole: 'steel-bright' })
  + { voxelGrain: 0.004 };

// A steel half mask for the lower face standing on its chin edge: a plate curving round the jaw, rising to a nose
// ridge at the front, with breathing slots across the mouth, hinged hooks at both upper corners for the helmet, and
// `trim` on its face: gold inlay bands or a raised moustache. Slots: plate, ridge, vent, hook, trim.
local faceMask(id, mass, trim, fin) =
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
                       + (if trim == 'inlay' then
                            // Gold bands inlaid along the jaw and a scroll each side of the vents.
                            wrapBand('inlay-jaw', 'trim', r + 0.0015, 0.002, -span + 6, span - 6, 22, cz, function(a) foot(a) + 0.014, function(a) foot(a) + 0.02)
                            + wrapBand('inlay-brow', 'trim', r + 0.0015, 0.002, -span + 6, span - 6, 22, cz, function(a) top(a) - 0.02, function(a) top(a) - 0.014)
                            + std.flattenArrays([
                              wrapBand('inlay-scroll-%d' % (s + 1), 'trim', r + 0.0015, 0.002, std.min(s * 38, s * 58), std.max(s * 38, s * 58), 4, cz, function(a) 0.04 + 0.012 * std.sin((std.abs(a) - 38) / 20 * std.pi), function(a) 0.05 + 0.012 * std.sin((std.abs(a) - 38) / 20 * std.pi))
                              for s in [-1, 1]
                            ])
                          else
                            // A raised moustache curling up at both ends, over the vents.
                            std.flattenArrays([
                              wrapBand('tache-%d' % (s + 1), 'trim', r + 0.007, 0.007, std.min(s * 2, s * 34), std.max(s * 2, s * 34), 8, cz, function(a) 0.07 + 0.00004 * sq(std.abs(a) - 12), function(a) 0.08 + 0.00004 * sq(std.abs(a) - 12))
                              for s in [-1, 1]
                            ])),
             fin)
  + { voxelGrain: 0.004 };

// A two-lens frame standing upright, front on +z, as a vision insert for a mask: lenses in a thin rim, a bridge and
// a sprung mounting post rising from the bridge. Slots: frame, lens, post.
local sgnPow(v, e) = (if v < 0 then -1 else 1) * std.pow(std.abs(v), e);
local oval(a, b, p, n, cx, cy) = [
  local th = 2 * std.pi * i / n;
  [cx + a * sgnPow(std.cos(th), 2 / p), cy + b * sgnPow(std.sin(th), 2 / p)]
  for i in std.range(0, n - 1)
];

[
  // Helmet ear muffs as they come off the hard hat: two padded cups 80 mm across on sprung steel arms, swung
  // down into the working position, each arm ending in a flat clip that slides into the helmet's side slot.
  h.compound('attachable_ear_muffs_on', 0.2, std.flattenArrays([
    [
      h.turned('cup-%d' % (s + 1), 'cup', 'y', [[0, 0], [0, 0.038], [0.018, 0.038], [0.03, 0.03], [0.036, 0.018], [0.038, 0]], [s * 0.05, 0.012, 0]),
      h.turned('cushion-%d' % (s + 1), 'cushion', 'y', [[0, 0], [0, 0.041], [0.006, 0.043], [0.012, 0.041], [0.012, 0]], [s * 0.05, 0, 0]),
      // The sprung arm from the cup's crown back to the clip, with a pivot where it meets the cup.
      h.disc('boss-%d' % (s + 1), 'arm', 0.009, 0.048, 0.056, s * 0.05, 0),
      sbox('arm-%d' % (s + 1), 'arm', [s * 0.05 - 0.0025, 0.05, 0], [s * 0.05 + 0.0025, 0.055, -0.1]),
      sbox('arm-rise-%d' % (s + 1), 'arm', [s * 0.05 - 0.0025, 0.05, -0.096], [s * 0.05 + 0.0025, 0.07, -0.1]),
    ] + [
      sbox('clip-%d-blade' % (s + 1), 'clip', [s * 0.05 - 0.012, 0.064, -0.098], [s * 0.05 + 0.012, 0.072, -0.145]),
      sbox('clip-%d-tab' % (s + 1), 'clip', [s * 0.05 - 0.016, 0.06, -0.094], [s * 0.05 + 0.016, 0.076, -0.104]),
    ]
    for s in [-1, 1]
  ]), { cup: 'plastic-orange', cushion: 'vinyl-black', arm: 'steel-bright', clip: 'plastic-matte-black' })
  + { voxelGrain: 0.004 },

  // A ballistic jaw guard standing on its lower edge, 230 mm across and 70 mm deep at the chin: a moulded tan
  // shell curving round the lower face from ear to ear, with vent slots over the mouth and a rail adapter at each
  // end where it locks onto the helmet's side rails.
  local r = 0.1, cz = -r, span = 85;
  local top(a) = 0.07 - 0.03 * sq(a / span);
  h.compound('ballistic_mandible_guard', 0.35, wrapBand('shell', 'shell', r, 0.005, -span, span, 22, cz, function(a) 0, top)
                                                + wrapBand('lip', 'shell', r + 0.003, 0.008, -span, span, 22, cz, function(a) 0, function(a) 0.008)
                                                + [
                                                  local p = onArc(r + 0.0005, a, cz);
                                                  sbox('vent-%d' % i, 'vent', [p[0] - 0.0025, 0.022, p[1] - 0.004], [p[0] + 0.0025, 0.052, p[1] + 0.0015])
                                                  for i in std.range(0, 4)
                                                  for a in [-16 + 8 * i]
                                                ]
                                                + std.flattenArrays([
                                                  local p = onArc(r, s * (span - 3), cz);
                                                  [
                                                    sbox('adapter-%d' % (s + 1), 'adapter', [p[0] - s * 0.012, 0.004, p[1] + 0.012], [p[0] + s * 0.006, 0.05, p[1] - 0.03]),
                                                    sbox('latch-%d' % (s + 1), 'adapter', [p[0] + s * 0.006, 0.018, p[1] + 0.002], [p[0] + s * 0.012, 0.036, p[1] - 0.018]),
                                                  ]
                                                  for s in [-1, 1]
                                                ]),
             { shell: 'polymer-fde', vent: 'plastic-matte-black', adapter: 'plastic-matte-black' })
  + { voxelGrain: 0.004 },

  // A hardened steel mail aventail laid out flat, 640 mm across: a broad curtain of dark rings that hangs from a
  // helmet's rim over the face, neck and shoulders, its inner edge sewn to a leather band pierced for lacing and
  // its open back tied with thongs.
  mailCurtain('ch_chainmail_aventail', 2.4, 0.1, 0.3, 8),

  // A hardened steel partial aventail laid out flat, 400 mm across: a narrower ring of mail on the same laced
  // leather band, reaching only the face and neck.
  mailCurtain('ch_chainmail_face', 0.83, 0.1, 0.19, 4),

  // A hardened steel half mask for a cap helmet, 190 mm across and 135 mm tall at the nose: a dark grey jaw plate
  // with a nose ridge, breathing slots, hinged hooks at the top corners and gold bands inlaid along its edges.
  faceMask('ch_steel_facemask', 1.2, 'inlay', { plate: 'steel-hardened', ridge: 'steel-hardened', vent: 'plastic-matte-black', hook: 'steel-grey', trim: 'metal-gold' }),

  // A helmet counterweight pouch, 100 mm wide, 70 mm tall and 30 mm deep: a small black nylon pouch with a flap,
  // a hook-and-loop panel on the back that presses onto the rear of a helmet, and a press stud.
  h.compound('counterweight_pouch', 0.05, h.pouch(0.1, 0.07, 0.03, 0.035, 2)
                                          + [
                                            h.stud('stud', 'stud', 0, 0.052, 0.018),
                                            sbox('loop-panel', 'panel', [-0.045, 0.008, -0.015], [0.045, 0.065, -0.019]),
                                          ], { body: 'nylon-black', flap: 'cloth-charcoal', strap: 'hook-loop-grey', stud: 'steel-bright', panel: 'hook-loop-grey' })
  + { voxelGrain: 0.002 },

  // A thermal night-vision binocular switched on, 130 mm wide, 75 mm tall and 110 mm long: a dark housing with
  // two dark objectives at the front, eyepieces glowing green at the back, a battery cap on the side and a swing
  // arm over the top ending in the dovetail shoe that locks into a helmet mount.
  h.compound('enhanced_nvg_on', 0.91, [
    sbox('housing', 'housing', [-0.05, 0.012, -0.035], [0.05, 0.062, 0.035]),
    sbox('bridge-top', 'housing', [-0.02, 0.062, -0.03], [0.02, 0.072, 0.03]),
  ] + std.flattenArrays([
    [
      h.turned('objective-%d' % (s + 1), 'housing', 'z', [[0, 0], [0, 0.026], [0.035, 0.026], [0.04, 0.029], [0.04, 0]], [s * 0.038, 0.037, 0.03]),
      h.turned('glass-%d' % (s + 1), 'objective', 'z', [[0, 0], [0, 0.022], [0.002, 0.022], [0.002, 0]], [s * 0.038, 0.037, 0.07]),
      h.turned('eyepiece-%d' % (s + 1), 'housing', 'z', [[0, 0], [0, 0.02], [0.028, 0.02], [0.03, 0]], [s * 0.032, 0.037, -0.035], ),
      h.turned('eyecup-%d' % (s + 1), 'eyecup', 'z', [[0, 0.013], [0, 0.021], [0.012, 0.021], [0.012, 0.013], [0, 0.013]], [s * 0.032, 0.037, -0.047]),
      h.turned('display-%d' % (s + 1), 'display', 'z', [[0, 0], [0, 0.013], [0.002, 0.013], [0.002, 0]], [s * 0.032, 0.037, -0.04]),
    ]
    for s in [-1, 1]
  ]) + [
    h.turned('battery-cap', 'knob', 'x', [[0, 0], [0, 0.014], [0.018, 0.014], [0.018, 0]], [0.05, 0.037, -0.005]),
    h.turned('focus-knob', 'knob', 'y', [[0, 0], [0, 0.009], [0.008, 0.009], [0.008, 0]], [0, 0.072, 0.018]),
    h.disc('lamp', 'display', 0.003, 0.06, 0.064, 0.04, 0.03),
    // The swing arm rising from the top and running back to the dovetail shoe.
    sbox('arm-post', 'mount', [-0.01, 0.072, -0.02], [0.01, 0.1, 0]),
    sbox('arm', 'mount', [-0.01, 0.092, -0.06], [0.01, 0.104, 0]),
    h.turned('arm-pivot', 'mount', 'x', [[0, 0], [0, 0.008], [0.026, 0.008], [0.026, 0]], [-0.013, 0.098, -0.012]),
    h.prism('shoe', 'mount', 'z', [[-0.016, 0.104], [0.016, 0.104], [0.022, 0.124], [-0.022, 0.124]], -0.075, -0.05),
  ], { housing: 'plastic-charcoal', objective: 'screen-black', eyecup: 'vinyl-black', display: 'lcd-green', knob: 'plastic-matte-black', mount: 'steel-parkerized' })
  + { voxelGrain: 0.004 },

  // A clear thermoplastic face shield standing on its lower edge, 400 mm round the curve and 210 mm tall, on a
  // black brow bracket whose arms reach back to the slot clips at each side of a hard hat.
  faceShield('face_shield', 0.2, 0.15, 75, 0.21, 0.004, false, { visor: 'plastic-clear', bracket: 'plastic-matte-black', clip: 'plastic-matte-black' }),

  // A bomb-disposal blast visor standing on its lower edge, 330 mm round the curve and 200 mm tall: a thick clear
  // shield in a moulded black rim, on a heavy brow bracket with arms to the helmet's rail clips.
  faceShield('face_shield_eod', 1.1, 0.12, 78, 0.2, 0.01, true, { visor: 'plastic-clear', bracket: 'plastic-matte-black', clip: 'steel-parkerized', rim: 'plastic-matte-black' }),

  // A high steel half mask for a cap helmet, 190 mm across and 135 mm tall at the nose: a grey jaw plate with a
  // nose ridge, breathing slots and hinged hooks, and a raised steel moustache curling up across its face.
  faceMask('hc_steel_facemask', 1.2, 'tache', { plate: 'steel-blued', ridge: 'steel-blued', vent: 'plastic-matte-black', hook: 'steel-grey', trim: 'steel-bright' }),

  // A vision-correcting lens frame for a full-face gas mask, 100 mm across and 40 mm tall: two prescription lenses
  // in a thin black rim joined at the bridge, with a sprung post that clips behind the mask's visor.
  h.compound('insert_vision_correction', 0.015, std.flattenArrays([
    local inner = oval(0.019, 0.014, 2.6, 24, s * 0.026, 0.018);
    local outer = oval(0.022, 0.017, 2.6, 24, s * 0.026, 0.018);
    [h.prism('lens-%d' % (s + 1), 'lens', 'z', inner, 0.001, 0.003)]
    + [
      h.prism('rim-%d-%d' % [s + 1, i], 'frame', 'z', [outer[i], outer[(i + 1) % 24], inner[(i + 1) % 24], inner[i]], 0, 0.004)
      for i in std.range(0, 23)
    ]
    for s in [-1, 1]
  ]) + [
    sbox('bridge', 'frame', [-0.006, 0.022, 0], [0.006, 0.028, 0.004]),
    sbox('post', 'post', [-0.0025, 0.026, -0.002], [0.0025, 0.046, 0.002]),
    sbox('post-spring', 'post', [-0.006, 0.042, -0.012], [0.006, 0.046, 0.002]),
  ], { frame: 'plastic-matte-black', lens: 'plastic-clear', post: 'steel-bright' })
  + { voxelGrain: 0.002 },

  // An aramid-lined nape guard laid out flat, 330 mm across and 120 mm deep: a curved curtain of khaki cotton
  // that hangs from the back of a helmet over the neck, bound at its edges with gold aramid tape and a hook-and-loop
  // strip along the top edge.
  local cz = 0.18;
  h.compound('kevlar_nape_protector', 0.041, h.crescent('curtain', 'cloth', 0.13, 0.25, 128, 232, 12, 0, 0.004, 0, cz)
                                            + h.crescent('hem', 'binding', 0.24, 0.255, 128, 232, 12, 0, 0.006, 0, cz)
                                            + h.crescent('strip', 'strip', 0.125, 0.15, 130, 230, 12, 0, 0.007, 0, cz)
                                            + std.flattenArrays([
                                              local a = s * 128 + (if s > 0 then 0 else 360);
                                              h.crescent('edge-%d' % (s + 1), 'binding', 0.13, 0.25, std.min(a, a + s * -2), std.max(a, a + s * -2), 1, 0, 0.006, 0, cz)
                                              for s in [-1, 1]
                                            ])
                                            + [
                                              local p = onArc(0.19, 180, cz);
                                              sbox('quilt-%d' % i, 'binding', [-0.09 + 0.06 * i - 0.002, 0.004, p[1] - 0.04], [-0.09 + 0.06 * i + 0.002, 0.0055, p[1] + 0.04])
                                              for i in std.range(1, 2)
                                            ], { cloth: 'cloth-khaki', binding: 'aramid-gold', strip: 'hook-loop-grey' })
  + { voxelGrain: 0.004 },
]
