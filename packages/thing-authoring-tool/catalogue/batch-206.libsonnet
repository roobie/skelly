local h = import '../compound.libsonnet';
local g = import '../garments.libsonnet';
local box = h.box;

// Crystal-powered gear: field belts with a crystal emitter box, a pair of crystal sight glasses and a crystal wrist
// computer, each lying as it is found loose.

// A strap lying flat on a top face at y from [xa, za] to [xb, zb], `w` wide and `t` thick.
local strap(id, slot, a, b, w, t, y) =
  local dx = b[0] - a[0], dz = b[1] - a[1], len = std.sqrt(dx * dx + dz * dz), nx = -dz / len * w / 2, nz = dx / len * w / 2;
  h.prism(id, slot, 'y', [[a[1] + nz, a[0] + nx], [b[1] + nz, b[0] + nx], [b[1] - nz, b[0] - nx], [a[1] - nz, a[0] - nx]], y, y + t);

// A web belt `len` long, `w` wide and `t` thick laid flat in a U, outside up: the buckle run along +z and the tip run
// along -z, both ending at x = -run / 2, joined by a bend at +x. A cam buckle sits on the buckle run's end. Slots:
// strap, buckle.
local webBelt(len, w, t, gap=0.04) =
  local run = (len - std.pi * (gap / 2 + w / 2)) / 2, x0 = -run / 2, x1 = run / 2, zu = gap / 2 + w / 2;
  [
    box('run-buckle', 'strap', [x0, 0, gap / 2], [x1, t, gap / 2 + w]),
    box('run-tip', 'strap', [x0, 0, -gap / 2 - w], [x1, t, -gap / 2]),
    box('tip-end', 'buckle', [x0 - 0.004, 0, -gap / 2 - w], [x0 + 0.02, t + 0.001, -gap / 2]),
    box('buckle', 'buckle', [x0 - 0.008, 0, zu - w / 2 - 0.004], [x0 + 0.03, t + 0.005, zu + w / 2 + 0.004]),
    box('buckle-bar', 'strap', [x0 + 0.004, t + 0.005, zu - w / 2], [x0 + 0.014, t + 0.007, zu + w / 2]),
  ] + h.crescent('bend', 'strap', gap / 2, gap / 2 + w, 0, 180, 12, 0, t, x1, 0);

// An emitter box 90 by 64 mm and 24 mm deep riding on the buckle run at [cx, cz], a toggle on its +x end. `emblem`
// returns the pieces on its lid at height y round [cx, cz]; `cracked` knocks a corner off the box and lays a wide
// crack across the lid. Slots: box, lid, toggle, emblem, crack, chip.
local emitter(cx, cz, y0, emblem, cracked) =
  local y1 = y0 + 0.024, xc = cx - 0.028, zc = cz + 0.014, yc = y0 + 0.01;
  (if cracked then [
     // A corner knocked off at -x, +z, its broken faces showing bright metal.
     box('box', 'box', [cx - 0.045, y0, cz - 0.032], [cx + 0.045, yc, cz + 0.032]),
     box('box-main', 'box', [xc, yc, cz - 0.032], [cx + 0.045, y1, cz + 0.032]),
     box('box-side', 'box', [cx - 0.045, yc, cz - 0.032], [xc, y1, zc]),
     box('chip-floor', 'chip', [cx - 0.045, yc, zc], [xc, yc + 0.001, cz + 0.032]),
     box('chip-x', 'chip', [xc - 0.001, yc, zc], [xc, y1, cz + 0.032]),
     box('chip-z', 'chip', [cx - 0.045, yc, zc], [xc, y1, zc + 0.001]),
     box('lid', 'lid', [xc, y1, cz - 0.028], [cx + 0.041, y1 + 0.002, cz + 0.028]),
     box('lid-side', 'lid', [cx - 0.041, y1, cz - 0.028], [xc, y1 + 0.002, zc]),
   ] else [
     box('box', 'box', [cx - 0.045, y0, cz - 0.032], [cx + 0.045, y1, cz + 0.032]),
     box('lid', 'lid', [cx - 0.041, y1, cz - 0.028], [cx + 0.041, y1 + 0.002, cz + 0.028]),
   ])
  + [
    box('toggle-base', 'box', [cx + 0.045, y0 + 0.008, cz - 0.008], [cx + 0.05, y0 + 0.018, cz + 0.008]),
    box('toggle', 'toggle', [cx + 0.05, y0 + 0.011, cz - 0.003], [cx + 0.058, y0 + 0.015, cz + 0.006]),
  ]
  + emblem(cx, cz, y1 + 0.002)
  + (if cracked then [
       // A wide crack running from the broken corner across the lid and over the emblem, then down the far side.
       strap('crack-a', 'crack', [xc, zc], [cx - 0.012, cz + 0.002], 0.007, 0.0015, y1 + 0.0065),
       strap('crack-b', 'crack', [cx - 0.012, cz + 0.002], [cx + 0.01, cz + 0.01], 0.007, 0.0015, y1 + 0.0065),
       strap('crack-c', 'crack', [cx + 0.01, cz + 0.01], [cx + 0.046, cz - 0.022], 0.007, 0.0015, y1 + 0.0065),
       strap('crack-side', 'crack', [cx + 0.046, cz - 0.026], [cx + 0.046, cz - 0.018], 0.006, 0.0015, y1 - 0.012),
     ] else []);

