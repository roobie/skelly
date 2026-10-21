local params(values) = { [key]: std.toString(values[key]) for key in std.objectFields(values) };
local inventoryItems = (import '../deadvox/src/content/base/items-food.libsonnet').items + (import '../deadvox/src/content/base/items-other.libsonnet').items;
local inventoryMass(id) = std.filter(function(item) item.id == id, inventoryItems)[0].weight / 1000;
local atom(id, family, massKg, dimensions, finish, exportMass='inventory-atom') = {
  id: id,
  exportMass: exportMass,
  parts: [{ id: 'body', family: family, massKg: massKg, params: params(dimensions), finish: finish, ports: [] }],
  connections: [],
  handling: { part: 'body', solid: 'body', fraction: [0.5, 0.5, 0.5], turn: [0, 0, -90], hold: 'upright', roll: 0 },
};
local bottle(id, radius, height, body, label, cap, dimensions={}) = atom(id, 'vessel', inventoryMass(id), {
  radius: radius, height: height, shoulderHeight: 0.008,
  neckRadius: radius * 0.65, neckHeight: 0.008, capRadius: radius * 0.8, capHeight: 0.01,
  rimHeight: 0.001, bandHeight: height * 0.6, bandInset: 0.0003,
} + dimensions, { body: body, label: label, cap: cap });
[
  atom('beans', 'foodPortion', inventoryMass('beans'), { radius: 0.0375, height: 0.004, chunkRadius: 0.003, chunkLength: 0.011, chunks: 27 }, { body: 'paint-terracotta', chunks: 'paperboard-tan' }),
  atom('soup', 'foodPortion', inventoryMass('soup'), { radius: 0.0375, height: 0.009, chunkRadius: 0.002, chunkLength: 0.006, chunks: 7 }, { body: 'paint-terracotta', chunks: 'plastic-green' }),
  atom('apple', 'stemmedFruit', 0.180, { radius: 0.04, height: 0.071, stemRadius: 0.0017, stemHeight: 0.017, leafLength: 0.021, leafWidth: 0.011, leafThickness: 0.0008 }, { body: 'plastic-red', stem: 'wood-walnut', leaf: 'plastic-green' }, exportMass='parts'),
  atom('bandage', 'woundRoll', 0.020, { radius: 0.0375, boreRadius: 0.009, width: 0.045, layers: 8, groove: 0.0007, tailLength: 0.035, tailThickness: 0.0008 }, { body: 'plastic-white', edge: 'paperboard-tan' }, exportMass='parts'),
  bottle('antiseptic', 0.023, 0.074, 'paperboard-brown', 'plastic-white', 'plastic-red'),
  bottle('antibiotics', 0.018, 0.054, 'plastic-white', 'plastic-blue', 'plastic-white', { shoulderHeight: 0.005, neckHeight: 0.005, capRadius: 0.019, capHeight: 0.016 }),
  bottle('painkillers', 0.018, 0.044, 'plastic-white', 'plastic-red', 'plastic-white', { shoulderHeight: 0.005, neckHeight: 0.005, capRadius: 0.019, capHeight: 0.016 }),
  bottle('codeine', 0.018, 0.054, 'paperboard-brown', 'plastic-white', 'plastic-blue', { shoulderHeight: 0.005, neckHeight: 0.005, capRadius: 0.019, capHeight: 0.016 }),
  bottle('morphine', 0.009, 0.051, 'glass-grey', 'plastic-white', 'plastic-blue', { shoulderHeight: 0.012, neckRadius: 0.004, neckHeight: 0.009, capRadius: 0.005, capHeight: 0.008, bandHeight: 0.02 }),
]
