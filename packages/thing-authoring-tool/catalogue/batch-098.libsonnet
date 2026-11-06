local h = import '../compound.libsonnet';
local box = h.box;
// A ring standing on the floor with its axis along z, radii r0 to r1, from z0 to z1, centred at (x, y).
local ringZ(id, slot, r0, r1, z0, z1, x, y) = h.turned(id, slot, 'z', [[0, r0], [0, r1], [z1 - z0, r1], [z1 - z0, r0], [0, r0]], [x, y, z0]);
// A buckle frame lying flat round a strap's end at x = x0 on a strap centred at z = cz: an open rectangle `bw` along
// x and `bh` across z, bar `b` thick, with its tongue lying across the strap. Slot buckle.
local buckleFrame(prefix, x0, bw, bh, b, y0, y1, cz) = [
  box(prefix + '-left', 'buckle', [x0 - bw, y0, cz - bh / 2], [x0 - bw + b, y1, cz + bh / 2]),
  box(prefix + '-right', 'buckle', [x0 - b, y0, cz - bh / 2], [x0, y1, cz + bh / 2]),
  box(prefix + '-front', 'buckle', [x0 - bw, y0, cz + bh / 2 - b], [x0, y1, cz + bh / 2]),
  box(prefix + '-back', 'buckle', [x0 - bw, y0, cz - bh / 2], [x0, y1, cz - bh / 2 + b]),
  box(prefix + '-tongue', 'buckle', [x0 - bw + b, y1 - 0.002, cz - 0.002], [x0 + 0.004, y1, cz + 0.002]),
];
// A belt `len` long, `w` wide and `t` thick laid flat in a U, outside up: the buckle run along +z and the tip run
// along -z, both ending at x = -run / 2, joined by a bend at +x with `gap` between the runs. The tip run has
// `holes` punched holes and the buckle run a keeper loop. Slots: strap, keeper, buckle, hole.
local beltRun(len, w, gap) = (len - std.pi * (gap / 2 + w / 2)) / 2;
local beltU(len, w, t, holes, bw, bh, b, gap=0.04) =
  local run = beltRun(len, w, gap), x0 = -run / 2, x1 = run / 2, zu = gap / 2 + w / 2, tip = w / 2;
  [
    box('run-buckle', 'strap', [x0, 0, gap / 2], [x1, t, gap / 2 + w]),
    box('run-tip', 'strap', [x0 + tip, 0, -gap / 2 - w], [x1, t, -gap / 2]),
    h.prism('tip', 'strap', 'y', [[-zu - w / 2, x0 + tip], [-zu + w / 2, x0 + tip], [-zu + w * 0.25, x0 + tip * 0.25], [-zu - w * 0.25, x0 + tip * 0.25]], 0, t),
    box('keeper', 'keeper', [x0 + bw + 0.006, 0, zu - w / 2 - 0.002], [x0 + bw + 0.018, t + 0.002, zu + w / 2 + 0.002]),
  ] + h.crescent('bend', 'strap', gap / 2, gap / 2 + w, 0, 180, 12, 0, t, x1, 0)
  + buckleFrame('buckle', x0 + bw * 0.25, bw, bh, b, 0, t + 0.004, zu) + [
    h.disc('hole-%d' % i, 'hole', 0.0025, t, t + 0.0005, x0 + 0.1 + i * 0.025, -zu)
    for i in std.range(0, holes - 1)
  ];
// A martial arts belt lying flat as it is tied: a ring of doubled cloth band `w` wide round a waist of radius `r`, a
// square knot at the front and two tails falling forward and apart. Slot cloth.
local tiedBelt(r, w, tail) =
  h.crescent('wrap', 'cloth', r - w / 2, r + w / 2, 14, 346, 24, 0, 0.006)
  + [
    box('knot', 'cloth', [-w * 0.8, 0, r - w * 0.6], [w * 0.8, 0.018, r + w * 0.6]),
    h.prism('tail-left', 'cloth', 'y', [[r, -w * 0.9], [r, -w * 0.1], [r + tail, -w * 0.1 - tail * 0.35], [r + tail, -w * 1.1 - tail * 0.35]], 0, 0.006),
    h.prism('tail-right', 'cloth', 'y', [[r, w * 0.1], [r, w * 0.9], [r + tail, w * 1.1 + tail * 0.35], [r + tail, w * 0.1 + tail * 0.35]], 0, 0.006),
  ];
