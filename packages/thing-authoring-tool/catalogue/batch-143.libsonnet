local h = import '../compound.libsonnet';
local box = h.box;

// Jewellery and costume pieces: cowrie shells, cufflinks, wrist cuffs, a diver's watch, an ear plug, cartridge
// pendants on chains, and costume horns, ears, tails and a collar, each lying or standing as it is found loose.

local rad(a) = a * std.pi / 180;

// A cowrie shell lying slit up on the floor, `len` long along `axis` ('x' or 'z'), centred on (x, z). Slots: shell, slit.
local cowrie(id, x, z, len, r, axis='x', y0=0) =
  local profile = [[0, 0], [len * 0.08, r * 0.55], [len * 0.3, r], [len * 0.7, r], [len * 0.92, r * 0.55], [len, 0]];
  [
    h.turned(id, 'shell', axis, profile, if axis == 'x' then [x - len / 2, y0 + r, z] else [x, y0 + r, z - len / 2]),
    if axis == 'x' then box(id + '-slit', 'slit', [x - len * 0.32, y0 + 2 * r - 0.0015, z - 0.001], [x + len * 0.32, y0 + 2 * r + 0.0003, z + 0.001])
    else box(id + '-slit', 'slit', [x - 0.001, y0 + 2 * r - 0.0015, z - len * 0.32], [x + 0.001, y0 + 2 * r + 0.0003, z + len * 0.32]),
  ];

// A flat ring of cord or chain lying on the floor, centre radius r, `w` wide and `t` thick.
local loop(prefix, slot, r, w, t, cz=0, a0=0, a1=360, steps=36) = h.crescent(prefix, slot, r - w / 2, r + w / 2, a0, a1, steps, 0, t, 0, cz);

// An upright arc in the x-y plane, as a headband stands on its two ends: radii r0 to r1, angles a0 to a1 (0 points
// up), its centre at height cy, from z0 to z1.
local arcXY(prefix, slot, r0, r1, a0, a1, steps, cy, z0, z1) =
  local pt(r, i) = [r * std.sin(rad(a0 + (a1 - a0) * i / steps)), cy + r * std.cos(rad(a0 + (a1 - a0) * i / steps))];
  [
    h.prism('%s-%d' % [prefix, i], slot, 'z', [pt(r1, i), pt(r1, i + 1), pt(r0, i + 1), pt(r0, i)], z0, z1)
    for i in std.range(0, steps - 1)
  ];

// A headband standing on its ends, 150 mm across, front on +z. Returns the band and the point [x, y] on its outer
// edge at angle a. Slot: band.
local band = { r: 0.075, cy: 0.026, t: 0.004, w: 0.012 };
local headband = arcXY('band', 'band', band.r - band.t, band.r, -112, 112, 28, band.cy, -band.w / 2, band.w / 2);
local onBand(a) = [band.r * std.sin(rad(a)), band.cy + band.r * std.cos(rad(a))];

// A soft tail lying on the floor along a gentle S, made of overlapping balls that taper from `r0` at its root
// (x = -len/2) to `r1` at the tip. The last `tipShare` of balls take slot tip. Slots: tail, tip.
local tail(len, r0, r1, n, wave, tipShare=0) = [
  local f = i / (n - 1);
  local r = r0 + (r1 - r0) * f;
  local x = -len / 2 + len * f;
  local z = wave * std.sin(f * 2 * std.pi);
  h.turned('seg-%d' % i, if f > 1 - tipShare then 'tip' else 'tail', 'y', [[0, 0], [r * 0.3, r * 0.8], [r, r], [r * 1.7, r * 0.8], [r * 2, 0]], [x, 0, z])
  for i in std.range(0, n - 1)
];

// A cufflink standing face up at x: a toggle bar on the floor, a short post and a round face with a domed centre.
// Slots: face, centre, post, bar.
local cufflink(p, x) = [
  box(p + '-bar', 'bar', [x - 0.008, 0, -0.002], [x + 0.008, 0.004, 0.002]),
  h.disc(p + '-post', 'post', 0.002, 0.004, 0.009, x),
  h.turned(p + '-face', 'face', 'y', [[0, 0], [0, 0.0075], [0.002, 0.008], [0.003, 0.0075], [0.003, 0]], [x, 0.009, 0]),
  h.turned(p + '-centre', 'centre', 'y', [[0, 0], [0, 0.0045], [0.0015, 0.0045], [0.0035, 0.0025], [0.004, 0]], [x, 0.0115, 0]),
];

