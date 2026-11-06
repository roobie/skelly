local k = import 'kit.libsonnet';
local box = k.box;
local s = import 'luxury_saloon.spec.libsonnet';
local nose = s.front - 0.075;
local hoodNose = s.hoodBack - (nose - s.aPost) * s.hoodFall;
local vane = 0.0625;
(import 'car-body.libsonnet')('luxury_saloon', s) + [
  k.compound('luxury_saloon_grille', 9, [
    box('head', 'bright', [nose, hoodNose - 0.03, -0.34], [nose + 0.075, hoodNose + 0.03, 0.34]),
    box('foot', 'bright', [nose, 0.53, -0.34], [nose + 0.075, 0.57, 0.34]),
    box('backing', 'dark', [nose, 0.57, -0.3], [nose + 0.05, hoodNose - 0.03, 0.3]),
    box('mascot', 'bright', [nose + 0.0, hoodNose + 0.03, -0.02], [nose + 0.07, hoodNose + 0.1, 0.02]),
  ] + k.bothSides([
    box('cheek', 'bright', [nose, 0.53, 0.3], [nose + 0.075, hoodNose + 0.03, 0.34]),
  ]) + [
    box('vane_' + i, 'bright', [nose + 0.04, 0.57, -0.3 + 2 * i * vane], [nose + 0.07, hoodNose - 0.03, -0.3 + (2 * i + 1) * vane])
    for i in std.range(0, 4)
  ], { bright: 'steel-bright', dark: 'plastic-black' }),
  k.compound('luxury_saloon_brightwork', 3, k.bothSides([
    box('front_sill', 'bright', [s.bFront, 0.4, s.side - 0.02], [s.cowl, 0.44, s.side + 0.03]),
    box('rear_sill', 'bright', [s.rearDoorArch, 0.4, s.side - 0.02], [s.bRear, 0.44, s.side + 0.03]),
    box('front_belt', 'bright', [s.bFront, s.waist - 0.03, s.side - 0.02], [s.cowl, s.waist, s.side + 0.03]),
    box('rear_belt', 'bright', [s.rearDoorArch, s.waist - 0.03, s.side - 0.02], [s.bRear, s.waist, s.side + 0.03]),
  ]), { bright: 'steel-bright' }),
]
