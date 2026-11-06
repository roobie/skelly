local h = import '../compound.libsonnet';
// A wooden washboard standing upright, front on +z: two stiles with feet, a top rail with a soap ledge and a bed of
// round ribs between them. `w` is the overall width, `ht` the overall height.
local washboard(w, ht) =
  local half = w / 2, stile = 0.026, rib0 = 0.07, rib1 = ht - 0.10, n = std.floor((rib1 - rib0) / 0.016);
  [
    h.box('stile-l', 'frame', [-half, 0, -0.014], [-half + stile, ht, 0.014]),
    h.box('stile-r', 'frame', [half - stile, 0, -0.014], [half, ht, 0.014]),
    h.box('rail-top', 'frame', [-half + stile, ht - 0.090, -0.012], [half - stile, ht - 0.010, 0.012]),
    h.box('ledge', 'frame', [-half + stile, ht - 0.100, -0.012], [half - stile, ht - 0.090, 0.030]),
    h.box('rail-foot', 'frame', [-half + stile, 0.040, -0.012], [half - stile, 0.070, 0.012]),
    h.box('back', 'board', [-half + stile, 0.070, -0.008], [half - stile, ht - 0.100, -0.004]),
  ] + [
    h.rod('rib-%d' % i, 'rib', 0.006, -half + stile, half - stile, rib0 + 0.008 + i * 0.016)
    for i in std.range(0, n - 1)
  ];
