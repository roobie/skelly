local h = import '../compound.libsonnet';
local box = h.box;
// A hexagonal crystal column standing on y from `y0` to `y1`, radius `r`, centred at [x, z], with a pointed tip `tip` tall.
local column(prefix, slot, r, y0, y1, tip, x, z) = [
  h.prism(prefix, slot, 'y', [[z + r * std.sin(std.pi * i / 3), x + r * std.cos(std.pi * i / 3)] for i in std.range(0, 5)], y0, y1),
  h.turned(prefix + '-tip', slot, 'y', [[0, 0], [0, r * 0.9], [tip, 0]], [x, y1, z]),
];
// A flat crystal shard in the xy plane, `t` thick on z, pointing at angle `a` (radians) from its outer end at radius
// `r1` to its tip at radius `r0` about [cx, cy]; it is `w` wide at its shoulder.
local shard(id, slot, a, r0, r1, w, t, cx, cy) =
  local u = [std.cos(a), std.sin(a)], n = [-std.sin(a), std.cos(a)], rm = r0 + (r1 - r0) * 0.35;
  local p(r, s) = [cx + u[0] * r + n[0] * s, cy + u[1] * r + n[1] * s];
  h.prism(id, slot, 'z', [p(r0, 0), p(rm, w / 2), p(r1, w / 3), p(r1, -w / 3), p(rm, -w / 2)], -t / 2, t / 2);
