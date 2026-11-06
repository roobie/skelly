local g = import '../garments.libsonnet';
local h = import '../compound.libsonnet';
local box = h.box;

// Neoprene diving and surf wear as found on a shelf or the floor. Suits lie flat, front up, neck towards -z; tops,
// jackets and legwear are folded; hoods stand upright, face on +z; gloves lie flat as a pair. Neoprene is drawn in
// `neoprene-black`; flatlock seams show as raised stitched strips.

// A trapezoid limb lying flat from y to y + t, running from centre a to centre b ([x, z]), wa wide at a and wb at b.
local limb(id, slot, a, b, wa, wb, y, t) =
  local dx = b[0] - a[0], dz = b[1] - a[1], len = std.sqrt(dx * dx + dz * dz);
  local nx = -dz / len, nz = dx / len;
  g.flat(id, slot, [
    [a[0] + nx * wa / 2, a[1] + nz * wa / 2],
    [b[0] + nx * wb / 2, b[1] + nz * wb / 2],
    [b[0] - nx * wb / 2, b[1] - nz * wb / 2],
    [a[0] - nx * wa / 2, a[1] - nz * wa / 2],
  ], y, t);
// The point share k of the way from a to b.
local lerp(a, b, k) = [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];

// A wetsuit laid flat, front up, neck at -z, `t` thick (two layers of neoprene). Options:
//   sleeves  'long', 'short' or 'none';  legs  'long' or 'short';
//   zip      'chest' (a short zip across the chest) or 'back' (a back zip whose pull strap lies over the shoulder);
//   panels   side panels down the ribs and hips in slot panel;  knees  knee pads in slot pad.
// Slots: body, panel, seam, collar, cuff, zip, pull, pad.
local suit(o) =
  local c = { t: 0.012, sleeves: 'long', legs: 'long', zip: 'back', panels: true, knees: false } + o;
  local t = c.t, top = t;
  local sh = [0.205, -0.575];  // shoulder joint centre (+x side)
  local armDir = [0.643, 0.766];
  local armLen = if c.sleeves == 'long' then 0.6 else 0.2;
  local wrist = [sh[0] + armDir[0] * armLen, sh[1] + armDir[1] * armLen];
  local wristW = if c.sleeves == 'long' then 0.075 else 0.13;
  local legLen = if c.legs == 'long' then 0.78 else 0.24;
  local hip = [0.088, 0.0];
  local knee = [0.11, 0.4];
  local ankle = [0.125, legLen];
  local legEnd = if c.legs == 'long' then ankle else lerp(hip, knee, legLen / 0.4);
  local legEndW = if c.legs == 'long' then 0.09 else 0.155;
  local legMid = if c.legs == 'long' then knee else legEnd;
  std.flattenArrays([
    [
      g.flat('chest', 'body', [[-0.075, -0.7], [0.075, -0.7], [0.215, -0.66], [0.205, -0.46], [0.17, -0.3], [-0.17, -0.3], [-0.205, -0.46], [-0.215, -0.66]], 0, t),
      g.flat('hips', 'body', [[-0.17, -0.3], [0.17, -0.3], [0.185, -0.13], [0.176, 0.0], [-0.176, 0.0], [-0.185, -0.13]], 0, t),
      g.flat('collar', 'collar', [[-0.08, -0.715], [0.08, -0.715], [0.09, -0.69], [-0.09, -0.69]], 0, t + 0.004),
    ]
    + (if c.panels then [
         limb('panel-%d-%d' % [s + 1, i], 'panel', [s * a[0], a[1]], [s * b[0], b[1]], wa, wb, top, 0.002)
         for s in [-1, 1]
         for i in [0, 1]
         for a in [[[0.178, -0.45], [0.155, -0.3]][i]]
         for b in [[[0.155, -0.3], [0.158, -0.01]][i]]
         for wa in [[0.04, 0.04][i]]
         for wb in [[0.04, 0.045][i]]
       ] else [])
    + (if c.sleeves == 'none' then [
         g.flat('armhole-%d' % (s + 1), 'cuff', [[s * 0.212, -0.665], [s * 0.218, -0.665], [s * 0.208, -0.46], [s * 0.2, -0.46]], 0, t + 0.002)
         for s in [-1, 1]
       ] else std.flattenArrays([
         local w = [s * wrist[0], wrist[1]], a = [s * sh[0], sh[1]];
         [
           limb('arm-%d' % (s + 1), 'body', a, w, 0.18, wristW, 0, t),
           limb('cuff-%d' % (s + 1), 'cuff', lerp(a, w, 0.97), lerp(a, w, 1.0), wristW + 0.006, wristW + 0.006, 0, t + 0.002),
           limb('arm-seam-%d' % (s + 1), 'seam', lerp(a, w, 0.12), lerp(a, w, 0.95), 0.008, 0.008, top, 0.002),
         ]
         for s in [-1, 1]
       ]))
    + std.flattenArrays([
      local hp = [s * hip[0], hip[1]], km = [s * legMid[0], legMid[1]], le = [s * legEnd[0], legEnd[1]];
      [
        limb('thigh-%d' % (s + 1), 'body', hp, km, 0.176, if c.legs == 'long' then 0.12 else legEndW, 0, t),
        limb('leg-cuff-%d' % (s + 1), 'cuff', lerp(hp, le, 0.985), le, legEndW + 0.006, legEndW + 0.006, 0, t + 0.002),
        limb('leg-seam-%d' % (s + 1), 'seam', lerp(hp, le, 0.06), lerp(hp, le, 0.95), 0.008, 0.008, top, 0.002),
      ]
      + (if c.legs == 'long' then [limb('shin-%d' % (s + 1), 'body', km, le, 0.12, legEndW, 0, t)] else [])
      + (if c.knees then [limb('knee-%d' % (s + 1), 'pad', lerp(hp, le, 0.45), lerp(hp, le, 0.58), 0.115, 0.11, top, 0.004)] else [])
      for s in [-1, 1]
    ])
    // Flatlock seams across the shoulders and down the front.
    + [
      limb('yoke-seam-%d' % (s + 1), 'seam', [s * 0.08, -0.69], [s * 0.2, -0.64], 0.008, 0.008, top, 0.002)
      for s in [-1, 1]
    ]
    + [limb('crotch-seam', 'seam', [0, -0.12], [0, -0.005], 0.008, 0.008, top, 0.002)]
    + (if c.zip == 'chest' then [
         box('zip', 'zip', [-0.1, top, -0.62], [0.1, top + 0.004, -0.606]),
         box('zip-pull', 'pull', [0.085, top + 0.004, -0.616], [0.1, top + 0.008, -0.59]),
       ] else [
         // The back zip's pull strap, flipped over the shoulder and lying across the chest.
         limb('cord', 'pull', [0.04, -0.7], [-0.11, -0.38], 0.014, 0.014, top + 0.004, 0.003),
         limb('cord-tab', 'pull', [-0.105, -0.39], [-0.125, -0.347], 0.03, 0.03, top + 0.004, 0.005),
       ])
  ]);

