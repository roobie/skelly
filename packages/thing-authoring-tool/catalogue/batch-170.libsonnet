local h = import '../compound.libsonnet';
local box = h.box;

// Whole-body armour suits laid out flat, front up, neck towards -z: the body piece in the middle, an arm piece either
// side of it and the two leg pieces below, as batch 110's cardboard armour lies.

// A box from two opposite corners given in any order, for pieces mirrored across x.
local sbox(id, slot, a, b) = box(id, slot, [std.min(a[k], b[k]) for k in [0, 1, 2]], [std.max(a[k], b[k]) for k in [0, 1, 2]]);
// A flat convex outline of [x, z] points lying on y from y0 to y1.
local flat(id, slot, pts, y0, y1) = h.prism(id, slot, 'y', [[p[1], p[0]] for p in pts], y0, y1);

// A half-round shell lying along z from z0 to z1 on the floor, convex side up: an arc of outer radius r and thickness
// t spanning `a` degrees either side of the top, centred on x = cx, its long edges resting at y0, from n flat facets.
// Limb guards, lames and greaves.
local shellZ(id, slot, r, t, a, z0, z1, cx, n=8, y0=0) =
  local rad = a * std.pi / 180, yc = y0 - r * std.cos(rad) + t;
  [
    local th0 = -rad + 2 * rad * i / n, th1 = -rad + 2 * rad * (i + 1) / n;
    h.prism('%s-%d' % [id, i], slot, 'z', [
      [cx + (r - t) * std.sin(th0), yc + (r - t) * std.cos(th0)],
      [cx + (r - t) * std.sin(th1), yc + (r - t) * std.cos(th1)],
      [cx + r * std.sin(th1), yc + r * std.cos(th1)],
      [cx + r * std.sin(th0), yc + r * std.cos(th0)],
    ], z0, z1)
    for i in std.range(0, n - 1)
  ];
// Height of a shellZ's top at its crown.
local shellTop(r, t, a, y0=0) = y0 - r * std.cos(a * std.pi / 180) + t + r;
// A band `w` long along z lying round the outside of a shellZ at z, `lift` proud of it: straps, rivet rows, roped edges.
local bandZ(id, slot, r, t, a, z, w, cx, lift=0.003, n=8, y0=0) =
  shellZ(id, slot, r + lift, lift + 0.002, a, z - w / 2, z + w / 2, cx, n, y0 + lift);

// The body plate lying front up, centred on [0, cz]: a breastplate `w` across and `l` from neck to waist, curved
// across x, with its armholes cut away at the top corners. Returns its outline for h.onCurvedFace.
local chestOutline(w, l) = [
  [-w / 2 + 0.07, -l / 2], [w / 2 - 0.07, -l / 2], [w / 2, -l / 2 + 0.13], [w / 2 - 0.02, l / 2], [-w / 2 + 0.02, l / 2], [-w / 2, -l / 2 + 0.13],
];

