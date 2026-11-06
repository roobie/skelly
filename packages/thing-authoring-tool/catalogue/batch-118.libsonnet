local h = import '../compound.libsonnet';
local box = h.box;
// A box from two opposite corners given in any order, for pieces mirrored across x.
local sbox(id, slot, a, b) = box(id, slot, [std.min(a[k], b[k]) for k in [0, 1, 2]], [std.max(a[k], b[k]) for k in [0, 1, 2]]);

local sgnPow(v, e) = (if v < 0 then -1 else 1) * std.pow(std.abs(v), e);
// Points of a superellipse `a` by `b` round [cx, cy], exponent p (2 an ellipse, higher squarer). With `half`, only
// the lower half from the left end to the right end, so the shape closes with a flat top: half-moons and D segments.
local outline(a, b, p, n, half=false, cx=0, cy=0) =
  if half then [
    local t = std.pi + std.pi * i / n;
    [cx + a * sgnPow(std.cos(t), 2 / p), cy + b * sgnPow(std.sin(t), 2 / p)]
    for i in std.range(0, n)
  ] else [
    local t = 2 * std.pi * i / n;
    [cx + a * sgnPow(std.cos(t), 2 / p), cy + b * sgnPow(std.sin(t), 2 / p)]
    for i in std.range(0, n - 1)
  ];

// A spectacle front standing on its lower rims, front face on +z at z = depth, with both temples folded flat
// behind it as a pair of glasses lies in a drawer. Slots: frame, lens, temple, pad, segment (bifocal reading
// segment, when `bifocal`), shield (side shields, when `shields`).
local spectacles(o) =
  local c = {
    a: 0.025, b: 0.018, p: 2.6, rim: 0.004, gap: 0.018, depth: 0.004, n: 28, half: false,
    templeLen: 0.13, templeW: 0.004, templeH: 0.004, pads: false, bifocal: false, brow: false, shields: false, tipDrop: 0.012,
  } + o;
  local a = c.a, b = c.b, rim = c.rim, d = c.depth;
  local ly = b + rim;
  local cx = c.gap / 2 + a + rim;
  local outer = cx + a + rim;
  local hy = if c.half then ly - c.templeH - 0.002 else ly + 0.25 * b;
  local lensOf(s) = outline(a, b, c.p, c.n, c.half, s * cx, ly);
  local rimOf(s) = outline(a + rim, b + rim, c.p, c.n, c.half, s * cx, ly);
  local segs = if c.half then c.n else c.n;
  local eye(side, s) =
    local inn = lensOf(s), out = rimOf(s), m = std.length(inn);
    [h.prism('lens-' + side, 'lens', 'z', inn, d / 2 - 0.001, d / 2 + 0.001)]
    + [
      h.prism('rim-%s-%d' % [side, i], 'frame', 'z', [out[i], out[(i + 1) % m], inn[(i + 1) % m], inn[i]], 0, d)
      for i in std.range(0, (if c.half then m - 2 else m - 1))
    ]
    + (if c.half then [sbox('top-' + side, 'frame', [s * (cx - a - rim), ly, 0], [s * (cx + a + rim), ly + rim, d])] else [])
    + (if c.bifocal then [h.prism('segment-' + side, 'segment', 'z', outline(0.012, 0.008, 2, 12, true, s * (cx - 0.003), ly - 0.3 * b), d / 2 + 0.001, d / 2 + 0.003)] else []);
  local tY0 = hy, tY1 = hy + c.templeH;
  // One temple folded across the back: hinged at side s, running towards the other side, its ear end hooked down.
  local temple(side, s, z0) =
    local z1 = z0 - c.templeW, x0 = s * (outer + 0.002), x1 = x0 - s * c.templeLen;
    [
      sbox('hinge-' + side, 'frame', [s * (outer - 0.003), tY0 - 0.002, z1], [s * (outer + 0.004), tY1 + 0.002, d]),
      sbox('temple-' + side, 'temple', [x0, tY0, z0], [x1 + s * 0.02, tY1, z1]),
      h.prism('tip-' + side, 'temple', 'z', [[x1 + s * 0.022, tY1], [x1 + s * 0.016, tY1], [x1, tY0 - c.tipDrop], [x1 + s * 0.006, tY0 - c.tipDrop]], z1, z0),
    ]
    + (if c.shields then [sbox('shield-' + side, 'shield', [s * (outer + 0.001), ly - 0.6 * b, z1 - 0.002], [s * (outer + 0.003), ly + 0.8 * b, 0])] else []);
  eye('l', -1) + eye('r', 1)
  + (if c.half then [] else [sbox('bridge', 'frame', [-(c.gap / 2 + 0.001), ly + 0.3 * b, 0], [c.gap / 2 + 0.001, ly + 0.3 * b + 0.004, d])])
  + (if c.brow then [sbox('brow', 'frame', [-outer, ly + 0.7 * b, 0], [outer, ly + b + rim, d + 0.002])] else [])
  + (if c.pads then [
       sbox('pad-' + side, 'pad', [s * (c.gap / 2 - 0.001), ly - 0.35 * b, -0.006], [s * (c.gap / 2 + 0.004), ly + 0.1 * b, 0])
       for side in ['l', 'r']
       for s in [if side == 'l' then -1 else 1]
     ] else [])
  + temple('r', 1, -0.004)
  + temple('l', -1, -0.004 - c.templeW - 0.002);

