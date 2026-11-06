local h = import '../compound.libsonnet';
local box = h.box;

// Hoods standing upright as on a shelf, face opening on +z. Every hood but the bee veil has a head turned about y from
// a [y, radius] profile that starts at the neck, and a mantle below it that slumps onto the shelf: wider across the
// shoulders than front to back, its hem lower at the front and back than at the sides and wavering, and its cloth
// falling in soft folds that deepen towards the hem, so it reads as a draped hood rather than a turned bell. The face
// opening is drawn as dark strips standing just proud of the head and bound by a rim (after batch 120's coif).

local rad(d) = d * std.pi / 180;
local sq(v) = v * v;

// The profile's radius at height y, read between its points.
local rAt(prof, y) =
  local segs = [[prof[i], prof[i + 1]] for i in std.range(0, std.length(prof) - 2) if prof[i][0] < prof[i + 1][0] && prof[i][0] <= y && y <= prof[i + 1][0]];
  if std.length(segs) == 0 then 0 else
    local a = segs[0][0], b = segs[0][1];
    a[1] + (b[1] - a[1]) * (y - a[0]) / (b[0] - a[0]);

// Evenly spaced positions from a to b, n of them, ends included.
local spread(a, b, n) = [a + (b - a) * i / (n - 1) for i in std.range(0, n - 1)];

// The mantle's shape. `side` and `fb` are how far it spreads past the neck at the sides and at the front and back;
// `hemSide` is how high the side hem rides above the front point, `back` how much higher the back point rides than
// the front; `folds` and `fold` are the number and depth of the folds; `wob` wavers the hem.
local mantleDefaults = { side: 0.06, fb: 0.04, hemSide: 0.04, back: 0.012, folds: 7, fold: 0.01, wob: 0.006, t: 0.01, steps: 48, bands: 10 };
// The hem's raw height at angle a (degrees, 0 at +z), before it is lowered to stand on the shelf.
local hemRaw(m, a) = m.hemSide * sq(std.sin(rad(a))) + m.back * std.max(0, -std.cos(rad(a))) + m.wob * std.sin(rad(3 * a + 40)) + 0.5 * m.wob * std.sin(rad(7 * a + 10));
local hemLow(m) = std.minArray([hemRaw(m, 360 * i / m.steps) for i in std.range(0, m.steps - 1)]);
local hemAt(m, a) = hemRaw(m, a) - m.low;

// The hood's outer radius at height y and angle a: the turned head above the neck, the draped mantle below it.
local surf(prof, m, y, a) =
  local yN = prof[0][0], rN = prof[1][1];
  if y >= yN then rAt(prof, y) else
    local d = std.min(1, std.max(0, (yN - y) / (yN - hemAt(m, a))));
    // The spread grows with the drop below the neck, so the short sides slope off like shoulders rather than jut.
    local f = std.pow(std.min(1, (yN - y) / yN), 0.7);
    local rx = rN + m.side * f, rz = rN + m.fb * f;
    1 / std.sqrt(sq(std.sin(rad(a)) / rx) + sq(std.cos(rad(a)) / rz))
    + m.fold * d * (0.6 + 0.4 * std.sin(rad(2 * a + 25))) * std.sin(rad(m.folds * a + 15));

// A band of quads round the hood at angle steps, each from y0(a) to y1(a), its outer face `out` past the surface and
// `t` thick (or reaching in to radius `inner` if that is deeper), skipped where `keep(a)` is false. For the mantle and
// the rows laid over it.
local ringBand(prefix, slot, prof, m, y0, y1, out, t, keep, inner=null) = [
  local rin(ro) = if inner == null then ro - t else std.min(ro - t, inner);
  local a0 = 360 * i / m.steps, a1 = 360 * (i + 1) / m.steps, am = (a0 + a1) / 2;
  local ya = y0(am), yb = y1(am), ym = (ya + yb) / 2;
  local pt(r, a) = [r * std.cos(rad(a)), r * std.sin(rad(a))];
  local ro0 = surf(prof, m, ym, a0) + out, ro1 = surf(prof, m, ym, a1) + out;
  h.prism('%s-%d' % [prefix, i], slot, 'y', [pt(ro0, a0), pt(ro1, a1), pt(rin(ro1), a1), pt(rin(ro0), a0)], ya, yb)
  for i in std.range(0, m.steps - 1)
  for am in [360 * (i + 0.5) / m.steps]
  if keep(am) && y1(am) - y0(am) > 0.002
];

