local params(values) = { [key]: std.toString(values[key]) for key in std.objectFields(values) };
local bags = import 'bag-measures.libsonnet';
local atom(id, family, massKg, dimensions, finish, solid='body') = {
  id: id,
  exportMass: 'parts',
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
  atom('fanny_pack', 'bag', 0.200, bags.fanny_pack, bags.finish.fanny_pack),
  atom('school_backpack', 'bag', 0.600, bags.school_backpack, bags.finish.school_backpack, 'handle'),
  atom('hiking_backpack', 'bag', 1.400, bags.hiking_backpack, bags.finish.hiking_backpack, 'handle'),
  // A fitted chamfered crown clears the bust's square hair corners without an oversized circular cap.
  atom('baseball_cap', 'cap', 0.080, {
    width: 0.204, depth: 0.244, height: 0.08, chamfer: 0.04,
    brimDepth: 0.09, brimWidth: 0.19, brimThickness: 0.01, brimHeight: 0.014,
  }, { body: 'plastic-blue', trim: 'paint-charcoal' }) + { voxelGrain: 0.004 },
]
