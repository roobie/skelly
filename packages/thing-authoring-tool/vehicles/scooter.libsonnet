local k = import 'kit.libsonnet';
local h = import 'trailer-frame.libsonnet';
local s = import 'scooter.spec.libsonnet';
local box = k.box;
local prism = k.prism;
local bothSides = k.bothSides;
local tube = (import 'machine-kit.libsonnet').bar;
local forkX(y) = s.frontAxle - (y - s.hub) * 0.42;
[
  k.compound('scooter_frame', 26, [
    box('backbone', 'frame', [-0.3, 0.2, -0.06], [0.3, 0.26, 0.06]),
    box('stand_cross', 'frame', [-0.24, 0.2, -0.13], [-0.14, 0.26, 0.13]),
    tube('down', 'frame', [forkX(0.62), 0.62], [0.27, 0.24], 0.07, [-0.032, 0.032]),
    tube('head', 'frame', [forkX(0.62), 0.62], [forkX(0.92), 0.92], 0.07, [-0.032, 0.032]),
    tube('rise', 'frame', [-0.27, 0.23], [-0.2, 0.62], 0.07, [-0.06, 0.06]),
    box('top_rail', 'frame', [-0.8, 0.59, -0.06], [-0.2, 0.65, 0.06]),
  ], { frame: 'paint-charcoal' }),
  // The whole rear cowl lifts off as one pressing.
  k.compound('scooter_cowl', 14, [
    box('deck', 'paint', [-0.84, 0.66, -0.19], [-0.16, 0.7, 0.19]),
    box('tail', 'paint', [-0.86, 0.47, -0.1], [-0.82, 0.7, 0.1]),
    box('front', 'paint', [-0.2, 0.3, -0.1], [-0.16, 0.7, 0.1]),
    box('liner', 'liner', [-0.84, 0.47, -0.1], [-0.36, 0.5, 0.1]),
  ] + bothSides([
    prism('side', 'paint', [[-0.88, 0.52], [-0.72, 0.34], [-0.24, 0.28], [-0.16, 0.4], [-0.16, 0.7], [-0.84, 0.7]], [0.1, 0.19]),
    box('trim', 'trim', [-0.7, 0.42, 0.19], [-0.3, 0.46, 0.2]),
  ]), { paint: s.paint, liner: 'plastic-black', trim: 'steel-bright' }),
  k.compound('scooter_leg_shield', 5, [
    prism('lower', 'paint', [[0.26, 0.26], [0.33, 0.26], [0.35, 0.76], [0.28, 0.76]], [-0.24, 0.24]),
    prism('upper', 'paint', [[0.28, 0.76], [0.35, 0.76], [0.37, 0.94], [0.3, 0.94]], [-0.17, 0.17]),
    prism('horn_cover', 'paint', [[0.3, 0.42], [0.4, 0.42], [0.52, 0.5], [0.56, 0.58], [0.42, 0.95], [0.3, 0.95]], [-0.07, 0.07]),
  ] + bothSides([
    box('lip', 'paint', [0.2, 0.28, 0.2], [0.27, 0.76, 0.24]),
  ]), { paint: s.paint }),
  k.compound('scooter_floorboard', 4, [
    box('board', 'paint', [-0.2, 0.26, -0.2], [0.3, 0.3, 0.2]),
    box('mat', 'mat', [-0.16, 0.3, -0.17], [0.24, 0.31, 0.17]),
  ], { paint: s.paint, mat: 'rubber-black' }),
  // The belt case swings with the wheel, so the engine is the far-side arm that carries the rear axle.
  k.compound('scooter_engine', 30, [
    box('belt_case', 'casing', [-0.64, 0.14, -0.16], [-0.2, 0.3, -0.07]),
    box('crankcase', 'casing', [-0.34, 0.16, -0.07], [-0.2, 0.34, 0.1]),
    k.turned('axle', 'casing', 'z', k.disc(0.03, -0.16, 0.1), [s.rearAxle, s.hub, 0]),
    box('shock', 'shock', [-0.5, 0.3, -0.13], [-0.44, 0.62, -0.07]),
    box('shock_mount', 'shock', [-0.5, 0.59, -0.07], [-0.44, 0.62, 0]),
  ], { casing: 'alu-bare', shock: 'paint-charcoal' }),
  k.compound('scooter_exhaust', 4, [
    box('header', 'chrome', [-0.38, 0.16, 0.094], [-0.2, 0.22, 0.14]),
    k.turned('silencer', 'chrome', 'x', k.disc(0.055, -0.82, -0.36), [0, 0.2, 0.15]) + { sides: 12 },
    k.turned('tip', 'dark', 'x', k.disc(0.03, -0.85, -0.82), [0, 0.2, 0.15]),
  ], { chrome: 'steel-bright', dark: 'plastic-black' }),
  k.compound('scooter_fork', 6, [
    tube('stem', 'frame', [forkX(0.52), 0.52], [forkX(0.97), 0.97], 0.05, [-0.03, 0.03]),
    box('crown', 'frame', [forkX(0.51) - 0.05, 0.5, -0.125], [forkX(0.51) + 0.05, 0.54, 0.125]),
    k.turned('axle', 'frame', 'z', k.disc(0.03, -0.125, 0.125), [s.frontAxle, s.hub, 0]),
  ] + bothSides([
    tube('leg', 'frame', [s.frontAxle, s.hub], [forkX(0.52), 0.52], 0.06, [0.094, 0.125]),
  ]), { frame: 'paint-charcoal' }),
  k.compound('scooter_wheel', 7, [
    k.turned('tyre', 'tyre', 'z', [[-0.055, 0.14], [-0.055, 0.2], [-0.04, s.tyre], [0.04, s.tyre], [0.055, 0.2], [0.055, 0.14], [-0.055, 0.14]]) + { sides: 24 },
    k.turned('rim', 'rim', 'z', k.disc(0.14, -0.04, 0.04)) + { sides: 24 },
    k.turned('hub', 'hub', 'z', k.disc(0.05, -0.06, 0.06)) + { sides: 12 },
  ], { tyre: 'rubber-black', rim: 'steel-grey', hub: 'alu-bare' }, { hub: ['hub', [0.5, 0.5, 0.5]] }),
  k.compound('scooter_front_mudguard', 1.5, h.arcBand('guard', 'paint', s.frontAxle, s.hub, 0.235, 0.285, 25, 165, 10, [-0.085, 0.085]), { paint: s.paint }),
  k.compound('scooter_handlebar', 3, [
    box('headset', 'paint', [0.22, 0.94, -0.1], [0.4, 1.07, 0.1]),
    box('bar', 'chrome', [0.26, 1.0, -0.26], [0.32, 1.04, 0.26]),
  ] + bothSides([
    box('grip', 'rubber', [0.26, 1.0, 0.24], [0.32, 1.04, 0.38]),
    box('mirror_stalk', 'chrome', [0.27, 1.04, 0.2], [0.3, 1.14, 0.23]),
    box('mirror', 'chrome', [0.25, 1.12, 0.18], [0.3, 1.2, 0.26]),
  ]), { paint: s.paint, chrome: 'steel-bright', rubber: 'rubber-black' }),
  k.compound('scooter_headlamp', 1, [
    k.turned('shell', 'chrome', 'x', k.disc(0.075, 0.4, 0.43), [0, 1.0, 0]) + { sides: 16 },
    k.turned('lens', 'lens', 'x', k.disc(0.065, 0.43, 0.46), [0, 1.0, 0]) + { sides: 16 },
  ], { chrome: 'steel-bright', lens: 'plastic-frosted' }),
  k.compound('scooter_seat', 3, [
    prism('saddle', 'saddle', [[-0.8, 0.7], [-0.2, 0.7], [-0.2, 0.76], [-0.25, 0.79], [-0.76, 0.79], [-0.8, 0.75]], [-0.16, 0.16]),
  ], { saddle: 'vinyl-black' }),
  k.compound('scooter_fuel_tank', 3, [
    box('tank', 'tank', [-0.4, 0.44, -0.09], [-0.22, 0.59, 0.09]),
  ], { tank: 'polymer-black' }),
]
