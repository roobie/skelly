local compound = (import 'compound.libsonnet').compound;
local box = (import 'compound.libsonnet').box;
local turned = (import 'compound.libsonnet').turned;
local prism = (import 'compound.libsonnet').prism;
local params(values) ={ [key]: std.toString(values[key]) for key in std.objectFields(values) };
local package(id, family, massKg, dimensions, finish, exportMass, heldSolid='body') = {
  id: id,
  exportMass: exportMass,
  parts: [{ id: 'package', family: family, massKg: massKg, params: params(dimensions), finish: finish, ports: [] }],
  connections: [],
  handling: { part: 'package', solid: heldSolid, fraction: [0.5, 0.5, 0.5], turn: [0, 0, -90], hold: 'upright', roll: 0 },
};
local carton(id, massKg, width, height, depth, body, label, exportMass, extra={}, heldSolid='body') = package(id, 'carton', massKg, {
  width: width, height: height, depth: depth, lidHeight: 0.002,
  bandHeight: height * 0.45, bandInset: 0.0003,
  handleHeight: 0, handleWidth: width * 0.6, handleDepth: depth * 0.25, handleWall: 0.006,
} + extra, { body: body, label: label, cap: body }, exportMass, heldSolid);
local vessel(id, massKg, radius, height, body, label, exportMass, extra={}) = package(id, 'vessel', massKg, {
  radius: radius, height: height, shoulderHeight: 0.002, neckRadius: radius,
  neckHeight: 0.001, capRadius: radius + 0.0005, capHeight: 0.001,
  rimHeight: 0.001, bandHeight: height * 0.65, bandInset: 0.0003,
} + extra, { body: body, label: label, cap: 'steel-grey' }, exportMass);
[
  vessel('canned_beans', 0.450, 0.037, 0.11, 'steel-grey', 'paint-terracotta', exportMass='parts'),
  vessel('canned_soup', 0.430, 0.034, 0.12, 'steel-grey', 'paperboard-tan', exportMass='parts'),
  carton('crackers', 0.250, 0.14, 0.20, 0.055, 'paperboard-tan', 'paint-terracotta', exportMass='parts'),
  carton('chocolate_bar', 0.100, 0.15, 0.012, 0.07, 'paperboard-brown', 'paperboard-tan', exportMass='parts', extra={ lidHeight: 0.0005 }),
  vessel('soda_can', 0.360, 0.033, 0.115, 'steel-grey', 'plastic-red', exportMass='inventory-atom', extra={ shoulderHeight: 0.005, neckRadius: 0.029, capRadius: 0.030 }),
  vessel('empty_soda_can', 0.015, 0.033, 0.115, 'steel-grey', 'plastic-red', exportMass='inventory-atom', extra={ shoulderHeight: 0.005, neckRadius: 0.029, capRadius: 0.030 }),
  vessel('water_bottle', 1.050, 0.043, 0.20, 'glass-grey', 'plastic-blue', exportMass='parts', extra={ shoulderHeight: 0.025, neckRadius: 0.014, neckHeight: 0.015, capRadius: 0.016, capHeight: 0.012 }),
  carton('juice_carton', 1.050, 0.075, 0.19, 0.075, 'paperboard-tan', 'plastic-green', exportMass='parts', extra={ lidHeight: 0.015 }),
  carton('cartridge_box_308_h_winchester', 0.520, 0.15, 0.08, 0.035, 'paperboard-brown', 'paperboard-tan', exportMass='parts'),
  carton('cartridge_box_5_d_56x45', 0.280, 0.095, 0.065, 0.04, 'paperboard-tan', 'cord-olive', exportMass='parts'),
  carton('cartridge_box_7_d_62x39', 0.360, 0.11, 0.065, 0.045, 'paperboard-brown', 'cord-olive', exportMass='parts'),
  carton('cartridge_box_357_h_magnum', 0.825, 0.13, 0.055, 0.10, 'paperboard-tan', 'plastic-blue', exportMass='parts'),
  carton('shotshell_box', 0.840, 0.12, 0.075, 0.095, 'paperboard-brown', 'plastic-red', exportMass='parts'),
  carton('ammo_can', 1.600, 0.28, 0.17, 0.14, 'polymer-od-green', 'paperboard-tan', exportMass='parts', extra={ lidHeight: 0.012, bandHeight: 0.035, handleHeight: 0.025, handleWidth: 0.11, handleDepth: 0.018, handleWall: 0.008 }, heldSolid='handle'),
  // A 20 litre pressed-steel can: 345 mm wide, 165 mm deep, 470 mm to the top of its three handles.
  // The welded seam flange, the X pressed into each face and the corner spout are what read as a jerry can.
  local handle(name, x) = [
    box(name, 'handle', [x - 0.009, 0.448, -0.060], [x + 0.009, 0.470, 0.060]),
    box(name + '-front', 'handle', [x - 0.009, 0.425, 0.042], [x + 0.009, 0.448, 0.060]),
    box(name + '-back', 'handle', [x - 0.009, 0.425, -0.060], [x + 0.009, 0.448, -0.042]),
  ];
  local cross(side) = [
    prism('x-rise-' + side, 'body', 'z', [[-0.1282, 0.0208], [0.1518, 0.3808], [0.1282, 0.3992], [-0.1518, 0.0392]], if side == 'front' then 0.0825 else -0.0870, if side == 'front' then 0.0870 else -0.0825),
    prism('x-fall-' + side, 'body', 'z', [[0.1518, 0.0392], [-0.1282, 0.3992], [-0.1518, 0.3808], [0.1282, 0.0208]], if side == 'front' then 0.0825 else -0.0870, if side == 'front' then 0.0870 else -0.0825),
  ];
  compound('jerry_can', 4.000, [
    prism('body', 'body', 'z', [[-0.1525, 0], [0.1525, 0], [0.1725, 0.020], [0.1725, 0.405], [0.1525, 0.425], [-0.1525, 0.425], [-0.1725, 0.405], [-0.1725, 0.020]], -0.0825, 0.0825),
    prism('seam', 'seam', 'z', [[-0.1545, -0.002], [0.1545, -0.002], [0.1765, 0.020], [0.1765, 0.407], [0.1545, 0.429], [-0.1545, 0.429], [-0.1765, 0.407], [-0.1765, 0.020]], -0.003, 0.003),
    turned('spout', 'spout', 'y', [[0, 0], [0, 0.030], [0.012, 0.030], [0.012, 0.021], [0.032, 0.021], [0.032, 0]], [-0.118, 0.425, 0.020]),
    turned('cap', 'cap', 'y', [[0.032, 0], [0.032, 0.026], [0.048, 0.026], [0.052, 0.020], [0.052, 0]], [-0.118, 0.425, 0.020]),
    box('cap-lever', 'cap', [-0.150, 0.468, 0.010], [-0.086, 0.477, 0.030]),
  ] + cross('front') + cross('back') + handle('handle-a', -0.040) + handle('handle-b', 0.040) + handle('handle-c', 0.120),
  { body: 'polymer-od-green', seam: 'polymer-od-green', handle: 'polymer-od-green', spout: 'steel-grey', cap: 'paint-charcoal' }) + {
    handling: { part: 'jerry_can', solid: 'handle-b', fraction: [0.5, 0.5, 0.5], turn: [0, 0, -90], hold: 'upright', roll: 0 },
    voxelGrain: 0.004,
  },
  vessel('gas_canister', 0.350, 0.045, 0.12, 'steel-grey', 'plastic-blue', exportMass='parts', extra={ shoulderHeight: 0.015, neckRadius: 0.012, neckHeight: 0.008, capRadius: 0.014, capHeight: 0.006 }),
]
