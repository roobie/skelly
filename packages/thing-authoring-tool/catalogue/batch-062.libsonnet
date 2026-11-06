local h = import '../compound.libsonnet';

// One dental instrument lying along x at depth z: a 120 mm knurled handle, a thin shank and a working tip.
local instrument(n, z, tip) =
  local y = 0.006;
  [
    h.rod('i%d-handle' % n, 'handle', 0.004, -0.08, 0.04, y) + { origin: [-0.08, y, z] },
    h.rod('i%d-shank' % n, 'tip', 0.002, 0.04, 0.066, y) + { origin: [0.04, y, z] },
  ] + [
    h.turned('i%d-knurl-%d' % [n, k], 'knurl', 'x', [[0, 0], [0, 0.0046], [0.006, 0.0046], [0.006, 0]], [-0.06 + k * 0.012, y, z])
    for k in std.range(0, 3)
  ] + tip(n, y, z);
local mirror(n, y, z) = [h.disc('i%d-mirror' % n, 'mirror', 0.009, y - 0.002, y + 0.001, 0.074, z)];
local hook(n, y, z) = [h.box('i%d-hook' % n, 'tip', [0.064, y, z - 0.002], [0.068, y + 0.012, z + 0.002])];
local sickle(n, y, z) = [h.box('i%d-sickle' % n, 'tip', [0.064, y - 0.002, z], [0.072, y + 0.002, z + 0.008])];
local probe(n, y, z) = [h.rod('i%d-probe' % n, 'tip', 0.002, 0.066, 0.085, y) + { origin: [0.066, y, z] }];

// A compressed gas cylinder standing on y, radius `r` and `ht` to its shoulder top, with a yoke regulator and
// gauge, a coiled-off supply tube and a face mask strapped to its front. `s` scales the regulator and mask.
// Slots: body, shoulder, valve, regulator, gauge, knob, tube, mask, strap.
local gasKit(r, ht, s) =
  local maskY = ht * 0.42;
  [
    h.turned('body', 'body', 'y', [[0, 0], [0, r * 0.92], [0.006, r], [ht * 0.8, r], [ht * 0.8, 0]]),
    h.turned('shoulder', 'shoulder', 'y', [[0, 0], [0, r], [ht * 0.12, r * 0.8], [ht * 0.2, r * 0.3], [ht * 0.2, 0]], [0, ht * 0.8, 0]),
    h.disc('valve', 'valve', 0.012 * s, ht - 0.002, ht + 0.03 * s),
    h.box('regulator', 'regulator', [-0.025 * s, ht + 0.012 * s, -0.02 * s], [0.025 * s, ht + 0.05 * s, 0.02 * s]),
    h.turned('gauge', 'gauge', 'z', [[0, 0], [0, 0.017 * s], [0.008 * s, 0.017 * s], [0.008 * s, 0]], [0, ht + 0.034 * s, 0.02 * s]),
    h.turned('gauge-rim', 'regulator', 'z', [[0, 0.015 * s], [0, 0.0185 * s], [0.01 * s, 0.0185 * s], [0.01 * s, 0.015 * s], [0, 0.015 * s]], [0, ht + 0.034 * s, 0.02 * s]),
    h.turned('knob', 'knob', 'x', [[0, 0], [0, 0.012 * s], [0.014 * s, 0.012 * s], [0.014 * s, 0]], [0.025 * s, ht + 0.03 * s, 0]),
    h.turned('barb', 'regulator', 'x', [[0, 0], [0, 0.004], [0.012 * s, 0.004], [0.012 * s, 0]], [-0.025 * s - 0.012 * s, ht + 0.02 * s, 0]),
    h.box('tube-top', 'tube', [-0.04 * s, ht + 0.017 * s, -0.003], [-0.034 * s, ht + 0.023 * s, r + 0.008]),
    h.box('tube-down', 'tube', [-0.04 * s, maskY + 0.02 * s, r + 0.002], [-0.034 * s, ht + 0.017 * s, r + 0.008]),
    h.turned('strap', 'strap', 'y', [[0, r - 0.001], [0, r + 0.0025], [0.012, r + 0.0025], [0.012, r - 0.001], [0, r - 0.001]], [0, maskY - 0.006, 0]),
    h.dome('mask', 'mask', 0.034 * s, 0.036 * s, 0.003, 'z', [0, maskY, r - 0.004]),
    h.turned('mask-port', 'tube', 'z', [[0, 0], [0, 0.008 * s], [0.012 * s, 0.008 * s], [0.012 * s, 0]], [0, maskY, r + 0.03 * s]),
  ];
