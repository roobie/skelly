local h = import '../compound.libsonnet';
local box = h.box;
local turned = h.turned;
local disc = h.disc;
local rod = h.rod;
// A cylinder along z from `z0` to `z1`, its axis at (x, y).
local zrod(id, slot, r, z0, z1, x, y) = turned(id, slot, 'z', [[0, 0], [0, r], [z1 - z0, r], [z1 - z0, 0]], [x, y, z0]);
// A wooden pallet 1.22 m by 0.48 m carrying fifteen adobe bricks in three rows, for the wet and dry states.
local adobePallet(id, massKg, brick) = h.compound(id, massKg, [
  box('stringer-%d' % i, 'frame', [-0.61, 0, z - 0.02], [0.61, 0.08, z + 0.02])
  for i in [0, 1, 2]
  for z in [[-0.22, 0, 0.22][i]]
] + [
  box('deck-%d' % i, 'deck', [x - 0.05, 0.08, -0.24], [x + 0.05, 0.096, 0.24])
  for i in std.range(0, 6)
  for x in [-0.56 + i * 0.1867]
] + [
  box('brick-%d-%d' % [i, j], 'brick', [-0.595 + i * 0.24, 0.096, -0.23 + j * 0.16], [-0.375 + i * 0.24, 0.176, -0.09 + j * 0.16])
  for i in std.range(0, 4)
  for j in [0, 1, 2]
], { frame: 'wood-pine', deck: 'wood-pine', brick: brick }) + { voxelGrain: 0.008 };
// A pulley block lying flat at x, its sheave axes upright: an [z, x] outline drawn as cheeks above and below the
// sheaves, `n` sheaves showing at the sides between them. Slots: shell, sheave.
local cheek(id, slot, hx, hz, x, y0, y1) = h.prism(id, slot, 'y', [
  [-hz * 0.65, x - hx], [hz * 0.65, x - hx], [hz, x - hx * 0.6], [hz, x + hx * 0.6],
  [hz * 0.65, x + hx], [-hz * 0.65, x + hx], [-hz, x + hx * 0.6], [-hz, x - hx * 0.6],
], y0, y1);
[
  // A carbide acetylene generator: a steel water tank 180 mm across and 300 mm tall, a gas bell domed above it with
  // the carbide hopper cap, a pressure gauge on the front, an outlet valve and a carry handle; 370 mm tall.
  h.compound('acetylene_machine', 4.9, [
    disc('tank', 'tank', 0.09, 0.012, 0.30),
    disc('foot', 'ring', 0.094, 0, 0.014),
    turned('rim', 'ring', 'y', [[0, 0.08], [0, 0.095], [0.014, 0.095], [0.014, 0.08], [0, 0.08]], [0, 0.29, 0]),
    disc('bell', 'bell', 0.075, 0.30, 0.325),
    h.dome('bell-top', 'bell', 0.075, 0.025, 0.006, 'y', [0, 0.32, 0]),
    disc('hopper', 'cap', 0.026, 0.335, 0.365),
    disc('hopper-knob', 'cap', 0.01, 0.365, 0.375),
    zrod('gauge', 'gauge', 0.024, 0.088, 0.104, 0.03, 0.22),
    zrod('dial', 'dial', 0.019, 0.104, 0.106, 0.03, 0.22),
    rod('outlet', 'valve', 0.007, 0.06, 0.125, 0.335),
    disc('valve-wheel', 'cap', 0.015, 0.345, 0.352, 0.095, 0),
    disc('valve-stem', 'valve', 0.004, 0.335, 0.345, 0.095, 0),
    box('handle-bar', 'handle', [-0.07, 0.385, -0.009], [0.07, 0.4, 0.009]),
    box('handle-post-a', 'handle', [-0.08, 0.31, -0.008], [-0.068, 0.4, 0.008]),
    box('handle-post-b', 'handle', [0.068, 0.31, -0.008], [0.08, 0.4, 0.008]),
    box('drain', 'valve', [-0.03, 0.03, 0.088], [0.0, 0.05, 0.1]),
  ], { tank: 'steel-galvanised', ring: 'steel-grey', bell: 'paint-drum-blue', cap: 'brass-dull', gauge: 'steel-grey', dial: 'enamel-white', valve: 'brass-dull', handle: 'paint-charcoal' })
  + { voxelGrain: 0.004 },

  // A light wooden pallet 1.22 m by 0.48 m with fifteen sun-dried adobe bricks, each 220 by 140 by 80 mm, in three rows.
  adobePallet('adobe_pallet_done', 64, 'brick-buff'),

  // The same pallet with its fifteen bricks freshly moulded and still wet.
  adobePallet('adobe_pallet_full', 79, 'clay-wet'),

  // A 115 mm angle grinder lying on its disc: a motor body 0.35 m long ending in a cable tail, a gear head over the
  // wheel with a half guard, and a side handle screwed into the head.
  h.compound('angle_grinder', 1.5, [
    turned('body', 'body', 'x', [[0, 0], [0, 0.027], [0.06, 0.031], [0.26, 0.033], [0.27, 0.03], [0.27, 0]], [-0.20, 0.05, 0]),
    rod('cable', 'grip', 0.008, -0.26, -0.20, 0.05),
    box('switch', 'switch', [-0.06, 0.081, -0.008], [0.0, 0.088, 0.008]),
  ] + [
    box('vent-%d' % i, 'grip', [-0.17 + i * 0.012, 0.075, -0.012], [-0.165 + i * 0.012, 0.085, 0.012])
    for i in std.range(0, 3)
  ] + [
    box('head', 'head', [0.07, 0.014, -0.032], [0.135, 0.078, 0.032]),
    disc('wheel', 'wheel', 0.0575, 0, 0.006, 0.10, 0),
    disc('nut', 'head', 0.012, 0.006, 0.014, 0.10, 0),
  ] + h.crescent('guard', 'guard', 0.014, 0.062, 180, 360, 8, 0.008, 0.012, 0.10, 0)
  + h.crescent('guard-lip', 'guard', 0.058, 0.062, 180, 360, 8, 0.0, 0.012, 0.10, 0)
  + [
    zrod('side-handle', 'grip', 0.013, 0.032, 0.13, 0.105, 0.05),
  ], { body: 'plastic-charcoal', grip: 'plastic-matte-black', switch: 'plastic-red', head: 'alu-bare', wheel: 'ceramic-grey', guard: 'steel-bright' })
  + { handling: h.gripOn('angle_grinder', 'body'), voxelGrain: 0.004 },

  // A 100 mm bench vice, 427 mm from the anvil flat to the screw handle: a cast body on a swivel base, a fixed jaw
  // with an anvil flat behind it, a sliding jaw, the screw and its tommy bar, front on +z.
  h.compound('bench_vise', 12, [
    box('base', 'body', [-0.09, 0, -0.12], [0.09, 0.025, 0.06]),
    disc('swivel', 'body', 0.075, 0.025, 0.045, 0, -0.04),
    box('fixed-body', 'body', [-0.055, 0.045, -0.15], [0.055, 0.13, -0.02]),
    box('anvil', 'anvil', [-0.05, 0.11, -0.215], [0.05, 0.15, -0.09]),
    box('fixed-jaw', 'body', [-0.075, 0.12, -0.09], [0.075, 0.19, -0.02]),
    box('fixed-plate', 'plate', [-0.07, 0.13, -0.02], [0.07, 0.185, -0.012]),
    box('slide', 'plate', [-0.03, 0.07, -0.12], [0.03, 0.115, 0.04]),
    box('moving-body', 'body', [-0.05, 0.06, 0.012], [0.05, 0.19, 0.12]),
    box('moving-jaw', 'body', [-0.075, 0.12, 0.012], [0.075, 0.19, 0.05]),
    box('moving-plate', 'plate', [-0.07, 0.13, 0.004], [0.07, 0.185, 0.012]),
    zrod('screw', 'screw', 0.011, 0.12, 0.185, 0, 0.095),
    zrod('boss', 'body', 0.02, 0.12, 0.15, 0, 0.095),
    rod('bar', 'screw', 0.006, -0.1, 0.1, 0.095) + { origin: [-0.1, 0.095, 0.185] },
    zrod('knob-a', 'screw', 0.01, 0.177, 0.193, -0.105, 0.095),
    zrod('knob-b', 'screw', 0.01, 0.177, 0.193, 0.105, 0.095),
    box('bolt-a', 'plate', [-0.08, 0.025, -0.11], [-0.064, 0.033, -0.094]),
    box('bolt-b', 'plate', [0.064, 0.025, -0.11], [0.08, 0.033, -0.094]),
    box('bolt-c', 'plate', [-0.08, 0.025, 0.035], [-0.064, 0.033, 0.051]),
    box('bolt-d', 'plate', [0.064, 0.025, 0.035], [0.08, 0.033, 0.051]),
  ], { body: 'paint-drum-blue', anvil: 'steel-grey', plate: 'steel-grey', screw: 'steel-bright' })
  + { voxelGrain: 0.004 },
  // Tongue-and-groove pliers 300 mm long with 60 mm angled jaws and dipped grips.
  h.item('big_pliers', 'pliers', 0.55, {
    kind: 'groove', length: 0.300, jawLength: 0.075, spread: 0.075,
    gripWidth: 0.018, thickness: 0.010, pivotRadius: 0.022, teeth: 6, toothDepth: 0.005,
  }, { metal: 'steel-grey', grip: 'plastic-red', dark: 'paint-charcoal' }) + {
    handling: { part: 'big_pliers', solid: 'grip--1', fraction: [0.5, 0.5, 0.5], turn: [0, 0, 0], hold: 'upright', roll: 0 },
    voxelGrain: 0.002,
  },

  // A steel block and tackle laid out flat: two triple-sheave blocks 75 mm long with forged hooks at their outer ends,
  // the rope reeved between them in three falls and its free end trailing; 0.42 m overall.
  local block(s, x) = [
    cheek(s + '-cheek-low', 'shell', 0.037, 0.03, x, 0, 0.004),
    cheek(s + '-cheek-high', 'shell', 0.037, 0.03, x, 0.032, 0.036),
    disc(s + '-sheave', 'sheave', 0.027, 0.004, 0.032, x, 0),
    disc(s + '-pin', 'shell', 0.008, 0.036, 0.04, x, 0),
  ];
  local hook(s, x, d) = [
    box(s + '-shank', 'hook', [std.min(x + d * 0.035, x + d * 0.06), 0.012, -0.005], [std.max(x + d * 0.035, x + d * 0.06), 0.024, 0.005]),
    box(s + '-bend', 'hook', [std.min(x + d * 0.06, x + d * 0.072), 0.012, -0.03], [std.max(x + d * 0.06, x + d * 0.072), 0.024, 0.005]),
    box(s + '-tip', 'hook', [std.min(x + d * 0.072, x + d * 0.04), 0.012, -0.03], [std.max(x + d * 0.072, x + d * 0.04), 0.024, -0.022]),
  ];
  h.compound('block_and_tackle', 1.6, block('a', -0.13) + block('b', 0.13) + hook('a', -0.13, -1) + hook('b', 0.13, 1) + [
    rod('fall-%d' % i, 'rope', 0.0045, -0.1, 0.1, 0.018) + { origin: [-0.1, 0.006 + i * 0.011, [-0.026, 0.026, -0.026][i]] }
    for i in [0, 1, 2]
  ] + [
    rod('tail', 'rope', 0.0045, -0.11, 0.06, 0.0045) + { origin: [-0.11, 0.0045, 0.045] },
    box('tail-end', 'rope', [0.06, 0, 0.04], [0.068, 0.009, 0.05]),
  ], { shell: 'paint-drum-blue', sheave: 'steel-grey', hook: 'steel-bright', rope: 'cord-cotton' })
  + { voxelGrain: 0.002 },

  // A wooden block and tackle laid out flat: two double-sheave ash blocks 90 mm long, each in a rope strop with an eye
  // at its outer end, reeved in two falls with the free end trailing; 0.45 m overall.
  local woodBlock(s, x, d) = [
    cheek(s + '-shell', 'shell', 0.045, 0.032, x, 0, 0.044),
    box(s + '-mortise', 'sheave', [x - 0.028, 0.044, -0.006], [x + 0.028, 0.046, 0.006]),
    disc(s + '-pin-high', 'pin', 0.006, 0.044, 0.047, x, 0),
    box(s + '-strop-a', 'rope', [x - 0.047, 0.018, 0.031], [x + 0.047, 0.028, 0.035]),
    box(s + '-strop-b', 'rope', [x - 0.047, 0.018, -0.035], [x + 0.047, 0.028, -0.031]),
  ] + h.crescent(s + '-eye', 'rope', 0.012, 0.019, if d > 0 then 0 else 180, if d > 0 then 180 else 360, 6, 0.016, 0.03, x + d * 0.052, 0);
  h.compound('block_and_tackle_wood', 0.37, woodBlock('a', -0.15, -1) + woodBlock('b', 0.15, 1) + [
    rod('fall-%d' % i, 'rope', 0.005, -0.105, 0.105, 0.022) + { origin: [-0.105, 0.022, [-0.018, 0.018][i]] }
    for i in [0, 1]
  ] + [
    rod('tail', 'rope', 0.005, -0.1, 0.08, 0.005) + { origin: [-0.1, 0.005, 0.05] },
  ], { shell: 'wood-birch', sheave: 'wood-oak', pin: 'wood-oak', rope: 'jute' })
  + { voxelGrain: 0.002 },

  // A portable sheet-steel brick kiln 380 mm wide, 320 mm deep and 360 mm tall on short legs, with a latched loading
  // door and a draught slide on the front (+z), a flue at the back of the roof and a handle at each side.
  h.compound('brick_kiln', 18, [
    box('body', 'body', [-0.19, 0.05, -0.16], [0.19, 0.36, 0.16]),
    box('roof', 'trim', [-0.195, 0.355, -0.165], [0.195, 0.37, 0.165]),
  ] + [
    box('leg-%d' % i, 'trim', [x - 0.015, 0, z - 0.015], [x + 0.015, 0.05, z + 0.015])
    for i in std.range(0, 3)
    for x in [[-0.17, 0.17, -0.17, 0.17][i]]
    for z in [[-0.14, -0.14, 0.14, 0.14][i]]
  ] + [
    box('door', 'door', [-0.13, 0.15, 0.16], [0.13, 0.33, 0.172]),
    box('latch', 'trim', [0.09, 0.225, 0.172], [0.13, 0.245, 0.182]),
    box('door-handle', 'handle', [0.1, 0.215, 0.182], [0.118, 0.255, 0.2]),
    box('hinge-a', 'trim', [-0.142, 0.17, 0.16], [-0.13, 0.2, 0.176]),
    box('hinge-b', 'trim', [-0.142, 0.28, 0.16], [-0.13, 0.31, 0.176]),
    box('draught', 'trim', [-0.1, 0.075, 0.16], [0.1, 0.115, 0.168]),
    box('draught-slot', 'vent', [-0.08, 0.085, 0.168], [0.06, 0.105, 0.17]),
    box('draught-knob', 'handle', [0.06, 0.085, 0.168], [0.075, 0.105, 0.18]),
    turned('flue', 'trim', 'y', [[0, 0], [0, 0.045], [0.02, 0.045], [0.02, 0.038], [0.2, 0.038], [0.2, 0]], [0, 0.37, -0.08]),
    disc('flue-cap', 'trim', 0.055, 0.6, 0.608, 0, -0.08),
    box('flue-cap-post', 'trim', [-0.004, 0.57, -0.084], [0.004, 0.6, -0.076]),
    box('side-handle-a', 'handle', [-0.215, 0.25, -0.06], [-0.205, 0.27, 0.06]),
    box('side-handle-a-post-a', 'trim', [-0.205, 0.25, -0.06], [-0.19, 0.27, -0.045]),
    box('side-handle-a-post-b', 'trim', [-0.205, 0.25, 0.045], [-0.19, 0.27, 0.06]),
    box('side-handle-b', 'handle', [0.205, 0.25, -0.06], [0.215, 0.27, 0.06]),
    box('side-handle-b-post-a', 'trim', [0.19, 0.25, -0.06], [0.205, 0.27, -0.045]),
    box('side-handle-b-post-b', 'trim', [0.19, 0.25, 0.045], [0.205, 0.27, 0.06]),
  ], { body: 'paint-charcoal', trim: 'steel-parkerized', door: 'steel-grey', handle: 'wood-oak', vent: 'coal-black' })
  + { voxelGrain: 0.004 },

  // A bronze pickaxe 910 mm long: an ash handle with a cast head 470 mm across, a pointed pick on +z and a flat chisel
  // wedge on -z, lying flat with the handle along x.
  h.compound('bronze_pickaxe', 5.5, [
    turned('handle', 'handle', 'x', [[0, 0], [0, 0.017], [0.05, 0.019], [0.6, 0.017], [0.86, 0.021], [0.9, 0.021], [0.9, 0]], [0, 0.022, 0]),
    box('eye', 'head', [0.83, 0.002, -0.032], [0.9, 0.042, 0.032]),
    h.prism('pick', 'head', 'y', [[0.032, 0.84], [0.032, 0.89], [0.26, 0.868], [0.26, 0.862]], 0.008, 0.036),
    h.prism('wedge', 'head', 'y', [[-0.032, 0.84], [-0.21, 0.835], [-0.21, 0.895], [-0.032, 0.89]], 0.01, 0.034),
    box('wedge-edge', 'edge', [0.835, 0.012, -0.214], [0.895, 0.032, -0.208]),
    box('wedge-handle-tip', 'handle', [0.9, 0.012, -0.012], [0.91, 0.032, 0.012]),
  ], { handle: 'wood-walnut', head: 'bronze-polished', edge: 'brass-polished' })
  + { handling: h.gripOn('bronze_pickaxe', 'handle'), voxelGrain: 0.004 },
  // A pair of hand carders 265 mm long laid side by side, teeth up: ash paddles 150 by 100 mm with turned handles,
  // each faced with a leather card cloth set with rows of fine wire teeth.
  local paddle(s, z) = [
    rod(s + '-handle', 'handle', 0.012, -0.115, 0.0, 0.012) + { origin: [-0.115, 0.012, z] },
    box(s + '-board', 'board', [0.0, 0.0, z - 0.05], [0.15, 0.012, z + 0.05]),
    box(s + '-cloth', 'cloth', [0.008, 0.012, z - 0.045], [0.142, 0.015, z + 0.045]),
  ] + [
    box(s + '-teeth-%d' % i, 'teeth', [0.012 + i * 0.0082, 0.015, z - 0.042], [0.014 + i * 0.0082, 0.019, z + 0.042])
    for i in std.range(0, 15)
  ];
  h.compound('carding_paddles', 0.54, paddle('a', -0.056) + paddle('b', 0.056),
    { handle: 'wood-birch', board: 'wood-birch', cloth: 'leather-tan', teeth: 'steel-bright' })
  + { handling: h.gripOn('carding_paddles', 'a-handle'), voxelGrain: 0.002 },

  // A paint chipper: a stiff 50 mm steel blade with a bevelled edge in a ferrule on a 100 mm beech handle, 175 mm overall.
  h.compound('chipper', 0.1, [
    turned('handle', 'handle', 'x', [[0, 0], [0, 0.011], [0.01, 0.014], [0.08, 0.013], [0.095, 0.010], [0.1, 0.010], [0.1, 0]], [-0.1, 0.014, 0]),
    rod('ferrule', 'ferrule', 0.0105, 0.0, 0.016, 0.014),
    h.prism('blade', 'blade', 'y', [[-0.007, 0.012], [0.007, 0.012], [0.025, 0.065], [-0.025, 0.065]], 0.012, 0.0145),
    h.prism('edge', 'edge', 'y', [[-0.025, 0.065], [0.025, 0.065], [0.025, 0.075], [-0.025, 0.075]], 0.0125, 0.014),
  ], { handle: 'wood-pine', ferrule: 'brass-dull', blade: 'steel-grey', edge: 'steel-bright' })
  + { handling: h.gripOn('chipper', 'handle'), voxelGrain: 0.002 },

  // A 100 mm C-clamp lying flat: a cast frame 150 mm tall with the screw, swivel pad and sliding tommy bar.
  h.compound('clamp', 1.2, [
    box('back', 'frame', [-0.06, 0, -0.07], [-0.04, 0.018, 0.075]),
    box('arm-top', 'frame', [-0.06, 0, 0.055], [0.04, 0.018, 0.075]),
    box('arm-low', 'frame', [-0.06, 0, -0.075], [0.04, 0.018, -0.055]),
    disc('boss', 'frame', 0.012, 0, 0.018, 0.03, -0.065),
    box('anvil', 'pad', [0.018, 0.002, 0.048], [0.042, 0.016, 0.055]),
    zrod('screw', 'screw', 0.006, -0.11, 0.035, 0.03, 0.009),
    zrod('swivel', 'pad', 0.011, 0.035, 0.043, 0.03, 0.009),
    rod('bar', 'screw', 0.004, -0.015, 0.075, 0.009) + { origin: [-0.015, 0.009, -0.112] },
    rod('bar-end-a', 'screw', 0.006, -0.02, -0.012, 0.009) + { origin: [-0.02, 0.009, -0.112] },
    rod('bar-end-b', 'screw', 0.006, 0.072, 0.08, 0.009) + { origin: [0.072, 0.009, -0.112] },
  ], { frame: 'paint-red', pad: 'steel-grey', screw: 'steel-bright' })
  + { voxelGrain: 0.002 },

  // A 240 mm claw bar: a hexagonal steel shank with a flattened chisel end at -x and a gooseneck claw rising at +x,
  // its tip split for pulling nails.
  h.compound('claw_bar', 0.46, [
    turned('shank', 'bar', 'x', [[0, 0], [0, 0.0085], [0.191, 0.0085], [0.191, 0]], [0.015, 0.0085, 0]),
    h.prism('chisel', 'bar', 'z', [[0.0, 0.006], [0.015, 0.0015], [0.015, 0.0155], [0.0, 0.009]], -0.011, 0.011),
    h.prism('bend', 'bar', 'z', [[0.201, 0.0], [0.221, 0.003], [0.241, 0.04], [0.226, 0.046], [0.206, 0.017]], -0.0085, 0.0085),
    h.prism('claw', 'bar', 'z', [[0.226, 0.046], [0.241, 0.04], [0.23, 0.06], [0.212, 0.064]], -0.011, 0.011),
    box('split', 'slot', [0.212, 0.054, -0.0015], [0.236, 0.066, 0.0015]),
  ], { bar: 'steel-parkerized', slot: 'coal-black' })
  + { handling: h.gripOn('claw_bar', 'shank'), voxelGrain: 0.002 },

  // A portable electric concrete mixer standing ready to load: a 140 L drum 0.66 m across with its mouth up, held in a
  // yoke with a geared ring and tilt wheel, on a tube stand with two wheels at the back and push handles at the front.
  h.compound('con_mix_foldable', 51, [
    turned('drum', 'drum', 'y', [[0, 0], [0, 0.24], [0.12, 0.31], [0.24, 0.33], [0.36, 0.25], [0.5, 0.16], [0.5, 0]], [0, 0.46, 0]),
    disc('mouth', 'inside', 0.14, 0.96, 0.962),
    turned('ring', 'ring', 'y', [[0, 0.3], [0, 0.345], [0.04, 0.345], [0.04, 0.3], [0, 0.3]], [0, 0.68, 0]),
    turned('pedestal', 'frame', 'y', [[0, 0], [0, 0.07], [0.32, 0.07], [0.32, 0]], [0, 0.14, 0]),
    box('post-a', 'frame', [-0.39, 0.14, -0.03], [-0.36, 0.72, 0.03]),
    box('post-b', 'frame', [0.36, 0.14, -0.03], [0.39, 0.72, 0.03]),
    box('yoke', 'frame', [-0.39, 0.42, -0.03], [0.39, 0.46, 0.03]),
    rod('pivot', 'frame', 0.025, -0.4, 0.4, 0.7),
    rod('tilt-hub', 'frame', 0.012, 0.39, 0.46, 0.7),
    turned('tilt-wheel', 'handle', 'x', [[0, 0.1], [0, 0.12], [0.02, 0.12], [0.02, 0.1], [0, 0.1]], [0.46, 0.7, 0]),
    box('motor', 'motor', [-0.5, 0.42, -0.13], [-0.39, 0.62, 0.11]),
    box('rail-a', 'frame', [-0.34, 0.12, -0.45], [-0.3, 0.16, 0.42]),
    box('rail-b', 'frame', [0.3, 0.12, -0.45], [0.34, 0.16, 0.42]),
    box('cross-a', 'frame', [-0.34, 0.12, -0.04], [0.34, 0.16, 0.04]),
    box('cross-b', 'frame', [-0.34, 0.12, 0.36], [0.34, 0.16, 0.42]),
    box('leg-a', 'frame', [-0.34, 0, 0.36], [-0.3, 0.12, 0.42]),
    box('leg-b', 'frame', [0.3, 0, 0.36], [0.34, 0.12, 0.42]),
    rod('axle', 'frame', 0.015, -0.46, 0.46, 0.15) + { origin: [-0.46, 0.15, -0.42] },
    rod('wheel-a', 'tyre', 0.15, -0.46, -0.4, 0.15) + { origin: [-0.46, 0.15, -0.42] },
    rod('wheel-b', 'tyre', 0.15, 0.4, 0.46, 0.15) + { origin: [0.4, 0.15, -0.42] },
    rod('hub-a', 'frame', 0.05, -0.47, -0.46, 0.15) + { origin: [-0.47, 0.15, -0.42] },
    rod('hub-b', 'frame', 0.05, 0.46, 0.47, 0.15) + { origin: [0.46, 0.15, -0.42] },
    h.prism('handle-a', 'frame', 'x', [[0.14, 0.4], [0.18, 0.4], [0.52, 0.72], [0.48, 0.72]], -0.34, -0.3),
    h.prism('handle-b', 'frame', 'x', [[0.14, 0.4], [0.18, 0.4], [0.52, 0.72], [0.48, 0.72]], 0.3, 0.34),
    rod('grip', 'handle', 0.018, -0.34, 0.34, 0.5) + { origin: [-0.34, 0.5, 0.71] },
  ], { drum: 'plastic-orange', inside: 'coal-black', ring: 'steel-grey', frame: 'paint-charcoal', handle: 'rubber-black', motor: 'plastic-charcoal', tyre: 'rubber-black' })
  + { voxelGrain: 0.01 },
]
