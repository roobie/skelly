local h = import '../compound.libsonnet';
local box = h.box;

// Jewellery and small worn pieces: two wristwatches, spent cartridge cases on cords, a pocket reliquary, a costume
// tail, a tie clip, wooden hair beads and a woven anklet, each lying as it is found loose.

local rad(a) = a * std.pi / 180;
// The [x, z] point at `a` degrees on a circle of radius r round [cx, cz]; 0 points to +z, 90 to +x.
local onCircle(r, a, cx=0, cz=0) = [cx + r * std.sin(rad(a)), cz + r * std.cos(rad(a))];
// A flat convex outline of [x, z] points lying on y from y0 to y1.
local flat(id, slot, pts, y0, y1) = h.prism(id, slot, 'y', [[p[1], p[0]] for p in pts], y0, y1);
// An oval outline of `n` points, half-axes a along x and b along z, round [cx, cz].
local oval(a, b, n=16, cx=0, cz=0) = [[cx + a * std.cos(2 * std.pi * i / n), cz + b * std.sin(2 * std.pi * i / n)] for i in std.range(0, n - 1)];
// A ball of radius r resting on y0 at [x, z].
local ball(id, slot, r, x, z, y0=0, steps=6) =
  h.turned(id, slot, 'y', [[r * (1 - std.cos(std.pi * i / steps)), r * std.sin(std.pi * i / steps)] for i in std.range(0, steps)], [x, y0, z]);
// A ring of wire radius r bent to radius R about `axis` through `origin`; its outline closes on its first point.
local torus(id, slot, R, r, axis, origin, steps=8) =
  h.turned(id, slot, axis, [[r * std.sin(2 * std.pi * i / steps), R + r * std.cos(2 * std.pi * i / steps)] for i in std.range(0, steps)], origin);
// A flat ring lying on y from y0 to y1 between radii r0 and r1, round [cx, cz].
local ring(id, slot, r0, r1, y0, y1, cx=0, cz=0) = h.turned(id, slot, 'y', [[0, r0], [0, r1], [y1 - y0, r1], [y1 - y0, r0], [0, r0]], [cx, y0, cz]);

// A watch bracelet of three-piece links laid open along z on both sides of a case of radius `cr`, `n` links a side,
// each `w` wide: a raised centre link between two outer links. Slots link and centre.
local bracelet(cr, n, w) = std.flattenArrays([
  local z0 = s * (cr - 0.001 + 0.009 * k), z1 = s * (cr - 0.001 + 0.009 * k + 0.008);
  [
    box('link-%s-%d-mid' % [side, k], 'centre', [-w * 0.22, 0.001, std.min(z0, z1)], [w * 0.22, 0.0065, std.max(z0, z1)]),
    box('link-%s-%d-l' % [side, k], 'link', [-w / 2, 0, std.min(z0, z1)], [-w * 0.24, 0.005, std.max(z0, z1)]),
    box('link-%s-%d-r' % [side, k], 'link', [w * 0.24, 0, std.min(z0, z1)], [w / 2, 0.005, std.max(z0, z1)]),
  ]
  for side in ['n', 's']
  for s in [if side == 'n' then 1 else -1]
  for k in std.range(0, n - 1)
]);

// A spent cartridge case lying along z with its head toward -z at z0: a rim, an extractor groove, the body and, when
// `nl` > 0, a shoulder and neck of radius rn; its open mouth painted dark and the primer on the head. Slots case,
// mouth, primer.
local casing(len, r, rn, nl, z0, y) =
  local rm = if nl > 0 then rn else r;
  [
    h.turned('case', 'case', 'z', [[0, 0], [0, r], [0.0015, r], [0.0015, r * 0.82], [0.0035, r * 0.82], [0.0045, r]]
                                  + (if nl > 0 then [[len - nl - r * 0.5, r], [len - nl, rn]] else [])
                                  + [[len, rm], [len, 0]], [0, y, z0]),
    h.turned('mouth', 'mouth', 'z', [[0, 0], [0, rm * 0.8], [0.0006, rm * 0.8], [0.0006, 0]], [0, y, z0 + len - 0.0002]),
    h.turned('primer', 'primer', 'z', [[0, 0], [0, r * 0.32], [0.0006, r * 0.32], [0.0006, 0]], [0, y, z0 - 0.0005]),
  ];

