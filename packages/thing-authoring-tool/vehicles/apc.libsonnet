local k = import 'kit.libsonnet';
local s = import 'apc.spec.libsonnet';
local box = k.box;
local prism = k.prism;
local bothSides = k.bothSides;
// A prism along x has the (y, z) profile.
local xPrism(id, slot, profile, x) = { id: id, kind: 'prism', slot: slot, axis: 'x', profile: profile, start: x[0], end: x[1] };
local paint = { paint: s.paint };
local axle(id, massKg, finish) = k.compound(id, massKg, [
  box('beam', 'steel', [-0.06, -0.06, -1.02], [0.06, 0.06, 1.02]),
  box('diff', 'steel', [-0.2, -0.16, -0.2], [0.2, 0.08, 0.2]),
] + bothSides([
  box('link', 'steel', [-0.05, 0.06, 0.68], [0.05, 0.28, 0.8]),
  k.turned('hub', 'hub', 'z', k.disc(0.15, 0.9, 1.02)),
]), { steel: 'steel-parkerized', hub: 'steel-grey' } + finish);
local louvre(i) = box('louvre_' + i, 'grille', [1.22 + i * 0.16, 2.44, 0.12], [1.32 + i * 0.16, 2.46, 1.08]);
[
  k.compound('apc_hull_belly', 4500, [
    xPrism('v_hull', 'paint', [[s.belly, -0.55], [0.8, -s.wall], [s.floor, -s.wall], [s.floor, s.wall], [0.8, s.wall], [s.belly, 0.55]], [s.rear, 2.81]),
    box('deck', 'floor', [s.rear, s.floor, -0.88], [2.81, s.floor + 0.02, 0.88]),
  ] + bothSides([
    box('lower_wall', 'paint', [s.rear, s.floor, 0.88], [2.81, s.shelf, s.wall]),
  ]), paint + { floor: 'steel-grey' }),
  k.compound('apc_hull_side', 1700, [
    box('shelf', 'paint', [s.rear, s.shelf, 0.88], [2.5, s.shelf + 0.06, s.side]),
    xPrism('wall', 'paint', [[s.shelf, 1.25], [s.roof, 1.18], [s.roof, s.sideTop], [s.shelf, s.side]], [s.rear, 2.5]),
    prism('cheek', 'paint', [[2.5, 1.19], [3.2, 1.19], [3.2, 1.77], [2.56, 2.41], [2.5, 2.41]], [1.25, s.side]),
  ], paint),
  k.compound('apc_hull_nose', 1200, [
    box('floor', 'paint', [2.81, s.belly, -1.25], [3.02, s.belly + 0.06, 1.25]),
    prism('lower_glacis', 'paint', [[3.0, s.belly], [s.nose, 0.97], [3.44, 1.0], [2.96, 0.66]], [-1.25, 1.25]),
    box('nose_plate', 'paint', [3.44, 0.97, -1.25], [s.nose, 1.47, 1.25]),
    prism('upper_glacis', 'paint', [[s.nose, 1.47], [2.56, s.roofTop], [2.5, 2.35], [3.44, 1.41]], [-1.25, 1.25]),
    box('tow_eye_bar', 'steel', [s.nose, 0.97, -0.75], [s.nose + 0.05, 1.03, 0.75]),
  ] + bothSides([
    prism('cheek', 'paint', [[2.81, s.belly], [3.0, s.belly], [s.nose, 0.97], [s.nose, 1.47], [2.56, s.roofTop], [2.5, s.roofTop], [2.5, 1.19]], [1.19, 1.25]),
    box('tow_eye', 'steel', [s.nose, 0.9, 0.62], [s.nose + 0.08, 1.1, 0.72]),
  ]), paint + { steel: 'steel-parkerized' }),
  k.compound('apc_hull_roof', 900, [
    box('plate', 'paint', [s.rear, s.roof, -s.sideTop], [2.56, s.roofTop, s.sideTop]),
  ], paint),
  k.compound('apc_hull_rear', 500, [
    box('sill', 'paint', [s.rear - 0.14, s.belly, -s.wall], [s.rear, 0.81, s.wall]),
    box('header', 'paint', [s.rear - 0.14, 2.19, -s.sideTop], [s.rear, s.roofTop, s.sideTop]),
  ] + bothSides([
    box('post', 'paint', [s.rear - 0.14, 0.81, 0.625], [s.rear, 2.19, 1.25]),
    box('bumper', 'steel', [s.rear - 0.19, 0.72, 0.65], [s.rear - 0.125, 0.81, 1.2]),
  ]), paint + { steel: 'steel-parkerized' }),
  k.compound('apc_ramp', 300, [
    box('plate', 'paint', [s.rear - 0.19, 0.81, -0.62], [s.rear - 0.125, 2.19, 0.62]),
    box('rib_low', 'paint', [s.rear - 0.23, 1.1, -0.5], [s.rear - 0.19, 1.16, 0.5]),
    box('rib_high', 'paint', [s.rear - 0.23, 1.75, -0.5], [s.rear - 0.19, 1.81, 0.5]),
    box('hinge_bar', 'steel', [s.rear - 0.22, 0.81, -0.6], [s.rear - 0.15, 0.87, 0.6]),
    box('handle', 'steel', [s.rear - 0.26, 1.42, -0.12], [s.rear - 0.19, 1.47, 0.12]),
  ], paint + { steel: 'steel-parkerized' }, { hinge_a: ['hinge_bar', [0.5, 0.5, 0]], hinge_b: ['hinge_bar', [0.5, 0.5, 1]] }),
  // Hangs on a rear post beside the ramp, outside the troop cabin: the origin is on the post's rear face, +x into the hull.
  k.compound('apc_fuel_tank', 70, [
    box('tank', 'paint', [-0.24, 0, -0.26], [0, 0.78, 0.26]),
    box('strap_low', 'steel', [-0.26, 0.14, -0.27], [-0.24, 0.2, 0.27]),
    box('strap_high', 'steel', [-0.26, 0.58, -0.27], [-0.24, 0.64, 0.27]),
    box('filler', 'steel', [-0.16, 0.78, -0.06], [-0.06, 0.84, 0.06]),
  ], paint + { steel: 'steel-parkerized' }),
  k.compound('apc_applique', 50, [
    box('plate', 'paint', [-0.54, 0, -0.08], [0.54, 0.72, 0.05]),
    box('rim_top', 'steel', [-0.5, 0.66, 0.05], [0.5, 0.7, 0.07]),
    box('rim_low', 'steel', [-0.5, 0.02, 0.05], [0.5, 0.06, 0.07]),
  ], paint + { steel: 'steel-parkerized' }),
  axle('apc_axle_steered', 320, {}),
  axle('apc_axle_driven', 300, {}),
  k.compound('apc_stowage_bin', 40, [
    box('bin', 'paint', [-0.31, 0.625, s.wall], [0.44, s.shelf, s.side]),
    box('lid_edge', 'steel', [-0.34, 1.12, s.side], [0.47, 1.16, s.side + 0.02]),
    box('hasp', 'steel', [0.04, 0.95, s.side], [0.1, 1.12, s.side + 0.03]),
  ], paint + { steel: 'steel-parkerized' }),
  k.compound('apc_turret_ring', 150, [
    k.turned('ring', 'steel', 'y', k.annulus(0.6, 0.85, 0, 0.1)) + { sides: 24 },
  ], { steel: 'steel-parkerized' }),
  k.compound('apc_turret', 1200, [
    k.turned('body', 'paint', 'y', [[0, 0], [0, 0.76], [0.3, 0.62], [0.42, 0], [0, 0]]) + { sides: 8 },
    box('mantlet', 'paint', [0.55, 0.04, -0.18], [0.82, 0.3, 0.18]),
    k.turned('barrel', 'steel', 'x', k.disc(0.05, 0.82, 1.65), [0, 0.16, 0]) + { sides: 8 },
    k.turned('muzzle', 'steel', 'x', k.disc(0.075, 1.65, 1.75), [0, 0.16, 0]) + { sides: 8 },
    box('sight', 'glass', [0.3, 0.3, 0.22], [0.5, 0.4, 0.34]),
  ], paint + { steel: 'steel-parkerized', glass: 'glass-grey' }),
  k.compound('apc_cupola', 90, [
    k.turned('ring', 'paint', 'y', k.disc(0.36, 0, 0.14)) + { sides: 12 },
    k.turned('lid', 'paint', 'y', k.disc(0.3, 0.14, 0.2)) + { sides: 12 },
    box('hinge', 'steel', [-0.3, 0.14, -0.1], [-0.24, 0.2, 0.1]),
  ], paint + { steel: 'steel-parkerized' }),
  k.compound('apc_hatch', 35, [
    box('lid', 'paint', [-0.3, 0, -0.3], [0.3, 0.05, 0.3]),
    box('hinge', 'steel', [-0.3, 0.05, -0.26], [-0.25, 0.08, 0.26]),
    box('handle', 'steel', [0.12, 0.05, -0.1], [0.18, 0.09, 0.1]),
  ], paint + { steel: 'steel-parkerized' }),
  k.compound('apc_periscope', 6, [
    box('housing', 'steel', [-0.11, 0, -0.14], [0.11, 0.1, 0.14]),
    box('glass', 'glass', [0.11, 0.02, -0.11], [0.12, 0.08, 0.11]),
  ], { steel: 'steel-parkerized', glass: 'glass-grey' }),
  k.compound('apc_engine_deck', 180, [
    box('frame', 'paint', [1.15, s.roofTop, 0.05], [2.48, 2.44, 1.15]),
    box('exhaust_cowl', 'paint', [0.86, s.roofTop, 0.8], [1.15, 2.53, 1.12]),
    k.turned('exhaust_outlet', 'pipe', 'y', k.disc(0.06, 2.53, 2.65), [1.0, 0, 0.96]) + { sides: 12 },
  ] + [louvre(i) for i in std.range(0, 6)], paint + { grille: 'plastic-black', pipe: 'steel-spall-black' }),
  k.compound('apc_bench', 45, [
    box('seat', 'cloth', [-2.65, 1.25, 0.52], [-0.25, 1.31, 0.88]),
    box('back', 'cloth', [-2.65, 1.31, 0.82], [-0.25, 1.85, 0.88]),
    box('leg_front', 'steel', [-0.35, s.floor, 0.56], [-0.27, 1.25, 0.62]),
    box('leg_rear', 'steel', [-2.62, s.floor, 0.56], [-2.54, 1.25, 0.62]),
  ], { cloth: 'cloth-seat', steel: 'steel-grey' }),
  k.compound('apc_wall_locker', 30, [
    box('locker', 'paint', [-0.2, 1.3, 0.8], [0.65, 2.2, 1.14]),
    box('door_line', 'steel', [0.2, 1.36, 0.78], [0.23, 2.14, 0.8]),
  ], paint + { steel: 'steel-grey' }),
  k.compound('apc_rifle_rack', 12, [
    box('lower_rail', 'steel', [-2.6, 2.0, 0.98], [-0.3, 2.04, 1.1]),
    box('upper_rail', 'steel', [-2.6, 2.2, 0.98], [-0.3, 2.24, 1.1]),
  ], { steel: 'steel-grey' }),
  k.compound('apc_ammo_rack', 60, [
    box('rack', 'steel', [0.0, s.floor, -0.86], [0.8, 1.45, -0.5]),
    box('door', 'paint', [0.05, 0.9, -0.5], [0.75, 1.4, -0.48]),
  ], paint + { steel: 'steel-grey' }),
  k.compound('apc_driver_panel', 25, [
    box('panel', 'dash', [2.15, 1.3, -1.0], [2.3, 1.55, -0.2]),
    box('column', 'steel', [2.05, s.floor, -0.68], [2.15, 1.3, -0.52]),
  ], { dash: 'plastic-black', steel: 'steel-grey' }),
]
