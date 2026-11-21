// Masonry, timber and earth blocks that belong to no era, so any stack loads them without the
// present-day surfaces (`packages/deadvox/docs/pack-split.md`, "Terrain, sites and transport").
// Ground-contact events are authored per block even when several blocks share a surface
// (`PILLARS.md`, "Content forward compatibility"); the compiled JSON spells each pair out.
local landings = import 'packages/mods/skelly.audio.impact/landings.libsonnet';
local footstepEvents = {
  stone: { player: 'footstep_stone' },
  wood: { player: 'footstep_wood' },
  leaves: { player: 'footstep_leaves' },
};

local materials = {
  planks: 'timber', brick: 'masonry', plaster: 'masonry', tiles: 'masonry',
  fabric: 'textile', roof: 'masonry', carpet: 'textile', window_frame: 'timber',
  cobblestone_mossy: 'masonry', dressed_stone: 'masonry', sandbag: 'soil',
};
local block(id, name, color, surface, extra={}) =
  { id: id, material: materials[id], name: name, color: color, solid: true, drops: { default: 'item_drop_wood' } + landings.forBlock(materials[id]), footsteps: footstepEvents[surface] } + extra;

{
  blocks: [
    block('planks', 'Wooden planks', '#a0763f', 'wood', { pattern: 'planks', weatherable: true }),
    block('planks', 'Plank wall', '#a0763f', 'wood', { id: 'plank_wall', pattern: 'planks', weatherable: true }),
    block('planks', 'Plank floor', '#a0763f', 'wood', { id: 'plank_floor', pattern: 'planks', weatherable: true }),
    block('brick', 'Brick', '#9c4f3a', 'stone', { pattern: 'brick', weatherable: true }),
    block('plaster', 'Plaster', '#d9d4c7', 'stone', { pattern: 'noise', weatherable: true }),
    block('tiles', 'Tiles', '#cfd6da', 'stone', { pattern: 'tiles', weatherable: true }),
    block('fabric', 'Fabric', '#5b6f9a', 'leaves', { weatherable: false }),
    block('roof', 'Roofing', '#4a4b50', 'stone', { pattern: 'shingles', weatherable: true }),
    block('carpet', 'Carpet', '#6b4f4a', 'leaves', { pattern: 'noise', weatherable: true }),
    block('window_frame', 'Window frame', '#e6e2d8', 'stone', { weatherable: false }),
    block('cobblestone_mossy', 'Mossy cobblestone', '#5f6b58', 'stone', { pattern: 'cobble', weatherable: true }),
    block('dressed_stone', 'Dressed stone', '#bcab8a', 'stone', { pattern: 'dressed', weatherable: true }),
    block('sandbag', 'Sandbag', '#9b8d6a', 'stone', { weatherable: false }),
  ],
}
