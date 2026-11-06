local h = import '../compound.libsonnet';
local box = h.box;
local rod = h.rod;
// A blade dished across z, lying concave side up: its [x, z] outline is cut into `n` strips along z, each filled from
// y0 up to a top that rises by `depth` towards the outer edges. For shovel and trowel blades.
local dish(prefix, slot, outline, y0, thick, depth, n) =
  local zx = [[p[1], p[0]] for p in outline];
  local z0 = std.foldl(function(a, p) std.min(a, p[0]), zx, 1e9);
  local z1 = std.foldl(function(a, p) std.max(a, p[0]), zx, -1e9);
  local w = (z1 - z0) / n;
  local half = (z1 - z0) / 2;
  [
    local za = z0 + i * w;
    local mid = za + w / 2 - (z0 + half);
    local band = h.clipX(h.clipX(zx, za, true), za + w, false);
    h.prism('%s-%d' % [prefix, i], slot, 'y', band, y0, y0 + thick + depth * (mid / half) * (mid / half))
    for i in std.range(0, n - 1)
  ];
// A flat curved blade lying on y between y0 and y1, its spine an arc of radius `r` about [cx, cz] from a0 to a1 degrees
// (0 points to +z, 90 to +x) and its edge `w0` inside the spine at a0, narrowing to `w1` at a1.
local arcBlade(prefix, slot, cx, cz, r, w0, w1, a0, a1, steps, y0, y1) =
  local ang(i) = (a0 + (a1 - a0) * i / steps) * std.pi / 180;
  local wAt(i) = w0 + (w1 - w0) * i / steps;
  local pt(rr, i) = [rr * std.sin(ang(i)) + cx, rr * std.cos(ang(i)) + cz];
  [
    h.prism('%s-%d' % [prefix, i], slot, 'y', [[q[1], q[0]] for q in [pt(r, i), pt(r, i + 1), pt(r - wAt(i + 1), i + 1), pt(r - wAt(i), i)]], y0, y1)
    for i in std.range(0, steps - 1)
  ];
local gripAt(id, solid, f) = h.gripOn(id, solid) + { fraction: [f, 0.5, 0.5] };
// A two-handled scythe lying on its side: a 1.4 m snath along x with its blade curving off the far end towards +z.
local scythe(withNibs, w0) =
  local y = 0.018;
  [
    rod('snath', 'snath', 0.016, 0, 1.36, y),
    h.turned('heel', 'ring', 'x', [[0, 0], [0, 0.020], [0.05, 0.020], [0.05, 0]], [1.31, y, 0]),
  ] + (if withNibs then [
         h.turned('nib-a', 'nib', 'z', [[0, 0], [0, 0.014], [0.11, 0.013], [0.12, 0]], [0.32, y, 0]),
         h.turned('nib-b', 'nib', 'z', [[0, 0], [0, 0.014], [0.11, 0.013], [0.12, 0]], [0.78, y, 0]),
         h.turned('nib-ring-a', 'ring', 'x', [[0, 0], [0, 0.019], [0.03, 0.019], [0.03, 0]], [0.305, y, 0]),
         h.turned('nib-ring-b', 'ring', 'x', [[0, 0], [0, 0.019], [0.03, 0.019], [0.03, 0]], [0.765, y, 0]),
       ] else [])
  + arcBlade('blade', 'blade', 0.95, 0.04, 0.45, w0, 0.012, 90, 172, 14, 0.008, 0.012)
  + arcBlade('spine', 'spine', 0.95, 0.04, 0.452, 0.012, 0.008, 90, 172, 14, 0.008, 0.016);