// A suit's common finishes, body and panel colours given.
local suitFin(body, panel, seam) = { body: body, panel: panel, seam: seam, collar: panel, cuff: body, zip: 'plastic-matte-black', pull: 'plastic-matte-black', pad: 'plastic-charcoal' };

// A neoprene top folded flat on g.jacket: crew neck, no buttons, side panels in slot panel and flatlock seams.
// `sleeves` folds long sleeves flat along both sides.
local top(o) =
  local c = { w: 0.3, d: 0.32, ht: 0.03, sleeves: null, collar: { r: 0.055, wd: 0.014, ht: 0.008, gap: 0 }, front: 'none' } + o;
  g.jacket({ w: c.w, d: c.d, ht: c.ht, folds: 3, collar: c.collar, front: c.front, buttons: [], sleeves: c.sleeves, neck: 0.075 })
  + [
    local e = c.w / 2 - (if c.sleeves == null then 0 else c.sleeves.w);
    box('panel-%d' % (s + 1), 'panel', [if s < 0 then -e else e - 0.03, c.ht, -c.d / 2 + 0.01], [if s < 0 then -e + 0.03 else e, c.ht + 0.003, c.d / 2 - 0.06])
    for s in [-1, 1]
  ]
  + [
    g.strip('yoke-%d' % (s + 1), 'stitch', [s * 0.06, c.d / 2 - 0.04], [s * (c.w / 2 - 0.01), c.d / 2 - 0.08], c.ht, 0.008, 0.003)
    for s in [-1, 1]
  ];