// A diagonal strap lying flat on the floor from [xa, za] to [xb, zb], `w` wide and `t` thick.
local strapFlat(id, slot, a, b, w, t, y0=0) =
  local dx = b[0] - a[0], dz = b[1] - a[1], len = std.sqrt(dx * dx + dz * dz), nx = -dz / len * w / 2, nz = dx / len * w / 2;
  h.prism(id, slot, 'y', [[a[1] + nz, a[0] + nx], [b[1] + nz, b[0] + nx], [b[1] - nz, b[0] - nx], [a[1] - nz, a[0] - nx]], y0, y0 + t);
// A clip at the end of a strap lying flat, its jaws towards `dir` (+1 for +z, -1 for -z). Slot fitting.
local clip(id, x, z, dir) = [
  box(id + '-body', 'fitting', [x - 0.02, 0, std.min(z, z + dir * 0.03)], [x + 0.02, 0.006, std.max(z, z + dir * 0.03)]),
  box(id + '-jaw', 'fitting', [x - 0.016, 0.006, std.min(z + dir * 0.012, z + dir * 0.03)], [x + 0.016, 0.01, std.max(z + dir * 0.012, z + dir * 0.03)]),
];
// A leather button tab at the end of a strap lying flat: a split end with a slot in each prong. Slot fitting.
local tab(id, x, z, dir) = [
  box(id + '-a', 'strap', [x - 0.02, 0, std.min(z, z + dir * 0.05)], [x - 0.004, 0.004, std.max(z, z + dir * 0.05)]),
  box(id + '-b', 'strap', [x + 0.004, 0, std.min(z, z + dir * 0.05)], [x + 0.02, 0.004, std.max(z, z + dir * 0.05)]),
  box(id + '-slot-a', 'fitting', [x - 0.014, 0.004, std.min(z + dir * 0.03, z + dir * 0.04)], [x - 0.01, 0.0045, std.max(z + dir * 0.03, z + dir * 0.04)]),
  box(id + '-slot-b', 'fitting', [x + 0.01, 0.004, std.min(z + dir * 0.03, z + dir * 0.04)], [x + 0.014, 0.0045, std.max(z + dir * 0.03, z + dir * 0.04)]),
];
// Y-back suspenders lying flat, front on +z: two front straps run from a back patch at the middle to the waist ends
// at +z, one back strap to the waist end at -z. `ends` draws a strap end (clip or tab). Slots: strap, patch, slide,
// fitting.
local suspenders(t, ends) =
  local w = 0.035, fl = [-0.13, 0.33], fr = [0.13, 0.33], back = [0, -0.36];
  [
    strapFlat('front-left', 'strap', [-0.015, 0], fl, w, t),
    strapFlat('front-right', 'strap', [0.015, 0], fr, w, t),
    strapFlat('back', 'strap', [0, 0], back, w, t),
    h.prism('patch', 'patch', 'y', [[-0.05, 0], [0, -0.045], [0.05, 0], [0, 0.045]], t, t + 0.003),
    strapFlat('slide-left', 'slide', [-0.09, 0.22], [-0.1, 0.25], w + 0.008, 0.004, t),
    strapFlat('slide-right', 'slide', [0.09, 0.22], [0.1, 0.25], w + 0.008, 0.004, t),
  ] + ends('end-left', fl[0], fl[1], 1) + ends('end-right', fr[0], fr[1], 1) + ends('end-back', back[0], back[1], -1);
