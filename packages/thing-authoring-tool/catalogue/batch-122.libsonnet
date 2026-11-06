local h = import '../compound.libsonnet';
local box = h.box;
// A box from two opposite corners given in any order, for pieces mirrored across x.
local sbox(id, slot, a, b) = box(id, slot, [std.min(a[k], b[k]) for k in [0, 1, 2]], [std.max(a[k], b[k]) for k in [0, 1, 2]]);

// One glove lying back up on y = 0, fingers towards +z, thumb out to side s (-1 for a left hand, +1 for a right),
// centred on cx. The palm runs from z = 0 to l, the cuff from -cuffLen back to the wrist, widening to cuffW1.
// `fingers` is 'full', 'short' (fingerless stubs) or 'mitten'. Slots are named by `hand`, `finger`, `thumb`, `cuff`.
local gloveDefaults = {
  w: 0.09, l: 0.1, t: 0.022, fingers: 'full', fl: 1, ft: 0.017, thumbL: 1, cuffLen: 0.05, cuffW1: null, cuffT: 0.024,
  hand: 'hand', finger: 'hand', thumb: 'hand', cuff: 'cuff',
};
// Finger i counts from the index finger on the thumb side: its centre across the hand, length and width.
local finger(o, i) = {
  v: (1.5 - i) * o.w * 0.245,
  len: if o.fingers == 'short' then 0.02 else [0.078, 0.088, 0.082, 0.066][i] * o.fl,
  fw: o.w * 0.19,
};
local glove(p, cx, s, opts) =
  local o = gloveDefaults + opts;
  local x(v) = cx + s * v;
  local w = o.w, l = o.l, k = o.w / 0.09;
  local w1 = if o.cuffW1 == null then w * 1.1 else o.cuffW1;
  local tl = if o.fingers == 'short' then 0.6 * o.thumbL else o.thumbL;
  [
    sbox(p + 'palm', o.hand, [x(-w / 2), 0, 0], [x(w / 2), o.t, l]),
    h.prism(p + 'cuff', o.cuff, 'y', [[-o.cuffLen, x(-w1 / 2)], [-o.cuffLen, x(w1 / 2)], [0.005, x(w / 2)], [0.005, x(-w / 2)]], 0, o.cuffT),
    h.prism(p + 'thumb', o.thumb, 'y', [[pt[0] * tl, x(pt[1] * k)] for pt in [[0, 0.04], [0.035, 0.045], [0.09, 0.083], [0.076, 0.097], [0.012, 0.06]]], 0, o.ft),
  ]
  + (
    if o.fingers == 'mitten' then [
      sbox(p + 'mitten', o.finger, [x(-w * 0.47), 0, l - 0.002], [x(w * 0.47), o.ft + 0.003, l + 0.075 * o.fl]),
      sbox(p + 'mitten-tip', o.finger, [x(-w * 0.36), 0, l + 0.07 * o.fl], [x(w * 0.36), o.ft, l + 0.092 * o.fl]),
    ] else [
      local f = finger(o, i);
      sbox(p + 'finger-%d' % i, o.finger, [x(f.v - f.fw / 2), 0, l - 0.002], [x(f.v + f.fw / 2), o.ft, l + f.len])
      for i in std.range(0, 3)
    ]
  );
// Both gloves of a pair, thumbs out, with `extra(p, cx, s)` adding each glove's own details.
local pair(opts, extra, gap) = std.flattenArrays([
  glove(ps[0], ps[1] * gap, ps[1], opts) + extra(ps[0], ps[1] * gap, ps[1])
  for ps in [['l-', -1], ['r-', 1]]
]);
// Rows of raised rings across each finger and, with `back`, the back of the glove, every `pitch` along z, for mail.
local ringRows(p, cx, s, opts, slot, pitch, back=true) =
  local o = gloveDefaults + opts;
  local x(v) = cx + s * v;
  [
    sbox(p + 'ring-back-%d' % j, slot, [x(-o.w / 2 + 0.002), o.t, 0.004 + j * pitch], [x(o.w / 2 - 0.002), o.t + 0.003, 0.008 + j * pitch])
    for j in std.range(0, std.floor((o.l - 0.01) / pitch))
    if back
  ]
  + std.flattenArrays([
    local f = finger(o, i);
    [
      sbox(p + 'ring-%d-%d' % [i, j], slot, [x(f.v - f.fw / 2 + 0.001), o.ft, o.l + 0.004 + j * pitch], [x(f.v + f.fw / 2 - 0.001), o.ft + 0.003, o.l + 0.008 + j * pitch])
      for j in std.range(0, std.floor((f.len - 0.01) / pitch))
    ]
    for i in std.range(0, 3)
  ]);
