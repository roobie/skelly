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
// `y0(ang)` and `y1(ang)` follow the angle at each segment's middle: visors, bevors, brow bands, cheek plates.
local wrapBand(prefix, slot, r, t, a0, a1, steps, y0, y1, cz=0) = std.flattenArrays([
  local ang = a0 + (a1 - a0) * (i + 0.5) / steps;
  h.crescent('%s-%d' % [prefix, i], slot, r - t, r, a0 + (a1 - a0) * i / steps, a0 + (a1 - a0) * (i + 1) / steps, 1, y0(ang), y1(ang), 0, cz)
  for i in std.range(0, steps - 1)
]);
local flatAt(v) = function(a) v;

// An arc band in the y-z plane about centre (cy, 0), radii r0..r1, from a0 to a1 degrees off straight up (+z
// forward), `w` wide across x at `cx`: combs and pads running front to back over a crown.
local arcX(prefix, slot, r0, r1, a0, a1, steps, w, cy, cx=0) = [
  local t0 = rad(a0 + (a1 - a0) * i / steps), t1 = rad(a0 + (a1 - a0) * (i + 1) / steps);
  local p(r, t) = [cy + r * std.cos(t), r * std.sin(t)];
  h.prism('%s-%d' % [prefix, i], slot, 'x', [p(r0, t0), p(r1, t0), p(r1, t1), p(r0, t1)], cx - w / 2, cx + w / 2)
  for i in std.range(0, steps - 1)
];

// The same arc in the x-y plane, across the crown from side to side, `w` deep along z at `cz`.
local arcZ(prefix, slot, r0, r1, a0, a1, steps, w, cy, cz=0) = [
  local t0 = rad(a0 + (a1 - a0) * i / steps), t1 = rad(a0 + (a1 - a0) * (i + 1) / steps);
  local p(r, t) = [r * std.sin(t), cy + r * std.cos(t)];
  h.prism('%s-%d' % [prefix, i], slot, 'z', [p(r0, t0), p(r1, t0), p(r1, t1), p(r0, t1)], cz - w / 2, cz + w / 2)
  for i in std.range(0, steps - 1)
];

// A rivet head on a curved band at angle `ang`, radius r round the y axis, height y.
local rivet(id, slot, r, ang, y, s=0.007) =
  local p = onArc(r, ang);
  box(id, slot, [p[0] - s / 2, y - s / 2, p[1] - s / 2], [p[0] + s / 2, y + s / 2, p[1] + s / 2]);