[
  // A firefighter's belt 1.2 m long and 50 mm wide in thick black leather, laid in a U, with a heavy steel buckle and
  // a steel axe ring 60 mm across standing on a leather tab.
  h.compound('fireman_belt', 0.31, beltU(1.2, 0.05, 0.005, 5, 0.05, 0.07, 0.008) + [
    box('ring-tab', 'keeper', [0.07, 0.005, 0.015], [0.13, 0.009, 0.075]),
    ringZ('ring', 'buckle', 0.026, 0.032, 0.039, 0.051, 0.1, 0.041),
  ], { strap: 'leather-black', keeper: 'leather-black', buckle: 'steel-grey', hole: 'plastic-matte-black' })
  + { voxelGrain: 0.002 },

  // A trouser belt 1.1 m long and 35 mm wide in brown leather, laid in a U, with a steel frame buckle.
  h.compound('leather_belt', 0.12, beltU(1.1, 0.035, 0.004, 5, 0.04, 0.05, 0.005),
             { strap: 'leather-brown', keeper: 'leather-brown', buckle: 'steel-grey', hole: 'plastic-matte-black' })
  + { voxelGrain: 0.002 },

  // A broad belt 1.2 m long and 75 mm wide in black leather, laid in a U, with a square brass buckle 100 mm across.
  h.compound('santa_belt', 0.45, beltU(1.2, 0.075, 0.004, 4, 0.08, 0.1, 0.014),
             { strap: 'leather-black', keeper: 'leather-black', buckle: 'metal-gold', hole: 'plastic-matte-black' })
  + { voxelGrain: 0.002 },

  // A police duty belt 1.2 m long and 55 mm wide in black leather, laid in a U, with a twin magazine pouch and a
  // handcuff case on the buckle run, a glove pouch and a steel baton ring on the tip run.
  h.compound('police_belt', 0.45, beltU(1.2, 0.055, 0.005, 4, 0.05, 0.07, 0.008) + [
    box('mag-pouch', 'pouch', [-0.13, 0.005, 0.017], [-0.03, 0.035, 0.078]),
    box('mag-flap', 'flap', [-0.132, 0.035, 0.017], [-0.028, 0.038, 0.082]),
    box('mag-divide', 'keeper', [-0.081, 0.038, 0.017], [-0.079, 0.039, 0.082]),
    box('cuff-case', 'pouch', [0.04, 0.005, 0.017], [0.11, 0.04, 0.078]),
    box('cuff-flap', 'flap', [0.038, 0.04, 0.017], [0.112, 0.043, 0.082]),
    box('glove-pouch', 'pouch', [-0.02, 0.005, -0.078], [0.05, 0.03, -0.017]),
    box('glove-flap', 'flap', [-0.022, 0.03, -0.078], [0.052, 0.033, -0.013]),
    box('ring-tab', 'keeper', [0.13, 0.005, -0.082], [0.18, 0.009, -0.013]),
    ringZ('baton-ring', 'ring', 0.019, 0.024, -0.0525, -0.0425, 0.155, 0.033),
  ] + [
    h.disc('stud-%d' % i, 'ring', 0.004, studs[i][0], studs[i][0] + 0.002, studs[i][1], studs[i][2])
    for i in std.range(0, 3)
    for studs in [[[0.038, -0.105, 0.075], [0.038, -0.055, 0.075], [0.043, 0.075, 0.075], [0.033, 0.015, -0.016]]]
  ], { strap: 'leather-black', keeper: 'leather-black', buckle: 'steel-grey', hole: 'plastic-matte-black', pouch: 'leather-black', flap: 'polymer-black', ring: 'steel-grey' })
  + { voxelGrain: 0.002 },

  // A martial arts belt 40 mm wide, wrapped twice round a 900 mm waist and tied, its tails 220 mm long. Its colour is
  // its rank; the colours ride on finishes maps.
  h.compound('judo_belt', 0.15, tiedBelt(0.145, 0.04, 0.22), { cloth: 'cloth-white' })
  + { voxelGrain: 0.002 },

  // A broad black gi belt 60 mm wide, tied the same way with tails 240 mm long.
  h.compound('obi_gi', 0.11, tiedBelt(0.15, 0.06, 0.24), { cloth: 'cloth-black' })
  + { voxelGrain: 0.002 },

  // Y-back cloth suspenders 35 mm wide, lying flat 460 mm across and 760 mm long, with metal clips at the three ends,
  // slides on the front straps and a leather patch where the straps meet.
  h.compound('suspenders_cloth', 0.21, suspenders(0.003, clip),
             { strap: 'cloth-black', patch: 'leather-black', slide: 'metal-silver', fitting: 'metal-silver' })
  + { voxelGrain: 0.002 },

  // The same Y-back suspenders in brown leather with split button tabs at the ends and brass slides.
  h.compound('suspenders_leather', 0.15, suspenders(0.004, tab),
             { strap: 'leather-brown', patch: 'leather-brown', slide: 'brass', fitting: 'leather-black' })
  + { voxelGrain: 0.002 },

  // The leather suspenders with a pistol holster 190 mm long sewn to the left front strap at the stomach, its muzzle
  // pointing down and inward.
  h.compound('suspenders_holster', 0.32, suspenders(0.004, tab) + [
    h.prism('holster', 'holster', 'y', [[0.1, -0.16], [0.13, -0.05], [0.29, -0.02], [0.29, -0.11], [0.2, -0.17]], 0.004, 0.034),
    box('holster-strap', 'fitting', [-0.12, 0.034, 0.12], [-0.03, 0.037, 0.14]),
    h.disc('holster-stud', 'slide', 0.005, 0.037, 0.039, -0.04, 0.13),
  ], { strap: 'leather-brown', patch: 'leather-brown', slide: 'brass', fitting: 'leather-black', holster: 'leather-brown' })
  + { voxelGrain: 0.002 },
]
