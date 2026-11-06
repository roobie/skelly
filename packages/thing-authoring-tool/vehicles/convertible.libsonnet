local k = import 'kit.libsonnet';
local box = k.box;
local prism = k.prism;
local s = import 'convertible.spec.libsonnet';
local hoodBack = s.deckFront + 0.02;
local hoodFront = -0.98;
local lampOut = s.skin + 0.04;
// The body's plain red lens matches this paint, so this lamp stands on a bright surround with an amber indicator.
std.filter(function(row) row.id != 'convertible_tail_lamp', (import 'car-body.libsonnet')('convertible', s)) + [
  k.compound('convertible_tail_lamp', 1, [
    box('lens', 'lens', [s.rear + 0.01, 0.71875, s.hatchSide + 0.03], [s.rear + 0.11, s.lampTop - 0.03, lampOut - 0.03]),
    box('indicator', 'indicator', [s.rear + 0.01, 0.65, s.hatchSide + 0.03], [s.rear + 0.11, 0.71875, lampOut - 0.03]),
    box('surround_top', 'bright', [s.rear + 0.01, s.lampTop - 0.03, s.hatchSide], [s.rear + 0.11, s.lampTop, lampOut]),
    box('surround_foot', 'bright', [s.rear + 0.01, 0.62, s.hatchSide], [s.rear + 0.11, 0.65, lampOut]),
    box('surround_in', 'bright', [s.rear + 0.01, 0.65, s.hatchSide], [s.rear + 0.11, s.lampTop - 0.03, s.hatchSide + 0.03]),
    box('surround_out', 'bright', [s.rear + 0.01, 0.65, lampOut - 0.03], [s.rear + 0.11, s.lampTop - 0.03, lampOut]),
  ], { lens: 'plastic-red', indicator: 'plastic-amber', bright: 'steel-bright' }),
  k.compound('convertible_folded_hood', 22, [
    box('tonneau', 'trim', [hoodBack, s.waist - 0.04, -s.glassIn], [hoodFront + 0.06, s.waist + 0.03125, s.glassIn]),
    prism('stack_low', 'cloth', [[hoodBack, s.waist], [hoodFront + 0.02, s.waist], [hoodFront - 0.04, s.waist + 0.12], [hoodBack + 0.06, s.waist + 0.12]], [-0.66, 0.66]),
    prism('stack_top', 'cloth', [[hoodBack + 0.06, s.waist + 0.12], [hoodFront - 0.04, s.waist + 0.12], [hoodFront - 0.1, s.waist + 0.19], [hoodBack + 0.14, s.waist + 0.19]], [-0.6, 0.6]),
    box('fold_line', 'bow', [hoodBack + 0.14, s.waist + 0.19, -0.5], [hoodFront - 0.1, s.waist + 0.21, 0.5]),
  ], { trim: 'plastic-black', cloth: 'cloth-black', bow: 'plastic-black' }),
]
