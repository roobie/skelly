local prism(id, slot, bottom, top, width, depth, chamfer, cx=0, cz=0) = {
  id: id, slot: slot, kind: 'prism', axis: 'y', start: bottom, end: top,
  profile: [[point[0] + cz, point[1] + cx] for point in [
    [-depth / 2 + chamfer, -width / 2], [depth / 2 - chamfer, -width / 2],
    [depth / 2, -width / 2 + chamfer], [depth / 2, width / 2 - chamfer],
    [depth / 2 - chamfer, width / 2], [-depth / 2 + chamfer, width / 2],
    [-depth / 2, width / 2 - chamfer], [-depth / 2, -width / 2 + chamfer],
  ]],
};
local box(id, slot, low, high) = { id: id, slot: slot, kind: 'box', min: low, max: high };
local garment(id, pieces, finish) = {
  id: id, exportMass: 'inventory-atom',
  parts: [{ id: 'garment', family: 'compound', massKg: 0.1,
    params: { pieces: std.manifestJson(pieces) }, finish: finish, ports: [] }],
  connections: [],
};
local jacket = { cloth: 'cloth-shirt-player', trim: 'paint-charcoal', fastener: 'steel-grey' };
local hoodie = { cloth: 'plastic-red', trim: 'paint-charcoal' };
local measures = import 'jacket-measures.libsonnet';
local jacketLevel(id) =
  local d = measures[id];
  prism(id, 'cloth', d.bottom, d.top, d.width, d.depth, d.chamfer);
local hoodieLevel(id) =
  local d = measures[id];
  prism(id, 'cloth', d.bottom, d.top, d.width - 0.02, d.depth - 0.015, d.chamfer + 0.01);
local trousers = { cloth: 'cloth-pants-player', trim: 'paint-charcoal' };
local rubber = { cloth: 'rubber-black', trim: 'paint-charcoal' };
[
  garment('worn_jacket_body', [
    jacketLevel('hem'),
    jacketLevel('waist'),
    jacketLevel('chest'),
    prism('collar', 'trim', 0.6, 0.66, 0.16, 0.16, 0.02),
    box('zip', 'fastener', [-0.006, 0.09, 0.129], [0.006, 0.61, 0.14]),
    box('left-pocket', 'trim', [-0.155, 0.16, 0.12], [-0.04, 0.25, 0.14]),
    box('right-pocket', 'trim', [0.04, 0.16, 0.12], [0.155, 0.25, 0.14]),
  ], jacket),
  garment('worn_jacket_upper', [prism('sleeve', 'cloth', -0.32, 0.025, 0.125, 0.13, 0.02)], jacket),
  garment('worn_jacket_fore', [
    prism('sleeve', 'cloth', -0.24, 0.025, 0.115, 0.125, 0.02),
    prism('cuff', 'trim', -0.255, -0.215, 0.105, 0.115, 0.02),
  ], jacket),
  garment('worn_hoodie_body', [
    hoodieLevel('hem'),
    hoodieLevel('waist'),
    hoodieLevel('chest'),
    prism('hood', 'cloth', 0.34, 0.63, 0.30, 0.10, 0.04, cz=-0.07),
    box('kangaroo-pocket', 'trim', [-0.15, 0.15, 0.12], [0.15, 0.27, 0.14]),
  ], hoodie),
  garment('worn_hoodie_upper', [prism('sleeve', 'cloth', -0.32, 0.025, 0.125, 0.13, 0.03)], hoodie),
  garment('worn_hoodie_fore', [
    prism('sleeve', 'cloth', -0.24, 0.025, 0.115, 0.125, 0.03),
    prism('cuff', 'trim', -0.255, -0.215, 0.105, 0.115, 0.025),
  ], hoodie),
  garment('worn_trousers_pelvis', [
    prism('seat', 'cloth', -0.01, 0.185, 0.355, 0.225, 0.025),
    prism('waistband', 'trim', 0.15, 0.19, 0.36, 0.23, 0.025),
  ], trousers),
  garment('worn_trousers_thigh', [prism('leg', 'cloth', -0.44, 0.025, 0.175, 0.19, 0.02)], trousers),
  garment('worn_trousers_shin', [
    prism('leg', 'cloth', -0.325, 0.025, 0.14, 0.155, 0.02),
    prism('hem', 'trim', -0.325, -0.29, 0.145, 0.16, 0.02),
  ], trousers),
  garment('worn_boot_shaft', [
    prism('shaft', 'cloth', -0.33, 0.025, 0.16, 0.18, 0.02),
    prism('rim', 'trim', -0.02, 0.03, 0.17, 0.19, 0.02),
  ], rubber),
  garment('worn_boot_foot', [
    prism('upper', 'cloth', -0.075, 0.02, 0.13, 0.30, 0.02, cz=0.075),
    box('sole', 'trim', [-0.07, -0.09, -0.08], [0.07, -0.065, 0.23]),
  ], rubber),
]