[
  // A mechanical bathroom scale, 300 mm square and 50 mm tall: a steel housing with a ribbed rubber tread on top and a
  // round dial window at the front.
  h.compound('bathroom_scale', 2.5, [
    h.box('housing', 'housing', [-0.150, 0.004, -0.150], [0.150, 0.046, 0.150]),
    h.box('skirt', 'skirt', [-0.146, 0.002, -0.146], [0.146, 0.004, 0.146]),
    h.box('tread', 'tread', [-0.120, 0.046, -0.135], [0.120, 0.048, 0.070]),
  ] + [
    h.box('rib-%d' % i, 'rib', [-0.115, 0.048, -0.130 + i * 0.020], [0.115, 0.050, -0.122 + i * 0.020])
    for i in std.range(0, 9)
  ] + [
    h.disc('bezel', 'bezel', 0.040, 0.046, 0.049, 0, 0.105),
    h.disc('dial', 'dial', 0.034, 0.049, 0.050, 0, 0.105),
    h.box('needle', 'needle', [-0.001, 0.050, 0.080], [0.001, 0.051, 0.106]),
    h.disc('lens', 'lens', 0.034, 0.050, 0.052, 0, 0.105),
  ] + [
    h.disc('foot-%d' % i, 'skirt', 0.010, 0, 0.004, [-0.12, 0.12][i % 2], [-0.12, 0.12][std.floor(i / 2)])
    for i in std.range(0, 3)
  ], { housing: 'enamel-white', skirt: 'rubber-black', tread: 'rubber-black', rib: 'plastic-charcoal', bezel: 'steel-stainless', dial: 'paper-white', needle: 'plastic-red', lens: 'glass-clear' }) + {
    voxelGrain: 0.004,
  },
  // A hand scrub brush, 140 mm long and 60 mm wide: a blue plastic block with a finger ridge on top and rows of stiff
  // white bristle tufts underneath.
  h.compound('brush', 0.11, [
    h.prism('block', 'block', 'y', [[-0.022, -0.070], [0.022, -0.070], [0.030, -0.058], [0.030, 0.058], [0.022, 0.070], [-0.022, 0.070], [-0.030, 0.058], [-0.030, -0.058]], 0.024, 0.036),
    h.prism('ridge', 'block', 'z', [[-0.050, 0.036], [0.050, 0.036], [0.040, 0.046], [-0.040, 0.046]], -0.010, 0.010),
    h.box('bed', 'bristle', [-0.058, 0.010, -0.022], [0.058, 0.024, 0.022]),
  ] + [
    h.box('tuft-%d-%d' % [i, j], 'bristle', [-0.060 + i * 0.012, 0, -0.025 + j * 0.0125], [-0.052 + i * 0.012, 0.010, -0.017 + j * 0.0125])
    for i in std.range(0, 10)
    for j in std.range(0, 3)
  ], { block: 'plastic-blue', bristle: 'plastic-white' }) + {
    handling: h.gripOn('brush', 'ridge'),
    voxelGrain: 0.002,
  },
  // A 150 mm square of blue cotton cloth for patching, hemmed on two sides with one corner turned back.
  h.compound('cotton_patchwork', 0.005, [
    h.prism('patch', 'cloth', 'y', [[-0.075, -0.075], [0.075, -0.075], [0.075, 0.045], [0.045, 0.075], [-0.075, 0.075]], 0, 0.002),
    h.prism('fold', 'fold', 'y', [[0.045, 0.075], [0.075, 0.045], [0.045, 0.045]], 0.002, 0.004),
    h.box('hem-a', 'hem', [-0.075, 0.002, -0.075], [0.075, 0.003, -0.069]),
    h.box('hem-b', 'hem', [-0.075, 0.002, -0.069], [-0.069, 0.003, 0.075]),
  ], { cloth: 'cloth-shirt-blue', fold: 'cloth-navy', hem: 'cloth-navy' }) + {
    voxelGrain: 0.002,
  },
  // A wad of torn-up old clothes, 250 by 200 mm and 70 mm high: a folded pile of grubby rags with strips hanging off.
  h.compound('tattered_garment', 0.7, h.foldedGarment(0.25, 0.20, 0.056, 4) + [
    h.box('sleeve', 'strip', [-0.09, 0.056, -0.09], [0.10, 0.068, -0.03]),
    h.box('sleeve-end', 'strip', [0.10, 0.0, -0.09], [0.112, 0.068, -0.03]),
    h.box('rag', 'denim', [-0.13, 0.0, 0.01], [-0.118, 0.050, 0.08]),
    h.box('rag-top', 'denim', [-0.13, 0.056, 0.01], [-0.04, 0.062, 0.08]),
    h.box('tear', 'tear', [0.02, 0.056, 0.02], [0.08, 0.058, 0.08]),
  ], { cloth: 'cloth-rag', strip: 'cloth-shirt-faded', denim: 'cloth-denim-faded', tear: 'cloth-rag-shadow' }) + {
    voxelGrain: 0.004,
  },
  // A cotton dish towel folded to 200 by 130 mm and 16 mm thick, cream with two red woven stripes and a hanging loop.
  h.compound('dish_towel', 0.06, h.foldedGarment(0.20, 0.13, 0.016, 4) + [
    h.box('stripe-a', 'stripe', [-0.100, 0.016, -0.050], [0.100, 0.018, -0.040]),
    h.box('stripe-b', 'stripe', [-0.100, 0.016, 0.040], [0.100, 0.018, 0.050]),
    h.box('stripe-a-side', 'stripe', [0.100, 0.0, -0.050], [0.102, 0.018, -0.040]),
    h.box('stripe-b-side', 'stripe', [0.100, 0.0, 0.040], [0.102, 0.018, 0.050]),
    h.box('loop', 'stripe', [-0.112, 0.012, -0.006], [-0.094, 0.016, 0.006]),
  ], { cloth: 'cloth-cream', stripe: 'cloth-red' }) + {
    voxelGrain: 0.002,
  },
  // A cordless hair trimmer, 150 mm long: a black plastic body tapering to a brushed aluminium neck, a steel blade with
  // a comb of teeth at +x, and a sliding switch on top.
  h.compound('elec_hairtrimmer', 0.17, [
    h.prism('body', 'body', 'z', [[-0.075, 0.004], [-0.070, 0.0], [0.035, 0.0], [0.035, 0.030], [-0.070, 0.026], [-0.075, 0.022]], -0.014, 0.014),
    h.box('grip-l', 'grip', [-0.060, 0.004, 0.014], [0.020, 0.022, 0.016]),
    h.box('grip-r', 'grip', [-0.060, 0.004, -0.016], [0.020, 0.022, -0.014]),
    h.prism('neck', 'neck', 'z', [[0.035, 0.0], [0.062, 0.002], [0.062, 0.030], [0.035, 0.030]], -0.018, 0.018),
    h.box('blade', 'blade', [0.062, 0.004, -0.022], [0.067, 0.028, 0.022]),
  ] + [
    h.box('tooth-%d' % i, 'blade', [0.067, 0.006, -0.022 + i * 0.004], [0.075, 0.026, -0.020 + i * 0.004])
    for i in std.range(0, 10)
  ] + [
    h.box('switch', 'switch', [-0.010, 0.028, -0.005], [0.010, 0.032, 0.005]),
    h.box('lamp', 'lamp', [-0.030, 0.026, -0.002], [-0.026, 0.030, 0.002]),
  ], { body: 'plastic-black', grip: 'rubber-black', neck: 'alu-bare', blade: 'steel-stainless', switch: 'plastic-charcoal', lamp: 'plastic-green' }) + {
    handling: h.gripOn('elec_hairtrimmer', 'body'),
    voxelGrain: 0.002,
  },
  // A home hair colouring kit in its carton, 210 mm tall, 150 mm wide and 70 mm deep, front on +z: a white box with a
  // swatch of dyed hair on the front, a coloured band and a tinted lid flap.
  h.compound('hair_dye_kit', 0.2, [
    h.box('carton', 'carton', [-0.075, 0, -0.035], [0.075, 0.210, 0.035]),
    h.box('lid', 'band', [-0.075, 0.196, -0.035], [0.075, 0.210, 0.035]),
    h.box('band', 'band', [-0.075, 0.020, 0.035], [0.075, 0.040, 0.036]),
    h.prism('swatch', 'hair', 'z', [[-0.050, 0.060], [-0.010, 0.050], [0.035, 0.060], [0.058, 0.110], [0.050, 0.170], [0.000, 0.185], [-0.045, 0.170], [-0.060, 0.110]], 0.035, 0.037),
    h.prism('face', 'face', 'z', [[-0.012, 0.075], [0.012, 0.075], [0.022, 0.090], [0.024, 0.120], [0.014, 0.140], [-0.014, 0.140], [-0.024, 0.120], [-0.022, 0.090]], 0.037, 0.038),
    h.box('label', 'label', [-0.050, 0.044, 0.035], [0.050, 0.054, 0.037]),
    h.box('shade', 'hair', [0.075, 0.120, -0.025], [0.076, 0.170, 0.025]),
  ], { carton: 'paper-white', band: 'plastic-pink', hair: 'leather-chestnut', face: 'body-skin-player', label: 'paper-white' }) + {
    voxelGrain: 0.004,
  },
  // A string mop, 1.3 m long, lying along x: a 24 mm wooden pole with a hanging hole at the butt, a steel clamp
  // collar and a fan of cotton yarn strands at +x.
  h.compound('mop', 0.52, [
    h.rod('pole', 'pole', 0.012, -0.650, 0.360, 0.016),
    h.disc('hang', 'hole', 0.003, 0.027, 0.029, -0.635, 0),
    h.tube('collar', 'collar', 0.010, 0.020, 0.340, 0.400, 0.016, 0),
    h.box('clamp-wing', 'collar', [0.360, 0.030, -0.006], [0.380, 0.040, 0.006]),
  ] + [
    local a = (i - 6) * 0.075;
    h.prism('strand-%d' % i, 'yarn', 'y', [[0.006 * std.cos(a) - 0.0 + 0.0, 0.390], [-0.006, 0.390], [-0.006 + 0.25 * std.sin(a), 0.390 + 0.25 * std.cos(a)], [0.006 + 0.25 * std.sin(a), 0.390 + 0.25 * std.cos(a)]], 0.0, 0.010 + (i % 3) * 0.004)
    for i in std.range(0, 12)
  ] + [
    h.box('yarn-core', 'yarn', [0.390, 0.0, -0.030], [0.460, 0.026, 0.030]),
  ], { pole: 'wood-pine', hole: 'plastic-charcoal', collar: 'steel-galvanised', yarn: 'cord-cotton' }) + {
    handling: h.gripOn('mop', 'pole'),
    voxelGrain: 0.004,
  },
  // A collapsible flat mop folded for storage, 600 mm long: three nested aluminium tube sections with locking collars,
  // a blue plastic grip and a 350 by 120 mm microfibre pad on a swivel frame at +x.
  h.compound('mop_folded', 0.5, [
    h.rod('grip', 'grip', 0.014, -0.300, -0.200, 0.060),
    h.rod('outer', 'tube', 0.012, -0.200, 0.060, 0.060),
    h.tube('lock-a', 'grip', 0.012, 0.016, 0.060, 0.080, 0.060, 0),
    h.rod('middle', 'tube', 0.010, 0.080, 0.150, 0.060),
    h.tube('lock-b', 'grip', 0.010, 0.014, 0.150, 0.166, 0.060, 0),
    h.rod('inner', 'tube', 0.008, 0.166, 0.230, 0.060),
    h.box('swivel', 'grip', [0.226, 0.026, -0.010], [0.250, 0.060, 0.010]),
    h.box('frame', 'frame', [0.180, 0.016, -0.175], [0.300, 0.026, 0.175]),
    h.box('pad', 'pad', [0.176, 0, -0.178], [0.304, 0.016, 0.178]),
  ], { grip: 'plastic-blue', tube: 'alu-bare', frame: 'plastic-grey', pad: 'cloth-cream' }) + {
    handling: h.gripOn('mop_folded', 'grip'),
    voxelGrain: 0.004,
  },
  // One double-edged safety razor blade, 38 by 22 mm and drawn 2 mm thick (the finest grain): bright ground edges
  // along both long sides and the slotted centre that locates it in a razor.
  h.compound('razor_blade', 0.0004, [
    h.box('end-a', 'blade', [-0.019, 0, -0.008], [-0.012, 0.002, 0.008]),
    h.box('end-b', 'blade', [0.012, 0, -0.008], [0.019, 0.002, 0.008]),
    h.box('side-a', 'blade', [-0.012, 0, 0.002], [0.012, 0.002, 0.008]),
    h.box('side-b', 'blade', [-0.012, 0, -0.008], [0.012, 0.002, -0.002]),
    h.box('slot', 'slot', [-0.012, 0, -0.002], [0.012, 0.0004, 0.002]),
    h.box('edge-a', 'edge', [-0.019, 0, 0.008], [0.019, 0.002, 0.011]),
    h.box('edge-b', 'edge', [-0.019, 0, -0.011], [0.019, 0.002, -0.008]),
  ], { blade: 'steel-stainless', slot: 'plastic-charcoal', edge: 'steel-mirror' }) + {
    voxelGrain: 0.002,
  },
  // A travel shaving kit, 210 by 100 mm and 40 mm thick: a black nylon case with rounded corners, a zip running round
  // its middle, a pull tab and a carry loop at one end.
  h.compound('shavingkit', 0.13, [
    h.prism('case', 'case', 'y', [[-0.040, -0.105], [0.040, -0.105], [0.050, -0.095], [0.050, 0.095], [0.040, 0.105], [-0.040, 0.105], [-0.050, 0.095], [-0.050, -0.095]], 0, 0.040),
    h.prism('zip', 'zip', 'y', [[-0.041, -0.106], [0.041, -0.106], [0.051, -0.096], [0.051, 0.096], [0.041, 0.106], [-0.041, 0.106], [-0.051, 0.096], [-0.051, -0.096]], 0.018, 0.022),
    h.box('pull', 'pull', [0.080, 0.016, 0.050], [0.092, 0.024, 0.062]),
    h.box('loop-a', 'loop', [-0.120, 0.012, -0.012], [-0.106, 0.016, 0.012]),
    h.box('loop-b', 'loop', [-0.120, 0.024, -0.012], [-0.106, 0.028, 0.012]),
    h.box('loop-c', 'loop', [-0.124, 0.012, -0.012], [-0.120, 0.028, 0.012]),
    h.box('patch', 'patch', [-0.030, 0.040, -0.020], [0.030, 0.041, 0.020]),
  ], { case: 'nylon-black', zip: 'plastic-charcoal', pull: 'steel-grey', loop: 'webbing-black', patch: 'cloth-charcoal' }) + {
    handling: h.gripOn('shavingkit', 'case'),
    voxelGrain: 0.004,
  },
  // A kitchen sponge, 95 by 65 mm and 25 mm thick: yellow foam with a green scouring pad bonded to the top.
  h.compound('sponge', 0.013, [
    h.box('foam', 'foam', [-0.0475, 0, -0.0325], [0.0475, 0.019, 0.0325]),
    h.box('scour', 'scour', [-0.0475, 0.019, -0.0325], [0.0475, 0.025, 0.0325]),
  ] + [
    h.box('pore-%d' % i, 'pore', [-0.040 + (i % 5) * 0.018, 0.006 + std.floor(i / 5) * 0.006, 0.0325], [-0.036 + (i % 5) * 0.018, 0.008 + std.floor(i / 5) * 0.006, 0.0330])
    for i in std.range(0, 9)
  ], { foam: 'cloth-yellow', scour: 'cloth-green', pore: 'paint-crane-yellow' }) + {
    voxelGrain: 0.002,
  },
  // A makeshift haircut kit, 200 mm long: a rolled leather wrap tied with cord, a pair of steel scissors laid open on
  // top of the roll under the ties, a sharpened glass blade poking out of one end and a scrap of mirror tucked against
  // the back.
  h.compound('survivor_hairtrimmer', 0.25, [
    h.turned('roll', 'leather', 'x', [[0, 0], [0, 0.034], [0.170, 0.034], [0.170, 0]], [-0.100, 0.034, 0]),
    h.box('flap', 'flap', [-0.100, 0.020, 0.030], [0.070, 0.050, 0.038]),
    h.tube('tie-a', 'cord', 0.034, 0.037, -0.060, -0.054, 0.034, 0),
    h.tube('tie-b', 'cord', 0.034, 0.037, 0.030, 0.036, 0.034, 0),
    h.box('mirror', 'mirror', [-0.080, 0.018, -0.040], [0.000, 0.050, -0.036]),
    h.prism('blade-a', 'steel', 'y', [[0.0, -0.004], [0.007, -0.004], [0.013, 0.074], [0.010, 0.082]], 0.069, 0.073),
    h.prism('blade-b', 'steel', 'y', [[0.0, -0.004], [-0.007, -0.004], [-0.013, 0.074], [-0.010, 0.082]], 0.069, 0.073),
    h.disc('pivot', 'pivot', 0.004, 0.073, 0.075, 0.0, 0.0),
    h.box('shank-a', 'steel', [-0.046, 0.069, 0.002], [-0.004, 0.073, 0.008]),
    h.box('shank-b', 'steel', [-0.046, 0.069, -0.008], [-0.004, 0.073, -0.002]),
    h.turned('loop-a-ring', 'steel', 'y', [[0, 0.007], [0, 0.012], [0.004, 0.012], [0.004, 0.007], [0, 0.007]], [-0.056, 0.069, 0.010]),
    h.turned('loop-b-ring', 'steel', 'y', [[0, 0.007], [0, 0.012], [0.004, 0.012], [0.004, 0.007], [0, 0.007]], [-0.056, 0.069, -0.010]),
    h.prism('shard', 'glass', 'y', [[-0.008, 0.070], [0.012, 0.070], [0.0, 0.100]], 0.020, 0.024),
    h.box('shard-wrap', 'cord', [0.070, 0.018, -0.010], [0.080, 0.026, 0.014]),
  ], { leather: 'leather-brown', flap: 'leather-tan', cord: 'cord-cotton', mirror: 'mirror-silver', steel: 'steel-bright', pivot: 'steel-grey', glass: 'glass-clear' }) + {
    handling: h.gripOn('survivor_hairtrimmer', 'roll'),
    voxelGrain: 0.002,
  },
  // A makeshift shaving kit laid open, 150 by 120 mm: a leather wallet holding a straight blade knapped from glass in a
  // cord-wrapped wooden grip, a shard of mirror and a nub of soap.
  h.compound('survivor_shavingkit', 0.12, [
    h.box('wallet', 'leather', [-0.075, 0, -0.060], [0.075, 0.006, 0.060]),
    h.box('pocket', 'pocket', [-0.070, 0.006, -0.055], [0.070, 0.012, -0.010]),
    h.box('stitch-a', 'cord', [-0.075, 0.006, -0.060], [0.075, 0.007, -0.057]),
    h.box('strap', 'cord', [0.060, 0.006, -0.002], [0.075, 0.010, 0.006]),
    h.prism('mirror', 'mirror', 'y', [[0.004, -0.060], [0.050, -0.040], [0.040, 0.004], [0.000, -0.020]], 0.006, 0.010),
    h.rod('grip', 'grip', 0.007, -0.064, 0.004, 0.017),
    h.tube('grip-cord', 'cord', 0.007, 0.0085, -0.040, -0.020, 0.017, 0),
    h.prism('edge', 'glass', 'x', [[0.010, -0.010], [0.024, -0.010], [0.022, 0.004], [0.012, 0.012]], 0.004, 0.064),
    h.box('soap', 'soap', [0.020, 0.012, 0.022], [0.050, 0.030, 0.050]),
  ], { leather: 'leather-brown', pocket: 'leather-tan', cord: 'cord-cotton', mirror: 'mirror-silver', grip: 'wood-oak', glass: 'glass-clear', soap: 'wax-cream' }) + {
    voxelGrain: 0.002,
  },
  // A wooden washboard, 400 mm tall and 260 mm wide, front on +z: stiles with feet, a top rail with a soap ledge and a
  // bed of round ribs.
  h.compound('washboard', 1.1, washboard(0.26, 0.40), { frame: 'wood-oak', board: 'wood-pine', rib: 'wood-birch' }) + {
    voxelGrain: 0.004,
  },
  // A washing kit, 400 mm tall: the same kind of wooden washboard with a blue scrub brush tied across its ribs with
  // cord, so the pair travels as one.
  h.compound('wash_kit', 1.1, washboard(0.24, 0.40) + [
    h.prism('brush-block', 'block', 'z', [[-0.060, 0.150], [-0.050, 0.140], [0.050, 0.140], [0.060, 0.150], [0.060, 0.190], [0.050, 0.200], [-0.050, 0.200], [-0.060, 0.190]], 0.030, 0.048),
    h.box('bristle', 'bristle', [-0.056, 0.144, 0.010], [0.056, 0.196, 0.030]),
    h.box('tie-l', 'cord', [-0.044, 0.130, -0.014], [-0.038, 0.210, 0.050]),
    h.box('tie-r', 'cord', [0.038, 0.130, -0.014], [0.044, 0.210, 0.050]),
  ], { frame: 'wood-oak', board: 'wood-pine', rib: 'wood-birch', block: 'plastic-blue', bristle: 'plastic-white', cord: 'cord-cotton' }) + {
    voxelGrain: 0.004,
  },
]