// A hood with head profile `o.prof` (starting [neck y, 0], [neck y, neck radius]) and mantle `o.mantle`. Its face
// opening is centred at height face.y, face.w across half and face.hh tall half. Raised rows go round it at each
// height in `o.rows`, broken at the front where they cross the face; `o.rowSlots` cycles their slots, and with
// `o.dashed` each row is broken into short links staggered against the next, so mail shows its rings. `o.extras(surf)` adds pieces placed on the surface, surf(y, a) giving its
// radius. `s` names the slots.
local hood(id, mass, o) =
  local c = { rows: [], rowSlots: null, dashed: false, extras: function(sf) [], s: { body: 'cloth', rows: 'stitch', trim: 'trim', face: 'face' }, rowW: 0.006 } + o;
  local prof = c.prof, face = c.face, s = c.s, m0 = mantleDefaults + std.get(c, 'mantle', {}), m = m0 + { low: hemLow(m0) };
  local yN = prof[0][0];
  local sf(y, a) = surf(prof, m, y, a);
  local R = rAt(prof, face.y);
  local sw = 0.012;
  local n = std.floor(2 * (face.w - sw / 2) / sw);
  local fh(x) = face.hh * std.sqrt(std.max(0.1, 1 - std.pow(std.abs(x) / face.w, 2)));
  local xin(x0) = if x0 < 0 && x0 + sw > 0 then 0 else std.min(std.abs(x0), std.abs(x0 + sw));
  local rowSlot(i) = if c.rowSlots == null then s.rows else c.rowSlots[i % std.length(c.rowSlots)];
  local faceSpan = std.asin(std.min(1, (face.w + 0.016) / R)) * 180 / std.pi;
  h.compound(id, mass, [
    h.turned('hood', s.body, 'y', prof),
  ] + std.flattenArrays([
    ringBand('mantle-%d' % j, s.body, prof, m, function(a) hemAt(m, a) + (yN - hemAt(m, a)) * j / m.bands, function(a) hemAt(m, a) + (yN - hemAt(m, a)) * (j + 1) / m.bands + 0.004, 0, m.t, function(a) true, if j >= m.bands - 3 then prof[1][1] - 0.006 else null)
    for j in std.range(0, m.bands - 1)
  ])
  + [
    h.prism('face-%d' % i, s.face, 'z', [[x0, face.y - fh(xo)], [x0 + sw, face.y - fh(xo)], [x0 + sw, face.y + fh(xo)], [x0, face.y + fh(xo)]], 0.02, std.sqrt(R * R - xin(x0) * xin(x0)) + 0.002)
    for i in std.range(0, n - 1)
    for x0 in [-n * sw / 2 + i * sw]
    for xo in [std.max(std.abs(x0), std.abs(x0 + sw))]
  ] + [
    box('rim-side-%d' % i, s.trim, [x - 0.006, face.y - fh(x) - 0.01, 0.02], [x + 0.006, face.y + fh(x) + 0.01, std.sqrt(R * R - std.pow(std.abs(x) - 0.006, 2)) + 0.006])
    for i in std.range(0, 1)
    for x in [[-n * sw / 2 - 0.006, n * sw / 2 + 0.006][i]]
  ] + [
    box('rim-%s-%d' % [e, i], s.trim, [x0, face.y + sgn * fh(x0 + sw / 2) - 0.007, 0.02], [x0 + sw, face.y + sgn * fh(x0 + sw / 2) + 0.007, std.sqrt(R * R - xin(x0) * xin(x0)) + 0.006])
    for e in ['top', 'bottom']
    for sgn in [if e == 'top' then 1 else -1]
    for i in std.range(0, n - 1)
    for x0 in [-n * sw / 2 + i * sw]
  ] + std.flattenArrays([
    local y = c.rows[i];
    local cut = std.abs(y + c.rowW / 2 - face.y) < face.hh + 0.016;
    if y >= yN then
      local a0 = if cut then faceSpan else 0, a1 = if cut then 360 - faceSpan else 360;
      local steps = if c.dashed then 2 * std.round((a1 - a0) / 7.5 / 2) else 24;
      local ring = h.crescent('row-%d' % i, rowSlot(i), rAt(prof, y) - 0.006, rAt(prof, y) + 0.003, a0, a1, steps, y, y + c.rowW);
      if c.dashed then [ring[k] for k in std.range(0, steps - 1) if (k + i) % 2 == 0] else ring
    else
      ringBand('row-%d' % i, rowSlot(i), prof, m, function(a) y, function(a) y + c.rowW, 0.003, 0.009, function(a) y > hemAt(m, a) + 0.003 && !(cut && (a < faceSpan || a > 360 - faceSpan)) && (!c.dashed || (std.floor(a * m.steps / 360) + i) % 2 == 0))
    for i in std.range(0, std.length(c.rows) - 1)
  ]) + c.extras(sf), c.fin)
  + { voxelGrain: 0.004 };

