local h = import '../compound.libsonnet';
local box = h.box;
// A ring lying flat on y from y0 to y0 + t between radii r0 and r1, centred on (x, z): a coiled cable seen from above.
local ring(id, slot, r0, r1, y0, t, x=0, z=0) = h.turned(id, slot, 'y', [[0, r0], [0, r1], [t, r1], [t, r0], [0, r0]], [x, y0, z]);
// A straight strut of square section `w` from point a to point b, as a chain of small overlapping cubes, for tubing
// that leans in more than one axis (tripod legs, a boom arm).
local strut(prefix, slot, a, b, w) =
  local d = [b[i] - a[i] for i in [0, 1, 2]];
  local len = std.sqrt(d[0] * d[0] + d[1] * d[1] + d[2] * d[2]);
  local n = std.max(2, std.ceil(len / (w * 0.75)));
  [
    local p = [a[i] + d[i] * k / n for i in [0, 1, 2]];
    box('%s-%d' % [prefix, k], slot, [p[0] - w / 2, p[1] - w / 2, p[2] - w / 2], [p[0] + w / 2, p[1] + w / 2, p[2] + w / 2])
    for k in std.range(0, n)
  ];
// A leg splaying from a hub at height `top` and radius `r0` to the floor at radius `r1`, `deg` degrees round from
// +z, with a rubber foot. Slots: leg, foot.
local leg(prefix, deg, r0, r1, top, w) =
  local a = deg * std.pi / 180;
  local s = std.sin(a), c = std.cos(a);
  strut(prefix, 'leg', [r0 * s, top, r0 * c], [r1 * s, w / 2 + 0.004, r1 * c], w)
  + [h.disc(prefix + '-foot', 'foot', w * 0.9, 0, 0.008, r1 * s, r1 * c)];
// A cable connector barrel `l` long along x, its rubber strain relief starting at `xb` and its nose pointing along
// `dir` (1 or -1), at height y and depth z. Slots: boot, shell, nose.
local plug(prefix, xb, dir, l, y, z, r) =
  local span(a, b) = if dir > 0 then xb + a * l else xb - b * l;
  local taper = if dir > 0 then [[0, r * 0.45], [0, 0], [l * 0.35, 0], [l * 0.35, r * 0.9]] else [[0, r * 0.9], [0, 0], [l * 0.35, 0], [l * 0.35, r * 0.45]];
  [
    h.turned(prefix + '-boot', 'boot', 'x', taper, [span(0, 0.35), y, z]),
    h.turned(prefix + '-shell', 'shell', 'x', [[0, 0], [0, r], [l * 0.5, r], [l * 0.5, 0]], [span(0.35, 0.85), y, z]),
    h.turned(prefix + '-nose', 'nose', 'x', [[0, 0], [0, r * 0.8], [l * 0.15, r * 0.8], [l * 0.15, 0]], [span(0.85, 1), y, z]),
  ];
// An arc of band `t` thick and `w` deep along z, standing in the xy plane round (cx, cy) at radius r from a0 to a1
// degrees (0 points to +x), built from `steps` convex quads.
local arc(prefix, slot, r, t, a0, a1, steps, cx, cy, w) =
  local ang(i) = (a0 + (a1 - a0) * i / steps) * std.pi / 180;
  local pt(rr, i) = [cx + rr * std.cos(ang(i)), cy + rr * std.sin(ang(i))];
  [
    h.prism('%s-%d' % [prefix, i], slot, 'z', [pt(r, i), pt(r + t, i), pt(r + t, i + 1), pt(r, i + 1)], -w / 2, w / 2)
    for i in std.range(0, steps - 1)
  ];
