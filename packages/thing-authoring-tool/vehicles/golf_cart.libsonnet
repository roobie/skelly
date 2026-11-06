local k = import 'kit.libsonnet';
local m = import 'machine-kit.libsonnet';
local s = import 'golf_cart.spec.libsonnet';
local box = k.box;
local prism = k.prism;
local bothSides = k.bothSides;
local bar = m.bar;
local fender(id, x) = m.arc(id, 'guard', x, s.hub, 0.27, 0.33, 8, 172, 8, [0.4, 0.62]);
[
  k.compound('golf_cart_frame', s.shellMass, [
    box('spine', 'dark', [-1.08, 0.16, -0.3], [1.12, 0.25, 0.3]),
    box('floor_pan', 'dark', [-0.46, 0.22, -s.side], [0.7, s.floor - 0.02, s.side]),
    box('floor_mat', 'mat', [-0.46, s.floor - 0.02, -s.side], [0.7, s.floor, s.side]),
  ], { dark: 'paint-charcoal', mat: 'rubber-black' }),
  k.compound('golf_cart_front_cowl', 16, [
    prism('cowl', 'paint', [[0.68, 0.22], [s.nose, 0.22], [s.nose, 0.6], [1.12, 0.72], [0.72, 0.94], [0.68, 0.94]], [-0.42, 0.42]),
    box('bumper', 'dark', [s.nose, 0.26, -0.5], [s.nose + 0.05, 0.36, 0.5]),
    box('dash', 'dark', [0.58, 0.84, -0.54], [0.72, 0.96, 0.54]),
    box('toe_board', 'paint', [0.66, s.floor, -0.56], [0.7, 0.86, 0.56]),
  ] + bothSides(fender('fender', s.frontAxle)), { paint: s.paint, dark: 'paint-charcoal', guard: 'plastic-black' }),
  k.compound('golf_cart_rear_body', 24, [
    box('seat_box', 'paint', [-0.5, s.floor, -s.side], [0.08, 0.6, s.side]),
    prism('tail', 'paint', [[s.tail, 0.22], [-0.46, 0.22], [-0.46, 0.64], [-1.1, 0.64], [s.tail, 0.56]], [-0.4, 0.4]),
    box('deck', 'paint', [-1.12, 0.54, -s.side], [-0.46, 0.64, s.side]),
    box('rear_bumper', 'dark', [s.tail - 0.05, 0.26, -0.5], [s.tail, 0.36, 0.5]),
  ] + bothSides(fender('fender', s.rearAxle)), { paint: s.paint, dark: 'paint-charcoal', guard: 'plastic-black' }),
  k.compound('golf_cart_canopy', 22, [
    box('roof', 'paint', [-0.76, s.roof - 0.05, -0.6], [0.66, s.roof, 0.6]),
    box('roof_rim', 'dark', [-0.7, s.roof - 0.08, -0.54], [0.6, s.roof - 0.05, 0.54]),
  ] + bothSides([
    bar('post_front', 'dark', [0.64, 0.92], [0.42, s.roof - 0.05], 0.05, [0.5, 0.55]),
    box('post_rear', 'dark', [-0.5, 0.58, 0.5], [-0.45, s.roof - 0.05, 0.55]),
  ]), { paint: s.paint, dark: 'paint-charcoal' }),
  k.compound('golf_cart_windscreen', 6, [
    bar('glass', 'glass', [0.63, 0.96], [0.43, s.roof - 0.08], 0.03, [-0.5, 0.5]),
  ], { glass: 'glass-clear' }),
  k.compound('golf_cart_bag_rack', 7, [
    box('upright', 'dark', [-1.0, 0.64, -0.36], [-0.94, 1.08, -0.3]),
    box('upright_b', 'dark', [-1.0, 0.64, 0.3], [-0.94, 1.08, 0.36]),
    box('top_rail', 'dark', [-1.0, 1.04, -0.36], [-0.94, 1.08, 0.36]),
    box('mid_rail', 'dark', [-1.0, 0.8, -0.36], [-0.94, 0.84, 0.36]),
    box('strap', 'strap', [-1.01, 0.92, -0.32], [-0.93, 0.97, 0.32]),
  ], { dark: 'paint-charcoal', strap: 'rubber-black' }),
  k.compound('golf_cart_front_axle', 18, [
    box('beam', 'dark', [s.frontAxle - 0.04, 0.17, -s.wheelZ + 0.05], [s.frontAxle + 0.04, 0.25, s.wheelZ - 0.05]),
    box('beam_mount', 'dark', [s.frontAxle - 0.1, 0.17, -0.2], [s.frontAxle + 0.1, 0.25, 0.2]),
  ] + bothSides([
    m.axleDisc('stub', 'dark', s.frontAxle, s.hub, 0.05, [s.wheelZ - 0.08, s.wheelZ + 0.02], 12),
    box('knuckle', 'dark', [s.frontAxle - 0.04, 0.17, s.wheelZ - 0.1], [s.frontAxle + 0.04, 0.28, s.wheelZ - 0.05]),
  ]), { dark: 'paint-charcoal' }),
  k.compound('golf_cart_rear_axle', 28, [
    m.axleDisc('tube', 'dark', s.rearAxle, s.hub, 0.05, [-s.wheelZ + 0.02, s.wheelZ - 0.02], 16),
    box('saddle', 'dark', [s.rearAxle - 0.08, 0.16, -0.18], [s.rearAxle + 0.08, 0.28, 0.18]),
  ], { dark: 'paint-charcoal' }),
  k.compound('golf_cart_steering_column', 3, [
    bar('column', 'dark', [0.62, 0.88], [0.38, 1.04], 0.05, [-0.25, -0.19]),
  ], { dark: 'paint-charcoal' }),
  m.step('golf_cart_step', 3, [-0.34, 0.44], s.floor - 0.02, [s.side, s.side + 0.08]),
]