// A full plate suit laid out flat, neck towards -z. Options:
// thick: plate thickness of the breastplate, for the light, middle and heavy suits;
// lames: lames in the fauld below the breastplate;
// plackart: a second plate riveted over the lower breastplate;
// flutes: raised flutes fanning down the breastplate and lames;
// rust: rust patches and frayed straps.
// Slots: plate, ridge, mail, strap, rivet, rust.
local plateSuit(o) =
  local c = { thick: 0.012, lames: 3, plackart: false, flutes: false, rust: false, pauldron: 0.085 } + o;
  local w = 0.42, l = 0.5, cz = -0.29, r = 0.32, t = c.thick;
  local out = chestOutline(w, l);
  local onChest(id, slot, a, b, wd) = h.onCurvedFace(id, slot, out, 0, t, r, a, b, wd, 0, cz);
  local chest = h.curvedPlate('chest', 'plate', out, 0, t, r, 12, 0, cz);
  local ridge = [onChest('ridge', 'ridge', [0, -l / 2 + 0.03], [0, l / 2 - 0.01], 0.01)];
  // Rolled edge round the neck and armholes.
  local roll = [
    onChest('neck-roll', 'ridge', [-w / 2 + 0.08, -l / 2 + 0.008], [w / 2 - 0.08, -l / 2 + 0.008], 0.012),
    onChest('arm-roll-l', 'ridge', [-w / 2 + 0.065, -l / 2 + 0.01], [-w / 2 + 0.006, -l / 2 + 0.125], 0.012),
    onChest('arm-roll-r', 'ridge', [w / 2 - 0.065, -l / 2 + 0.01], [w / 2 - 0.006, -l / 2 + 0.125], 0.012),
  ];
  local flutes = if c.flutes then [
    onChest('flute-%d' % i, 'ridge', [s * 0.03, -l / 2 + 0.08], [s * 0.11, l / 2 - 0.03], 0.008)
    for i in [0, 1, 2, 3]
    for s in [[-1, 1, -2, 2][i] * 0.9]
  ] else [];
  local plackart = if c.plackart then
    local po = [[-0.15, 0.02], [0.15, 0.02], [0.18, l / 2 - 0.005], [-0.18, l / 2 - 0.005]];
    h.curvedPlate('plackart', 'plate', [[p[0], p[1]] for p in po], h.curvedTopAt(out, 0, t, r, 0.17) - t - 0.003, 0.008, r, 10, 0, cz, w / 2)
    + [h.disc('plackart-rivet-%d' % i, 'rivet', 0.007, h.curvedTopAt(out, 0, t, r, x) + 0.005, h.curvedTopAt(out, 0, t, r, x) + 0.011, x, cz + 0.035) for i in [0, 1, 2] for x in [[-0.12, 0, 0.12][i]]]
  else [];
  // Fauld: lames below the breastplate, each overlapping the one above.
  local faulds = std.flattenArrays([
    local z0 = cz + l / 2 - 0.01 + i * 0.04;
    h.curvedPlate('lame-%d' % i, 'plate', [[-w / 2 + 0.03 - i * 0.01, z0], [w / 2 - 0.03 + i * 0.01, z0], [w / 2 - 0.03 + i * 0.01, z0 + 0.05], [-w / 2 + 0.03 - i * 0.01, z0 + 0.05]], 0, t, r, 8)
    + [h.disc('lame-rivet-%d-%s' % [i, s], 'rivet', 0.006, h.curvedTopAt(out, 0, t, r, 0.17) + 0.003, h.curvedTopAt(out, 0, t, r, 0.17) + 0.009, s * 0.17, z0 + 0.025) for s in [-1, 1]]
    for i in std.range(0, c.lames - 1)
  ]);
  local skirtZ = cz + l / 2 - 0.01 + c.lames * 0.04 + 0.01;
  // A mail skirt hanging below the lames.
  local skirt = [flat('skirt', 'mail', [[-0.19, skirtZ - 0.02], [0.19, skirtZ - 0.02], [0.2, skirtZ + 0.07], [-0.2, skirtZ + 0.07]], 0, 0.006)]
    + [box('skirt-row-%d' % i, 'mail', [-0.19, 0.006, skirtZ + i * 0.016], [0.19, 0.009, skirtZ + i * 0.016 + 0.005]) for i in std.range(0, 3)];
  // Pauldrons: domed caps over the shoulders with a lame below each.
  local pr = c.pauldron;
  local pauldrons = std.flattenArrays([
    [
      h.dome('pauldron-' + side, 'plate', pr, pr * 0.6, 0.008, 'y', [s * 0.33, 0, cz - l / 2 + 0.03]),
      h.dome('pauldron-lame-' + side, 'plate', pr * 0.8, pr * 0.35, 0.008, 'y', [s * 0.33, 0, cz - l / 2 + 0.03 + pr * 1.05]),
      h.disc('pauldron-rivet-' + side, 'rivet', 0.008, pr * 0.6 - 0.002, pr * 0.6 + 0.004, s * 0.33, cz - l / 2 + 0.03),
    ]
    for side in ['l', 'r']
    for s in [if side == 'l' then -1 else 1]
  ]);
  // Arm harness beside the body: rerebrace, an elbow cop with a fan and a vambrace, mail showing at the elbow.
  local arm(side, s) =
    local x = s * 0.33, z0 = cz - l / 2 + 0.03 + pr * 1.5;
    shellZ('rerebrace-' + side, 'plate', 0.06, 0.006, 70, z0, z0 + 0.2, x)
    + [flat('elbow-mail-' + side, 'mail', [[x - 0.05, z0 + 0.19], [x + 0.05, z0 + 0.19], [x + 0.05, z0 + 0.27], [x - 0.05, z0 + 0.27]], 0, 0.008)]
    + [
      h.dome('couter-' + side, 'plate', 0.05, 0.035, 0.007, 'y', [x, 0, z0 + 0.23]),
      flat('couter-fan-' + side, 'plate', [[x + s * 0.03, z0 + 0.2], [x + s * 0.09, z0 + 0.19], [x + s * 0.09, z0 + 0.27], [x + s * 0.03, z0 + 0.26]], 0, 0.006),
    ]
    + shellZ('vambrace-' + side, 'plate', 0.05, 0.006, 75, z0 + 0.27, z0 + 0.5, x)
    + bandZ('arm-strap-a-' + side, 'strap', 0.06, 0.006, 70, z0 + 0.1, 0.02, x)
    + bandZ('arm-strap-b-' + side, 'strap', 0.05, 0.006, 75, z0 + 0.4, 0.02, x);
  // Leg harness below: cuisse, a knee cop with its wing, mail at the back of the knee, and a greave.
  local leg(side, s) =
    local x = s * 0.11, z0 = skirtZ + 0.05;
    shellZ('cuisse-' + side, 'plate', 0.085, 0.007, 70, z0, z0 + 0.24, x)
    + [flat('knee-mail-' + side, 'mail', [[x - 0.07, z0 + 0.23], [x + 0.07, z0 + 0.23], [x + 0.07, z0 + 0.31], [x - 0.07, z0 + 0.31]], 0, 0.008)]
    + [
      h.dome('poleyn-' + side, 'plate', 0.06, 0.045, 0.008, 'y', [x, 0, z0 + 0.27]),
      flat('poleyn-wing-' + side, 'plate', [[x + s * 0.04, z0 + 0.24], [x + s * 0.095, z0 + 0.25], [x + s * 0.095, z0 + 0.29], [x + s * 0.04, z0 + 0.3]], 0, 0.006),
    ]
    + shellZ('greave-' + side, 'plate', 0.065, 0.007, 80, z0 + 0.31, z0 + 0.53, x)
    + bandZ('thigh-strap-a-' + side, 'strap', 0.085, 0.007, 70, z0 + 0.06, 0.022, x)
    + bandZ('thigh-strap-b-' + side, 'strap', 0.085, 0.007, 70, z0 + 0.18, 0.022, x)
    + bandZ('shin-strap-' + side, 'strap', 0.065, 0.007, 80, z0 + 0.45, 0.022, x);
  // Shoulder straps joining breast to back, buckled on the chest.
  local straps = [
    sbox('shoulder-strap-' + side, 'strap', [s * 0.09, 0, cz - l / 2 - 0.05], [s * 0.13, h.curvedTopAt(out, 0, t, r, s * 0.11) + 0.003, cz - l / 2 + 0.04])
    for side in ['l', 'r']
    for s in [if side == 'l' then -1 else 1]
  ];
  local rusts = if c.rust then [
    onChest('rust-a', 'rust', [-0.12, cz + 0.0 - cz - 0.05], [-0.05, 0.05], 0.05),
    onChest('rust-b', 'rust', [0.09, 0.1], [0.15, 0.17], 0.04),
    onChest('rust-c', 'rust', [0.05, -0.18], [0.12, -0.15], 0.03),
    sbox('rust-d', 'rust', [-0.37, 0.05, cz + 0.12], [-0.31, 0.058, cz + 0.16]),
    sbox('rust-e', 'rust', [0.07, 0.07, skirtZ + 0.3], [0.13, 0.078, skirtZ + 0.34]),
    // Frayed strap ends hanging loose off the arm and the leg.
    sbox('frayed-a', 'strap', [-0.4, 0, cz + 0.2], [-0.385, 0.004, cz + 0.29]),
    sbox('frayed-b', 'strap', [0.18, 0, skirtZ + 0.2], [0.195, 0.004, skirtZ + 0.3]),
  ] else [];
  chest + ridge + roll + flutes + plackart + faulds + skirt + pauldrons + arm('l', -1) + arm('r', 1) + leg('l', -1) + leg('r', 1) + straps + rusts;