// A ball standing on its turned axis x from x0, radius r, sampled every 30 degrees.
local ballX(id, slot, x0, r, y) = h.turned(id, slot, 'x', [[0, 0]] + [[r - r * std.cos(k * std.pi / 6), r * std.sin(k * std.pi / 6)] for k in std.range(1, 5)] + [[2 * r, 0]], [x0, y, 0]);
[
  // A coil of red-and-black twin speaker wire about 3 m long, wound 190 mm across and held by a twist tie, with
  // banana plugs on the two loose ends.
  h.compound('speaker_cable', 0.1, [
    ring('coil-%d' % i, if i % 2 == 0 then 'red' else 'black', 0.07 + i * 0.005, 0.075 + i * 0.005, 0, 0.012 - (i % 2) * 0.002)
    for i in std.range(0, 4)
  ] + [
    box('tie', 'tie', [0.066, -0.001, -0.006], [0.099, 0.014, 0.006]),
    box('tail-red', 'red', [-0.02, 0.012, 0.075], [0.06, 0.015, 0.078]),
    box('tail-black', 'black', [-0.02, 0.012, 0.079], [0.06, 0.015, 0.082]),
    h.rod('plug-red', 'red', 0.005, 0.06, 0.085, 0.014) + { origin: [0.06, 0.014, 0.0765] },
    h.rod('pin-red', 'pin', 0.002, 0.085, 0.1, 0.014) + { origin: [0.085, 0.014, 0.0765] },
    h.rod('plug-black', 'black', 0.005, -0.045, -0.02, 0.014) + { origin: [-0.045, 0.014, 0.0835] },
    h.rod('pin-black', 'pin', 0.002, -0.06, -0.045, 0.014) + { origin: [-0.06, 0.014, 0.0835] },
  ], { red: 'plastic-red', black: 'plastic-black', tie: 'plastic-white', pin: 'brass' }) + { voxelGrain: 0.002 },

  // A coil of black balanced audio patch cable about 1.5 m long, 120 mm across, with a three-pin male plug at one
  // end and the matching socket at the other lying on top.
  h.compound('xlr_cable', 0.15, [
    ring('coil-%d' % i, 'cable', 0.045, 0.06, i * 0.003, 0.003)
    for i in std.range(0, 3)
  ] + [
    box('strap', 'strap', [-0.01, -0.001, 0.042], [0.01, 0.014, 0.063]),
  ] + plug('male', -0.075, 1, 0.07, 0.022, -0.015, 0.0095)
  + plug('female', 0.075, -1, 0.07, 0.022, 0.015, 0.0095)
  + [
    box('lead-a', 'cable', [-0.082, 0.004, -0.018], [-0.074, 0.022, -0.012]),
    box('lead-b', 'cable', [0.074, 0.004, 0.012], [0.082, 0.022, 0.018]),
  ], { cable: 'rubber-black', strap: 'hook-loop-grey', boot: 'plastic-black', shell: 'steel-stainless', nose: 'plastic-charcoal' })
  + { voxelGrain: 0.002 },

  // A folding tripod guitar stand 0.75 m tall in black-painted aluminium tube: three legs splayed 0.5 m across, a
  // padded cradle 0.26 m wide that takes the body, and a padded yoke at the top for the neck. The guitar faces +z.
  h.compound('guitar_stand', 0.34,
    leg('leg-l', -60, 0.01, 0.24, 0.16, 0.014)
    + leg('leg-r', 60, 0.01, 0.24, 0.16, 0.014)
    + leg('leg-b', 180, 0.01, 0.24, 0.16, 0.014)
    + [
      h.disc('hub', 'hub', 0.018, 0.13, 0.19),
      h.disc('post', 'leg', 0.009, 0.19, 0.72),
      h.disc('clamp', 'hub', 0.014, 0.4, 0.43),
      box('arm', 'leg', [-0.008, 0.3, 0], [0.008, 0.316, 0.11]),
      box('cradle', 'leg', [-0.13, 0.3, 0.1], [0.13, 0.316, 0.12]),
      box('pad-l', 'foot', [-0.135, 0.3, 0.095], [-0.105, 0.36, 0.125]),
      box('pad-r', 'foot', [0.105, 0.3, 0.095], [0.135, 0.36, 0.125]),
      box('yoke-base', 'leg', [-0.035, 0.72, -0.008], [0.035, 0.735, 0.008]),
      box('yoke-l', 'foot', [-0.04, 0.72, -0.012], [-0.022, 0.8, 0.012]),
      box('yoke-r', 'foot', [0.022, 0.72, -0.012], [0.04, 0.8, 0.012]),
    ], { leg: 'alu-anodized-black', hub: 'plastic-charcoal', foot: 'rubber-black' }) + { voxelGrain: 0.004 },

  // Closed-back studio headphones 0.26 m across and 0.2 m tall: a padded headband over two round ear cups 90 mm
  // across with cushions facing in, standing on the cups.
  h.compound('headphones', 0.18,
    arc('band', 'shell', 0.1, 0.008, 0, 180, 12, 0, 0.1, 0.03)
    + arc('cushion', 'pad', 0.088, 0.012, 20, 160, 8, 0, 0.1, 0.034)
    + [
      box('slider-l', 'metal', [-0.11, 0.07, -0.006], [-0.1, 0.11, 0.006]),
      box('slider-r', 'metal', [0.1, 0.07, -0.006], [0.11, 0.11, 0.006]),
      h.turned('cup-l', 'shell', 'x', [[0, 0], [0, 0.03], [0.008, 0.042], [0.03, 0.044], [0.03, 0]], [-0.13, 0.048, 0]),
      h.turned('cup-r', 'shell', 'x', [[0, 0], [0, 0.044], [0.022, 0.042], [0.03, 0.03], [0.03, 0]], [0.1, 0.048, 0]),
      h.turned('rim-l', 'metal', 'x', [[0, 0], [0, 0.024], [0.002, 0.024], [0.002, 0]], [-0.132, 0.048, 0]),
      h.turned('rim-r', 'metal', 'x', [[0, 0], [0, 0.024], [0.002, 0.024], [0.002, 0]], [0.13, 0.048, 0]),
      h.turned('pad-l', 'pad', 'x', [[0, 0.022], [0, 0.04], [0.02, 0.044], [0.02, 0.02], [0, 0.022]], [-0.1, 0.048, 0]),
      h.turned('pad-r', 'pad', 'x', [[0, 0.02], [0, 0.044], [0.02, 0.04], [0.02, 0.022], [0, 0.02]], [0.08, 0.048, 0]),
      h.disc('jack', 'metal', 0.004, 0, 0.006, -0.115, 0),
    ], { shell: 'plastic-charcoal', pad: 'leather-black', metal: 'steel-stainless' }) + { voxelGrain: 0.002 },

  // A telescoping boom microphone stand in black-painted aluminium, shown closed: a tripod base 0.7 m across, a mast
  // 1 m tall with a clutch at the joint, and a boom 0.8 m long tilted up and forward with a counterweight at the
  // back and a mic clip on its thread at the front (+z).
  h.compound('mic_stand', 1.6,
    leg('leg-l', -60, 0.015, 0.35, 0.26, 0.016)
    + leg('leg-r', 60, 0.015, 0.35, 0.26, 0.016)
    + leg('leg-b', 180, 0.015, 0.35, 0.26, 0.016)
    + strut('boom', 'tube', [0, 0.9, -0.3], [0, 1.2, 0.5], 0.014)
    + [
      h.disc('hub', 'clutch', 0.024, 0.22, 0.3),
      h.disc('mast', 'tube', 0.011, 0.3, 0.72),
      h.disc('clutch', 'clutch', 0.018, 0.72, 0.76),
      h.disc('upper', 'tube', 0.008, 0.76, 0.99),
      box('knuckle', 'clutch', [-0.022, 0.985, -0.018], [0.022, 1.035, 0.018]),
      h.disc('weight', 'weight', 0.025, 0.85, 0.93, 0, -0.3),
      box('clip', 'clip', [-0.012, 1.19, 0.49], [0.012, 1.23, 0.53]),
    ], { tube: 'alu-anodized-black', clutch: 'plastic-charcoal', foot: 'rubber-black', leg: 'alu-anodized-black', weight: 'steel-parkerized', clip: 'plastic-black' }) + { voxelGrain: 0.008 },

  // A handheld dynamic microphone 180 mm long: a ball grille 52 mm across on a tapering black handle with a
  // three-pin socket in its tail. The grille points to +x.
  h.compound('xlr_microphone', 0.16, [
    h.turned('handle', 'handle', 'x', [[0, 0], [0, 0.0115], [0.11, 0.0165], [0.13, 0.019], [0.13, 0]], [0, 0.0265, 0]),
    h.turned('collar', 'collar', 'x', [[0, 0], [0, 0.021], [0.006, 0.021], [0.006, 0]], [0.127, 0.0265, 0]),
    ballX('grille', 'grille', 0.128, 0.026, 0.0265),
    h.turned('socket', 'socket', 'x', [[0, 0], [0, 0.008], [0.002, 0.008], [0.002, 0]], [-0.002, 0.0265, 0]),
    box('badge', 'collar', [0.04, 0.0395, -0.004], [0.06, 0.0415, 0.004]),
  ], { handle: 'alu-anodized-black', collar: 'steel-stainless', grille: 'steel-grey', socket: 'brass' }) + {
    handling: h.gripOn('xlr_microphone', 'handle'),
    voxelGrain: 0.002,
  },

  // An eight-channel analogue mixing desk 0.44 m wide, 0.36 m deep and 0.1 m tall in a steel case: a column of four
  // knobs and a fader in each channel strip, a master section with two faders and level meters on the right, and a
  // raised rear panel of sockets. The faders face the operator on +z.
  h.compound('mixer', 4.2, [
    box('case', 'case', [-0.22, 0, -0.18], [0.22, 0.06, 0.18]),
    box('panel', 'case', [-0.22, 0.06, -0.18], [0.22, 0.1, -0.14]),
    box('face', 'face', [-0.215, 0.059, -0.135], [0.215, 0.06, 0.175]),
      h.disc('knob-0-0', 'knob', 0.0065, 0.06, 0.072, -0.200, -0.120),
      h.disc('knob-0-1', 'knob', 0.0065, 0.06, 0.072, -0.200, -0.080),
      h.disc('knob-0-2', 'knob', 0.0065, 0.06, 0.072, -0.200, -0.040),
      h.disc('knob-0-3', 'knob', 0.0065, 0.06, 0.072, -0.200, 0.000),
      h.disc('knob-1-0', 'knob', 0.0065, 0.06, 0.072, -0.160, -0.120),
      h.disc('knob-1-1', 'knob', 0.0065, 0.06, 0.072, -0.160, -0.080),
      h.disc('knob-1-2', 'knob', 0.0065, 0.06, 0.072, -0.160, -0.040),
      h.disc('knob-1-3', 'knob', 0.0065, 0.06, 0.072, -0.160, 0.000),
      h.disc('knob-2-0', 'knob', 0.0065, 0.06, 0.072, -0.120, -0.120),
      h.disc('knob-2-1', 'knob', 0.0065, 0.06, 0.072, -0.120, -0.080),
      h.disc('knob-2-2', 'knob', 0.0065, 0.06, 0.072, -0.120, -0.040),
      h.disc('knob-2-3', 'knob', 0.0065, 0.06, 0.072, -0.120, 0.000),
      h.disc('knob-3-0', 'knob', 0.0065, 0.06, 0.072, -0.080, -0.120),
      h.disc('knob-3-1', 'knob', 0.0065, 0.06, 0.072, -0.080, -0.080),
      h.disc('knob-3-2', 'knob', 0.0065, 0.06, 0.072, -0.080, -0.040),
      h.disc('knob-3-3', 'knob', 0.0065, 0.06, 0.072, -0.080, 0.000),
      h.disc('knob-4-0', 'knob', 0.0065, 0.06, 0.072, -0.040, -0.120),
      h.disc('knob-4-1', 'knob', 0.0065, 0.06, 0.072, -0.040, -0.080),
      h.disc('knob-4-2', 'knob', 0.0065, 0.06, 0.072, -0.040, -0.040),
      h.disc('knob-4-3', 'knob', 0.0065, 0.06, 0.072, -0.040, 0.000),
      h.disc('knob-5-0', 'knob', 0.0065, 0.06, 0.072, 0.000, -0.120),
      h.disc('knob-5-1', 'knob', 0.0065, 0.06, 0.072, 0.000, -0.080),
      h.disc('knob-5-2', 'knob', 0.0065, 0.06, 0.072, 0.000, -0.040),
      h.disc('knob-5-3', 'knob', 0.0065, 0.06, 0.072, 0.000, 0.000),
      h.disc('knob-6-0', 'knob', 0.0065, 0.06, 0.072, 0.040, -0.120),
      h.disc('knob-6-1', 'knob', 0.0065, 0.06, 0.072, 0.040, -0.080),
      h.disc('knob-6-2', 'knob', 0.0065, 0.06, 0.072, 0.040, -0.040),
      h.disc('knob-6-3', 'knob', 0.0065, 0.06, 0.072, 0.040, 0.000),
      h.disc('knob-7-0', 'knob', 0.0065, 0.06, 0.072, 0.080, -0.120),
      h.disc('knob-7-1', 'knob', 0.0065, 0.06, 0.072, 0.080, -0.080),
      h.disc('knob-7-2', 'knob', 0.0065, 0.06, 0.072, 0.080, -0.040),
      h.disc('knob-7-3', 'knob', 0.0065, 0.06, 0.072, 0.080, 0.000),
      box('slot-0', 'slot', [-0.202, 0.06, 0.06], [-0.198, 0.061, 0.16]),
      box('fader-0', 'fader', [-0.208, 0.06, 0.090], [-0.192, 0.075, 0.104]),
      box('slot-1', 'slot', [-0.162, 0.06, 0.06], [-0.158, 0.061, 0.16]),
      box('fader-1', 'fader', [-0.168, 0.06, 0.110], [-0.152, 0.075, 0.124]),
      box('slot-2', 'slot', [-0.122, 0.06, 0.06], [-0.118, 0.061, 0.16]),
      box('fader-2', 'fader', [-0.128, 0.06, 0.130], [-0.112, 0.075, 0.144]),
      box('slot-3', 'slot', [-0.082, 0.06, 0.06], [-0.078, 0.061, 0.16]),
      box('fader-3', 'fader', [-0.088, 0.06, 0.090], [-0.072, 0.075, 0.104]),
      box('slot-4', 'slot', [-0.042, 0.06, 0.06], [-0.038, 0.061, 0.16]),
      box('fader-4', 'fader', [-0.048, 0.06, 0.110], [-0.032, 0.075, 0.124]),
      box('slot-5', 'slot', [-0.002, 0.06, 0.06], [0.002, 0.061, 0.16]),
      box('fader-5', 'fader', [-0.008, 0.06, 0.130], [0.008, 0.075, 0.144]),
      box('slot-6', 'slot', [0.038, 0.06, 0.06], [0.042, 0.061, 0.16]),
      box('fader-6', 'fader', [0.032, 0.06, 0.090], [0.048, 0.075, 0.104]),
      box('slot-7', 'slot', [0.078, 0.06, 0.06], [0.082, 0.061, 0.16]),
      box('fader-7', 'fader', [0.072, 0.06, 0.110], [0.088, 0.075, 0.124]),
      box('meter-l', 'meter', [0.13, 0.06, -0.13], [0.145, 0.062, -0.02]),
      box('meter-r', 'meter', [0.155, 0.06, -0.13], [0.17, 0.062, -0.02]),
      box('master-slot-l', 'slot', [0.138, 0.06, 0.06], [0.142, 0.061, 0.16]),
      box('master-slot-r', 'slot', [0.178, 0.06, 0.06], [0.182, 0.061, 0.16]),
      box('master-l', 'master', [0.132, 0.06, 0.1], [0.148, 0.075, 0.114]),
      box('master-r', 'master', [0.172, 0.06, 0.1], [0.188, 0.075, 0.114]),
      h.disc('phones', 'knob', 0.009, 0.06, 0.075, 0.2, -0.1),
      h.disc('power', 'meter', 0.004, 0.06, 0.064, 0.2, 0.0),
    ] + [
      h.disc('jack-%d' % i, 'jack', 0.006, 0.07, 0.09, -0.2 + i * 0.04, -0.181) + { kind: 'turned', axis: 'z', profile: [[0, 0], [0, 0.006], [0.004, 0.006], [0.004, 0]], origin: [-0.2 + i * 0.04, 0.08, -0.184] }
      for i in std.range(0, 7)
    ], { case: 'steel-parkerized', face: 'plastic-charcoal', knob: 'plastic-black', slot: 'plastic-black', fader: 'plastic-grey', master: 'plastic-red', meter: 'lcd-green', jack: 'steel-stainless' }) + { voxelGrain: 0.004 },

  // A medium guitar plectrum in red plastic, 30 mm long and 26 mm across, a rounded triangle tip forward on +z. Real picks are under
  // 1 mm thick; this one is drawn at the finest 2 mm grain.
  h.compound('plectrum', 0.0004, [
    h.prism('pick', 'pick', 'y', [[q[1], q[0]] for q in [[0, 0.016], [-0.01, 0.002], [-0.013, -0.006], [-0.009, -0.012], [0, -0.014], [0.009, -0.012], [0.013, -0.006], [0.01, 0.002]]], 0, 0.002),
  ], { pick: 'plastic-red' }) + { voxelGrain: 0.002 },
]
