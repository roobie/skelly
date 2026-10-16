// Vegetation blocks select their own ground-contact events (`PILLARS.md`, "Content forward compatibility");
// branches and trunks share the wood surface, foliage and litter the leaves surface.
local wood = { player: 'footstep_wood', shambler: 'shambler_step_wood' };
local leaves = { player: 'footstep_leaves', shambler: 'shambler_step_leaves' };
local rustle = { gentle: 'foliage_rustle', fast: 'foliage_rustle_fast' };

{
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
      id: 'hedge',
      name: 'Hedge',
      color: '#425b35',
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
  ],
  sounds: [
    {
      id: 'foliage_rustle',
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
      variants: ['assets/audio/footstep-leaves-01.ogg'],
      gain: 0.75,
      pitchJitter: [0.96, 1.04],
      gainJitter: [0.9, 1.1],
      minIntervalSimSeconds: 0.15,
      category: 'world',
      noise: { enabled: true, radiusMetres: 10 },
    },
  ],
}
