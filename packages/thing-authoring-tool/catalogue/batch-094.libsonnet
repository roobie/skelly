local h = import '../compound.libsonnet';
local box = h.box;
// Keeps the part of an [x, z] outline on one side of x = a, dropping repeated points.
local clipX(poly, a, above) =
  local n = std.length(poly);
  local ins(p) = if above then p[0] >= a - 1e-9 else p[0] <= a + 1e-9;
  local raw = std.flattenArrays([
    local p = poly[i];
    local q = poly[(i + 1) % n];
    (if ins(p) then [p] else [])
    + (if ins(p) != ins(q) then [[a, p[1] + (q[1] - p[1]) * (a - p[0]) / (q[0] - p[0])]] else [])
    for i in std.range(0, n - 1)
  ]);
  local m = std.length(raw);
  [raw[i] for i in std.range(0, m - 1) if m > 0 && (std.abs(raw[i][0] - raw[(i + 1) % m][0]) > 1e-6 || std.abs(raw[i][1] - raw[(i + 1) % m][1]) > 1e-6)];
local xMin(poly) = std.foldl(function(a, p) std.min(a, p[0]), poly, 1e9);
local xMax(poly) = std.foldl(function(a, p) std.max(a, p[0]), poly, -1e9);
// How far a plate curved across x with radius `r` rises at local x, given its half-width.
local sag(x, half, r) = (half * half - x * x) / (2 * r);
// A plate lying convex side up, its [x, z] outline (centred on its own middle) cut into `n` strips across x, each
// raised to follow a curve of radius `r`, so the edges rest at y0 and the middle stands proud. A layer laid on a
// wider plate passes that plate's half-width as `curveHalf` to follow the same curve.
local plate(prefix, slot, outline, y0, thick, r, n, cx=0, cz=0, curveHalf=null) =
  local x0 = xMin(outline);
  local x1 = xMax(outline);
  local half = if curveHalf == null then std.max(-x0, x1) else curveHalf;
  local w = (x1 - x0) / n;
  [
    local xa = x0 + i * w;
    local band = clipX(clipX(outline, xa, true), xa + w, false);
    local s = sag(xa + w / 2, half, r);
    h.prism('%s-%d' % [prefix, i], slot, 'y', [[p[1] + cz, p[0] + cx] for p in band], y0 + s, y0 + s + thick)
    for i in std.range(0, n - 1)
  ];
// Height of a curved plate's top face at local x.
local topAt(outline, y0, thick, r, x) = y0 + thick + sag(x, std.max(-xMin(outline), xMax(outline)), r);
// A thin strip lying on a curved plate's face from [xa, za] to [xb, zb], `w` wide: cracks, labels and seams.
local onFace(id, slot, outline, y0, thick, r, a, b, w=0.004, cx=0, cz=0) =
  local dx = b[0] - a[0];
  local dz = b[1] - a[1];
  local len = std.sqrt(dx * dx + dz * dz);
  local nx = -dz / len * w / 2;
  local nz = dx / len * w / 2;
  local y = topAt(outline, y0, thick, r, (a[0] + b[0]) / 2);
  h.prism(id, slot, 'y', [
    [a[1] + nz + cz, a[0] + nx + cx],
    [b[1] + nz + cz, b[0] + nx + cx],
    [b[1] - nz + cz, b[0] - nx + cx],
    [a[1] - nz + cz, a[0] - nx + cx],
  ], y - 0.003, y + 0.002);