// A spent casing hanging from a chain laid out flat: a fine gold chain ring, a bail ring at the front, and the casing
// lying along z with its head at the bail and its mouth on +z, a stone set in the mouth. `body` is [length, radius,
// neck radius, neck length]. Slots: chain, bail, case, rim, stone.
local cartridgeNecklace(id, mass, body) =
  local len = body[0], r = body[1], rn = body[2], nl = body[3];
  local cr = 0.06, z0 = cr + 0.006;
  h.compound(id, mass, loop('chain', 'chain', cr, 0.0025, 0.002, 0, -176, 176)
                       + [
                         h.tube('bail', 'bail', 0.0015, 0.0035, -0.001, 0.002, 0.0035, cr + 0.002),
                         h.turned('rim', 'rim', 'z', [[0, 0], [0, r * 1.08], [0.002, r * 1.08], [0.002, 0]], [0, r * 1.08, z0]),
                         h.turned('case', 'case', 'z', [[0, 0], [0, r], [len - nl - r * 0.6, r]]
                                                         + (if nl > 0 then [[len - nl, rn], [len, rn]] else [[len, r]])
                                                         + [[len, 0]], [0, r * 1.08, z0 + 0.002]),
                         h.turned('stone', 'stone', 'z', [[0, 0], [0, (if nl > 0 then rn else r) * 0.7], [0.001, (if nl > 0 then rn else r) * 0.7], [0.0025, 0]], [0, r * 1.08, z0 + 0.002 + len]),
                       ],
             { chain: 'metal-gold', bail: 'metal-gold', case: 'brass-polished', rim: 'brass-dull', stone: 'gem-red' })
  + { voxelGrain: 0.002 };

