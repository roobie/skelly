local h = import '../compound.libsonnet';
// A spherical cap of a ball of radius `r` centred at `c`, `depth` deep, facing `sign` along `axis`, lifted `lift`
// proud of the ball so its colour shows: a volleyball's panel groups.
local cap(id, slot, r, depth, axis, sign, c, lift=0.0015, steps=6) =
  local R = r + lift;
  local pts = [
    local t = R - depth * i / steps;
    [sign * t, std.sqrt(std.max(0, R * R - t * t))]
    for i in std.range(0, steps)
  ];
  h.turned(id, slot, axis, (if sign > 0 then std.reverse([[sign * R, 0]] + pts + [[sign * (R - depth), 0]]) else [[sign * R, 0]] + pts + [[sign * (R - depth), 0]]), c);
// An upright limb, tapering from r0 at y0 to r1 at y1.
local limbY(id, slot, r0, r1, y0, y1, x, z) = h.turned(id, slot, 'y', [[0, 0], [0, r0], [y1 - y0, r1], [y1 - y0, 0]], [x, y0, z]);
// A shop-window figure on a round stand, 1.8 m to the crown, front on +z. With `cradling`, the forearms come
// forward and in across the waist, and the arms carry a talking doll there.
local mannequin(cradling) =
  local skin = 'skin';
  [
    h.disc('stand-base', 'stand', 0.16, 0, 0.015),
    h.disc('stand-pole', 'stand', 0.012, 0.015, 0.89, 0, -0.03),
    // Legs, slightly apart.
    limbY('shin-l', skin, 0.035, 0.05, 0.03, 0.48, -0.09, 0),
    limbY('shin-r', skin, 0.035, 0.05, 0.03, 0.48, 0.09, 0),
    limbY('thigh-l', skin, 0.05, 0.075, 0.48, 0.90, -0.085, 0),
    limbY('thigh-r', skin, 0.05, 0.075, 0.48, 0.90, 0.085, 0),
    h.box('foot-l', skin, [-0.125, 0.015, -0.04], [-0.055, 0.06, 0.15]),
    h.box('foot-r', skin, [0.055, 0.015, -0.04], [0.125, 0.06, 0.15]),
    // Hips, waist and chest as tapered octagonal slabs.
    h.turned('hips', skin, 'y', [[0, 0], [0, 0.165], [0.14, 0.15], [0.14, 0]], [0, 0.88, 0]),
    h.turned('waist', skin, 'y', [[0, 0], [0, 0.145], [0.16, 0.135], [0.30, 0.17], [0.40, 0.16], [0.40, 0]], [0, 1.02, 0]),
    h.box('shoulders', skin, [-0.21, 1.34, -0.07], [0.21, 1.43, 0.07]),
    h.ball('bust-l', skin, 0.06, -0.075, 1.27, 0.09),
    h.ball('bust-r', skin, 0.06, 0.075, 1.27, 0.09),
    limbY('neck', skin, 0.045, 0.04, 1.42, 1.53, 0, 0),
    h.ball('head', skin, 0.095, 0, 1.645, 0.01, 1.3),
    h.box('nose', skin, [-0.012, 1.62, 0.095], [0.012, 1.66, 0.115]),
    // Upper arms hang from the shoulders.
    limbY('upper-arm-l', skin, 0.035, 0.045, 1.10, 1.41, -0.215, 0),
    limbY('upper-arm-r', skin, 0.035, 0.045, 1.10, 1.41, 0.215, 0),
  ] + (
    if cradling then [
      // Forearms slant forward and in from the elbows, as diagonal slabs, so the hands meet under the doll.
      h.prism('forearm-l', skin, 'y', [[-0.03, -0.235], [0.03, -0.195], [0.20, -0.02], [0.14, -0.05]], 1.07, 1.13),
      h.prism('forearm-r', skin, 'y', [[-0.03, 0.235], [0.14, 0.05], [0.20, 0.02], [0.03, 0.195]], 1.07, 1.13),
      h.box('hand-l', skin, [-0.06, 1.06, 0.15], [0.0, 1.13, 0.23]),
      h.box('hand-r', skin, [0.0, 1.06, 0.15], [0.06, 1.13, 0.23]),
    ] else [
      limbY('forearm-l', skin, 0.028, 0.035, 0.84, 1.11, -0.23, 0.01),
      limbY('forearm-r', skin, 0.028, 0.035, 0.84, 1.11, 0.23, 0.01),
      h.box('hand-l', skin, [-0.25, 0.70, -0.01], [-0.21, 0.85, 0.05]),
      h.box('hand-r', skin, [0.21, 0.70, -0.01], [0.25, 0.85, 0.05]),
    ]
  );