// Front plate outlines, top edge on -z: a full-size plate 250 mm by 320 mm with shooter's cuts at the top corners,
// and a 250 mm by 300 mm plate.
local frontPlate(w, l) = [
  [-w / 2 + 0.01, l / 2],
  [w / 2 - 0.01, l / 2],
  [w / 2, l / 2 - 0.01],
  [w / 2, -l / 2 + 0.085],
  [w / 2 - 0.06, -l / 2],
  [-w / 2 + 0.06, -l / 2],
  [-w / 2, -l / 2 + 0.085],
  [-w / 2, l / 2 - 0.01],
];
local esapi = frontPlate(0.25, 0.32);
// A side plate 150 mm by 200 mm with clipped corners.
local esbi = [[-0.065, 0.1], [0.065, 0.1], [0.075, 0.09], [0.075, -0.09], [0.065, -0.1], [-0.065, -0.1], [-0.075, -0.09], [-0.075, 0.09]];
// A ceramic plate: a polyethylene backing under a ceramic strike face. Slots: backing, face.
local ceramicPlate(outline, n) = plate('backing', 'backing', outline, 0, 0.006, 0.5, n) + plate('face', 'face', outline, 0.006, 0.016, 0.5, n);
// A cracked ceramic front plate: one corner broken off to a ragged edge.
local esapiBroken = [
  [-0.115, 0.16],
  [0.03, 0.16],
  [0.125, 0.085],
  [0.125, -0.075],
  [0.065, -0.16],
  [-0.065, -0.16],
  [-0.125, -0.075],
  [-0.125, 0.15],
];
local esbiBroken = [[-0.065, 0.1], [0.01, 0.1], [0.075, 0.04], [0.075, -0.09], [0.065, -0.1], [-0.065, -0.1], [-0.075, -0.09], [-0.075, 0.09]];
local crack(prefix, outline, pts) = [
  onFace('%s-%d' % [prefix, i], 'crack', outline, 0, 0.022, 0.5, pts[i], pts[i + 1], 0.004)
  for i in std.range(0, std.length(pts) - 2)
];
// A hand-cut steel front plate, 250 mm by 300 mm and 4 mm thick, on a nylon pad, with two webbing straps wrapped
// round both and buckled on the face. Slots: pad, plate, strap, buckle.
local steelFront = [
  [-0.118, 0.15],
  [0.12, 0.148],
  [0.125, 0.14],
  [0.124, -0.065],
  [0.07, -0.15],
  [-0.055, -0.148],
  [-0.125, -0.07],
  [-0.123, 0.142],
];
local steelSide = [[0.0, -0.1], [0.075, -0.055], [0.073, 0.057], [0.0, 0.1], [-0.075, 0.054], [-0.074, -0.056]];
local strapsOver(outline, y0, thick, r, zs, halfW) = std.flattenArrays([
  [
    onFace('strap-%d' % i, 'strap', outline, y0, thick, r, [-halfW, zs[i]], [halfW, zs[i]], 0.025),
    box('strap-left-%d' % i, 'strap', [-halfW - 0.003, 0, zs[i] - 0.0125], [-halfW, y0 + thick, zs[i] + 0.0125]),
    box('strap-right-%d' % i, 'strap', [halfW, 0, zs[i] - 0.0125], [halfW + 0.003, y0 + thick, zs[i] + 0.0125]),
    box('buckle-%d' % i, 'buckle', [0.03, topAt(outline, y0, thick, r, 0.045), zs[i] - 0.016], [0.06, topAt(outline, y0, thick, r, 0.045) + 0.006, zs[i] + 0.016]),
  ]
  for i in std.range(0, std.length(zs) - 1)
]);
local steelPlate(id, massKg, outline, pad, zs, halfW) = h.compound(id, massKg,
  plate('pad', 'pad', pad, 0, 0.004, 0.5, 8)
  + plate('plate', 'plate', outline, 0.004, 0.004, 0.5, 8)
  + strapsOver(outline, 0.004, 0.004, 0.5, zs, halfW), {
    pad: 'cloth-olive-drab',
    plate: 'steel-heat-tint',
    strap: 'webbing-black',
    buckle: 'plastic-matte-black',
  }) + { voxelGrain: 0.004 };