// A suit of sheet metal laid out flat, neck towards -z, hammered from flat stock rather than shaped: a shallow
// chest sheet over a wider back sheet, louvre vents left from the lockers it was cut from, rows of rivets, and arm and
// leg guards bent in three flat facets, strapped on. Options: heavy lays a second chest sheet over the first; chain
// adds mail at the shoulders, elbows and knees and a mail skirt. Slots: sheet, rivet, vent, strap, mail.
local sheetSuit(o) =
  local c = { heavy: false, chain: false } + o;
  local w = 0.44, l = 0.52, cz = -0.32, r = 0.9, t = 0.008;
  local out = chestOutline(w, l);
  local top(x) = h.curvedTopAt(out, 0.006, t, r, x);
  local back = [flat('back', 'sheet', [[-w / 2 - 0.02, cz - l / 2 + 0.02], [w / 2 + 0.02, cz - l / 2 + 0.02], [w / 2 + 0.02, cz + l / 2 + 0.03], [-w / 2 - 0.02, cz + l / 2 + 0.03]], 0, 0.006)];
  local chest = h.curvedPlate('chest', 'sheet', out, 0.006, t, r, 6, 0, cz);
  local inner = [[-0.15, -0.06], [0.15, -0.06], [0.16, l / 2 - 0.03], [-0.16, l / 2 - 0.03]];
  local double = if c.heavy then
    h.curvedPlate('chest-double', 'sheet', inner, top(0.16) - 0.002, 0.008, r, 6, 0, cz, w / 2)
    + [h.disc('double-rivet-%d-%d' % [i, j], 'rivet', 0.006, top(x) + 0.006, top(x) + 0.012, x, cz + z)
       for i in [0, 1, 2, 3] for x in [[-0.14, -0.05, 0.05, 0.14][i]] for j in [0, 1] for z in [[-0.04, l / 2 - 0.05][j]]]
  else [];
  // Louvres high on the chest: raised slats with a dark slot under each.
  local vents = std.flattenArrays([
    [
      box('vent-%d-%d' % [k, i], 'vent', [x - 0.04, top(x) - 0.001, cz - 0.17 + i * 0.022], [x + 0.04, top(x) + 0.002, cz - 0.162 + i * 0.022]),
      box('louvre-%d-%d' % [k, i], 'sheet', [x - 0.042, top(x) + 0.002, cz - 0.162 + i * 0.022], [x + 0.042, top(x) + 0.006, cz - 0.156 + i * 0.022]),
    ]
    for k in [0, 1]
    for x in [[-0.11, 0.11][k]]
    for i in std.range(0, 4)
  ]);
  local rivets = [
    h.disc('rivet-%s-%d' % [side, i], 'rivet', 0.006, top(s * 0.19), top(s * 0.19) + 0.005, s * 0.19, cz - l / 2 + 0.16 + i * 0.05)
    for side in ['l', 'r']
    for s in [if side == 'l' then -1 else 1]
    for i in std.range(0, 6)
  ];
  // Hip sheets hung below the chest.
  local hips = [flat('hip-' + side, 'sheet', [[s * 0.02, cz + l / 2 + 0.01], [s * 0.21, cz + l / 2 + 0.01], [s * 0.2, cz + l / 2 + 0.15], [s * 0.03, cz + l / 2 + 0.15]], 0, 0.006) for side in ['l', 'r'] for s in [if side == 'l' then -1 else 1]]
    + [h.disc('hip-rivet-%s-%d' % [side, i], 'rivet', 0.006, 0.006, 0.011, s * (0.05 + i * 0.06), cz + l / 2 + 0.035) for side in ['l', 'r'] for s in [if side == 'l' then -1 else 1] for i in [0, 1, 2]];
  local skirtZ = cz + l / 2 + 0.12;
  local skirt = if c.chain then
    [flat('skirt', 'mail', [[-0.21, skirtZ], [0.21, skirtZ], [0.22, skirtZ + 0.09], [-0.22, skirtZ + 0.09]], 0, 0.006)]
    + [box('skirt-row-%d' % i, 'mail', [-0.21, 0.006, skirtZ + 0.035 + i * 0.016], [0.21, 0.009, skirtZ + 0.04 + i * 0.016]) for i in std.range(0, 2)]
  else [];
  local strapAt(id, rr, a, z, x) = bandZ(id, 'strap', rr, t, a, z, 0.025, x, 0.003, 3);
  local limb(p, x, z0, segs, rr) = std.flattenArrays([
    shellZ('%s-%d' % [p, k], 'sheet', rr[k], t, 55, segs[k][0], segs[k][1], x, 3)
    + strapAt('%s-strap-%d' % [p, k], rr[k], 55, (segs[k][0] + segs[k][1]) / 2, x)
    + [h.disc('%s-rivet-%d-%d' % [p, k, j], 'rivet', 0.005, shellTop(rr[k], t, 55) - 0.002, shellTop(rr[k], t, 55) + 0.004, x, segs[k][0] + 0.02 + j * (segs[k][1] - segs[k][0] - 0.04)) for j in [0, 1]]
    for k in std.range(0, std.length(segs) - 1)
  ]);
  local joint(id, x, z, wd, ln) = if c.chain then [flat(id, 'mail', [[x - wd / 2, z], [x + wd / 2, z], [x + wd / 2, z + ln], [x - wd / 2, z + ln]], 0, 0.008)] + [box('%s-row-%d' % [id, i], 'mail', [x - wd / 2, 0.008, z + 0.012 + i * 0.016], [x + wd / 2, 0.011, z + 0.017 + i * 0.016]) for i in std.range(0, std.floor(ln / 0.016) - 2)] else [];
  local arm(side, s) =
    local x = s * 0.34, z0 = cz - l / 2 + 0.02;
    // A flat shoulder sheet, then the upper and lower arm.
    [flat('shoulder-' + side, 'sheet', [[x - 0.08, z0], [x + 0.08, z0], [x + 0.07, z0 + 0.12], [x - 0.07, z0 + 0.12]], 0, 0.008)]
    + [h.disc('shoulder-rivet-%s-%d' % [side, i], 'rivet', 0.006, 0.008, 0.013, x + (i - 1) * 0.05, z0 + 0.03) for i in [0, 1, 2]]
    + joint('shoulder-mail-' + side, x, z0 + 0.12, 0.11, 0.06)
    + limb('arm-' + side, x, z0, [[z0 + 0.15, z0 + 0.36], [z0 + 0.42, z0 + 0.64]], [0.065, 0.055])
    + joint('elbow-mail-' + side, x, z0 + 0.355, 0.1, 0.07);
  local leg(side, s) =
    local x = s * 0.115, z0 = skirtZ + (if c.chain then 0.07 else 0.04);
    limb('leg-' + side, x, z0, [[z0, z0 + 0.24], [z0 + 0.32, z0 + 0.56]], [0.09, 0.07])
    + joint('knee-mail-' + side, x, z0 + 0.235, 0.15, 0.09)
    + [flat('knee-' + side, 'sheet', [[x - 0.05, z0 + 0.25], [x + 0.05, z0 + 0.25], [x + 0.06, z0 + 0.28], [x + 0.05, z0 + 0.31], [x - 0.05, z0 + 0.31], [x - 0.06, z0 + 0.28]], 0.008, 0.016)];
  local straps = [
    sbox('shoulder-strap-' + side, 'strap', [s * 0.08, 0.006, cz - l / 2 - 0.04], [s * 0.12, top(s * 0.1) + 0.003, cz - l / 2 + 0.05])
    for side in ['l', 'r']
    for s in [if side == 'l' then -1 else 1]
  ];
  back + chest + double + vents + rivets + hips + skirt + arm('l', -1) + arm('r', 1) + leg('l', -1) + leg('r', 1) + straps;