// A seam ridge running up the back of the hood (a = 180) and over the crown to y1, on slot `slot`.
local backSeam(sf, y0, y1, slot) =
  local ys = spread(y0, y1, 14);
  [
    box('seam-%d' % i, slot, [-0.004, ys[i], -std.max(sf(ys[i], 180), sf(ys[i + 1], 180)) - 0.004], [0.004, ys[i + 1] + 0.004, -std.min(sf(ys[i], 180), sf(ys[i + 1], 180)) + 0.002])
    for i in std.range(0, 12)
  ];

// A drawstring's two ends at the chin corners of the face opening: a toggle or knot sitting on the hood beside each
// lower corner, at height y and half-spacing x, so nothing hangs loose below the opening.
local drawstring(sf, y, x, slot, end, endSlot) = std.flattenArrays([
  local z = sf(y, 0) - 0.002;
  [
    box('cord-' + s, slot, [sx * x - 0.004, y - 0.002, z - 0.004], [sx * x + 0.004, y + 0.008, z + 0.006]),
    box('cord-end-' + s, endSlot, [sx * x - end, y - 2 * end, z - end + 0.004], [sx * x + end, y, z + end + 0.004]),
  ]
  for s in ['l', 'r']
  for sx in [if s == 'l' then -1 else 1]
]);

// Coif: a close hood whose mail mantle slumps onto the shoulders.
local coifProfile = [[0.115, 0], [0.115, 0.098], [0.2, 0.1], [0.245, 0.093], [0.28, 0.07], [0.302, 0.035], [0.308, 0]];
// Snug hood ending at the neck.
local snugProfile = [[0.07, 0], [0.07, 0.098], [0.09, 0.094], [0.2, 0.1], [0.245, 0.093], [0.28, 0.07], [0.302, 0.035], [0.308, 0]];
// Close hood with a long bib over the chest and back.
local bibProfile = [[0.1, 0], [0.1, 0.1], [0.2, 0.1], [0.245, 0.093], [0.28, 0.07], [0.302, 0.035], [0.308, 0]];
// Loose hood with room for a hat or a hairdo under it.
local looseProfile = [[0.09, 0], [0.09, 0.122], [0.11, 0.118], [0.2, 0.122], [0.25, 0.112], [0.29, 0.085], [0.315, 0.045], [0.322, 0]];

local looseFace = { y: 0.18, w: 0.084, hh: 0.075 };
local looseMantle = { side: 0.08, fb: 0.05, hemSide: 0.05, back: 0.015, folds: 6, fold: 0.014 };

local mailCoif(id, mass) = hood(id, mass, {
  prof: coifProfile,
  face: { y: 0.185, w: 0.066, hh: 0.06 },
  mantle: { side: 0.09, fb: 0.06, hemSide: 0.075, back: 0.02, folds: 5, fold: 0.014 },
  rows: spread(0.006, 0.292, 23),
  rowSlots: ['rings'],
  dashed: true,
  rowW: 0.007,
  s: { body: 'mail', rows: 'mail', trim: 'mail', face: 'face' },
  fin: { mail: 'steel-mail', rings: 'steel-mail-dark', face: 'cloth-black' },
});