// A close helm standing on its gorget, front on +z, 300 mm tall over a skull 230 mm across: a rounded skull with a
// comb front to back, `lames` gorget plates flaring at the foot, a bevor round the chin and jaw with a ridge down the
// front and breaths on the right, and a visor pivoting on a boss either side. Closed, the visor's pointed front sits
// over the face with the sight slit along its upper edge; raised, it rides up over the brow and the padded lining
// shows through the face opening. `comb` is the comb's height; `reinforce` adds a riveted plate over the bevor, as
// the heavy helm has. Slots: plate, slit, lining, rivet.
local closeHelm(id, mass, comb, lames, reinforce, raised) =
  local yb = 0.012 * lames;
  local R = 0.11, cy = yb + 0.172;
  local skull(y) = std.sqrt(std.max(0, R * R - (y - cy) * (y - cy)));
  h.compound(id, mass, [
    // The skull and the solid of the head below it.
    h.turned('skull', 'plate', 'y', [[0, 0]]
                                     + [[yb + 0, 0.088], [yb + 0.04, 0.096], [yb + 0.1, 0.106], [yb + 0.14, 0.11], [cy, R]]
                                     + [[y, skull(y)] for y in [cy + 0.03, cy + 0.055, cy + 0.075, cy + 0.09, cy + 0.1, cy + 0.106]]
                                     + [[cy + R, 0]]),
    // Visor pivots.
    h.turned('pivot-l', 'rivet', 'x', [[0, 0], [0, 0.014], [0.006, 0.01], [0.008, 0]], [0.11, yb + 0.152, 0.005]),
    h.turned('pivot-r', 'rivet', 'x', [[0, 0], [0, 0.014], [-0.006, 0.01], [-0.008, 0]], [-0.11, yb + 0.152, 0.005]),
  ]
  // The gorget lames, each overlapping the one below and flaring out at the foot.
  + [
    ring('lame-%d' % i, 'plate', 0.07, 0.112 - 0.006 * i, 0.012 * i, 0.012 * (i + 1) + 0.002)
    for i in std.range(0, lames - 1)
  ]
  + arcX('comb', 'plate', R - 0.01, R + comb, -(72 - comb * 600), 72 - comb * 600, 12, 0.006, cy)
  // The bevor wrapping chin and jaw up to the sight line, with its ridge.
  + wrapBand('chin', 'plate', 0.104, 0.007, -88, 88, 22, flatAt(yb + 0.004), flatAt(yb + 0.06))
  + wrapBand('chin-ridge', 'plate', 0.111, 0.008, -4, 4, 2, flatAt(yb + 0.008), flatAt(yb + 0.06))
  + wrapBand('bevor', 'plate', 0.119, 0.016, -88, 88, 22, flatAt(yb + 0.05), function(a) yb + 0.125 - 0.025 * std.abs(a) / 88)
  + wrapBand('bevor-ridge', 'plate', 0.127, 0.009, -4, 4, 2, flatAt(yb + 0.05), flatAt(yb + 0.125))
  // Breaths: a row of short slots on the right cheek.
  + [
    local p = onArc(0.1195, -32 - 8 * i);
    sbox('breath-%d' % i, 'slit', [p[0] - 0.004, yb + 0.082, p[1] - 0.004], [p[0] + 0.004, yb + 0.108, p[1] + 0.004])
    for i in std.range(0, 4)
  ]
  + (if reinforce then
       wrapBand('reinforce', 'plate', 0.126, 0.007, -62, 62, 16, flatAt(yb + 0.05), function(a) yb + 0.078 - 0.01 * std.abs(a) / 62)
       + [rivet('reinforce-rivet-%d' % i, 'rivet', 0.127, -54 + 27 * i, yb + 0.064) for i in std.range(0, 4)]
     else [])
  + [rivet('lame-rivet-%d' % i, 'rivet', 0.11 - 0.006 * (lames - 1), -60 + 30 * i, 0.012 * lames - 0.005) for i in std.range(0, 4)]
  + (if raised then
       // The face opening with the lining behind it, and the visor swung up over the brow.
       wrapBand('lining', 'lining', 0.115, 0.004, -58, 58, 14, flatAt(yb + 0.1), flatAt(cy + 0.004))
       + wrapBand('visor-lo', 'plate', 0.121, 0.006, -78, 78, 20, flatAt(cy + 0.008), function(a) cy + 0.04 - 0.02 * std.abs(a) / 78)
       + wrapBand('visor-hi', 'plate', 0.108, 0.008, -72, 72, 18, flatAt(cy + 0.035), function(a) cy + 0.06 - 0.02 * std.abs(a) / 72)
       + wrapBand('visor-beak', 'plate', 0.13, 0.012, -5, 5, 2, flatAt(cy + 0.008), flatAt(cy + 0.04))
       + wrapBand('visor-slit', 'slit', 0.1215, 0.006, -60, 60, 14, flatAt(cy + 0.004), flatAt(cy + 0.01))
     else
       // The visor down over the face, sight slit along its top edge and a pointed ridge down its front.
       wrapBand('visor', 'plate', 0.121, 0.006, -80, 80, 20, function(a) yb + 0.118 - 0.025 * std.abs(a) / 80, function(a) cy + 0.012 - 0.01 * std.abs(a) / 80)
       + wrapBand('visor-beak', 'plate', 0.136, 0.017, -6, 6, 2, flatAt(yb + 0.12), flatAt(cy + 0.0))
       + wrapBand('slit', 'slit', 0.1215, 0.007, -62, 62, 16, flatAt(cy - 0.022), flatAt(cy - 0.012))),
             { plate: 'steel-bright', slit: 'plastic-matte-black', lining: 'cloth-charcoal', rivet: 'brass-dull' })
  + { voxelGrain: 0.004 };

