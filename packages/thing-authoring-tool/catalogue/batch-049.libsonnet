local h = import '../compound.libsonnet';
local box = h.box;
local turned = h.turned;
local disc = h.disc;
// A flat ring standing on y at height y0, inner radius r0, outer r1, t thick.
local ring(id, slot, r0, r1, y0, t, x=0, z=0) = turned(id, slot, 'y', [[0, r0], [0, r1], [t, r1], [t, r0], [0, r0]], [x, y0, z]);
// A knob turned along z, its back face at z0.
local dial(id, slot, x, y, z0, radius, depth) = turned(id, slot, 'z', [[0, 0], [0, radius], [depth, radius], [depth, 0]], [x, y, z0]);
// A mains cord leaving the back (−z) at (x, y), with a plug block at its end.
local cord(prefix, x, y, z0, length) = [
  turned(prefix + '-cord', 'cord', 'z', [[0, 0], [0, 0.003], [length, 0.003], [length, 0]], [x, y, z0 - length]),
  box(prefix + '-plug', 'cord', [x - 0.014, y - 0.01, z0 - length - 0.03], [x + 0.014, y + 0.01, z0 - length]),
];
// A wide-mouth glass jar of something fermenting, 100 mm across and 132 mm tall, with a cloth tied over
// its mouth in place of a lid; `fill` lists the pieces inside.
local fermentJar(id, mass, fill, finishes) = h.compound(id, mass, [
  turned('jar', 'glass', 'y', [[0, 0], [0, 0.046], [0.006, 0.05], [0.105, 0.05], [0.115, 0.04], [0.122, 0.04], [0.122, 0.036], [0.112, 0.036], [0.104, 0.046], [0.008, 0.046], [0.004, 0.042], [0.004, 0], [0, 0]]),
  disc('brine', 'brine', 0.046, 0.004, 0.1),
  turned('cloth', 'cloth', 'y', [[0, 0], [0, 0.046], [0.012, 0.046], [0.014, 0.03], [0.016, 0]], [0, 0.12, 0]),
  ring('skirt', 'cloth', 0.04, 0.047, 0.1, 0.022),
  ring('tie', 'tie', 0.047, 0.049, 0.112, 0.006),
] + fill, { glass: 'glass-clear', cloth: 'cloth-cotton', tie: 'cord-cotton' } + finishes)
                                            + h.inHand(id, 'jar') + { voxelGrain: 0.002 };
