local h = import '../compound.libsonnet';
local box = h.box;
local sbox(id, slot, a, b) = box(id, slot, [std.min(a[k], b[k]) for k in [0, 1, 2]], [std.max(a[k], b[k]) for k in [0, 1, 2]]);

// One glove lying back up, fingers towards +z, centred on cx. Side s is +1 for a left glove, whose thumb lies
// towards +x when the back is up, and -1 for a right glove. Options:
//   t      thickness of the hand;
//   w      width across the knuckles;
//   fl     finger length scale; 0 leaves open finger stubs, as on fingerless gloves;
//   fw     finger width;
//   cuff   distance from the wrist seam back to the cuff's open end;
//   flare  how much wider than the hand the cuff's open end is on each side;
//   ct     cuff thickness;
//   hem    depth of the band round the cuff's open end, 0 for none.
//   rise   how far that band stands above the cuff.
// Slots: hand, cuff, hem (the cuff band and the open ends of finger stubs).
local gloveDefaults = { t: 0.014, w: 0.088, fl: 1, fw: 0.019, cuff: 0.06, flare: 0.006, ct: 0.014, hem: 0.01, rise: 0.003 };
local fingerSpots(o) =
  local k = o.w / 0.088;
  [[0.027 * k, 0.07], [0.008 * k, 0.08], [-0.012 * k, 0.074], [-0.031 * k, 0.058]];
local fingerLength(o, base) = if o.fl == 0 then 0.018 else base * o.fl;
local glove(p, cx, s, opts={}) =
  local o = gloveDefaults + opts;
  local x(v) = cx + s * v;
  local hw = o.w / 2;
  local thumbLen = if o.fl == 0 then 0.45 else std.min(1, o.fl);
  [
    sbox(p + 'back', 'hand', [x(-hw), 0, -0.02], [x(hw), o.t, 0.09]),
    h.prism(p + 'cuff', 'cuff', 'y', [[-0.015 - o.cuff, x(-hw - o.flare)], [-0.015 - o.cuff, x(hw + o.flare)], [-0.015, x(hw - 0.002)], [-0.015, x(-hw + 0.002)]], 0, o.ct),
    // The thumb runs from the side of the palm forward and out.
    h.prism(p + 'thumb', 'hand', 'y', [[-0.012, x(hw - 0.008)], [0.03, x(hw)], [0.03 + 0.045 * thumbLen, x(hw + 0.028 * thumbLen)], [0.012 + 0.045 * thumbLen, x(hw + 0.05 * thumbLen)], [0.0, x(hw + 0.02)]], 0, o.t * 0.85),
  ]
  + (if o.hem > 0 then [sbox(p + 'cuff-hem', 'hem', [x(-hw - o.flare - 0.002), 0, -0.017 - o.cuff], [x(hw + o.flare + 0.002), o.ct + o.rise, -0.015 - o.cuff + o.hem])] else [])
  + [
    local fx = fingerSpots(o)[i][0], fl = fingerLength(o, fingerSpots(o)[i][1]);
    sbox(p + 'finger-%d' % i, 'hand', [x(fx - o.fw / 2), 0, 0.088], [x(fx + o.fw / 2), o.t * 0.9, 0.09 + fl])
    for i in std.range(0, 3)
  ]
  + (if o.fl == 0 then [
       local fx = fingerSpots(o)[i][0];
       sbox(p + 'stub-hem-%d' % i, 'hem', [x(fx - o.fw / 2 - 0.001), 0, 0.1], [x(fx + o.fw / 2 + 0.001), o.t * 0.9 + 0.002, 0.108])
       for i in std.range(0, 3)
     ] else []);

// A pair laid side by side, backs up, thumbs towards each other, with `extra(p, cx, s)` adding each glove's own details.
local pair(opts, gap=0.1, extra=function(p, cx, s) []) =
  glove('l-', -gap, 1, opts) + extra('l-', -gap, 1) + glove('r-', gap, -1, opts) + extra('r-', gap, -1);