// A band curved round a centre [0, cz] at radius r, thick t, from angle a0 to a1 (0 points to +z), in segments whose
// bottom and top heights `y0(ang)` and `y1(ang)` follow the angle at each segment's middle: wrap lenses, goggle
// frames, straps.
local wrapBand(prefix, slot, r, t, a0, a1, steps, cz, y0, y1) = std.flattenArrays([
  local ang = a0 + (a1 - a0) * (i + 0.5) / steps;
  h.crescent('%s-%d' % [prefix, i], slot, r - t, r, a0 + (a1 - a0) * i / steps, a0 + (a1 - a0) * (i + 1) / steps, 1, y0(ang), y1(ang), 0, cz)
  for i in std.range(0, steps - 1)
]);
local sq(v) = v * v;

// A one-piece wrap lens round the face with a brow bar along its top and temples folded behind. The lens
// dips at the sides and rises over the nose. Slots: lens, frame, temple.
local wrapLens(R, span, ht, open=false, templeLen=0.125) =
  local cz = -R;
  local lo(ang) = if std.abs(ang) < 9 then 0.016 else 0.004 + 0.008 * sq(ang / span);
  local hi(ang) = ht - 0.01 * sq(ang / span);
  local ex = R * std.sin(span * std.pi / 180), ez = cz + R * std.cos(span * std.pi / 180);
  wrapBand('lens', 'lens', R, 0.002, -span, span, 24, cz, lo, hi)
  + wrapBand('brow', 'frame', R + 0.001, 0.005, -span - 2, span + 2, 24, cz, hi, function(ang) hi(ang) + 0.006)
  + wrapBand('nose', 'frame', R - 0.001, 0.004, -9, 9, 4, cz, function(ang) 0.012, function(ang) 0.016)
  + std.flattenArrays([
    local s = if side == 'l' then -1 else 1;
    [sbox('hinge-' + side, 'frame', [s * (ex - 0.004), ht - 0.014, ez - 0.012], [s * (ex + 0.002), ht + 0.004, ez + 0.004])]
    + (if open then [
         sbox('temple-' + side, 'temple', [s * ex, ht - 0.01, ez - templeLen], [s * (ex - 0.006), ht - 0.002, ez - 0.012]),
       ] else [
         sbox('temple-' + side, 'temple', [s * ex, ht - 0.01, ez - 0.012 - (if side == 'r' then 0 else 0.008)], [s * (ex - templeLen), ht - 0.002, ez - 0.018 - (if side == 'r' then 0 else 0.008)]),
       ])
    for side in ['l', 'r']
  ]);