[
  // A garden trowel 250 mm long: a 115 mm turned handle, a cranked steel neck and a pointed blade 75 mm wide,
  // dished 12 mm.
  h.compound('trowel', 0.39, [
    h.turned('handle', 'handle', 'x', [[0, 0], [0, 0.012], [0.006, 0.016], [0.095, 0.015], [0.110, 0.012], [0.110, 0]], [0, 0.030, 0]),
    h.turned('ferrule', 'neck', 'x', [[0, 0], [0, 0.012], [0.016, 0.009], [0.016, 0]], [0.108, 0.030, 0]),
    box('neck-a', 'neck', [0.122, 0.022, -0.005], [0.140, 0.030, 0.005]),
    box('neck-b', 'neck', [0.134, 0.006, -0.006], [0.146, 0.024, 0.006]),
  ] + dish('blade', 'blade', [[0.140, -0.034], [0.200, -0.038], [0.235, -0.018], [0.250, 0], [0.235, 0.018], [0.200, 0.038], [0.140, 0.034]], 0, 0.002, 0.012, 7),
  { handle: 'wood-oak', neck: 'steel-grey', blade: 'steel-bright' }) + {
    handling: gripAt('trowel', 'handle', 0.5),
    voxelGrain: 0.002,
  },
  // A draw hoe 1.4 m long: a 1.3 m ash handle, a steel socket and gooseneck, and a blade 150 mm wide by 100 mm deep
  // hanging square to the handle with a bright ground edge.
  h.compound('hoe', 1.8, [
    rod('handle', 'handle', 0.015, 0, 1.31, 0.11),
    h.turned('socket', 'metal', 'x', [[0, 0], [0, 0.017], [0.08, 0.015], [0.10, 0.008], [0.10, 0]], [1.24, 0.11, 0]),
    box('neck-a', 'metal', [1.33, 0.104, -0.006], [1.385, 0.114, 0.006]),
    box('neck-b', 'metal', [1.375, 0.08, -0.008], [1.39, 0.114, 0.008]),
    box('blade', 'metal', [1.385, 0.008, -0.075], [1.391, 0.095, 0.075]),
    box('shoulder', 'metal', [1.383, 0.08, -0.03], [1.393, 0.098, 0.03]),
    box('edge', 'edge', [1.385, 0, -0.075], [1.391, 0.008, 0.075]),
  ], { handle: 'wood-pine', metal: 'steel-grey', edge: 'steel-bright' }) + {
    handling: gripAt('hoe', 'handle', 0.35),
    voxelGrain: 0.004,
  },
  // A shovel carved from one piece of hardwood, 1.2 m long: an 830 mm round handle with a knob, a flared shoulder and
  // a dished blade 200 mm wide with a rounded tip.
  h.compound('primitive_shovel', 1.8, [
    h.turned('knob', 'wood', 'x', [[0, 0], [0, 0.020], [0.02, 0.024], [0.04, 0.017], [0.04, 0]], [0, 0.035, 0]),
    rod('handle', 'wood', 0.017, 0.04, 0.86, 0.035),
    h.prism('shoulder', 'wood', 'y', [[-0.018, 0.80], [-0.095, 0.88], [0.095, 0.88], [0.018, 0.80]], 0.014, 0.034),
  ] + dish('blade', 'wood', [[0.87, -0.10], [1.12, -0.10], [1.17, -0.075], [1.20, -0.03], [1.20, 0.03], [1.17, 0.075], [1.12, 0.10], [0.87, 0.10]], 0, 0.014, 0.03, 7)
, { wood: 'wood-oak' }) + {
    handling: gripAt('primitive_shovel', 'handle', 0.4),
    voxelGrain: 0.004,
  },
  // A bow rake 1.5 m long: a 1.4 m wooden handle, a steel ferrule, two flat bows and a 380 mm head with 14 tines
  // standing 70 mm, the rake lying on its back.
  local hx = 1.485;
  h.compound('rake', 2.4, [
    rod('handle', 'handle', 0.015, 0, 1.40, 0.02),
    h.turned('ferrule', 'metal', 'x', [[0, 0], [0, 0.017], [0.07, 0.015], [0.09, 0.008], [0.09, 0]], [1.33, 0.02, 0]),
    h.prism('bow-a', 'metal', 'y', [[0.004, 1.41], [0.17, hx], [0.165, hx + 0.004], [-0.002, 1.418]], 0.014, 0.022),
    h.prism('bow-b', 'metal', 'y', [[-0.004, 1.41], [0.002, 1.418], [-0.165, hx + 0.004], [-0.17, hx]], 0.014, 0.022),
    box('head', 'metal', [hx, 0.008, -0.19], [hx + 0.015, 0.03, 0.19]),
  ] + [
    box('tine-%d' % i, 'tine', [hx + 0.004, 0.03, -0.182 + i * 0.028], [hx + 0.011, 0.10, -0.176 + i * 0.028])
    for i in std.range(0, 13)
  ], { handle: 'wood-pine', metal: 'paint-green', tine: 'paint-green' }) + {
    handling: gripAt('rake', 'handle', 0.4),
    voxelGrain: 0.004,
  },
  // A leaf rake 1.5 m long: a 1 m wooden handle in a plastic collar and a fan of 22 flat tines spreading to 550 mm,
  // braced by two cross bars, their tips turned up.
  local n = 22, x0 = 1.03, x1 = 1.49;
  h.compound('rake_plastic', 0.56, [
    rod('handle', 'handle', 0.014, 0, 1.06, 0.022),
    h.turned('collar', 'fan', 'x', [[0, 0], [0, 0.018], [0.07, 0.02], [0.07, 0]], [0.98, 0.022, 0]),
    h.prism('neck', 'fan', 'y', [[-0.025, 1.04], [0.025, 1.04], [0.06, 1.12], [-0.06, 1.12]], 0.008, 0.016),
  ] + [
    local zt = -0.275 + i * 0.55 / (n - 1);
    local zb = -0.05 + i * 0.1 / (n - 1);
    h.prism('tine-%d' % i, 'fan', 'y', [[zb - 0.004, x0 + 0.07], [zb + 0.004, x0 + 0.07], [zt + 0.005, x1], [zt - 0.005, x1]], 0.008, 0.012)
    for i in std.range(0, n - 1)
  ] + [
    local zt = -0.275 + i * 0.55 / (n - 1);
    box('tip-%d' % i, 'fan', [x1 - 0.002, 0.008, zt - 0.005], [x1 + 0.008, 0.03, zt + 0.005])
    for i in std.range(0, n - 1)
  ] + [
    h.prism('brace-a', 'fan', 'y', [[-0.17, 1.27], [0, 1.24], [0, 1.25], [-0.17, 1.28]], 0.012, 0.016),
    h.prism('brace-c', 'fan', 'y', [[0, 1.24], [0.17, 1.27], [0.17, 1.28], [0, 1.25]], 0.012, 0.016),
    box('brace-b', 'fan', [1.385, 0.012, -0.235], [1.395, 0.016, 0.235]),
  ], { handle: 'wood-pine', fan: 'plastic-green' }) + {
    handling: gripAt('rake_plastic', 'handle', 0.4),
    voxelGrain: 0.004,
  },
  // A two-handled scythe: a 1.4 m wooden snath with two grips and a 700 mm curved steel blade hung off its far end.
  h.compound('scythe', 3, scythe(true, 0.075), { snath: 'wood-oak', nib: 'wood-birch', ring: 'steel-grey', blade: 'steel-heat-tint', spine: 'steel-grey' }) + {
    handling: gripAt('scythe', 'snath', 0.3),
    voxelGrain: 0.004,
  },
  // A costume reaper's scythe of hollow plastic: a 1.4 m knotted black pole and a 700 mm moulded blade with a
  // skull raised on it.
  h.compound('scythe_toy', 0.5, scythe(false, 0.16) + [
    h.turned('knot-a', 'ring', 'x', [[0, 0], [0, 0.019], [0.03, 0.021], [0.06, 0.019], [0.06, 0]], [0.25, 0.018, 0]),
    h.turned('knot-b', 'ring', 'x', [[0, 0], [0, 0.019], [0.03, 0.021], [0.06, 0.019], [0.06, 0]], [0.70, 0.018, 0]),
    h.disc('skull', 'skull', 0.038, 0.012, 0.020, 1.285, -0.116),
    box('jaw', 'skull', [1.228, 0.012, -0.134], [1.252, 0.020, -0.098]),
    h.disc('eye-a', 'eye', 0.010, 0.020, 0.022, 1.295, -0.132),
    h.disc('eye-b', 'eye', 0.010, 0.020, 0.022, 1.295, -0.100),
    h.disc('nose', 'eye', 0.005, 0.020, 0.022, 1.272, -0.116),
  ], { snath: 'plastic-black', ring: 'plastic-black', blade: 'plastic-grey', spine: 'plastic-charcoal', skull: 'bone', eye: 'plastic-black' }) + {
    handling: gripAt('scythe_toy', 'snath', 0.3),
    voxelGrain: 0.004,
  },
  // A long-handled round-point shovel 1.4 m long: a 1.08 m wooden handle, a steel socket and a dished blade 230 mm
  // wide by 290 mm long with rolled treads on its shoulders.
  h.compound('shovel', 2.5, [
    rod('handle', 'handle', 0.018, 0, 1.10, 0.04),
    h.turned('socket', 'metal', 'x', [[0, 0], [0, 0.020], [0.10, 0.024], [0.10, 0]], [1.02, 0.04, 0]),
    h.prism('heel', 'metal', 'y', [[-0.02, 1.10], [-0.06, 1.13], [0.06, 1.13], [0.02, 1.10]], 0.016, 0.04),
  ] + dish('blade', 'metal', [[1.11, -0.115], [1.30, -0.115], [1.36, -0.08], [1.40, 0], [1.36, 0.08], [1.30, 0.115], [1.11, 0.115]], 0, 0.003, 0.035, 9)
  + [
    box('tread-a', 'metal', [1.11, 0.02, -0.118], [1.125, 0.042, -0.04]),
    box('tread-b', 'metal', [1.11, 0.02, 0.04], [1.125, 0.042, 0.118]),
  ], { handle: 'wood-pine', metal: 'paint-charcoal' }) + {
    handling: gripAt('shovel', 'handle', 0.45),
    voxelGrain: 0.004,
  },
  // A grass sickle 500 mm long: a 130 mm turned handle, a ferrule and a crescent blade on a 170 mm radius hooking
  // back towards the hand.
  h.compound('sickle', 0.8, [
    h.turned('handle', 'handle', 'x', [[0, 0], [0, 0.014], [0.01, 0.017], [0.11, 0.016], [0.13, 0.013], [0.13, 0]], [0, 0.018, 0]),
    h.turned('ferrule', 'metal', 'x', [[0, 0], [0, 0.014], [0.025, 0.012], [0.025, 0]], [0.125, 0.018, 0]),
    box('tang', 'metal', [0.145, 0.014, -0.008], [0.19, 0.020, 0.008]),
  ] + arcBlade('blade', 'blade', 0.30, -0.13, 0.17, 0.04, 0.006, -40, 165, 18, 0.014, 0.018)
  + arcBlade('spine', 'metal', 0.30, -0.13, 0.172, 0.008, 0.004, -40, 165, 18, 0.014, 0.021),
  { handle: 'wood-oak', metal: 'steel-grey', blade: 'steel-heat-tint' }) + {
    handling: gripAt('sickle', 'handle', 0.5),
    voxelGrain: 0.004,
  },
  // A stone sickle 350 mm long: a forked stick haft with a knapped crescent of stone set along its side, bound at each
  // end with rawhide.
  h.compound('sickle_stone', 0.41, [
    rod('haft', 'haft', 0.015, 0, 0.33, 0.016),
    h.turned('butt', 'haft', 'x', [[0, 0], [0, 0.017], [0.02, 0.017], [0.02, 0]], [0, 0.016, 0]),
    h.tube('bind-a', 'bind', 0.012, 0.018, 0.13, 0.155, 0.016, 0),
    h.tube('bind-b', 'bind', 0.012, 0.018, 0.29, 0.315, 0.016, 0),
  ] + arcBlade('stone', 'stone', 0.235, 0.09, 0.14, 0.035, 0.035, 225, 135, 8, 0.008, 0.024), { haft: 'bark', bind: 'skin-rawhide', stone: 'stone-grey' }) + {
    handling: gripAt('sickle_stone', 'haft', 0.2),
    voxelGrain: 0.004,
  },
  // A petrol hedge trimmer 1 m long: a 330 mm engine housing with a rear loop handle, a front bail and hand guard, and
  // a 530 mm double-sided cutter bar.
  local yb = 0.09;
  h.compound('trimmer_off', 5.5, [
    box('rear-grip', 'grip', [0, 0.10, -0.015], [0.15, 0.13, 0.015]),
    box('rear-post', 'grip', [0, 0.04, -0.015], [0.025, 0.13, 0.015]),
    box('trigger', 'trigger', [0.07, 0.085, -0.008], [0.11, 0.10, 0.008]),
    box('housing', 'housing', [0.13, 0, -0.08], [0.40, 0.17, 0.08]),
    box('cover', 'housing', [0.15, 0.17, -0.06], [0.36, 0.20, 0.06]),
    box('tank', 'tank', [0.13, 0, -0.085], [0.25, 0.08, 0.085]),
    h.disc('cap', 'grip', 0.018, 0.08, 0.10, 0.20, -0.04),
    h.turned('starter', 'grip', 'z', [[0, 0], [0, 0.055], [0.02, 0.055], [0.02, 0]], [0.27, 0.10, 0.08]),
    box('pull', 'trigger', [0.25, 0.08, 0.10], [0.29, 0.095, 0.115]),
    box('muffler', 'metal', [0.30, 0.03, -0.10], [0.38, 0.12, -0.08]),
    box('bail-top', 'grip', [0.36, 0.25, -0.12], [0.39, 0.275, 0.12]),
    box('bail-a', 'grip', [0.36, 0.02, -0.12], [0.39, 0.275, -0.095]),
    box('bail-b', 'grip', [0.36, 0.02, 0.095], [0.39, 0.275, 0.12]),
    box('gearbox', 'metal', [0.40, 0.05, -0.04], [0.47, 0.12, 0.04]),
    box('guard', 'grip', [0.465, 0.02, -0.08], [0.475, 0.16, 0.08]),
    box('bar', 'metal', [0.47, yb - 0.004, -0.018], [0.98, yb + 0.004, 0.018]),
    box('cover-bar', 'metal', [0.47, yb + 0.004, -0.008], [0.96, yb + 0.012, 0.008]),
    h.prism('tip', 'metal', 'y', [[-0.018, 0.98], [0.018, 0.98], [0, 1.0]], yb - 0.004, yb + 0.004),
  ] + std.flattenArrays([
    [
      h.prism('tooth-%d-a' % i, 'teeth', 'y', [[0.018, x], [0.018, x + 0.024], [0.04, x + 0.016], [0.04, x + 0.008]], yb - 0.003, yb + 0.003),
      h.prism('tooth-%d-b' % i, 'teeth', 'y', [[-0.018, x + 0.024], [-0.018, x], [-0.04, x + 0.008], [-0.04, x + 0.016]], yb - 0.003, yb + 0.003),
    ]
    for i in std.range(0, 13)
    for x in [0.49 + i * 0.034]
  ]), { grip: 'plastic-black', trigger: 'plastic-grey', housing: 'plastic-orange', tank: 'plastic-frosted', metal: 'steel-grey', teeth: 'steel-bright' }) + {
    handling: gripAt('trimmer_off', 'rear-grip', 0.5),
    voxelGrain: 0.004,
  },
]
