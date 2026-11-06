local k = import 'kit.libsonnet';
local h = import 'trailer-frame.libsonnet';
local s = import 'chopper.spec.libsonnet';
local box = k.box;
local prism = k.prism;
local bothSides = k.bothSides;
local rad(degrees) = degrees * std.pi / 180;
local tube = (import 'machine-kit.libsonnet').bar;
// The raked steering axis passes through the front axle; the long reach out to it is what makes the bike a chopper.
local forkX(y) = s.frontAxle - (y - s.frontHub) * 0.9;
[
  k.compound('chopper_frame', 40, [
    tube('neck', 'frame', [forkX(1.0), 1.0], [forkX(1.12), 1.12], 0.1, [-0.05, 0.05]),
    tube('backbone', 'frame', [-0.3, 0.78], [0.47, 1.02], 0.07, [-0.032, 0.032]),
    tube('down', 'frame', [0.47, 1.0], [0.33, 0.26], 0.07, [-0.032, 0.032]),
    tube('seat_post', 'frame', [-0.3, 0.26], [-0.3, 0.8], 0.07, [-0.032, 0.032]),
    box('front_cross', 'frame', [0.3, 0.23, -0.125], [0.37, 0.29, 0.125]),
    box('rear_cross', 'frame', [-0.34, 0.26, -0.125], [-0.26, 0.32, 0.125]),
    box('saddle_cross', 'frame', [-0.34, 0.7, -0.125], [-0.28, 0.76, 0.125]),
  ] + bothSides([
    tube('lower_rail', 'frame', [s.rearAxle, s.rearHub], [0.35, 0.26], 0.06, [0.095, 0.125]),
    tube('upper_rail', 'frame', [s.rearAxle, s.rearHub + 0.03], [-0.3, 0.74], 0.05, [0.095, 0.125]),
  ]), { frame: 'steel-bright' }),
  k.compound('chopper_fork', 9, [
    box('top_yoke', 'chrome', [forkX(1.12) - 0.06, 1.12, -0.085], [forkX(1.12) + 0.06, 1.15, 0.085]),
    box('lower_yoke', 'chrome', [forkX(1.0) - 0.06, 0.97, -0.085], [forkX(1.0) + 0.06, 1.0, 0.085]),
    k.turned('axle', 'chrome', 'z', k.disc(0.025, -0.085, 0.085), [s.frontAxle, s.frontHub, 0]),
  ] + bothSides([
    tube('leg', 'chrome', [s.frontAxle, s.frontHub], [forkX(1.15), 1.15], 0.05, [0.05, 0.085]),
  ]), { chrome: 'steel-bright' }),
  k.compound('chopper_front_wheel', 10, [
    k.turned('tyre', 'tyre', 'z', [[-0.035, 0.3], [-0.035, 0.34], [-0.025, s.frontHub], [0.025, s.frontHub], [0.035, 0.34], [0.035, 0.3], [-0.035, 0.3]]) + { sides: 24 },
    k.turned('rim', 'rim', 'z', k.annulus(0.27, 0.3, -0.03, 0.03)) + { sides: 24 },
    k.turned('hub', 'rim', 'z', k.disc(0.06, -0.05, 0.05)) + { sides: 12 },
  ] + [
    local a = rad(i * 60 + 15);
    tube('spoke_' + i, 'rim', [0.05 * std.cos(a), 0.05 * std.sin(a)], [0.28 * std.cos(a), 0.28 * std.sin(a)], 0.04, [-0.025, 0.025])
    for i in std.range(0, 5)
  ], { tyre: 'rubber-black', rim: 'steel-bright' }, { hub: ['hub', [0.5, 0.5, 0.5]] }),
  k.compound('chopper_rear_wheel', 16, [
    k.turned('tyre', 'tyre', 'z', [[-0.09, 0.21], [-0.09, 0.29], [-0.07, s.rearHub], [0.07, s.rearHub], [0.09, 0.29], [0.09, 0.21], [-0.09, 0.21]]) + { sides: 24 },
    k.turned('rim', 'rim', 'z', k.disc(0.21, -0.06, 0.06)) + { sides: 24 },
    k.turned('hub', 'hub', 'z', k.disc(0.07, -0.08, 0.08)) + { sides: 12 },
  ], { tyre: 'rubber-black', rim: 'steel-bright', hub: 'alu-bare' }, { hub: ['hub', [0.5, 0.5, 0.5]] }),
  // Two cylinders splayed in a vee fill the frame's triangle, so the side view reads as a big twin.
  k.compound('chopper_engine', 110, [
    box('crankcase', 'alloy', [-0.2, 0.26, -0.1], [0.24, 0.52, 0.1]),
    box('primary_cover', 'alloy', [-0.26, 0.28, -0.16], [0.12, 0.48, -0.1]),
    k.turned('timing_cover', 'chrome', 'z', k.disc(0.09, 0.1, 0.13), [0.02, 0.39, 0]) + { sides: 12 },
    tube('front_barrel', 'barrel', [0.08, 0.5], [0.24, 0.8], 0.15, [-0.07, 0.07]),
    tube('front_head', 'alloy', [0.24, 0.78], [0.28, 0.87], 0.18, [-0.08, 0.08]),
    tube('rear_barrel', 'barrel', [-0.02, 0.5], [-0.15, 0.72], 0.15, [-0.07, 0.07]),
    tube('rear_head', 'alloy', [-0.14, 0.7], [-0.18, 0.77], 0.18, [-0.08, 0.08]),
  ], { alloy: 'alu-bare', chrome: 'steel-bright', barrel: 'paint-charcoal' }),
  k.compound('chopper_exhaust', 7, [
    tube('front_header', 'chrome', [0.3, 0.8], [0.22, 0.44], 0.06, [0.07, 0.15]),
    tube('front_pipe', 'chrome', [0.25, 0.44], [-1.12, 0.42], 0.06, [0.14, 0.2]),
    tube('rear_header', 'chrome', [-0.2, 0.72], [-0.12, 0.32], 0.06, [0.07, 0.15]),
    tube('rear_pipe', 'chrome', [-0.09, 0.31], [-1.12, 0.29], 0.06, [0.14, 0.2]),
  ], { chrome: 'steel-bright' }),
  k.compound('chopper_rear_fender', 3, h.arcBand('guard', 'paint', s.rearAxle, s.rearHub, 0.36, 0.39, 20, 170, 10, [-0.09, 0.09]), { paint: s.paint }),
  k.compound('chopper_front_fender', 1, h.arcBand('guard', 'chrome', s.frontAxle, s.frontHub, 0.385, 0.41, 40, 140, 6, [-0.05, 0.05]), { chrome: 'steel-bright' }),
  k.compound('chopper_tank', 5, [
    prism('tank', 'paint', [[0.04, 0.92], [0.34, 0.99], [0.38, 1.04], [0.34, 1.1], [0.14, 1.1], [0.04, 1.0]], [-0.085, 0.085]),
    box('cap', 'chrome', [0.2, 1.1, -0.03], [0.26, 1.125, 0.03]),
  ], { paint: s.paint, chrome: 'steel-bright' }),
  k.compound('chopper_saddle', 3, [
    prism('pan', 'saddle', [[-0.66, 0.78], [-0.42, 0.7], [-0.42, 0.78], [-0.6, 0.86], [-0.66, 0.84]], [-0.12, 0.12]),
    prism('nose', 'saddle', [[-0.42, 0.7], [-0.2, 0.76], [-0.2, 0.82], [-0.42, 0.78]], [-0.08, 0.08]),
  ], { saddle: 'vinyl-black' }),
  // A broad pad on the seat tail's face with its mount behind it, so the two never compete for the same voxels.
  k.compound('chopper_sissy_bar', 2, [
    box('top', 'chrome', [-0.76, 1.18, -0.125], [-0.71, 1.24, 0.125]),
    box('pad', 'pad', [-0.71, 0.92, -0.09], [-0.65, 1.12, 0.09]),
    box('pad_mount', 'chrome', [-0.76, 1.0, -0.125], [-0.71, 1.06, 0.125]),
  ] + bothSides([
    box('upright', 'chrome', [-0.76, 0.47, 0.095], [-0.71, 1.24, 0.125]),
  ]), { chrome: 'steel-bright', pad: 'vinyl-black' }),
  k.compound('chopper_handlebar', 3, [
    box('brace', 'chrome', [0.33, 1.22, -0.1], [0.39, 1.26, 0.1]),
  ] + bothSides([
    box('riser', 'chrome', [0.33, 1.15, 0.07], [0.39, 1.44, 0.1]),
    box('bar', 'chrome', [0.3, 1.4, 0.07], [0.36, 1.44, 0.3]),
    box('grip', 'rubber', [0.3, 1.4, 0.3], [0.36, 1.44, 0.42]),
  ]), { chrome: 'steel-bright', rubber: 'rubber-black' }),
  k.compound('chopper_headlamp', 1, [
    box('bracket', 'chrome', [forkX(1.06), 1.03, -0.03], [forkX(1.06) + 0.12, 1.07, 0.03]),
    k.turned('shell', 'chrome', 'x', k.disc(0.07, forkX(1.06) + 0.1, forkX(1.06) + 0.2), [0, 1.08, 0]) + { sides: 16 },
    k.turned('lens', 'lens', 'x', k.disc(0.06, forkX(1.06) + 0.2, forkX(1.06) + 0.22), [0, 1.08, 0]) + { sides: 16 },
  ], { chrome: 'steel-bright', lens: 'plastic-frosted' }),
  // Forward controls, reached by a bar from the frame's front cross.
  k.compound('chopper_foot_peg', 0.5, [
    box('bar', 'chrome', [0.35, 0.28, 0.1], [0.5, 0.32, 0.14]),
    box('peg', 'rubber', [0.44, 0.28, 0.14], [0.5, 0.32, 0.3]),
  ], { chrome: 'steel-bright', rubber: 'rubber-black' }),
]