// A shield outline 46 mm tall pointing to -z, with a crystal set in it.
local shieldEmblem(cx, cz, y) = [
  h.prism('shield', 'emblem', 'y', [[cz + 0.023, cx - 0.019], [cz + 0.023, cx + 0.019], [cz - 0.004, cx + 0.018], [cz - 0.023, cx], [cz - 0.004, cx - 0.018]], y, y + 0.002),
  h.prism('shield-gem', 'crystal', 'y', [[cz + 0.014, cx], [cz + 0.002, cx + 0.01], [cz - 0.012, cx], [cz + 0.002, cx - 0.01]], y + 0.002, y + 0.005),
];

// A flame crossed out: a flame 30 mm tall inside a ring 46 mm across with a bar through it.
local flameEmblem(cx, cz, y) = [
  h.prism('flame', 'crystal', 'y', [[cz - 0.013, cx - 0.007], [cz - 0.013, cx + 0.007], [cz - 0.004, cx + 0.01], [cz + 0.008, cx + 0.004], [cz + 0.016, cx - 0.004], [cz + 0.006, cx - 0.01]], y, y + 0.003),
] + h.crescent('ring', 'emblem', 0.02, 0.024, 0, 360, 24, y, y + 0.002, cx, cz)
+ [strap('bar', 'emblem', [cx - 0.016, cz + 0.016], [cx + 0.016, cz - 0.016], 0.004, 0.002, y + 0.003)];

// A field belt 1.1 m long and 38 mm wide in grey nylon webbing, laid in a U, with the emitter box on the buckle run.
local fieldBelt(emblem, cracked) =
  local w = 0.038, t = 0.004, zu = 0.02 + w / 2;
  webBelt(1.1, w, t) + emitter(0.02, zu + 0.005, t, emblem, cracked);

local beltFinish(crystal) = { strap: 'canvas-grey', buckle: 'plastic-matte-black', box: 'steel-spall-black', lid: 'steel-grey', toggle: 'steel-bright', emblem: 'plastic-matte-black', crystal: crystal, crack: 'void-black', chip: 'steel-bright' };

