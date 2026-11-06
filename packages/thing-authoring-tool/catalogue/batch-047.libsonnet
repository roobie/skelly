local h = import '../compound.libsonnet';
local box = h.box;
local turned = h.turned;
local disc = h.disc;
// A ring of round stock turned about y: centre radius `R`, stock radius `t`, its underside at `y`.
local torus(id, slot, R, t, y, x=0, z=0, n=10) = turned(id, slot, 'y', [
  [t + t * std.sin(2 * std.pi * i / n), R + t * std.cos(2 * std.pi * i / n)]
  for i in std.range(0, n)
], [x, y, z]);
// A coil of cable `t` in radius lying flat: `n` loops from radius `R` outward, packed four across and stacked, each
// a little off centre so the turns read apart.
local coil(prefix, slot, n, R, t, y0=0) = [
  torus('%s-%d' % [prefix, i], slot, R + (i % 4) * t * 1.8, t, y0 + std.floor(i / 4) * t * 1.8, ((i % 2) * 2 - 1) * t * 0.3, (((i + 1) % 3) - 1) * t * 0.3)
  for i in std.range(0, n - 1)
];
// A band of cable wound round the coil's own stock at x, standing on the floor: the loose end tied round the bundle.
local wrap(id, slot, x, r0, r1, w) = turned(id, slot, 'z', [[0, r0], [0, r1], [w, r1], [w, r0], [0, r0]], [x, r1, -w / 2]);
// A forged steel tow hook lying flat at height y: a shank from x along `dir` (1 or -1) at depth z, then an open bowl
// curling toward -z. Slots: hook.
local hook(prefix, x, z, dir, y, t) =
  local reach = 0.06, r = 0.024;
  [
    box(prefix + '-shank', 'hook', [std.min(x, x + dir * reach), y, z - 0.007], [std.max(x, x + dir * reach), y + t, z + 0.007]),
    box(prefix + '-eye', 'hook', [std.min(x, x + dir * 0.022), y - 0.002, z - 0.011], [std.max(x, x + dir * 0.022), y + t + 0.002, z + 0.011]),
  ] + h.crescent(prefix + '-bowl', 'hook', r - 0.007, r + 0.007, 0, dir * 230, 8, y, y + t, x + dir * reach, z - r);
// A spring alligator clamp 70 mm long lying along x from x0 toward `dir`, at height y and depth z: an insulating
// boot over the handles and two copper jaws. Slots: boot, jaw.
local clamp(prefix, x0, dir, y, z) =
  local span(a, b) = [std.min(x0 + dir * a, x0 + dir * b), std.max(x0 + dir * a, x0 + dir * b)];
  local boot = span(0, 0.04), jaw = span(0.04, 0.072), pivot = span(0.036, 0.046);
  [
    box(prefix + '-boot-lower', 'boot', [boot[0], y, z - 0.011], [boot[1], y + 0.008, z + 0.011]),
    box(prefix + '-boot-upper', 'boot', [boot[0], y + 0.012, z - 0.011], [boot[1], y + 0.02, z + 0.011]),
    box(prefix + '-pivot', 'jaw', [pivot[0], y + 0.004, z - 0.009], [pivot[1], y + 0.016, z + 0.009]),
    box(prefix + '-jaw-lower', 'jaw', [jaw[0], y + 0.002, z - 0.007], [jaw[1], y + 0.008, z + 0.007]),
    box(prefix + '-jaw-upper', 'jaw', [jaw[0], y + 0.01, z - 0.007], [jaw[1], y + 0.014, z + 0.007]),
  ];