[
  // Cowrie hair beads: five small cowrie shells about 15 mm long, loose in a little heap, ready to thread on a lock.
  h.compound('cowrie_hair_beads', 0.004,
             cowrie('c1', -0.012, -0.006, 0.016, 0.0045)
             + cowrie('c2', 0.009, -0.009, 0.015, 0.0045, 'z')
             + cowrie('c3', 0.001, 0.008, 0.016, 0.0045)
             + cowrie('c4', 0.02, 0.011, 0.014, 0.004, 'z')
             + cowrie('c5', -0.017, 0.014, 0.014, 0.004, 'z'),
             { shell: 'bone', slit: 'leather-chestnut' })
  + { voxelGrain: 0.002 },

  // Cowrie necklace: a cotton cord about 450 mm round laid as a ring 140 mm across, with thirteen 14 mm cowries
  // strung along its front half.
  h.compound('cowrie_necklace', 0.011,
             loop('cord', 'cord', 0.07, 0.003, 0.003)
             + std.flattenArrays([
               local a = -84 + 14 * i;
               local x = 0.07 * std.sin(rad(a)), z = 0.07 * std.cos(rad(a));
               cowrie('c%d' % i, x, z, 0.014, 0.004, if std.abs(a) < 45 then 'x' else 'z')
               for i in std.range(0, 12)
             ]),
             { cord: 'cord-cotton', shell: 'bone', slit: 'leather-chestnut' })
  + { voxelGrain: 0.002 },

  // Cufflinks: a pair, each a 16 mm round face on a post with a swivel bar, standing face up side by side.
  h.compound('cufflinks', 0.021, cufflink('l', -0.012) + cufflink('r', 0.012),
             { face: 'metal-silver', centre: 'metal-silver', post: 'metal-silver', bar: 'metal-silver' })
  + { voxelGrain: 0.002 },

  // Intricate cufflinks: the same silver pair with a raised gold gear round each face and a small gold cog
  // overlapping the domed centre.
  h.compound('cufflinks_intricate', 0.029,
             std.flattenArrays([
               cufflink(p[0], p[1])
               + h.crescent(p[0] + '-gear', 'gear', 0.0055, 0.0072, 0, 360, 12, 0.012, 0.0135, p[1], 0)
               + [
                 local a = rad(30 * i);
                 box('%s-tooth-%d' % [p[0], i], 'gear', [p[1] + 0.0074 * std.sin(a) - 0.001, 0.012, 0.0074 * std.cos(a) - 0.001], [p[1] + 0.0074 * std.sin(a) + 0.001, 0.0138, 0.0074 * std.cos(a) + 0.001])
                 for i in std.range(0, 11)
               ]
               + [h.disc(p[0] + '-cog', 'gear', 0.0025, 0.0145, 0.0165, p[1] + 0.003, 0.003)]
               for p in [['l', -0.012], ['r', 0.012]]
             ]),
             { face: 'metal-silver', centre: 'metal-silver', post: 'metal-silver', bar: 'metal-silver', gear: 'metal-gold' })
  + { voxelGrain: 0.002 },

  // Cuffs: a pair of starched white wrist cuffs, each a thin band 70 mm deep closed into a ring 80 mm across, lying
  // on its side side by side, with a grey stitched hem round each open edge and two dark buttons on the overlap tab.
  h.compound('cuffs', 0.03,
             std.flattenArrays([
               [
                 h.turned('cuff-%d' % i, 'cloth', 'z', [[0, 0.038], [0, 0.04], [0.07, 0.04], [0.07, 0.038], [0, 0.038]], [x, 0.04, -0.035]),
                 box('tab-%d' % i, 'cloth', [x - 0.012, 0.078, -0.031], [x + 0.012, 0.082, 0.031]),
               ]
               + [h.turned('seam-%d-%d' % [i, j], 'seam', 'z', [[0, 0.036], [0, 0.042], [0.004, 0.042], [0.004, 0.036], [0, 0.036]], [x, 0.04, -0.035 + 0.066 * j]) for j in [0, 1]]
               + [h.disc('button-%d-%d' % [i, j], 'button', 0.005, 0.082, 0.085, x + 0.004, -0.015 + 0.03 * j) for j in [0, 1]]
               for i in [0, 1]
               for x in [-0.046 + 0.092 * i]
             ]),
             { cloth: 'cloth-bright-white', seam: 'cloth-heather-grey', button: 'plastic-tortoiseshell' })
  + { voxelGrain: 0.002 },

  // Devil horns: a red plastic headband 150 mm across standing on its ends, with two 45 mm horns that lean outward.
  h.compound('devil_horn_headband', 0.025,
             headband
             + std.flattenArrays([
               local p = onBand(s * 32);
               [
                 h.turned('horn-base-%d' % (s + 1), 'horn', 'y', [[0, 0], [0, 0.012], [0.022, 0.008], [0.022, 0]], [p[0], p[1] - 0.006, 0]),
                 h.turned('horn-tip-%d' % (s + 1), 'horn', 'y', [[0, 0], [0, 0.008], [0.012, 0.005], [0.024, 0]], [p[0] + s * 0.005, p[1] + 0.016, 0]),
               ]
               for s in [-1, 1]
             ]),
             { band: 'lacquer-red', horn: 'lacquer-red' })
  + { voxelGrain: 0.002 },

  // Devil tail: a red plastic tail 600 mm long and 20 mm thick at the root, lying in an S, with a spade tip 60 mm
  // across and a black clip at the root for a belt.
  h.compound('devil_tail', 0.075,
             tail(0.56, 0.01, 0.005, 60, 0.05)
             + [
               h.prism('spade', 'tail', 'y', [[0, 0.272], [0.03, 0.31], [0, 0.345], [-0.03, 0.31]], 0.001, 0.009),
               box('clip', 'clip', [-0.31, 0, -0.012], [-0.285, 0.024, 0.012]),
             ],
             { tail: 'lacquer-red', tip: 'lacquer-red', clip: 'plastic-matte-black' })
  + { voxelGrain: 0.004 },

  // Diver's watch: a 42 mm steel case with a black turning bezel, lying face up on its steel link bracelet, laid
  // open 210 mm long.
  h.compound('diving_watch', 0.14,
             [
               h.disc('case', 'case', 0.021, 0.002, 0.012),
               h.turned('bezel', 'bezel', 'y', [[0, 0.017], [0, 0.0215], [0.004, 0.0205], [0.004, 0.017], [0, 0.017]], [0, 0.012, 0]),
               box('pip', 'mark', [-0.0015, 0.016, 0.0175], [0.0015, 0.0168, 0.0205]),
               h.disc('dial', 'dial', 0.017, 0.012, 0.014),
               box('hand-hour', 'hand', [-0.001, 0.014, -0.001], [0.009, 0.016, 0.0015]),
               box('hand-minute', 'hand', [-0.001, 0.014, -0.014], [0.0015, 0.016, 0.001]),
               h.rod('crown', 'case', 0.003, 0.021, 0.026, 0.007),
             ]
             + [
               local z0 = s * (0.019 + 0.008 * i);
               box('link-%d-%d' % [s + 1, i], if i % 2 == 0 then 'link' else 'centre', [-0.01, 0.002, std.min(z0, z0 + s * 0.0075)], [0.01, 0.006, std.max(z0, z0 + s * 0.0075)])
               for s in [-1, 1]
               for i in std.range(0, 10)
             ]
             + [box('clasp', 'link', [-0.011, 0.002, -0.11], [0.011, 0.008, -0.1])]
             + [h.disc('lug-%d' % i, 'case', 0.003, 0.002, 0.008, p[0], p[1]) for i in std.range(0, 3) for p in [[[-0.007, -0.019], [0.007, -0.019], [-0.007, 0.019], [0.007, 0.019]][i]]],
             { case: 'steel-bright', bezel: 'plastic-matte-black', mark: 'enamel-white', dial: 'lacquer-black', hand: 'enamel-white', link: 'steel-bright', centre: 'steel-grey' })
  + { voxelGrain: 0.002 },

  // Plug: a single tortoiseshell-plastic ear spool 20 mm across and 12 mm long, flared at both ends round a black-lined 8 mm bore,
  // standing on one face.
  h.compound('ear_spool', 0.002,
             [
               h.turned('spool', 'body', 'y', [[0, 0.006], [0, 0.01], [0.003, 0.01], [0.004, 0.008], [0.008, 0.008], [0.009, 0.01], [0.012, 0.01], [0.012, 0.006], [0, 0.006]]),
               h.turned('bore', 'bore', 'y', [[0, 0.004], [0, 0.006], [0.012, 0.006], [0.012, 0.004], [0, 0.004]]),
             ],
             { body: 'plastic-tortoiseshell', bore: 'plastic-matte-black' })
  + { voxelGrain: 0.002 },

  // Ordnance-cartridge necklace: a fine gold chain laid in a ring 120 mm across with a spent 25 mm brass case
  // 75 mm long hanging from it, a red stone set in its mouth.
  cartridgeNecklace('fancy_ordinance_cartridge_necklace', 0.075, [0.075, 0.0125, 0, 0]),

  // Pistol-cartridge necklace: the same chain with a spent 9 mm pistol case 19 mm long.
  cartridgeNecklace('fancy_pistol_cartridge_necklace', 0.026, [0.02, 0.005, 0, 0]),

  // Rifle-cartridge necklace: the same chain with a spent bottlenecked rifle case 48 mm long.
  cartridgeNecklace('fancy_rifle_cartridge_necklace', 0.03, [0.048, 0.006, 0.0035, 0.008]),

  // Faux fur cat ears: a black headband 150 mm across standing on its ends, with two fluffy triangular ears 45 mm
  // tall, pink inside.
  h.compound('faux_fur_cat_ears', 0.025,
             headband
             + std.flattenArrays([
               local p = onBand(s * 34);
               [
                 h.prism('ear-%d' % (s + 1), 'fur', 'z', [[p[0] - 0.022, p[1] - 0.006], [p[0] + 0.022, p[1] - 0.006], [p[0] + s * 0.008, p[1] + 0.042]], -0.008, 0.008),
                 h.prism('inner-%d' % (s + 1), 'inner', 'z', [[p[0] - 0.013, p[1]], [p[0] + 0.013, p[1]], [p[0] + s * 0.006, p[1] + 0.028]], 0.008, 0.01),
               ]
               for s in [-1, 1]
             ]),
             { band: 'plastic-matte-black', fur: 'fur-pale', inner: 'plastic-pink' })
  + { voxelGrain: 0.002 },

  // Faux fur cat tail: a fluffy tail 550 mm long and 50 mm thick at the root, lying in a gentle S, with a darker
  // tip and a black clip at the root for a belt.
  h.compound('faux_fur_cat_tail', 0.11,
             tail(0.5, 0.024, 0.016, 40, 0.06, 0.2)
             + [box('clip', 'clip', [-0.29, 0, -0.012], [-0.262, 0.03, 0.012])],
             { tail: 'fur-pale', tip: 'fur-brown', clip: 'plastic-matte-black' })
  + { voxelGrain: 0.004 },

  // Faux fur kitty collar: a fluffy band 25 mm wide laid as a ring 130 mm across, open at the back where it
  // fastens, with a 14 mm gold bell on a ring at the front.
  h.compound('faux_fur_collar', 0.025,
             h.crescent('fur', 'fur', 0.052, 0.072, -168, 168, 30, 0, 0.016)
             + [
               box('fastener', 'fastener', [-0.012, 0.004, -0.07], [0.012, 0.012, -0.058]),
               h.tube('bell-ring', 'bell', 0.0015, 0.003, -0.001, 0.001, 0.009, 0.074),
               h.turned('bell', 'bell', 'y', [[0, 0], [0, 0.007], [0.004, 0.0068], [0.01, 0.004], [0.013, 0]], [0, 0, 0.081]),
               box('bell-slit', 'slit', [-0.0045, 0.0025, 0.087], [0.0045, 0.0045, 0.0885]),
             ],
             { fur: 'fur-pale', fastener: 'plastic-matte-black', bell: 'brass-polished', slit: 'plastic-matte-black' })
  + { voxelGrain: 0.002 },
]