// A steel plate curved over the back of the hand, its corners riveted. Slots: plate, rivet.
local backPlate(p, cx, opts, z0, z1, inset=0.005) =
  local o = gloveDefaults + opts;
  local hw = o.w / 2 - inset;
  local outline = [[-hw, z0], [hw, z0], [hw - 0.006, z1], [-hw + 0.006, z1]];
  local top(v) = h.curvedTopAt(outline, o.t, 0.003, 0.09, v);
  h.curvedPlate(p + 'back', 'plate', outline, o.t, 0.003, 0.09, 6, cx)
  + [
    box(p + 'rivet-%d-%d' % [a, b], 'rivet', [cx + v - 0.003, top(v), z - 0.003], [cx + v + 0.003, top(v) + 0.003, z + 0.003])
    for a in [0, 1]
    for b in [0, 1]
    for v in [[-hw + 0.01, hw - 0.01][a]]
    for z in [[z0 + 0.01, z1 - 0.01][b]]
  ];
// An open half-tube lying along z from z0 to z1 over the wrist, its long edges on the floor: an arc of inner radius r
// and thickness t spanning `a` degrees either side of the top round an axis at x = cx, from `n` flat facets because a
// prism must be convex. For steel cuffs and shell bracers.
local arc(id, slot, r, t, a, z0, z1, cx, n=8) =
  local rad = a * std.pi / 180, yc = -r * std.cos(rad);
  [
    local th0 = -rad + 2 * rad * i / n, th1 = -rad + 2 * rad * (i + 1) / n;
    h.prism('%s-%d' % [id, i], slot, 'z', [
      [cx + r * std.sin(th0), yc + r * std.cos(th0)],
      [cx + r * std.sin(th1), yc + r * std.cos(th1)],
      [cx + (r + t) * std.sin(th1), yc + (r + t) * std.cos(th1)],
      [cx + (r + t) * std.sin(th0), yc + (r + t) * std.cos(th0)],
    ], z0, z1)
    for i in std.range(0, n - 1)
  ];
// A steel cuff over the wrist, flaring towards the open end in two steps. Slot: plate.
local cuffPlate(p, cx, z0, z1, r0, r1) =
  arc(p + 'cuff-near', 'plate', r0, 0.003, 70, (z0 + z1) / 2, z1, cx)
  + arc(p + 'cuff-far', 'plate', r1, 0.003, 70, z0, (z0 + z1) / 2, cx);
local none(p, cx, s) = [];

// One boxing glove lying palm down, fingers towards +z, thumb on side s: a padded fist turned round z, a thumb along
// its side, a round cuff with a strap and the dark lining showing at the hand opening.
// Slots: shell, strap, lining.
local boxingGlove(p, cx, s) = [
  h.turned(p + 'fist', 'shell', 'z', [[0, 0], [0, 0.05], [0.02, 0.06], [0.06, 0.066], [0.11, 0.064], [0.145, 0.052], [0.163, 0.032], [0.17, 0]], [cx, 0.066, 0]),
  h.turned(p + 'thumb', 'shell', 'z', [[0, 0], [0, 0.018], [0.03, 0.024], [0.07, 0.022], [0.09, 0.012], [0.095, 0]], [cx + s * 0.058, 0.06, 0.005]),
  h.turned(p + 'cuff', 'shell', 'z', [[0, 0], [0, 0.047], [0.12, 0.05], [0.12, 0]], [cx, 0.052, -0.115]),
  h.turned(p + 'strap', 'strap', 'z', [[0, 0], [0, 0.052], [0.045, 0.052], [0.045, 0]], [cx, 0.052, -0.09]),
  h.turned(p + 'lining', 'lining', 'z', [[0, 0], [0, 0.038], [0.004, 0.038], [0.004, 0]], [cx, 0.052, -0.119]),
];

