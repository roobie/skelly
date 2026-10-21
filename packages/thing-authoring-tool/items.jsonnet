local params(values) = { [key]: std.toString(values[key]) for key in std.objectFields(values) };
local part(id, family, massKg, dimensions, finish, ports=[]) = { id: id, family: family, massKg: massKg, params: params(dimensions), finish: finish, ports: ports };
local atom(id, family, massKg, dimensions, finish) = { id: id, exportMass: 'parts', parts: [part(id, family, massKg, dimensions, finish)], connections: [] };
{
  units: { metresPerUnit: 1, grid: 0.001, bevel: 0 },
  facets: 48,
  defaultMaterial: 'paint-charcoal',
  items: (import 'packages.libsonnet') + (import 'cans.libsonnet').items + (import 'food-medical.libsonnet') + (import 'lights.libsonnet') + [
    atom('electrical_tape', 'ring', 0.030, { outerRadius: 0.04, innerRadius: 0.012, coreRadius: 0.016, height: 0.021 }, { body: 'paint-terracotta', core: 'paperboard-tan' }),
    atom('sewing_thread', 'spool', 0.015, { outerRadius: 0.027, coreRadius: 0.018, windingRadius: 0.026, height: 0.05, flangeHeight: 0.008, flangeInset: 0.004, windings: 5, grooveDepth: 0.0015 }, { core: 'paperboard-tan', winding: 'paint-terracotta' }),
    atom('nylon_cord', 'coil', 0.060, { radius: 0.029, tubeRadius: 0.0035, turns: 4, pitch: 0.006 }, { body: 'cord-olive' }),
    atom('fuse', 'fuse', 0.010, { radius: 0.009, capRadius: 0.011, length: 0.07, capLength: 0.008 }, { body: 'glass-grey', cap: 'steel-grey' }),
  ],
}