// A pair of round goggle cups joined by a short bridge, lenses on +z, with the headstrap hanging in a loop behind.
// Slots: cup, rim, lens, bridge, strap.
local cupGoggles(rIn, rOut, depth, gap, strapW, vents=false) =
  local cx = gap / 2 + rOut + 0.003, y = rOut + 0.003;
  std.flattenArrays([
    local s = if side == 'l' then -1 else 1;
    [
      h.turned('cup-' + side, 'cup', 'z', [[0, rOut - 0.003], [0, rOut + 0.003], [depth - 0.004, rOut], [depth - 0.004, rIn], [0, rIn - 0.003], [0, rOut - 0.003]], [s * cx, y, -depth]),
      h.turned('rim-' + side, 'rim', 'z', [[0, rIn - 0.002], [0, rOut + 0.002], [0.006, rOut + 0.002], [0.006, rIn - 0.002], [0, rIn - 0.002]], [s * cx, y, -0.006]),
      h.turned('lens-' + side, 'lens', 'z', [[0, 0], [0, rIn], [0.002, rIn], [0.002, 0]], [s * cx, y, -0.004]),
      sbox('lug-' + side, 'rim', [s * (cx + rOut - 0.002), y - strapW / 2, -depth + 0.002], [s * (cx + rOut + 0.006), y + strapW / 2, -depth + 0.012]),
    ]
    + (if vents then [
         sbox('vent-%s-%d' % [side, k], 'rim', [s * cx - 0.004, y + (k * 2 - 1) * (rOut + 0.001), -depth + 0.006], [s * cx + 0.004, y + (k * 2 - 1) * (rOut + 0.001) + 0.002, -depth + 0.012])
         for k in [0, 1]
       ] else [])
    for side in ['l', 'r']
  ])
  + [sbox('bridge', 'bridge', [-(cx - rOut + 0.002), y - 0.003, -0.012], [cx - rOut + 0.002, y + 0.003, -0.006])]
  + wrapBand('strap', 'strap', cx + rOut + 0.006, 0.003, 90, 270, 18, -depth + 0.006, function(ang) y - strapW / 2, function(ang) y + strapW / 2);