// Sight glasses: square-lensed glasses with thick temples, a crystal pod on the right temple and a glowing display
// strip in the right lens.
local sightGlasses =
  local a = 0.026, b = 0.017, rim = 0.005, gap = 0.018, d = 0.008, templeH = 0.008, templeW = 0.008;
  local ly = b + rim, cx = gap / 2 + a + rim, outer = cx + a + rim, hy = ly + 0.25 * b;
  g.eyewear({ kind: 'spectacles', a: a, b: b, p: 4, rim: rim, gap: gap, depth: d, templeW: templeW, templeH: templeH, templeLen: 0.14, brow: true, pads: true })
  + [
    box('pod', 'pod', [outer - 0.05, hy - 0.003, -0.004 - templeW - 0.004], [outer - 0.012, hy + templeH + 0.003, -0.004 - templeW]),
    box('pod-crystal', 'crystal', [outer - 0.042, hy + templeH + 0.003, -0.004 - templeW - 0.003], [outer - 0.02, hy + templeH + 0.005, -0.004 - templeW - 0.001]),
    box('display', 'display', [cx - a * 0.6, ly + b * 0.15, d / 2 + 0.001], [cx + a * 0.6, ly + b * 0.55, d / 2 + 0.002]),
  ];

// A wrist computer: a curved slate 48 by 34 mm with a crystal face in a jade-green housing, lying face up on its
// plastic strap laid open. Slots: housing, face, button, strap, clasp.
local wristComputer = [
  box('housing', 'housing', [-0.024, 0.002, -0.017], [0.024, 0.011, 0.017]),
  box('face', 'face', [-0.021, 0.011, -0.014], [0.021, 0.0125, 0.014]),
  box('button-a', 'button', [0.024, 0.005, -0.008], [0.026, 0.008, -0.003]),
  box('button-b', 'button', [0.024, 0.005, 0.003], [0.026, 0.008, 0.008]),
  box('strap-a', 'strap', [-0.011, 0, 0.017], [0.011, 0.003, 0.11]),
  box('strap-b', 'strap', [-0.011, 0, -0.1], [0.011, 0.003, -0.017]),
  box('clasp', 'clasp', [-0.012, 0.003, -0.096], [0.012, 0.007, -0.086]),
] + [
  box('hole-%d' % i, 'clasp', [-0.0015, 0.003, 0.05 + i * 0.01], [0.0015, 0.0034, 0.053 + i * 0.01])
  for i in std.range(0, 4)
];

[
  // A grey web belt 1.1 m long with a black steel emitter box with a grey lid 90 by 64 mm on its buckle run, a crossed-out flame on
  // the lid and a violet crystal glowing in the flame.
  h.compound('flame_ward_belt', 0.39, fieldBelt(flameEmblem, false), beltFinish('crystal-glow-violet'))
  + { voxelGrain: 0.002 },

  // The same belt with its emitter box cracked across and its crystal gone dark.
  h.compound('flame_ward_belt_cracked', 0.39, fieldBelt(flameEmblem, true), beltFinish('gem-purple'))
  + { voxelGrain: 0.002 },

  // The same web belt with a shield on the emitter lid and a blue crystal glowing in the shield.
  h.compound('shield_belt', 0.39, fieldBelt(shieldEmblem, false), beltFinish('crystal-glow-blue'))
  + { voxelGrain: 0.002 },

  // The shield belt with its emitter box cracked across and its crystal gone dark.
  h.compound('shield_belt_cracked', 0.39, fieldBelt(shieldEmblem, true), beltFinish('gem-blue'))
  + { voxelGrain: 0.002 },

  // Square-lensed glasses 150 mm across with thick black temples, a crystal pod 38 mm long on the right temple and a
  // glowing display strip in the right lens.
  h.compound('crystal_sight_glasses', 0.05, sightGlasses,
             { frame: 'plastic-matte-black', lens: 'lens-smoke', temple: 'plastic-matte-black', pad: 'plastic-clear', pod: 'plastic-charcoal', crystal: 'crystal-glow-violet', display: 'crystal-glow-blue' })
  + { voxelGrain: 0.002 },

  // A wrist computer: a 48 by 34 mm slate with a crystal face in a jade-green housing on a black strap laid open 210
  // mm long.
  h.compound('crystal_wrist_computer', 0.07, wristComputer,
             { housing: 'jade-green', face: 'crystal-glow-blue', button: 'metal-gold', strap: 'plastic-charcoal', clasp: 'metal-gold' })
  + { voxelGrain: 0.002 },
]
