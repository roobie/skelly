local h = import '../compound.libsonnet';
local box = h.box;
local turned = h.turned;
local disc = h.disc;
local rod = h.rod;
// A ring of round section `t` about y, centre radius `rc`, its foot at `y0`: one turn of a coiled hose or cord.
local ring(id, slot, rc, t, y0, x=0, z=0) =
  local pts = [[t + t * std.sin(std.pi * i / 4), rc + t * std.cos(std.pi * i / 4)] for i in std.range(0, 7)];
  turned(id, slot, 'y', pts + [pts[0]], [x, y0, z]);
// A pistol-grip drill lying on its side along x, chuck at +x and a bit in it. A cordless one stands its grip on a
// battery pack; a corded one ends its grip in a strain relief with the cord coiled under it. Slots: housing, grip,
// trigger, chuck, bit, and battery or cord.
local drill(cordless) = [
  turned('housing', 'housing', 'x', [[0, 0], [0, 0.024], [0.012, 0.031], [0.105, 0.031], [0.12, 0.026], [0.12, 0]], [-0.075, 0.165, 0]),
  turned('nose', 'housing', 'x', [[0, 0], [0, 0.024], [0.018, 0.02], [0.018, 0]], [0.045, 0.165, 0]),
  turned('chuck', 'chuck', 'x', [[0, 0], [0, 0.018], [0.03, 0.017], [0.038, 0.011], [0.038, 0]], [0.063, 0.165, 0]),
  rod('bit', 'bit', 0.003, 0.101, 0.145, 0.165),
  h.prism('grip', 'grip', 'z', [[-0.062, 0.03], [-0.026, 0.03], [0.002, 0.14], [-0.04, 0.14]], -0.016, 0.016),
  box('trigger', 'trigger', [-0.004, 0.105, -0.007], [0.01, 0.128, 0.007]),
  box('switch', 'trigger', [-0.03, 0.15, -0.019], [-0.018, 0.158, 0.019]),
] + (
  if cordless then [
    box('battery', 'battery', [-0.08, 0, -0.035], [0.0, 0.032, 0.035]),
    box('battery-latch', 'grip', [-0.07, 0.032, -0.02], [-0.02, 0.036, 0.02]),
  ] else [
    box('foot', 'grip', [-0.072, 0.012, -0.02], [-0.018, 0.034, 0.02]),
    rod('relief', 'cord', 0.008, -0.095, -0.072, 0.022),
    ring('cord-a', 'cord', 0.045, 0.004, 0, -0.04, 0),
    ring('cord-b', 'cord', 0.041, 0.004, 0.006, -0.04, 0.004),
    box('cord-up', 'cord', [-0.099, 0.008, -0.004], [-0.091, 0.022, 0.004]),
  ]
);
// A demolition breaker lying along x: a T handle at -x, its drive body, the nose and a moil point at +x. Slots: handle,
// grip, body, nose, bit; the electric one adds battery, the petrol one engine, tank and starter.
local breakerFront(x0, x1, r) = [
  turned('body', 'body', 'x', [[0, 0], [0, r * 0.85], [0.015, r], [x1 - x0 - 0.015, r], [x1 - x0, r * 0.7], [x1 - x0, 0]], [x0, 0.09, 0]),
  turned('nose', 'nose', 'x', [[0, 0], [0, 0.045], [0.06, 0.04], [0.08, 0.03], [0.08, 0]], [x1, 0.09, 0]),
  turned('collar', 'nose', 'x', [[0, 0], [0, 0.05], [0.02, 0.05], [0.02, 0]], [x1 + 0.02, 0.09, 0]),
  turned('bit', 'bit', 'x', [[0, 0], [0, 0.016], [0.17, 0.014], [0.22, 0]], [x1 + 0.08, 0.09, 0]),
];
local tHandle(x) = [
  rod('shaft', 'handle', 0.022, x, x + 0.08, 0.09),
  turned('bar', 'handle', 'z', [[0, 0], [0, 0.02], [0.5, 0.02], [0.5, 0]], [x, 0.09, -0.25]),
  turned('grip-a', 'grip', 'z', [[0, 0], [0, 0.026], [0.13, 0.026], [0.13, 0]], [x, 0.09, -0.25]),
  turned('grip-b', 'grip', 'z', [[0, 0], [0, 0.026], [0.13, 0.026], [0.13, 0]], [x, 0.09, 0.12]),
];
// A cast case tray open for use, `w` along x and `d` deep, with walls `t` thick, floor at y = 0.
local tray(w, d, ht, t) = [
  box('floor', 'case', [-w / 2, 0, -d / 2], [w / 2, t, d / 2]),
  box('wall-front', 'case', [-w / 2, 0, d / 2 - t], [w / 2, ht, d / 2]),
  box('wall-back', 'case', [-w / 2, 0, -d / 2], [w / 2, ht, -d / 2 + t]),
  box('wall-left', 'case', [-w / 2, 0, -d / 2], [-w / 2 + t, ht, d / 2]),
  box('wall-right', 'case', [w / 2 - t, 0, -d / 2], [w / 2, ht, d / 2]),
];
[
  // A corded 10 mm drill driver, 22 cm from the back of the housing to the bit tip, 20 cm tall over the grip.
  h.compound('corded_powerdrill', 1.5, drill(false), {
    housing: 'plastic-charcoal', grip: 'rubber-black', trigger: 'plastic-red', chuck: 'steel-grey', bit: 'steel-blued',
    cord: 'plastic-black',
  }) + { handling: h.gripOn('corded_powerdrill', 'grip'), voxelGrain: 0.002 },

  // A cordless drill driver of the same frame, its grip standing on a slide-on battery pack.
  h.compound('cordless_drill', 1.6, drill(true), {
    housing: 'plastic-orange', grip: 'plastic-black', trigger: 'plastic-black', chuck: 'steel-grey', bit: 'steel-blued',
    battery: 'plastic-charcoal',
  }) + { handling: h.gripOn('cordless_drill', 'grip'), voxelGrain: 0.002 },

  // A 61 cm distaff with a hank of combed fibre tied near its head, beside a 30 cm drop spindle with a 6 cm whorl
  // and a cop of spun yarn on its shaft.
  h.compound('distaff_spindle', 0.26, [
    rod('distaff', 'wood', 0.011, -0.31, 0.3, 0.042) + { origin: [-0.31, 0.042, -0.035] },
    turned('fibre', 'fibre', 'x', [[0, 0], [0, 0.018], [0.03, 0.038], [0.13, 0.036], [0.17, 0.016], [0.18, 0]], [0.1, 0.042, -0.035]),
    turned('tie', 'yarn', 'x', [[0, 0], [0, 0.03], [0.008, 0.03], [0.008, 0]], [0.16, 0.042, -0.035]),
    turned('knob', 'wood', 'x', [[0, 0], [0, 0.016], [0.02, 0.016], [0.028, 0]], [0.3, 0.042, -0.035]),
    rod('spindle', 'wood', 0.005, -0.15, 0.15, 0.03) + { origin: [-0.15, 0.03, 0.05] },
    turned('whorl', 'wood', 'x', [[0, 0], [0, 0.03], [0.012, 0.028], [0.016, 0.012], [0.016, 0]], [-0.13, 0.03, 0.05]),
    turned('cop', 'yarn', 'x', [[0, 0], [0, 0.009], [0.02, 0.018], [0.09, 0.016], [0.13, 0.007], [0.13, 0]], [-0.11, 0.03, 0.05]),
  ], { wood: 'wood-birch', fibre: 'fleece-pale', yarn: 'knit-wool' }) + {
    handling: h.gripOn('distaff_spindle', 'distaff'),
    voxelGrain: 0.004,
  },

  // A battery-powered demolition breaker, 81 cm from the T handle to the point, its pack riding on the motor.
  h.compound('elec_jackhammer', 31, tHandle(-0.4) + breakerFront(-0.32, 0.12, 0.08) + [
    box('battery', 'battery', [-0.24, 0.165, -0.06], [-0.06, 0.24, 0.06]),
    box('battery-rail', 'body', [-0.25, 0.16, -0.05], [-0.05, 0.172, 0.05]),
    box('vent-a', 'nose', [-0.2, 0.06, 0.077], [-0.04, 0.07, 0.083]),
    box('vent-b', 'nose', [-0.2, 0.085, 0.077], [-0.04, 0.095, 0.083]),
    box('vent-c', 'nose', [-0.2, 0.11, 0.077], [-0.04, 0.12, 0.083]),
  ], {
    handle: 'steel-grey', grip: 'rubber-black', body: 'plastic-red', nose: 'steel-parkerized', bit: 'steel-hardened',
    battery: 'plastic-charcoal',
  }) + { handling: h.gripOn('elec_jackhammer', 'grip-b'), voxelGrain: 0.004 },

  // A tabletop fanning mill, 60 cm long, 65 cm tall and 36 cm wide: a fan drum turned by a crank on the front, a
  // hopper on top and the clean-grain chute sloping out at +x.
  h.compound('fanning_mill', 10, [
    box('leg-a', 'frame', [-0.28, 0, -0.17], [-0.24, 0.3, -0.13]),
    box('leg-b', 'frame', [-0.28, 0, 0.13], [-0.24, 0.3, 0.17]),
    box('leg-c', 'frame', [0.1, 0, -0.17], [0.14, 0.3, -0.13]),
    box('leg-d', 'frame', [0.1, 0, 0.13], [0.14, 0.3, 0.17]),
    box('rail-a', 'frame', [-0.28, 0.08, -0.17], [0.14, 0.11, -0.14]),
    box('rail-b', 'frame', [-0.28, 0.08, 0.14], [0.14, 0.11, 0.17]),
    turned('drum', 'body', 'z', [[0, 0], [0, 0.17], [0.3, 0.17], [0.3, 0]], [-0.15, 0.42, -0.15]),
    box('box', 'body', [-0.12, 0.28, -0.15], [0.16, 0.52, 0.15]),
    h.prism('hopper', 'body', 'z', [[0.0, 0.52], [0.14, 0.52], [0.2, 0.65], [-0.06, 0.65]], -0.14, 0.14),
    box('rim-a', 'frame', [-0.065, 0.63, -0.15], [0.205, 0.67, -0.13]),
    box('rim-b', 'frame', [-0.065, 0.63, 0.13], [0.205, 0.67, 0.15]),
    box('rim-c', 'frame', [-0.065, 0.63, -0.13], [-0.045, 0.67, 0.13]),
    box('rim-d', 'frame', [0.185, 0.63, -0.13], [0.205, 0.67, 0.13]),
    box('grain', 'grain', [-0.045, 0.645, -0.13], [0.185, 0.658, 0.13]),
    h.prism('chute', 'chute', 'z', [[0.16, 0.3], [0.16, 0.36], [0.3, 0.27], [0.3, 0.24]], -0.12, 0.12),
    box('spout', 'chute', [-0.06, 0.26, -0.1], [0.06, 0.28, 0.1]),
    turned('hub', 'iron', 'z', [[0, 0], [0, 0.02], [0.03, 0.02], [0.03, 0]], [-0.15, 0.42, 0.15]),
    turned('wheel', 'iron', 'z', [[0, 0.085], [0, 0.1], [0.012, 0.1], [0.012, 0.085], [0, 0.085]], [-0.15, 0.42, 0.165]),
    box('spoke-a', 'iron', [-0.24, 0.414, 0.165], [-0.06, 0.426, 0.177]),
    box('spoke-b', 'iron', [-0.156, 0.33, 0.165], [-0.144, 0.51, 0.177]),
    turned('crank-knob', 'frame', 'z', [[0, 0], [0, 0.012], [0.06, 0.012], [0.06, 0]], [-0.15, 0.51, 0.177]),
  ], { frame: 'wood-oak', body: 'wood-pine', chute: 'wood-birch', iron: 'iron-cast', grain: 'straw-pale' }) + { voxelGrain: 0.008 },

  // A 230 mm cut-off wheel, 3 mm thick with a 22 mm bore and a printed paper label.
  h.compound('grinder_cutoff_disc', 0.3, [
    turned('disc', 'disc', 'y', [[0, 0.011], [0, 0.115], [0.003, 0.115], [0.003, 0.011], [0, 0.011]]),
    turned('label', 'label', 'y', [[0, 0.016], [0, 0.05], [0.0005, 0.05], [0.0005, 0.016], [0, 0.016]], [0, 0.003, 0]),
    turned('bore', 'ring', 'y', [[0, 0.011], [0, 0.016], [0.004, 0.016], [0.004, 0.011], [0, 0.011]]),
  ], { disc: 'plastic-charcoal', label: 'paper-white', ring: 'steel-grey' }) + { voxelGrain: 0.002 },

  // A 180 mm depressed-centre grinding wheel, 7 mm thick, its hub dished down and labelled.
  h.compound('grinder_metal_grinding_disc', 0.41, [
    turned('disc', 'disc', 'y', [[0, 0.011], [0, 0.035], [0.005, 0.045], [0.005, 0.09], [0.012, 0.09], [0.012, 0.045], [0.007, 0.035], [0.007, 0.011], [0, 0.011]]),
    turned('label', 'label', 'y', [[0, 0.016], [0, 0.033], [0.0005, 0.033], [0.0005, 0.016], [0, 0.016]], [0, 0.007, 0]),
    turned('bore', 'ring', 'y', [[0, 0.011], [0, 0.016], [0.008, 0.016], [0.008, 0.011], [0, 0.011]]),
  ], { disc: 'stone-grey', label: 'paper-white', ring: 'steel-grey' }) + { voxelGrain: 0.002 },

  // A 12 inch hacksaw lying flat: a tubular frame over the blade, a wing nut at the toe and a pistol grip, 41 cm
  // overall.
  h.compound('hacksaw', 0.91, [
    box('top-bar', 'frame', [-0.13, 0, 0.078], [0.19, 0.014, 0.092]),
    box('toe-post', 'frame', [0.176, 0, 0.0], [0.19, 0.014, 0.092]),
    box('heel-post', 'frame', [-0.13, 0, -0.005], [-0.116, 0.014, 0.092]),
    box('blade', 'blade', [-0.12, 0.005, 0.0], [0.18, 0.009, 0.013]),
    h.prism('handle', 'handle', 'y', [[0.02, -0.112], [0.02, -0.142], [-0.06, -0.215], [-0.078, -0.19], [-0.01, -0.112]], 0, 0.022),
    rod('tensioner', 'nut', 0.004, 0.19, 0.205, 0.007),
    box('wing-nut', 'nut', [0.205, 0.003, -0.012], [0.211, 0.011, 0.018]),
  ], { frame: 'paint-red', blade: 'steel-bright', handle: 'plastic-black', nut: 'steel-grey' }) + {
    handling: h.gripOn('hacksaw', 'handle'),
    voxelGrain: 0.004,
  },

  // A rough-cast bronze hammer head, 9 cm tall, on a 25 cm pine haft wrapped in rawhide under the head.
  h.compound('hammer_bronze', 0.67, [
    rod('handle', 'handle', 0.013, 0, 0.245, 0.045),
    turned('head', 'head', 'y', [[0, 0], [0, 0.016], [0.006, 0.019], [0.045, 0.014], [0.084, 0.019], [0.09, 0.016], [0.09, 0]], [0.226, 0, 0]),
    turned('wrap', 'wrap', 'x', [[0, 0], [0, 0.016], [0.02, 0.016], [0.02, 0]], [0.188, 0.045, 0]),
  ], { handle: 'wood-birch', head: 'bronze', wrap: 'skin-rawhide' }) + {
    handling: h.gripOn('hammer_bronze', 'handle'),
    voxelGrain: 0.002,
  },

  // An eggbeater hand drill, 25 cm long: a turned wood handle, a steel frame, a 9 cm crown wheel with its crank knob,
  // a three-jaw chuck and one bit.
  h.compound('hand_drill', 0.9, [
    turned('handle', 'handle', 'x', [[0, 0], [0, 0.012], [0.01, 0.017], [0.055, 0.015], [0.065, 0.009], [0.065, 0]], [-0.11, 0.05, 0]),
    rod('frame', 'frame', 0.006, -0.045, 0.085, 0.05),
    box('yoke', 'frame', [-0.01, 0.042, -0.006], [0.01, 0.058, 0.012]),
    turned('wheel', 'wheel', 'z', [[0, 0.035], [0, 0.045], [0.006, 0.045], [0.006, 0.035], [0, 0.035]], [0, 0.05, 0.012]),
    box('spoke-a', 'wheel', [-0.036, 0.047, 0.012], [0.036, 0.053, 0.018]),
    box('spoke-b', 'wheel', [-0.003, 0.014, 0.012], [0.003, 0.086, 0.018]),
    turned('crank', 'handle', 'z', [[0, 0], [0, 0.007], [0.035, 0.007], [0.035, 0]], [0.0, 0.082, 0.018]),
    turned('pinion', 'frame', 'x', [[0, 0], [0, 0.009], [0.008, 0.009], [0.008, 0]], [0.04, 0.05, 0]),
    turned('chuck', 'chuck', 'x', [[0, 0], [0, 0.012], [0.025, 0.011], [0.032, 0.007], [0.032, 0]], [0.085, 0.05, 0]),
    rod('bit', 'bit', 0.0025, 0.117, 0.14, 0.05),
  ], { handle: 'wood-walnut', frame: 'steel-grey', wheel: 'paint-red', chuck: 'steel-bright', bit: 'steel-blued' }) + {
    handling: h.gripOn('hand_drill', 'handle'),
    voxelGrain: 0.002,
  },

  // A coil of 24 mm rubber hose, 24 cm across, three turns high with its loose end laid over the top.
  h.compound('hose', 0.42, [
    ring('turn-a', 'hose', 0.105, 0.012, 0),
    ring('turn-b', 'hose', 0.1, 0.012, 0.022, 0.003, -0.002),
    ring('turn-c', 'hose', 0.104, 0.012, 0.044, -0.002, 0.003),
    turned('end', 'hose', 'z', [[0, 0], [0, 0.012], [0.16, 0.012], [0.16, 0]], [0.03, 0.08, -0.06]),
    turned('end-bore', 'bore', 'z', [[0, 0], [0, 0.006], [0.001, 0.006], [0.001, 0]], [0.03, 0.08, 0.1]),
  ], { hose: 'rubber-offblack', bore: 'void-black' }) + { voxelGrain: 0.004 },

  // A small scissor jack bent up from scrap: 16 cm base, 18 cm across its open links, rusted plate and a crude
  // threaded rod.
  h.item('jack_makeshift', 'scissorJack', 1.1, {
    baseLength: 0.16, baseWidth: 0.07, baseThickness: 0.006,
    halfSpan: 0.08, halfHeight: 0.035, linkWidth: 0.018, linkDepth: 0.006, linkOffset: 0.024,
    screwRadius: 0.006, crankLength: 0.02, crankRadius: 0.007,
    saddleLength: 0.07, saddleWidth: 0.05, saddleThickness: 0.008,
  }, { frame: 'scrap-rusted', link: 'steel-bright', screw: 'steel-grey' }) + { voxelGrain: 0.004 },

  // A petrol breaker, 92 cm from the T handle to the point: a two-stroke engine block with its fuel tank on top and
  // a pull starter on the front, then the drive cylinder and the moil point.
  h.compound('jackhammer', 30, tHandle(-0.46) + breakerFront(-0.16, 0.14, 0.065) + [
    box('engine', 'engine', [-0.38, 0.0, -0.1], [-0.16, 0.19, 0.1]),
    box('cowl', 'cowl', [-0.37, 0.19, -0.09], [-0.17, 0.205, 0.09]),
    box('tank', 'tank', [-0.35, 0.205, -0.08], [-0.2, 0.27, 0.08]),
    disc('cap', 'starter', 0.018, 0.27, 0.285, -0.3, 0.03),
    turned('starter', 'starter', 'z', [[0, 0], [0, 0.06], [0.025, 0.06], [0.025, 0]], [-0.27, 0.1, 0.1]),
    box('pull', 'grip', [-0.3, 0.09, 0.125], [-0.24, 0.11, 0.14]),
    turned('exhaust', 'nose', 'x', [[0, 0], [0, 0.025], [0.07, 0.025], [0.07, 0]], [-0.23, 0.04, -0.12]),
  ], {
    handle: 'steel-grey', grip: 'rubber-black', body: 'steel-grey', nose: 'steel-parkerized', bit: 'steel-hardened',
    engine: 'paint-charcoal', cowl: 'paint-crane-yellow', tank: 'plastic-red', starter: 'plastic-black',
  }) + { handling: h.gripOn('jackhammer', 'grip-b'), voxelGrain: 0.004 },

  // A small top-loading electric kiln, 30 cm across and 33 cm tall on a stand: a steel-banded jacket, a fire-brick
  // lid with a handle, two peephole plugs and a controller box on the front.
  h.compound('kiln', 13, [
    disc('stand', 'stand', 0.13, 0.03, 0.045),
    box('leg-a', 'stand', [-0.11, 0, -0.01], [-0.09, 0.03, 0.01]),
    box('leg-b', 'stand', [0.09, 0, -0.01], [0.11, 0.03, 0.01]),
    box('leg-c', 'stand', [-0.01, 0, -0.11], [0.01, 0.03, -0.09]),
    box('leg-d', 'stand', [-0.01, 0, 0.09], [0.01, 0.03, 0.11]),
    disc('body', 'jacket', 0.14, 0.045, 0.27),
    disc('band-a', 'band', 0.145, 0.07, 0.08),
    disc('band-b', 'band', 0.145, 0.235, 0.245),
    disc('lid', 'brick', 0.135, 0.27, 0.305),
    disc('lid-band', 'band', 0.14, 0.275, 0.3),
    box('lid-handle', 'stand', [-0.05, 0.305, -0.01], [0.05, 0.325, 0.01]),
    disc('lid-plug', 'plug', 0.012, 0.305, 0.315, 0.06, 0.04),
    turned('plug', 'plug', 'z', [[0, 0], [0, 0.012], [0.015, 0.012], [0.015, 0]], [-0.06, 0.2, 0.128]),
    box('controller', 'control', [-0.03, 0.09, 0.13], [0.07, 0.2, 0.17]),
    turned('dial', 'dial', 'z', [[0, 0], [0, 0.015], [0.012, 0.015], [0.012, 0]], [0.02, 0.15, 0.17]),
    box('lamp', 'lamp', [0.045, 0.11, 0.17], [0.055, 0.12, 0.175]),
    rod('cord', 'cord', 0.004, 0.07, 0.15, 0.1) + { origin: [0.07, 0.1, 0.15] },
  ], {
    stand: 'steel-grey', jacket: 'steel-stainless', band: 'steel-grey', brick: 'brick-buff', plug: 'ceramic-white',
    control: 'plastic-black', dial: 'plastic-white', lamp: 'plastic-red', cord: 'plastic-black',
  }) + { voxelGrain: 0.004 },

  // A gunsmith's aluminium case, 36 cm by 26 cm, open with its lid standing behind: a foam tray holding a small
  // hammer, screwdrivers, a needle file, a wrench, a punch, a small hacksaw and a battery rotary tool.
  h.compound('large_repairkit', 4, tray(0.36, 0.26, 0.09, 0.006) + [
    box('lid', 'case', [-0.18, 0.09, -0.13], [0.18, 0.34, -0.118]),
    box('lid-foam', 'foam', [-0.17, 0.1, -0.118], [0.17, 0.33, -0.1]),
    box('foam', 'foam', [-0.174, 0.006, -0.124], [0.174, 0.07, 0.124]),
    box('handle', 'case', [-0.06, 0.07, 0.13], [0.06, 0.085, 0.145]),
    box('latch-a', 'metal', [-0.14, 0.06, 0.13], [-0.11, 0.085, 0.136]),
    box('latch-b', 'metal', [0.11, 0.06, 0.13], [0.14, 0.085, 0.136]),
    // Hammer: shaft and head.
    rod('hammer-shaft', 'handle', 0.008, -0.15, 0.0, 0.074) + { origin: [-0.15, 0.074, -0.08] },
    box('hammer-head', 'metal', [0.0, 0.066, -0.1], [0.015, 0.084, -0.06]),
    // Screwdrivers.
    turned('driver-a', 'grip', 'x', [[0, 0], [0, 0.01], [0.07, 0.01], [0.07, 0]], [-0.16, 0.074, -0.03]),
    rod('driver-a-shaft', 'metal', 0.0025, -0.09, 0.0, 0.074) + { origin: [-0.09, 0.074, -0.03] },
    turned('driver-b', 'grip', 'x', [[0, 0], [0, 0.01], [0.07, 0.01], [0.07, 0]], [-0.16, 0.074, 0.0]),
    rod('driver-b-shaft', 'metal', 0.0025, -0.09, -0.02, 0.074) + { origin: [-0.09, 0.074, 0.0] },
    // Needle file and punch.
    box('file', 'metal', [-0.16, 0.07, 0.03], [0.0, 0.076, 0.038]),
    rod('punch', 'metal', 0.004, -0.16, -0.04, 0.074) + { origin: [-0.16, 0.074, 0.065] },
    // Wrench.
    box('wrench', 'metal', [0.03, 0.07, 0.07], [0.16, 0.076, 0.082]),
    turned('wrench-jaw', 'metal', 'y', [[0, 0], [0, 0.014], [0.006, 0.014], [0.006, 0]], [0.16, 0.07, 0.076]),
    // Small hacksaw.
    box('saw-blade', 'metal', [0.03, 0.07, 0.025], [0.16, 0.074, 0.032]),
    box('saw-frame', 'saw', [0.03, 0.07, 0.045], [0.16, 0.078, 0.052]),
    box('saw-toe', 'saw', [0.155, 0.07, 0.025], [0.162, 0.078, 0.052]),
    box('saw-heel', 'saw', [0.028, 0.07, 0.025], [0.035, 0.078, 0.052]),
    // Rotary tool lying in its cut-out.
    turned('rotary', 'tool', 'x', [[0, 0], [0, 0.016], [0.1, 0.016], [0.115, 0.009], [0.115, 0]], [0.03, 0.078, -0.06]),
    rod('rotary-bit', 'metal', 0.002, 0.145, 0.165, 0.078) + { origin: [0.145, 0.078, -0.06] },
  ], {
    case: 'alu-bare', foam: 'polymer-black', metal: 'steel-grey', handle: 'wood-walnut', grip: 'plastic-red',
    saw: 'plastic-blue', tool: 'plastic-charcoal',
  }) + { voxelGrain: 0.004 },
]