// One fencing gauntlet lying back up: a suede glove with a padded back, a wide cotton gauntlet cuff and a wrist
// strap. Slots: suede, pad, cotton, strap.
local fencingOpts = { w: 0.088, cuffLen: 0.13, cuffW1: 0.15, cuffT: 0.02, hand: 'suede', finger: 'suede', thumb: 'suede', cuff: 'cotton' };
local fencing(s) =
  glove('', 0, s, fencingOpts)
  + [
    sbox('pad', 'pad', [-0.04, 0.022, 0.008], [0.04, 0.03, 0.092]),
    sbox('pad-seam', 'suede', [-0.041, 0.03, 0.048], [0.041, 0.032, 0.052]),
    sbox('strap', 'strap', [-0.05, 0.019, -0.03], [0.05, 0.026, -0.008]),
    sbox('strap-tab', 'strap', [s * 0.05, 0.0, -0.03], [s * 0.07, 0.026, -0.008]),
  ];


// A plate laid flat on a curved face as one strip per piece; used for mitten lames and moulded guards. Slot named.
local lameAcross(id, slot, hw0, hw1, z0, z1, y0, r=0.09) =
  h.curvedPlate(id, slot, [[-hw0, z0], [hw0, z0], [hw1, z1], [-hw1, z1]], y0, 0.003, r, 6);
local shift(pieces, cx) = [
  if pc.kind == 'box' then pc { min: [pc.min[0] + cx, pc.min[1], pc.min[2]], max: [pc.max[0] + cx, pc.max[1], pc.max[2]] }
  else if pc.kind == 'prism' && pc.axis == 'y' then pc { profile: [[q[0], q[1] + cx] for q in pc.profile] }
  else error 'shift takes boxes and y prisms'
  for pc in pieces
];
// The gauntlet's half-width at z, between the wrist (z = 0, width w) and the open end (z = -len, width w1).
local cuffHalf(w, w1, len, z) = (w + (w1 - w) * (-z) / len) / 2;
// A band across a tapering gauntlet cuff from z0 to z1, standing proud of it. Slot named.
local cuffBand(id, slot, cx, w, w1, len, z0, z1, y) =
  h.prism(id, slot, 'y', [[z0, cx - cuffHalf(w, w1, len, z0) - 0.001], [z0, cx + cuffHalf(w, w1, len, z0) + 0.001], [z1, cx + cuffHalf(w, w1, len, z1) + 0.001], [z1, cx - cuffHalf(w, w1, len, z1) - 0.001]], 0, y);

// One plastic bag worn as a glove, laid flat: a bag body closed and rounded at the fingers, gathered at the wrist
// under a band of tape and frilled beyond it. Slots: bag, tape.
local bagGlove(p, cx) = [
  box(p + 'body', 'bag', [cx - 0.085, 0, 0], [cx + 0.085, 0.003, 0.24]),
  box(p + 'end', 'bag', [cx - 0.07, 0, 0.24], [cx + 0.07, 0.003, 0.255]),
  h.prism(p + 'gather', 'bag', 'y', [[-0.045, cx - 0.045], [-0.045, cx + 0.045], [0.002, cx + 0.085], [0.002, cx - 0.085]], 0, 0.008),
  box(p + 'tape', 'tape', [cx - 0.05, 0, -0.035], [cx + 0.05, 0.011, -0.015]),
  h.prism(p + 'frill', 'bag', 'y', [[-0.08, cx - 0.065], [-0.08, cx + 0.065], [-0.043, cx + 0.045], [-0.043, cx - 0.045]], 0, 0.004),
  box(p + 'crease-a', 'bag', [cx - 0.05, 0.003, 0.04], [cx - 0.044, 0.006, 0.2]),
  box(p + 'crease-b', 'bag', [cx + 0.01, 0.003, 0.08], [cx + 0.016, 0.006, 0.23]),
  box(p + 'crease-c', 'bag', [cx - 0.06, 0.003, 0.15], [cx + 0.03, 0.006, 0.156]),
];