// Raised seams running from the cuff up the back of the hand towards the three middle knuckles, as on dress gloves.
local points(slot, o) = function(p, cx, s) [
  local fx = fingerSpots(gloveDefaults + o)[i][0];
  sbox(p + 'point-%d' % i, slot, [cx + s * (fx - 0.002), (gloveDefaults + o).t, 0.0], [cx + s * (fx + 0.002), (gloveDefaults + o).t + 0.003, 0.07])
  for i in [0, 1, 2]
];

// A curved hooked claw on each fingertip and the thumb tip, fastened by a ring round the last finger joint.
local claws(o) = function(p, cx, s)
  local oo = gloveDefaults + o;
  local x(v) = cx + s * v;
  std.flattenArrays([
    local fx = fingerSpots(oo)[i][0], tip = 0.09 + fingerLength(oo, fingerSpots(oo)[i][1]);
    [
      sbox(p + 'ring-%d' % i, 'claw', [x(fx - oo.fw / 2 - 0.001), -0.001, tip - 0.022], [x(fx + oo.fw / 2 + 0.001), oo.t * 0.9 + 0.002, tip - 0.016]),
      // An x prism's outline is [y, z].
      h.prism(p + 'claw-%d' % i, 'claw', 'x', [[oo.t * 0.9 - 0.004, tip - 0.014], [oo.t * 0.9 + 0.003, tip - 0.014], [oo.t * 0.9 + 0.003, tip + 0.006], [0.001, tip + 0.03]], x(fx) - 0.003, x(fx) + 0.003),
    ]
    for i in std.range(0, 3)
  ]) + [
    local hw = oo.w / 2;
    h.prism(p + 'thumb-claw', 'claw', 'y', [[0.07, x(hw + 0.03)], [0.098, x(hw + 0.046)], [0.08, x(hw + 0.05)], [0.062, x(hw + 0.042)]], oo.t * 0.85 - 0.001, oo.t * 0.85 + 0.003),
  ];

// Ribs round a knitted cuff.
local ribs(o, n) = function(p, cx, s)
  local oo = gloveDefaults + o;
  local x(v) = cx + s * v;
  [
    sbox(p + 'rib-%d' % i, 'cuff', [x(-oo.w / 2 - oo.flare * (i + 0.5) / n + 0.001), oo.ct, -0.015 - oo.cuff * (i + 1) / n + 0.003], [x(oo.w / 2 + oo.flare * (i + 0.5) / n - 0.001), oo.ct + 0.002, -0.015 - oo.cuff * (i + 1) / n + 0.006])
    for i in std.range(0, n - 2)
  ];

// Steel slats riveted across the back of the hand and the knuckles of a fingerless glove.
local guards(o) = function(p, cx, s)
  local oo = gloveDefaults + o;
  local x(v) = cx + s * v;
  local hw = oo.w / 2;
  std.flattenArrays([
    [
      sbox(p + 'slat-%d' % i, 'guard', [x(-hw + 0.002), oo.t, z0], [x(hw - 0.002), oo.t + 0.004, z0 + 0.022]),
      sbox(p + 'rivet-%d-a' % i, 'rivet', [x(-hw + 0.006), oo.t + 0.004, z0 + 0.008], [x(-hw + 0.012), oo.t + 0.007, z0 + 0.014]),
      sbox(p + 'rivet-%d-b' % i, 'rivet', [x(hw - 0.012), oo.t + 0.004, z0 + 0.008], [x(hw - 0.006), oo.t + 0.007, z0 + 0.014]),
    ]
    for i in [0, 1, 2]
    for z0 in [[0.0, 0.03, 0.068][i]]
  ]);