[
  // A padded tank crew helmet standing on its ear flaps, front on +z, 220 mm across and 200 mm tall: a soft canvas
  // cap with three thick padded rolls running front to back over the crown, a padded brow roll round the front and
  // sides, ear flaps with headset earpieces, a chin strap and the headset lead with its plug at the back.
  local y0 = 0.07, a = 0.095, ht = 0.13, R = (a * a + ht * ht) / (2 * ht), c = ht - R;
  h.compound('tank_crew_helmet', 0.59, [
    h.turned('cap', 'cap', 'y', [[0, 0], [0, a]] + [[(y), std.sqrt(R * R - (y - c) * (y - c))] for y in [0.03, 0.06, 0.09, 0.11, 0.122]] + [[ht, 0]], [0, y0, 0]),
  ]
  // The back of the cap reaching down over the nape.
  + h.crescent('nape', 'cap', 0.088, 0.097, 120, 240, 8, y0 - 0.05, y0 + 0.01)
  + std.flattenArrays([
    arcX('pad-%d' % i, 'pad', std.sqrt(R * R - cx * cx) - 0.004, std.sqrt(R * R - cx * cx) + 0.02, -100, 100, 14, 0.028, y0 + c, cx)
    for i in [0, 1, 2]
    for cx in [[-0.042, 0, 0.042][i]]
  ])
  + wrapBand('brow', 'pad', 0.112, 0.02, -100, 100, 20, flatAt(y0 - 0.002), flatAt(y0 + 0.026))
  + std.flattenArrays([
    [
      sbox('flap-%d' % (s + 1), 'cap', [s * 0.09, 0, -0.045], [s * 0.1, y0 + 0.01, 0.045]),
      h.turned('earpiece-%d' % (s + 1), 'earpiece', 'x', [[0, 0], [0, 0.032], [s * 0.012, 0.03], [s * 0.018, 0.02], [s * 0.02, 0]], [s * 0.1, 0.045, 0]),
      sbox('strap-%d' % (s + 1), 'strap', [s * 0.1, 0, 0.03], [s * 0.104, 0.03, 0.045]),
    ]
    for s in [-1, 1]
  ])
  + [
    box('buckle', 'buckle', [0.1, 0.006, 0.026], [0.107, 0.02, 0.048]),
    h.disc('lead-socket', 'earpiece', 0.008, y0 - 0.05, y0 - 0.03, 0, -0.098),
    box('lead', 'lead', [-0.004, 0, -0.2], [0.004, 0.008, -0.095]),
    box('lead-drop', 'lead', [-0.004, 0, -0.103], [0.004, y0 - 0.045, -0.095]),
    h.turned('plug', 'earpiece', 'z', [[0, 0], [0, 0.009], [0.03, 0.009], [0.035, 0.005], [0.035, 0]], [0, 0.009, -0.235]),
  ], { cap: 'cloth-olive-drab', pad: 'webbing-olive-dark', earpiece: 'plastic-matte-black', strap: 'leather-brown', buckle: 'steel-bright', lead: 'rubber-black' })
  + { voxelGrain: 0.004 },

  // Mild steel heavy close helm, 310 mm tall: a tall comb, three gorget lames and a riveted plate over the bevor.
  closeHelm('lc_heavyhelm_close', 4.1, 0.02, 3, true, false),
  closeHelm('lc_heavyhelm_close_raised', 4.1, 0.02, 3, true, true),
  // Mild steel close helm, 300 mm tall: a comb and two gorget lames.
  closeHelm('lc_helm_close', 3.6, 0.012, 2, false, false),
  closeHelm('lc_helm_close_raised', 3.6, 0.012, 2, false, true),
  // Mild steel light close helm, 290 mm tall: a low comb and a single gorget lame.
  closeHelm('lc_lighthelm_close', 3.1, 0.006, 1, false, false),
  closeHelm('lc_lighthelm_close_raised', 3.1, 0.006, 1, false, true),

  // A mild steel nasal helm resting on its nasal bar, front on +z, 210 mm across and 235 mm tall: a pointed round
  // skull 160 mm deep with riveted bands crossing over the top, a brow band, a leather lining showing at the rim, a
  // nasal bar down the front and leather chin straps tucked up inside the rim.
  local y0 = 0.065, a = 0.1, ht = 0.165, R = (a * a + ht * ht) / (2 * ht), c = ht - R;
  local lim = 180 - std.acos(c / R) * 180 / std.pi;
  h.compound('lc_helmet_nasal', 1.8, [
    h.dome('skull', 'plate', a, ht, 0.004, 'y', [0, y0, 0], 10),
    ring('lining', 'lining', 0.09, 0.0965, y0 - 0.012, y0 + 0.02),
    ring('brow', 'band', 0.097, 0.106, y0, y0 + 0.026),
    h.prism('nasal', 'plate', 'z', [[-0.009, y0 + 0.026], [0.009, y0 + 0.026], [0.012, 0.008], [0.008, 0], [-0.008, 0], [-0.012, 0.008]], 0.1, 0.108),
    h.disc('finial', 'plate', 0.008, y0 + ht - 0.004, y0 + ht + 0.008),
  ]
  + arcX('band-fb', 'band', R - 0.002, R + 0.005, -lim, lim, 16, 0.02, y0 + c)
  + arcZ('band-lr', 'band', R - 0.002, R + 0.005, -lim, lim, 16, 0.02, y0 + c)
  + [rivet('brow-rivet-%d' % i, 'rivet', 0.106, 45 * i + 22.5, y0 + 0.013, 0.006) for i in std.range(0, 7)]
  + [rivet('nasal-rivet', 'rivet', 0.109, 0, y0 + 0.013, 0.006)]
  + std.flattenArrays([
    [
      sbox('strap-%d' % (s + 1), 'strap', [s * 0.082, y0 - 0.018, -0.012], [s * 0.09, y0 + 0.02, 0.012]),
      sbox('strap-end-%d' % (s + 1), 'strap', [s * 0.05, y0 - 0.018, -0.012], [s * 0.09, y0 - 0.012, 0.012]),
    ]
    for s in [-1, 1]
  ])
  + [box('buckle', 'buckle', [0.05, y0 - 0.02, -0.014], [0.062, y0 - 0.01, 0.014])],
             { plate: 'steel-bright', band: 'steel-grey', lining: 'leather-brown', rivet: 'steel-grey', strap: 'leather-brown', buckle: 'brass-dull' })
  + { voxelGrain: 0.004 },

  // A mild steel turban helmet resting on its ear guards, front on +z, 240 mm across and 330 mm tall: a broad bulbous
  // bowl with fluting round its sides rising to a narrow top and a short spike, a raised band at the brow, an ear
  // guard on each side, a broad plate carrying the bowl's curve down and in over the cheek, and a sliding nasal bar
  // in a bracket at the front.
  local y0 = 0.075;
  local prof = [[0, 0.104], [0.03, 0.114], [0.08, 0.118], [0.12, 0.11], [0.155, 0.088], [0.18, 0.06], [0.2, 0.034], [0.215, 0.022]];
  h.compound('lc_helmet_turban', 2.3, [
    h.turned('bowl', 'plate', 'y', [[0, 0]] + prof + [[0.225, 0.018], [0.225, 0]], [0, y0, 0]),
    h.turned('spike', 'plate', 'y', [[0, 0], [0, 0.012], [0.02, 0.008], [0.05, 0.002], [0.055, 0]], [0, y0 + 0.225, 0]),
    ring('brow', 'band', 0.103, 0.111, y0, y0 + 0.022),
    ring('collar', 'band', 0.016, 0.022, y0 + 0.21, y0 + 0.226),
    // The nasal bar sliding in its bracket, a leaf-shaped tip at the foot and a knob at the top.
    box('nasal', 'plate', [-0.007, 0.024, 0.118], [0.007, y0 + 0.13, 0.124]),
    h.prism('nasal-tip', 'plate', 'z', [[0, 0], [0.014, 0.014], [0.007, 0.028], [-0.007, 0.028], [-0.014, 0.014]], 0.118, 0.124),
    box('bracket', 'band', [-0.014, y0 + 0.004, 0.11], [0.014, y0 + 0.04, 0.127]),
    h.turned('nasal-knob', 'band', 'y', [[0, 0], [0, 0.01], [0.006, 0.01], [0.012, 0]], [0, y0 + 0.13, 0.121]),
  ]
  // Flutes down the sides of the bowl.
  + [
    local t = 2 * std.pi * (i + 0.5) / 28;
    h.disc('flute-%d' % i, 'plate', 0.006, y0 + 0.024, y0 + 0.11, 0.113 * std.sin(t), 0.113 * std.cos(t))
    for i in std.range(0, 27)
  ]
  + std.flattenArrays([
    // Tiers stepping in and narrowing towards the foot, so the guard rounds off below the jaw.
    std.flattenArrays([
      wrapBand('ear-%d-%d' % [s + 1, k], 'plate', t[0], 0.008, s * 90 - t[3], s * 90 + t[3], 10, flatAt(t[1]), flatAt(t[2]))
      for k in [0, 1, 2]
      for t in [[[0.118, y0 - 0.024, y0 + 0.008, 48], [0.113, y0 - 0.048, y0 - 0.024, 42], [0.106, 0.004, y0 - 0.048, 32]][k]]
    ])
    + [rivet('ear-hinge-%d-%d' % [s + 1, j], 'rivet', 0.119, s * 90 + 30 * j, y0 - 0.006, 0.008) for j in [-1, 1]]
    for s in [-1, 1]
  ]),
             { plate: 'steel-bright', band: 'steel-bright', rivet: 'brass-dull' })
  + { voxelGrain: 0.004 },
]
