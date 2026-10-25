// Base terrain and construction blocks. Ground-contact events are authored per block even when several
// blocks share a surface (`PILLARS.md`, "Content forward compatibility"); the compiled JSON spells each pair out.
local footstepEvents = {
  grass: { player: 'footstep_grass', shambler: 'shambler_step_grass' },
  mud: { player: 'footstep_mud', shambler: 'shambler_step_mud' },
  sand: { player: 'footstep_sand', shambler: 'shambler_step_sand' },
  stone: { player: 'footstep_stone', shambler: 'shambler_step_stone' },
  wood: { player: 'footstep_wood', shambler: 'shambler_step_wood' },
  leaves: { player: 'footstep_leaves', shambler: 'shambler_step_leaves' },
  // Wading borrows the mud events until the wading round gives water a sound of its own.
  wade: { player: 'footstep_mud', shambler: 'shambler_step_mud' },
};

local block(id, name, color, surface, extra={}) =
  { id: id, name: name, color: color, solid: true, footsteps: footstepEvents[surface] } + extra;

local asphalt = block('asphalt', 'Asphalt', '#3b3d40', 'stone', { pattern: 'noise', weatherable: true });
local paintedAsphalt = asphalt + { id: 'painted_asphalt', name: 'Painted asphalt', color: '#b9bcba' };

{
  blocks: [
    block('grass', 'Grass', '#5b8c3a', 'grass', { pattern: 'noise', weatherable: false }),
    block('dirt', 'Dirt', '#7a5a3a', 'mud', { pattern: 'noise', weatherable: false }),
    block('stone', 'Stone', '#8a8d91', 'stone', { pattern: 'rough', weatherable: true }),
    block('rock', 'Natural stone', '#8a8d91', 'stone', { pattern: 'rough', weatherable: false }),
    block('sand', 'Sand', '#d6c68f', 'sand', { pattern: 'noise', weatherable: false }),
    asphalt,
    paintedAsphalt,
    block('concrete', 'Concrete', '#b5b3ad', 'stone', { pattern: 'noise', weatherable: true }),
    block('planks', 'Wooden planks', '#a0763f', 'wood', { pattern: 'planks', weatherable: true }),
    block('brick', 'Brick', '#9c4f3a', 'stone', { pattern: 'brick', weatherable: true }),
    block('plaster', 'Plaster', '#d9d4c7', 'stone', { pattern: 'noise', weatherable: true }),
    block('tiles', 'Tiles', '#cfd6da', 'stone', { pattern: 'tiles', weatherable: true }),
    block('fabric', 'Fabric', '#5b6f9a', 'leaves', { weatherable: false }),
    block('roof', 'Roofing', '#4a4b50', 'stone', { pattern: 'shingles', weatherable: true }),
    block('carpet', 'Carpet', '#6b4f4a', 'leaves', { pattern: 'noise', weatherable: true }),
    block('window_frame', 'Window frame', '#e6e2d8', 'stone', { weatherable: false }),
    block('siding_red', 'Painted siding (faded red)', '#8f4b4b', 'stone', { pattern: 'siding', weatherable: true }),
    block('siding_blue', 'Painted siding (faded blue-grey)', '#7a8d94', 'stone', { pattern: 'siding', weatherable: true }),
    block('galvanized', 'Galvanized sheet', '#aab4b8', 'stone', { pattern: 'corrugated', weatherable: false }),
    block('cobblestone_mossy', 'Mossy cobblestone', '#5f6b58', 'stone', { pattern: 'cobble', weatherable: true }),
    block('dressed_stone', 'Dressed stone', '#bcab8a', 'stone', { pattern: 'dressed', weatherable: true }),
    block('hazard_yellow', 'Hazard paint', '#c9a43a', 'stone', { weatherable: false }),
    block('chain_link', 'Chain-link fence', '#89979a', 'stone', {
      weatherable: false,
      opaque: false,
      soundBlocking: false,
      meleePass: { motions: ['thrust'], minimumZombieReachMetres: 1 },
      wireMesh: { cellsPerBlock: 4, wireFraction: 0.08 },
      fencePosts: { widthBlocks: 0.12, spacingBlocks: 6 },
    }),
    block('sandbag', 'Sandbag', '#9b8d6a', 'stone', { weatherable: false }),
    block('camo_woodland', 'Weathered woodland camouflage', '#777b6a', 'stone', {
      pattern: 'camo',
      weatherable: true,
      patternPalette: ['#53694d', '#78634d', '#9b8a6b', '#3b4039'],
      patternWashout: 0.42,
    }),
    block('water', 'Water', '#3b6e8f', 'wade', { solid: false, opaque: false, liquid: true, weatherable: false }),
  ],
}
