local k = import 'kit.libsonnet';
local s = import 'camper_van.spec.libsonnet';
local box = k.box;
local prism = k.prism;
// Hinged at the cab end, so the tent stands highest over the rear doors.
local low = s.roof + 0.05;
local high = 2.82;
local rearX = -2.3;
local frontX = -0.15;
(import 'van-body.libsonnet').rows('camper_van', s) + [
  k.compound('camper_van_pop_top', 85, [
    box('frame', 'lid', [rearX, s.roof, -0.72], [frontX, s.roof + 0.05, 0.72]),
    prism('tent', 'tent', [[rearX + 0.04, s.roof + 0.05], [frontX - 0.04, s.roof + 0.05], [rearX + 0.04, high]], [-0.68, 0.68]),
    prism('lid', 'lid', [[rearX - 0.04, high], [frontX, low], [rearX - 0.04, high + 0.07]], [-0.76, 0.76]),
  ] + k.bothSides([
    box('tent_window', 'window', [-1.85, s.roof + 0.1, 0.68], [-1.15, s.roof + 0.26, 0.695]),
  ]), { lid: 'plastic-white', tent: 'cloth-canvas', window: 'mesh-black' }),
  k.compound('camper_van_kitchen', 110, [
    box('carcass', 'unit', [-1.0, s.floor, -0.92], [-0.12, 1.14, -0.42]),
    box('worktop', 'top', [-1.0, 1.14, -0.92], [-0.12, 1.18, -0.4]),
    box('sink', 'steel', [-0.9, 1.18, -0.82], [-0.56, 1.19, -0.52]),
    box('door_seam', 'seam', [-0.57, s.floor + 0.04, -0.42], [-0.55, 1.1, -0.41]),
  ], { unit: 'wood-birch', top: 'plastic-charcoal', steel: 'steel-stainless', seam: 'plastic-black' }),
  // Drawn back to each end of the glass, so they show from outside on both walls.
  k.compound('camper_van_curtains', 3, [
    box('far_' + i + '_' + end, 'cloth', [if end == 0 then s.windows[i][0] else s.windows[i][1] - 0.12, s.waist, -0.91], [if end == 0 then s.windows[i][0] + 0.12 else s.windows[i][1], s.windowTop, -0.88])
    for i in [0, 1]
    for end in [0, 1]
  ] + [
    box('near_' + end, 'cloth', [if end == 0 then s.windows[0][0] else s.windows[0][1] - 0.12, s.waist, 0.88], [if end == 0 then s.windows[0][0] + 0.12 else s.windows[0][1], s.windowTop, 0.91])
    for end in [0, 1]
  ], { cloth: 'cloth-sage' }),
]