local chainOpts = { w: 0.095, fl: 1.03, cuffLen: 0.07, cuffW1: 0.12, cuffT: 0.02, hand: 'mail', finger: 'mail', thumb: 'mail', cuff: 'mail' };
local demiOpts = { cuffLen: 0.03, hand: 'leather', finger: 'mail', thumb: 'mail', cuff: 'leather' };
local mittenOpts = { w: 0.095, fingers: 'mitten', cuffLen: 0.03, ft: 0.02, hand: 'leather', finger: 'leather', thumb: 'mail', cuff: 'leather' };
local beeOpts = { w: 0.095, cuffLen: 0.22, cuffW1: 0.15, cuffT: 0.02, hand: 'leather', finger: 'leather', thumb: 'leather', cuff: 'sleeve' };
local fireOpts = { w: 0.1, t: 0.026, ft: 0.021, cuffLen: 0.12, cuffW1: 0.145, cuffT: 0.022, hand: 'leather', finger: 'leather', thumb: 'leather', cuff: 'gauntlet' };
local larmorOpts = { w: 0.095, t: 0.026, ft: 0.02, fingers: 'short', cuffLen: 0.07, cuffW1: 0.115, cuffT: 0.024, hand: 'leather', finger: 'leather', thumb: 'leather', cuff: 'leather' };
local chitinOpts = { w: 0.095, t: 0.024, ft: 0.018, cuffLen: 0.02, hand: 'base', finger: 'base', thumb: 'base', cuff: 'base' };
local airsoftOpts = { fingers: 'short', ft: 0.016, cuffLen: 0.02, hand: 'body', finger: 'body', thumb: 'body', cuff: 'body' };
local sheetOpts = mittenOpts + { thumb: 'rag', hand: 'rag', finger: 'rag', cuff: 'rag' };
local jacksonOpts = { w: 0.085, l: 0.095, t: 0.018, ft: 0.015, cuffLen: 0.04, cuffW1: 0.1, cuffT: 0.016, hand: 'cloth', finger: 'cloth', thumb: 'cloth', cuff: 'cloth' };
[
  // A pair of beekeeping gloves laid flat side by side, backs up: white leather gloves 95 mm across the knuckles
  // with canvas sleeves running 220 mm up the forearm, gathered by elastic at the open end.
  h.compound('beekeeping_gloves', 0.25, pair(beeOpts, function(p, cx, s) [
    h.prism(p + 'elastic', 'elastic', 'y', [[-0.22, cx - 0.075], [-0.22, cx + 0.075], [-0.2, cx + 0.073], [-0.2, cx - 0.073]], 0, 0.024),
    sbox(p + 'seam', 'leather', [cx - 0.05, 0, -0.006], [cx + 0.05, 0.024, 0.008]),
    sbox(p + 'fold-a', 'sleeve', [cx - 0.03, 0.02, -0.19], [cx - 0.024, 0.024, -0.02]),
    sbox(p + 'fold-b', 'sleeve', [cx + 0.02, 0.02, -0.18], [cx + 0.026, 0.024, -0.03]),
  ], 0.085), { leather: 'leather-white', sleeve: 'cloth-cream', elastic: 'cloth-bright-white' })
  + { voxelGrain: 0.004 },

  // A pair of boxing gloves lying palm down side by side, each 290 mm from cuff to knuckles and 130 mm high: padded
  // red fists with the thumb sewn along the side, a white strap round the cuff and dark lining in the opening.
  h.compound('boxing_gloves', 0.68, boxingGlove('l-', -0.085, -1) + boxingGlove('r-', 0.085, 1), { shell: 'plastic-red', strap: 'leather-white', lining: 'cloth-black' })
  + { voxelGrain: 0.004 },

  // A pair of hardened steel mail gloves laid flat side by side, backs up, each 270 mm from cuff to fingertip and
  // 95 mm across the knuckles: riveted rings closing every finger, ridged where the rows lie, and a leather thong
  // round each flared cuff. The rusted junk pair shares this model.
  h.compound('ch_chainmail_hands', 1.2, pair(chainOpts, function(p, cx, s)
    ringRows(p, cx, s, chainOpts, 'mail', 0.012)
    + [sbox(p + 'thong', 'thong', [cx - 0.057, 0, -0.045], [cx + 0.057, 0.024, -0.037])], 0.075), { mail: 'steel-hardened', thong: 'leather-brown' })
  + { voxelGrain: 0.004 },

  // A pair of hardened steel demi-gauntlets laid flat side by side, backs up, 230 mm from cuff to fingertip: leather
  // gloves with mail fingers and thumb, a curved plate riveted over the back of the hand, a lame over the knuckles
  // and a flared steel cuff over the wrist.
  h.compound('ch_demi_gaunt', 1.5, pair(demiOpts, function(p, cx, s)
    backPlate(p, cx, demiOpts, 0.004, 0.08)
    + h.curvedPlate(p + 'knuckle', 'plate', [[-0.042, 0.078], [0.042, 0.078], [0.042, 0.1], [-0.042, 0.1]], 0.024, 0.003, 0.09, 6, cx)
    + cuffPlate(p, cx, -0.095, 0.004, 0.052, 0.058)
    + ringRows(p, cx, s, demiOpts, 'mail', 0.012, false), 0.08), { leather: 'leather-brown', mail: 'steel-mail', plate: 'steel-hardened', rivet: 'steel-bright' })
  + { voxelGrain: 0.004 },

  // A pair of hardened steel mitten gauntlets laid flat side by side, backs up, 260 mm from cuff to fingertip:
  // leather mittens with a mail thumb, a riveted plate over the back of the hand, four overlapping lames and a tip
  // plate over the fingers, and a flared steel cuff.
  h.compound('ch_mitten_gaunt', 2, pair(mittenOpts, function(p, cx, s)
    backPlate(p, cx, mittenOpts, 0.004, 0.09)
    + std.flattenArrays([shift(lameAcross(p + 'lame-%d' % k, 'plate', 0.045, 0.044, 0.098 + k * 0.02, 0.124 + k * 0.02, 0.023 + 0.001 * (3 - k)), cx) for k in std.range(0, 3)])
    + shift(lameAcross(p + 'tip', 'plate', 0.035, 0.03, 0.176, 0.194, 0.02), cx)
    + cuffPlate(p, cx, -0.095, 0.004, 0.054, 0.06), 0.085), { leather: 'leather-brown', mail: 'steel-mail', plate: 'steel-hardened', rivet: 'steel-bright' })
  + { voxelGrain: 0.004 },

  // A pair of crude sheet metal mitten gauntlets laid flat side by side, backs up, 280 mm from cuff to tip: rag
  // mittens under one bent steel sheet each over the back and fingers, a second sheet over the knuckles, a sheet on
  // the thumb, and a rolled sheet cuff bound with wire.
  h.compound('ch_mitten_gaunt_metal_sheets', 1.6, pair(sheetOpts, function(p, cx, s)
    shift(h.curvedPlate(p + 'sheet', 'sheet', [[-0.05, -0.005], [0.048, 0.0], [0.05, 0.12], [0.04, 0.19], [-0.038, 0.188], [-0.05, 0.115]], 0.023, 0.003, 0.1, 6), cx)
    + shift(lameAcross(p + 'knuckle', 'sheet', 0.052, 0.05, 0.085, 0.125, 0.027, 0.1), cx)
    + [
      h.prism(p + 'thumb-sheet', 'sheet', 'y', [[pt[0], cx + s * pt[1]] for pt in [[0.01, 0.045], [0.035, 0.05], [0.085, 0.084], [0.074, 0.096], [0.015, 0.064]]], 0.02, 0.023),
      box(p + 'bolt-a', 'wire', [cx - 0.036, 0.04, 0.01], [cx - 0.028, 0.045, 0.018]),
      box(p + 'bolt-b', 'wire', [cx + 0.028, 0.04, 0.01], [cx + 0.036, 0.045, 0.018]),
      box(p + 'bolt-c', 'wire', [cx - 0.004, 0.044, 0.105], [cx + 0.004, 0.049, 0.113]),
    ]
    + arc(p + 'cuff', 'sheet', 0.056, 0.003, 70, -0.1, 0.006, cx)
    + arc(p + 'wire-a', 'wire', 0.059, 0.003, 72, -0.072, -0.066, cx)
    + arc(p + 'wire-b', 'wire', 0.059, 0.003, 72, -0.026, -0.02, cx), 0.085), { rag: 'cloth-rag', sheet: 'steel-hardened', wire: 'steel-galvanised' })
  + { voxelGrain: 0.004 },

  // A pair of firefighting gloves laid flat side by side, backs up: heavy tan leather gloves 100 mm across the
  // knuckles with a padded knuckle panel, and flame-resistant gauntlet cuffs 120 mm long with a reflective band.
  h.compound('fire_gauntlets', 0.44, pair(fireOpts, function(p, cx, s) [
    cuffBand(p + 'band', 'band', cx, 0.1, 0.145, 0.12, -0.09, -0.072, 0.025),
    sbox(p + 'pad', 'pad', [cx - 0.046, 0.026, 0.062], [cx + 0.046, 0.032, 0.098]),
    sbox(p + 'seam', 'pad', [cx - 0.051, 0, -0.004], [cx + 0.051, 0.028, 0.006]),
  ], 0.09), { leather: 'leather-tan', gauntlet: 'cloth-turnout', band: 'reflective-yellow', pad: 'leather-brown' })
  + { voxelGrain: 0.004 },

  // A right-hand fencing gauntlet laid flat, back up, 230 mm from cuff to fingertip: a suede glove with a padded
  // back, a wrist strap and a wide cotton gauntlet cuff 130 mm long.
  h.compound('gauntlet_fencing', 0.19, fencing(1), { suede: 'suede-brown', pad: 'suede-brown', cotton: 'cloth-bright-white', strap: 'leather-white' })
  + { voxelGrain: 0.004 },

  // The left-hand fencing gauntlet, the mirror of the right.
  h.compound('gauntlet_fencing_l', 0.19, fencing(-1), { suede: 'suede-brown', pad: 'suede-brown', cotton: 'cloth-bright-white', strap: 'leather-white' })
  + { voxelGrain: 0.004 },

  // A pair of chitin gauntlets laid flat side by side, backs up, 250 mm from cuff to fingertip: dark leather gloves
  // under a domed shell over the back of the hand with a ridge down its middle, three shell segments down each
  // finger and two on the thumb, and a shell bracer over the wrist laced with sinew.
  h.compound('gauntlets_chitin', 0.56, pair(chitinOpts, function(p, cx, s)
    local x(v) = cx + s * v;
    shift(h.curvedPlate(p + 'back', 'shell', [[-0.044, 0.0], [0.044, 0.0], [0.046, 0.06], [0.03, 0.098], [-0.03, 0.098], [-0.046, 0.06]], 0.024, 0.004, 0.08, 6), cx)
    + [sbox(p + 'ridge', 'shell', [cx - 0.004, 0.034, 0.008], [cx + 0.004, 0.04, 0.09])]
    + std.flattenArrays([
      local f = finger(gloveDefaults + chitinOpts, i);
      [
        sbox(p + 'seg-%d-%d' % [i, j], 'shell', [x(f.v - f.fw / 2 - 0.001), 0.018, 0.1 + j * f.len / 3], [x(f.v + f.fw / 2 + 0.001), 0.023, 0.1 + (j + 1) * f.len / 3 - 0.004])
        for j in [0, 1, 2]
      ]
      for i in std.range(0, 3)
    ])
    + [
      h.prism(p + 'thumb-seg-a', 'shell', 'y', [[0.016, x(0.05)], [0.05, x(0.064)], [0.042, x(0.074)], [0.012, x(0.06)]], 0.018, 0.023),
      h.prism(p + 'thumb-seg-b', 'shell', 'y', [[0.056, x(0.068)], [0.086, x(0.084)], [0.075, x(0.095)], [0.048, x(0.079)]], 0.018, 0.023),
    ]
    + arc(p + 'bracer', 'shell', 0.05, 0.004, 72, -0.1, 0.004, cx)
    + arc(p + 'lace-a', 'lace', 0.054, 0.002, 74, -0.075, -0.071, cx)
    + arc(p + 'lace-b', 'lace', 0.054, 0.002, 74, -0.035, -0.031, cx), 0.085), { base: 'leather-black', shell: 'chitin-brown', lace: 'skin-rawhide' })
  + { voxelGrain: 0.004 },

  // A pair of heavy fingerless leather gloves laid flat side by side, backs up, 200 mm from cuff to finger stubs:
  // thick leather with a padded back panel and knuckle roll, and a flared cuff with a buckled strap.
  h.compound('gauntlets_larmor', 0.47, pair(larmorOpts, function(p, cx, s)
    local x(v) = cx + s * v;
    [
      sbox(p + 'pad', 'pad', [cx - 0.04, 0.026, 0.008], [cx + 0.04, 0.032, 0.084]),
      sbox(p + 'knuckle', 'pad', [cx - 0.046, 0.022, 0.088], [cx + 0.046, 0.034, 0.104]),
      cuffBand(p + 'strap', 'strap', cx, 0.095, 0.115, 0.07, -0.045, -0.03, 0.027),
      sbox(p + 'buckle', 'buckle', [x(-0.044), 0.024, -0.05], [x(-0.03), 0.031, -0.025]),
    ], 0.08), { leather: 'leather-brown', pad: 'leather-chestnut', strap: 'leather-black', buckle: 'brass-dull' })
  + { voxelGrain: 0.004 },

  // A single white cotton glove for the right hand laid flat, back up, 220 mm from cuff to fingertip, its back,
  // fingers and cuff studded with rows of rhinestones.
  h.compound('glove_jackson', 0.053, glove('', 0, 1, jacksonOpts) + [
    sbox('stone-back-%d-%d' % [i, j], 'stone', [-0.034 + i * 0.0135, 0.018, 0.006 + j * 0.0125], [-0.031 + i * 0.0135, 0.02, 0.009 + j * 0.0125])
    for i in std.range(0, 5)
    for j in std.range(0, 6)
  ] + std.flattenArrays([
    local f = finger(gloveDefaults + jacksonOpts, i);
    [
      sbox('stone-%d-%d' % [i, j], 'stone', [f.v - 0.0015, 0.015, 0.1 + j * 0.013], [f.v + 0.0015, 0.017, 0.103 + j * 0.013])
      for j in std.range(0, std.floor((f.len - 0.008) / 0.013))
    ]
    for i in std.range(0, 3)
  ]) + [
    sbox('stone-cuff-%d-%d' % [i, j], 'stone', [-0.04 + i * 0.016, 0.016, -0.034 + j * 0.013], [-0.037 + i * 0.016, 0.018, -0.031 + j * 0.013])
    for i in std.range(0, 5)
    for j in [0, 1]
  ], { cloth: 'cloth-bright-white', stone: 'gem-clear' })
  + { voxelGrain: 0.002 },

  // A pair of fingerless airsoft gloves laid flat side by side, backs up, 160 mm from cuff to finger stubs: tan
  // leather with a moulded plastic guard over the knuckles, a second over the back of the hand, a small guard on
  // each finger stub and a hook-and-loop wrist strap.
  h.compound('gloves_airsoft', 0.26, pair(airsoftOpts, function(p, cx, s)
    local x(v) = cx + s * v;
    shift(lameAcross(p + 'knuckle', 'guard', 0.045, 0.043, 0.07, 0.102, 0.022, 0.07), cx)
    + shift(lameAcross(p + 'back', 'guard', 0.034, 0.038, 0.02, 0.062, 0.022, 0.07), cx)
    + [
      local f = finger(gloveDefaults + airsoftOpts, i);
      sbox(p + 'stub-guard-%d' % i, 'guard', [x(f.v - f.fw / 2 + 0.002), 0.016, 0.103], [x(f.v + f.fw / 2 - 0.002), 0.02, 0.116])
      for i in std.range(0, 3)
    ]
    + [
      sbox(p + 'strap', 'strap', [cx - 0.05, 0.02, -0.018], [cx + 0.05, 0.027, 0.0]),
      sbox(p + 'strap-tab', 'strap', [x(-0.05), 0.0, -0.018], [x(-0.064), 0.027, 0.0]),
    ], 0.075), { body: 'leather-tan', guard: 'plastic-matte-black', strap: 'hook-loop-grey' })
  + { voxelGrain: 0.004 },

  // A pair of thin plastic bags worn as gloves, laid flat side by side, each 170 mm wide and 330 mm long, closed at
  // the fingers and gathered at the wrist under a band of tape.
  h.compound('gloves_bag', 0.012, bagGlove('l-', -0.095) + bagGlove('r-', 0.095), { bag: 'plastic-bag', tape: 'tape-grey' })
  + { voxelGrain: 0.002 },
]
