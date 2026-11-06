local h = import '../compound.libsonnet';
local box = h.box;
// A convex [x, z] outline as a prism standing on y from y0 to y1.
local slab(id, slot, outline, y0, y1) = h.prism(id, slot, 'y', [[p[1], p[0]] for p in outline], y0, y1);
// A loose cloth or film sheet lying on the floor: `heights` is a grid of rows along z, each a list of heights along x,
// spread evenly over `w` by `d`. Cells whose row and column sum is odd take the `fold` slot, so the creases read.
local sheet(w, d, heights, thickness) =
  local nz = std.length(heights) - 1, nx = std.length(heights[0]) - 1;
  local v(i, j) = j * (nx + 1) + i;
  {
    thickness: thickness,
    vertices: [[-w / 2 + w * i / nx, heights[j][i], -d / 2 + d * j / nz] for j in std.range(0, nz) for i in std.range(0, nx)],
    faces: std.flattenArrays([
      local slot = if (i + j) % 2 == 0 then 'body' else 'fold';
      [
        { indices: [v(i, j), v(i, j + 1), v(i + 1, j)], slot: slot },
        { indices: [v(i + 1, j), v(i, j + 1), v(i + 1, j + 1)], slot: slot },
      ]
      for j in std.range(0, nz - 1)
      for i in std.range(0, nx - 1)
    ]),
  };
local sheetRow(id, massKg, w, d, heights, thickness, finish, grain) =
  h.item(id, 'foldedSheet', massKg, sheet(w, d, heights, thickness), finish) + { voxelGrain: grain };