// A soft deltoid plate 210 mm long and 165 mm wide, rounded at the shoulder end.
local deltoid = [[-0.0825, 0.105], [0.0825, 0.105], [0.0825, -0.04], [0.06, -0.085], [0.025, -0.105], [-0.025, -0.105], [-0.06, -0.085], [-0.0825, -0.04]];
// The ballistic groin protector's flaps: a front flap 240 mm tapering to 140 mm over 220 mm, and a broader back
// flap; their straight top edge sits at -z.
local groinFront = [[-0.12, -0.11], [0.12, -0.11], [0.12, -0.02], [0.07, 0.11], [-0.07, 0.11], [-0.12, -0.02]];
local groinBack = [[-0.13, -0.125], [0.13, -0.125], [0.13, 0.0], [0.08, 0.125], [-0.08, 0.125], [-0.13, 0.0]];
// A flat crescent between radii r0 and r1 over the angle range [a0, a1] in degrees, as `steps` [x, z] quads, since
// prisms must be convex; 0 degrees points to +z.
local crescent(r0, r1, a0, a1, steps) =
  local ang(i) = (a0 + (a1 - a0) * i / steps) * std.pi / 180;
  local pt(r, i) = [r * std.sin(ang(i)), r * std.cos(ang(i))];
  [[pt(r1, i), pt(r1, i + 1), pt(r0, i + 1), pt(r0, i)] for i in std.range(0, steps - 1)];
