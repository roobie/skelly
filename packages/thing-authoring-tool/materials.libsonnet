local params(values) = { [key]: if std.type(values[key]) == 'array' then std.manifestJson(values[key]) else std.toString(values[key]) for key in std.objectFields(values) };
local atom(id, family, exportMass, massKg, dimensions, finish, solid='body', fraction=[0.5, 0.5, 0.5], turn=[0, 0, 0]) = {
  id: id,
  exportMass: exportMass,
  parts: [{ id: 'material', family: family, massKg: massKg, params: params(dimensions), finish: finish, ports: [] }],
  connections: [],
  handling: { part: 'material', solid: solid, fraction: fraction, turn: turn, hold: 'upright', roll: 0 },
};
[
  atom('aa_battery', 'vessel', 'parts', 0.023, {
    radius: 0.007, height: 0.046, shoulderHeight: 0.0005, neckRadius: 0.003,
    neckHeight: 0.001, capRadius: 0.003, capHeight: 0.002,
    rimHeight: 0.001, bandHeight: 0.034, bandInset: 0.00015,
  }, { body: 'steel-grey', label: 'paint-charcoal', cap: 'steel-stainless' }, turn=[0, 0, -90]),
  atom('rag', 'foldedSheet', 'parts', 0.050, {
    thickness: 0.002,
    vertices: [
      [-0.125, 0.003, -0.07], [-0.018, 0.012, -0.095], [0.10, 0.002, -0.073],
      [-0.11, 0.018, 0.006], [0.005, 0.035, -0.01], [0.125, 0.006, 0.018],
      [-0.083, 0.002, 0.095], [0.025, 0.009, 0.078], [0.105, 0.003, 0.095],
    ],
    faces: [
      { indices: [0, 3, 4], slot: 'body' }, { indices: [0, 4, 1], slot: 'fold' },
      { indices: [1, 4, 2], slot: 'body' }, { indices: [2, 4, 5], slot: 'fold' },
      { indices: [3, 6, 4], slot: 'fold' }, { indices: [6, 7, 4], slot: 'body' },
      { indices: [4, 7, 8], slot: 'fold' }, { indices: [4, 8, 5], slot: 'body' },
    ],
  }, { body: 'cloth-rag', fold: 'cloth-rag-shadow' }, 'fold-4'),
  atom('duct_tape', 'ring', 'parts', 0.150, { outerRadius: 0.05, innerRadius: 0.018, coreRadius: 0.020, height: 0.048 }, { body: 'tape-grey', core: 'paperboard-tan' }, fraction=[0.87, 0.5, 0.5]),
  atom('nails', 'turnedStock', 'parts', 0.005, {
    axis: 'x', profile: [[0, 0], [0.008, 0.0017], [0.067, 0.0017], [0.067, 0.0042], [0.070, 0.0042], [0.070, 0], [0, 0]],
  }, { body: 'steel-grey' }) + {
    // A shank a few millimetres thick needs a fine grain to read as a nail; the item grain draws one square bar.
    voxelGrain: 0.002,
  },
  atom('scrap_metal', 'foldedSheet', 'parts', 0.500, {
    thickness: 0.003,
    vertices: [
      [0, 0.014, 0],
      [-0.125, 0.004, -0.045], [-0.04, 0.008, -0.075], [-0.02, 0.006, -0.035],
      [0.015, 0.006, -0.095], [0.105, 0.003, -0.045], [0.075, 0.018, 0.015],
      [0.125, 0.036, 0.07], [0.025, 0.029, 0.095], [0.005, 0.014, 0.045], [-0.09, 0.004, 0.07],
    ],
    faces: [
      { indices: [0, 1, 2], slot: 'body' }, { indices: [0, 2, 3], slot: 'body' },
      { indices: [0, 3, 4], slot: 'fold' }, { indices: [0, 4, 5], slot: 'body' },
      { indices: [0, 5, 6], slot: 'body' }, { indices: [0, 6, 7], slot: 'fold' },
      { indices: [0, 7, 8], slot: 'body' }, { indices: [0, 8, 9], slot: 'body' },
      { indices: [0, 9, 10], slot: 'fold' }, { indices: [0, 10, 1], slot: 'body' },
    ],
  }, { body: 'scrap-rusted', fold: 'steel-grey' }, 'fold-0'),
  atom('stick', 'turnedStock', 'parts', 0.200, {
    axis: 'x', profile: [[0, 0], [0, 0.009], [0.025, 0.013], [0.11, 0.010], [0.125, 0.016], [0.145, 0.011], [0.27, 0.009], [0.29, 0.012], [0.31, 0.008], [0.395, 0.006], [0.4, 0], [0, 0]],
  }, { body: 'wood-walnut' }),
  atom('wax', 'turnedStock', 'parts', 0.050, {
    axis: 'y', profile: [[0, 0], [0, 0.021], [0.007, 0.030], [0.020, 0.027], [0.029, 0.015], [0.031, 0], [0, 0]],
  }, { body: 'wax-cream' }),
  atom('wooden_plank', 'cutStock', 'parts', 0.500, {
    axis: 'y', start: 0, end: 0.022,
    profile: [[-0.045, -0.40], [0.045, -0.395], [0.045, 0.395], [-0.04, 0.40]],
  }, { body: 'wood-birch' }),
  atom('whetstone', 'cutStock', 'parts', 0.250, {
    axis: 'y', start: 0, end: 0.025,
    profile: [[-0.075, -0.024], [0.075, -0.024], [0.075, 0.024], [-0.075, 0.024]],
  }, { body: 'stone-whet' }),
  atom('field_patch', 'foldedSheet', 'parts', 0.120, {
    thickness: 0.0015,
    vertices: [
      [-0.09, 0.002, -0.06], [-0.09, 0.002, 0.06],
      [-0.02, 0.009, -0.058], [-0.02, 0.009, 0.058],
      [0.02, 0.004, -0.058], [0.02, 0.004, 0.058],
      [0.09, 0.002, -0.055], [0.09, 0.002, 0.055],
    ],
    faces: [
      { indices: [0, 1, 2], slot: 'body' }, { indices: [1, 3, 2], slot: 'body' },
      { indices: [2, 3, 4], slot: 'fold' }, { indices: [3, 5, 4], slot: 'fold' },
      { indices: [4, 5, 6], slot: 'body' }, { indices: [5, 7, 6], slot: 'body' },
    ],
  }, { body: 'steel-grey', fold: 'paint-charcoal' }, 'fold-2'),
]