// A strap across the back of the wrist closing on a hook-and-loop tab with a press stud, as on a golf glove.
local wristTab(o) = function(p, cx, s)
  local oo = gloveDefaults + o;
  local x(v) = cx + s * v;
  local hw = oo.w / 2;
  [
    h.prism(p + 'tab', 'tab', 'y', [[-0.03, x(-hw - 0.006)], [-0.03, x(hw * 0.4)], [-0.022, x(hw * 0.6)], [-0.002, x(hw * 0.6)], [0.006, x(hw * 0.4)], [0.006, x(-hw - 0.006)]], oo.t, oo.t + 0.004),
    sbox(p + 'stud', 'stud', [x(hw * 0.25), oo.t + 0.004, -0.018], [x(hw * 0.45), oo.t + 0.007, -0.006]),
  ];

// An overhand protector: a stiff padded shield shaped to the back of the hand and the closed fingers, its plates
// split by flex seams, held on by an elastic loop round the fingers and a wrist strap closing on hook-and-loop.
// Slots: pad, seam, strap, tab.
local overhand(p, cx, s) =
  local x(v) = cx + s * v;
  local outline = [[-0.03, x(-0.046)], [-0.03, x(0.05)], [0.04, x(0.058)], [0.12, x(0.05)], [0.17, x(0.035)], [0.182, x(0.0)], [0.175, x(-0.035)], [0.13, x(-0.05)], [0.05, x(-0.05)]];
  [
    h.prism(p + 'pad', 'pad', 'y', outline, 0, 0.022),
    // The thumb guard, a smaller pad off the thumb side.
    h.prism(p + 'thumb-pad', 'pad', 'y', [[-0.01, x(0.05)], [0.04, x(0.058)], [0.075, x(0.088)], [0.062, x(0.1)], [0.012, x(0.075)]], 0, 0.016),
  ] + [
    sbox(p + 'seam-%d' % i, 'seam', [x(-0.05), 0.022, z], [x(0.055), 0.025, z + 0.005])
    for i in [0, 1, 2]
    for z in [[0.035, 0.085, 0.13][i]]
  ] + [
    // Elastic finger loop and wrist strap, both standing proud past the pad's sides.
    sbox(p + 'finger-loop', 'strap', [x(-0.058), 0.022, 0.1], [x(0.06), 0.026, 0.118]),
    sbox(p + 'wrist-strap', 'strap', [x(-0.085), 0.022, -0.022], [x(0.062), 0.026, 0.004]),
    sbox(p + 'wrist-tab', 'tab', [x(-0.085), 0.026, -0.02], [x(-0.05), 0.029, 0.002]),
  ];

// Light cotton gloves: thin, with a short hemmed cuff.
local lightOpts = { t: 0.012, ct: 0.012, cuff: 0.04, flare: 0.004, hem: 0.008 };
// Leather dress gloves: a longer cuff and three raised points on the back.
local leatherOpts = { t: 0.012, ct: 0.012, cuff: 0.05, flare: 0.006, hem: 0.006 };
local golfOpts = { t: 0.01, ct: 0.01, cuff: 0.025, flare: 0.002, hem: 0.004 };
local fingerlessOpts = { t: 0.014, ct: 0.014, fl: 0, cuff: 0.03, flare: 0.002, hem: 0.006 };
local clawOpts = { t: 0.01, ct: 0.01, cuff: 0.07, flare: 0.004, hem: 0.004, fw: 0.017 };
local cutOpts = { t: 0.014, ct: 0.016, cuff: 0.06, flare: 0.004, hem: 0.006 };
local furOpts = { t: 0.026, w: 0.1, fw: 0.021, ct: 0.03, cuff: 0.11, flare: 0.03, hem: 0.03, rise: 0.012 };
local medicalOpts = { t: 0.006, ct: 0.006, w: 0.084, fw: 0.017, fl: 1.08, cuff: 0.09, flare: 0.006, hem: 0.006 };