[
  // Cardboard eclipse viewers folded flat, 150 mm across and 45 mm tall: a printed card front with two square
  // silvered filter windows and a nose notch, the two card temples folded flat behind it.
  h.compound('eclipse_glasses', 0.01, [
    box('band-top', 'card', [-0.075, 0.036, 0], [0.075, 0.046, 0.002]),
    box('band-low-l', 'card', [-0.075, 0, 0], [-0.012, 0.008, 0.002]),
    box('band-low-r', 'card', [0.012, 0, 0], [0.075, 0.008, 0.002]),
    box('end-l', 'card', [-0.075, 0.008, 0], [-0.052, 0.036, 0.002]),
    box('end-r', 'card', [0.052, 0.008, 0], [0.075, 0.036, 0.002]),
    box('bridge', 'card', [-0.012, 0.016, 0], [0.012, 0.036, 0.002]),
    box('filter-l', 'filter', [-0.052, 0.008, 0], [-0.012, 0.036, 0.002]),
    box('filter-r', 'filter', [0.012, 0.008, 0], [0.052, 0.036, 0.002]),
    box('print-top', 'print', [-0.07, 0.038, 0.002], [0.07, 0.044, 0.004]),
    box('print-l', 'print', [-0.072, 0.004, 0.002], [-0.056, 0.032, 0.004]),
    box('print-r', 'print', [0.056, 0.004, 0.002], [0.072, 0.032, 0.004]),
    box('temple-r', 'card', [-0.06, 0.026, -0.002], [0.075, 0.038, 0]),
    box('temple-l', 'card', [-0.075, 0.012, -0.004], [0.06, 0.024, -0.002]),
  ], { card: 'paper-white', filter: 'mirror-silver', print: 'plastic-orange' })
  + { voxelGrain: 0.002 },

  // A black leather eyepatch lying flat, 60 mm by 50 mm, cupped a little, on a 0.4 m loop of thin cord tied
  // through its upper corners.
  h.compound('eyepatch_leather', 0.005,
             [
               h.prism('patch', 'leather', 'y', [[q[1], q[0]] for q in outline(0.03, 0.025, 2.2, 28)], 0, 0.002),
               h.prism('cup', 'leather', 'y', [[q[1], q[0]] for q in outline(0.024, 0.019, 2.2, 24, false, 0, 0.002)], 0.002, 0.004),
               box('stitch-l', 'cord', [-0.03, 0.002, -0.018], [-0.024, 0.004, -0.012]),
               box('stitch-r', 'cord', [0.024, 0.002, -0.018], [0.03, 0.004, -0.012]),
             ]
             + h.strapLoop('cord', 'cord', 0.06, 0.04, 0.002, 0.002, 0.002, 0, -0.056, 12),
             { leather: 'leather-black', cord: 'cloth-black' })
  + { voxelGrain: 0.002 },

  // Large fit-over sunglasses with the temples folded, 168 mm across and 52 mm tall: a squared black plastic frame
  // deep enough to go over prescription glasses, dark lenses and tinted side shields at each hinge.
  h.compound('fitover_sunglasses', 0.062, spectacles({ a: 0.031, b: 0.021, p: 4, rim: 0.005, gap: 0.016, depth: 0.006, templeW: 0.006, templeH: 0.006, templeLen: 0.14, brow: true, shields: true }),
             { frame: 'plastic-black', temple: 'plastic-black', lens: 'glass-lens-amber', shield: 'glass-lens-amber' })
  + { voxelGrain: 0.002 },

  // Old-fashioned glass goggles, 136 mm across: two round leather cups 50 mm across with brass rims and thick
  // clear glass, a short brass bridge and a leather headstrap hanging in a loop behind.
  h.compound('glass_goggles', 0.14, cupGoggles(0.019, 0.025, 0.03, 0.016, 0.016),
             { cup: 'leather-brown', rim: 'brass-polished', lens: 'glass-clear', bridge: 'brass-polished', strap: 'leather-brown' })
  + { voxelGrain: 0.002 },

  // Ballistic glasses 148 mm across with the temples open: one smoke-tinted wrap lens under a black brow bar, a
  // nose bridge, and a black elastic retaining strap joining the temple ends in a loop behind.
  h.compound('glasses_bal', 0.04,
             wrapLens(0.085, 58, 0.044, true, 0.12)
             + wrapBand('strap', 'strap', 0.074, 0.003, 90, 270, 18, -0.085 + 0.085 * std.cos(58 * std.pi / 180) - 0.12, function(ang) 0.036, function(ang) 0.044),
             { lens: 'screen-black', frame: 'plastic-matte-black', temple: 'plastic-matte-black', strap: 'webbing-black' })
  + { voxelGrain: 0.002 },

  // Bifocal glasses with the temples folded, 144 mm across: dark red-brown plastic rims round oval lenses, each
  // with a D-shaped reading segment set in its lower half, and nose pads behind the bridge.
  h.compound('glasses_bifocal', 0.025, spectacles({ a: 0.025, b: 0.018, p: 2.4, rim: 0.004, pads: true, bifocal: true }),
             { frame: 'paint-oxblood', temple: 'paint-oxblood', lens: 'glass-clear', segment: 'plastic-clear', pad: 'plastic-clear' })
  + { voxelGrain: 0.002 },

  // Everyday prescription glasses with the temples folded, 140 mm across and 40 mm tall: matte black rectangular
  // plastic rims round clear lenses.
  h.compound('glasses_eye', 0.024, spectacles({ a: 0.025, b: 0.016, p: 3, rim: 0.004 }),
             { frame: 'plastic-matte-black', temple: 'plastic-matte-black', lens: 'glass-clear' })
  + { voxelGrain: 0.002 },

  // A monocle lying flat: a round lens 32 mm across in a black rim with a small eye on one side, and a thin black
  // cord curled beside it.
  h.compound('glasses_monocle', 0.008,
             [h.disc('lens', 'lens', 0.016, 0, 0.002)]
             + h.crescent('rim', 'rim', 0.016, 0.019, 0, 360, 28, 0, 0.004)
             + h.crescent('eye', 'rim', 0.0025, 0.0045, 0, 360, 8, 0, 0.003, 0.0225, 0)
             + h.crescent('cord', 'cord', 0.039, 0.041, 270, 560, 30, 0, 0.002, 0.0645, 0)
             + h.crescent('tail', 'cord', 0.019, 0.021, 20, 200, 12, 0, 0.002, 0.08, 0.06),
             { lens: 'glass-clear', rim: 'plastic-black', cord: 'cloth-black' })
  + { voxelGrain: 0.002 },

  // Half-moon reading glasses with the temples folded, 138 mm across and 20 mm tall: blue plastic rims round
  // lenses with flat tops, so the wearer can look over them, and nose pads behind the bridge.
  h.compound('glasses_reading', 0.018, spectacles({ a: 0.024, b: 0.012, p: 2.2, rim: 0.004, half: true, pads: true, templeH: 0.003, tipDrop: 0.006 }),
             { frame: 'plastic-blue', temple: 'plastic-blue', lens: 'glass-clear', pad: 'plastic-clear' })
  + { voxelGrain: 0.002 },

  // Safety glasses with the temples folded, 148 mm across: one clear plastic wrap lens under a blue brow bar
  // and blue temples.
  h.compound('glasses_safety', 0.027, wrapLens(0.085, 58, 0.044),
             { lens: 'plastic-clear', frame: 'plastic-blue', temple: 'plastic-blue' })
  + { voxelGrain: 0.002 },

  // Ski goggles 172 mm across and 90 mm tall: a broad curved amber-mirrored lens in a white frame with a dark
  // foam lining behind, and a wide black strap in a loop behind.
  h.compound('goggles_ski', 0.12,
             local R = 0.11, span = 52, cz = -0.11;
             local lo(ang) = if std.abs(ang) < 10 then 0.03 else 0.012 + 0.012 * sq(ang / span);
             local hi(ang) = 0.086 - 0.012 * sq(ang / span);
             local ex = R * std.sin(span * std.pi / 180), ez = cz + R * std.cos(span * std.pi / 180);
             wrapBand('lens', 'lens', R, 0.003, -span + 3, span - 3, 26, cz, lo, hi)
             + wrapBand('frame-low', 'frame', R - 0.002, 0.008, -span, span, 26, cz, function(ang) lo(ang) - 0.008, lo)
             + wrapBand('frame-top', 'frame', R - 0.002, 0.008, -span, span, 26, cz, hi, function(ang) hi(ang) + 0.008)
             + wrapBand('frame-l', 'frame', R - 0.002, 0.008, -span, -span + 3, 1, cz, lo, hi)
             + wrapBand('frame-r', 'frame', R - 0.002, 0.008, span - 3, span, 1, cz, lo, hi)
             + wrapBand('foam', 'foam', R - 0.01, 0.012, -span + 1, span - 1, 26, cz, function(ang) lo(ang) - 0.006, function(ang) hi(ang) + 0.006)
             + wrapBand('strap', 'strap', ex, 0.003, 90, 270, 20, ez, function(ang) 0.03, function(ang) 0.07),
             { lens: 'glass-lens-amber', frame: 'plastic-white', foam: 'plastic-charcoal', strap: 'webbing-black' })
  + { voxelGrain: 0.002 },

  // Welding goggles 140 mm across: two round black cups 54 mm across with dark green filter glass in steel rims, vents on the
  // cups, a short bridge and a black elastic strap in a loop behind.
  h.compound('goggles_welding', 0.18, cupGoggles(0.02, 0.027, 0.032, 0.014, 0.018, true),
             { cup: 'plastic-black', rim: 'steel-grey', lens: 'glass-lens-green', bridge: 'steel-grey', strap: 'webbing-black' })
  + { voxelGrain: 0.002 },

  // Carved bone snow goggles 156 mm across: a band curved to the face with a narrow slit before each eye, a notch
  // over the nose, and a rawhide tie looping round behind.
  h.compound('iggaak', 0.04,
             local R = 0.085, span = 62, cz = -0.085;
             local lo(ang) = if std.abs(ang) < 10 then 0.01 else 0.002 + 0.004 * sq(ang / span);
             local hi(ang) = 0.036 - 0.006 * sq(ang / span);
             local slit(ang) = std.abs(ang) >= 12 && std.abs(ang) <= 46;
             local ex = R * std.sin(span * std.pi / 180), ez = cz + R * std.cos(span * std.pi / 180);
             std.flattenArrays([
               local a0 = -span + 2 * span * i / 31, a1 = -span + 2 * span * (i + 1) / 31, ang = (a0 + a1) / 2;
               if slit(ang) then
                 h.crescent('low-%d' % i, 'bone', R - 0.005, R, a0, a1, 1, lo(ang), 0.014, 0, cz)
                 + h.crescent('high-%d' % i, 'bone', R - 0.005, R, a0, a1, 1, 0.021, hi(ang), 0, cz)
                 + h.crescent('soot-%d' % i, 'soot', R - 0.007, R - 0.005, a0, a1, 1, lo(ang) + 0.004, hi(ang) - 0.004, 0, cz)
               else
                 h.crescent('band-%d' % i, 'bone', R - 0.005, R, a0, a1, 1, lo(ang), hi(ang), 0, cz)
               for i in std.range(0, 30)
             ])
             + wrapBand('tie', 'tie', ex, 0.002, 90, 270, 20, ez, function(ang) 0.016, function(ang) 0.02)
             + [
               sbox('knot-' + side, 'tie', [s * (ex - 0.004), 0.013, ez - 0.004], [s * (ex + 0.002), 0.023, ez + 0.004])
               for side in ['l', 'r']
               for s in [if side == 'l' then -1 else 1]
             ],
             { bone: 'wax-ivory', soot: 'screen-black', tie: 'skin-rawhide' })
  + { voxelGrain: 0.002 },

  // Classic sunglasses with the temples folded, 148 mm across and 48 mm tall: a thick black plastic frame with a
  // heavy brow over dark lenses.
  h.compound('sunglasses', 0.034, spectacles({ a: 0.026, b: 0.019, p: 3.2, rim: 0.005, gap: 0.016, depth: 0.006, templeW: 0.005, templeH: 0.005, brow: true }),
             { frame: 'plastic-black', temple: 'plastic-black', lens: 'screen-black' })
  + { voxelGrain: 0.002 },

  // Bifocal sunglasses with the temples folded, 144 mm across: brown-red plastic rims round amber-tinted lenses,
  // each with a paler D-shaped reading segment in its lower half.
  h.compound('sunglasses_bifocal', 0.026, spectacles({ a: 0.025, b: 0.018, p: 2.8, rim: 0.004, pads: true, bifocal: true }),
             { frame: 'paint-oxblood', temple: 'paint-oxblood', lens: 'glass-lens-amber', segment: 'plastic-clear', pad: 'plastic-clear' })
  + { voxelGrain: 0.002 },
]
