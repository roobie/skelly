local h = import '../compound.libsonnet';
// A closed ring turned about y from y0 to y1 between radii r0 and r1, ending on its first point so the hole stays open.
local ringY(id, slot, r0, r1, y0, y1, x=0, z=0) = h.turned(id, slot, 'y', [[0, r0], [0, r1], [y1 - y0, r1], [y1 - y0, r0], [0, r0]], [x, y0, z]);
// A closed ring turned about x, its axis at (y, z).
local ringX(id, slot, r0, r1, x0, x1, y, z=0) = h.tube(id, slot, r0, r1, x0, x1, y, z);
// A rolled bedding bundle along x: the body tapers into gathered ends, each ending in a rope and a flat loop on the floor.
local gatheredEnds(slot, rope, x, r, y) = std.flattenArrays([
  local s = if side > 0 then 1 else -1;
  local x0 = s * x;
  [
    if s > 0 then h.turned('gather-%d' % side, slot, 'x', [[0, 0], [0, r], [0.05, 0.010], [0.05, 0]], [x0, y, 0])
    else h.turned('gather-%d' % side, slot, 'x', [[0, 0], [0, 0.010], [0.05, r], [0.05, 0]], [x0 - 0.05, y, 0]),
    h.rod('rope-%d' % side, rope, 0.006, if s > 0 then x0 + 0.05 else x0 - 0.09, if s > 0 then x0 + 0.09 else x0 - 0.05, y),
  ] + h.strapLoop('loop-%d' % side, rope, 0.03, 0.022, 0.010, 0.008, y - 0.004, s * (x + 0.13), 0)
  for side in [1, -1]
]);
[
  // One roll of two-ply tissue, 110 mm across and 100 mm tall on a 42 mm card core, standing on end with its loose sheet hanging.
  h.compound('toilet_paper', 0.1, [
    ringY('roll', 'paper', 0.022, 0.055, 0, 0.100),
    ringY('core', 'core', 0.020, 0.022, 0, 0.100),
    h.box('tail', 'paper', [-0.045, 0.020, 0.054], [0.040, 0.098, 0.057]),
    h.box('perforation', 'perforation', [-0.045, 0.058, 0.057], [0.040, 0.060, 0.058]),
  ], { paper: 'paper-white', core: 'paperboard-tan', perforation: 'cloth-cream' }) + { voxelGrain: 0.002 } + h.inHand('toilet_paper', 'roll'),
  // A battery toothbrush, 230 mm long: a 29 mm thick handle with a power button, a slim neck and a round brush head.
  h.compound('toothbrush_electric', 0.089, [
    h.turned('body', 'body', 'x', [[0, 0], [0, 0.013], [0.006, 0.0145], [0.150, 0.0135], [0.172, 0.006], [0.172, 0]], [0, 0.0145, 0]),
    ringX('band', 'band', 0, 0.0148, 0.004, 0.016, 0.0145),
    h.box('button', 'button', [0.095, 0.026, -0.005], [0.112, 0.0302, 0.005]),
    h.box('light', 'band', [0.075, 0.026, -0.002], [0.082, 0.0290, 0.002]),
    h.rod('neck', 'body', 0.0045, 0.170, 0.214, 0.0145),
    h.disc('head', 'body', 0.0075, 0.010, 0.0185, 0.218, 0),
    h.disc('bristles', 'bristles', 0.0062, 0.0185, 0.029, 0.218, 0),
  ], { body: 'plastic-gloss-white', band: 'plastic-blue', button: 'plastic-blue', bristles: 'plastic-clear-blue' }) + {
    handling: h.gripOn('toothbrush_electric', 'body'),
    voxelGrain: 0.002,
  },
  // A manual toothbrush, 180 mm long: a flat handle with a rubber thumb pad, a thin neck and a tufted head.
  h.compound('toothbrush', 0.02, [
    h.box('handle', 'handle', [0, 0, -0.0065], [0.110, 0.010, 0.0065]),
    h.box('handle-end', 'handle', [-0.004, 0.002, -0.005], [0, 0.008, 0.005]),
    h.box('grip', 'grip', [0.060, 0.010, -0.004], [0.095, 0.012, 0.004]),
    h.box('neck', 'handle', [0.110, 0.003, -0.003], [0.150, 0.008, 0.003]),
    h.box('head', 'handle', [0.150, 0.002, -0.0055], [0.180, 0.007, 0.0055]),
    h.box('bristles', 'bristles', [0.153, 0.007, -0.0048], [0.178, 0.018, 0.0048]),
    h.box('bristles-tip', 'tip', [0.153, 0.018, -0.0048], [0.162, 0.020, 0.0048]),
  ], { handle: 'plastic-blue', grip: 'rubber-white', bristles: 'plastic-gloss-white', tip: 'plastic-clear-blue' }) + {
    handling: h.gripOn('toothbrush', 'handle'),
    voxelGrain: 0.002,
  },
  // A cotton canvas hammock rolled for carrying: a 320 mm roll 90 mm across, tied twice, gathered at each end into a rope loop.
  h.compound('hammock', 0.82, [
    h.rod('roll', 'cloth', 0.045, -0.160, 0.160, 0.045),
    ringX('stripe-a', 'stripe', 0, 0.0455, -0.110, -0.080, 0.045),
    ringX('stripe-b', 'stripe', 0, 0.0455, 0.080, 0.110, 0.045),
    ringX('tie-a', 'rope', 0, 0.048, -0.040, -0.030, 0.045),
    ringX('tie-b', 'rope', 0, 0.048, 0.030, 0.040, 0.045),
  ] + gatheredEnds('cloth', 'rope', 0.160, 0.045, 0.045), { cloth: 'cloth-canvas', stripe: 'cloth-orange', rope: 'cord-cotton' }) + { voxelGrain: 0.004 },
  // A cord net hammock bundled for carrying: 360 mm of gathered netting 70 mm across, tied twice, ending in rope loops.
  h.compound('hammock_net', 0.4, [
    local c = h.hexPack(0.011, [3, 2, 1])[i];
    h.rod('net-%d' % i, 'net', 0.011, -0.180, 0.180, c.y) + { origin: [-0.180, c.y, c.z] }
    for i in std.range(0, 5)
  ] + [
    ringX('tie-a', 'rope', 0, 0.036, -0.060, -0.050, 0.036),
    ringX('tie-b', 'rope', 0, 0.036, 0.050, 0.060, 0.036),
  ] + gatheredEnds('net', 'rope', 0.180, 0.030, 0.036), { net: 'cord-cotton', rope: 'jute' }) + { voxelGrain: 0.004 },
  // A small pewter serving bowl, 110 mm across and 45 mm deep on a low foot ring.
  h.compound('bowl_pewter', 0.3, [
    h.turned('bowl', 'bowl', 'y', [[0, 0], [0, 0.030], [0.005, 0.030], [0.009, 0.040], [0.025, 0.051], [0.043, 0.055], [0.045, 0.055], [0.045, 0.052], [0.026, 0.048], [0.012, 0.037], [0.008, 0.025], [0.008, 0]]),
    ringY('rim', 'rim', 0.052, 0.0565, 0.042, 0.045),
  ], { bowl: 'alu-bare', rim: 'steel-grey' }) + { voxelGrain: 0.002 } + h.inHand('bowl_pewter', 'bowl'),
  // A clear plastic food tub with a snap-on lid, 190 by 140 mm and 72 mm tall, a latch tab at each end.
  h.compound('bowl_plastic', 0.1, [
    h.box('base', 'tub', [-0.085, 0, -0.060], [0.085, 0.010, 0.060]),
    h.box('tub', 'tub', [-0.090, 0.010, -0.065], [0.090, 0.060, 0.065]),
    h.box('lid', 'lid', [-0.095, 0.060, -0.070], [0.095, 0.068, 0.070]),
    h.box('lid-top', 'lid', [-0.085, 0.068, -0.060], [0.085, 0.072, 0.060]),
    h.box('tab-a', 'lid', [-0.100, 0.045, -0.025], [-0.095, 0.068, 0.025]),
    h.box('tab-b', 'lid', [0.095, 0.045, -0.025], [0.100, 0.068, 0.025]),
  ], { tub: 'plastic-frosted', lid: 'plastic-blue' }) + { voxelGrain: 0.004 },
  // A glazed ceramic casserole, 200 mm across the pot and 220 mm over its lug handles, 95 mm deep under a domed lid.
  h.compound('casserole', 2.7, [
    h.turned('pot', 'pot', 'y', [[0, 0], [0, 0.085], [0.008, 0.095], [0.090, 0.100], [0.095, 0.100], [0.095, 0]]),
    ringY('rim', 'rim', 0.090, 0.101, 0.090, 0.097),
    h.dome('lid', 'lid', 0.094, 0.028, 0.006, 'y', [0, 0.095, 0]),
    h.disc('lid-fill', 'lid', 0.090, 0.095, 0.099),
    h.disc('knob-stem', 'knob', 0.010, 0.120, 0.128),
    h.disc('knob', 'knob', 0.018, 0.128, 0.138),
    h.box('lug-a', 'pot', [-0.112, 0.074, -0.030], [-0.095, 0.086, 0.030]),
    h.box('lug-b', 'pot', [0.095, 0.074, -0.030], [0.112, 0.086, 0.030]),
  ], { pot: 'paint-oxblood', rim: 'ceramic-white', lid: 'paint-oxblood', knob: 'ceramic-white' }) + { voxelGrain: 0.004 },
]
