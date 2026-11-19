// Fixed sanitary, kitchen and heating fittings any building can stand, so a house reads as a home rather than a
// shell. Box shapes until thing-tool models replace them; off-white boxes read as porcelain and enamel.
local shape = import 'tools/jsonnet/lib/furniture-shape.libsonnet';
local breach = import 'tools/jsonnet/lib/furniture-breach.libsonnet';
local detail = import 'tools/jsonnet/lib/door-detail.libsonnet';
local box(position, size) = { position: position, size: size };
local porcelain = '#deddd3';
local basin = [
  box([0.15, 0, 0.3], [0.35, 1.4, 0.5]),
  box([1.5, 0, 0.3], [0.35, 1.4, 0.5]),
  box([0.1, 1.3, 0.15], [1.8, 0.12, 0.75]),
  box([0, 1.4, 0.1], [0.15, 0.25, 0.8]),
  box([1.85, 1.4, 0.1], [0.15, 0.25, 0.8]),
  box([0, 1.4, 0.1], [2, 0.25, 0.12]),
  box([0, 1.4, 0.78], [2, 0.25, 0.12]),
  box([0.9, 1.65, 0.75], [0.12, 0.3, 0.12]),
  box([0.9, 1.83, 0.45], [0.12, 0.12, 0.42]),
];
local toilet = [
  box([0.45, 0, 0.5], [1.1, 0.2, 1.2]),
  box([0.7, 0.2, 0.7], [0.6, 0.65, 0.7]),
  box([0.25, 0.85, 0.25], [0.3, 0.3, 1.35]),
  box([1.45, 0.85, 0.25], [0.3, 0.3, 1.35]),
  box([0.25, 0.85, 0.25], [1.5, 0.3, 0.3]),
  box([0.25, 0.85, 1.3], [1.5, 0.3, 0.3]),
  box([0.3, 0.5, 1.6], [1.4, 1.35, 0.35]),
  box([0.2, 1.85, 1.55], [1.6, 0.15, 0.45]),
];
local chrome = '#a9aeab';
local fins = [
  box([0.15 + 0.35 * fin, 0.4, 0.55], [0.2, 1.1, 0.06]) + { color: '#cfccc1' }
  for fin in std.range(0, 4)
];
breach.breaking(shape.colliding({
  furniture: [
    { id: 'toilet', name: 'Toilet', size: [2, 2, 2], color: porcelain, shape: toilet },
    { id: 'steel_toilet', name: 'Steel toilet', size: [2, 2, 2], color: '#8b9494', shape: toilet },
    { id: 'washbasin', name: 'Washbasin', size: [2, 2, 1], color: porcelain, shape: basin },
    { id: 'utility_sink', name: 'Utility sink', size: [2, 2, 1], color: '#8b9494', shape: basin },
    { id: 'kitchen_sink', name: 'Kitchen sink', size: [2, 2, 1], color: '#b0b7b3', shape: basin },
    {
      // Enamelled cast iron, so it breaks as metal.
      id: 'bathtub', name: 'Bathtub', size: [4, 2, 2], color: porcelain, material: 'steel',
      shape: [
        box([0.2, 0, 0.2], [3.6, 0.35, 1.6]),
        box([0.2, 0.35, 0.2], [3.6, 0.75, 0.15]),
        box([0.2, 0.35, 1.65], [3.6, 0.75, 0.15]),
        box([0.2, 0.35, 0.35], [0.2, 0.75, 1.3]),
        box([3.6, 0.35, 0.35], [0.2, 0.75, 1.3]),
        box([0.4, 0.35, 0.35], [3.2, 0.02, 1.3]) + { color: '#c9c8bd' },
        box([3.3, 1.1, 1.6], [0.15, 0.3, 0.15]) + { color: chrome },
        box([3.3, 1.3, 1.25], [0.15, 0.1, 0.35]) + { color: chrome },
      ],
    },
    {
      id: 'shower_tray', name: 'Shower', size: [2, 4, 2], color: porcelain,
      shape: [
        box([0.1, 0, 0.1], [1.8, 0.2, 1.8]),
        box([0.95, 0.2, 1.85], [0.1, 3.3, 0.1]) + { color: chrome },
        box([0.8, 2.2, 1.8], [0.4, 0.15, 0.15]) + { color: chrome },
        box([0.95, 3.4, 1.4], [0.1, 0.1, 0.5]) + { color: chrome },
        box([0.8, 3.3, 1.2], [0.4, 0.1, 0.4]) + { color: chrome },
      ],
    },
    {
      id: 'privy_seat', name: 'Privy seat', size: [2, 2, 2], color: '#8a7559',
      shape: [
        box([0, 0, 0.5], [2, 0.9, 0.1]),
        box([0, 0, 0.6], [0.1, 0.9, 1.4]),
        box([1.9, 0, 0.6], [0.1, 0.9, 1.4]),
        box([0.1, 0.5, 0.85], [1.8, 0.05, 0.6]) + { color: '#2a241d' },
        box([0, 0.9, 0.5], [0.6, 0.1, 1.5]),
        box([1.4, 0.9, 0.5], [0.6, 0.1, 1.5]),
        box([0.6, 0.9, 0.5], [0.8, 0.1, 0.35]),
        box([0.6, 0.9, 1.45], [0.8, 0.1, 0.55]),
        box([0.55, 1.0, 1.85], [0.9, 0.8, 0.1]) + { color: '#7a6750' },
      ],
    },
    {
      id: 'bathroom_cabinet', name: 'Bathroom cabinet', size: [1, 1, 1], color: '#e6e4dc',
      mount: 'wall', solid: false,
      shape: [box([0, 0, 0.7], [1, 1, 0.3])],
      container: { pockets: [{ grid: [4, 4], handlingSimSeconds: 0.8 }] },
    },
    {
      id: 'kitchen_table', name: 'Kitchen table', size: [3, 2, 2], color: '#a7814f',
      shape: [
        box([0, 1.4, 0], [3, 0.1, 2]),
        box([0.2, 1.2, 0.2], [2.6, 0.2, 1.6]),
        box([0.15, 0, 0.15], [0.15, 1.4, 0.15]),
        box([2.7, 0, 0.15], [0.15, 1.4, 0.15]),
        box([0.15, 0, 1.7], [0.15, 1.4, 0.15]),
        box([2.7, 0, 1.7], [0.15, 1.4, 0.15]),
      ],
    },
    {
      id: 'panel_radiator', name: 'Radiator', size: [2, 2, 1], color: '#e4e1d6', material: 'steel',
      shape: [
        box([0.05, 0.35, 0.6], [1.9, 1.2, 0.25]),
        box([0.3, 0, 0.7], [0.1, 0.35, 0.1]),
        box([1.6, 0, 0.7], [0.1, 0.35, 0.1]),
        box([0, 0.35, 0.65], [0.05, 0.15, 0.15]) + { color: chrome },
      ] + fins,
    },
    {
      id: 'solid_fuel_boiler', name: 'Solid-fuel boiler', size: [3, 6, 2], color: '#535b58',
      shape: [
        box([0.2, 0, 0.2], [0.4, 0.3, 1.6]),
        box([2.4, 0, 0.2], [0.4, 0.3, 1.6]),
        box([0.15, 0.3, 0.3], [2.7, 2.5, 1.5]),
        box([0.3, 2.8, 0.45], [2.4, 0.2, 1.2]),
        box([0.5, 0.7, 0.2], [2, 1.5, 0.1]),
        box([0.65, 0.85, 0.1], [1.7, 1.2, 0.1]),
        box([1.9, 1.3, 0], [0.3, 0.18, 0.15]),
        box([1.2, 3, 1.1], [0.6, 3, 0.6]),
      ],
    },
    {
      id: 'coal_bin', name: 'Coal bin', size: [3, 2, 2], color: '#383d3b',
      shape: [
        box([0, 0, 0], [3, 0.15, 2]),
        box([0, 0.15, 0], [0.15, 1.5, 2]),
        box([2.85, 0.15, 0], [0.15, 1.5, 2]),
        box([0.15, 0.15, 0], [2.7, 0.65, 0.15]),
        box([0.15, 0.15, 1.85], [2.7, 1.5, 0.15]),
        box([0.2, 0.15, 0.2], [2.6, 0.6, 1.6]),
        box([0.4, 0.75, 0.5], [0.7, 0.45, 0.6]),
        box([1, 0.75, 0.8], [0.8, 0.65, 0.8]),
        box([1.8, 0.75, 0.3], [0.8, 0.4, 0.8]),
      ],
    },
    {
      id: 'coal_hatch', name: 'Coal delivery hatch', size: [2, 2, 1], color: '#596562', material: 'steel',
      breach: { minimumStrength: 9, durability: 300 },
      door: {
        methods: {}, handlingSimSeconds: 0.6,
        detail: detail.flush + {
          hinges: { count: 2, length: 0.18, width: 0.05 },
          handle: { kind: 'pull', fromFreeEdge: 0.1, along: 0.5, length: 0.15, thickness: 0.025 },
        },
      },
    },
    {
      id: 'cooker', name: 'Cooker', size: [2, 2, 1], color: '#b7b9ae',
      shape: [
        box([0.1, 0, 0.1], [1.8, 1.7, 0.9]),
        box([0, 1.7, 0], [2, 0.1, 1]),
        box([0.2, 1.8, 0.15], [0.55, 0.07, 0.25]),
        box([1.25, 1.8, 0.15], [0.55, 0.07, 0.25]),
        box([0.2, 1.8, 0.6], [0.55, 0.07, 0.25]),
        box([1.25, 1.8, 0.6], [0.55, 0.07, 0.25]),
        box([0.2, 1.45, 0], [0.15, 0.15, 0.1]),
        box([0.65, 1.45, 0], [0.15, 0.15, 0.1]),
        box([1.1, 1.45, 0], [0.15, 0.15, 0.1]),
        box([1.55, 1.45, 0], [0.15, 0.15, 0.1]),
        box([0.3, 1.1, 0], [1.4, 0.1, 0.1]),
      ],
    },
  ],
}))
