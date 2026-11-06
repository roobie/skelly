local g = import '../garments.libsonnet';
local h = import '../compound.libsonnet';

// Enchanted rings and fist weapons: a platinum ring set with a glowing crystal, a pair of steel-faced fist guards
// with glowing flame marks, and a single heavy steel gauntlet carved with glowing runes.

local deg = std.pi / 180;
// A cut stone of radius `r` and height `ht` sitting table up on y0 at (x, z).
local stone(id, slot, r, ht, x, y0, z) = h.turned(id, slot, 'y', [[0, 0], [0, r], [ht * 0.45, r], [ht, r * 0.55], [ht, 0]], [x, y0, z]);
// A rune notch on the outside of an upright ring band of radius r, centred at angle a (degrees from +y, towards +x),
// standing proud of the band from z0 to z1.
local bandRune(id, slot, r, a, cy, z0, z1) =
  local c = std.cos(a * deg), s = std.sin(a * deg), w = 0.0012;
  h.prism(id, slot, 'z', [
    [(r - 0.001) * s - w * c, cy + (r - 0.001) * c + w * s],
    [(r + 0.0003) * s - w * c, cy + (r + 0.0003) * c + w * s],
    [(r + 0.0003) * s + w * c, cy + (r + 0.0003) * c - w * s],
    [(r - 0.001) * s + w * c, cy + (r - 0.001) * c - w * s],
  ], z0, z1);
// A flame mark lying on y0 at [x, z], pointing to +z: three tongues of decreasing height.
local flame(p, slot, x, z, y0, k=1) = [
  h.prism('%s-%d' % [p, i], slot, 'y', [
    [z - 0.006 * k, x + (o - 0.003) * k],
    [z - 0.006 * k, x + (o + 0.003) * k],
    [z + ln * k, x + o * k],
  ], y0, y0 + 0.0015)
  for i in [0, 1, 2]
  for o in [[-0.006, 0, 0.006][i]]
  for ln in [[0.008, 0.013, 0.009][i]]
];

// The curved back plate of `g.glove` (its outline and radius), so details can sit on its face.
local plateBack = [[-0.047, -0.014], [0.047, -0.014], [0.047, 0.084], [-0.047, 0.084]];
local plateTop(t, x) = h.curvedTopAt(plateBack, t, 0.003, 0.08, x);

// Fist guards: fingerless leather hand wraps with a steel plate over the back, a steel bar across the knuckles and a
// flame mark on each plate.
local fistGuard = { t: 0.02, cuff: 0.05, flare: 0.05, reach: 0.3, plate: 'steel', binding: 'trim' };
local fistExtra(p, cx, s) =
  local t = fistGuard.t, top = plateTop(t, 0);
  [
    h.box(p + 'bar', 'steel', [cx - 0.05, t, 0.084], [cx + 0.05, top + 0.006, 0.1]),
  ]
  + flame(p + 'flame', 'flame', cx, 0.025, top - 0.0005, 2.4);

// The gauntlet of pounding: one right gauntlet, all steel over a leather lining: plated back, steel fingers, a
// knuckle ridge, a flared steel cuff, and glowing rune marks on the plate and cuff.
local pound = { t: 0.024, cuff: 0.11, flare: 0.07, plate: 'steel', knuckle: 'steel', fingerSlot: 'steel', thumbSlot: 'steel', binding: 'trim' };
local poundRunes =
  local t = pound.t, top = plateTop(t, 0);
  [
    // A ring of short strokes round a centre dot on the plate.
    h.box('rune-c', 'rune', [-0.006, top - 0.0005, 0.029], [0.006, top + 0.0015, 0.041]),
  ] + [
    local a = i * 60 * deg, x = 0.024 * std.sin(a), z = 0.035 + 0.024 * std.cos(a);
    h.box('rune-%d' % i, 'rune', [x - 0.004, plateTop(t, x) - 0.001, z - 0.004], [x + 0.004, plateTop(t, x) + 0.0015, z + 0.004])
    for i in std.range(0, 5)
  ] + [
    // A band of marks across the cuff.
    h.box('cuff-rune-%d' % i, 'rune', [-0.045 + i * 0.015, t * 0.9, -0.09], [-0.04 + i * 0.015, t * 0.9 + 0.0015, -0.07 + (i % 2) * 0.008])
    for i in std.range(0, 6)
  ];

[
  // A platinum finger ring 21 mm across and 4 mm wide standing on its edge: a band cut with small rune notches, a
  // raised cup setting on top holding a 7 mm glowing violet crystal.
  h.compound('storage_ring', 0.013, [
    h.turned('band', 'metal', 'z', [[0, 0.0085], [0, 0.0105], [0.004, 0.0105], [0.004, 0.0085], [0, 0.0085]], [0, 0.0105, -0.002]),
    h.disc('setting', 'metal', 0.0045, 0.0195, 0.023),
    stone('stone', 'gem', 0.0038, 0.0045, 0, 0.023, 0),
  ] + [
    bandRune('rune-%d' % i, 'rune', 0.0105, a, 0.0105, -0.0012, 0.0012)
    for i in std.range(0, 5)
    for a in [[60, 100, 140, 220, 260, 300][i]]
  ], { metal: 'metal-platinum', gem: 'crystal-glow-violet', rune: 'crystal-glow-violet' })
  + { voxelGrain: 0.002 },

  // A pair of fist guards laid flat, backs up, fingers to +z, 230 mm from cuff to knuckle bar and 100 mm across: thick
  // fingerless leather wraps, a curved steel plate riveted over each back, a heavy steel bar across the knuckles and a
  // glowing violet flame mark on each plate.
  h.compound('flaming_fist', 1.2,
             g.glovePair(fistGuard, 0.07, fistExtra),
             { glove: 'leather-tan', cuff: 'leather-tan', trim: 'leather-oxblood', steel: 'steel-grey', rivet: 'steel-bright', flame: 'crystal-glow-violet' })
  + { voxelGrain: 0.004 },

  // A single right-hand steel gauntlet laid flat, back up, fingers to +z, 300 mm from cuff to fingertip and 140 mm
  // across its flared cuff: a domed plate over the back, steel fingers and thumb, a knuckle ridge, a riveted steel
  // cuff, and glowing blue rune marks on the plate and cuff.
  h.compound('gauntlet_pounding', 0.8,
             g.glove('r-', 0, 1, pound) + poundRunes,
             { glove: 'leather-black', cuff: 'steel-bright', trim: 'leather-black', steel: 'steel-bright', rivet: 'steel-grey', rune: 'crystal-glow-blue' })
  + { voxelGrain: 0.004 },
]