// A suit of boiled leather laid out flat, neck towards -z: a moulded cuirass with a stitched edge and laced sides,
// layered shoulder flaps, a skirt of hanging strips, laced arm guards and thigh and shin guards. Slots: leather,
// edge, lace, strip.
local leatherSuit() =
  local w = 0.42, l = 0.5, cz = -0.3, r = 0.35, t = 0.01;
  local out = chestOutline(w, l);
  local onChest(id, slot, a, b, wd) = h.onCurvedFace(id, slot, out, 0, t, r, a, b, wd, 0, cz);
  local edges = [
    onChest('edge-top', 'edge', [-w / 2 + 0.08, -l / 2 + 0.008], [w / 2 - 0.08, -l / 2 + 0.008], 0.014),
    onChest('edge-foot', 'edge', [-w / 2 + 0.03, l / 2 - 0.008], [w / 2 - 0.03, l / 2 - 0.008], 0.014),
    onChest('edge-l', 'edge', [-w / 2 + 0.01, -l / 2 + 0.14], [-w / 2 + 0.025, l / 2 - 0.01], 0.014),
    onChest('edge-r', 'edge', [w / 2 - 0.01, -l / 2 + 0.14], [w / 2 - 0.025, l / 2 - 0.01], 0.014),
    // Moulded chest muscles: two raised lobes either side of the middle.
  ] + [
    onChest('pec-%s-%d' % [side, i], 'leather', [s * 0.025, -0.12 + i * 0.02], [s * (0.15 - i * 0.015), -0.11 + i * 0.02], 0.02)
    for side in ['l', 'r']
    for s in [if side == 'l' then -1 else 1]
    for i in [0, 1, 2, 3]
  ];
  local strips = [
    flat('strip-%d' % i, 'strip', [[x - 0.022, cz + l / 2 - 0.02], [x + 0.022, cz + l / 2 - 0.02], [x + 0.022, cz + l / 2 + 0.13], [x - 0.022, cz + l / 2 + 0.13]], 0, 0.008)
    for i in std.range(0, 7)
    for x in [-0.175 + i * 0.05]
  ] + [h.disc('strip-stud-%d' % i, 'lace', 0.007, 0.008, 0.012, -0.175 + i * 0.05, cz + l / 2 + 0.11) for i in std.range(0, 7)];
  local flaps = std.flattenArrays([
    [flat('flap-%s-%d' % [side, k], 'leather', [[s * 0.25, z], [s * 0.42, z], [s * 0.41, z + 0.07], [s * 0.26, z + 0.07]], k * 0.006, k * 0.006 + 0.008) for k in [0, 1, 2] for z in [cz - l / 2 + 0.02 + (2 - k) * 0.05]]
    + [box('flap-edge-%s' % side, 'edge', [std.min(s * 0.25, s * 0.42), 0.02, cz - l / 2 + 0.077], [std.max(s * 0.25, s * 0.42), 0.024, cz - l / 2 + 0.087])]
    for side in ['l', 'r']
    for s in [if side == 'l' then -1 else 1]
  ]);
  local laced(p, x, z0, z1, rr) =
    shellZ(p, 'leather', rr, 0.008, 70, z0, z1, x)
    + bandZ(p + '-rim-a', 'edge', rr, 0.008, 70, z0 + 0.008, 0.014, x, 0.002)
    + bandZ(p + '-rim-b', 'edge', rr, 0.008, 70, z1 - 0.008, 0.014, x, 0.002)
    + [
      local za = z0 + 0.03 + i * 0.03, top = shellTop(rr, 0.008, 70);
      flat('%s-lace-%d' % [p, i], 'lace', [[x - 0.025, za], [x - 0.019, za], [x + 0.025, za + 0.03], [x + 0.019, za + 0.03]], top - 0.002, top + 0.002)
      for i in std.range(0, std.floor((z1 - z0 - 0.06) / 0.03) - 1)
    ];
  local arm(side, s) = local x = s * 0.33, z0 = cz - l / 2 + 0.2; laced('arm-' + side, x, z0, z0 + 0.42, 0.055);
  local leg(side, s) =
    local x = s * 0.11, z0 = cz + l / 2 + 0.15;
    laced('thigh-' + side, x, z0, z0 + 0.26, 0.085)
    + [h.dome('knee-' + side, 'leather', 0.055, 0.035, 0.008, 'y', [x, 0, z0 + 0.3])]
    + laced('shin-' + side, x, z0 + 0.34, z0 + 0.58, 0.065);
  h.curvedPlate('chest', 'leather', out, 0, t, r, 12, 0, cz) + edges + strips + flaps + arm('l', -1) + arm('r', 1) + leg('l', -1) + leg('r', 1);