// A kitchen knife lying flat in a roll, its handle toward +z: blade `w` wide from z0 to z1 with a pointed tip at z0,
// handle `hl` long. Slots: blade, handle, rivet.
local knife(prefix, x, w, z0, z1, hl, tip=0.04) = [
  box(prefix + '-blade', 'blade', [x - w / 2, 0.004, z0 + tip], [x + w / 2, 0.006, z1]),
  h.prism(prefix + '-tip', 'blade', 'y', [[z0 + tip, x - w / 2], [z0 + tip, x + w / 2], [z0, x + w / 2]], 0.004, 0.006),
  box(prefix + '-bolster', 'rivet', [x - w / 2, 0.004, z1], [x + w / 2, 0.012, z1 + 0.008]),
  box(prefix + '-handle', 'handle', [x - 0.011, 0.004, z1 + 0.008], [x + 0.011, 0.02, z1 + 0.008 + hl]),
  box(prefix + '-rivet-a', 'rivet', [x - 0.003, 0.02, z1 + 0.03], [x + 0.003, 0.021, z1 + 0.036]),
  box(prefix + '-rivet-b', 'rivet', [x - 0.003, 0.02, z1 + hl - 0.03], [x + 0.003, 0.021, z1 + hl - 0.024]),
];
[
  // An orange household extension cord 10 m long and 8 mm thick, wound in a loose coil 330 mm across with its
  // tail wrapped round the bundle, a moulded plug with two prongs and a single socket lying on top at the front.
  h.compound('extension_cable', 1.5, coil('loop', 'cable', 10, 0.15, 0.004) + [
    wrap('wrap', 'cable', 0.161, 0.018, 0.022, 0.03),
    box('plug', 'cable', [-0.09, 0.024, 0.14], [-0.054, 0.042, 0.168]),
    box('plug-grip', 'cable', [-0.054, 0.027, 0.148], [-0.04, 0.039, 0.16]),
    box('prong-a', 'prong', [-0.108, 0.031, 0.146], [-0.09, 0.035, 0.149]),
    box('prong-b', 'prong', [-0.108, 0.031, 0.159], [-0.09, 0.035, 0.162]),
    box('socket', 'cable', [0.03, 0.024, 0.13], [0.072, 0.054, 0.17]),
    box('socket-grip', 'cable', [0.04, 0.028, 0.116], [0.062, 0.05, 0.13]),
    box('slot-a', 'slot', [0.042, 0.036, 0.168], [0.045, 0.046, 0.171]),
    box('slot-b', 'slot', [0.057, 0.036, 0.168], [0.06, 0.046, 0.171]),
    box('slot-earth', 'slot', [0.049, 0.029, 0.168], [0.053, 0.033, 0.171]),
  ], { cable: 'plastic-orange', prong: 'brass', slot: 'plastic-black' })
  + { voxelGrain: 0.004 },

  // A heavy tow cable: 9 m of 12 mm steel wire rope in a black plastic jacket, coiled 440 mm across, with a crimped
  // steel sleeve and a forged hook on each end lying on top of the coil.
  h.compound('hd_tow_cable', 5.9, coil('loop', 'cable', 7, 0.2, 0.006) + [
    wrap('wrap', 'cable', -0.216, 0.022, 0.028, 0.04),
    h.tube('sleeve-l', 'sleeve', 0, 0.009, -0.12, -0.08, 0.03, 0.2),
    h.tube('sleeve-r', 'sleeve', 0, 0.009, 0.08, 0.12, 0.03, 0.2),
    box('tail-l', 'cable', [-0.08, 0.024, 0.194], [-0.02, 0.036, 0.206]),
    box('tail-r', 'cable', [0.02, 0.024, 0.194], [0.08, 0.036, 0.206]),
  ] + hook('hook-l', -0.12, 0.2, -1, 0.024, 0.012) + hook('hook-r', 0.12, 0.2, 1, 0.024, 0.012),
  { cable: 'plastic-charcoal', sleeve: 'steel-galvanised', hook: 'paint-red' })
  + { voxelGrain: 0.004 },

  // A single jumper lead 1 m long: black insulated copper cable 6 mm thick in two loose loops 170 mm across, with a
  // red-booted spring clamp on each end lying side by side at the front.
  h.compound('jumper_cable', 0.3, coil('loop', 'cable', 3, 0.075, 0.003) + [
    box('lead-l', 'cable', [-0.045, 0.006, 0.074], [-0.01, 0.012, 0.08]),
    box('lead-r', 'cable', [0.01, 0.006, 0.074], [0.045, 0.012, 0.08]),
  ] + clamp('clamp-l', -0.045, -1, 0.004, 0.077) + clamp('clamp-r', 0.045, 1, 0.004, 0.077),
  { cable: 'plastic-black', boot: 'plastic-red', jaw: 'copper' })
  + { voxelGrain: 0.002 },

  // An empty collapsible water bottle for 500 ml, lying flat: a clear blue soft body 210 mm long and 100 mm wide with
  // rounded corners, tapering shoulders, a screw cap on its neck and a hanging tab with a hole at the base.
  h.compound('bottle_folding', 0.027, [
    h.prism('body', 'body', 'y', [
      [-0.05, -0.07], [-0.044, -0.088], [-0.03, -0.096], [0.03, -0.096], [0.044, -0.088], [0.05, -0.07],
      [0.05, 0.06], [0.016, 0.098], [-0.016, 0.098], [-0.05, 0.06],
    ], 0, 0.006),
    box('tab', 'body', [-0.118, 0, -0.012], [-0.092, 0.004, 0.012]),
    box('tab-hole', 'cap', [-0.112, 0.004, -0.005], [-0.103, 0.005, 0.005]),
    h.rod('neck', 'cap', 0.011, 0.096, 0.104, 0.011),
    h.rod('cap', 'cap', 0.0135, 0.104, 0.124, 0.0135),
    box('label', 'label', [-0.055, 0.006, -0.03], [0.02, 0.007, 0.03]),
  ], { body: 'plastic-clear-blue', cap: 'plastic-blue', label: 'plastic-white' })
  + { voxelGrain: 0.002 },

  // A brushed stainless steel water bottle for 750 ml, 73 mm across and 260 mm tall with a rounded shoulder, a
  // black screw cap and a carry loop on top.
  h.compound('bottle_metal', 0.35, [
    turned('body', 'steel', 'y', [
      [0, 0], [0, 0.034], [0.003, 0.0365], [0.19, 0.0365], [0.205, 0.033], [0.218, 0.024], [0.226, 0.02],
      [0.232, 0.02], [0.232, 0],
    ]),
    disc('base-ring', 'trim', 0.0368, 0.004, 0.008),
    disc('cap', 'cap', 0.024, 0.232, 0.252),
    turned('loop', 'cap', 'z', [[0, 0.008], [0, 0.0125], [0.008, 0.0125], [0.008, 0.008], [0, 0.008]], [0, 0.252, -0.004]),
  ], { steel: 'steel-stainless', trim: 'steel-grey', cap: 'plastic-black' })
  + { voxelGrain: 0.002 },

  // A single-burner cooker for acetylene, 170 mm across and 95 mm tall: a steel ring base with three uprights
  // carrying pan supports, a brass burner bowl and crown in the middle, and a brass feed tube out to a needle valve
  // with a black knob and a hose barb for the gas line.
  local legs = [0, 120, 240];
  h.compound('acetylene_cooker', 0.76, [
    turned('base', 'steel', 'y', [[0, 0.06], [0, 0.075], [0.006, 0.075], [0.006, 0.06], [0, 0.06]]),
    disc('hub', 'steel', 0.018, 0, 0.008),
    box('spoke-x', 'steel', [-0.062, 0, -0.006], [0.062, 0.005, 0.006]),
    disc('column', 'brass', 0.011, 0.008, 0.05),
    turned('bowl', 'brass', 'y', [[0, 0], [0, 0.013], [0.012, 0.036], [0.018, 0.038], [0.018, 0]], [0, 0.048, 0]),
    disc('crown', 'crown', 0.034, 0.066, 0.072),
    disc('cap', 'brass', 0.018, 0.072, 0.076),
    h.rod('feed', 'brass', 0.005, 0.008, 0.11, 0.024),
    box('valve', 'brass', [0.098, 0.012, -0.011], [0.122, 0.038, 0.011]),
    disc('knob', 'knob', 0.011, 0.038, 0.054, 0.11, 0),
    h.rod('barb', 'brass', 0.004, 0.122, 0.148, 0.025),
    h.rod('barb-ridge', 'brass', 0.0055, 0.13, 0.134, 0.025),
  ] + std.flattenArrays([
    local a = legs[i] * std.pi / 180 + std.pi / 3, s = std.sin(a), c = std.cos(a);
    [
      box('post-%d' % i, 'steel', [0.068 * s - 0.004, 0, 0.068 * c - 0.004], [0.068 * s + 0.004, 0.084, 0.068 * c + 0.004]),
      h.prism('support-%d' % i, 'steel', 'y', [
        [0.072 * c - 0.004 * s, 0.072 * s + 0.004 * c], [0.072 * c + 0.004 * s, 0.072 * s - 0.004 * c],
        [0.042 * c + 0.004 * s, 0.042 * s - 0.004 * c], [0.042 * c - 0.004 * s, 0.042 * s + 0.004 * c],
      ], 0.084, 0.092),
    ]
    for i in [0, 1, 2]
  ]), { steel: 'steel-grey', brass: 'brass', crown: 'brass-dull', knob: 'plastic-black' })
  + { voxelGrain: 0.002 },

  // A butcher's knife roll laid open, 400 mm by 320 mm: a waxed canvas sheet with leather edging and a leather pocket
  // strip along the back holding a cleaver, a butcher knife, a boning knife, a skinning knife and a honing steel,
  // handles toward the front, and a leather tie strap with a buckle along the left edge.
  h.compound('butchering_kit', 0.99, [
    box('sheet', 'canvas', [-0.2, 0, -0.16], [0.2, 0.004, 0.16]),
    box('edge-front', 'leather', [-0.2, 0, 0.15], [0.2, 0.005, 0.16]),
    box('edge-back', 'leather', [-0.2, 0, -0.16], [0.2, 0.005, -0.15]),
    box('pocket', 'leather', [-0.17, 0.006, -0.155], [0.2, 0.01, -0.06]),
  ] + [
    box('stitch-%d' % i, 'edge', [-0.17 + i * 0.074 - 0.001, 0.01, -0.155], [-0.17 + i * 0.074 + 0.001, 0.0105, -0.06])
    for i in std.range(1, 4)
  ] + knife('cleaver', -0.133, 0.07, -0.14, -0.005, 0.11, 0.004)
  + knife('butcher', -0.06, 0.036, -0.15, 0.015, 0.12)
  + knife('boning', 0.014, 0.018, -0.15, 0.02, 0.11)
  + knife('skinner', 0.088, 0.032, -0.12, 0.03, 0.1, 0.03)
  + [
    turned('steel-rod', 'blade', 'z', [[0, 0], [0, 0.005], [0.17, 0.0065], [0.17, 0]], [0.16, 0.0105, -0.15]),
    box('steel-guard', 'rivet', [0.145, 0.004, 0.02], [0.175, 0.016, 0.026]),
    box('steel-handle', 'handle', [0.149, 0.004, 0.026], [0.171, 0.022, 0.13]),
    box('strap', 'leather', [-0.192, 0.004, -0.14], [-0.176, 0.008, 0.14]),
    box('buckle-side', 'rivet', [-0.196, 0.008, 0.06], [-0.192, 0.011, 0.084]),
    box('buckle-side-b', 'rivet', [-0.176, 0.008, 0.06], [-0.172, 0.011, 0.084]),
    box('buckle-bar', 'rivet', [-0.196, 0.008, 0.08], [-0.172, 0.011, 0.084]),
  ], { canvas: 'cloth-canvas', leather: 'leather-brown', edge: 'leather-tan', blade: 'steel-stainless', handle: 'plastic-black', rivet: 'steel-grey' })
  + { voxelGrain: 0.002 },

  // A hand-cranked can seamer in green-painted cast steel, 440 mm tall on a base 220 mm wide and 240 mm deep: a rear
  // column carrying an arm over the seaming chuck and its two rollers, a crank with a wooden knob on top, and a
  // lever at the side that lifts the can table up to the chuck. Front faces +z.
  h.compound('can_sealer', 15, [
    box('base', 'frame', [-0.11, 0, -0.14], [0.11, 0.018, 0.1]),
    box('foot-l', 'frame', [-0.11, 0, -0.14], [-0.09, 0.03, 0.1]),
    box('foot-r', 'frame', [0.09, 0, -0.14], [0.11, 0.03, 0.1]),
    box('column', 'frame', [-0.032, 0.018, -0.135], [0.032, 0.38, -0.075]),
    box('rib', 'frame', [-0.012, 0.018, -0.075], [0.012, 0.16, -0.045]),
    box('arm', 'frame', [-0.036, 0.33, -0.135], [0.036, 0.38, 0.04]),
    disc('chuck-boss', 'frame', 0.04, 0.31, 0.33),
    disc('chuck', 'steel', 0.03, 0.285, 0.31),
    disc('roller-1', 'steel', 0.014, 0.285, 0.305, 0.048, -0.006),
    disc('roller-2', 'steel', 0.012, 0.285, 0.305, 0.044, 0.024),
    disc('spindle', 'steel', 0.012, 0.38, 0.41),
    box('crank', 'steel', [-0.012, 0.41, -0.012], [0.17, 0.424, 0.012]),
    turned('knob', 'knob', 'y', [[0, 0], [0, 0.012], [0.012, 0.016], [0.04, 0.016], [0.05, 0.01], [0.05, 0]], [0.155, 0.424, 0]),
    disc('post', 'steel', 0.012, 0.018, 0.13),
    disc('table', 'steel', 0.05, 0.13, 0.145),
    h.rod('pivot', 'steel', 0.012, 0.032, 0.044, 0.085) + { origin: [0.032, 0.085, -0.1] },
    box('lever', 'steel', [0.044, 0.078, -0.11], [0.2, 0.092, -0.09]),
    h.rod('grip', 'knob', 0.013, 0.2, 0.25, 0.085) + { origin: [0.2, 0.085, -0.1] },
  ], { frame: 'paint-green', steel: 'steel-bright', knob: 'wood-walnut' })
  + { voxelGrain: 0.004 },
]
