local h = import '../compound.libsonnet';
local box = h.box;
local turned = h.turned;
local disc = h.disc;
local rod = h.rod;
// A flat outline given as [x, z] points, laid on y from y0 to y1.
local flat(id, slot, outline, y0, y1) = h.prism(id, slot, 'y', [[p[1], p[0]] for p in outline], y0, y1);
// A flat outline given as [x, y] points, set on z from z0 to z1.
local side(id, slot, outline, z0, z1) = h.prism(id, slot, 'z', outline, z0, z1);
// A cube of side `s` centred on a point, for engraved dots and studs.
local dot(id, slot, p, s) = box(id, slot, [p[0] - s / 2, p[1] - s / 2, p[2] - s / 2], [p[0] + s / 2, p[1] + s / 2, p[2] + s / 2]);
// Dots along a circle of latitude on a sphere of radius r at c, from longitude a0 to a1 (degrees, 0 on +z).
local etchRing(prefix, slot, c, r, lat, a0, a1, n, s=0.004) = [
  local a = std.pi * (a0 + (a1 - a0) * i / (n - 1)) / 180;
  local l = std.pi * lat / 180;
  dot('%s-%d' % [prefix, i], slot, [c[0] + r * std.cos(l) * std.sin(a), c[1] + r * std.sin(l), c[2] + r * std.cos(l) * std.cos(a)], s)
  for i in std.range(0, n - 1)
];
// Dots along a meridian at longitude `a` (degrees, 0 on +z) from latitude l0 to l1.
local etchArc(prefix, slot, c, r, a, l0, l1, n, s=0.004) = [
  local l = std.pi * (l0 + (l1 - l0) * i / (n - 1)) / 180;
  local b = std.pi * a / 180;
  dot('%s-%d' % [prefix, i], slot, [c[0] + r * std.cos(l) * std.sin(b), c[1] + r * std.sin(l), c[2] + r * std.cos(l) * std.cos(b)], s)
  for i in std.range(0, n - 1)
];
// A flat arc in the x-y plane, `t` thick on z about `z`, from angle a0 to a1 (degrees, 0 on +x) between r0 and r1.
local arc(prefix, slot, cx, cy, r0, r1, a0, a1, steps, t, z=0) = [
  local a = std.pi * (a0 + (a1 - a0) * i / steps) / 180;
  local b = std.pi * (a0 + (a1 - a0) * (i + 1) / steps) / 180;
  side('%s-%d' % [prefix, i], slot, [
    [cx + r0 * std.cos(a), cy + r0 * std.sin(a)],
    [cx + r1 * std.cos(a), cy + r1 * std.sin(a)],
    [cx + r1 * std.cos(b), cy + r1 * std.sin(b)],
    [cx + r0 * std.cos(b), cy + r0 * std.sin(b)],
  ], z - t / 2, z + t / 2)
  for i in std.range(0, steps - 1)
];
// A turned urn standing on y: `body` lists [y, r] stations from the foot up, closed on the axis at both ends.
local urnBody(id, slot, body) = turned(id, slot, 'y', [[body[0][0], 0]] + body + [[body[std.length(body) - 1][0], 0]]);
// The bellows board outline, nozzle end at +x.
local bellowsBoard = [[-0.17, 0], [-0.15, -0.09], [-0.08, -0.12], [0.02, -0.1], [0.12, -0.05], [0.16, -0.02], [0.16, 0.02], [0.12, 0.05], [0.02, 0.1], [-0.08, 0.12], [-0.15, 0.09]];
local scaledOutline(outline, k) = [[p[0] * k, p[1] * k] for p in outline];
[
  // A toy air launcher shaped like a stubby break-open grenade gun, 58 cm long: a fat blue barrel with an orange
  // muzzle, a yellow stock and pistol grip, and a pump chamber under the barrel.
  h.compound('air_launcher', 0.6, [
    side('stock', 'stock', [[-0.24, -0.075], [-0.21, -0.078], [0.0, -0.01], [0.02, 0.0], [0.02, 0.035], [-0.2, 0.035], [-0.24, 0.025]], -0.019, 0.019),
    box('butt-pad', 'trim', [-0.25, -0.076, -0.02], [-0.24, 0.026, 0.02]),
    box('receiver', 'body', [0.0, -0.01, -0.024], [0.08, 0.06, 0.024]),
    side('grip', 'stock', [[0.015, -0.01], [0.05, -0.01], [0.035, -0.11], [0.0, -0.11]], -0.015, 0.015),
    side('guard', 'trim', [[0.05, -0.04], [0.085, -0.03], [0.085, -0.026], [0.05, -0.036]], -0.004, 0.004),
    box('trigger', 'trim', [0.056, -0.034, -0.003], [0.062, -0.012, 0.003]),
    rod('barrel', 'body', 0.031, 0.08, 0.33, 0.03),
    rod('muzzle', 'muzzle', 0.034, 0.33, 0.35, 0.03),
    rod('pump', 'trim', 0.014, 0.1, 0.28, -0.012),
    rod('pump-handle', 'stock', 0.019, 0.17, 0.26, -0.012),
    box('hinge', 'metal', [0.075, -0.004, -0.026], [0.09, 0.012, 0.026]),
    box('sight-front', 'trim', [0.31, 0.06, -0.003], [0.32, 0.072, 0.003]),
    box('sight-rear', 'trim', [0.08, 0.06, -0.008], [0.09, 0.074, 0.008]),
  ], { stock: 'plastic-yellow', body: 'plastic-blue', muzzle: 'plastic-orange', trim: 'plastic-black', metal: 'steel' }) + {
    handling: h.gripOn('air_launcher', 'grip'),
    voxelGrain: 0.004,
  },

  // A hand-held air horn, 22 cm tall: a 66 mm can of compressed gas with a red plastic horn screwed on top and a
  // push button on the cap; the horn's bell faces +z.
  h.compound('airhorn', 0.25, [
    turned('can', 'can', 'y', [[0, 0], [0, 0.031], [0.004, 0.033], [0.125, 0.033], [0.138, 0.022], [0.142, 0.012], [0.142, 0]]),
    disc('band', 'label', 0.0335, 0.03, 0.1),
    disc('collar', 'horn', 0.022, 0.142, 0.16),
    box('button', 'button', [-0.012, 0.16, -0.014], [0.012, 0.172, 0.01]),
    turned('throat', 'horn', 'z', [[0, 0], [0, 0.012], [0.03, 0.01], [0.03, 0]], [0, 0.178, -0.03]),
    turned('bell', 'horn', 'z', [[0, 0], [0, 0.011], [0.03, 0.016], [0.05, 0.028], [0.058, 0.036], [0.058, 0]], [0, 0.178, 0]),
    turned('mouth', 'mouth', 'z', [[0, 0], [0, 0.03], [0.001, 0.03], [0.001, 0]], [0, 0.178, 0.058]),
    box('stem', 'horn', [-0.008, 0.16, -0.03], [0.008, 0.178, -0.014]),
  ], { can: 'alu-bare', label: 'paint-white', horn: 'plastic-red', button: 'plastic-black', mouth: 'plastic-charcoal' }) + h.inHand('airhorn', 'can') + {
    voxelGrain: 0.002,
  },

  // A wind-up twin-bell alarm clock, 16 cm tall and 11 cm across the case, face on +z: a red case on two splayed
  // feet, a cream dial behind glass, steel bells on top with the hammer between them and two keys at the back.
  h.compound('alarmclock', 0.5, [
    turned('case', 'case', 'z', [[0, 0], [0, 0.05], [0.004, 0.055], [0.04, 0.055], [0.044, 0.052], [0.044, 0]], [0, 0.07, -0.022]),
    turned('bezel', 'bell', 'z', [[0, 0.044], [0, 0.054], [0.006, 0.054], [0.006, 0.044], [0, 0.044]], [0, 0.07, 0.022]),
    disc('dial', 'dial', 0.046, 0, 0.001) + { axis: 'z', origin: [0, 0.07, 0.022] },
    turned('glass', 'glass', 'z', [[0, 0], [0, 0.045], [0.002, 0.045], [0.002, 0]], [0, 0.07, 0.024]),
    box('hand-hour', 'hands', [-0.0015, 0.07, 0.0232], [0.0015, 0.098, 0.0242]),
    box('hand-minute', 'hands', [0.0, 0.0685, 0.0242], [0.038, 0.0715, 0.0252]),
    disc('hub', 'hands', 0.004, 0, 0.003) + { axis: 'z', origin: [0, 0.07, 0.023] },
  ] + [
    local a = std.pi * i / 6;
    dot('mark-%d' % i, 'hands', [0.04 * std.sin(a), 0.07 + 0.04 * std.cos(a), 0.0232], 0.004)
    for i in std.range(0, 11)
  ] + [
    h.dome('bell-l', 'bell', 0.026, 0.022, 0.002, 'y', [-0.035, 0.122, -0.002]),
    h.dome('bell-r', 'bell', 0.026, 0.022, 0.002, 'y', [0.035, 0.122, -0.002]),
    box('bell-post-l', 'bell', [-0.037, 0.112, -0.004], [-0.033, 0.124, 0.0]),
    box('bell-post-r', 'bell', [0.033, 0.112, -0.004], [0.037, 0.124, 0.0]),
    box('hammer-arm', 'bell', [-0.002, 0.12, -0.004], [0.002, 0.146, 0.0]),
    disc('hammer', 'bell', 0.005, 0.142, 0.15, 0, -0.002),
    disc('knob', 'bell', 0.006, 0.124, 0.132, 0, -0.002),
    box('leg-l', 'bell', [-0.04, 0.0, -0.008], [-0.032, 0.03, 0.004]),
    box('leg-r', 'bell', [0.032, 0.0, -0.008], [0.04, 0.03, 0.004]),
    disc('foot-l', 'bell', 0.008, 0, 0.004, -0.038, -0.002),
    disc('foot-r', 'bell', 0.008, 0, 0.004, 0.038, -0.002),
    turned('key-a', 'bell', 'z', [[0, 0], [0, 0.003], [0.01, 0.003], [0.01, 0]], [-0.018, 0.07, -0.032]),
    box('key-a-wing', 'bell', [-0.03, 0.064, -0.038], [-0.006, 0.076, -0.034]),
    turned('key-b', 'bell', 'z', [[0, 0], [0, 0.003], [0.01, 0.003], [0.01, 0]], [0.018, 0.07, -0.032]),
    box('key-b-wing', 'bell', [0.006, 0.064, -0.038], [0.03, 0.076, -0.034]),
  ], { case: 'paint-red', bell: 'steel-stainless', dial: 'paint-cream', glass: 'glass-clear', hands: 'plastic-black' }) + h.inHand('alarmclock', 'case') + {
    voxelGrain: 0.002,
  },

  // A fired clay urn with a lid, 32 cm tall and 22 cm across the belly, with an incised band round the shoulder.
  h.compound('clay_urn', 2.1, [
    urnBody('body', 'clay', [[0, 0.06], [0.012, 0.062], [0.02, 0.07], [0.08, 0.1], [0.14, 0.11], [0.2, 0.1], [0.25, 0.075], [0.27, 0.065], [0.275, 0.072], [0.285, 0.072]]),
    turned('band', 'band', 'y', [[0.18, 0.1035], [0.18, 0.1068], [0.192, 0.1035], [0.192, 0.1005], [0.18, 0.1035]]),
    turned('lid', 'clay', 'y', [[0.285, 0], [0.285, 0.076], [0.292, 0.074], [0.3, 0.05], [0.304, 0.02], [0.304, 0]]),
    urnBody('finial', 'clay', [[0.304, 0.012], [0.312, 0.008], [0.322, 0.013], [0.33, 0.006]]),
  ], { clay: 'clay-terracotta', band: 'paint-oxblood' }) + h.inHand('clay_urn', 'body') + { voxelGrain: 0.004 },

  // A cut-crystal urn, 30 cm tall: a footed egg-shaped vessel with a domed lid and a faceted knob, frosted
  // bands where the floral pattern is cut.
  h.compound('crystal_urn', 2.4, [
    urnBody('foot', 'crystal', [[0, 0.07], [0.012, 0.07], [0.02, 0.03], [0.045, 0.024]]),
    urnBody('body', 'crystal', [[0.045, 0.03], [0.07, 0.075], [0.12, 0.1], [0.17, 0.098], [0.22, 0.075], [0.24, 0.062], [0.25, 0.066]]),
    turned('cut-a', 'cut', 'y', [[0.105, 0.0975], [0.105, 0.1005], [0.135, 0.1015], [0.135, 0.0985], [0.105, 0.0975]]),
    turned('cut-b', 'cut', 'y', [[0.07, 0.0745], [0.07, 0.0775], [0.08, 0.0835], [0.08, 0.0805], [0.07, 0.0745]]),
    turned('lid', 'crystal', 'y', [[0.25, 0], [0.25, 0.07], [0.258, 0.068], [0.272, 0.045], [0.278, 0.02], [0.278, 0]]),
    urnBody('knob', 'cut', [[0.278, 0.01], [0.285, 0.018], [0.298, 0.014], [0.302, 0.006]]),
  ] + [
    local a = std.pi * i / 4;
    dot('flower-%d' % i, 'cut', [0.1 * std.sin(a), 0.155, 0.1 * std.cos(a)], 0.012)
    for i in std.range(0, 7)
  ], { crystal: 'glass-clear', cut: 'plastic-frosted' }) + h.inHand('crystal_urn', 'body') + { voxelGrain: 0.004 },

  // A steel cow bell 14 cm long lying on its side, mouth on +z: a four-sided body tapering smoothly from the
  // 11 by 7.6 cm mouth to the crown, a rolled rim, the clapper resting in the mouth and a rubber strap looped
  // from the crown.
  h.compound('cow_bell', 0.53, [
    local t = i / 69;
    box(if i == 35 then 'body' else 'body-%d' % i, 'bell',
        [-(0.035 + 0.02 * t), 0.038 - (0.026 + 0.009 * t), 0.002 * i],
        [0.035 + 0.02 * t, 0.038 + (0.026 + 0.009 * t), 0.002 * (i + 1)])
    for i in std.range(0, 65)
  ] + [
    box('rim', 'rim', [-0.058, 0.0, 0.132], [0.058, 0.076, 0.14]),
    box('mouth', 'mouth', [-0.051, 0.007, 0.14], [0.051, 0.069, 0.1405]),
    box('crown', 'bell', [-0.03, 0.016, -0.004], [0.03, 0.06, 0.0]),
    h.ball('clapper', 'rim', 0.012, 0, 0.02, 0.136),
    box('strap-tab', 'strap', [-0.012, 0.0, -0.01], [0.012, 0.03, -0.004]),
  ] + [
    local a = std.pi * (180 + 180 * i / 8) / 180;
    local b = std.pi * (180 + 180 * (i + 1) / 8) / 180;
    flat('strap-%d' % i, 'strap', [
      [0.018 * std.cos(a), -0.012 + 0.018 * std.sin(a)],
      [0.026 * std.cos(a), -0.012 + 0.026 * std.sin(a)],
      [0.026 * std.cos(b), -0.012 + 0.026 * std.sin(b)],
      [0.018 * std.cos(b), -0.012 + 0.018 * std.sin(b)],
    ], 0.0, 0.006)
    for i in std.range(0, 7)
  ], {
    bell: 'steel-grey', rim: 'steel-bright', mouth: 'coal-black', strap: 'rubber-black',
  }) + h.inHand('cow_bell', 'body') + { voxelGrain: 0.002 },

  // A dressage whip, 110 cm long: a rubber-capped handle with a braided grip, a slim tapering black shaft and a
  // short nylon lash at the tip (+x).
  h.compound('dressage_whip', 0.05, [
    turned('cap', 'cap', 'x', [[0, 0], [0, 0.011], [0.012, 0.012], [0.02, 0.009], [0.02, 0]], [0, 0, 0]),
    rod('grip', 'grip', 0.0085, 0.02, 0.17, 0),
    rod('collar', 'cap', 0.0095, 0.17, 0.18, 0),
    turned('shaft', 'shaft', 'x', [[0, 0], [0, 0.006], [0.4, 0.004], [0.89, 0.0015], [0.89, 0]], [0.18, 0, 0]),
    rod('wrap', 'grip', 0.0022, 1.065, 1.072, 0),
    box('lash', 'lash', [1.07, -0.001, -0.004], [1.1, 0.001, 0.004]),
  ] + [
    rod('braid-%d' % i, 'cap', 0.009, 0.03 + 0.024 * i, 0.034 + 0.024 * i, 0)
    for i in std.range(0, 5)
  ], { cap: 'rubber-black', grip: 'leather-black', shaft: 'lacquer-black', lash: 'nylon-black' }) + {
    handling: h.gripOn('dressage_whip', 'grip'),
    voxelGrain: 0.002,
  },

  // A folding entrenching tool folded for carry, 23 cm long: an olive spade blade folded flat against a steel shaft,
  // the locking collar at the hinge (+x) and a rubber grip on the knob end.
  h.compound('e_tool', 0.69, [
    rod('shaft', 'shaft', 0.013, -0.01, 0.175, 0.013),
    rod('grip', 'grip', 0.017, -0.03, 0.05, 0.013),
    turned('knob', 'grip', 'x', [[0, 0], [0, 0.02], [0.008, 0.02], [0.012, 0]], [-0.042, 0.013, 0]),
    rod('collar', 'collar', 0.018, 0.15, 0.175, 0.013),
    flat('blade', 'blade', [[0.185, -0.072], [0.185, 0.072], [0.08, 0.075], [0.02, 0.045], [-0.01, 0.0], [0.02, -0.045], [0.08, -0.075]], 0.028, 0.031),
    flat('rib', 'blade', [[0.185, -0.008], [0.185, 0.008], [0.04, 0.006], [0.04, -0.006]], 0.031, 0.034),
    flat('edge-a', 'edge', [[-0.01, 0.0], [0.02, 0.045], [0.026, 0.04], [0.0, 0.0]], 0.0305, 0.0315),
    flat('edge-b', 'edge', [[-0.01, 0.0], [0.0, 0.0], [0.026, -0.04], [0.02, -0.045]], 0.0305, 0.0315),
    box('hinge', 'collar', [0.175, 0.0, -0.012], [0.188, 0.034, 0.012]),
  ], { shaft: 'steel-parkerized', grip: 'rubber-black', collar: 'steel-grey', blade: 'paint-olive', edge: 'steel-bright' }) + {
    handling: h.gripOn('e_tool', 'grip'),
    voxelGrain: 0.004,
  },

  // A human skull, 19 cm front to back, face on +z, its bone covered in dark etched rings and lines.
  h.compound('etched_skull', 0.8, [
    h.ball('cranium', 'bone', 0.072, 0, 0.1, -0.02, 1.0),
    h.ball('brow', 'bone', 0.06, 0, 0.088, 0.016, 0.85),
    side('face', 'bone', [[-0.034, 0.03], [0.034, 0.03], [0.047, 0.085], [-0.047, 0.085]], 0.02, 0.07),
    box('cheek-l', 'bone', [-0.062, 0.045, 0.0], [-0.04, 0.07, 0.05]),
    box('cheek-r', 'bone', [0.04, 0.045, 0.0], [0.062, 0.07, 0.05]),
    side('jaw', 'bone', [[-0.024, 0.0], [0.024, 0.0], [0.04, 0.03], [-0.04, 0.03]], 0.015, 0.065),
    box('jaw-l', 'bone', [-0.048, 0.0, -0.02], [-0.036, 0.05, 0.03]),
    box('jaw-r', 'bone', [0.036, 0.0, -0.02], [0.048, 0.05, 0.03]),
    box('eye-l', 'hollow', [-0.038, 0.058, 0.07], [-0.008, 0.082, 0.0705]),
    box('eye-r', 'hollow', [0.008, 0.058, 0.07], [0.038, 0.082, 0.0705]),
    h.prism('nose', 'hollow', 'z', [[-0.008, 0.038], [0.008, 0.038], [0.0, 0.056]], 0.07, 0.0705),
    box('teeth', 'teeth', [-0.028, 0.02, 0.07], [0.028, 0.038, 0.0715]),
    box('gap', 'hollow', [-0.028, 0.028, 0.0715], [0.028, 0.03, 0.072]),
  ] + etchRing('ring-a', 'etch', [0, 0.1, -0.02], 0.072, 30, -150, 150, 26)
  + etchRing('ring-b', 'etch', [0, 0.1, -0.02], 0.072, 58, 0, 330, 16)
  + etchArc('line-a', 'etch', [0, 0.1, -0.02], 0.072, 0, 32, 90, 10)
  + etchArc('line-b', 'etch', [0, 0.1, -0.02], 0.072, 90, 0, 88, 12)
  + etchArc('line-c', 'etch', [0, 0.1, -0.02], 0.072, -90, 0, 88, 12)
  + etchArc('line-d', 'etch', [0, 0.1, -0.02], 0.072, 180, 0, 88, 12), {
    bone: 'bone', hollow: 'coal-black', teeth: 'ceramic-white', etch: 'paint-charcoal',
  }) + h.inHand('etched_skull', 'cranium') + { voxelGrain: 0.002 },

  // A rolled fur sleeping mat, 50 cm long and 13 cm across the roll, tied with two hide thongs; the ends show the
  // spiral of fur and skin side.
  h.compound('fur_rollmat', 1.1, [
    rod('roll', 'fur', 0.065, -0.25, 0.25, 0.065),
    rod('tie-a', 'tie', 0.067, -0.15, -0.135, 0.065),
    rod('tie-b', 'tie', 0.067, 0.135, 0.15, 0.065),
    box('knot', 'tie', [0.132, 0.12, -0.012], [0.153, 0.138, 0.012]),
    box('tail', 'tie', [0.14, 0.11, 0.012], [0.146, 0.122, 0.06]),
  ] + std.flattenArrays([
    [
      h.tube('hide-%s-%d' % [e[0], i], 'hide', 0.012 + 0.018 * i, 0.016 + 0.018 * i, e[1], e[1] + 0.002, 0.065)
      for i in std.range(0, 2)
    ]
    for e in [['a', -0.252], ['b', 0.25]]
  ]), { fur: 'fur-brown', tie: 'skin-rawhide', hide: 'leather-tan' }) + { voxelGrain: 0.004 },

  // A pencil glass cutter, 16 cm long: an aluminium oil-reservoir handle with a rubber band, a brass neck and head
  // with breaking notches, and a steel wheel at the tip (+x).
  h.compound('glass_cutter', 0.041, [
    turned('cap', 'handle', 'x', [[0, 0], [0, 0.006], [0.004, 0.0075], [0.008, 0.0075], [0.008, 0]], [0, 0, 0]),
    rod('handle', 'handle', 0.0075, 0.008, 0.11, 0),
    rod('band', 'band', 0.008, 0.04, 0.07, 0),
    turned('neck', 'head', 'x', [[0, 0], [0, 0.007], [0.008, 0.0045], [0.028, 0.004], [0.028, 0]], [0.11, 0, 0]),
    box('head', 'head', [0.136, -0.007, -0.0025], [0.154, 0.006, 0.0025]),
    box('notch-a', 'mark', [0.14, -0.0072, -0.0026], [0.143, -0.003, 0.0026]),
    box('notch-b', 'mark', [0.146, -0.0072, -0.0026], [0.149, -0.003, 0.0026]),
    turned('wheel', 'wheel', 'z', [[0, 0], [0, 0.0035], [0.002, 0.0035], [0.002, 0]], [0.157, -0.004, -0.001]),
  ], { handle: 'alu-bare', band: 'rubber-black', head: 'brass', mark: 'coal-black', wheel: 'steel-bright' }) + {
    handling: h.gripOn('glass_cutter', 'handle'),
    voxelGrain: 0.002,
  },

  // A mini hand pump for balls and tyres, 24 cm with the handle: an aluminium barrel, a T handle at -x, a black
  // head with a fold-out inflation needle at +x.
  h.compound('hand_pump', 0.061, [
    rod('barrel', 'barrel', 0.012, 0.0, 0.18, 0.0),
    rod('cap-tail', 'plastic', 0.0135, -0.008, 0.008, 0.0),
    rod('shaft', 'shaft', 0.004, -0.03, -0.008, 0.0),
    box('handle', 'plastic', [-0.048, -0.008, -0.04], [-0.03, 0.008, 0.04]),
    rod('head', 'plastic', 0.0135, 0.172, 0.21, 0.0),
    turned('nozzle', 'plastic', 'x', [[0, 0], [0, 0.009], [0.012, 0.005], [0.012, 0]], [0.21, 0, 0]),
    rod('needle', 'needle', 0.0015, 0.222, 0.242, 0.0),
    box('clip', 'plastic', [0.06, 0.011, -0.004], [0.12, 0.015, 0.004]),
  ], { barrel: 'alu-bare', plastic: 'plastic-black', shaft: 'steel-bright', needle: 'steel-stainless' }) + {
    handling: h.gripOn('hand_pump', 'barrel'),
    voxelGrain: 0.002,
  },

  // A large electric fan heater, 30 cm tall and 26 cm wide: a cream steel cabinet on two feet, a dark slotted
  // grille on the front (+z), two control knobs and a carry handle on top.
  h.compound('large_space_heater', 4.2, [
    box('cabinet', 'body', [-0.13, 0.02, -0.08], [0.13, 0.3, 0.08]),
    box('recess', 'recess', [-0.11, 0.05, 0.08], [0.11, 0.24, 0.081]),
    box('foot-a', 'feet', [-0.15, 0.0, -0.09], [-0.09, 0.02, 0.09]),
    box('foot-b', 'feet', [0.09, 0.0, -0.09], [0.15, 0.02, 0.09]),
    box('panel', 'feet', [-0.11, 0.255, 0.08], [0.11, 0.29, 0.082]),
    disc('knob-a', 'knob', 0.012, 0, 0.008) + { axis: 'z', origin: [-0.06, 0.272, 0.082] },
    disc('knob-b', 'knob', 0.012, 0, 0.008) + { axis: 'z', origin: [-0.02, 0.272, 0.082] },
    box('lamp', 'lamp', [0.06, 0.266, 0.082], [0.08, 0.278, 0.084]),
    box('handle-l', 'feet', [-0.07, 0.3, -0.012], [-0.06, 0.33, 0.012]),
    box('handle-r', 'feet', [0.06, 0.3, -0.012], [0.07, 0.33, 0.012]),
    box('handle-top', 'feet', [-0.07, 0.33, -0.012], [0.07, 0.342, 0.012]),
  ] + [
    box('bar-%d' % i, 'grille', [-0.11, 0.056 + 0.0185 * i, 0.081], [0.11, 0.062 + 0.0185 * i, 0.085])
    for i in std.range(0, 9)
  ] + [
    box('vent-%d' % i, 'recess', [-0.13 + 0.0, 0.08 + 0.03 * i, -0.0805], [0.13, 0.086 + 0.03 * i, -0.08])
    for i in std.range(0, 4)
  ], { body: 'paint-cream', recess: 'coal-black', feet: 'plastic-charcoal', knob: 'plastic-black', lamp: 'plastic-orange', grille: 'steel-bright' }) + {
    voxelGrain: 0.004,
  },

  // Hand bellows, 52 cm long: two pear-shaped oak boards with handles at -x, pleated leather between them, and a
  // brass nozzle at +x.
  h.compound('leather_bellow', 1.5, [
    flat('board-low', 'wood', bellowsBoard, 0.0, 0.012),
    flat('board-high', 'wood', bellowsBoard, 0.068, 0.08),
    flat('leather', 'leather', scaledOutline(bellowsBoard, 0.93), 0.012, 0.068),
    flat('pleat-a', 'pleat', scaledOutline(bellowsBoard, 0.97), 0.026, 0.03),
    flat('pleat-b', 'pleat', scaledOutline(bellowsBoard, 0.97), 0.05, 0.054),
    box('handle-low', 'wood', [-0.27, 0.0, -0.022], [-0.16, 0.012, 0.022]),
    box('handle-high', 'wood', [-0.27, 0.068, -0.022], [-0.16, 0.08, 0.022]),
    box('grip-low', 'leather', [-0.27, -0.004, -0.018], [-0.25, 0.012, 0.018]),
    box('grip-high', 'leather', [-0.27, 0.068, -0.018], [-0.25, 0.084, 0.018]),
    turned('nozzle', 'nozzle', 'x', [[0, 0], [0, 0.02], [0.03, 0.014], [0.1, 0.006], [0.1, 0]], [0.155, 0.04, 0]),
  ], { wood: 'wood-oak', leather: 'leather-brown', pleat: 'leather-chestnut', nozzle: 'brass' }) + {
    handling: h.gripOn('leather_bellow', 'handle-high'),
    voxelGrain: 0.004,
  },

  // A fire-drill hearth stick, 32 cm long and 5 cm thick: a barked branch with three notches cut into its side, the
  // two used ones charred black.
  h.compound('notched_stick', 0.24, [
    turned('stick', 'bark', 'x', [[0, 0], [0, 0.022], [0.16, 0.024], [0.32, 0.021], [0.32, 0]], [0, 0.024, 0]),
    turned('end-a', 'wood', 'x', [[0, 0], [0, 0.0205], [0.001, 0.0205], [0.001, 0]], [-0.001, 0.024, 0]),
    turned('end-b', 'wood', 'x', [[0, 0], [0, 0.0195], [0.001, 0.0195], [0.001, 0]], [0.32, 0.024, 0]),
    flat('face', 'wood', [[0.02, -0.014], [0.3, -0.014], [0.3, 0.014], [0.02, 0.014]], 0.0465, 0.049),
  ] + std.flattenArrays([
    [
      flat('notch-%d' % i, if i < 2 then 'char' else 'wood', [[0.07 + 0.08 * i, 0.016], [0.086 + 0.08 * i, 0.016], [0.078 + 0.08 * i, -0.004]], 0.049, 0.0495),
      flat('pit-%d' % i, if i < 2 then 'char' else 'wood', [[0.068 + 0.08 * i, -0.004], [0.088 + 0.08 * i, -0.004], [0.088 + 0.08 * i, -0.014], [0.068 + 0.08 * i, -0.014]], 0.049, 0.0495),
    ]
    for i in std.range(0, 2)
  ]), { bark: 'bark', wood: 'wood-pine', char: 'coal-black' }) + { voxelGrain: 0.004 },
]