// Chitin armour laid out flat, neck towards -z, covering the body and legs only (no arms, as the reference gives): a
// cuirass of overlapping curved shell segments down a keeled middle, like a beetle's back, rounded shoulder caps, and
// each leg guard a run of shell rings that shrink
// towards the ankle, all laced together with rawhide. Slots: shell, keel, lace.
local chitinSuit() =
  local cz = -0.25;
  local seg(i) = { z0: cz - 0.24 + i * 0.06, w: 0.36 + 0.04 * std.sin(i * 0.5) - (if i > 6 then (i - 6) * 0.03 else 0) };
  local body = std.flattenArrays([
    local s = seg(i), o = [[-s.w / 2, s.z0], [s.w / 2, s.z0], [s.w / 2 - 0.01, s.z0 + 0.075], [-s.w / 2 + 0.01, s.z0 + 0.075]];
    h.curvedPlate('seg-%d' % i, 'shell', o, i * 0.002, 0.008, 0.3, 10)
    + [h.onCurvedFace('keel-%d' % i, 'keel', o, i * 0.002, 0.008, 0.3, [0, s.z0 + 0.005], [0, s.z0 + 0.07], 0.016)]
    for i in std.range(0, 7)
  ]);
  local laceAt(i, side) = local s = seg(i), sg = if side == 'l' then -1 else 1;
    box('lace-%s-%d' % [side, i], 'lace', [sg * (s.w / 2 - 0.035) - 0.006, 0, s.z0 + 0.03], [sg * (s.w / 2 - 0.035) + 0.006, h.curvedTopAt([[-s.w / 2, 0], [s.w / 2, 0]], i * 0.002, 0.008, 0.3, s.w / 2 - 0.035) + 0.003, s.z0 + 0.08]);
  local laces = [laceAt(i, side) for i in std.range(0, 7) for side in ['l', 'r']];
  // Rounded shoulder caps over the top corners, each a small curved shell with a keel along it.
  local capO(s) =
    local o = [[-0.05, cz - 0.25], [0.01, cz - 0.255], [0.045, cz - 0.23], [0.06, cz - 0.17], [0.05, cz - 0.11], [-0.04, cz - 0.12]];
    local m = [[s * p[0], p[1]] for p in o];
    if s > 0 then m else std.reverse(m);
  local horns = std.flattenArrays([
    h.curvedPlate('cap-' + side, 'shell', capO(s), 0.014, 0.008, 0.1, 8, s * 0.16)
    for side in ['l', 'r']
    for s in [if side == 'l' then -1 else 1]
  ]);
  local leg(side, s) =
    local x = s * 0.115, z0 = cz + 0.25;
    std.flattenArrays([
      local rr = 0.085 - k * 0.0055, za = z0 + k * 0.075;
      shellZ('leg-%s-%d' % [side, k], 'shell', rr, 0.008, 72, za, za + 0.085, x, 8, k % 2 * 0.002)
      + bandZ('leg-lace-%s-%d' % [side, k], 'lace', rr, 0.008, 72, za + 0.075, 0.008, x, 0.002, 8, k % 2 * 0.002)
      for k in std.range(0, 7)
    ]);
  body + laces + horns + leg('l', -1) + leg('r', 1);

