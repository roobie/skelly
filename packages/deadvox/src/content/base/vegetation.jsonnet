// Vegetation blocks select their own ground-contact events (`PILLARS.md`, "Content forward compatibility");
// branches and trunks share the wood surface, foliage and litter the leaves surface.
local wood = { player: 'footstep_wood', shambler: 'shambler_step_wood' };
local leaves = { player: 'footstep_leaves', shambler: 'shambler_step_leaves' };
local rustle = { gentle: 'foliage_rustle', fast: 'foliage_rustle_fast' };
local box(position, size) = { position: position, size: size };

(import 'furniture-breach.libsonnet').breaking({
  blocks: [
    {
      id: 'tree_trunk',
      name: 'Tree trunk',
      color: '#62503b',
      solid: true,
      opaque: true,
      pattern: 'rough',
      weatherable: false,
      footsteps: wood,
    },
    {
      id: 'tree_branch',
      name: 'Tree branch',
      color: '#705941',
      solid: true,
      opaque: true,
      pattern: 'rough',
      weatherable: false,
      footsteps: wood,
    },
    {
      id: 'leaves',
      name: 'Leaves',
      color: '#526b3d',
      solid: false,
      opaque: true,
      rustle: rustle,
      pattern: 'noise',
      weatherable: false,
      footsteps: leaves,
    },
    {
      id: 'leaf_litter',
      name: 'Leaf litter',
      color: '#766047',
      solid: true,
      opaque: true,
      pattern: 'noise',
      weatherable: false,
      footsteps: leaves,
    },
    {
      id: 'tall_grass',
      name: 'Tall grass',
      color: '#7b8444',
      solid: false,
      opaque: false,
      rustle: rustle,
      pattern: 'noise',
      weatherable: false,
      footsteps: leaves,
    },
  ],
  // Overgrowth furniture is passable and does not hide anyone; the dense, sight-blocking kind is the `leaves` block.
  furniture: [
    {
      id: 'shrub_small', name: 'Small shrub', size: [2, 1, 2], color: '#5a7040', solid: false,
      shape: [box([0.1, 0, 0.2], [1.8, 0.8, 1.5]), box([0.5, 0.6, 0.4], [1, 0.4, 1])],
    },
    {
      id: 'shrub_tall', name: 'Tall shrub', size: [2, 3, 2], color: '#47603a', solid: false,
      shape: [box([0.85, 0, 0.85], [0.3, 1, 0.3]), box([0.1, 0.8, 0.15], [1.8, 1.3, 1.7]), box([0.4, 2, 0.4], [1.2, 0.9, 1.2])],
    },
    {
      id: 'weed_tuft', name: 'Weeds', size: [1, 1, 1], color: '#6f7a3a', solid: false,
      shape: [
        box([0.15, 0, 0.15], [0.7, 0.25, 0.7]), box([0.3, 0.25, 0.3], [0.4, 0.2, 0.4]),
        box([0.2, 0.2, 0.3], [0.05, 0.45, 0.05]), box([0.5, 0.2, 0.5], [0.05, 0.6, 0.05]),
        box([0.7, 0.2, 0.2], [0.05, 0.4, 0.05]), box([0.35, 0.2, 0.7], [0.05, 0.5, 0.05]),
      ],
    },
    {
      id: 'creeper_strip', name: 'Creeper', size: [2, 2, 1], color: '#3f5a30', solid: false,
      shape: [box([0, 0, 0.4], [1.1, 1.4, 0.2]), box([0.9, 0.5, 0.35], [1.1, 1.5, 0.3]), box([0.3, 1.2, 0.45], [0.8, 0.8, 0.15])],
    },
  ],
  sounds: [
    {
      id: 'foliage_rustle',
      description: 'Walk through bushes or other foliage that rustles.',
      variants: ['assets/audio/footstep-leaves-01.ogg'],
      gain: 0.4,
      pitchJitter: [0.96, 1.04],
      gainJitter: [0.9, 1.1],
      minIntervalSimSeconds: 0.45,
      category: 'world',
      noise: { enabled: true, radiusMetres: 4 },
    },
    {
      id: 'foliage_rustle_fast',
      description: 'Jog or sprint through bushes or other foliage that rustles.',
      variants: ['assets/audio/footstep-leaves-01.ogg'],
      gain: 0.75,
      pitchJitter: [0.96, 1.04],
      gainJitter: [0.9, 1.1],
      minIntervalSimSeconds: 0.15,
      category: 'world',
      noise: { enabled: true, radiusMetres: 10 },
    },
  ],
})
