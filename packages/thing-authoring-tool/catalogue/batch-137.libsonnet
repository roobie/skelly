local h = import '../compound.libsonnet';
local box = h.box;
local rad(deg) = deg * std.pi / 180;
// A box from two opposite corners given in any order, for pieces mirrored across x.
local sbox(id, slot, a, b) = box(id, slot, [std.min(a[k], b[k]) for k in [0, 1, 2]], [std.max(a[k], b[k]) for k in [0, 1, 2]]);

// Helmets standing upright as they are found, front on +z.

// A closed ring turned about y from y0 to y1 between radii r0 and r1, centred on (x, z).
local ring(id, slot, r0, r1, y0, y1, x=0, z=0) = h.turned(id, slot, 'y', [[0, r0], [0, r1], [y1 - y0, r1], [y1 - y0, r0], [0, r0]], [x, y0, z]);

// The [x, z] point at angle `ang` degrees on a circle of radius r round [0, cz] (0 points to +z).
local onArc(r, ang, cz=0) = [r * std.sin(rad(ang)), cz + r * std.cos(rad(ang))];

// A band curved round [0, cz] at radius r, thick t, from angle a0 to a1, in segments whose bottom and top heights
// `y0(ang)` and `y1(ang)` follow the angle at each segment's middle: visors, chin bars, cut-outs on a pot wall.
local wrapBand(prefix, slot, r, t, a0, a1, steps, y0, y1, cz=0) = std.flattenArrays([
  local ang = a0 + (a1 - a0) * (i + 0.5) / steps;
  h.crescent('%s-%d' % [prefix, i], slot, r - t, r, a0 + (a1 - a0) * i / steps, a0 + (a1 - a0) * (i + 1) / steps, 1, y0(ang), y1(ang), 0, cz)
  for i in std.range(0, steps - 1)
]);
local flatAt(v) = function(a) v;

// A loop handle on the side s (-1 or 1) of a pot of radius r, riveted near height y: two lugs and a bar standing
// out from the wall, the gap between them open for a strap.
local sideHandle(prefix, slot, s, r, y, w=0.05, out=0.026, t=0.008) = [
  sbox(prefix + '-front', slot, [s * (r - 0.002), y, w / 2 - t], [s * (r + out), y + t, w / 2]),
  sbox(prefix + '-back', slot, [s * (r - 0.002), y, -w / 2], [s * (r + out), y + t, -w / 2 + t]),
  sbox(prefix + '-bar', slot, [s * (r + out - t), y, -w / 2], [s * (r + out), y + t, w / 2]),
];

// A cooking pot turned upside down to be worn, resting on its rim, front on +z: a straight wall of radius r and
// height ht with a rounded base on top, a rolled rim at the foot, a loop handle each side near the rim and a strap
// tied through both handles that hangs to the floor and lies out in a loop in front. Slots: pot, rim, handle, strap.
local potHelm(id, mass, r, ht, finishes) =
  local hy = 0.022;
  h.compound(id, mass, [
    h.turned('pot', 'pot', 'y', [[0, 0], [0, r], [ht - 0.016, r], [ht - 0.006, r - 0.006], [ht, r - 0.018], [ht, 0]]),
    ring('rim', 'rim', r - 0.004, r + 0.004, 0, 0.007),
    // The base's turned ring, which now sits on top.
    ring('base-ring', 'rim', r * 0.6, r * 0.6 + 0.004, ht, ht + 0.002),
  ]
  + std.flattenArrays([
    sideHandle('handle-%d' % (s + 1), 'handle', s, r, hy)
    + [
      // The strap drops from the handle bar and runs forward along the floor.
      sbox('strap-drop-%d' % (s + 1), 'strap', [s * (r + 0.02), 0, -0.01], [s * (r + 0.026), hy + 0.008, 0.01]),
    ]
    for s in [-1, 1]
  ])
  // Strap loop lying in front of the pot, joined at a buckle.
  + h.crescent('strap-loop', 'strap', r + 0.02, r + 0.026, 90, -90, 16, 0, 0.004)
  + [box('buckle', 'handle', [-0.012, 0, r + 0.016], [0.012, 0.006, r + 0.03])],
             finishes)
  + { voxelGrain: 0.004 };