local gasFinishes = {
  body: 'alu-bare',
  shoulder: 'paint-green',
  valve: 'brass',
  regulator: 'alu-bare',
  gauge: 'plastic-white',
  knob: 'plastic-green',
  tube: 'plastic-frosted',
  mask: 'plastic-clear',
  strap: 'latex-pale',
};

[
  // A zipped instrument roll laid open, 200 mm by 120 mm, holding a mirror, an explorer hook, a scaler and a probe.
  h.compound('dental_tools', 0.19, [
    h.box('roll', 'cloth', [-0.1, 0, -0.06], [0.1, 0.002, 0.06]),
    h.rod('rolled-flap', 'cloth', 0.007, -0.1, 0.1, 0.007) + { origin: [-0.1, 0.007, 0.053] },
    h.box('zip', 'zip', [-0.1, 0, -0.062], [0.1, 0.004, -0.058]),
    h.box('band', 'band', [-0.036, 0.002, -0.05], [-0.024, 0.0115, 0.03]),
  ]
  + instrument(0, -0.04, mirror)
  + instrument(1, -0.018, hook)
  + instrument(2, 0.004, sickle)
  + instrument(3, 0.024, probe),
    { cloth: 'cloth-navy', zip: 'plastic-black', band: 'cloth-black', handle: 'steel-stainless', knurl: 'steel-grey', tip: 'steel-bright', mirror: 'steel-mirror' }) + {
    voxelGrain: 0.002,
  },
  // A small zip bag 90 mm by 70 mm of six cotton balls damp with antiseptic.
  h.compound('disincotton_ball', 0.0084, [
    h.box('bag', 'bag', [-0.045, 0, -0.035], [0.045, 0.001, 0.035]),
    h.box('zip', 'zip', [-0.045, 0, -0.035], [0.045, 0.004, -0.03]),
  ] + [
    h.ball('ball-%d' % i, if i % 2 == 0 then 'cotton' else 'stain', 0.012, [-0.026, 0, 0.026, -0.026, 0, 0.026][i], 0.012, [-0.012, -0.012, -0.012, 0.014, 0.014, 0.014][i], 0.8)
    for i in std.range(0, 5)
  ], { bag: 'plastic-bag', zip: 'plastic-blue', cotton: 'cloth-bright-white', stain: 'cloth-cream' }) + {
    voxelGrain: 0.002,
  },
  // A cotton rag folded twice to 140 mm by 100 mm, a damp antiseptic stain spreading over its top.
  h.compound('disinrag', 0.065,
    h.foldedGarment(0.14, 0.10, 0.02, 2) + [
      h.prism('stain', 'stain', 'y', [[-0.03, -0.04], [-0.035, 0.01], [0.0, 0.045], [0.03, 0.03], [0.035, -0.02], [0.005, -0.045]], 0.0195, 0.0205),
    ], { cloth: 'cloth-rag', stain: 'cloth-saffron' }) + {
    voxelGrain: 0.004,
  },
  // A metered-dose inhaler: a 28 mm wide plastic boot 65 mm tall with its mouthpiece to the front, a canister on top.
  h.compound('inhaler', 0.03, [
    h.prism('boot', 'boot', 'y', [[-0.011, -0.01], [-0.007, -0.014], [0.007, -0.014], [0.011, -0.01], [0.011, 0.01], [0.007, 0.014], [-0.007, 0.014], [-0.011, 0.01]], 0, 0.065),
    h.box('mouthpiece', 'boot', [-0.012, 0.003, 0.008], [0.012, 0.023, 0.028]),
    h.box('cap', 'cap', [-0.0125, 0.0025, 0.026], [0.0125, 0.0235, 0.036]),
    h.turned('canister', 'canister', 'y', [[0, 0], [0, 0.0105], [0.032, 0.0105], [0.036, 0.008], [0.04, 0.008], [0.04, 0]], [0, 0.055, 0]),
  ], { boot: 'plastic-blue', cap: 'plastic-grey', canister: 'alu-bare' }) + h.inHand('inhaler', 'boot') + {
    voxelGrain: 0.002,
  },
  // A 25 mm wide spray bottle 82 mm tall to the top of its pump, its nozzle to the front.
  h.compound('liq_bandage_spray', 0.025, [
    h.turned('bottle', 'bottle', 'y', [[0, 0], [0, 0.0125], [0.055, 0.0125], [0.06, 0.008], [0.064, 0.008], [0.064, 0]]),
    h.turned('label', 'label', 'y', [[0, 0], [0, 0.013], [0.032, 0.013], [0.032, 0]], [0, 0.012, 0]),
    h.disc('collar', 'pump', 0.009, 0.062, 0.07),
    h.disc('actuator', 'actuator', 0.0065, 0.07, 0.082),
    h.box('nozzle', 'actuator', [-0.002, 0.075, 0.005], [0.002, 0.079, 0.009]),
  ], { bottle: 'plastic-white', label: 'plastic-blue', pump: 'plastic-white', actuator: 'plastic-grey' }) + h.inHand('liq_bandage_spray', 'bottle') + {
    voxelGrain: 0.002,
  },
  // A sterile gauze pad sealed in a 110 mm by 100 mm paper sachet, the pad showing through a film window.
  h.compound('medical_gauze', 0.005, h.sachet(0.11, 0.1, 0.014) + [
    h.box('window', 'window', [-0.03, 0.013, -0.035], [0.035, 0.0145, 0.035]),
    h.box('stripe', 'stripe', [-0.045, 0.013, -0.05], [-0.038, 0.0145, 0.05]),
  ], { pouch: 'paper-white', crimp: 'paper-white', window: 'cloth-bright-white', stripe: 'plastic-blue' }) + {
    voxelGrain: 0.002,
  },
  // A 108 mm aluminium medical oxygen cylinder 0.36 m tall, its regulator bringing it to 0.42 m.
  h.compound('oxygen_tank', 1.9, gasKit(0.054, 0.36, 1), gasFinishes) + {
    voxelGrain: 0.004,
  },
  // A pistol-shaped needle-free jet injector 135 mm long, ceramic shell and alloy nozzle, a dose vial on top.
  h.compound('jet_injector', 0.25, [
    h.turned('body', 'body', 'x', [[0, 0], [0, 0.016], [0.11, 0.016], [0.122, 0.01], [0.122, 0]], [-0.06, 0.06, 0]),
    h.turned('nozzle', 'nozzle', 'x', [[0, 0], [0, 0.01], [0.006, 0.007], [0.014, 0.004], [0.014, 0]], [0.062, 0.06, 0]),
    h.disc('rear', 'nozzle', 0.012, 0, 0.004) + { axis: 'x', origin: [-0.064, 0.06, 0] },
    h.prism('grip', 'grip', 'z', [[-0.042, 0.05], [-0.012, 0.05], [-0.028, 0], [-0.058, 0]], -0.012, 0.012),
    h.box('trigger', 'nozzle', [-0.008, 0.03, -0.003], [-0.002, 0.046, 0.003]),
    h.box('guard', 'grip', [-0.022, 0.023, -0.004], [0.006, 0.027, 0.004]),
    h.box('guard-front', 'grip', [0.002, 0.023, -0.004], [0.006, 0.046, 0.004]),
    h.rod('vial', 'vial', 0.006, -0.02, 0.03, 0.078),
    h.turned('band', 'band', 'x', [[0, 0], [0, 0.0165], [0.006, 0.0165], [0.006, 0]], [0.03, 0.06, 0]),
  ], { body: 'ceramic-white', nozzle: 'steel-stainless', grip: 'plastic-charcoal', vial: 'plastic-amber', band: 'paint-red' }) + {
    handling: h.gripOn('jet_injector', 'grip'),
    voxelGrain: 0.002,
  },
  // A surgical scalpel 130 mm long: a flat 90 mm steel handle with a ribbed grip and a curved 40 mm blade.
  h.compound('scalpel', 0.024, [
    h.box('handle', 'handle', [0, -0.0015, -0.0045], [0.09, 0.0015, 0.0045]),
    h.prism('blade', 'blade', 'y', [[0.003, 0.088], [-0.004, 0.088], [-0.005, 0.108], [-0.003, 0.122], [0.003, 0.13]], -0.001, 0.001),
  ] + [
    h.box('rib-%d' % i, 'rib', [0.02 + i * 0.006, 0.0015, -0.004], [0.023 + i * 0.006, 0.0025, 0.004])
    for i in std.range(0, 5)
  ], { handle: 'steel-stainless', rib: 'steel-grey', blade: 'steel-mirror' }) + {
    handling: h.gripOn('scalpel', 'handle'),
    voxelGrain: 0.002,
  },
  // Trauma shears 145 mm long lying flat: plastic finger loops, angled steel blades with a blunt flat tip.
  h.compound('scissors_medical', 0.039, [
    h.turned('loop-a', 'handle', 'y', [[0, 0.008], [0, 0.013], [0.006, 0.013], [0.006, 0.008], [0, 0.008]], [-0.045, 0, 0.016]),
    h.turned('loop-b', 'handle', 'y', [[0, 0.009], [0, 0.016], [0.006, 0.016], [0.006, 0.009], [0, 0.009]], [-0.044, 0, -0.019]),
    h.prism('arm-a', 'handle', 'y', [[0.006, -0.034], [0.012, -0.034], [0.005, 0.004], [-0.001, 0.004]], 0, 0.006),
    h.prism('arm-b', 'handle', 'y', [[-0.008, -0.034], [-0.002, -0.034], [0.001, 0.004], [-0.005, 0.004]], 0, 0.006),
    h.prism('blade-a', 'blade', 'y', [[-0.007, 0], [0.006, 0], [-0.019, 0.088], [-0.025, 0.088]], 0.004, 0.006),
    h.prism('blade-b', 'blade', 'y', [[-0.007, 0], [0.006, 0], [-0.017, 0.084], [-0.027, 0.084]], 0.002, 0.004),
    h.disc('tip', 'blade', 0.006, 0.002, 0.004, 0.087, -0.023),
    h.disc('pivot', 'pivot', 0.004, 0.001, 0.008, 0.002, 0),
  ], { handle: 'plastic-blue', blade: 'steel-stainless', pivot: 'steel-grey' }) + {
    handling: h.gripOn('scissors_medical', 'loop-a'),
    voxelGrain: 0.002,
  },
  // A small 80 mm oxygen cylinder 0.17 m tall with a folding regulator and mask, 0.22 m overall.
  h.compound('smoxygen_tank', 0.56, gasKit(0.04, 0.17, 0.75), gasFinishes) + {
    voxelGrain: 0.002,
  },
  // An empty 3 ml syringe, 105 mm long with its plunger drawn back and needle capped.
  h.compound('syringe', 0.0031, h.syringe(0.045, 0.005, 0.5, 0.025), {
    barrel: 'plastic-clear', dose: 'plastic-clear', stopper: 'rubber-black', plunger: 'plastic-white', hub: 'plastic-blue', cap: 'plastic-orange',
  }) + { voxelGrain: 0.002 },
  // A plastic air thermometer card 150 mm by 35 mm: a glass tube with a red column over a printed scale.
  h.compound('thermometer', 0.018, [
    h.box('card', 'card', [-0.075, 0, -0.0175], [0.075, 0.003, 0.0175]),
    h.box('tube', 'tube', [-0.055, 0.003, -0.003], [0.062, 0.007, 0.003]),
    h.ball('bulb', 'column', 0.005, -0.06, 0.005, 0, 0.8),
    h.box('column', 'column', [-0.058, 0.003, -0.0015], [0.01, 0.0075, 0.0015]),
    h.box('hole', 'mark', [0.066, 0.003, -0.003], [0.07, 0.0035, 0.003]),
  ] + [
    h.box('tick-%d' % i, 'mark', [-0.05 + i * 0.01, 0.003, if i % 2 == 0 then -0.013 else -0.011], [-0.048 + i * 0.01, 0.0035, -0.006])
    for i in std.range(0, 10)
  ] + [
    h.box('tock-%d' % i, 'mark', [-0.05 + i * 0.01, 0.003, 0.006], [-0.048 + i * 0.01, 0.0035, if i % 2 == 0 then 0.013 else 0.011])
    for i in std.range(0, 10)
  ], { card: 'plastic-white', tube: 'glass-clear', column: 'plastic-red', mark: 'plastic-black' }) + {
    voxelGrain: 0.002,
  },
  // A blood draw kit on a 130 mm by 80 mm backing card: a needle holder, a stoppered sample tube and a winged needle.
  h.compound('vacutainer', 0.018, [
    h.box('card', 'card', [-0.065, 0, -0.04], [0.065, 0.002, 0.04]),
    h.box('print', 'print', [-0.065, 0.002, -0.04], [-0.05, 0.0025, 0.04]),
    h.turned('holder', 'holder', 'x', [[0, 0], [0, 0.009], [0.04, 0.009], [0.044, 0.004], [0.048, 0.004], [0.048, 0]], [-0.04, 0.011, -0.02]),
    h.box('flange', 'holder', [-0.042, 0.002, -0.034], [-0.04, 0.02, -0.006]),
    h.rod('tube', 'tube', 0.0065, -0.035, 0.035, 0.0085) + { origin: [-0.035, 0.0085, 0.006] },
    h.rod('stopper', 'stopper', 0.0075, 0.035, 0.05, 0.0095) + { origin: [0.035, 0.0095, 0.006] },
  ] + h.strapLoop('tubing', 'tubing', 0.03, 0.008, 0.003, 0.003, 0.002, -0.005, 0.027) + [
    h.box('wings', 'wings', [0.016, 0.002, 0.018], [0.026, 0.005, 0.036]),
    h.box('needle-sheath', 'tubing', [0.026, 0.002, 0.026], [0.05, 0.006, 0.028]),
  ], { card: 'paper-white', print: 'plastic-blue', holder: 'plastic-frosted', tube: 'glass-clear', stopper: 'plastic-red', tubing: 'plastic-frosted', wings: 'plastic-green' }) + {
    voxelGrain: 0.002,
  },
  // A dosimeter badge sealed in an 80 mm by 60 mm foil pouch with a yellow warning label.
  h.compound('wrapped_rad_badge', 0.014, h.sachet(0.08, 0.06, 0.008) + [
    h.box('label', 'label', [-0.022, 0.0075, -0.02], [0.022, 0.0085, 0.02]),
    h.disc('hub', 'symbol', 0.0025, 0.0085, 0.0095),
  ] + [
    h.prism('blade-%d' % i, 'symbol', 'y', [
      [0.0, 0.0],
      [0.013 * std.cos((i * 120 - 30) * std.pi / 180), 0.013 * std.sin((i * 120 - 30) * std.pi / 180)],
      [0.013 * std.cos((i * 120 + 30) * std.pi / 180), 0.013 * std.sin((i * 120 + 30) * std.pi / 180)],
    ], 0.0085, 0.009)
    for i in std.range(0, 2)
  ], { pouch: 'foil-alu', crimp: 'foil-alu', label: 'plastic-yellow', symbol: 'plastic-black' }) + {
    voxelGrain: 0.002,
  },
]
