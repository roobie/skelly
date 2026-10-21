local params(values) = { [key]: std.toString(values[key]) for key in std.objectFields(values) };
local package(id, family, massKg, dimensions, finish, heldSolid='body') = {
  id: id,
  exportMass: 'parts',
  parts: [{ id: 'package', family: family, massKg: massKg, params: params(dimensions), finish: finish, ports: [] }],
  connections: [],
  handling: { part: 'package', solid: heldSolid, fraction: [0.5, 0.5, 0.5], turn: [0, 0, -90], hold: 'upright', roll: 0 },
};
local carton(id, massKg, width, height, depth, body, label, extra={}, heldSolid='body') = package(id, 'carton', massKg, {
  width: width, height: height, depth: depth, lidHeight: 0.002,
  bandHeight: height * 0.45, bandInset: 0.0003,
  handleHeight: 0, handleWidth: width * 0.6, handleDepth: depth * 0.25, handleWall: 0.006,
} + extra, { body: body, label: label, cap: body }, heldSolid);
local vessel(id, massKg, radius, height, body, label, extra={}) = package(id, 'vessel', massKg, {
  radius: radius, height: height, shoulderHeight: 0.002, neckRadius: radius,
  neckHeight: 0.001, capRadius: radius + 0.0005, capHeight: 0.001,
  rimHeight: 0.001, bandHeight: height * 0.65, bandInset: 0.0003,
} + extra, { body: body, label: label, cap: 'steel-grey' });
[
  vessel('canned_beans', 0.450, 0.037, 0.11, 'steel-grey', 'paint-terracotta'),
  vessel('canned_soup', 0.430, 0.034, 0.12, 'steel-grey', 'paperboard-tan'),
  carton('crackers', 0.250, 0.14, 0.20, 0.055, 'paperboard-tan', 'paint-terracotta'),
  carton('chocolate_bar', 0.100, 0.15, 0.012, 0.07, 'paperboard-brown', 'paperboard-tan', { lidHeight: 0.0005 }),
  vessel('soda_can', 0.360, 0.033, 0.115, 'steel-grey', 'plastic-red', { shoulderHeight: 0.005, neckRadius: 0.029, capRadius: 0.030 }),
  vessel('water_bottle', 1.050, 0.043, 0.20, 'glass-grey', 'plastic-blue', { shoulderHeight: 0.025, neckRadius: 0.014, neckHeight: 0.015, capRadius: 0.016, capHeight: 0.012 }),
  carton('juice_carton', 1.050, 0.075, 0.19, 0.075, 'paperboard-tan', 'plastic-green', { lidHeight: 0.015 }),
  carton('cartridge_box_308_h_winchester', 0.520, 0.15, 0.08, 0.035, 'paperboard-brown', 'paperboard-tan'),
  carton('cartridge_box_5_d_56x45', 0.280, 0.095, 0.065, 0.04, 'paperboard-tan', 'cord-olive'),
  carton('cartridge_box_7_d_62x39', 0.360, 0.11, 0.065, 0.045, 'paperboard-brown', 'cord-olive'),
  carton('cartridge_box_357_h_magnum', 0.825, 0.13, 0.055, 0.10, 'paperboard-tan', 'plastic-blue'),
  carton('shotshell_box', 0.840, 0.12, 0.075, 0.095, 'paperboard-brown', 'plastic-red'),
  carton('ammo_can', 1.600, 0.28, 0.17, 0.14, 'polymer-od-green', 'paperboard-tan', { lidHeight: 0.012, bandHeight: 0.035, handleHeight: 0.025, handleWidth: 0.11, handleDepth: 0.018, handleWall: 0.008 }, 'handle'),
  carton('jerry_can', 2.500, 0.30, 0.40, 0.15, 'polymer-od-green', 'paint-charcoal', { lidHeight: 0.025, bandHeight: 0.04, handleHeight: 0.045, handleWidth: 0.18, handleDepth: 0.025, handleWall: 0.012 }, 'handle'),
  vessel('gas_canister', 0.350, 0.045, 0.12, 'steel-grey', 'plastic-blue', { shoulderHeight: 0.015, neckRadius: 0.012, neckHeight: 0.008, capRadius: 0.014, capHeight: 0.006 }),
]