// Neoprene legwear folded flat: a stack with its fold rolled at -z and the waistband at +z, a drawcord at the waist,
// flatlock seams down the middle. Options: `knee` patches near the fold; `cuffs` the two ankle cuffs side by side at
// the -z end in slot band, split at the middle so the legs read; `cargo` bellows pockets on both sides with flaps, a
// press stud each and a drain eyelet. Slots: cloth, band, cord, seam, pad, pocket, flap, stud.
local legwear(o) =
  local c = { w: 0.24, d: 0.36, ht: 0.04, folds: 4, band: 0.035, knee: false, cuffs: false, cargo: null } + o;
  local w = c.w, d = c.d, ht = c.ht, z1 = d / 2;
  h.foldedGarment(w, d, ht, c.folds)
  + [
    box('waistband', 'band', [-w / 2, ht - 0.002, z1 - c.band], [w / 2, ht + 0.004, z1]),
    box('cord-knot', 'cord', [-0.008, ht + 0.004, z1 - c.band * 0.7], [0.008, ht + 0.009, z1 - c.band * 0.3]),
    box('cord-end-a', 'cord', [-0.02, ht + 0.004, z1 - c.band - 0.06], [-0.015, ht + 0.007, z1 - c.band * 0.5]),
    box('cord-end-b', 'cord', [0.015, ht + 0.004, z1 - c.band - 0.045], [0.02, ht + 0.007, z1 - c.band * 0.5]),
    box('seam', 'seam', [-0.004, ht, -d / 2 + 0.015], [0.004, ht + 0.002, z1 - c.band]),
    box('side-seam', 'seam', [w / 2 - 0.02, ht, -d / 2 + 0.015], [w / 2 - 0.012, ht + 0.002, z1 - c.band]),
  ]
  + (if c.knee then [box('knee', 'pad', [-w / 2 + 0.02, ht, -d / 2 + 0.05], [-0.02, ht + 0.004, -d / 2 + 0.14])] else [])
  + (if c.cuffs then [
       g.sbox('cuff-%d' % (s + 1), 'band', [s * 0.008, 0, -d / 2 - 0.003], [s * (w / 2 + 0.002), ht + 0.004, -d / 2 + 0.03])
       for s in [-1, 1]
     ] else [])
  + (if c.cargo == null then [] else std.flattenArrays([
       local p = c.cargo, x = s * (w / 2 - p.w / 2 - 0.01);
       [
         box('cargo-%d' % (s + 1), 'pocket', [x - p.w / 2, ht, p.z - p.d / 2], [x + p.w / 2, ht + 0.014, p.z + p.d / 2]),
         box('cargo-flap-%d' % (s + 1), 'flap', [x - p.w / 2 - 0.004, ht + 0.014, p.z + p.d / 2 - 0.035], [x + p.w / 2 + 0.004, ht + 0.018, p.z + p.d / 2 + 0.004]),
         h.disc('cargo-stud-%d' % (s + 1), 'stud', 0.006, ht + 0.018, ht + 0.022, x, p.z + p.d / 2 - 0.02),
         h.disc('drain-%d' % (s + 1), 'stud', 0.004, ht + 0.014, ht + 0.016, x, p.z - p.d / 2 + 0.012),
       ]
       for s in [-1, 1]
     ]));
local legFin(band, seam) = { cloth: 'neoprene-black', band: band, cord: 'cloth-white', seam: seam, pad: 'plastic-charcoal', pocket: 'nylon-black', flap: 'nylon-black', stud: 'steel-bright' };

// Hoods stand upright, face on +z, turned about y from a [y, radius] profile (after batch 140's hood): the face
// opening is painted flush in a dark finish and bound by a trim rim, and a flatlock seam runs up the back.
local rAt(prof, y) =
  local segs = [[prof[i], prof[i + 1]] for i in std.range(0, std.length(prof) - 2) if prof[i][0] < prof[i + 1][0] && prof[i][0] <= y && y <= prof[i + 1][0]];
  if std.length(segs) == 0 then 0 else
    local a = segs[0][0], b = segs[0][1];
    a[1] + (b[1] - a[1]) * (y - a[0]) / (b[0] - a[0]);
