local h = import '../compound.libsonnet';
local box = h.box;
local turned = h.turned;
local prism = h.prism;
// Combs lie flat on y with their spine along x at +z and the teeth reaching to -z. `teeth` lists each run of teeth as
// [x0, x1, pitch]; a tooth is half its pitch wide.
local combTeeth(slot, runs, z0, z1, t) = std.flattenArrays([
  [
    box('tooth-%d-%d' % [r, i], slot, [runs[r][0] + i * runs[r][2], 0, z0], [runs[r][0] + i * runs[r][2] + runs[r][2] / 2, t, z1])
    for i in std.range(0, std.floor((runs[r][1] - runs[r][0]) / runs[r][2]) - 1)
  ]
  for r in std.range(0, std.length(runs) - 1)
]);
// A ring turned about x: an outline between radii, closed on its first point so the hole stays open.
local ring(id, slot, profile, origin) = turned(id, slot, 'x', profile + [profile[0]], origin);
[
  // A floating rubber duck, 80 mm from tail to beak and 75 mm tall, facing +z.
  h.compound('bath_toy', 0.019, [
    turned('body', 'body', 'z', [[0, 0], [0.006, 0.02], [0.02, 0.03], [0.05, 0.031], [0.068, 0.024], [0.075, 0]], [0, 0.03, -0.04]),
    prism('tail', 'body', 'x', [[0.045, -0.042], [0.06, -0.046], [0.058, -0.03], [0.045, -0.025]], -0.012, 0.012),
    h.ball('head', 'body', 0.021, 0, 0.066, 0.015),
    prism('beak', 'beak', 'x', [[0.06, 0.03], [0.064, 0.048], [0.069, 0.03]], -0.009, 0.009),
    box('eye-l', 'eye', [-0.021, 0.071, 0.021], [-0.017, 0.075, 0.025]),
    box('eye-r', 'eye', [0.017, 0.071, 0.021], [0.021, 0.075, 0.025]),
  ], { body: 'rubber-yellow', beak: 'plastic-orange', eye: 'plastic-black' }) + { voxelGrain: 0.002 },

  // A toilet brush 380 mm long: a 300 mm plastic handle with a hanging hole ring and a 75 mm round head of
  // bristles on a twisted steel stem with a domed tip.
  h.compound('brush_toilet', 0.13, [
    turned('handle', 'handle', 'x', [[0, 0], [0, 0.009], [0.01, 0.012], [0.2, 0.011], [0.28, 0.008], [0.3, 0.007], [0.3, 0]]),
    ring('hook', 'handle', [[0, 0.012], [0, 0.016], [0.008, 0.016], [0.008, 0.012]], [-0.008, 0.016, 0]),
    turned('stem', 'stem', 'x', [[0, 0], [0, 0.003], [0.085, 0.003], [0.085, 0]], [0.295, 0.016, 0]),
    // Tufted rows: the bristle head's outline steps in and out along the stem.
    turned('bristles', 'bristles', 'x', [[0, 0], [0, 0.03], [0.006, 0.04], [0.012, 0.036], [0.018, 0.04], [0.024, 0.036], [0.03, 0.04], [0.036, 0.036], [0.042, 0.04], [0.048, 0.036], [0.054, 0.04], [0.06, 0.036], [0.066, 0.038], [0.075, 0.028], [0.083, 0.012], [0.083, 0]], [0.3, 0.04, 0]),
  ], { handle: 'plastic-gloss-white', stem: 'steel-stainless', bristles: 'plastic-grey' }) + {
    handling: h.gripOn('brush_toilet', 'handle'),
    voxelGrain: 0.004,
  },

  // A stainless lice comb 100 mm long: a 45 mm flat handle and a 55 mm head with 30 mm teeth set close.
  h.compound('comb_lice', 0.035, [
    box('handle', 'steel', [-0.05, 0, -0.008], [-0.004, 0.002, 0.008]),
    box('spine', 'steel', [-0.004, 0, 0.004], [0.05, 0.004, 0.012]),
    box('neck', 'steel', [-0.006, 0, -0.008], [-0.002, 0.003, 0.012]),
  ] + [
    // Teeth one grain wide with two-grain gaps, so they stay apart in the iso view.
    box('tooth-%d' % i, 'steel', [0.002 + i * 0.006, 0, -0.026], [0.004 + i * 0.006, 0.002, 0.004])
    for i in std.range(0, 7)
  ], { steel: 'steel-stainless' }) + {
    handling: h.gripOn('comb_lice', 'handle'),
    voxelGrain: 0.002,
  },

  // A plastic pocket comb 180 mm long and 30 mm deep, coarse teeth for half its length and fine for the rest.
  h.compound('comb_pocket', 0.013, [
    box('spine', 'comb', [-0.09, 0, 0.006], [0.09, 0.004, 0.015]),
    box('end-a', 'comb', [-0.09, 0, -0.015], [-0.086, 0.003, 0.006]),
    box('end-b', 'comb', [0.086, 0, -0.015], [0.09, 0.003, 0.006]),
  ] + combTeeth('comb', [[-0.084, 0, 0.006], [0, 0.084, 0.004]], -0.015, 0.006, 0.003), { comb: 'plastic-black' }) + {
    handling: h.gripOn('comb_pocket', 'spine'),
    voxelGrain: 0.002,
  },

  // A soft foam hair roller 60 mm long and 26 mm across on a plastic core, its hinged clip lying along the top.
  h.compound('curler_hair', 0.0057, [
    turned('foam', 'foam', 'x', [[0, 0], [0, 0.011], [0.003, 0.013], [0.057, 0.013], [0.06, 0.011], [0.06, 0]], [-0.03, 0.013, 0]),
    turned('core', 'core', 'x', [[0, 0], [0, 0.005], [0.066, 0.005], [0.066, 0]], [-0.033, 0.013, 0]),
    box('clip', 'core', [-0.035, 0.026, -0.002], [0.028, 0.028, 0.002]),
    box('hinge', 'core', [-0.037, 0.01, -0.002], [-0.033, 0.028, 0.002]),
  ], { foam: 'foam-orange', core: 'plastic-pink' }) + { voxelGrain: 0.002 },

  // A curling iron 350 mm long: a 130 mm handle with a swivel cord stub, a 160 mm ceramic barrel 25 mm across
  // under its spring clamp, the clamp's lever over the handle and a cool tip.
  h.compound('curling_iron', 0.3, [
    turned('cord', 'cord', 'x', [[0, 0], [0, 0.004], [0.04, 0.004], [0.04, 0]], [-0.05, 0.016, 0]),
    turned('relief', 'handle', 'x', [[0, 0], [0, 0.006], [0.025, 0.009], [0.025, 0]], [-0.015, 0.016, 0]),
    turned('handle', 'handle', 'x', [[0, 0], [0, 0.013], [0.02, 0.016], [0.11, 0.016], [0.13, 0.014], [0.13, 0]], [0, 0.016, 0]),
    turned('barrel', 'barrel', 'x', [[0, 0], [0, 0.0125], [0.16, 0.0125], [0.16, 0]], [0.13, 0.016, 0]),
    turned('tip', 'handle', 'x', [[0, 0], [0, 0.011], [0.02, 0.008], [0.03, 0]], [0.29, 0.016, 0]),
    box('clamp', 'clamp', [0.14, 0.026, -0.009], [0.285, 0.031, 0.009]),
    box('lever', 'clamp', [0.06, 0.033, -0.006], [0.145, 0.038, 0.006]),
    box('pivot', 'clamp', [0.125, 0.026, -0.008], [0.145, 0.036, 0.008]),
    box('switch', 'switch', [0.03, 0.03, -0.004], [0.045, 0.034, 0.004]),
  ], { cord: 'plastic-black', handle: 'plastic-black', barrel: 'ceramic-white', clamp: 'steel-stainless', switch: 'plastic-red' }) + {
    handling: h.gripOn('curling_iron', 'handle'),
    voxelGrain: 0.004,
  },

  // A full set of dentures closed together, 60 mm across and 50 mm front to back: pink gum plates with a palate
  // on the upper one and fourteen teeth in each arch, front on +z.
  h.compound('dentures', 0.032,
             h.crescent('gum-lower', 'gum', 0.017, 0.031, -105, 105, 10, 0, 0.008)
             + h.crescent('gum-upper', 'gum', 0.017, 0.031, -105, 105, 10, 0.026, 0.034)
             + h.crescent('palate', 'gum', 0.002, 0.018, -105, 105, 6, 0.03, 0.034)
             + std.flattenArrays([
               h.crescent('tooth-%s-%d' % [row[0], i], 'teeth', 0.02, 0.029, -98 + i * 14 + 2.5, -98 + (i + 1) * 14 - 2.5, 1, row[1], row[1] + 0.009)
               for row in [['lower', 0.008], ['upper', 0.017]]
               for i in std.range(0, 13)
             ]),
             { gum: 'plastic-pink', teeth: 'plastic-gloss-white' }) + { voxelGrain: 0.002 },

  // A hand-held hair dryer standing on its handle, 250 mm from intake grille to nozzle and 230 mm tall: a 90 mm
  // barrel on a 150 mm handle with a slide switch and a cord stub at its foot.
  h.compound('hair_dryer', 0.5, [
    turned('barrel', 'body', 'x', [[0, 0], [0, 0.04], [0.02, 0.045], [0.16, 0.045], [0.19, 0.035], [0.19, 0]], [-0.08, 0.185, 0]),
    turned('nozzle', 'nozzle', 'x', [[0, 0], [0, 0.034], [0.04, 0.028], [0.06, 0.028], [0.06, 0]], [0.11, 0.185, 0]),
    turned('grille', 'grille', 'x', [[0, 0], [0, 0.036], [0.004, 0.036], [0.004, 0]], [-0.084, 0.185, 0]),
    prism('handle', 'body', 'z', [[-0.04, 0.012], [0, 0.012], [0.025, 0.15], [-0.025, 0.15]], -0.016, 0.016),
    box('switch', 'switch', [-0.004, 0.09, 0.016], [0.012, 0.12, 0.019]),
    turned('cord', 'cord', 'y', [[0, 0], [0, 0.006], [0.014, 0.006], [0.014, 0]], [-0.02, 0, 0]),
  ], { body: 'plastic-gloss-white', nozzle: 'plastic-charcoal', grille: 'plastic-charcoal', switch: 'plastic-pink', cord: 'plastic-black' }) + {
    handling: h.gripOn('hair_dryer', 'handle'),
    voxelGrain: 0.004,
  },

  // A paddle hairbrush 240 mm long: a 130 mm handle, a 110 by 75 mm head with a rubber cushion and rows of
  // ball-tipped pins standing up from it.
  h.compound('hairbrush', 0.11, [
    prism('handle', 'brush', 'y', [[-0.011, -0.12], [0.011, -0.12], [0.014, -0.01], [-0.014, -0.01]], 0, 0.014),
    prism('head', 'brush', 'y', [[-0.025, -0.01], [0.025, -0.01], [0.037, 0.02], [0.037, 0.1], [0.02, 0.12], [-0.02, 0.12], [-0.037, 0.1], [-0.037, 0.02]], 0, 0.016),
    prism('cushion', 'cushion', 'y', [[-0.021, 0.004], [0.021, 0.004], [0.031, 0.024], [0.031, 0.096], [0.017, 0.11], [-0.017, 0.11], [-0.031, 0.096], [-0.031, 0.024]], 0.016, 0.02),
  ] + std.flattenArrays([
    [
      box('pin-%d-%d' % [i, j], 'pin', [0.012 + i * 0.012 - 0.001, 0.02, -0.025 + j * 0.01 - 0.001], [0.012 + i * 0.012 + 0.001, 0.034, -0.025 + j * 0.01 + 0.001]),
      box('tip-%d-%d' % [i, j], 'tip', [0.012 + i * 0.012 - 0.002, 0.034, -0.025 + j * 0.01 - 0.002], [0.012 + i * 0.012 + 0.002, 0.038, -0.025 + j * 0.01 + 0.002]),
    ]
    for i in std.range(0, 7)
    for j in std.range(0, 5)
  ]), { brush: 'plastic-charcoal', cushion: 'rubber-black', pin: 'plastic-white', tip: 'plastic-black' }) + {
    handling: h.gripOn('hairbrush', 'handle'),
    voxelGrain: 0.002,
  },

  // A winged menstrual pad laid flat, 220 mm long and 70 mm across, 130 mm across its wings, with a quilted
  // centre channel.
  h.compound('menstrual_pad', 0.008, [
    prism('pad', 'pad', 'y', [[-0.02, -0.11], [0.02, -0.11], [0.035, -0.09], [0.035, 0.09], [0.02, 0.11], [-0.02, 0.11], [-0.035, 0.09], [-0.035, -0.09]], 0, 0.004),
    prism('wing-a', 'wing', 'y', [[0.035, -0.04], [0.065, -0.025], [0.065, 0.025], [0.035, 0.04]], 0, 0.002),
    prism('wing-b', 'wing', 'y', [[-0.035, 0.04], [-0.065, 0.025], [-0.065, -0.025], [-0.035, -0.04]], 0, 0.002),
    prism('channel', 'channel', 'y', [[-0.01, -0.075], [0.01, -0.075], [0.018, -0.05], [0.018, 0.05], [0.01, 0.075], [-0.01, 0.075], [-0.018, 0.05], [-0.018, -0.05]], 0.004, 0.006),
  ], { pad: 'cloth-bright-white', wing: 'cloth-bright-white', channel: 'petal-pink' }) + { voxelGrain: 0.002 },

  // A bellows plunger 600 mm long: a 380 mm handle with a T grip and a 200 mm accordion bellows 160 mm across,
  // narrowing to a stepped seal ring.
  h.compound('plunger_futuristic', 0.55, [
    box('grip', 'handle', [-0.02, 0.064, -0.06], [0.01, 0.096, 0.06]),
    turned('handle', 'handle', 'x', [[0, 0], [0, 0.013], [0.38, 0.013], [0.38, 0]], [0, 0.08, 0]),
    turned('bellows', 'bellows', 'x', [
      [0, 0], [0, 0.03], [0.02, 0.07], [0.04, 0.08], [0.06, 0.07], [0.08, 0.08], [0.1, 0.07], [0.12, 0.08], [0.14, 0.07], [0.16, 0.078], [0.18, 0.06], [0.19, 0.04], [0.19, 0],
    ], [0.37, 0.08, 0]),
    turned('seal', 'seal', 'x', [[0, 0], [0, 0.03], [0.025, 0.025], [0.04, 0.016], [0.04, 0]], [0.56, 0.08, 0]),
  ], { handle: 'plastic-black', bellows: 'plastic-red', seal: 'plastic-black' }) + {
    handling: h.gripOn('plunger_futuristic', 'handle'),
    voxelGrain: 0.004,
  },

  // A toilet plunger 540 mm long: a 450 mm wooden handle and a red rubber cup 150 mm across, open at +x.
  h.compound('plunger_toilet', 0.26, [
    turned('handle', 'handle', 'x', [[0, 0], [0, 0.011], [0.45, 0.011], [0.45, 0]], [0, 0.075, 0]),
    turned('cap', 'handle', 'x', [[0, 0], [0, 0.008], [0.005, 0.011], [0.005, 0]], [-0.005, 0.075, 0]),
    ring('cup', 'cup', [[0, 0.01], [0, 0.02], [0.02, 0.05], [0.07, 0.075], [0.09, 0.075], [0.09, 0.066], [0.068, 0.064], [0.02, 0.04], [0.008, 0.01]], [0.43, 0.075, 0]),
    turned('plug', 'cup', 'x', [[0, 0], [0, 0.012], [0.03, 0.012], [0.03, 0]], [0.42, 0.075, 0]),
  ], { handle: 'wood-oak', cup: 'plastic-red' }) + {
    handling: h.gripOn('plunger_toilet', 'handle'),
    voxelGrain: 0.004,
  },

  // A weighted cartridge razor 150 mm long: a metal-cored handle with a rubber grip, a neck and a 40 mm pivoting head
  // with three blades and a lubricating strip.
  h.compound('razor_shaving', 0.13, [
    turned('handle', 'handle', 'x', [[0, 0], [0, 0.007], [0.01, 0.009], [0.09, 0.008], [0.115, 0.006], [0.125, 0.004], [0.125, 0]], [-0.075, 0.009, 0]),
    turned('grip', 'grip', 'x', [[0, 0], [0, 0.0095], [0.05, 0.009], [0.05, 0]], [-0.055, 0.009, 0]),
    box('head', 'head', [0.05, 0.004, -0.02], [0.062, 0.014, 0.02]),
    box('blades', 'blade', [0.062, 0.006, -0.019], [0.064, 0.012, 0.019]),
    box('strip', 'strip', [0.064, 0.009, -0.019], [0.066, 0.014, 0.019]),
    box('guard', 'head', [0.064, 0.004, -0.019], [0.066, 0.008, 0.019]),
  ], { handle: 'steel-stainless', grip: 'rubber-black', head: 'plastic-charcoal', blade: 'steel-bright', strip: 'jelly-teal' }) + {
    handling: h.gripOn('razor_shaving', 'handle'),
    voxelGrain: 0.002,
  },

  // A plastic soap dish 130 mm long, 90 mm wide and 22 mm deep, with a rim and drainage ridges across its floor.
  h.compound('soap_holder', 0.12, [
    box('floor', 'dish', [-0.063, 0, -0.043], [0.063, 0.006, 0.043]),
    box('wall-front', 'dish', [-0.065, 0, 0.041], [0.065, 0.022, 0.045]),
    box('wall-back', 'dish', [-0.065, 0, -0.045], [0.065, 0.022, -0.041]),
    box('wall-left', 'dish', [-0.065, 0, -0.041], [-0.061, 0.022, 0.041]),
    box('wall-right', 'dish', [0.061, 0, -0.041], [0.065, 0.022, 0.041]),
  ] + [
    box('ridge-%d' % i, 'ridge', [-0.05 + i * 0.0125 - 0.002, 0.006, -0.032], [-0.05 + i * 0.0125 + 0.002, 0.012, 0.032])
    for i in std.range(0, 8)
  ], { dish: 'plastic-clear-blue', ridge: 'plastic-clear-blue' }) + { voxelGrain: 0.002 },

  // A dental floss dispenser 50 mm by 45 mm and 16 mm thick lying on its back: a white base, a hinged translucent lid
  // with a cutter at its top edge and a short tail of waxed thread.
  h.compound('string_floss', 0.012, [
    prism('base', 'base', 'y', [[-0.02, -0.022], [0.02, -0.022], [0.025, -0.017], [0.025, 0.017], [0.02, 0.022], [-0.02, 0.022], [-0.025, 0.017], [-0.025, -0.017]], 0, 0.009),
    prism('lid', 'lid', 'y', [[-0.02, -0.022], [0.02, -0.022], [0.025, -0.017], [0.025, 0.017], [0.02, 0.022], [-0.02, 0.022], [-0.025, 0.017], [-0.025, -0.017]], 0.009, 0.016),
    box('cutter', 'cutter', [-0.006, 0.012, 0.021], [0.006, 0.016, 0.024]),
    box('thread', 'thread', [-0.002, 0.014, 0.024], [0.0, 0.016, 0.036]),
  ], { base: 'plastic-gloss-white', lid: 'plastic-clear-blue', cutter: 'steel-stainless', thread: 'cord-cotton' }) + { voxelGrain: 0.002 },
]