// Fur body armour folded on a shelf: a thick sleeved fur coat with the leggings folded inside, shaggy tufts over the
// top, a fur collar and rawhide ties down the front. Slots: cloth, collar, sleeve, stitch, cuff, front, tuft, tie.
local furArmour() =
  local g = import '../garments.libsonnet';
  g.jacket({ w: 0.3, d: 0.28, ht: 0.11, folds: 4, neck: 0.075, collar: { r: 0.055, wd: 0.035, ht: 0.03, gap: 40 }, front: 'placket', frontW: 0.02, frontT: 0.006, buttons: 0, sleeves: { kind: 'roll', r: 0.03 } })
  + [
    box('tuft-%d-%d' % [i, j], 'tuft', [-0.105 + i * 0.05 + (j % 2) * 0.02, 0.11, -0.13 + j * 0.035], [-0.085 + i * 0.05 + (j % 2) * 0.02, 0.118 + ((i + j) % 3) * 0.003, -0.11 + j * 0.035])
    for i in [0, 1, 2, 3, 4]
    for j in [0, 1, 2, 3, 4, 5]
    if std.abs(-0.095 + i * 0.05 + (j % 2) * 0.02) > 0.025
  ]
  + [
    sbox('tie-%d-%s' % [i, side], 'tie', [s * 0.004, 0.116, -0.1 + i * 0.05], [s * 0.035, 0.12, -0.094 + i * 0.05])
    for i in [0, 1, 2]
    for side in ['l', 'r']
    for s in [if side == 'l' then -1 else 1]
  ];

