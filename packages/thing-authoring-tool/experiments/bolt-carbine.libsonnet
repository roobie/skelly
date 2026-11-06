local h = import '../compound.libsonnet';
local box = h.box;

// An oversized bolt carbine, about 0.84 m long and deep for its length: a slab receiver, an armoured barrel shroud
// nearly as deep as the receiver, a fat barrel ending in a slotted muzzle brake, a deep box magazine of rocket bolts
// ahead of the grip and a stubby butt. The muzzle is at +x and the side view shows its profile.
// An experiment in building a gun as a thing instead of in the gun authoring tool. Nothing imports this folder, so
// the build and the game skip it. To view it: `node tools/model-look.mjs --rows
// packages/thing-authoring-tool/experiments/bolt-carbine.libsonnet --out <dir> bolt_carbine`.

local w = 0.055;  // half the receiver's width
local barrelY = 0.245;
[
  h.compound('bolt_carbine', 11.5, [
    // Receiver, top ridge and a painted band.
    box('receiver', 'body', [-0.18, 0.15, -w], [0.17, 0.33, w]),
    box('ridge', 'body', [-0.16, 0.33, -0.038], [0.15, 0.35, 0.038]),
    box('receiver-band', 'accent', [-0.04, 0.15, -w - 0.003], [0.0, 0.33, w + 0.003]),
    // Barrel shroud, an octagonal slab with vents along both sides and a brass band at its mouth.
    h.prism('shroud', 'body', 'x', [[0.17, -0.045], [0.17, 0.045], [0.19, 0.062], [0.30, 0.062], [0.32, 0.045], [0.32, -0.045], [0.30, -0.062], [0.19, -0.062]], 0.17, 0.38),
    h.prism('shroud-band', 'trim', 'x', [[0.165, -0.049], [0.165, 0.049], [0.187, 0.067], [0.303, 0.067], [0.325, 0.049], [0.325, -0.049], [0.303, -0.067], [0.187, -0.067]], 0.36, 0.38),
  ] + [
    box('vent-%d-%s' % [i, s], 'vent', [0.20 + i * 0.075, 0.215, if s == 'r' then 0.061 else -0.064], [0.25 + i * 0.075, 0.285, if s == 'r' then 0.064 else -0.061])
    for i in [0, 1]
    for s in ['l', 'r']
  ] + [
    // A fat barrel and a muzzle brake with three side ports and a dark bore.
    h.rod('barrel', 'metal', 0.03, 0.38, 0.43, barrelY),
    box('brake', 'metal', [0.43, barrelY - 0.042, -0.046], [0.51, barrelY + 0.042, 0.046]),
    box('brake-cap', 'metal', [0.51, barrelY - 0.035, -0.04], [0.522, barrelY + 0.035, 0.04]),
  ] + [
    box('port-%d' % i, 'vent', [0.442 + i * 0.022, barrelY - 0.03, -0.0475], [0.456 + i * 0.022, barrelY + 0.03, 0.0475])
    for i in [0, 1, 2]
  ] + [
    box('bore', 'vent', [0.522, barrelY - 0.017, -0.017], [0.524, barrelY + 0.017, 0.017]),
    // A deep, raked box magazine with a brass base plate and a window showing the bolts.
    h.prism('magazine', 'body', 'z', [[0.02, 0.012], [0.14, 0.012], [0.16, 0.15], [0.04, 0.15]], -0.045, 0.045),
    box('mag-base', 'trim', [0.015, 0, -0.049], [0.145, 0.014, 0.049]),
    h.prism('mag-window', 'round', 'z', [[0.065, 0.035], [0.11, 0.035], [0.123, 0.13], [0.078, 0.13]], 0.045, 0.047),
    // Pistol grip, trigger guard and trigger.
    h.prism('grip', 'grip', 'z', [[-0.13, 0.155], [-0.07, 0.155], [-0.10, 0.03], [-0.155, 0.03]], -0.026, 0.026),
    box('guard', 'metal', [-0.075, 0.11, -0.008], [0.005, 0.122, 0.008]),
    box('guard-front', 'metal', [-0.005, 0.11, -0.008], [0.005, 0.155, 0.008]),
    box('trigger', 'metal', [-0.045, 0.122, -0.005], [-0.033, 0.153, 0.005]),
    // A stubby butt with a rubber pad.
    h.prism('butt', 'body', 'z', [[-0.18, 0.16], [-0.18, 0.33], [-0.27, 0.325], [-0.30, 0.30], [-0.30, 0.15], [-0.27, 0.135]], -0.045, 0.045),
    box('butt-pad', 'grip', [-0.32, 0.14, -0.047], [-0.30, 0.31, 0.047]),
    // Sights: a rear block on the ridge and a front post over the shroud.
    box('rear-sight', 'metal', [-0.12, 0.35, -0.02], [-0.07, 0.375, 0.02]),
    box('rear-notch', 'vent', [-0.11, 0.365, -0.004], [-0.08, 0.3755, 0.004]),
    box('front-post', 'metal', [0.33, 0.32, -0.007], [0.35, 0.36, 0.007]),
    // Ejection port and a chunky charging lever on the right side.
    box('ejection', 'vent', [0.03, 0.25, w], [0.12, 0.29, w + 0.002]),
    box('lever', 'metal', [-0.15, 0.27, w], [-0.11, 0.29, w + 0.03]),
    box('lever-knob', 'metal', [-0.16, 0.263, w + 0.022], [-0.10, 0.297, w + 0.036]),
  ] + [
    box('rivet-%d-%s' % [p[0], s], 'trim', [p[1] - 0.007, p[2] - 0.007, if s == 'r' then w else -w - 0.003], [p[1] + 0.007, p[2] + 0.007, if s == 'r' then w + 0.003 else -w])
    for p in [[0, -0.15, 0.18], [1, -0.15, 0.30], [2, 0.14, 0.18], [3, 0.14, 0.30]]
    for s in ['l', 'r']
  ], {
    body: 'paint-charcoal',
    accent: 'paint-oxblood',
    trim: 'brass',
    metal: 'steel-parkerized',
    vent: 'rubber-black',
    grip: 'rubber-black',
    round: 'brass',
  }) + {
    handling: h.gripOn('bolt_carbine', 'grip'),
    voxelGrain: 0.004,
  },
]