local spread(a, b, n) = [a + (b - a) * i / (n - 1) for i in std.range(0, n - 1)];
local hood(prof, face, extras) =
  local R = rAt(prof, face.y);
  local sw = 0.012;
  local n = std.floor(2 * (face.w - sw / 2) / sw);
  local fh(x) = face.hh * std.sqrt(std.max(0.1, 1 - std.pow(std.abs(x) / face.w, 2)));
  local xin(x0) = if x0 < 0 && x0 + sw > 0 then 0 else std.min(std.abs(x0), std.abs(x0 + sw));
  local ys = spread(0.03, 0.3, 14);
  [h.turned('hood', 'cloth', 'y', prof)]
  + [
    h.prism('face-%d' % i, 'face', 'z', [[x0, face.y - fh(xo)], [x0 + sw, face.y - fh(xo)], [x0 + sw, face.y + fh(xo)], [x0, face.y + fh(xo)]], 0.02, std.sqrt(R * R - xin(x0) * xin(x0)) + 0.002)
    for i in std.range(0, n - 1)
    for x0 in [-n * sw / 2 + i * sw]
    for xo in [std.max(std.abs(x0), std.abs(x0 + sw))]
  ]
  + [
    box('rim-side-%d' % i, 'trim', [x - 0.006, face.y - fh(x) - 0.01, 0.02], [x + 0.006, face.y + fh(x) + 0.01, std.sqrt(R * R - std.pow(std.abs(x) - 0.006, 2)) + 0.006])
    for i in std.range(0, 1)
    for x in [[-n * sw / 2 - 0.006, n * sw / 2 + 0.006][i]]
  ]
  + [
    box('rim-%s-%d' % [e, i], 'trim', [x0, face.y + sgn * fh(x0 + sw / 2) - 0.007, 0.02], [x0 + sw, face.y + sgn * fh(x0 + sw / 2) + 0.007, std.sqrt(R * R - xin(x0) * xin(x0)) + 0.006])
    for e in ['top', 'bottom']
    for sgn in [if e == 'top' then 1 else -1]
    for i in std.range(0, n - 1)
    for x0 in [-n * sw / 2 + i * sw]
  ]
  + [
    box('seam-%d' % i, 'stitch', [-0.004, ys[i], -std.max(rAt(prof, ys[i]), rAt(prof, ys[i + 1])) - 0.003], [0.004, ys[i + 1] + 0.003, -std.min(rAt(prof, ys[i]), rAt(prof, ys[i + 1])) + 0.002])
    for i in std.range(0, 12)
  ]
  + extras;
// A snug hood ending in a short collar at the neck.
local snugProfile = [[0, 0], [0, 0.112], [0.035, 0.104], [0.09, 0.094], [0.2, 0.1], [0.245, 0.093], [0.28, 0.07], [0.302, 0.035], [0.308, 0]];
// A cold-water hood with a short neck flare; its bib flaps are drawn apart (see `bibFlaps`).
local bibProfile = [[0, 0], [0, 0.13], [0.025, 0.12], [0.07, 0.1], [0.1, 0.097], [0.2, 0.103], [0.245, 0.096], [0.28, 0.072], [0.302, 0.036], [0.31, 0]];
// The bib slumped on the floor in two flaps, the front one longer, so it drapes rather than flaring as a bell.
local bibFlaps = [
  h.prism('bib-front', 'cloth', 'y', [[0.1, -0.1], [0.1, 0.1], [0.19, 0.085], [0.225, 0.05], [0.235, -0.01], [0.215, -0.07], [0.18, -0.095]], 0, 0.012),
  h.prism('bib-back', 'cloth', 'y', [[-0.1, 0.095], [-0.1, -0.095], [-0.15, -0.085], [-0.175, -0.04], [-0.178, 0.03], [-0.16, 0.075]], 0, 0.012),
  h.prism('bib-front-hem', 'stitch', 'y', [[0.212, -0.06], [0.222, -0.06], [0.227, 0.04], [0.217, 0.04]], 0.012, 0.014),
];
local hoodFace = { y: 0.19, w: 0.068, hh: 0.062 };