[
  // A single-burner electric hotplate, 280 mm wide, 210 mm deep and 75 mm tall: a bare aluminium case
  // on rubber feet, a white top with a chrome drip bowl under a spiral heating coil, a temperature knob
  // and a red pilot lamp on the front, and a short mains cord out the back.
  h.compound('hotplate', 1.4, [
    box('foot-a', 'foot', [-0.13, 0, -0.095], [-0.11, 0.008, -0.075]),
    box('foot-b', 'foot', [0.11, 0, -0.095], [0.13, 0.008, -0.075]),
    box('foot-c', 'foot', [-0.13, 0, 0.075], [-0.11, 0.008, 0.095]),
    box('foot-d', 'foot', [0.11, 0, 0.075], [0.13, 0.008, 0.095]),
    box('case', 'case', [-0.14, 0.008, -0.105], [0.14, 0.066, 0.105]),
    box('top', 'top', [-0.14, 0.066, -0.105], [0.14, 0.07, 0.105]),
    disc('bowl', 'bowl', 0.088, 0.07, 0.073, -0.03, -0.005),
    disc('hub', 'coil', 0.012, 0.073, 0.079, -0.03, -0.005),
  ] + [
    ring('coil-%d' % i, 'coil', 0.022 + i * 0.016, 0.028 + i * 0.016, 0.073, 0.006, -0.03, -0.005)
    for i in std.range(0, 3)
  ] + [
    box('spoke', 'coil', [-0.031, 0.073, -0.005], [0.054, 0.079, 0.001]),
    box('terminal', 'block', [0.055, 0.07, -0.015], [0.075, 0.08, 0.009]),
    dial('knob', 'knob', 0.1, 0.035, 0.105, 0.018, 0.02),
    dial('pointer', 'pointer', 0.1, 0.045, 0.125, 0.003, 0.003),
    dial('lamp', 'lamp', 0.1, 0.06, 0.105, 0.005, 0.004),
  ] + cord('mains', 0.1, 0.03, -0.105, 0.06), {
    foot: 'rubber-black',
    case: 'alu-bare',
    top: 'enamel-white',
    bowl: 'steel-stainless',
    coil: 'iron-cast',
    block: 'ceramic-white',
    knob: 'plastic-black',
    pointer: 'paint-white',
    lamp: 'plastic-clear-red',
    cord: 'plastic-black',
  })
  + { voxelGrain: 0.004 },

  // An induction hotplate, 290 mm wide, 350 mm deep and 60 mm tall: a grey plastic case under a black glass
  // top marked with one cooking ring, a sloped control strip along the front with a green display and
  // touch buttons, and a mains cord out the back.
  h.compound('hotplate_induction', 2.5, [
    box('case', 'case', [-0.145, 0.004, -0.175], [0.145, 0.05, 0.175]),
    box('skid', 'foot', [-0.135, 0, -0.165], [0.135, 0.004, 0.165]),
    box('glass', 'glass', [-0.142, 0.05, -0.172], [0.142, 0.056, 0.11]),
    ring('zone', 'mark', 0.085, 0.09, 0.056, 0.001, 0, -0.03),
    ring('zone-in', 'mark', 0.05, 0.053, 0.056, 0.001, 0, -0.03),
    h.prism('panel', 'panel', 'x', [[0.05, 0.11], [0.03, 0.175], [0.05, 0.175], [0.056, 0.11]], -0.145, 0.145),
    box('display', 'display', [-0.03, 0.048, 0.13], [0.03, 0.052, 0.15]),
  ] + [
    box('button-%d' % i, 'button', [-0.12 + i * 0.05 + (if i >= 2 then 0.1 else 0), 0.048, 0.135], [-0.105 + i * 0.05 + (if i >= 2 then 0.1 else 0), 0.052, 0.15])
    for i in std.range(0, 3)
  ] + cord('mains', 0.1, 0.025, -0.175, 0.06), {
    case: 'plastic-grey',
    foot: 'rubber-black',
    glass: 'screen-black',
    mark: 'plastic-white',
    panel: 'plastic-black',
    display: 'lcd-green',
    button: 'plastic-white',
    cord: 'plastic-black',
  })
  + { voxelGrain: 0.004 },

  // A homemade vacuum sealer, 350 mm long, 150 mm deep and 120 mm tall: a pine board carrying a hinged
  // aluminium press bar over a heating strip, a small aquarium air pump wired to the board, a clear hose
  // running from the pump to a nozzle beside the bar, and the wiring held down with grey tape.
  h.compound('makeshift_sealer', 1.2, [
    box('board', 'board', [-0.175, 0, -0.075], [0.175, 0.018, 0.075]),
    box('anvil', 'bar', [-0.16, 0.018, 0.03], [0.06, 0.04, 0.06]),
    box('strip', 'strip', [-0.155, 0.04, 0.04], [0.055, 0.043, 0.05]),
    box('post', 'bar', [-0.175, 0.018, 0.03], [-0.16, 0.05, 0.06]),
    turned('pivot', 'grip', 'z', [[0, 0], [0, 0.006], [0.036, 0.006], [0.036, 0]], [-0.168, 0.05, 0.027]),
    box('arm', 'bar', [-0.175, 0.05, 0.032], [0.07, 0.06, 0.058]),
    box('pad', 'pad', [-0.155, 0.045, 0.036], [0.055, 0.05, 0.054]),
    turned('grip', 'grip', 'x', [[0, 0], [0, 0.012], [0.05, 0.012], [0.05, 0]], [0.02, 0.064, 0.045]),
    box('pump', 'pump', [0.06, 0.018, -0.07], [0.165, 0.075, -0.005]),
    box('pump-foot', 'foot', [0.065, 0.018, -0.065], [0.16, 0.022, -0.01]),
    turned('spigot', 'hose', 'z', [[0, 0], [0, 0.004], [0.012, 0.004], [0.012, 0]], [0.14, 0.05, -0.005]),
    turned('hose-a', 'hose', 'z', [[0, 0], [0, 0.005], [0.02, 0.005], [0.02, 0]], [0.14, 0.05, 0.007]),
    turned('hose-b', 'hose', 'x', [[0, 0], [0, 0.005], [0.075, 0.005], [0.075, 0]], [0.065, 0.05, 0.022]),
    turned('nozzle', 'nozzle', 'x', [[0, 0], [0, 0.003], [0.02, 0.003], [0.02, 0]], [0.045, 0.05, 0.022]),
    box('switch', 'switch', [-0.12, 0.018, -0.06], [-0.08, 0.04, -0.035]),
    box('wire-a', 'wire', [-0.08, 0.018, -0.05], [0.06, 0.022, -0.045]),
    box('wire-b', 'wire', [-0.105, 0.018, -0.035], [-0.1, 0.022, 0.03]),
    box('tape-a', 'tape', [0, 0.018, -0.06], [0.02, 0.024, -0.035]),
    box('tape-b', 'tape', [-0.115, 0.018, -0.01], [-0.09, 0.024, 0.01]),
  ] + cord('mains', -0.1, 0.01, -0.075, 0.05), {
    board: 'wood-pine',
    bar: 'alu-bare',
    strip: 'paint-charcoal',
    pad: 'silicone-black',
    grip: 'plastic-black',
    pump: 'plastic-blue',
    foot: 'rubber-black',
    hose: 'plastic-clear',
    nozzle: 'steel-stainless',
    switch: 'plastic-red',
    wire: 'plastic-red',
    tape: 'tape-grey',
    cord: 'plastic-black',
  })
  + { voxelGrain: 0.004 },

  // A camping mess kit, 150 mm across and 110 mm tall: an aluminium pot with a frying-pan lid seated
  // upside down on it, the pan's folding handle swung over the top and the pot's wire bail folded down
  // against its side, with a small cup nested under the lid.
  h.compound('mess_kit', 0.4, [
    turned('pot', 'pot', 'y', [[0, 0], [0, 0.066], [0.004, 0.07], [0.085, 0.07], [0.085, 0.067], [0.006, 0.067], [0.006, 0], [0, 0]]),
    turned('rim', 'rim', 'y', [[0, 0.07], [0, 0.072], [0.004, 0.072], [0.004, 0.07], [0, 0.07]], [0, 0.081, 0]),
    turned('pan', 'pot', 'y', [[0, 0], [0, 0.074], [0.022, 0.074], [0.024, 0.07], [0.024, 0], [0, 0]], [0, 0.085, 0]),
    disc('pan-base', 'base', 0.06, 0.109, 0.11),
    box('hinge-a', 'hinge', [0.07, 0.09, -0.012], [0.082, 0.104, -0.008]),
    box('hinge-b', 'hinge', [0.07, 0.09, 0.008], [0.082, 0.104, 0.012]),
    box('handle-a', 'handle', [-0.06, 0.11, -0.012], [0.082, 0.114, -0.008]),
    box('handle-b', 'handle', [-0.06, 0.11, 0.008], [0.082, 0.114, 0.012]),
    box('handle-end', 'handle', [-0.064, 0.11, -0.012], [-0.06, 0.114, 0.012]),
    box('grip', 'grip', [-0.055, 0.112, -0.01], [0.02, 0.118, 0.01]),
    box('ear-a', 'hinge', [-0.074, 0.06, -0.006], [-0.07, 0.072, 0.006]),
    box('ear-b', 'hinge', [0.07, 0.06, -0.006], [0.074, 0.072, 0.006]),
    turned('bail', 'handle', 'z', [[0, 0.069], [0, 0.072], [0.003, 0.072], [0.003, 0.069], [0, 0.069]], [0, 0.066, -0.0015]),
  ], { pot: 'alu-bare', rim: 'steel-grey', base: 'paint-charcoal', hinge: 'steel-grey', handle: 'steel-grey', grip: 'rubber-black' })
  + h.inHand('mess_kit', 'pot') + { voxelGrain: 0.002 },

  // A compact countertop microwave, 400 mm wide, 230 mm tall and 300 mm deep: a white steel case on
  // feet, a black door with a dark window and a bar handle, and a control panel on the right with a
  // green display, a dial and a pad of buttons.
  h.compound('microwave', 11, [
    box('foot-a', 'foot', [-0.18, 0, -0.13], [-0.16, 0.01, -0.11]),
    box('foot-b', 'foot', [0.16, 0, -0.13], [0.18, 0.01, -0.11]),
    box('foot-c', 'foot', [-0.18, 0, 0.11], [-0.16, 0.01, 0.13]),
    box('foot-d', 'foot', [0.16, 0, 0.11], [0.18, 0.01, 0.13]),
    box('case', 'case', [-0.2, 0.01, -0.15], [0.2, 0.23, 0.14]),
    box('door', 'door', [-0.198, 0.012, 0.14], [0.09, 0.228, 0.152]),
    box('window', 'window', [-0.17, 0.04, 0.152], [0.04, 0.2, 0.154]),
    box('handle', 'handle', [0.058, 0.05, 0.152], [0.074, 0.19, 0.17]),
    box('panel', 'panel', [0.09, 0.012, 0.14], [0.198, 0.228, 0.15]),
    box('display', 'display', [0.105, 0.19, 0.15], [0.183, 0.212, 0.152]),
    dial('dial', 'knob', 0.144, 0.05, 0.15, 0.022, 0.018),
  ] + [
    box('vent-%d' % i, 'vent', [-0.16, 0.23, -0.12 + i * 0.016], [0.0, 0.2315, -0.112 + i * 0.016])
    for i in std.range(0, 5)
  ] + [
    box('key-%d-%d' % [r, c], 'key', [0.106 + c * 0.026, 0.09 + r * 0.022, 0.15], [0.124 + c * 0.026, 0.104 + r * 0.022, 0.153])
    for r in std.range(0, 3)
    for c in std.range(0, 2)
  ] + cord('mains', 0.16, 0.06, -0.15, 0.02), {
    foot: 'rubber-black',
    case: 'paint-white',
    vent: 'plastic-grey',
    door: 'plastic-black',
    window: 'screen-black',
    handle: 'plastic-grey',
    panel: 'plastic-charcoal',
    display: 'lcd-green',
    knob: 'plastic-grey',
    key: 'plastic-white',
    cord: 'plastic-black',
  })
  + { voxelGrain: 0.006 },

  // A granite mortar 120 mm across and 70 mm tall with a deep round bowl, and a club-shaped stone
  // pestle 120 mm long resting across its rim.
  h.compound('mortar_pestle', 1.1, [
    turned('mortar', 'mortar', 'y', [[0, 0], [0, 0.05], [0.012, 0.06], [0.07, 0.06], [0.07, 0.047], [0.055, 0.044], [0.04, 0.036], [0.028, 0.02], [0.022, 0]]),
    turned('pestle', 'pestle', 'x', [[0, 0], [0, 0.017], [0.012, 0.02], [0.03, 0.017], [0.09, 0.011], [0.115, 0.013], [0.12, 0]], [-0.05, 0.08, 0.012]),
  ], { mortar: 'stone-grey', pestle: 'stone-whet' })
  + h.inHand('mortar_pestle', 'mortar') + { voxelGrain: 0.002 },

  // An electric multi-cooker, 250 mm wide, 245 mm tall and 245 mm deep: a stainless steel pot body on a
  // black base, a black locking lid with a steam valve and a float pin, two side handles and a sloped
  // control panel on the front with a display and a row of buttons; its cord socket on the back is empty.
  h.compound('multi_cooker', 5, [
    turned('base', 'plastic', 'y', [[0, 0], [0, 0.1], [0.02, 0.11], [0.02, 0]]),
    turned('body', 'body', 'y', [[0, 0], [0, 0.11], [0.17, 0.11], [0.17, 0]], [0, 0.02, 0]),
    turned('lid', 'plastic', 'y', [[0, 0], [0, 0.114], [0.02, 0.114], [0.04, 0.09], [0.05, 0.04], [0.05, 0]], [0, 0.19, 0]),
    disc('valve', 'valve', 0.014, 0.24, 0.255, -0.03, -0.03),
    disc('pin', 'pin', 0.005, 0.233, 0.24, 0.04, 0.01),
    box('ear-l', 'plastic', [-0.118, 0.15, -0.025], [-0.105, 0.175, 0.025]),
    box('ear-r', 'plastic', [0.105, 0.15, -0.025], [0.118, 0.175, 0.025]),
    h.prism('panel', 'plastic', 'x', [[0.06, 0.095], [0.06, 0.122], [0.15, 0.122], [0.15, 0.105]], -0.07, 0.07),
    box('display', 'display', [-0.03, 0.115, 0.12], [0.03, 0.137, 0.123]),
  ] + [
    box('key-%d' % i, 'key', [-0.06 + i * 0.03, 0.075, 0.121], [-0.04 + i * 0.03, 0.088, 0.124])
    for i in std.range(0, 4)
  ] + [
    box('socket', 'valve', [-0.02, 0.03, -0.114], [0.02, 0.055, -0.108]),
  ], {
    plastic: 'plastic-black',
    body: 'steel-stainless',
    valve: 'plastic-grey',
    pin: 'steel-grey',
    display: 'screen-black',
    key: 'plastic-grey',
    cord: 'plastic-black',
  })
  + { voxelGrain: 0.004 },

  // A kerosene pressure stove, 150 mm across and 170 mm tall: a squat round steel fuel tank with a filler
  // cap and a hand pump on its side, a brass riser to a burner head, and four pot supports on uprights
  // clipped to the tank's shoulder.
  h.compound('oil_cooker', 1.2, [
    turned('tank', 'tank', 'y', [[0, 0], [0, 0.058], [0.04, 0.06], [0.06, 0.05], [0.07, 0.02], [0.072, 0]]),
    disc('cap', 'cap', 0.01, 0.06, 0.072, -0.035, 0.02),
    turned('pump', 'pump', 'z', [[0, 0], [0, 0.008], [0.03, 0.008], [0.03, 0]], [0.02, 0.03, 0.05]),
    dial('pump-knob', 'pump-knob', 0.02, 0.03, 0.08, 0.012, 0.012),
    turned('valve', 'brass', 'z', [[0, 0], [0, 0.004], [0.03, 0.004], [0.03, 0]], [-0.03, 0.05, 0.045]),
    dial('valve-knob', 'pump-knob', -0.03, 0.05, 0.075, 0.009, 0.008),
    disc('riser', 'brass', 0.008, 0.07, 0.12),
    turned('burner', 'brass', 'y', [[0, 0], [0, 0.015], [0.015, 0.03], [0.022, 0.03], [0.022, 0]], [0, 0.12, 0]),
    disc('cap-plate', 'burner-cap', 0.018, 0.142, 0.146),
  ] + std.flattenArrays([
    local c = [1, 0, -1, 0][i];
    local s = [0, 1, 0, -1][i];
    local lo(v, a, b) = std.min(v * a, v * b) - 0.004;
    local hi(v, a, b) = std.max(v * a, v * b) + 0.004;
    [
      box('leg-%d' % i, 'support', [lo(c, 0.07, 0.07), 0.02, lo(s, 0.07, 0.07)], [hi(c, 0.07, 0.07), 0.17, hi(s, 0.07, 0.07)]),
      box('arm-%d' % i, 'support', [lo(c, 0.03, 0.074), 0.164, lo(s, 0.03, 0.074)], [hi(c, 0.03, 0.074), 0.17, hi(s, 0.03, 0.074)]),
    ]
    for i in std.range(0, 3)
  ]), {
    tank: 'steel-grey',
    cap: 'brass',
    pump: 'steel-stainless',
    'pump-knob': 'plastic-black',
    brass: 'brass',
    'burner-cap': 'iron-cast',
    support: 'steel-parkerized',
  })
  + { voxelGrain: 0.004 },

  // A hand-cranked screw oil press, 200 mm long and 150 mm tall: a horizontal steel barrel on a clamp
  // bracket, a funnel hopper on top for seeds, a crank arm with a wooden knob at one end, a press-cake
  // nozzle at the other, an oil spout under the barrel and a small burner cup below it to warm the press.
  h.compound('oil_press_manual', 1.9, [
    box('clamp-top', 'bracket', [-0.03, 0.04, -0.03], [0.03, 0.05, 0.03]),
    box('clamp-back', 'bracket', [-0.03, -0.0, -0.03], [0.03, 0.05, -0.02]),
    box('clamp-jaw', 'bracket', [-0.03, 0, -0.03], [0.03, 0.008, 0.02]),
    turned('clamp-screw', 'screw', 'y', [[0, 0], [0, 0.004], [0.035, 0.004], [0.035, 0]], [0, 0.005, 0.0]),
    box('saddle', 'bracket', [-0.02, 0.05, -0.012], [0.02, 0.075, 0.012]),
    turned('barrel', 'barrel', 'x', [[0, 0], [0, 0.022], [0.13, 0.022], [0.13, 0]], [-0.07, 0.095, 0]),
    turned('nozzle', 'barrel', 'x', [[0, 0.022], [0.02, 0.012], [0.03, 0.01], [0.03, 0]], [0.06, 0.095, 0]),
    turned('hopper', 'hopper', 'y', [[0, 0], [0, 0.012], [0.04, 0.032], [0.045, 0.032], [0.045, 0]], [-0.045, 0.11, 0]),
    turned('spout', 'barrel', 'y', [[0, 0], [0, 0.005], [0.02, 0.005], [0.02, 0]], [0.035, 0.058, 0]),
    disc('burner', 'burner', 0.016, 0.05, 0.065, 0.06, 0),
    disc('wick', 'wick', 0.004, 0.065, 0.071, 0.06, 0),
    turned('shaft', 'screw', 'x', [[0, 0], [0, 0.006], [0.02, 0.006], [0.02, 0]], [-0.09, 0.095, 0]),
    box('crank', 'crank', [-0.1, 0.085, -0.006], [-0.09, 0.165, 0.006]),
    turned('knob', 'knob', 'x', [[0, 0], [0, 0.01], [0.035, 0.009], [0.035, 0]], [-0.135, 0.155, 0]),
  ], {
    bracket: 'steel-grey',
    screw: 'steel-stainless',
    barrel: 'steel-stainless',
    hopper: 'steel-grey',
    burner: 'brass',
    wick: 'cloth-cream',
    crank: 'steel-grey',
    knob: 'wood-birch',
  })
  + { voxelGrain: 0.004 },

  // A cast-iron pasta extruder, 100 mm across and 230 mm tall: a vertical barrel clamped to a bench by a
  // foot and thumbscrew, a shaped die plate at its mouth, and a threaded plunger driven down by a T-crank
  // through a bridge over the barrel.
  h.compound('pastaextruder', 2, [
    turned('barrel', 'iron', 'y', [[0, 0.03], [0, 0.036], [0.12, 0.036], [0.12, 0.03], [0, 0.03]], [0, 0.04, 0]),
    disc('die', 'die', 0.034, 0.034, 0.04),
    disc('die-mark', 'die-mark', 0.016, 0.032, 0.034),
    box('foot', 'iron', [-0.01, 0.04, -0.07], [0.01, 0.07, -0.034]),
    box('clamp', 'iron', [-0.01, 0.0, -0.07], [0.01, 0.008, -0.04]),
    box('clamp-up', 'iron', [-0.01, 0.0, -0.07], [0.01, 0.07, -0.062]),
    turned('thumbscrew', 'screw', 'y', [[0, 0], [0, 0.004], [0.03, 0.004], [0.03, 0]], [0, -0.022, -0.052]),
    box('thumb', 'screw', [-0.012, -0.026, -0.054], [0.012, -0.02, -0.05]),
    box('post-l', 'iron', [-0.045, 0.16, -0.006], [-0.035, 0.205, 0.006]),
    box('post-r', 'iron', [0.035, 0.16, -0.006], [0.045, 0.205, 0.006]),
    box('bridge', 'iron', [-0.045, 0.205, -0.01], [0.045, 0.215, 0.01]),
    disc('rod', 'screw', 0.006, 0.12, 0.235),
    disc('plunger', 'plunger', 0.029, 0.115, 0.13),
    box('t-bar', 'iron', [-0.05, 0.228, -0.004], [0.05, 0.236, 0.004]),
    disc('t-knob-l', 'knob', 0.008, 0.236, 0.26, -0.045, 0),
    disc('t-knob-r', 'knob', 0.008, 0.236, 0.26, 0.045, 0),
  ], { iron: 'iron-cast', die: 'steel-grey', 'die-mark': 'paint-charcoal', screw: 'steel-stainless', plunger: 'steel-grey', knob: 'wood-walnut' })
  + { voxelGrain: 0.004 },

  // A jar of cucumbers fermenting in brine, cloth tied over the mouth.
  fermentJar('pickles_ferment', 1.1, [
    disc('cuke-%d' % i, 'pickle', 0.011, 0.006, 0.09, [-0.022, 0, 0.022, -0.011, 0.012, 0.03][i], [-0.01, -0.024, 0.006, 0.022, 0.02, -0.02][i])
    for i in std.range(0, 5)
  ] + [
    disc('dill', 'dill', 0.003, 0.09, 0.11, -0.03, 0.012),
  ], { brine: 'syrup-green', pickle: 'leaf-green', dill: 'plant-dried' }),

  // A soda-can alcohol stove kit, 140 mm across and 200 mm tall: a short double-walled stove cut from two
  // cans with a ring of jet holes round its top, a simmer ring with a tab handle resting on it, and the 500 ml
  // plastic fuel bottle with its cap.
  h.compound('popcan_stove', 0.045, [
    turned('stove', 'can', 'y', [[0, 0], [0, 0.031], [0.004, 0.033], [0.034, 0.033], [0.038, 0.03], [0.038, 0]], [-0.045, 0, 0]),
    ring('jets', 'jets', 0.022, 0.026, 0.038, 0.002, -0.045),
    disc('well', 'well', 0.012, 0.038, 0.039, -0.045, 0),
    ring('simmer', 'simmer', 0.028, 0.036, 0.04, 0.003, -0.045),
    box('tab', 'simmer', [-0.05, 0.04, 0.034], [-0.04, 0.043, 0.052]),
    turned('bottle', 'bottle', 'y', [[0, 0], [0, 0.031], [0.16, 0.031], [0.18, 0.014], [0.188, 0.012], [0.188, 0]], [0.03, 0, 0]),
    turned('label', 'label', 'y', [[0, 0], [0, 0.0315], [0.06, 0.0315], [0.06, 0]], [0.03, 0.05, 0]),
    disc('cap', 'cap', 0.014, 0.188, 0.205, 0.03, 0),
  ], { can: 'alu-bare', jets: 'paint-charcoal', well: 'paint-charcoal', simmer: 'alu-bare', bottle: 'plastic-clear', label: 'paper-white', cap: 'plastic-blue' })
  + h.inHand('popcan_stove', 'bottle') + { voxelGrain: 0.002 },

  // A single-burner propane stove, 230 mm wide, 180 mm deep and 110 mm tall: a green steel bowl on three
  // wire legs carrying a ported burner head and four pot supports, with a brass regulator and
  // control knob reaching out to the side where the cylinder screws in.
  h.compound('propane_cooker', 1, [
    turned('bowl', 'bowl', 'y', [[0, 0], [0, 0.04], [0.035, 0.07], [0.04, 0.07], [0.04, 0]], [0, 0.045, 0]),
    disc('burner', 'burner', 0.035, 0.07, 0.085),
    disc('burner-cap', 'cap', 0.026, 0.085, 0.09),
    ring('ports', 'ports', 0.028, 0.0355, 0.08, 0.004),
    disc('stem', 'brass', 0.01, 0.045, 0.07),
    turned('regulator', 'brass', 'x', [[0, 0], [0, 0.012], [0.07, 0.012], [0.07, 0]], [0, 0.04, 0]),
    turned('coupler', 'brass', 'x', [[0, 0], [0, 0.018], [0.03, 0.018], [0.03, 0]], [0.07, 0.04, 0]),
    dial('knob', 'knob', 0.05, 0.04, 0.012, 0.016, 0.02),
  ] + std.flattenArrays([
    local c = [0, 1, 0, -1][i];
    local s = [1, 0, -1, 0][i];
    [
      box('support-%d' % i, 'support', [std.min(0.045 * c, 0.085 * c) - 0.004, 0.088, std.min(0.045 * s, 0.085 * s) - 0.004], [std.max(0.045 * c, 0.085 * c) + 0.004, 0.098, std.max(0.045 * s, 0.085 * s) + 0.004]),
    ]
    for i in std.range(0, 3)
  ]) + [
    box('leg-%d' % i, 'support', [0.07 * std.cos(i * 2 * std.pi / 3 + 0.5) - 0.004, 0, 0.07 * std.sin(i * 2 * std.pi / 3 + 0.5) - 0.004], [0.07 * std.cos(i * 2 * std.pi / 3 + 0.5) + 0.004, 0.06, 0.07 * std.sin(i * 2 * std.pi / 3 + 0.5) + 0.004])
    for i in std.range(0, 2)
  ], {
    bowl: 'paint-green',
    burner: 'steel-stainless',
    cap: 'iron-cast',
    ports: 'paint-charcoal',
    brass: 'brass',
    knob: 'plastic-black',
    support: 'steel-parkerized',
  })
  + { voxelGrain: 0.004 },

  // A hand quern, 300 mm across and 230 mm tall to the top of its handle: a thick lower millstone with a
  // spout lip where the flour spills, a thinner runner stone on top with a dark feed hole in its centre
  // and an upright oak handle set near its edge.
  h.compound('rock_quern', 25, [
    turned('bed', 'stone', 'y', [[0, 0], [0, 0.145], [0.01, 0.15], [0.09, 0.15], [0.1, 0.14], [0.1, 0]]),
    box('lip', 'stone', [-0.03, 0.06, 0.13], [0.03, 0.09, 0.17]),
    box('groove', 'flour', [-0.012, 0.088, 0.13], [0.012, 0.0905, 0.17]),
    turned('runner', 'runner', 'y', [[0, 0.025], [0, 0.14], [0.055, 0.14], [0.06, 0.13], [0.06, 0.025], [0, 0.025]], [0, 0.1, 0]),
    disc('eye', 'eye', 0.025, 0.1, 0.161),
    ring('flour', 'flour', 0.14, 0.15, 0.1, 0.0015),
    disc('peg', 'handle', 0.016, 0.16, 0.23, 0.1, 0),
    disc('peg-cap', 'handle', 0.019, 0.22, 0.235, 0.1, 0),
  ], { stone: 'stone-grey', runner: 'stone-whet', eye: 'paint-charcoal', flour: 'chalk-white', handle: 'wood-oak' })
  + { voxelGrain: 0.006 },

  // A jar of shredded cabbage fermenting in its own brine under a stone weight, cloth tied over the mouth.
  fermentJar('sauerkraut_ferment', 1.5, [
    disc('kraut', 'kraut', 0.045, 0.004, 0.085),
    disc('weight', 'weight', 0.03, 0.085, 0.098),
  ], { brine: 'jelly-pale', kraut: 'straw-pale', weight: 'stone-grey' }),
]