// A child's doll 0.32 m tall standing on its feet, front on +z, with a round speaker grille and a press button on
// its chest. `x`, `y`, `z` and `k` place and scale it, so the decoy's mannequin can carry one in its arms.
local doll(x=0, y=0, z=0, k=1) = h.scaled([
  h.box('shoe-l', 'shoe', [-0.045, 0, -0.025], [-0.01, 0.02, 0.035]),
  h.box('shoe-r', 'shoe', [0.01, 0, -0.025], [0.045, 0.02, 0.035]),
  limbY('leg-l', 'flesh', 0.014, 0.017, 0.02, 0.12, -0.028, 0),
  limbY('leg-r', 'flesh', 0.014, 0.017, 0.02, 0.12, 0.028, 0),
  h.turned('dress', 'dress', 'y', [[0, 0], [0, 0.075], [0.02, 0.07], [0.08, 0.045], [0.12, 0.042], [0.12, 0]], [0, 0.10, 0]),
  h.box('collar', 'trim', [-0.035, 0.212, -0.03], [0.035, 0.222, 0.035]),
  h.disc('grille', 'grille', 0.016, 0, 0.004, 0, 0) + { axis: 'z', profile: [[0, 0], [0, 0.016], [0.004, 0.016], [0.004, 0]], origin: [0, 0.18, 0.043] },
  h.disc('button', 'button', 0.006, 0, 0.003, 0, 0) + { axis: 'z', profile: [[0, 0], [0, 0.006], [0.004, 0.006], [0.004, 0]], origin: [0, 0.145, 0.058] },
  limbY('arm-l', 'flesh', 0.012, 0.014, 0.12, 0.215, -0.055, 0.005),
  limbY('arm-r', 'flesh', 0.012, 0.014, 0.12, 0.215, 0.055, 0.005),
  limbY('neck', 'flesh', 0.016, 0.016, 0.215, 0.235, 0, 0),
  h.ball('head', 'flesh', 0.05, 0, 0.27, 0.005),
  h.ball('hair', 'hair', 0.053, 0, 0.285, -0.008, 0.95),
  h.box('eye-l', 'eye', [-0.026, 0.272, 0.046], [-0.012, 0.284, 0.056]),
  h.box('eye-r', 'eye', [0.012, 0.272, 0.046], [0.026, 0.284, 0.056]),
  h.box('mouth', 'mouth', [-0.010, 0.246, 0.046], [0.010, 0.252, 0.054]),
], k);
local dollFinish = { flesh: 'latex-pale', hair: 'leather-chestnut', dress: 'cloth-red', trim: 'lace-white', shoe: 'leather-patent', grille: 'plastic-charcoal', button: 'plastic-yellow', eye: 'gem-blue', mouth: 'paint-red' };
// Moves pieces by [dx, dy, dz], renaming them so they cannot clash with the pieces they join.
local moved(pieces, d) = [
  p + { id: 'doll-' + p.id } + (if p.kind == 'box' then { min: [p.min[0] + d[0], p.min[1] + d[1], p.min[2] + d[2]], max: [p.max[0] + d[0], p.max[1] + d[1], p.max[2] + d[2]] }
       else if std.objectHas(p, 'origin') then { origin: [p.origin[0] + d[0], p.origin[1] + d[1], p.origin[2] + d[2]] }
       else { origin: d })
  for p in pieces
];
[
  // A 42.7 mm golf ball: a white cover with its shallow dimples drawn as grey dots flush with the cover.
  h.compound('golf_ball', 0.043, [
    h.ball('ball', 'cover', 0.0214, 0, 0.0214, 0),
  ] + [
    local a = 2 * std.pi * (i + j / 2) / 10, e = j * 0.55, r = 0.0204;
    h.box('dimple-%d-%d' % [i, j], 'dimple', [r * std.cos(e) * std.sin(a) - 0.001, 0.0214 + r * std.sin(e) - 0.001, r * std.cos(e) * std.cos(a) - 0.001],
          [r * std.cos(e) * std.sin(a) + 0.001, 0.0214 + r * std.sin(e) + 0.001, r * std.cos(e) * std.cos(a) + 0.001])
    for i in std.range(0, 9)
    for j in [-2, -1, 0, 1, 2]
  ], { cover: 'plastic-gloss-white', dimple: 'plastic-grey' }) + { voxelGrain: 0.002 },
  // A 70 mm wooden tee lying along x: a cupped head 11 mm across, a 4 mm shank and a point.
  h.compound('golf_tee', 0.00095, [
    h.turned('tee', 'wood', 'x', [[0, 0], [0, 0.0055], [0.004, 0.0055], [0.010, 0.0022], [0.060, 0.0020], [0.070, 0]], [-0.035, 0.0055, 0]),
  ], { wood: 'wood-birch' }) + { voxelGrain: 0.002 },
  // An indoor volleyball 210 mm across, its 18 panels grouped by colour: blue at the poles, yellow at the sides,
  // white between.
  h.compound('indoor_volleyball', 0.25, [
    h.ball('ball', 'white', 0.105, 0, 0.105, 0),
    cap('cap-top', 'blue', 0.105, 0.035, 'y', 1, [0, 0.105, 0]),
    cap('cap-bottom', 'blue', 0.105, 0.035, 'y', -1, [0, 0.105, 0]),
    cap('cap-right', 'yellow', 0.105, 0.035, 'x', 1, [0, 0.105, 0]),
    cap('cap-left', 'yellow', 0.105, 0.035, 'x', -1, [0, 0.105, 0]),
  ], { white: 'plastic-gloss-white', blue: 'plastic-blue', yellow: 'plastic-yellow' }) + { voxelGrain: 0.004 },
  // A white shop-window mannequin standing 1.8 m tall on a round steel stand.
  h.compound('mannequin', 14, mannequin(false), { skin: 'plastic-gloss-white', stand: 'steel-grey' }) + { voxelGrain: 0.01 },
  // The same mannequin holding a talking doll at its waist, wired to sound off.
  h.compound('mannequin_decoy', 15, mannequin(true) + moved(doll(k=1), [0, 1.13, 0.19]),
    { skin: 'plastic-gloss-white', stand: 'steel-grey' } + dollFinish) + { voxelGrain: 0.01 },
  // A 76 mm by 25 mm vulcanised rubber puck with a grey printed disc on its face.
  h.compound('puck', 0.13, [
    h.disc('puck', 'rubber', 0.038, 0, 0.0254),
    h.disc('print', 'print', 0.02, 0.0254, 0.0262),
  ], { rubber: 'rubber-black', print: 'plastic-grey' }) + { voxelGrain: 0.002 },
  // A nylon shuttlecock 90 mm tall standing on its cork base: a 25 mm domed cork and a 66 mm flared skirt.
  h.compound('shuttlecock', 0.0092, [
    h.turned('cork', 'cork', 'y', [[0, 0], [0, 0.007], [0.004, 0.0115], [0.010, 0.0125], [0.020, 0.0125], [0.020, 0]]),
    h.turned('band', 'band', 'y', [[0, 0], [0, 0.0128], [0.006, 0.0128], [0.006, 0]], [0, 0.014, 0]),
    h.turned('skirt', 'skirt', 'y', [[0, 0.009], [0, 0.0115], [0.070, 0.033], [0.070, 0.030], [0, 0.009]], [0, 0.020, 0]),
    h.turned('ring-a', 'ring', 'y', [[0, 0.016], [0, 0.0175], [0.003, 0.0185], [0.003, 0.017], [0, 0.016]], [0, 0.040, 0]),
    h.turned('ring-b', 'ring', 'y', [[0, 0.020], [0, 0.0215], [0.003, 0.0225], [0.003, 0.021], [0, 0.020]], [0, 0.052, 0]),
  ], { cork: 'cork', band: 'leather-white', skirt: 'plastic-gloss-white', ring: 'plastic-blue' }) + { voxelGrain: 0.002 },
  // A 370 mm by 250 mm foam kickboard, 35 mm thick, with a rounded nose at +z and two hand slots near it.
  h.compound('swimming_kickboard', 0.13, [
    h.prism('board', 'foam', 'y', [
      [-0.185, -0.125], [-0.185, 0.125], [0.10, 0.125], [0.145, 0.11], [0.175, 0.07], [0.185, 0.025], [0.185, -0.025], [0.175, -0.07], [0.145, -0.11], [0.10, -0.125],
    ], 0, 0.035),
    h.box('slot-l', 'slot', [-0.085, -0.0005, 0.08], [-0.035, 0.0355, 0.13]),
    h.box('slot-r', 'slot', [0.035, -0.0005, 0.08], [0.085, 0.0355, 0.13]),
    h.box('stripe', 'stripe', [-0.11, 0.035, -0.17], [0.11, 0.037, -0.15]),
  ], { foam: 'foam-orange', slot: 'plastic-charcoal', stripe: 'plastic-white' }) + { voxelGrain: 0.004 },
  // A 320 mm talking doll in a red dress, a speaker grille and press button on its chest.
  h.compound('talking_doll', 0.48, doll(), dollFinish) + { voxelGrain: 0.004 },
]