[
  // A mild steel mail coif standing upright, 330 mm across the shoulder curtain and 310 mm tall: a close hood of
  // riveted rings over the crown, its mail mantle slumped onto the shoulders, with a face opening at +z. Rings show as
  // short dark links, each row staggered against the next.
  mailCoif('lc_chainmail_hood', 3.3),

  // A dark grey cotton hood standing upright, 240 mm across and 310 mm tall: a snug hood that also covers the mouth,
  // leaving only an eye slit, with black wrapped folds across the lower face.
  hood('hood_ninja', 0.13, {
    prof: snugProfile,
    face: { y: 0.205, w: 0.06, hh: 0.013 },
    mantle: { side: 0.06, fb: 0.04, hemSide: 0.045, back: 0.015, folds: 6, fold: 0.01 },
    extras(sf): std.flattenArrays([
      h.crescent('wrap-%d' % i, 'stitch', r - 0.006, r + 0.004, -55, 55, 8, y, y + 0.007)
      for i in std.range(0, 2)
      for y in [[0.11, 0.135, 0.16][i]]
      for r in [rAt(snugProfile, y)]
    ]) + [
      // The wrap's tail hanging down the back of the neck.
      box('wrap-tail-%d' % i, 'stitch', [-0.012 + 0.002 * i, y, -sf(y, 180) - 0.005], [0.012 + 0.002 * i, y + 0.012, -sf(y, 180) + 0.003])
      for i in std.range(0, 4)
      for y in [0.065 + 0.01 * i]
    ],
    fin: { cloth: 'felt-grey', stitch: 'cloth-black', trim: 'cloth-black', face: 'screen-black' },
  }),

  // A flame-resistant knit hood standing upright, 370 mm across its bib and 310 mm tall: a snug hood with a bound
  // face opening and a long bib that tucks under a collar, ribbed where it gathers at the neck.
  hood('nomex_hood', 0.16, {
    prof: bibProfile,
    face: { y: 0.19, w: 0.07, hh: 0.065 },
    mantle: { side: 0.055, fb: 0.08, hemSide: 0.06, back: 0.02, folds: 5, fold: 0.01 },
    rows: spread(0.104, 0.12, 3),
    fin: { cloth: 'knit-fr', stitch: 'knit-fr', trim: 'cloth-charcoal', face: 'cloth-black' },
  }),

  // A yellow vinyl rain hood standing upright, 340 mm across and 325 mm tall: a loose hood with a stiffened peak over
  // the face, a seam up the back and a drawstring with toggles at the chin.
  hood('hood_rain', 0.15, {
    prof: looseProfile,
    face: looseFace,
    mantle: looseMantle,
    extras(sf): backSeam(sf, 0.04, 0.3, 'stitch')
                + h.crescent('peak', 'trim', rAt(looseProfile, 0.26) - 0.012, rAt(looseProfile, 0.26) + 0.045, -55, 55, 8, 0.255, 0.261)
                + drawstring(sf, 0.112, 0.07, 'cord', 0.008, 'toggle'),
    fin: { cloth: 'vinyl-yellow', stitch: 'vinyl-yellow', trim: 'rubber-yellow', face: 'cloth-black', cord: 'plastic-matte-black', toggle: 'plastic-matte-black' },
  }),

  // A gutskin hood standing upright, 340 mm across and 325 mm tall: a loose hood sewn from translucent strips of gut,
  // the strip seams running round it, a sinew drawstring knotted at the chin.
  hood('hood_gut', 0.12, {
    prof: looseProfile,
    face: looseFace,
    mantle: looseMantle + { wob: 0.01 },
    rows: spread(0.03, 0.29, 9),
    extras(sf): backSeam(sf, 0.04, 0.3, 'stitch') + drawstring(sf, 0.112, 0.07, 'cord', 0.007, 'cord'),
    fin: { cloth: 'gut-translucent', stitch: 'skin-rawhide', trim: 'skin-rawhide', face: 'cloth-black', cord: 'skin-rawhide' },
  }),

  // A beekeeper's hat and veil standing upright, 440 mm across the brim and 400 mm tall: a white cotton hat with a
  // wide stiffened brim, a black mesh veil hanging from it in a tube, a cotton skirt at its foot to tuck into a
  // collar, and two ties at the front to fasten it round the chest.
  h.compound('beekeeping_hood', 0.35, [
    // Hollow turned rings end on their first point, or the export fills the hole.
    h.turned('skirt', 'cloth', 'y', [[0, 0.2], [0.075, 0.178], [0.075, 0.172], [0, 0.194], [0, 0.2]]),
    h.turned('hem', 'trim', 'y', [[0, 0.203], [0.012, 0.199], [0.012, 0.191], [0, 0.195], [0, 0.203]]),
    h.turned('veil', 'veil', 'y', [[0.07, 0.178], [0.3, 0.19], [0.3, 0.186], [0.07, 0.174], [0.07, 0.178]]),
    h.turned('band', 'trim', 'y', [[0.07, 0.181], [0.085, 0.181], [0.085, 0.172], [0.07, 0.172], [0.07, 0.181]]),
    h.turned('brim', 'hat', 'y', [[0.3, 0], [0.3, 0.22], [0.306, 0.22], [0.31, 0.1], [0.31, 0]]),
    h.turned('crown', 'hat', 'y', [[0.3, 0], [0.3, 0.105], [0.37, 0.1], [0.395, 0.08], [0.405, 0.04], [0.407, 0]]),
    h.turned('hatband', 'trim', 'y', [[0.31, 0], [0.31, 0.107], [0.33, 0.106], [0.33, 0]]),
    // Ties at the front of the skirt.
    box('tie-l', 'tie', [-0.05, 0.0, 0.188], [-0.044, 0.07, 0.202]),
    box('tie-r', 'tie', [0.044, 0.0, 0.188], [0.05, 0.07, 0.202]),
  ], { hat: 'cloth-bright-white', cloth: 'cloth-bright-white', trim: 'cloth-cream', veil: 'mesh-black', tie: 'cloth-cream' })
  + { voxelGrain: 0.004 },
]
