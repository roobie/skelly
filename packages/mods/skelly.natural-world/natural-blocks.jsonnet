// Ground-contact events are authored per block even when several blocks share a surface
// (`PILLARS.md`, "Content forward compatibility"); the compiled JSON spells each pair out.
local footstepEvents = {
  grass: { player: 'footstep_grass' },
  mud: { player: 'footstep_mud' },
  sand: { player: 'footstep_sand' },
  stone: { player: 'footstep_stone' },
  // Wading borrows the mud events until the wading round gives water a sound of its own.
  wade: { player: 'footstep_mud' },
};
local block(id, name, color, material, surface, extra={}) =
  { id: id, material: material, name: name, color: color, solid: true, drops: { default: 'item_drop_wood' }, footsteps: footstepEvents[surface] } + extra;
{
  blocks: [
    block('grass', 'Grass', '#5b8c3a', 'soil', 'grass', { pattern: 'noise', weatherable: false }),
    block('dirt', 'Dirt', '#7a5a3a', 'soil', 'mud', { pattern: 'noise', weatherable: false }),
    block('stone', 'Stone', '#8a8d91', 'masonry', 'stone', { pattern: 'rough', weatherable: true }),
    block('rock', 'Natural stone', '#8a8d91', 'masonry', 'stone', { pattern: 'rough', weatherable: false }),
    block('sand', 'Sand', '#d6c68f', 'soil', 'sand', { pattern: 'noise', weatherable: false }),
    block('water', 'Water', '#3b6e8f', 'liquid', 'wade', { solid: false, opaque: false, liquid: true, weatherable: false }),
  ],
}