// The palm-sized device, 150 by 75 by 18 mm, lying on its back with its toggle at +x: an aluminium tray under a dark
// plastic shell, a white label plate and a crystal seated in a socket on top. `broken` sags the -x end, scorches the
// shell and bends the toggle.
local fieldDevice(broken) = [
  box('tray', 'alu', [-0.075, 0, -0.0375], [0.075, 0.008, 0.0375]),
  box('shell', 'shell', [-0.073, 0.008, -0.0355], [0.073, 0.018, 0.0355]),
  box('label', 'label', [-0.062, 0.018, -0.026], [-0.012, 0.019, 0.026]),
  box('text-a', 'print', [-0.056, 0.019, 0.008], [-0.018, 0.0195, 0.016]),
  box('text-b', 'print', [-0.056, 0.019, -0.008], [-0.03, 0.0195, 0.0]),
  box('logo', 'print', [-0.056, 0.019, -0.02], [-0.046, 0.0195, -0.012]),
  h.disc('socket', 'socket', 0.02, 0.018, 0.02, 0.034, 0),
  h.prism('crystal', 'crystal', 'y', [[0.009 * std.sin(std.pi * i / 3), 0.034 + 0.016 * std.cos(std.pi * i / 3)] for i in std.range(0, 5)], 0.02, 0.026),
  h.prism('crystal-top', 'crystal', 'y', [[0.006 * std.sin(std.pi * i / 3), 0.034 + 0.011 * std.cos(std.pi * i / 3)] for i in std.range(0, 5)], 0.026, 0.029),
  box('toggle-base', 'alu', [0.075, 0.004, -0.008], [0.08, 0.014, 0.008]),
] + (
  if broken then [
    h.prism('toggle-bent', 'toggle', 'z', [[0.08, 0.006], [0.084, 0.006], [0.09, 0.016], [0.087, 0.018]], -0.003, 0.003),
    box('sag', 'scorch', [-0.08, 0.002, -0.03], [-0.073, 0.014, 0.024]),
    box('drip-a', 'scorch', [-0.06, 0.0, 0.0375], [-0.05, 0.016, 0.042]),
    box('drip-b', 'scorch', [-0.04, 0.004, 0.0375], [-0.034, 0.016, 0.041]),
    box('drip-c', 'scorch', [-0.072, -0.004, 0.02], [-0.064, 0.008, 0.04]),
    box('blister-a', 'scorch', [-0.072, 0.018, -0.032], [-0.04, 0.022, -0.012]),
    box('blister-b', 'scorch', [-0.07, 0.018, 0.016], [-0.05, 0.021, 0.03]),
    box('burn', 'scorch', [-0.03, 0.019, -0.03], [-0.014, 0.0195, -0.012]),
  ] else [
    box('toggle', 'toggle', [0.08, 0.008, -0.003], [0.092, 0.011, 0.003]),
  ]
);
local deviceFinishes = { alu: 'foil-alu', shell: 'plastic-charcoal', label: 'plastic-white', print: 'plastic-matte-black', socket: 'plastic-matte-black', crystal: 'crystal-glow-violet', toggle: 'steel-bright', scorch: 'bark' };
// A sealed syringe of serum, 10 ml in a barrel 70 mm long and 16 mm across, its plunger drawn back and a capped needle,
// with a few crystal flecks hanging in the dose.
local serum = h.syringe(0.07, 0.008, 0.85, 0.03) + [
  box('fleck-a', 'fleck', [-0.02, 0.01, -0.002], [-0.016, 0.014, 0.002]),
  box('fleck-b', 'fleck', [0.0, 0.014, -0.003], [0.004, 0.017, 0.001]),
  box('fleck-c', 'fleck', [0.018, 0.008, 0.0], [0.022, 0.012, 0.004]),
  h.tube('label', 'label', 0.0081, 0.0086, -0.012, 0.012, 0.012),
];
[
  // A bench eye-test machine 360 mm wide, 290 mm tall and 350 mm deep: a white steel housing on a base, two eyepieces
  // and a forehead rest on its front with a chin cup below, a violet crystal window and a sight glass of green fluid on
  // top, a wired headband hanging from a hook on its left side and an arm cuff hanging on its right.
  h.compound('psi_noetic_resonance_detector', 12, [
    box('base', 'frame', [-0.17, 0, -0.15], [0.17, 0.03, 0.2]),
    box('housing', 'housing', [-0.15, 0.03, -0.13], [0.15, 0.26, 0.11]),
    box('face', 'panel', [-0.12, 0.17, 0.11], [0.12, 0.235, 0.118]),
    h.turned('eyepiece-l', 'frame', 'z', [[0, 0], [0, 0.017], [0.05, 0.017], [0.05, 0]], [-0.034, 0.2, 0.118]),
    h.turned('eyepiece-r', 'frame', 'z', [[0, 0], [0, 0.017], [0.05, 0.017], [0.05, 0]], [0.034, 0.2, 0.118]),
    h.turned('cup-l', 'rubber', 'z', [[0, 0], [0, 0.021], [0.014, 0.021], [0.014, 0]], [-0.034, 0.2, 0.168]),
    h.turned('cup-r', 'rubber', 'z', [[0, 0], [0, 0.021], [0.014, 0.021], [0.014, 0]], [0.034, 0.2, 0.168]),
    box('brow-arm', 'frame', [-0.01, 0.235, 0.11], [0.01, 0.25, 0.17]),
    box('brow-rest', 'rubber', [-0.07, 0.24, 0.165], [0.07, 0.258, 0.185]),
    box('chin-post', 'frame', [-0.012, 0.03, 0.16], [0.012, 0.13, 0.184]),
    box('chin-cup', 'rubber', [-0.05, 0.13, 0.145], [0.05, 0.145, 0.198]),
    box('chin-lip', 'rubber', [-0.05, 0.145, 0.185], [0.05, 0.155, 0.198]),
    box('knob-base', 'panel', [0.09, 0.03, 0.11], [0.13, 0.07, 0.12]),
    h.turned('knob', 'frame', 'z', [[0, 0], [0, 0.012], [0.014, 0.012], [0.014, 0]], [0.11, 0.05, 0.12]),
    h.disc('bezel', 'frame', 0.05, 0.26, 0.268, -0.05, -0.02),
    h.prism('window', 'crystal', 'y', [[-0.02 + 0.036 * std.sin(std.pi * i / 3), -0.05 + 0.036 * std.cos(std.pi * i / 3)] for i in std.range(0, 5)], 0.268, 0.29),
    box('screen', 'screen', [0.03, 0.26, 0.0], [0.12, 0.264, 0.06]),
    h.disc('vial-foot', 'frame', 0.022, 0.26, 0.268, 0.08, -0.08),
    h.disc('vial', 'glass', 0.018, 0.268, 0.32, 0.08, -0.08),
    h.disc('fluid', 'fluid', 0.015, 0.27, 0.306, 0.08, -0.08),
    h.disc('vial-cap', 'frame', 0.02, 0.32, 0.328, 0.08, -0.08),
    // The headband on its hook at -x, its ring standing in the yz plane, with three electrode pads and two leads.
    box('hook-l', 'frame', [-0.19, 0.22, -0.01], [-0.15, 0.23, 0.01]),
    box('hook-l-tip', 'frame', [-0.19, 0.23, -0.01], [-0.18, 0.245, 0.01]),
    h.tube('headband', 'band', 0.075, 0.082, -0.188, -0.164, 0.15, 0),
    box('pad-a', 'pad', [-0.192, 0.075, -0.012], [-0.16, 0.085, 0.012]),
    box('pad-b', 'pad', [-0.192, 0.14, 0.072], [-0.16, 0.162, 0.084]),
    box('pad-c', 'pad', [-0.192, 0.14, -0.084], [-0.16, 0.162, -0.072]),
    box('lead-a', 'wire', [-0.164, 0.08, 0.02], [-0.15, 0.084, 0.024]),
    box('lead-b', 'wire', [-0.164, 0.084, -0.024], [-0.15, 0.088, -0.02]),
    // The arm cuff at +x, folded flat and hanging from its own hook, with a hose to the housing.
    box('hook-r', 'frame', [0.15, 0.22, -0.01], [0.175, 0.23, 0.01]),
    box('cuff', 'cuff', [0.155, 0.07, -0.07], [0.172, 0.222, 0.03]),
    box('cuff-strap', 'strap', [0.172, 0.08, -0.06], [0.176, 0.21, -0.02]),
    box('hose', 'wire', [0.15, 0.06, 0.04], [0.162, 0.068, 0.07]),
  ], {
    frame: 'steel-grey',
    housing: 'enamel-white',
    panel: 'plastic-charcoal',
    rubber: 'rubber-black',
    crystal: 'crystal-glow-violet',
    screen: 'lcd-green',
    glass: 'glass-clear',
    fluid: 'syrup-green',
    band: 'plastic-matte-black',
    pad: 'foil-alu',
    wire: 'rubber-black',
    cuff: 'cloth-navy',
    strap: 'hook-loop-grey',
  }) + h.inHand('psi_noetic_resonance_detector', 'housing') + { voxelGrain: 0.004 },

  // The thick serum: an amber dose like honey.
  h.compound('morphic_serum_syringe', 0.029, serum, {
    barrel: 'plastic-clear',
    dose: 'resin-honey',
    stopper: 'rubber-black',
    plunger: 'plastic-white',
    hub: 'plastic-white',
    cap: 'plastic-orange',
    fleck: 'crystal-glow-violet',
    label: 'plastic-white',
  }) + h.inHand('morphic_serum_syringe', 'barrel') + { voxelGrain: 0.002 },

  // A deck of 25 test cards, 88 by 63 mm and 8 mm thick, squared up, with its top card slid a little aside to show a
  // ringed circle printed on its face.
  h.compound('cards_zener', 0.039, [
    box('deck', 'card', [-0.044, 0, -0.0315], [0.044, 0.006, 0.0315]),
    box('edge-a', 'edge', [-0.0442, 0.002, -0.0317], [0.0442, 0.0026, 0.0317]),
    box('back', 'back', [-0.042, 0.006, -0.0295], [0.042, 0.0064, 0.0295]),
    box('top', 'card', [-0.036, 0.0064, -0.034], [0.052, 0.0084, 0.029]),
    h.turned('circle', 'symbol', 'y', [[0, 0.016], [0, 0.021], [0.0006, 0.021], [0.0006, 0.016], [0, 0.016]], [0.008, 0.0084, -0.0025]),
    box('corner-a', 'symbol', [-0.032, 0.0084, 0.02], [-0.026, 0.009, 0.026]),
    box('corner-b', 'symbol', [0.042, 0.0084, -0.031], [0.048, 0.009, -0.025]),
  ], { card: 'paper-white', edge: 'paper-white', back: 'cloth-blue', symbol: 'plastic-matte-black' })
  + h.inHand('cards_zener', 'deck') + { voxelGrain: 0.002 },

  h.compound('force_field_generator', 0.29, fieldDevice(false), deviceFinishes)
  + h.inHand('force_field_generator', 'shell') + { voxelGrain: 0.002 },

  h.compound('force_field_generator_broken', 0.29, fieldDevice(true), deviceFinishes)
  + h.inHand('force_field_generator_broken', 'shell') + { voxelGrain: 0.002 },

  // A crystal focusing rig 250 mm tall: a round steel foot and post carrying an upright ring 180 mm across, facing +z,
  // with six cut blue crystal shards clamped round it, all pointing at an empty focal point in the middle.
  h.compound('matrix_aligning_tool', 2.8, [
    h.disc('foot', 'steel', 0.07, 0, 0.012),
    h.disc('foot-step', 'steel', 0.05, 0.012, 0.02),
    box('post', 'steel', [-0.008, 0.02, -0.008], [0.008, 0.072, 0.008]),
    h.turned('ring', 'steel', 'z', [[0, 0.084], [0, 0.092], [0.016, 0.092], [0.016, 0.084], [0, 0.084]], [0, 0.158, -0.008]),
  ] + [
    shard('shard-%d' % i, 'crystal', std.pi / 6 + i * std.pi / 3, 0.022, 0.086, 0.026, 0.012, 0, 0.158)
    for i in std.range(0, 5)
  ] + [
    local a = std.pi / 6 + i * std.pi / 3;
    box('clamp-%d' % i, 'clamp', [0.088 * std.cos(a) - 0.007, 0.158 + 0.088 * std.sin(a) - 0.007, -0.012], [0.088 * std.cos(a) + 0.007, 0.158 + 0.088 * std.sin(a) + 0.007, 0.012])
    for i in std.range(0, 5)
  ], { steel: 'steel-grey', crystal: 'crystal-glow-blue', clamp: 'brass-dull' })
  + h.inHand('matrix_aligning_tool', 'post') + { voxelGrain: 0.004 },

  // A cluster of five violet crystal columns 150 mm wide on a steel plate, held in a soldered cage of steel straps and
  // bands with copper-coloured wire run between them; one column stands loose in its band, clear of the plate.
  h.compound('matrix_channeling_tool', 1.4, [
    box('plate', 'steel', [-0.075, 0, -0.04], [0.075, 0.008, 0.04]),
    box('upright-l', 'steel', [-0.072, 0.008, -0.004], [-0.064, 0.07, 0.004]),
    box('upright-r', 'steel', [0.064, 0.008, -0.004], [0.072, 0.07, 0.004]),
    box('bar', 'steel', [-0.072, 0.062, -0.004], [0.072, 0.07, 0.004]),
  ] + column('col-a', 'crystal', 0.011, 0.008, 0.07, 0.02, -0.044, 0.012)
  + column('col-b', 'crystal', 0.014, 0.008, 0.095, 0.025, -0.016, -0.008)
  + column('col-c', 'crystal', 0.016, 0.008, 0.11, 0.03, 0.012, 0.01)
  + column('col-d', 'crystal', 0.012, 0.008, 0.08, 0.022, 0.04, -0.012)
  + column('col-e', 'crystal', 0.009, 0.016, 0.058, 0.016, 0.03, 0.026)
  + [
    h.turned('band-a', 'band', 'y', [[0, 0.0115], [0, 0.0145], [0.008, 0.0145], [0.008, 0.0115], [0, 0.0115]], [-0.044, 0.03, 0.012]),
    h.turned('band-b', 'band', 'y', [[0, 0.0145], [0, 0.0175], [0.008, 0.0175], [0.008, 0.0145], [0, 0.0145]], [-0.016, 0.03, -0.008]),
    h.turned('band-c', 'band', 'y', [[0, 0.0165], [0, 0.0195], [0.008, 0.0195], [0.008, 0.0165], [0, 0.0165]], [0.012, 0.03, 0.01]),
    h.turned('band-d', 'band', 'y', [[0, 0.0125], [0, 0.0155], [0.008, 0.0155], [0.008, 0.0125], [0, 0.0125]], [0.04, 0.03, -0.012]),
    h.turned('band-e', 'band', 'y', [[0, 0.0095], [0, 0.0125], [0.008, 0.0125], [0.008, 0.0095], [0, 0.0095]], [0.03, 0.03, 0.026]),
    box('wire-a', 'wire', [-0.044, 0.05, -0.002], [0.04, 0.054, 0.002]),
    box('wire-b', 'wire', [0.028, 0.04, -0.002], [0.032, 0.044, 0.026]),
    box('solder-a', 'solder', [-0.034, 0.048, -0.004], [-0.028, 0.056, 0.004]),
    box('solder-b', 'solder', [0.024, 0.048, -0.004], [0.03, 0.056, 0.004]),
  ], { steel: 'steel-grey', crystal: 'crystal-glow-violet', band: 'steel-bright', wire: 'bronze', solder: 'metal-silver' })
  + h.inHand('matrix_channeling_tool', 'plate') + { voxelGrain: 0.002 },
]