[
  // A spiked leather helmet standing on its rim, front on +z, 210 mm across, 270 mm front to back with the peaks and
  // 250 mm tall to the tip of the spike: a black hardened-leather shell, a front peak and a lower neck peak, a
  // pierced cross-shaped base under a fluted spike, a shield-shaped plate on the front and scaled chin straps
  // resting over the front peak from a rosette on each side.
  h.compound('pickelhaube', 0.7, [
    h.turned('shell', 'leather', 'y', [[0, 0], [0, 0.098], [0.05, 0.1], [0.09, 0.094], [0.12, 0.08], [0.14, 0.058], [0.152, 0.03], [0.155, 0]]),
    // The pierced base of the spike: a round boss with four arms down the shell.
    h.turned('spike-base', 'fitting', 'y', [[0, 0], [0, 0.032], [0.006, 0.03], [0.012, 0.02], [0.012, 0]], [0, 0.15, 0]),
    h.turned('spike', 'fitting', 'y', [[0, 0], [0, 0.013], [0.012, 0.013], [0.016, 0.016], [0.022, 0.011], [0.08, 0.003], [0.086, 0]], [0, 0.16, 0]),
    // Front plate.
    h.prism('plate', 'fitting', 'z', [[-0.03, 0.04], [0.03, 0.04], [0.036, 0.09], [0.022, 0.11], [0, 0.118], [-0.022, 0.11], [-0.036, 0.09]], 0.094, 0.103),
    // Rosettes where the chin scales hang.
    h.turned('rosette-l', 'fitting', 'x', [[0, 0], [0, 0.014], [0.005, 0.012], [0.007, 0]], [0.098, 0.03, 0]),
    h.turned('rosette-r', 'fitting', 'x', [[0, 0], [0, 0.014], [-0.005, 0.012], [-0.007, 0]], [-0.098, 0.03, 0]),
  ]
  + [
    // The arms of the spike base running down the shell to front, back and sides.
    local p0 = onArc(0.03, a), p1 = onArc(0.07, a);
    h.prism('spike-arm-%d' % i, 'fitting', 'y', [[p0[1] - 0.008 * std.sin(rad(a)), p0[0] + 0.008 * std.cos(rad(a))], [p1[1] - 0.006 * std.sin(rad(a)), p1[0] + 0.006 * std.cos(rad(a))], [p1[1] + 0.006 * std.sin(rad(a)), p1[0] - 0.006 * std.cos(rad(a))], [p0[1] + 0.008 * std.sin(rad(a)), p0[0] - 0.008 * std.cos(rad(a))]], 0.136, 0.15)
    for i in std.range(0, 3)
    for a in [[0, 90, 180, 270][i]]
  ]
  // Front peak, a squared edge trimmed in metal, and the deeper peak over the neck.
  + h.crescent('peak-front', 'leather', 0.096, 0.136, -58, 58, 12, 0.006, 0.012)
  + h.crescent('peak-trim', 'fitting', 0.132, 0.139, -58, 58, 12, 0.006, 0.013)
  + h.crescent('peak-back', 'leather', 0.096, 0.128, 125, 235, 10, 0, 0.006)
  // The chin scales, a run of small plates looped forward over the front peak from rosette to rosette.
  + [
    local a0 = -86 + 172 * i / 19, a1 = a0 + 172 / 19 * 0.7;
    h.crescent('scale-%d' % i, 'fitting', 0.104, 0.118, a0, a1, 1, 0.012, 0.018)[0]
    for i in std.range(0, 18)
  ],
             { leather: 'leather-black', fitting: 'brass-polished' })
  + { voxelGrain: 0.004 },

  // A soup pot helmet, an iron pot 200 mm across and 130 mm deep upside down on its rim, with a strap through the
  // side handles.
  potHelm('pot_helmet', 2.6, 0.1, 0.13, { pot: 'iron-cast', rim: 'iron-cast', handle: 'steel-grey', strap: 'leather-brown' }),

  // A canning pot helmet, a blue enamelled steel canner 330 mm across and 260 mm deep upside down on its rim, with a
  // strap through the side handles.
  potHelm('pot_xlhelmet', 2, 0.165, 0.26, { pot: 'paint-drum-blue', rim: 'steel-grey', handle: 'steel-grey', strap: 'leather-brown' }),

  // A stock pot great helm, an aluminium stock pot 260 mm across and 290 mm deep upside down on its rim, front on +z:
  // a T cut through the front wall for the eyes, nose and mouth with the stuffed blanket showing through it and
  // bunched out under the rim, and a cord tied to each side handle hanging down and trailing on the floor.
  local r = 0.13, ht = 0.29;
  h.compound('stockpot_helmet', 1.3, [
    h.turned('pot', 'pot', 'y', [[0, 0], [0, r], [ht - 0.012, r], [ht - 0.004, r - 0.005], [ht, r - 0.014], [ht, 0]]),
    ring('rim', 'pot', r - 0.003, r + 0.004, 0.006, 0.013),
  ]
  // The T: the eye slot across the front and the drop below it for nose and mouth, the blanket behind both.
  + wrapBand('t-bar', 'cut', r + 0.0015, 0.003, -38, 38, 10, flatAt(0.17), flatAt(0.195))
  + wrapBand('t-drop', 'cut', r + 0.0015, 0.003, -7, 7, 2, flatAt(0.05), flatAt(0.17))
  // The blanket bunched out under the rim all round, puffing out in folds.
  + [
    local p = onArc(r - 0.004, 30 * i + 15);
    h.turned('blanket-%d' % i, 'blanket', 'y', [[0, 0], [0, 0.024], [0.004, 0.027], [0.008, 0.02], [0.008, 0]], [p[0], 0, p[1]])
    for i in std.range(0, 11)
  ]
  + [ring('blanket-fill', 'blanket', r - 0.03, r - 0.002, 0, 0.006)]
  + std.flattenArrays([
    sideHandle('handle-%d' % (s + 1), 'handle', s, r, 0.04, 0.06, 0.028, 0.01)
    + [
      // The cord tied round the handle bar, hanging to the floor and trailing forward.
      sbox('cord-knot-%d' % (s + 1), 'cord', [s * (r + 0.016), 0.034, -0.008], [s * (r + 0.034), 0.056, 0.008]),
      sbox('cord-drop-%d' % (s + 1), 'cord', [s * (r + 0.022), 0, -0.003], [s * (r + 0.028), 0.036, 0.003]),
      sbox('cord-trail-%d' % (s + 1), 'cord', [s * (r + 0.022), 0, -0.003], [s * (r + 0.028), 0.004, 0.16]),
      sbox('cord-end-%d' % (s + 1), 'cord', [s * (r + 0.018), 0, 0.156], [s * (r + 0.032), 0.008, 0.17]),
    ]
    for s in [-1, 1]
  ]),
             { pot: 'alu-bare', cut: 'cloth-charcoal', blanket: 'wool-grey', handle: 'steel-grey', cord: 'cord-cotton' })
  + { voxelGrain: 0.004 },

  // A tactical full helmet standing on its neck guard, front on +z, 270 mm across and 310 mm tall: a matte black
  // ballistic shell closing over the whole head with a moulded chin bar, a dark visor across the face, a flared
  // guard at the back of the neck, accessory rails along each side and a mount shroud over the brow.
  local cy = 0.18, R = 0.126;
  local skull(y) = std.sqrt(std.max(0, R * R - (y - cy) * (y - cy)));
  h.compound('tac_fullhelmet', 1.9, [
    h.turned('shell', 'shell', 'y', [[0, 0], [0, 0.104], [0.04, 0.11], [0.1, 0.12], [0.14, 0.124], [cy, R]]
                                    + [[y, skull(y)] for y in [cy + 0.03, cy + 0.06, cy + 0.085, cy + 0.105, cy + 0.118, cy + 0.124]]
                                    + [[cy + R, 0]]),
    // The brow shroud.
    box('shroud', 'rail', [-0.024, 0.236, 0.08], [0.024, 0.27, 0.118]),
    // Visor pivots.
    h.turned('pivot-l', 'rail', 'x', [[0, 0], [0, 0.016], [0.008, 0.013], [0.01, 0]], [0.126, 0.14, 0.02]),
    h.turned('pivot-r', 'rail', 'x', [[0, 0], [0, 0.016], [-0.008, 0.013], [-0.01, 0]], [-0.126, 0.14, 0.02]),
  ]
  // The chin bar wrapping round the jaw, with a vent row at its front, and the visor above it.
  + wrapBand('chin', 'shell', 0.132, 0.016, -80, 80, 20, flatAt(0.012), function(a) 0.112 - 0.02 * std.abs(a) / 80)
  + [
    local p = onArc(0.1325, -12 + 6 * i);
    sbox('vent-%d' % i, 'vent', [p[0] - 0.0025, 0.05, p[1] - 0.004], [p[0] + 0.0025, 0.08, p[1] + 0.002])
    for i in std.range(0, 4)
  ]
  // The visor sweeps round to its pivots, close over the shell.
  + wrapBand('visor', 'visor', 0.132, 0.008, -76, 76, 24, function(a) 0.112 - 0.016 * std.abs(a) / 76, function(a) 0.212 - 0.04 * std.abs(a) / 76)
  + wrapBand('visor-edge', 'rail', 0.134, 0.006, -76, 76, 24, function(a) 0.206 - 0.04 * std.abs(a) / 76, function(a) 0.214 - 0.04 * std.abs(a) / 76)
  // Accessory rails curved along each side above the pivots.
  + wrapBand('rail-l', 'rail', 0.132, 0.008, 84, 132, 8, flatAt(0.16), flatAt(0.18))
  + wrapBand('rail-r', 'rail', 0.132, 0.008, -132, -84, 8, flatAt(0.16), flatAt(0.18))
  // The neck guard flaring out at the back.
  + h.crescent('neck', 'shell', 0.1, 0.136, 105, 255, 12, 0, 0.03),
             { shell: 'plastic-charcoal', rail: 'plastic-matte-black', visor: 'lens-smoke', vent: 'plastic-matte-black' })
  + { voxelGrain: 0.004 },
]