[
  // A suit of hardened steel plate laid out flat, 1200 mm from the neck to the ankle and 800 mm across: a breastplate
  // with a 4 mm wall, three fauld lames and a mail skirt, pauldrons, arm and leg harness with mail at the joints.
  h.compound('armor_ch_plate', 28, plateSuit({}), { plate: 'steel-hardened', ridge: 'steel-hardened', mail: 'steel-mail-dark', strap: 'leather-black', rivet: 'steel-bright', rust: 'rust-red' })
  + { voxelGrain: 0.006 },
  // The light suit: a 2 mm breastplate, two lames, smaller pauldrons.
  h.compound('armor_ch_lightplate', 15, plateSuit({ thick: 0.008, lames: 2, pauldron: 0.07 }), { plate: 'steel-hardened', ridge: 'steel-hardened', mail: 'steel-mail-dark', strap: 'leather-black', rivet: 'steel-bright', rust: 'rust-red' })
  + { voxelGrain: 0.006 },

  // The heavy suit: a 6 mm breastplate with a plackart riveted over its lower half, four lames, broad pauldrons.
  h.compound('armor_ch_heavyplate', 21, plateSuit({ thick: 0.016, lames: 4, plackart: true, pauldron: 0.1 }), { plate: 'steel-hardened', ridge: 'steel-hardened', mail: 'steel-mail-dark', strap: 'leather-black', rivet: 'steel-bright', rust: 'rust-red' })
  + { voxelGrain: 0.006 },

  // Old Gothic-style plate laid out flat, 1200 mm long: fluted breastplate and lames, rust patches and frayed straps.
  h.compound('armor_junk_lightplate', 20, plateSuit({ thick: 0.008, lames: 3, flutes: true, rust: true, pauldron: 0.08 }), { plate: 'iron-dull', ridge: 'steel-bright', mail: 'rust-red', strap: 'leather-tan', rivet: 'steel-bright', rust: 'rust-red' })
  + { voxelGrain: 0.006 },

  // Case-hardened sheet metal armour laid out flat, 1200 mm from neck to ankle: a shallow chest sheet with locker
  // louvres over a back sheet, hip sheets, and arm and leg guards bent from flat stock and strapped on.
  h.compound('armor_ch_metal_sheets', 25, sheetSuit({}), { sheet: 'steel-hardened', rivet: 'steel-bright', vent: 'screen-black', strap: 'leather-tan', mail: 'steel-mail-dark' })
  + { voxelGrain: 0.006 },

  // The same with a second chest sheet riveted over the first.
  h.compound('armor_ch_metal_sheets_heavy', 28, sheetSuit({ heavy: true }), { sheet: 'steel-hardened', rivet: 'steel-bright', vent: 'screen-black', strap: 'leather-tan', mail: 'steel-mail-dark' })
  + { voxelGrain: 0.006 },

  // Sheet metal armour joined with mail at the shoulders, elbows and knees, with a mail skirt.
  h.compound('armor_ch_metal_sheets_chain', 27, sheetSuit({ chain: true }), { sheet: 'steel-hardened', rivet: 'steel-bright', vent: 'screen-black', strap: 'leather-tan', mail: 'steel-mail-dark' })
  + { voxelGrain: 0.006 },

  // The mail-joined suit with the doubled chest sheet.
  h.compound('armor_ch_metal_sheets_chain_heavy', 30, sheetSuit({ heavy: true, chain: true }), { sheet: 'steel-hardened', rivet: 'steel-bright', vent: 'screen-black', strap: 'leather-tan', mail: 'steel-mail-dark' })
  + { voxelGrain: 0.006 },

  // Boiled leather armour laid out flat, 1200 mm from neck to ankle: a moulded cuirass, shoulder flaps, a strip skirt,
  // and laced arm, thigh and shin guards.
  h.compound('armor_blarmor', 6, leatherSuit(), { leather: 'leather-chestnut', edge: 'leather-oxblood', lace: 'leather-tan', strip: 'leather-chestnut' })
  + { voxelGrain: 0.006 },

  // Chitin armour laid out flat, 1000 mm from neck to ankle: a segmented shell cuirass and ringed leg guards.
  h.compound('armor_chitin', 4, chitinSuit(), { shell: 'chitin-brown', keel: 'chitin-brown', lace: 'skin-rawhide' })
  + { voxelGrain: 0.006 },

  // Fur body armour folded on a shelf, 300 mm by 280 mm and 120 mm tall.
  h.compound('armor_farmor', 3, furArmour(), { cloth: 'fur-brown', collar: 'fur-brown', sleeve: 'fur-brown', stitch: 'skin-rawhide', cuff: 'skin-rawhide', front: 'skin-rawhide', button: 'skin-rawhide', tuft: 'fur-brown', tie: 'skin-rawhide' })
  + { voxelGrain: 0.004 },
]
