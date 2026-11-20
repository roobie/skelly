// Fixed sanitary, kitchen, heating, rainwater, drainage and lighting fittings any building can stand, so a house reads as a
// home rather than a shell. Box shapes until thing-tool models replace them; off-white boxes read as porcelain and enamel.
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
local brick = '#8d4a36';
local mortar = '#b9b2a4';
local galvanized = '#aab4b8';
local bracket = '#7f898c';
// A half-round eaves gutter seen square: a sole and two lips along the piece, its back lip up to the eave.
local gutter = [
  box([0, 0.7, 0.6], [1, 0.05, 0.35]),
  box([0, 0.75, 0.6], [1, 0.2, 0.04]),
  box([0, 0.75, 0.91], [1, 0.25, 0.04]),
];
local fins = [
  box([0.15 + 0.35 * fin, 0.4, 0.55], [0.2, 1.1, 0.06]) + { color: '#cfccc1' }
  for fin in std.range(0, 4)
];
breach.breaking(shape.colliding({
  furniture: [
    { id: 'toilet', name: 'Toilet', size: [2, 2, 2], color: porcelain, shape: toilet, serves: ['toilet'] },
    { id: 'steel_toilet', name: 'Steel toilet', size: [2, 2, 2], color: '#8b9494', shape: toilet, serves: ['toilet'] },
    { id: 'washbasin', name: 'Washbasin', size: [2, 2, 1], color: porcelain, shape: basin, serves: ['washing'] },
    { id: 'utility_sink', name: 'Utility sink', size: [2, 2, 1], color: '#8b9494', shape: basin, serves: ['washing'] },
    { id: 'kitchen_sink', name: 'Kitchen sink', size: [2, 2, 1], color: '#b0b7b3', shape: basin, serves: ['washing'] },
    {
      // Enamelled cast iron, so it breaks as metal.
      id: 'bathtub', name: 'Bathtub', size: [4, 2, 2], color: porcelain, material: 'steel', serves: ['bathing'],
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
      id: 'shower_tray', name: 'Shower', size: [2, 4, 2], color: porcelain, serves: ['bathing'],
      shape: [
        box([0.1, 0, 0.1], [1.8, 0.2, 1.8]),
        box([0.95, 0.2, 1.85], [0.1, 3.3, 0.1]) + { color: chrome },
        box([0.8, 2.2, 1.8], [0.4, 0.15, 0.15]) + { color: chrome },
        box([0.95, 3.4, 1.4], [0.1, 0.1, 0.5]) + { color: chrome },
        box([0.8, 3.3, 1.2], [0.4, 0.1, 0.4]) + { color: chrome },
      ],
    },
    {
      id: 'privy_seat', name: 'Privy seat', size: [2, 2, 2], color: '#8a7559', serves: ['toilet'],
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
      id: 'panel_radiator', name: 'Radiator', size: [2, 2, 1], color: '#e4e1d6', material: 'steel', serves: ['heating'],
      shape: [
        box([0.05, 0.35, 0.6], [1.9, 1.2, 0.25]),
        box([0.3, 0, 0.7], [0.1, 0.35, 0.1]),
        box([1.6, 0, 0.7], [0.1, 0.35, 0.1]),
        box([0, 0.35, 0.65], [0.05, 0.15, 0.15]) + { color: chrome },
      ] + fins,
    },
    {
      id: 'solid_fuel_boiler', name: 'Solid-fuel boiler', size: [3, 6, 2], color: '#535b58', serves: ['heating'],
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
      id: 'cooker', name: 'Cooker', size: [2, 2, 1], color: '#b7b9ae', serves: ['cooking'],
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
    // A brick flue stacked one course per cell from a stove or boiler up through the floors and roof, topped by a
    // chimney top, so every fire in a building has somewhere for its smoke to go. Masonry, so a blow that splinters a
    // cupboard leaves it standing; palettes fix each course where it stands.
    {
      id: 'chimney', name: 'Chimney', size: [1, 1, 1], color: brick, breach: breach.sturdy,
      shape: [
        box([0, 0, 0], [1, 0.47, 1]),
        box([0.02, 0.47, 0.02], [0.96, 0.06, 0.96]) + { color: mortar },
        box([0, 0.53, 0], [1, 0.47, 1]),
      ],
    },
    {
      id: 'chimney_top', name: 'Chimney top', size: [1, 1, 1], color: brick, breach: breach.sturdy,
      shape: [
        box([0, 0, 0], [1, 0.65, 1]),
        box([0, 0.65, 0], [1, 0.1, 1]) + { color: mortar },
        box([0.3, 0.75, 0.3], [0.4, 0.25, 0.4]) + { color: '#9a5a3c' },
        box([0.37, 0.99, 0.37], [0.26, 0.01, 0.26]) + { color: '#1d1a18' },
      ],
    },
    // Rainwater goods in galvanized steel: a roof that sheds water drains through a gutter or a parapet's scupper
    // and down a downspout to the ground, so it does not run down the walls. A piece's back is the wall it is
    // fixed to and its facing points away from it. A downspout stacks one course per cell and faces the side a
    // climber stands on, as a ladder does; its pipe is a tenth of a metre across. Each segment is placed worn by
    // its own seeded share, so a pipe's hold varies course by course in one piece rather than in fresh and rusted
    // variants. None is solid: a pipe on a wall stops neither a walker nor light.
    {
      id: 'downspout', name: 'Downspout', size: [1, 1, 1], color: galvanized, material: 'steel', solid: false,
      wear: { from: 0, to: 0.7 },
      // Shinning up a pipe is slower than a ladder. A sound segment bears a lightly packed man and not a heavy
      // pack; the shallow curve keeps light wear harmless, so only a segment worn deep into its range tears under a
      // light climber, while the steel's first darker look already warns off a full kit.
      climbable: { speedMetresPerSimSecond: 0.75, load: { limitKg: 100, conditionExponent: 0.25 } },
      ruin: { debris: [{ item: 'scrap_metal', count: 1 }] },
      shape: [
        box([0.4, 0, 0.7], [0.2, 1, 0.2]),
        box([0.37, 0.48, 0.67], [0.26, 0.04, 0.33]) + { color: bracket },
      ],
    },
    {
      id: 'gutter', name: 'Gutter', size: [1, 1, 1], color: galvanized, material: 'steel', solid: false,
      shape: gutter,
    },
    {
      // The gutter's end over a downspout, dropping into the pipe below.
      id: 'gutter_outlet', name: 'Gutter outlet', size: [1, 1, 1], color: galvanized, material: 'steel', solid: false,
      shape: gutter + [box([0.4, 0, 0.7], [0.2, 0.7, 0.2])],
    },
    {
      // The head of a downspout on a parapet roof, under the scupper that lets the roof's water through the
      // parapet; the scupper is too small for a block, so the head's lip stands for it.
      id: 'rainwater_head', name: 'Rainwater head', size: [1, 1, 1], color: galvanized, material: 'steel',
      solid: false,
      shape: [
        box([0.25, 0.35, 0.55], [0.5, 0.6, 0.4]),
        box([0.4, 0, 0.7], [0.2, 0.35, 0.2]),
        box([0.42, 0.85, 0.95], [0.16, 0.08, 0.05]) + { color: bracket },
      ],
    },
    {
      // A cast-iron grate flush with a cellar or wash-room floor over the gully it drains to, so a burst pipe or a
      // hosed floor has somewhere to go. Flat on the floor, it stops no walker.
      id: 'floor_drain', name: 'Floor drain', size: [1, 1, 1], color: '#3f4442', material: 'steel', solid: false,
      serves: ['drainage'],
      shape: [box([0.2, 0, 0.2], [0.6, 0.04, 0.6])] + [
        box([0.25, 0.04, 0.27 + 0.12 * bar], [0.5, 0.02, 0.06]) + { color: '#2a2d2c' }
        for bar in std.range(0, 3)
      ],
    },
    // Ceiling lights hang from the block over their cell, in its top half, so a head passes under them and nothing
    // walking is stopped. They are dressing until lighting reaches houses: neither casts light nor draws power, but a
    // house that needs light to work by still needs one hung.
    {
      // A cellar's bare bulb on its flex, in a bakelite lampholder.
      id: 'bare_bulb', name: 'Bare bulb', size: [1, 1, 1], color: '#e8dfb8', material: 'plastic',
      mount: 'ceiling', solid: false, serves: ['lighting'],
      ruin: { debris: [{ item: 'glass_shards', count: 1 }] },
      shape: [
        box([0.48, 0.78, 0.48], [0.04, 0.22, 0.04]) + { color: '#2b2622' },
        box([0.44, 0.66, 0.44], [0.12, 0.12, 0.12]) + { color: '#3d2a1e' },
        box([0.43, 0.5, 0.43], [0.14, 0.16, 0.14]),
      ],
    },
    {
      // A room's pendant: a ceiling rose, a short stem and an enamelled shade over its bulb.
      id: 'ceiling_lamp', name: 'Ceiling lamp', size: [1, 1, 1], color: '#e7e2d2', material: 'steel',
      mount: 'ceiling', solid: false, serves: ['lighting'],
      ruin: { debris: [{ item: 'glass_shards', count: 1 }] },
      shape: [
        box([0.38, 0.95, 0.38], [0.24, 0.05, 0.24]),
        box([0.47, 0.75, 0.47], [0.06, 0.2, 0.06]) + { color: chrome },
        box([0.25, 0.62, 0.25], [0.5, 0.13, 0.5]),
        box([0.42, 0.55, 0.42], [0.16, 0.07, 0.16]) + { color: '#efe6c4' },
      ],
    },
  ],
}))
