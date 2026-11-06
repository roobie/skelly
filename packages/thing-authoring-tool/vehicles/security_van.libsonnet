local k = import 'kit.libsonnet';
local s = import 'security_van.spec.libsonnet';
local box = k.box;
local van = import 'van-body.libsonnet';
local tail = van.tail(s);
local plate = [s.glassOut - 0.01, s.side];
local pillarY(x) = s.waist + (s.aPost - 0.1 - x) * (s.cabRoof - s.waist) / s.aLean;
local strap(id, x, y) = box(id, 'steel', [x[0], y[0], s.box.side], [x[1], y[1], s.box.side + 0.03]);
van.rows('security_van', s) + [
  // Plates the cab door's glass down to a small port and blanks the quarter light.
  k.compound('security_van_cab_plate', 45, [
    box('below_port', 'plate', [s.bFront, s.waist, plate[0]], [s.cowl - 0.04, 1.56, plate[1]]),
    box('above_port', 'plate', [s.bFront, 1.8, plate[0]], [s.cowl - 0.04, s.windowTop, plate[1]]),
    box('behind_port', 'plate', [s.bFront, 1.56, plate[0]], [0.68, 1.8, plate[1]]),
    k.prism('forward_of_port', 'plate', [[1.0, 1.56], [s.cowl - 0.04, 1.56], [s.cowl - 0.04, pillarY(s.cowl - 0.04)], [s.aPost - 0.1 - (s.windowTop - s.waist) * s.aLean / (s.cabRoof - s.waist), s.windowTop], [1.0, s.windowTop]], plate),
    k.prism('quarter', 'plate', [[s.cowl, s.waist], [s.aPost - 0.1, s.waist], [s.cowl, pillarY(s.cowl)]], plate),
  ], { plate: s.paint }),
  // One rear leaf's hinge straps and locking bar.
  k.compound('security_van_rear_door_bars', 34, [
    box('hinge_' + i, 'steel', [tail - 0.03, [1.1, 1.55, 2.0][i], 0.2], [tail, [1.1, 1.55, 2.0][i] + 0.1, s.box.hatchSide])
    for i in [0, 1, 2]
  ] + [
    box('lock_bar', 'steel', [tail - 0.05, s.box.rearSill + 0.03, 0.08], [tail, s.box.doorTop - 0.03, 0.14]),
  ], { steel: 'steel-grey' }),
  k.compound('security_van_side_door_bars', 26, [
    strap('hinge_low', [-0.62, -0.14], [1.2, 1.3]),
    strap('hinge_mid', [-0.62, -0.14], [1.65, 1.75]),
    strap('hinge_high', [-0.62, -0.14], [2.1, 2.2]),
    strap('lock_bar', [-0.9, -0.84], [0.58, s.box.doorTop - 0.04]),
  ], { steel: 'steel-grey' }),
  k.compound('security_van_cash_chute', 28, [
    box('frame', 'steel', [-2.5, 1.2, s.box.side], [-2.0, 1.66, s.box.side + 0.02]),
    box('flap', 'dark', [-2.42, 1.42, s.box.side + 0.02], [-2.08, 1.58, s.box.side + 0.03]),
    box('lock', 'dark', [-2.3, 1.27, s.box.side + 0.02], [-2.2, 1.35, s.box.side + 0.03]),
  ], { steel: 'steel-grey', dark: 'plastic-black' }),
  k.compound('security_van_roof_hatch', 22, [
    box('hatch', 'steel', [-1.7, s.box.roof, -0.4], [-1.0, s.box.roof + 0.06, 0.4]),
    box('vent', 'dark', [-2.4, s.box.roof, -0.3], [-2.1, s.box.roof + 0.1, 0.3]),
  ], { steel: 'steel-grey', dark: 'plastic-black' }),
]