// A spent case hung on a plain cotton cord: the cord lies in a ring 130 mm across with a knot at the back, and is
// wound round the case's extractor groove at the front, the case lying mouth outward. `body` is [length, radius,
// neck radius, neck length].
local cordNecklace(id, mass, body) =
  local len = body[0], r = body[1], rn = body[2], nl = body[3];
  local R = 0.065, z0 = R + 0.003;
  h.compound(id, mass,
             [
               torus('cord', 'cord', R, 0.0013, 'y', [0, 0.0013, 0]),
               ball('knot', 'cord', 0.0035, 0, -R, 0),
               flat('knot-end-a', 'cord', [[-0.001, -R - 0.002], [0.001, -R - 0.002], [-0.004, -R - 0.02], [-0.006, -R - 0.019]], 0, 0.0022),
               flat('knot-end-b', 'cord', [[-0.001, -R - 0.002], [0.001, -R - 0.002], [0.006, -R - 0.019], [0.004, -R - 0.02]], 0, 0.0022),
               torus('wrap-a', 'cord', r * 0.82 + 0.0006, 0.0011, 'z', [0, r, z0 + 0.0022]),
             ]
             + casing(len, r, rn, nl, z0, r),
             { cord: 'cord-cotton', case: 'brass-dull', mouth: 'plastic-charcoal', primer: 'metal-silver' })
  + { voxelGrain: 0.002 };

