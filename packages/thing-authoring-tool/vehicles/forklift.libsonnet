local k = import 'kit.libsonnet';
local m = import 'machine-kit.libsonnet';
local s = import 'forklift.spec.libsonnet';
local box = k.box;
local prism = k.prism;
local bothSides = k.bothSides;
local bar = m.bar;
[
  k.compound('forklift_chassis', s.shellMass, [
    box('spine', 'steel', [-0.62, 0.18, -0.33], [1.08, 0.5, 0.33]),
    box('spine_rear', 'steel', [-0.62, 0.18, -0.33], [0.18, 0.64, 0.33]),
    box('tail', 'steel', [-1.1, 0.4, -0.36], [-0.6, 0.62, 0.36]),
    box('steer_mount', 'steel', [-0.88, 0.28, -0.14], [-0.72, 0.42, 0.14]),
    box('mast_foot', 'steel', [1.05, 0.2, -0.34], [1.17, 0.46, 0.34]),
  ], { steel: 'paint-charcoal' }),
  k.compound('forklift_body', 240, [
    box('floor', 'mat', [0.18, 0.5, -0.33], [0.78, 0.54, 0.33]),
    prism('cowl', 'paint', [[0.74, 0.5], [1.06, 0.5], [1.06, 1.28], [0.88, 1.28]], [-0.34, 0.34]),
    box('dash', 'trim', [0.72, 1.2, -0.3], [0.9, 1.3, 0.3]),
    bar('column', 'trim', [0.84, 1.22], [0.47, 1.37], 0.06, [-0.03, 0.03]),
    prism('cover', 'paint', [[-0.64, 0.6], [0.22, 0.6], [0.22, 0.94], [0.1, s.cover], [-0.64, s.cover]], [-s.side, s.side]),
    box('riser', 'paint', [0.16, 0.5, -0.46], [0.22, 0.62, 0.46]),
    box('cover_seam', 'trim', [-0.64, s.cover - 0.01, -0.5], [0.12, s.cover + 0.01, -0.46]),
  ] + bothSides([
    box('skirt', 'paint', [-0.5, 0.22, 0.34], [0.28, 0.62, s.side]),
  ] + m.arc('fender', 'paint', s.frontAxle, s.frontHub, 0.4, 0.45, 12, 172, 10, [0.34, s.side])
  + [
    box('fender_foot', 'paint', [0.28, 0.4, 0.34], [0.46, 0.46, s.side]),
    box('fender_nose', 'paint', [1.25, 0.36, 0.34], [1.3, 0.48, s.side]),
    box('fender_skirt', 'paint', [0.86, 0.76, 0.32], [1.08, 1.0, 0.36]),
    box('side_vent_a', 'trim', [-0.5, 0.72, s.side], [-0.1, 0.75, s.side + 0.01]),
    box('side_vent_b', 'trim', [-0.5, 0.8, s.side], [-0.1, 0.83, s.side + 0.01]),
  ]), { paint: s.paint, mat: 'rubber-black', trim: 'plastic-black' }),
  k.compound('forklift_counterweight', 1250, [
    prism('block', 'iron', [[-1.24, 0.62], [-0.62, 0.62], [-0.62, 1.1], [-1.1, 1.1], [-1.24, 0.92]], [-s.side, s.side]),
    box('lower', 'iron', [-1.2, 0.3, -0.34], [-0.62, 0.62, 0.34]),
    box('tow_pin', 'iron', [-1.28, 0.42, -0.06], [-1.18, 0.5, 0.06]),
  ], { iron: 'paint-charcoal' }),
  k.compound('forklift_guard', 95, [
    box('rail_front', 'steel', [0.52, s.roof - 0.06, -0.54], [0.6, s.roof, 0.54]),
    box('rail_rear', 'steel', [-0.82, s.roof - 0.06, -0.54], [-0.74, s.roof, 0.54]),
  ] + bothSides([
    bar('post_front', 'steel', [0.8, 0.72], [0.56, s.roof - 0.02], 0.07, [0.46, 0.53]),
    box('post_rear', 'steel', [-0.82, 1.08, 0.46], [-0.74, s.roof, 0.53]),
    box('rail_side', 'steel', [-0.82, s.roof - 0.06, 0.46], [0.6, s.roof, 0.54]),
    box('bar_a', 'steel', [-0.74, s.roof - 0.05, 0.1], [0.52, s.roof - 0.01, 0.15]),
    box('bar_b', 'steel', [-0.74, s.roof - 0.05, 0.28], [0.52, s.roof - 0.01, 0.33]),
  ]) + [
    box('bar_c', 'steel', [-0.74, s.roof - 0.05, -0.03], [0.52, s.roof - 0.01, 0.03]),
  ], { steel: 'paint-charcoal' }),
  k.compound('forklift_mast', 310, [
    box('head', 'steel', [1.16, 2.0, -0.34], [1.3, 2.1, 0.34]),
    box('tie', 'steel', [1.16, 1.12, -0.34], [1.22, 1.2, 0.34]),
    box('foot', 'steel', [1.16, 0.14, -0.34], [1.3, 0.24, 0.34]),
    k.turned('ram', 'bright', 'y', k.disc(0.045, 0.24, 2.0), [1.21, 0, 0]),
  ] + bothSides([
    box('upright', 'steel', [1.16, 0.14, 0.24], [1.3, 2.1, 0.34]),
    box('inner', 'inner', [1.22, 0.3, 0.13], [1.3, 2.0, 0.24]),
    box('chain', 'chain', [1.24, 0.3, 0.07], [1.28, 2.0, 0.1]),
    bar('tilt_ram', 'bright', [0.9, 1.05], [1.18, 1.1], 0.05, [0.34, 0.39]),
  ]), { steel: 'paint-charcoal', inner: 'steel-grey', bright: 'steel-stainless', chain: 'iron-cast' }),
  k.compound('forklift_carriage', 110, [
    box('plate_low', 'steel', [1.3, 0.24, -0.46], [s.carriageFront - 0.04, 0.34, 0.46]),
    box('plate_high', 'steel', [1.3, 0.58, -0.46], [s.carriageFront - 0.04, 0.68, 0.46]),
    box('back_top', 'steel', [1.3, 1.08, -0.46], [s.carriageFront - 0.04, 1.14, 0.46]),
    box('back_mid', 'steel', [1.3, 0.3, -0.03], [s.carriageFront - 0.04, 1.14, 0.03]),
  ] + bothSides([
    box('back_side', 'steel', [1.3, 0.3, 0.42], [s.carriageFront - 0.04, 1.14, 0.46]),
    box('back_bar', 'steel', [1.3, 0.68, 0.2], [s.carriageFront - 0.04, 1.08, 0.24]),
  ]), { steel: 'paint-charcoal' }),
  k.compound('forklift_fork', 50, [
    box('shank', 'steel', [s.carriageFront - 0.06, 0.06, 0.24], [s.carriageFront, 0.7, 0.36]),
    prism('tine', 'steel', [[s.carriageFront - 0.06, 0.05], [2.46, 0.05], [2.46, 0.08], [s.carriageFront, 0.13], [s.carriageFront - 0.06, 0.13]], [0.24, 0.36]),
  ], { steel: 'steel-spall-black' }),
  m.wheel('forklift_drive_wheel', 58, 0.22, 0.17, 0.355),
  k.compound('forklift_drive_axle', 150, [
    m.axleDisc('beam', 'steel', 0, 0, 0.06, [-0.36, 0.36]),
    box('diff', 'steel', [-0.14, -0.14, -0.16], [0.14, 0.14, 0.16]),
  ], { steel: 'steel-grey' }),
  k.compound('forklift_steer_axle', 60, [
    m.axleDisc('beam', 'steel', 0, 0, 0.05, [-0.4, 0.4]),
    box('trunnion', 'steel', [-0.08, 0, -0.12], [0.08, 0.14, 0.12]),
  ], { steel: 'steel-grey' }),
  m.step('forklift_step', 6, [-0.3, 0.42], 0.34, [s.side, s.side + 0.1]),
  k.compound('forklift_tail_pipe', 6, [
    k.turned('pipe', 'steel', 'y', k.disc(0.04, 0, 0.62)) + { sides: 12 },
  ], { steel: 'steel-spall-black' }),
]