[
  // A pair of plain cotton gloves laid flat side by side, backs up, each 210 mm from cuff to fingertip and 90 mm across
  // the knuckles, with a short hemmed cuff.
  h.compound('gloves_light', 0.081, pair(lightOpts), { hand: 'cloth-cream', cuff: 'cloth-cream', hem: 'cloth-cream' })
  + { voxelGrain: 0.004 },

  // A pair of thin black leather dress gloves laid flat, backs up, each 220 mm from cuff to fingertip, with three
  // raised points stitched down the back of the hand.
  h.compound('gloves_leather', 0.19, pair(leatherOpts, extra=points('stitch', leatherOpts)), { hand: 'leather-black', cuff: 'leather-black', hem: 'cloth-charcoal', stitch: 'cloth-charcoal' })
  + { voxelGrain: 0.004 },

  // A pair of thin black leather golfing gloves laid flat, backs up, each 190 mm from wrist to fingertip, with a short
  // wrist and a strap across the back of the wrist closing on a tab with a press stud.
  h.compound('gloves_golf', 0.15, pair(golfOpts, extra=wristTab(golfOpts)), { hand: 'leather-black', cuff: 'leather-black', hem: 'leather-black', tab: 'leather-white', stud: 'metal-silver' })
  + { voxelGrain: 0.004 },

  // A pair of brown leather fingerless gloves laid flat, backs up, each 160 mm long, the fingers cut off past the
  // first joint and hemmed.
  h.compound('gloves_fingerless', 0.16, pair(fingerlessOpts), { hand: 'leather-brown', cuff: 'leather-brown', hem: 'leather-black' })
  + { voxelGrain: 0.004 },

  // The same fingerless gloves with three steel slats riveted across the back of each hand, 160 mm long.
  h.compound('gloves_fingerless_mod', 0.52, pair(fingerlessOpts, extra=guards(fingerlessOpts)), { hand: 'leather-brown', cuff: 'leather-brown', hem: 'leather-black', guard: 'steel-grey', rivet: 'steel-bright' })
  + { voxelGrain: 0.004 },

  // A pair of glossy black vinyl gloves laid flat, backs up, each 250 mm from cuff to fingertip, with a hooked black
  // steel claw 30 mm long fixed by a ring to each fingertip and thumb.
  h.compound('gloves_claws', 0.15, pair(clawOpts, extra=claws(clawOpts)), { hand: 'leather-patent', cuff: 'leather-patent', hem: 'leather-patent', claw: 'steel-parkerized' })
  + { voxelGrain: 0.002 },

  // A pair of knitted aramid cut-resistant gloves laid flat, backs up, each 230 mm from cuff to fingertip, with a ribbed
  // knit cuff and an overlocked orange edge.
  h.compound('gloves_cut_resistant', 0.08, pair(cutOpts, extra=ribs(cutOpts, 4)), { hand: 'aramid-gold', cuff: 'aramid-gold', hem: 'cloth-orange' })
  + { voxelGrain: 0.004 },

  // A pair of olive overhand protectors laid flat side by side, outside up: padded shields 210 mm long and 110 mm wide
  // shaped to the back of the hand and closed fingers, with flex seams, an elastic finger loop and a wrist strap.
  h.compound('gloves_eod', 0.12, overhand('l-', -0.075, 1) + overhand('r-', 0.075, -1), { pad: 'nylon-ranger-green', seam: 'webbing-olive-dark', strap: 'webbing-black', tab: 'hook-loop-grey' })
  + { voxelGrain: 0.004 },

  // A pair of thick fur gloves laid flat, backs up, each 300 mm from the cuff to the fingertips and 100 mm across the
  // knuckles, with a wide flared gauntlet cuff and a deep fur ruff round its opening.
  h.compound('gloves_fur', 0.35, pair(furOpts, 0.115), { hand: 'fur-brown', cuff: 'fur-brown', hem: 'fur-brown' })
  + { voxelGrain: 0.004 },

  // A pair of thin latex examination gloves laid flat, backs up, each 260 mm from the rolled cuff to the fingertips.
  h.compound('gloves_medical', 0.012, pair(medicalOpts), { hand: 'plastic-frosted', cuff: 'plastic-frosted', hem: 'plastic-frosted' })
  + { voxelGrain: 0.002 },
]