[
  // Thick neoprene diving gloves lying flat as a pair, backs up, each about 260 mm long and 110 mm across the palm:
  // five-finger gloves 6 mm thick a side, a long flared gauntlet cuff with a bound edge, and a hook-and-loop strap
  // across each wrist.
  h.compound('wetsuit_gloves_thick', 0.35, g.glovePair({ t: 0.02, cuff: 0.075, flare: 0.056, fingerW: 0.019, binding: 'binding', knuckle: 'grip' }, 0.075, function(p, cx, s) [
    g.sbox(p + 'strap', 'strap', [cx - 0.058, 0.018, -0.05], [cx + 0.058, 0.024, -0.028]),
    g.sbox(p + 'strap-tab', 'tab', [cx + s * 0.03, 0.024, -0.05], [cx + s * 0.058, 0.027, -0.028]),
  ]), { glove: 'neoprene-black', cuff: 'neoprene-black', binding: 'canvas-grey', grip: 'plastic-charcoal', strap: 'nylon-black', tab: 'hook-loop-grey' })
  + { voxelGrain: 0.004 },

  // A 3 mm neoprene diving hood standing upright, 225 mm across and 310 mm tall: a snug hood closing round the face,
  // its opening bound in grey tape, a flatlock seam up the back and a short collar at the neck.
  h.compound('wetsuit_hood', 0.2, hood(snugProfile, hoodFace, []),
    { cloth: 'neoprene-black', face: 'screen-black', trim: 'canvas-grey', stitch: 'canvas-grey' })
  + { voxelGrain: 0.004 },

  // A 5 mm neoprene cold-water hood standing upright, 310 mm tall: a snug hood whose bib slumps on the floor in a long
  // front flap and a shorter back flap, 416 mm from front to back, a blue-bound face opening, a flatlock seam up the back and a vent valve on the crown.
  h.compound('wetsuit_hood_thick', 0.35, hood(bibProfile, hoodFace, bibFlaps + [
    h.disc('vent', 'vent', 0.012, 0.296, 0.312, 0, 0.0),
  ] + h.crescent('bib-seam', 'stitch', rAt(bibProfile, 0.06) - 0.004, rAt(bibProfile, 0.06) + 0.003, -170, 170, 16, 0.06, 0.066)), { cloth: 'neoprene-black', face: 'screen-black', trim: 'cloth-blue', stitch: 'canvas-grey', vent: 'plastic-charcoal' })
  + { voxelGrain: 0.004 },

  // A neoprene wetsuit jacket folded flat, 360 mm by 340 mm and 50 mm tall: a zip up the front to a tall stand
  // collar, long sleeves folded flat along both sides, grey flatlock seams, a grey zip and blue collar and side panels.
  h.compound('wetsuit_jacket', 1, top({ w: 0.36, d: 0.34, ht: 0.05, front: 'placket', collar: { r: 0.06, wd: 0.016, ht: 0.028, gap: 14 }, sleeves: { kind: 'flat', w: 0.075, t: 0.006 } }) + [
    box('zip-pull', 'button', [0.006, 0.055, 0.03], [0.018, 0.06, 0.06]),
  ], { cloth: 'neoprene-black', collar: 'cloth-blue', front: 'canvas-grey', button: 'steel-bright', sleeve: 'neoprene-black', panel: 'cloth-blue', stitch: 'canvas-grey' })
  + { voxelGrain: 0.004 },

  // Neoprene wetsuit pants folded flat, 240 mm by 360 mm and 40 mm tall: a grey drawcord waist, flatlock seams, a
  // rubbery knee patch and the two grey ankle cuffs side by side at the fold.
  h.compound('wetsuit_pants', 0.8, legwear({ knee: true, cuffs: true }), legFin('canvas-grey', 'canvas-grey'))
  + { voxelGrain: 0.004 },

  // Thin neoprene wetsuit pants folded flat, 220 mm by 340 mm and 24 mm tall: a blue drawcord waist, flatlock seams
  // and the two blue ankle cuffs side by side at the fold.
  h.compound('wetsuit_pants_thin', 0.48, legwear({ w: 0.22, d: 0.34, ht: 0.024, folds: 3, band: 0.03, cuffs: true }), legFin('cloth-blue', 'canvas-grey'))
  + { voxelGrain: 0.004 },

  // Neoprene wetsuit shorts folded flat, 260 mm by 220 mm and 30 mm tall: a drawcord waist and a blue side seam.
  h.compound('wetsuit_shorts', 0.43, legwear({ w: 0.26, d: 0.22, ht: 0.03, folds: 3, band: 0.035 }), legFin('neoprene-black', 'cloth-blue'))
  + { voxelGrain: 0.004 },

  // Technical neoprene shorts folded flat, 280 mm by 240 mm and 36 mm tall: a drawcord waist and a big flapped
  // bellows pocket on each thigh under a grey flap, each with a press stud and a drain eyelet, and a grey waistband.
  h.compound('wetsuit_shorts_technical', 0.69, legwear({ w: 0.28, d: 0.24, ht: 0.036, folds: 3, band: 0.035, cargo: { w: 0.11, d: 0.12, z: -0.03 } }), legFin('canvas-grey', 'canvas-grey') + { flap: 'canvas-grey' })
  + { voxelGrain: 0.004 },

  // A long-sleeved spring suit laid flat, front up, 1.16 m across the sleeves and 940 mm from neck to leg hem:
  // short legs, a chest zip, and pink side panels, collar and seams.
  h.compound('wetsuit_spring', 1.3, suit({ legs: 'short', zip: 'chest' }), suitFin('neoprene-black', 'plastic-pink', 'plastic-pink'))
  + { voxelGrain: 0.004 },

  // A sleeveless spring suit laid flat, front up, 430 mm across and 940 mm from neck to leg hem: ocean-blue
  // neoprene with black side panels, bound armholes, short legs and a back zip whose pull strap lies over the shoulder.
  h.compound('wetsuit_spring_sleeveless', 0.9, suit({ sleeves: 'none', legs: 'short' }), suitFin('cloth-blue', 'neoprene-black', 'neoprene-black') + { cuff: 'neoprene-black' })
  + { voxelGrain: 0.004 },

  // A thick full-length wetsuit laid flat, front up, 1.16 m across the sleeves and 1.48 m from neck to ankle: 5 mm
  // neoprene with grey side panels and flatlock seams, rubber knee pads and a back zip whose pull strap lies over the
  // shoulder.
  h.compound('wetsuit_thick', 3.8, suit({ t: 0.016, knees: true }), suitFin('neoprene-black', 'plastic-charcoal', 'canvas-grey'))
  + { voxelGrain: 0.004 },

  // A short-sleeved neoprene shirt folded flat, 300 mm by 320 mm and 30 mm tall: a crew neck and collar, grey side panels
  // and flatlock seams across the shoulders.
  h.compound('wetsuit_top', 0.4, top({}), { cloth: 'neoprene-black', collar: 'canvas-grey', panel: 'canvas-grey', stitch: 'canvas-grey' })
  + { voxelGrain: 0.004 },

  // A long-sleeved neoprene shirt folded flat, 320 mm by 330 mm and 40 mm tall: a crew neck, sleeves folded flat
  // along both sides, blue side panels and grey flatlock seams.
  h.compound('wetsuit_top_sleeved', 0.55, top({ w: 0.32, d: 0.33, ht: 0.04, sleeves: { kind: 'flat', w: 0.07, t: 0.006 } }),
    { cloth: 'neoprene-black', collar: 'cloth-blue', sleeve: 'neoprene-black', panel: 'cloth-blue', stitch: 'canvas-grey' })
  + { voxelGrain: 0.004 },

  // A thin long-sleeved neoprene shirt folded flat, 300 mm by 320 mm and 26 mm tall: a crew neck, sleeves folded flat
  // along both sides, a blue collar, grey side panels and grey flatlock seams.
  h.compound('wetsuit_top_sleeved_thin', 0.67, top({ ht: 0.026, sleeves: { kind: 'flat', w: 0.065, t: 0.004 } }),
    { cloth: 'neoprene-black', collar: 'cloth-blue', sleeve: 'neoprene-black', panel: 'canvas-grey', stitch: 'canvas-grey' })
  + { voxelGrain: 0.004 },
]
