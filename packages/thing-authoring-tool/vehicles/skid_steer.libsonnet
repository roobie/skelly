local k = import 'kit.libsonnet';
local m = import 'machine-kit.libsonnet';
local s = import 'skid_steer.spec.libsonnet';
local box = k.box;
local prism = k.prism;
local bothSides = k.bothSides;
local bar = m.bar;
[
  k.compound('skid_steer_frame', s.shellMass, [
    box('floor', 'steel', [s.cageRear, 0.4, -0.36], [s.cageFront, s.floor, 0.36]),
    box('belly', 'steel', [-1.2, 0.3, -0.36], [s.cageFront, 0.5, 0.36]),
    box('foot_board', 'mat', [0.3, s.floor, -0.36], [s.cageFront, s.floor + 0.03, 0.36]),
    box('seat_box', 'steel', [-0.32, s.floor, -0.28], [0.14, s.floor + 0.2, 0.28]),
  ] + bothSides([
    box('sponson', 'steel', [-1.05, 0.28, 0.35], [0.95, 0.8, 0.56]),
    box('tower', 'paint', [-1.08, 0.78, 0.48], [-0.62, 1.82, 0.62]),
    box('tower_top', 'paint', [-1.0, 1.6, 0.48], [-0.6, 1.92, 0.62]),
  ]), { steel: 'paint-charcoal', mat: 'rubber-black', paint: s.paint }),
  k.compound('skid_steer_chain_case', 180, [
    box('case', 'steel', [-0.75, 0.3, 0.5], [0.75, 0.5, 0.6]),
    m.axleDisc('stub_front', 'steel', s.frontAxle, s.hub, 0.09, [0.54, 0.62], 12),
    m.axleDisc('stub_rear', 'steel', s.rearAxle, s.hub, 0.09, [0.54, 0.62], 12),
  ], { steel: 'paint-charcoal' }),
  k.compound('skid_steer_cage', 150, [
    box('roof', 'paint', [s.cageRear - 0.05, s.roof - 0.02, -s.cageSide - 0.03], [s.cageFront + 0.05, s.roof + 0.05, s.cageSide + 0.03]),
    box('rear_wall', 'bar', [s.cageRear, s.floor, -s.cageSide], [s.cageRear + 0.05, 1.42, s.cageSide]),
    box('rear_top', 'bar', [s.cageRear, 1.9, -s.cageSide], [s.cageRear + 0.05, s.roof, s.cageSide]),
    box('rear_glass', 'glass', [s.cageRear + 0.01, 1.42, -s.cageSide + 0.05], [s.cageRear + 0.04, 1.9, s.cageSide - 0.05]),
  ] + bothSides([
    box('post_front', 'bar', [s.cageFront - 0.06, s.floor, s.cageSide - 0.05], [s.cageFront, s.roof, s.cageSide]),
    box('post_rear', 'bar', [s.cageRear, s.floor, s.cageSide - 0.05], [s.cageRear + 0.06, s.roof, s.cageSide]),
    box('side_lower', 'paint', [s.cageRear, s.floor, s.cageSide - 0.04], [s.cageFront, 1.08, s.cageSide]),
    box('mesh_a', 'bar', [s.cageRear, 1.26, s.cageSide - 0.04], [s.cageFront, 1.3, s.cageSide]),
    box('mesh_b', 'bar', [s.cageRear, 1.48, s.cageSide - 0.04], [s.cageFront, 1.52, s.cageSide]),
    box('mesh_c', 'bar', [s.cageRear, 1.7, s.cageSide - 0.04], [s.cageFront, 1.74, s.cageSide]),
  ]), { paint: s.paint, bar: 'paint-charcoal', glass: 'glass-clear' }),
  k.compound('skid_steer_door', 28, [
    box('sill', 'bar', [s.cageFront, s.floor + 0.03, -s.cageSide + 0.04], [s.cageFront + 0.04, s.floor + 0.09, s.cageSide - 0.04]),
    box('head', 'bar', [s.cageFront, s.roof - 0.08, -s.cageSide + 0.04], [s.cageFront + 0.04, s.roof - 0.02, s.cageSide - 0.04]),
    box('stile_near', 'bar', [s.cageFront, s.floor + 0.03, s.cageSide - 0.1], [s.cageFront + 0.04, s.roof - 0.02, s.cageSide - 0.04]),
    box('stile_far', 'bar', [s.cageFront, s.floor + 0.03, -s.cageSide + 0.04], [s.cageFront + 0.04, s.roof - 0.02, -s.cageSide + 0.1]),
    box('glass', 'glass', [s.cageFront + 0.01, s.floor + 0.09, -s.cageSide + 0.1], [s.cageFront + 0.03, s.roof - 0.08, s.cageSide - 0.1]),
  ], { bar: 'paint-charcoal', glass: 'glass-clear' }, {
    hinge_a: ['stile_near', [0.5, 0.1, 1]],
    hinge_b: ['stile_near', [0.5, 0.9, 1]],
  }),
  k.compound('skid_steer_engine_cover', 90, [
    prism('hood', 'paint', [[-1.24, 0.5], [s.cageRear, 0.5], [s.cageRear, 1.42], [-1.1, 1.42], [-1.24, 1.24]], [-0.47, 0.47]),
    box('hood_top_vent', 'trim', [-1.0, 1.42, -0.3], [-0.55, 1.44, 0.3]),
  ], { paint: s.paint, trim: 'paint-charcoal' }),
  k.compound('skid_steer_tail_door', 30, [
    box('panel', 'trim', [-1.28, 0.42, -0.5], [-1.22, 1.22, 0.5]),
    box('grille_a', 'bar', [-1.29, 0.66, -0.36], [-1.28, 0.7, 0.36]),
    box('grille_b', 'bar', [-1.29, 0.78, -0.36], [-1.28, 0.82, 0.36]),
    box('grille_c', 'bar', [-1.29, 0.9, -0.36], [-1.28, 0.94, 0.36]),
  ], { trim: 'paint-charcoal', bar: 'plastic-black' }),
  k.compound('skid_steer_lift_arms', 260, [
    bar('brace', 'paint', [0.7, 1.22], [0.78, 1.32], 0.12, [-0.62, 0.62]),
  ] + bothSides([
    bar('beam_rear', 'paint', [-0.82, 1.74], [0.45, 1.58], 0.2, [0.5, 0.645], 0.17),
    bar('beam_drop', 'paint', [0.45, 1.58], [1.1, 0.8], 0.17, [0.5, 0.645], 0.13),
    m.axleDisc('elbow', 'paint', 0.45, 1.58, 0.085, [0.5, 0.645], 12),
    m.axleDisc('pivot', 'pin', -0.82, 1.74, 0.07, [0.46, 0.66], 12),
    m.axleDisc('tip_pin', 'pin', 1.1, 0.8, 0.06, [0.46, 0.66], 12),
  ]), { paint: s.paint, pin: 'steel-stainless' }),
  k.compound('skid_steer_bucket', 190, [
    bar('floor', 'shell', [1.14, 0.08], [2.0, 0.05], 0.06, [-0.86, 0.86]),
    bar('back', 'shell', [1.14, 0.06], [1.14, 0.74], 0.06, [-0.86, 0.86]),
    bar('top', 'shell', [1.13, 0.72], [1.52, 0.82], 0.06, [-0.86, 0.86]),
    box('edge', 'edge', [1.92, 0.03, -0.86], [2.04, 0.07, 0.86]),
    box('mount', 'edge', [1.08, 0.2, -0.58], [1.14, 0.9, 0.58]),
  ] + bothSides([
    prism('side', 'shell', [[1.11, 0.03], [2.04, 0.03], [1.52, 0.84], [1.11, 0.76]], [0.82, 0.86]),
  ]), { shell: 'paint-charcoal', edge: 'steel-grey' }),
  k.compound('skid_steer_lift_ram', 40, [
    bar('barrel', 'dark', [-0.86, 0.9], [-0.3, 1.28], 0.11, [0.62, 0.71]),
    bar('rod', 'bright', [-0.32, 1.26], [0.06, 1.56], 0.05, [0.64, 0.69]),
    box('lug', 'dark', [-0.02, 1.5, 0.6], [0.1, 1.62, 0.7]),
  ], { dark: 'paint-charcoal', bright: 'steel-stainless' }),
  k.compound('skid_steer_tilt_ram', 22, [
    bar('barrel', 'dark', [0.74, 1.28], [1.0, 1.0], 0.1, [0.14, 0.24]),
    bar('rod', 'bright', [0.98, 1.02], [1.12, 0.82], 0.05, [0.165, 0.215]),
  ], { dark: 'paint-charcoal', bright: 'steel-stainless' }),
  k.compound('skid_steer_exhaust', 4, [
    k.turned('pipe', 'steel', 'y', k.disc(0.035, 0, 0.3)) + { sides: 12 },
  ], { steel: 'steel-spall-black' }),
]