[
  // A broken lump of cast epoxy about 62 by 50 mm and 32 mm high: a flat moulded base and top with one sloped
  // fracture face, honey-coloured and glassy.
  h.compound('epoxy_chunk', 0.062, [
    slab('base', 'body', [[-0.031, -0.018], [0.012, -0.025], [0.031, -0.006], [0.027, 0.02], [-0.006, 0.025], [-0.03, 0.01]], 0, 0.016),
    slab('mid', 'body', [[-0.026, -0.014], [0.01, -0.021], [0.024, -0.006], [0.02, 0.016], [-0.006, 0.02], [-0.026, 0.008]], 0.016, 0.026),
    slab('top', 'body', [[-0.022, -0.01], [0.004, -0.016], [0.014, -0.004], [0.01, 0.01], [-0.008, 0.014], [-0.022, 0.006]], 0.026, 0.032),
    // A dark seam where a mould edge left a ridge.
    slab('ridge', 'edge', [[-0.031, 0.008], [-0.027, 0.006], [-0.004, 0.023], [-0.007, 0.025]], 0.016, 0.019),
  ], { body: 'resin-honey', edge: 'plastic-amber' }) + { voxelGrain: 0.002 },

  // A 40 mm filter port: a clear threaded housing 45 mm across the flange and 31 mm tall, with a steel retaining ring
  // round the spigot that meets the mask's valve. Front on +z is the same all round.
  h.compound('filter_port_40mm', 0.024, [
    h.turned('body', 'body', 'y', [[0, 0], [0, 0.0225], [0.004, 0.0225], [0.004, 0.019], [0.022, 0.019], [0.022, 0.013], [0.03, 0.013], [0.03, 0]]),
  ] + [
    h.turned('thread-%d' % i, 'thread', 'y', [[0, 0.0185], [0, 0.0208], [0.0016, 0.0208], [0.0016, 0.0185], [0, 0.0185]], [0, 0.0065 + i * 0.0035, 0])
    for i in std.range(0, 3)
  ] + [
    h.turned('ring', 'ring', 'y', [[0, 0.0125], [0, 0.0155], [0.004, 0.0155], [0.004, 0.0125], [0, 0.0125]], [0, 0.022, 0]),
    h.turned('flange-grip', 'thread', 'y', [[0, 0.022], [0, 0.0228], [0.004, 0.0228], [0.004, 0.022], [0, 0.022]], [0, 0, 0]),
    // The open bore, painted flush because compound pieces only add.
    h.disc('bore', 'bore', 0.0085, 0.029, 0.031),
  ], { body: 'plastic-clear', thread: 'plastic-frosted', ring: 'steel-grey', bore: 'paint-charcoal' }) + { voxelGrain: 0.002 },

  // A gas mask's inhalation valve, 35 mm across and 13 mm tall: a black plastic seat with a snap spigot under it and a
  // thin amber rubber flap held down by a centre pin.
  h.compound('inhalation_valve', 0.004, [
    h.turned('seat', 'seat', 'y', [[0, 0.0135], [0, 0.0175], [0.008, 0.0175], [0.008, 0.0135], [0, 0.0135]], [0, 0, 0]),
    h.turned('spigot', 'seat', 'y', [[0, 0.0095], [0, 0.0125], [0.005, 0.0125], [0.005, 0.0095], [0, 0.0095]], [0, -0.005, 0]),
    box('spoke-x', 'seat', [-0.014, 0, -0.0015], [0.014, 0.003, 0.0015]),
    box('spoke-z', 'seat', [-0.0015, 0, -0.014], [0.0015, 0.003, 0.014]),
    h.disc('flap', 'flap', 0.0135, 0.003, 0.005),
    h.disc('pin', 'seat', 0.0035, 0.005, 0.008),
  ], { seat: 'plastic-matte-black', flap: 'rubber-gum' }) + { voxelGrain: 0.002 },

  // A 152 mm square of stretch fabric lying loose, rippled where it was cut from a garment.
  sheetRow('lycra_patch', 0.0047, 0.152, 0.152, [
    [0.001, 0.003, 0.001, 0.004, 0.001],
    [0.004, 0.001, 0.006, 0.002, 0.003],
    [0.001, 0.007, 0.012, 0.006, 0.001],
    [0.003, 0.002, 0.006, 0.001, 0.004],
    [0.001, 0.004, 0.001, 0.003, 0.001],
  ], 0.002, { body: 'lycra-blue', fold: 'lycra-blue' }, 0.002),

  // A 152 mm square of woven synthetic fabric with one corner curled up.
  sheetRow('nylon', 0.0023, 0.152, 0.152, [
    [0.001, 0.002, 0.001, 0.002],
    [0.002, 0.004, 0.003, 0.002],
    [0.001, 0.003, 0.006, 0.008],
    [0.002, 0.002, 0.01, 0.026],
  ], 0.002, { body: 'nylon-red', fold: 'nylon-red' }, 0.002),

  // A panoramic lens: a polycarbonate strip 170 mm long round its curve, 64 mm tall and 3 mm thick, bowed to wrap a
  // face and standing on its lower edge, convex side to the front, with a dark mounting tab at each end.
  h.compound('panoramic_eyepiece', 0.034, h.crescent('lens', 'lens', 0.097, 0.1, -48, 48, 16, 0, 0.064, 0, -0.1) + [
    local s = std.sin(48 * std.pi / 180), c = std.cos(48 * std.pi / 180);
    box('tab-%s' % side[0], 'mount', [side[1] * 0.1 * s - 0.003, 0.024, -0.1 + 0.1 * c - 0.006], [side[1] * 0.1 * s + 0.003, 0.04, -0.1 + 0.1 * c + 0.002])
    for side in [['left', -1], ['right', 1]]
  ], { lens: 'plastic-clear', mount: 'paint-charcoal' }) + { voxelGrain: 0.002 },

  // A grey fragment of a moulded crate wall 75 by 55 mm: a 6 mm plate snapped along two edges, with a stiffening rib
  // and the stub of the corner wall still on it.
  h.compound('plastic_chunk', 0.038, [
    slab('plate-a', 'body', [[-0.0375, -0.0275], [0.02, -0.0275], [0.0375, -0.01], [0.0375, 0.012], [-0.0375, 0.012]], 0, 0.006),
    slab('plate-b', 'body', [[-0.0375, 0.012], [0.03, 0.012], [0.014, 0.0275], [-0.0375, 0.0275]], 0, 0.006),
    box('wall', 'body', [-0.0375, 0, -0.0275], [0.02, 0.026, -0.021]),
    slab('wall-break', 'body', [[0.02, -0.0275], [0.03, -0.0275], [0.03, -0.021], [0.02, -0.021]], 0, 0.014),
    box('rib', 'rib', [-0.004, 0.006, -0.021], [0.0, 0.016, 0.022]),
    box('rib-cross', 'rib', [-0.0375, 0.006, 0.002], [0.026, 0.012, 0.006]),
  ], { body: 'plastic-grey', rib: 'plastic-grey' }) + { voxelGrain: 0.002 },

  // A large sheet of thin polythene folded into a pad 280 by 220 mm and 24 mm thick, its loose end lying across the
  // top.
  h.compound('plastic_sheet', 0.4, h.foldedGarment(0.28, 0.22, 0.024, 4) + [
    slab('tail', 'tail', [[-0.14, 0.04], [0.14, 0.02], [0.14, 0.11], [-0.14, 0.11]], 0.024, 0.026),
    slab('tail-end', 'tail', [[-0.14, 0.11], [0.14, 0.11], [0.12, 0.15], [-0.1, 0.16]], 0.0, 0.002),
  ], { cloth: 'plastic-frosted', tail: 'plastic-frosted' }) + { voxelGrain: 0.004 },

  // A square cut from a black bin bag, about 300 by 240 mm, lying crumpled.
  sheetRow('plastic_sheet_small', 0.01, 0.3, 0.24, [
    [0.002, 0.006, 0.002, 0.008, 0.003],
    [0.008, 0.02, 0.012, 0.024, 0.006],
    [0.003, 0.014, 0.032, 0.016, 0.002],
    [0.002, 0.005, 0.01, 0.004, 0.006],
  ], 0.002, { body: 'plastic-bag', fold: 'plastic-bag' }, 0.004),

  // An offcut of clear polycarbonate 70 by 50 mm and 12 mm thick, with two sawn edges and one corner snapped off.
  h.compound('polycarbonate_chunk', 0.043, [
    slab('body', 'body', [[-0.035, -0.025], [0.02, -0.025], [0.035, -0.006], [0.035, 0.025], [-0.035, 0.025]], 0, 0.012),
    // The fracture face shows frosted where the sawn faces stay clear.
    slab('break', 'break', [[0.019, -0.026], [0.021, -0.026], [0.036, -0.007], [0.036, -0.005]], 0, 0.012),
  ], { body: 'plastic-clear', break: 'plastic-frosted' }) + { voxelGrain: 0.002 },

  // A rigid polycarbonate sheet 1.22 m square and 8 mm thick, still under its frosted protective film, with one
  // corner of the film peeled back.
  h.compound('rigid_plastic_sheet', 13, [
    box('sheet', 'sheet', [-0.61, 0, -0.61], [0.61, 0.008, 0.61]),
    slab('film', 'film', [[-0.61, -0.61], [0.61, -0.61], [0.61, 0.43], [0.43, 0.61], [-0.61, 0.61]], 0.008, 0.012),
    // The peeled corner, folded back over the film along the cut line.
    slab('flap', 'film', [[0.43, 0.61], [0.61, 0.43], [0.43, 0.43]], 0.012, 0.016),
  ], { sheet: 'plastic-clear', film: 'plastic-frosted' }) + { voxelGrain: 0.004 },

  // A melted and cooled blob of off-white thermoplastic, 64 mm across, with a smaller lobe run off one side.
  h.compound('thermo_resin_chunk', 0.042, [
    h.turned('blob', 'body', 'y', [[0, 0], [0, 0.026], [0.006, 0.028], [0.013, 0.025], [0.019, 0.018], [0.022, 0.009], [0.023, 0]]),
    h.turned('lobe', 'body', 'y', [[0, 0], [0, 0.012], [0.005, 0.012], [0.009, 0.008], [0.011, 0]], [0.026, 0, 0.01]),
    h.turned('drip', 'body', 'y', [[0, 0], [0, 0.006], [0.003, 0.006], [0.005, 0]], [-0.024, 0, -0.018]),
  ], { body: 'plastic-white' }) + { voxelGrain: 0.002 },
]