[
  // A large dress watch lying face up with its bracelet opened out, 220 mm end to end: a 44 mm gold case with a
  // silver bezel studded with gold hour marks, a silver dial with gold hands and a gold crown on +x, on a gold
  // bracelet whose raised centre links are silver.
  h.compound('sf_watch', 0.2,
             [
               h.disc('case', 'case', 0.022, 0, 0.01),
               ring('bezel', 'bezel', 0.0165, 0.0222, 0.01, 0.0135),
               h.disc('dial', 'dial', 0.0165, 0.01, 0.011),
               box('hand-hour', 'hand', [-0.001, 0.011, -0.001], [0.0095, 0.0122, 0.0012]),
               box('hand-minute', 'hand', [-0.0008, 0.011, -0.0145], [0.0008, 0.0124, 0.001]),
               ball('pin', 'hand', 0.0015, 0, 0, 0.0115),
               h.rod('crown', 'case', 0.0035, 0.021, 0.027, 0.006),
             ]
             + [
               local p = onCircle(0.0193, 30 * i);
               ball('mark-%d' % i, 'hand', if i % 3 == 0 then 0.0016 else 0.0011, p[0], p[1], 0.0128)
               for i in std.range(0, 11)
             ]
             + bracelet(0.021, 9, 0.022)
             + [
               box('clasp', 'link', [-0.011, 0, -0.112], [0.011, 0.007, -0.1]),
               box('clasp-plate', 'centre', [-0.008, 0.007, -0.11], [0.008, 0.008, -0.102]),
             ],
             { case: 'metal-gold', bezel: 'metal-silver', dial: 'metal-silver', hand: 'metal-gold', link: 'metal-gold', centre: 'metal-silver' })
  + { voxelGrain: 0.002 },

  // A plain cotton cord laid in a ring 130 mm across, knotted at the back, wound at the front round the groove of
  // a spent 25 mm cannon case 80 mm long lying mouth outward.
  cordNecklace('simple_ordnance_cartridge_necklace', 0.046, [0.08, 0.0125, 0, 0]),

  // The same cord with a spent 9 mm pistol case 19 mm long.
  cordNecklace('simple_pistol_cartridge_necklace', 0.0055, [0.019, 0.0049, 0, 0]),

  // The same cord with a spent bottlenecked rifle case 51 mm long, 12 mm across the body.
  cordNecklace('simple_rifle_cartridge_necklace', 0.014, [0.051, 0.006, 0.0042, 0.009]),

  // A pocket reliquary lying open, 75 mm across: an oval silver case 36 mm by 28 mm and 8 mm deep lined in red
  // velvet with a sliver of bone bedded in it, its lid hinged open at -z bearing a raised cross, and a ring at +z.
  h.compound('small_relic', 0.04,
             [
               flat('case', 'silver', oval(0.014, 0.018, 20, 0, 0.012), 0, 0.007),
               flat('rim', 'silver', oval(0.015, 0.019, 20, 0, 0.012), 0.006, 0.008),
               flat('lining', 'lining', oval(0.0115, 0.0155, 20, 0, 0.012), 0.008, 0.0085),
               flat('bone', 'bone', [[-0.0025, 0.002], [0.003, 0.003], [0.0035, 0.022], [-0.001, 0.023], [-0.003, 0.016]], 0.0085, 0.0115),
               flat('lid', 'silver', oval(0.015, 0.019, 20, 0, -0.026), 0, 0.003),
               box('cross-long', 'relief', [-0.0015, 0.003, -0.039], [0.0015, 0.0045, -0.013]),
               box('cross-bar', 'relief', [-0.008, 0.003, -0.0335], [0.008, 0.0045, -0.0305]),
               box('hinge', 'silver', [-0.006, 0, -0.008], [0.006, 0.004, -0.005]),
               torus('bail', 'silver', 0.004, 0.0012, 'z', [0, 0.004, 0.032], 6),
             ],
             { silver: 'metal-silver', relief: 'metal-silver', lining: 'velvet-red', bone: 'bone' })
  + { voxelGrain: 0.002 },

  // A costume bunny tail: a fluffy white pom-pom 80 mm across sitting on its flat back, a cluster of soft balls round
  // a core, with a black clip on the back for a belt or waistband.
  h.compound('tail_bunny_playboy', 0.018,
             [
               box('clip', 'clip', [-0.012, 0, -0.022], [0.012, 0.006, 0.022]),
               ball('core', 'fur', 0.034, 0, 0, 0.004),
             ]
             + [
               local p = onCircle(0.024, 72 * i + 20);
               ball('puff-%d' % i, 'fur', 0.018, p[0], p[1], 0.008)
               for i in std.range(0, 4)
             ]
             + [
               local p = onCircle(0.013, 120 * i + 70);
               ball('top-%d' % i, 'fur', 0.016, p[0], p[1], 0.04)
               for i in std.range(0, 2)
             ],
             { fur: 'fur-pale', clip: 'plastic-matte-black' })
  + { voxelGrain: 0.002 },

  // A silver tie clip 55 mm long and 6 mm wide lying flat: a polished front bar with an engraved band near one end,
  // folded back on itself into a spring blade beneath.
  h.compound('tieclip', 0.0084,
             [
               box('blade', 'silver', [-0.0255, 0, -0.0025], [0.026, 0.001, 0.0025]),
               h.tube('fold', 'silver', 0, 0.00175, -0.0025, 0.0025, 0, 0) + { axis: 'z', origin: [0.0265, 0.00175, -0.0025] },
               box('bar', 'silver', [-0.0275, 0.002, -0.003], [0.0275, 0.0035, 0.003]),
               box('band-a', 'line', [-0.018, 0.0035, -0.003], [-0.017, 0.0040, 0.003]),
               box('band-b', 'line', [-0.015, 0.0035, -0.003], [-0.014, 0.0040, 0.003]),
             ],
             { silver: 'metal-silver', line: 'plastic-charcoal' })
  + { voxelGrain: 0.002 },

  // A handful of wooden hair beads loose in a heap 55 mm across: fourteen round and barrel beads 8 to 12 mm thick,
  // each with a hole through for a braid, in pale and dark woods.
  h.compound('wooden_hair_beads', 0.0046,
             [
               local p = onCircle(b[0], b[1]);
               local r = b[2], t = b[3];
               h.turned('bead-%d' % i, if i % 3 == 0 then 'dark' else 'pale', 'y',
                        [[0, 0.0018], [0, r * 0.75], [t * 0.3, r], [t * 0.7, r], [t, r * 0.75], [t, 0.0018], [0, 0.0018]],
                        [p[0], b[4], p[1]])
               for i in std.range(0, 13)
               for b in [[
                 [0, 0, 0.006, 0.008, 0.006],
                 [0.012, 0, 0.005, 0.009, 0],
                 [0.012, 60, 0.0055, 0.007, 0],
                 [0.012, 120, 0.005, 0.01, 0],
                 [0.012, 180, 0.006, 0.008, 0],
                 [0.012, 240, 0.0045, 0.009, 0],
                 [0.012, 300, 0.005, 0.008, 0],
                 [0.024, 30, 0.0045, 0.008, 0],
                 [0.024, 90, 0.005, 0.01, 0],
                 [0.023, 150, 0.0055, 0.007, 0],
                 [0.024, 210, 0.0045, 0.009, 0],
                 [0.024, 270, 0.005, 0.008, 0],
                 [0.023, 330, 0.004, 0.008, 0],
                 [0.006, 200, 0.0045, 0.008, 0.009],
               ][i]]
             ],
             { pale: 'wood-birch', dark: 'wood-walnut' })
  + { voxelGrain: 0.002 },

  // A woven cord anklet lying flat in a ring 80 mm across: a band 6 mm wide woven in repeating red, yellow, green
  // and blue chevrons, its tie ends knotted and trailing at -z.
  local R = 0.04;
  h.compound('woven_anklet', 0.002,
             std.flattenArrays([
               h.crescent('band-%d' % i, ['red', 'yellow', 'green', 'blue'][i % 4], R - 0.003, R + 0.003, 192 + 336 * i / 32, 192 + 336 * (i + 1) / 32, 1, 0, 0.0025)
               for i in std.range(0, 31)
             ])
             + [
               local a = 192 + 336 * (i + 0.5) / 32;
               h.prism('chevron-%d' % i, 'yellow', 'y', [[q[1], q[0]] for q in [onCircle(R - 0.0026, a - 2), onCircle(R, a + 2.5), onCircle(R + 0.0026, a - 2)]], 0.0025, 0.0035)
               for i in std.range(0, 31)
               if i % 4 == 0
             ]
             + [
               box('knot', 'red', [-0.005, 0, -R - 0.004], [0.005, 0.005, -R + 0.003]),
               flat('tail-left', 'blue', [[-0.002, -R - 0.004], [0.001, -R - 0.004], [-0.007, -R - 0.03], [-0.01, -R - 0.029]], 0, 0.002),
               flat('tail-right', 'green', [[-0.001, -R - 0.004], [0.002, -R - 0.004], [0.01, -R - 0.029], [0.007, -R - 0.03]], 0, 0.002),
             ],
             { red: 'cloth-red', yellow: 'cloth-yellow', green: 'cloth-green', blue: 'cloth-blue' })
  + { voxelGrain: 0.002 },

  // A plain digital wristwatch lying face up with its strap opened out, 230 mm end to end: a black plastic case
  // 38 mm across with a steel face plate, a green display and four steel buttons on its sides, on a black resin
  // strap with a steel buckle at one end and a row of holes along the other.
  h.compound('wristwatch', 0.033,
             [
               flat('case', 'case', [onCircle(0.019, 22.5 + 45 * i) for i in std.range(0, 7)], 0, 0.011),
               flat('plate', 'plate', [onCircle(0.0165, 22.5 + 45 * i) for i in std.range(0, 7)], 0.011, 0.012),
               box('display', 'display', [-0.011, 0.012, -0.007], [0.011, 0.0126, 0.006]),
               box('digit-a', 'digit', [-0.009, 0.0126, -0.003], [-0.007, 0.0128, 0.003]),
               box('digit-b', 'digit', [-0.004, 0.0126, -0.003], [-0.001, 0.0128, 0.003]),
               box('digit-colon', 'digit', [0.0003, 0.0126, -0.0015], [0.0011, 0.0128, 0.0015]),
               box('digit-c', 'digit', [0.0025, 0.0126, -0.003], [0.0055, 0.0128, 0.003]),
               box('digit-d', 'digit', [0.0068, 0.0126, -0.003], [0.0095, 0.0128, 0.003]),
               box('label', 'digit', [-0.007, 0.0122, 0.01], [0.007, 0.0124, 0.012]),
             ]
             + [
               box('button-%d' % i, 'button', [s * 0.0175 + (if s > 0 then 0 else -0.003), 0.004, z - 0.002], [s * 0.0175 + (if s > 0 then 0.003 else 0), 0.007, z + 0.002])
               for i in std.range(0, 3)
               for s in [if i < 2 then -1 else 1]
               for z in [if i % 2 == 0 then -0.009 else 0.009]
             ]
             + [
               box('strap-n', 'strap', [-0.011, 0.001, 0.018], [0.011, 0.004, 0.115]),
               box('strap-s', 'strap', [-0.011, 0.001, -0.095], [0.011, 0.004, -0.018]),
               box('keeper', 'strap', [-0.0125, 0.001, -0.088], [0.0125, 0.006, -0.083]),
               box('buckle-l', 'buckle', [-0.014, 0.001, -0.115], [-0.011, 0.004, -0.095]),
               box('buckle-r', 'buckle', [0.011, 0.001, -0.115], [0.014, 0.004, -0.095]),
               box('buckle-end', 'buckle', [-0.014, 0.001, -0.118], [0.014, 0.004, -0.115]),
               box('tongue', 'buckle', [-0.0012, 0.004, -0.115], [0.0012, 0.0055, -0.097]),
             ]
             + [h.disc('hole-%d' % i, 'hole', 0.0012, 0.0035, 0.0042, 0, 0.06 + 0.007 * i) for i in std.range(0, 6)],
             { case: 'plastic-matte-black', plate: 'steel-bright', display: 'lcd-green', digit: 'plastic-black', button: 'steel-bright', strap: 'rubber-black', buckle: 'steel-bright', hole: 'plastic-charcoal' })
  + { voxelGrain: 0.002 },
]
