local lower = 0.4;
local upper = 0.6;
local identity = [1, 0, 0, 0, 1, 0, 0, 0, 1];
{
  units: { metresPerUnit: 1, grid: 0.001, bevel: 0 },
  facets: 12,
  defaultMaterial: 'paint-charcoal',
  items: [{
    id: 'bend_strip',
    exportMass: 'parts',
    voxelGrain: 0.05,
    parts: [{
      id: 'strip', family: 'block', massKg: 1,
      params: { width: '0.2', height: '1', depth: '0.1' },
      finish: { body: 'paint-charcoal' }, ports: [],
    }],
    connections: [],
    skin: {
      joints: [
        { name: 'fixed', rest: { r: identity, t: [0, 0, 0] } },
        { name: 'bend', parent: 'fixed', rest: { r: identity, t: [0, (lower + upper) / 2, 0] } },
      ],
      regions: [
        { kind: 'constant', axis: 1, max: lower, joint: 'fixed' },
        { kind: 'blend', axis: 1, min: lower, max: upper, joints: ['fixed', 'bend'], profile: 'smoothstep' },
        { kind: 'constant', axis: 1, min: upper, joint: 'bend' },
      ],
    },
  }],
}
