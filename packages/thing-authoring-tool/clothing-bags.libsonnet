local params(values) = { [key]: std.toString(values[key]) for key in std.objectFields(values) };
local atom(id, family, massKg, dimensions, finish, solid='body') = {
  id: id,
  parts: [{ id: id, family: family, massKg: massKg, params: params(dimensions), finish: finish, ports: [] }],
  connections: [],
  handling: { part: id, solid: solid, fraction: [0.5, 0.5, 0.5], turn: [0, 0, -90], hold: 'upright', roll: 0 },
};
local garment(id, massKg, style, body, trim, dimensions) = atom(
  id,
  'folded-garment',
  massKg,
  { style: style } + dimensions,
  { body: body, trim: trim },
);
[
  garment('jeans', 0.700, 'pants', 'plastic-blue', 'paint-charcoal', {
    width: 0.38, height: 0.045, depth: 0.44, sleeveLength: 0, hoodDepth: 0, pocketDepth: 0, cargoDepth: 0, legGap: 0.025,
  }),
  atom('rubber_boots', 'boots', 1.800, { width: 0.28, height: 0.22, depth: 0.34, gap: 0.025 }, { body: 'paint-charcoal', trim: 'steel-grey' }, 'shaft--1'),
  garment('cargo_pants', 0.800, 'pants', 'cord-olive', 'paint-charcoal', {
    width: 0.40, height: 0.05, depth: 0.46, sleeveLength: 0, hoodDepth: 0, pocketDepth: 0, cargoDepth: 0.035, legGap: 0.025,
  }),
  garment('hoodie', 0.600, 'top', 'plastic-red', 'paint-charcoal', {
    width: 0.42, height: 0.06, depth: 0.34, sleeveLength: 0.16, hoodDepth: 0.13, pocketDepth: 0.025, cargoDepth: 0, legGap: 0,
  }),
  garment('jacket', 1.200, 'top', 'paperboard-brown', 'paint-charcoal', {
    width: 0.44, height: 0.07, depth: 0.36, sleeveLength: 0.17, hoodDepth: 0, pocketDepth: 0.03, cargoDepth: 0, legGap: 0,
  }),
  garment('utility_vest', 0.900, 'vest', 'polymer-od-green', 'paint-charcoal', {
    width: 0.38, height: 0.06, depth: 0.30, sleeveLength: 0, hoodDepth: 0, pocketDepth: 0.035, cargoDepth: 0, legGap: 0,
  }),
  atom('fanny_pack', 'bag', 0.200, {
    width: 0.32, height: 0.14, depth: 0.10, pocketHeight: 0.075, pocketDepth: 0.025, flapHeight: 0, strapWidth: 0.018, handleHeight: 0,
  }, { body: 'plastic-blue', trim: 'paint-charcoal' }),
  atom('school_backpack', 'bag', 0.600, {
    width: 0.34, height: 0.46, depth: 0.17, pocketHeight: 0.15, pocketDepth: 0.035, flapHeight: 0, strapWidth: 0.025, handleHeight: 0.04,
  }, { body: 'plastic-red', trim: 'paint-charcoal' }, 'handle'),
  atom('hiking_backpack', 'bag', 1.400, {
    width: 0.40, height: 0.58, depth: 0.24, pocketHeight: 0.18, pocketDepth: 0.05, flapHeight: 0.12, strapWidth: 0.03, handleHeight: 0.05,
  }, { body: 'cord-olive', trim: 'paint-charcoal' }, 'handle'),
  atom('baseball_cap', 'cap', 0.080, { radius: 0.10, height: 0.08, brimDepth: 0.09, brimWidth: 0.19 }, { body: 'plastic-blue', trim: 'paint-charcoal' }),
]