local ring(prefix, slot, quads, y0, y1, cx=0, cz=0) = [
  h.prism('%s-%d' % [prefix, i], slot, 'y', [[p[1] + cz, p[0] + cx] for p in quads[i]], y0, y1)
  for i in std.range(0, std.length(quads) - 1)
];
// Webbing rows 25 mm wide lying on a flat face at height y, running along x from x0 to x1, at each z in zs.
local flatRows(prefix, slot, x0, x1, zs, y, t=0.003) = [
  box('%s-%d' % [prefix, i], slot, [x0, y, zs[i]], [x1, y + t, zs[i] + 0.025])
  for i in std.range(0, std.length(zs) - 1)
];
local eod = [[-0.18, 0.2], [-0.14, 0.23], [0.14, 0.23], [0.18, 0.2], [0.18, -0.13], [0.1, -0.23], [-0.1, -0.23], [-0.18, -0.13]];
local scaled(outline, k) = [[p[0] * k, p[1] * k] for p in outline];
local flat(id, slot, outline, y0, y1, cx=0, cz=0) = h.prism(id, slot, 'y', [[p[1] + cz, p[0] + cx] for p in outline], y0, y1);
[
  // A light plate carrier lying flat, front up: a front panel 280 mm wide and 340 mm long over a slightly larger
  // back panel, joined by shoulder straps at the top, with webbed cummerbund wings 120 mm long either side and a
  // small flapped pouch sewn low on the front.
  h.compound('light_plate_carrier_pouch', 0.6, [
    box('back', 'cloth', [-0.15, 0, -0.18], [0.15, 0.02, 0.17]),
    box('front', 'cloth', [-0.14, 0.02, -0.16], [0.14, 0.045, 0.17]),
    box('shoulder-left', 'cloth', [-0.12, 0.02, -0.21], [-0.07, 0.04, -0.16]),
    box('shoulder-right', 'cloth', [0.07, 0.02, -0.21], [0.12, 0.04, -0.16]),
    box('pad-left', 'strap', [-0.125, 0.04, -0.205], [-0.065, 0.046, -0.17]),
    box('pad-right', 'strap', [0.065, 0.04, -0.205], [0.125, 0.046, -0.17]),
    box('collar-cut', 'binding', [-0.065, 0.045, -0.163], [0.065, 0.049, -0.155]),
    box('wing-left', 'cloth', [-0.27, 0, -0.02], [-0.15, 0.006, 0.13]),
    box('wing-right', 'cloth', [0.15, 0, -0.02], [0.27, 0.006, 0.13]),
    box('pouch', 'cloth', [-0.08, 0.045, 0.04], [0.08, 0.075, 0.15]),
    box('pouch-flap', 'flap', [-0.083, 0.075, 0.04], [0.083, 0.078, 0.09]),
    box('pouch-flap-front', 'flap', [-0.083, 0.06, 0.035], [0.083, 0.078, 0.04]),
    box('pull', 'binding', [-0.015, 0.078, 0.08], [0.015, 0.081, 0.1]),
  ] + flatRows('wing-left-row', 'strap', -0.26, -0.16, [-0.01, 0.04, 0.09], 0.006)
  + flatRows('wing-right-row', 'strap', 0.16, 0.26, [-0.01, 0.04, 0.09], 0.006), { cloth: 'nylon-coyote', flap: 'nylon-coyote', strap: 'webbing-olive-dark', binding: 'plastic-matte-black' })
  + { voxelGrain: 0.004 },

  // A hardened-steel front plate 250 mm by 300 mm cut by hand, its edges a little crooked, on a nylon pad and
  // strapped on with two webbing straps.
  steelPlate('forged_steel_front_plate', 2, steelFront, frontPlate(0.256, 0.306), [-0.06, 0.08], 0.128),

  // A hardened-steel side plate 150 mm by 200 mm cut as a long hexagon, on a nylon pad and strapped on with one
  // webbing strap.
  steelPlate('forged_steel_side_plate', 0.68, steelSide, [[0.0, -0.105], [0.08, -0.058], [0.08, 0.058], [0.0, 0.105], [-0.08, 0.058], [-0.08, -0.058]], [0.0], 0.08),

  // A pair of deltoid plates 210 mm long and 165 mm wide, 22 mm thick and curved to sit over the shoulder, lying side
  // by side in black covers with a white label on each face.
  h.compound('deltoid_plates', 0.4,
    plate('left', 'cover', deltoid, 0, 0.022, 0.18, 8, -0.095)
    + plate('right', 'cover', deltoid, 0, 0.022, 0.18, 8, 0.095)
    + [
      onFace('label-left', 'label', deltoid, 0, 0.022, 0.18, [-0.03, 0.03], [0.03, 0.03], 0.016, -0.095),
      onFace('label-right', 'label', deltoid, 0, 0.022, 0.18, [-0.03, 0.03], [0.03, 0.03], 0.016, 0.095),
    ], { cover: 'plastic-matte-black', label: 'plastic-white' })
  + { voxelGrain: 0.004 },

  // A ceramic front plate 250 mm by 320 mm and 22 mm thick, cracked across from a strike near its middle, with a
  // corner broken away and lying beside it.
  h.compound('cracked_ceramic_front_plate', 2.7, plate('backing', 'backing', esapiBroken, 0, 0.006, 0.5, 10)
    + plate('face', 'face', esapiBroken, 0.006, 0.016, 0.5, 10)
    + crack('crack-a', esapiBroken, [[0.01, -0.01], [-0.04, -0.06], [-0.06, -0.12], [-0.05, -0.155]])
    + crack('crack-b', esapiBroken, [[0.01, -0.01], [0.07, 0.01], [0.124, 0.03]])
    + crack('crack-c', esapiBroken, [[0.01, -0.01], [-0.03, 0.06], [-0.08, 0.1], [-0.124, 0.12]])
    + crack('crack-d', esapiBroken, [[0.01, -0.01], [0.03, 0.08], [0.045, 0.13]])
    + [
      flat('shard', 'face', [[0.04, 0.17], [0.075, 0.165], [0.095, 0.2], [0.06, 0.215]], 0, 0.016, 0.06, 0.0),
    ], { backing: 'enamel-white', face: 'ceramic-grey', crack: 'plastic-charcoal' })
  + { voxelGrain: 0.004 },

  // A ceramic side plate 150 mm by 200 mm and 22 mm thick, cracked through with one corner broken away.
  h.compound('cracked_ceramic_side_plate', 1.1, plate('backing', 'backing', esbiBroken, 0, 0.006, 0.5, 6)
    + plate('face', 'face', esbiBroken, 0.006, 0.016, 0.5, 6)
    + crack('crack-a', esbiBroken, [[-0.005, 0.0], [-0.03, -0.05], [-0.025, -0.098]])
    + crack('crack-b', esbiBroken, [[-0.005, 0.0], [-0.074, 0.04]])
    + crack('crack-c', esbiBroken, [[-0.005, 0.0], [0.04, 0.03], [0.06, 0.055]])
    + [
      flat('shard', 'face', [[0.03, 0.11], [0.065, 0.1], [0.08, 0.135], [0.045, 0.14]], 0, 0.016, 0.04, 0.0),
    ], { backing: 'enamel-white', face: 'ceramic-grey', crack: 'plastic-charcoal' })
  + { voxelGrain: 0.004 },

  // A bomb-suit chest plate 360 mm wide and 460 mm long, 18 mm thick and gently curved, its edge showing its layers:
  // Kevlar, foam, polyethylene and a thin steel face, each a little smaller than the one under it.
  h.compound('eod_plate', 4.5,
    plate('kevlar', 'kevlar', eod, 0, 0.004, 0.7, 12)
    + plate('foam', 'foam', scaled(eod, 0.96), 0.004, 0.006, 0.7, 12, curveHalf=0.18)
    + plate('poly', 'poly', scaled(eod, 0.92), 0.01, 0.004, 0.7, 12, curveHalf=0.18)
    + plate('steel', 'steel', scaled(eod, 0.88), 0.014, 0.004, 0.7, 12, curveHalf=0.18), {
      kevlar: 'aramid-gold',
      foam: 'felt-grey',
      poly: 'enamel-white',
      steel: 'steel-grey',
    })
  + { voxelGrain: 0.004 },

  // A ceramic front plate 250 mm by 320 mm and 22 mm thick, curved across, with shooter's cuts at its top corners,
  // a white polyethylene backing and a label on the strike face.
  h.compound('esapi_plate', 2.8, ceramicPlate(esapi, 10) + [
    onFace('label', 'label', esapi, 0, 0.022, 0.5, [-0.05, -0.08], [0.05, -0.08], 0.02),
  ], { backing: 'enamel-white', face: 'ceramic-grey', label: 'plastic-white' })
  + { voxelGrain: 0.004 },

  // A ceramic side plate 150 mm by 200 mm and 22 mm thick with clipped corners and a label on the strike face.
  h.compound('esbi_plate', 1.1, ceramicPlate(esbi, 6) + [
    onFace('label', 'label', esbi, 0, 0.022, 0.5, [-0.035, -0.05], [0.035, -0.05], 0.016),
  ], { backing: 'enamel-white', face: 'ceramic-grey', label: 'plastic-white' })
  + { voxelGrain: 0.004 },

  // A soft ballistic vest lying flat, front up: a front panel 400 mm wide and 460 mm long over the back panel, with
  // shoulder straps, wide side straps, a yellow lettered band across the chest, two columns of webbing low on the
  // front and a flapped evidence pocket between them.
  h.compound('agency_ballistic_vest', 2.2, [
    box('back', 'cloth', [-0.21, 0, -0.24], [0.21, 0.02, 0.23]),
    box('front', 'cloth', [-0.2, 0.02, -0.21], [0.2, 0.045, 0.23]),
    box('shoulder-left', 'cloth', [-0.17, 0.02, -0.26], [-0.1, 0.04, -0.21]),
    box('shoulder-right', 'cloth', [0.1, 0.02, -0.26], [0.17, 0.04, -0.21]),
    box('neck', 'binding', [-0.1, 0.045, -0.214], [0.1, 0.049, -0.205]),
    box('side-left', 'strap', [-0.33, 0, -0.04], [-0.21, 0.006, 0.08]),
    box('side-right', 'strap', [0.21, 0, -0.04], [0.33, 0.006, 0.08]),
    box('tab-left', 'binding', [-0.33, 0.006, -0.03], [-0.29, 0.01, 0.07]),
    box('tab-right', 'binding', [0.29, 0.006, -0.03], [0.33, 0.01, 0.07]),
    box('lettering', 'lettering', [-0.15, 0.045, -0.15], [0.15, 0.048, -0.08]),
    box('pocket', 'cloth', [-0.065, 0.045, 0.02], [0.065, 0.062, 0.2]),
    box('pocket-flap', 'flap', [-0.068, 0.062, 0.02], [0.068, 0.065, 0.07]),
  ] + flatRows('left-row', 'strap', -0.19, -0.08, [0.02, 0.07, 0.12, 0.17], 0.045)
  + flatRows('right-row', 'strap', 0.08, 0.19, [0.02, 0.07, 0.12, 0.17], 0.045), {
    cloth: 'cloth-olive-drab',
    flap: 'cloth-olive-drab',
    strap: 'webbing-olive-dark',
    binding: 'plastic-matte-black',
    lettering: 'plastic-yellow',
  })
  + { voxelGrain: 0.004 },

  // A tempered-steel plate 250 mm by 300 mm and 6.5 mm thick, curved across with shooter's cuts, bare grey steel.
  h.compound('heavy_steel_plate', 3.2, plate('plate', 'plate', frontPlate(0.25, 0.3), 0, 0.0065, 0.45, 10), { plate: 'steel-grey' })
  + { voxelGrain: 0.004 },

  // A ballistic groin protector laid flat: a front flap 240 mm wide tapering over 220 mm and a broader back flap,
  // each 14 mm thick with padded inserts, a webbing hanger along the top edge and press studs to fix it to a vest.
  h.compound('ballistic_groin_protector', 0.47,
    [flat('front', 'cloth', groinFront, 0, 0.014, -0.135), flat('back', 'cloth', groinBack, 0, 0.014, 0.135)]
    + flatRows('hanger-front', 'strap', -0.25, -0.02, [-0.11], 0.014)
    + flatRows('hanger-back', 'strap', 0.01, 0.26, [-0.125], 0.014)
    + [
      h.disc('stud-%d' % i, 'stud', 0.007, 0.017, 0.021, x, z)
      for i in std.range(0, 3)
      for x in [[-0.22, -0.05, 0.04, 0.23][i]]
      for z in [[-0.097, -0.097, -0.112, -0.112][i]]
    ], { cloth: 'nylon-coyote', strap: 'webbing-olive-dark', stud: 'plastic-matte-black' })
  + { voxelGrain: 0.004 },

  // A ballistic collar laid flat in two padded parts 25 mm thick: a front half-ring 300 mm across that wraps the
  // throat, and a shorter back piece, each with a webbing tab to fix it to a vest's neckline.
  h.compound('ballistic_collar', 0.4,
    ring('front', 'cloth', crescent(0.09, 0.15, 95, 265, 12), 0, 0.025, 0, -0.05)
    + ring('back', 'cloth', crescent(0.1, 0.15, -55, 55, 6), 0, 0.025, 0, -0.06)
    + ring('front-edge', 'strap', crescent(0.09, 0.1, 95, 265, 12), 0.025, 0.028, 0, -0.05)
    + ring('back-edge', 'strap', crescent(0.1, 0.11, -55, 55, 6), 0.025, 0.028, 0, -0.06)
    + [
      box('tab-front', 'strap', [-0.02, 0, -0.145], [0.02, 0.004, -0.1]),
      box('tab-back', 'strap', [-0.02, 0, -0.005], [0.02, 0.004, 0.045]),
    ], { cloth: 'nylon-coyote', strap: 'webbing-olive-dark' })
  + { voxelGrain: 0.004 },
]
